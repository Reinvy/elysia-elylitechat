import { Elysia } from "elysia";
import { openapi } from "@elysiajs/openapi";
import { apollo, gql } from "@elysiajs/apollo";

import { authRoute } from "./modules/auth/auth.routes.js";
import { rootRoute } from "./root.js";

const app = new Elysia()
  .use(
    openapi({
      documentation: {
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
  .use(
    apollo({
      typeDefs: gql`
        type Book {
          title: String
          author: String
        }

        type Query {
          books: [Book]
        }
      `,
      resolvers: {
        Query: {
          books: () => {
            return [
              { title: "Clean Architecture", author: "Robert C. Martin" },
              {
                title: "Designing Data-Intensive Applications",
                author: "Martin Kleppmann",
              },
            ];
          },
        },
      },
    })
  )
  .use(rootRoute)
  .use(authRoute)
  .listen(3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
