import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { app } from "../index.js";
import { prisma } from "../config/db.js";
import { authService } from "../modules/auth/auth.service.js";

describe("ElyLiteChat - Auth Module", () => {
  const testEmail = `test_auth_${Date.now()}@example.com`;
  const testUsername = `user_${Date.now()}`;
  const testPassword = "Password123!";
  let accessToken = "";
  let refreshToken = "";
  let userId = "";

  afterAll(async () => {
    try {
      if (userId) {
        await prisma.user.delete({ where: { id: userId } });
      }
    } catch {}
  });

  it("should register a new user successfully", async () => {
    const res = await app.handle(
      new Request("http://localhost:3000/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: testEmail,
          username: testUsername,
          password: testPassword,
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.user.email).toBe(testEmail);
    expect(json.data.user.username).toBe(testUsername);
    expect(json.data.accessToken).toBeDefined();
    expect(json.data.refreshToken).toBeDefined();

    userId = json.data.user.id;
    accessToken = json.data.accessToken;
    refreshToken = json.data.refreshToken;
  });

  it("should reject duplicate email registration", async () => {
    const res = await app.handle(
      new Request("http://localhost:3000/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: testEmail,
          username: `diff_${Date.now()}`,
          password: testPassword,
        }),
      })
    );

    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it("should login with valid credentials", async () => {
    const res = await app.handle(
      new Request("http://localhost:3000/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: testEmail,
          password: testPassword,
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.accessToken).toBeDefined();
    expect(json.data.user.id).toBe(userId);
  });

  it("should reject login with wrong password", async () => {
    const res = await app.handle(
      new Request("http://localhost:3000/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: testEmail,
          password: "WrongPassword!",
        }),
      })
    );

    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it("should refresh access token", async () => {
    const res = await app.handle(
      new Request("http://localhost:3000/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refreshToken,
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.accessToken).toBeDefined();
  });

  it("should get user profile with Bearer token", async () => {
    const res = await app.handle(
      new Request("http://localhost:3000/auth/me", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.email).toBe(testEmail);
  });
});
