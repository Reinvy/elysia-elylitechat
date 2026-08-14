import { Elysia } from "elysia";
import { openapi } from "@elysiajs/openapi";
import { apollo } from "@elysiajs/apollo";

import { authRoute } from "./modules/auth/auth.routes.js";
import { rootRoute } from "./root.js";
import { chatRoute } from "./modules/chat/chat.routes.js";
import { chatTypeDefs } from "./modules/chat/schema.js";
import { chatResolvers } from "./modules/chat/resolvers.js";
import {
  connectionManager,
  broadcastTypingEvent,
} from "./modules/chat/websocket.js";
import { authService } from "./modules/auth/auth.service.js";
import { chatService } from "./modules/chat/chat.service.js";
import { prisma } from "./config/db.js";

export const app = new Elysia()
  .use(
    openapi({
      documentation: {
        info: {
          title: "ElyLiteChat API",
          version: "1.0.0",
          description: "Lightweight, hybrid REST & GraphQL real-time chat backend",
          contact: {
            name: "ElyChat Support",
            email: "support@elychat.com",
          },
          license: {
            name: "MIT",
            url: "https://opensource.org/licenses/MIT",
          },
        },
        security: [{ bearerAuth: [] }],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: "http",
              scheme: "bearer",
              bearerFormat: "JWT",
            },
          },
        },
      },
    })
  )
  .onRequest(({ set, request }) => {
    const origin = request.headers.get("origin");
    if (origin) {
      set.headers = {
        ...set.headers,
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Credentials": "true",
      } as any;
    }
  })
  .options("/*", ({ set }) => {
    set.status = 204;
    set.headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Credentials": "true",
    } as any;
  })
  .use(
    apollo({
      typeDefs: chatTypeDefs,
      resolvers: chatResolvers,
      context: async ({ request }) => {
        const authorization = request.headers.get("Authorization");
        if (!authorization || !authorization.startsWith("Bearer ")) {
          return { user: null };
        }

        const token = authorization.substring(7);
        try {
          const decoded = authService.verifyAccessToken(token);
          const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: {
              id: true,
              email: true,
              username: true,
              isActive: true,
            },
          });
          return { user };
        } catch {
          return { user: null };
        }
      },
    })
  )
  .use(rootRoute)
  .use(authRoute)
  .use(chatRoute)
  .ws("/ws", {
    open(ws) {
      const url = new URL(ws.data.request.url);
      const token = url.searchParams.get("token") || ws.data.request.headers.get("sec-websocket-protocol");

      if (!token) {
        ws.send(JSON.stringify({ type: "ERROR", message: "Authentication required (token parameter)" }));
        ws.close();
        return;
      }

      try {
        const decoded = authService.verifyAccessToken(token);
        (ws.data as any).userId = decoded.userId;
        (ws.data as any).user = decoded;
        (ws.data as any).connId = ws.id;

        connectionManager.addConnection(ws.id, ws, {
          id: decoded.userId,
          email: decoded.email,
          username: decoded.email.split("@")[0],
        });

        ws.send(JSON.stringify({
          type: "AUTH_SUCCESS",
          user: decoded,
          timestamp: new Date().toISOString(),
        }));
      } catch (err) {
        ws.send(JSON.stringify({ type: "ERROR", message: "Invalid or expired token" }));
        ws.close();
      }
    },

    async message(ws, message: any) {
      try {
        const parsed = typeof message === "string" ? JSON.parse(message) : message;
        const user = (ws.data as any).user;
        const connId = ws.id;

        if (parsed.type === "PONG") {
          connectionManager.recordPong(connId);
          return;
        }

        if (!user) {
          ws.send(JSON.stringify({ type: "ERROR", message: "Unauthorized socket" }));
          return;
        }

        switch (parsed.type) {
          case "JOIN_ROOM":
            if (parsed.conversationId) {
              connectionManager.joinConversation(connId, parsed.conversationId);
              ws.send(JSON.stringify({
                type: "ROOM_JOINED",
                conversationId: parsed.conversationId,
              }));
            }
            break;

          case "LEAVE_ROOM":
            if (parsed.conversationId) {
              connectionManager.leaveConversation(connId, parsed.conversationId);
              ws.send(JSON.stringify({
                type: "ROOM_LEFT",
                conversationId: parsed.conversationId,
              }));
            }
            break;

          case "TYPING_START":
            if (parsed.conversationId) {
              await broadcastTypingEvent(parsed.conversationId, {
                id: user.userId,
                email: user.email,
                username: user.email.split("@")[0],
              }, true);
            }
            break;

          case "TYPING_STOP":
            if (parsed.conversationId) {
              await broadcastTypingEvent(parsed.conversationId, {
                id: user.userId,
                email: user.email,
                username: user.email.split("@")[0],
              }, false);
            }
            break;

          case "RECONNECT":
            if (parsed.since) {
              const missed = await chatService.getMissedMessages(user.userId, new Date(parsed.since));
              ws.send(JSON.stringify({
                type: "MISSED_MESSAGES",
                messages: missed,
              }));
            }
            break;

          case "PING":
            ws.send(JSON.stringify({ type: "PONG", timestamp: Date.now() }));
            break;

          default:
            ws.send(JSON.stringify({ type: "ACK", message: "Received" }));
            break;
        }
      } catch (err) {
        console.error("[WS] Error handling message:", err);
      }
    },

    close(ws) {
      connectionManager.removeConnection(ws.id);
    },
  });

const port = process.env.PORT || 3000;
if (process.env.NODE_ENV !== "test") {
  app.listen(port);
  console.log(`🦊 ElyLiteChat is running at http://${app.server?.hostname}:${app.server?.port}`);
}
