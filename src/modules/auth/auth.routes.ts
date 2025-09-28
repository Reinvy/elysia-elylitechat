import { Elysia, t } from "elysia";
import { authController } from "./auth.controller.js";

export const authRoute = new Elysia().group("/auth", (app) =>
  app
    .post("/register", authController.register, {
      body: t.Object({
        email: t.String({ format: "email" }),
        password: t.String({ minLength: 8 }),
        username: t.String({ minLength: 3 }),
      }),
    })
    .post("/login", authController.login, {
      body: t.Object({
        email: t.String({ format: "email" }),
        password: t.String(),
      }),
    })
    .post("/refresh-token", authController.refreshToken, {
      body: t.Object({
        refreshToken: t.String(),
      }),
    })
    .post("/logout", authController.logout, {
      body: t.Object({
        refreshToken: t.String(),
      }),
    })
    .post("/change-password", authController.changePassword, {
      headers: t.Object({
        authorization: t.String(),
      }),
      body: t.Object({
        currentPassword: t.String(),
        newPassword: t.String({ minLength: 8 }),
      }),
    })
    .get("/profile", authController.getProfile, {
      headers: t.Object({
        authorization: t.String(),
      }),
    })
    .get("/health", authController.health)
);
