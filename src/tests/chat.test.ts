import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { app } from "../index.js";
import { prisma } from "../config/db.js";
import { authService } from "../modules/auth/auth.service.js";

describe("ElyLiteChat - Chat REST & GraphQL Module", () => {
  let user1: any;
  let user2: any;
  let token1 = "";
  let token2 = "";
  let conversationId = "";
  let messageId = "";

  beforeAll(async () => {
    // Create 2 test users
    const u1 = await prisma.user.create({
      data: {
        email: `chat_u1_${Date.now()}@example.com`,
        username: `chat_u1_${Date.now()}`,
        password: await Bun.password.hash("Pass1234!", { algorithm: "bcrypt", cost: 10 }),
      },
    });
    const u2 = await prisma.user.create({
      data: {
        email: `chat_u2_${Date.now()}@example.com`,
        username: `chat_u2_${Date.now()}`,
        password: await Bun.password.hash("Pass1234!", { algorithm: "bcrypt", cost: 10 }),
      },
    });

    user1 = u1;
    user2 = u2;
    token1 = (authService as any).generateTokens(u1.id, u1.email).accessToken;
    token2 = (authService as any).generateTokens(u2.id, u2.email).accessToken;
  });

  afterAll(async () => {
    try {
      if (conversationId) {
        await prisma.chatMessage.deleteMany({ where: { conversationId } });
        await prisma.chatParticipant.deleteMany({ where: { conversationId } });
        await prisma.chatConversation.delete({ where: { id: conversationId } });
      }
      if (user1) await prisma.user.delete({ where: { id: user1.id } });
      if (user2) await prisma.user.delete({ where: { id: user2.id } });
    } catch {}
  });

  it("should create a new conversation via REST", async () => {
    const res = await app.handle(
      new Request("http://localhost:3000/chat/conversations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token1}`,
        },
        body: JSON.stringify({
          participantId: user2.id,
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.id).toBeDefined();
    conversationId = json.data.id;
  });

  it("should search users by query", async () => {
    const res = await app.handle(
      new Request(`http://localhost:3000/chat/users/search?q=${user2.username}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token1}`,
        },
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.length).toBeGreaterThan(0);
    expect(json.data[0].id).toBe(user2.id);
  });

  it("should send a message via REST", async () => {
    const res = await app.handle(
      new Request("http://localhost:3000/chat/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token1}`,
        },
        body: JSON.stringify({
          content: "Hello from user 1!",
          receiverId: user2.id,
          conversationId,
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.content).toBe("Hello from user 1!");
    messageId = json.data.id;
  });

  it("should edit a message via REST", async () => {
    const res = await app.handle(
      new Request(`http://localhost:3000/chat/messages/${messageId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token1}`,
        },
        body: JSON.stringify({
          content: "Edited message content!",
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.content).toBe("Edited message content!");
    expect(json.data.isEdited).toBe(true);
  });

  it("should mark conversation messages as read via REST", async () => {
    const res = await app.handle(
      new Request(`http://localhost:3000/chat/conversations/${conversationId}/read-all`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token2}`,
        },
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it("should soft delete a message via REST", async () => {
    const res = await app.handle(
      new Request(`http://localhost:3000/chat/messages/${messageId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token1}`,
        },
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.isDeleted).toBe(true);
  });

  it("should list conversations with unread counts", async () => {
    const res = await app.handle(
      new Request("http://localhost:3000/chat/conversations", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token1}`,
        },
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.items).toBeDefined();
  });
});
