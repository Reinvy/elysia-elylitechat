import { Elysia } from "elysia";
import { openapi } from "@elysiajs/openapi";

import { authRoute } from "./modules/auth/auth.routes.js";
import { rootRoute } from "./root.js";
import { chatRoute } from "./modules/chat/chat.routes.js";
import {
  connectionManager,
  relayRoom,
  ensureBus,
  assertParticipant,
  broadcastTypingEvent,
} from "./modules/chat/websocket.js";
import { authService } from "./modules/auth/auth.service.js";
import { chatService } from "./modules/chat/chat.service.js";
import { prisma } from "./config/db.js";
import { connectRedis, pingRedis, redisLastError } from "./redis.js";

const CORS_ORIGINS = (process.env.CORS_ORIGINS || "http://localhost:3000,http://localhost:3002")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function corsFor(origin: string | null): Record<string, string> {
  if (origin && CORS_ORIGINS.includes(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Credentials": "true",
    };
  }
  return {};
}


interface WsMeta {
  userId?: string;
  user?: unknown;
  relays?: Array<() => void>;
}

function wsMeta(ws: { data: unknown }): WsMeta {
  return ws.data as WsMeta;
}

export const app = new Elysia()
  .use(
    openapi({
      documentation: {
        info: {
          title: "ElyLiteChat API",
          version: "2.0.0",
          description: "Lightweight REST + Eden Treaty real-time chat backend (GraphQL removed)",
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
    const headers = corsFor(origin);
    if (Object.keys(headers).length > 0) {
      set.headers = { ...set.headers, ...headers } as typeof set.headers;
    }
  })
  .options("/*", ({ set, request }) => {
    set.status = 204;
    const headers = corsFor(request.headers.get("origin"));
    set.headers = { ...set.headers, ...headers } as typeof set.headers;
  })
  .get("/api/v1/health", async ({ set }) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      await pingRedis();
      return {
        success: true as const,
        data: { postgres: "ok", redis: "ok", version: "2.0.0" },
      };
    } catch (err) {
      set.status = 503;
      return {
        success: false as const,
        error: {
          code: "UNHEALTHY",
          message: err instanceof Error ? err.message : "dependency check failed",
          redisLastError: redisLastError(),
        },
      };
    }
  })
  .use(rootRoute)
  .use(authRoute)
  .use(chatRoute)
  .ws("/ws", {
    async open(ws) {
      const url = new URL(ws.data.request.url);
      const token =
        url.searchParams.get("token") ||
        ws.data.request.headers.get("sec-websocket-protocol") ||
        "";

      if (!token) {
        ws.send(JSON.stringify({ t: "error", code: "UNAUTHORIZED", message: "token required (?token= or sec-websocket-protocol)" }));
        ws.close();
        return;
      }

      try {
        const decoded = authService.verifyAccessToken(token);
        const user = await prisma.user.findUnique({
          where: { id: decoded.userId },
          select: { id: true, email: true, username: true, isActive: true },
        });
        if (!user || !user.isActive) throw new Error("unknown or inactive user");

        wsMeta(ws).userId = user.id;
        wsMeta(ws).user = decoded;
        wsMeta(ws).relays = [];

        connectionManager.addConnection(
          ws.id,
          ws,
          { id: user.id, email: user.email, username: user.username }
        );

        // Subscribe this process to every room the user belongs to.
        const memberships = await prisma.chatParticipant.findMany({
          where: { userId: user.id, isActive: true },
          select: { conversationId: true },
        });
        const relays = wsMeta(ws).relays ?? [];
        for (const m of memberships) {
          connectionManager.joinConversation(ws.id, m.conversationId);
          relays.push(relayRoom(m.conversationId));
        }

        ws.send(JSON.stringify({
          t: "ready",
          v: 1,
          client: "elylite",
          rooms: memberships.map((m) => m.conversationId),
        }));

        // Optional catch-up: ?since=<iso>
        const since = url.searchParams.get("since");
        if (since) {
          const missed = await chatService.getMissedMessages(user.id, new Date(since));
          ws.send(JSON.stringify({ t: "missed", messages: missed.slice(0, 100) }));
        }
      } catch {
        ws.send(JSON.stringify({ t: "error", code: "UNAUTHORIZED", message: "invalid or expired token" }));
        ws.close();
      }
    },

    async message(ws, message: unknown) {
      const data = wsMeta(ws);
      try {
        const parsed = (
          typeof message === "string" ? JSON.parse(message) : message
        ) as { t?: string; [k: string]: unknown };
        const userId = data.userId;

        if (parsed.t === "ping") {
          connectionManager.recordPong(ws.id);
          ws.send(JSON.stringify({ t: "pong", tms: Date.now() }));
          return;
        }

        if (!userId) {
          ws.send(JSON.stringify({ t: "error", code: "UNAUTHORIZED", message: "authenticate first" }));
          return;
        }

        switch (parsed.t) {
          case "join": {
            const roomId = String(parsed.roomId || "");
            if (!roomId) break;
            await assertParticipant(roomId, userId);
            connectionManager.joinConversation(ws.id, roomId);
            const relays = wsMeta(ws).relays;
            const unsub = relayRoom(roomId);
            if (relays) relays.push(unsub);
            ws.send(JSON.stringify({ t: "room_joined", r: roomId }));
            break;
          }
          case "leave": {
            const roomId = String(parsed.roomId || "");
            if (roomId) connectionManager.leaveConversation(ws.id, roomId);
            ws.send(JSON.stringify({ t: "room_left", r: roomId }));
            break;
          }
          case "typing": {
            const roomId = String(parsed.roomId || "");
            const on = parsed.on !== false;
            if (!roomId) break;
            await assertParticipant(roomId, userId);
            await broadcastTypingEvent(roomId, {
              id: userId,
              email: "",
              username: "",
            }, on);
            break;
          }
          case "reconnect": {
            const since = parsed.since ? new Date(String(parsed.since)) : null;
            if (since && !Number.isNaN(since.getTime())) {
              const missed = await chatService.getMissedMessages(userId, since);
              ws.send(JSON.stringify({ t: "missed", messages: missed.slice(0, 100) }));
            }
            break;
          }
          default:
            ws.send(JSON.stringify({ t: "error", code: "VALIDATION_ERROR", message: `unknown event: ${String(parsed.t)}` }));
            break;
        }
      } catch {
        ws.send(JSON.stringify({ t: "error", code: "VALIDATION_ERROR", message: "malformed frame" }));
      }
    },

    close(ws) {
      const relays = wsMeta(ws).relays;
      if (relays) relays.forEach((unsub) => {
        try {
          unsub();
        } catch {
          // already gone
        }
      });
      connectionManager.removeConnection(ws.id);
    },
  });

// Eden Treaty contract: Next.js clients consume `treaty<App>`.
export type App = typeof app;

const port = Number(process.env.PORT || 3001);
if (process.env.NODE_ENV !== "test") {
  await ensureBus().catch((err) => {
    process.stderr.write(`[boot] redis unavailable: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
  await connectRedisHealth();
  app.listen(port);
  process.stdout.write(`ElyLiteChat listening on ${port}\n`);
}

async function connectRedisHealth(): Promise<void> {
  await connectRedis();
  await pingRedis();
}
