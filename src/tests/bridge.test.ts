import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { app } from "../index.js";
import { prisma } from "../config/db.js";
import { ensureBus } from "../modules/chat/websocket.js";

process.env.BRIDGE_SHARED_SECRET = "test-secret-min-32-chars-bridge-0123456789";

// Fase B2: Lite bridge export/import (service-secret authed).
describe("ElyLiteChat - Bridge export/import (Fase B2)", () => {
  const t = Date.now();
  const SECRET = process.env.BRIDGE_SHARED_SECRET as string;
  let alice = "";
  let bob = "";
  let conv = "";

  beforeAll(async () => {
    await ensureBus();
    const mk = async (tag: string): Promise<string> => {
      const u = await prisma.user.create({
        data: {
          email: `${tag}${t}@example.com`,
          username: `${tag}${t}`,
          password: "x",
        },
      });
      return u.id;
    };
    alice = await mk("lba");
    bob = await mk("lbb");
    const c = await prisma.chatConversation.create({
      data: { participants: { create: [{ userId: alice }, { userId: bob }] } },
    });
    conv = c.id;
    await prisma.chatMessage.create({
      data: { content: "hello bridge", senderId: alice, receiverId: bob, conversationId: conv },
    });
  });

  afterAll(async () => {
    await prisma.chatMessage.deleteMany({ where: { conversationId: conv } });
    await prisma.chatParticipant.deleteMany({ where: { conversationId: conv } });
    await prisma.chatConversation.deleteMany({ where: { id: conv } });
    await prisma.session.deleteMany({ where: { userId: { in: [alice, bob] } } });
    await prisma.user.deleteMany({ where: { id: { in: [alice, bob] } } });
  });

  async function call(path: string, init?: RequestInit, secret = SECRET): Promise<{ status: number; json: any }> {
    const res = await app.handle(
      new Request(`http://localhost:3001${path}`, {
        ...init,
        headers: { ...(init?.headers ?? {}), "x-bridge-secret": secret },
      })
    );
    return { status: res.status, json: await res.json() };
  }

  it("rejects export without the shared secret", async () => {
    const { json } = await call(`/bridge/export/${conv}`, {}, "wrong");
    expect(json.success).toBe(false);
  });

  it("exports conversation + messages for backfill", async () => {
    const { json } = await call(`/bridge/export/${conv}?limit=10`);
    expect(json.success).toBe(true);
    expect(json.data.conversation.participantLiteIds.sort()).toEqual([alice, bob].sort());
    expect(json.data.messages.length).toBe(1);
    expect(json.data.messages[0].senderLiteId).toBe(alice);
  });

  it("imports idempotently and broadcasts to local sockets", async () => {
    const body = {
      conversationId: conv,
      senderLiteId: bob,
      content: "from full side",
      clientMsgId: `brg-test-${t}`,
    };
    const first = await call("/bridge/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(first.json.success).toBe(true);
    expect(first.json.data.deduped).toBe(false);
    const second = await call("/bridge/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(second.json.data.deduped).toBe(true);
    expect(second.json.data.id).toBe(first.json.data.id);
  });

  it("refuses import from non-participants", async () => {
    const other = await prisma.user.create({
      data: { email: `lbx${t}@example.com`, username: `lbx${t}`, password: "x" },
    });
    try {
      const res = await call("/bridge/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: conv, senderLiteId: other.id, content: "nope" }),
      });
      expect(res.json.success).toBe(false);
    } finally {
      await prisma.user.delete({ where: { id: other.id } });
    }
  });
});
