import { Elysia } from "elysia";

export const rootRoute = new Elysia()
  .get("/", () => "Hello Elysia")
  .get("/health", () => {
    return {
      success: true,
      message: "ElyChat service is running",
      data: {
        timestamp: new Date().toISOString(),
        service: process.env.SERVICE_NAME || "elychat service",
        uptime_sec: Math.round(process.uptime()),
        pid: process.pid,
      },
    };
  });
