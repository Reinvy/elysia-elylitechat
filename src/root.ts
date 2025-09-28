import { Elysia } from "elysia";

export const rootRoute = new Elysia().get("/", () => "Hello Elysia");
