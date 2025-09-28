import { Elysia } from "elysia";
import { openapi } from "@elysiajs/openapi";

import { authRoute } from "./modules/auth/auth.routes.js";
import { rootRoute } from "./root.js";

const app = new Elysia()
  .use(openapi())
  .use(rootRoute)
  .use(authRoute)
  .listen(3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
