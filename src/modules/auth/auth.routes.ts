import { Elysia, t } from "elysia";
import { authController } from "./auth.controller.js";

export const authRoute = new Elysia().group("/auth", (app) =>
  app
    .post("/register", authController.register, {
      body: t.Object({
        email: t.String({
          format: "email",
          description: "User email must be valid",
        }),
        password: t.String({
          minLength: 8,
          description: "User password (at least 8 characters)",
        }),
        username: t.String({
          minLength: 3,
          description: "Username (at least 3 characters)",
        }),
      }),
      detail: {
        summary: "Register a new user",
        tags: ["authentication"],
        
      },
    })
    .post("/login", authController.login, {
      body: t.Object({
        email: t.String({
          format: "email",
          description: "User email must be valid",
        }),
        password: t.String({
          minLength: 8,
          description: "User password (at least 8 characters)",
        }),
      }),
      detail: {
        summary: "Sign in the user",
        tags: ["authentication"],
      },
    })
    .post("/refresh-token", authController.refreshToken, {
      body: t.Object({
        refreshToken: t.String(),
      }),
      detail: {
        summary: "Refresh access token using refresh token",
        tags: ["authentication"],
      },
    })
    .post("/logout", authController.logout, {
      body: t.Object({
        refreshToken: t.String(),
      }),
      detail: {
        summary: "Logout user and invalidate refresh token",
        tags: ["authentication"],
      },
    })
    .post("/change-password", authController.changePassword, {
      headers: t.Object({
        authorization: t.String(),
      }),
      body: t.Object({
        currentPassword: t.String(),
        newPassword: t.String({ minLength: 8 }),
      }),
      detail: {
        summary: "Change user password",
        tags: ["authentication"],
      },
    })
    .get("/profile", authController.getProfile, {
      headers: t.Object({
        authorization: t.String(),
      }),
      detail: {
        summary: "Get user profile",
        tags: ["authentication"],
      },
    })
    .get("/health", authController.health, {
      detail: {
        summary: "Health Check for Auth Service",
        tags: ["authentication"],
      },
    })
);
