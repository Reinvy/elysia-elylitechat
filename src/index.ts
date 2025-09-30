import { Elysia } from "elysia";
import { openapi } from "@elysiajs/openapi";
import { apollo, gql } from "@elysiajs/apollo";

import { authRoute } from "./modules/auth/auth.routes.js";
import { rootRoute } from "./root.js";
import { chatRoute } from "./modules/chat/chat.routes.js";
import { chatTypeDefs } from "./modules/chat/schema.js";
import { chatResolvers } from "./modules/chat/resolvers.js";
import { setupWebSocketServer } from "./modules/chat/websocket.js";

const app = new Elysia()
  .use(
    openapi({
      // provider: "swagger-ui",
      documentation: {
        info: {
          title: "ElyChat API",
          version: "1.0.0",
          description: "API documentation for ElyChat application",
          contact: {
            name: "ElyChat Support",
            email: "GhZ6E@example.com",
          },
          license: {
            name: "MIT",
            url: "https://opensource.org/licenses/MIT",
          },
          termsOfService: "https://elychat.com/terms",
        },
        externalDocs: {
          url: "https://elychat.com/docs",
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
    // Handle CORS for GraphQL requests
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
    // Handle preflight requests
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
          return {
            user: null,
          };
        }

        const token = authorization.substring(7);
        const { authService } = await import("./modules/auth/auth.service.js");

        try {
          const decoded = authService.verifyAccessToken(token);
          const { prisma } = await import("./config/db.js");

          const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: {
              id: true,
              email: true,
              username: true,
            },
          });

          return {
            user,
          };
        } catch (error) {
          return {
            user: null,
          };
        }
      },

      // typeDefs: gql`
      //   type AppInfo {
      //     title: String
      //     author: String
      //   }

      //   type Query {
      //     appInfos: AppInfo
      //   }
      // `,
      // resolvers: {
      //   Query: {
      //     appInfos: () => {
      //       return [
      //         {
      //           title: "Elysia",
      //           author: "saltyAom",
      //         },
      //       ];
      //     },
      //   },
      // },
    })
  )
  .use(rootRoute)
  .use(authRoute)
  .use(chatRoute)
  .ws("/ws", {
    message(ws, message) {
      ws.send(message);
    },
  })
  .listen(3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
console.log("Chat schema loaded");
