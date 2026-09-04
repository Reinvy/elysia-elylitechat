import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { app } from "../index.js";
import { prisma } from "../config/db.js";
import { ensureBus } from "../modules/chat/websocket.js";
import { connectRedis, disconnectRedis } from "../redis.js";

// Fase 5: Lite sessions, refresh rotation + reuse, idempotent + interop send.
describe("ElyLiteChat - Sessions & rotation (Fase 5)", () => {
  const t = Date.now();
  const email = `f5_${t}@example.com`;
  const username = `f5_${t}`;
  let userId = "";
  let refresh1 = "";

  beforeAll(async () => {
    await ensureBus();
  });

  afterAll(async () => {
    if (userId) {
      await prisma.session.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await disconnectRedis();
  });

  async function post(path: string, body: unknown): Promise<{ status: number; json: any }> {
    const res = await app.handle(
      new Request(`http://localhost:3001${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": `f5-${t}` },
        body: JSON.stringify(body),
      })
    );
    return { status: res.status, json: await res.json() };
  }

  it("registers with a device session row", async () => {
    const { status, json } = await post("/auth/register", {
      email,
      username,
      password: "Password123!",
      deviceId: "dev-test-1",
      deviceType: "elylite",
    });
    expect(status).toBe(200);
    expect(json.success).toBe(true);
    userId = json.data.user.id;
    refresh1 = json.data.refreshToken;
    const sessions = await prisma.session.findMany({ where: { userId } });
    expect(sessions.length).toBe(1);
    expect(sessions[0]?.deviceId).toBe("dev-test-1");
  });

  it("lists and revokes sessions", async () => {
    const login = await post("/auth/login", {
      email,
      password: "Password123!",
      deviceId: "dev-test-2",
      deviceType: "elychat",
    });
    expect(login.json.success).toBe(true);
    const access = login.json.data.accessToken as string;

    const list = await app.handle(
      new Request("http://localhost:3001/auth/sessions", {
        headers: { Authorization: `Bearer ${access}` },
      })
    );
    const listed = (await list.json()) as { success: boolean; data: unknown[] };
    expect(listed.success).toBe(true);
    expect(listed.data.length).toBe(2);

    const del = await app.handle(
      new Request("http://localhost:3001/auth/sessions/dev-test-2", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${access}` },
      })
    );
    expect(((await del.json()) as { data: { revoked: boolean } }).data.revoked).toBe(true);
  });

  it("rotates refresh tokens and wipes the chain on reuse", async () => {
    const r1 = await post("/auth/refresh", { refreshToken: refresh1 });
    expect(r1.status).toBe(200);
    expect(r1.json.success).toBe(true);
    const refresh2 = r1.json.data.refreshToken as string;
    expect(refresh2 === refresh1).toBe(false);

    const r2 = await post("/auth/refresh", { refreshToken: refresh1 });
    expect(r2.json.success).toBe(false);

    const r3 = await post("/auth/refresh", { refreshToken: refresh2 });
    expect(r3.json.success).toBe(false);

    expect(await prisma.session.count({ where: { userId } })).toBe(0);
  });
});

describe("ElyLiteChat - Idempotent + interop send (Fase 5)", () => {
  const t = Date.now();
  let alice = "";
  let bob = "";
  let tokenA = "";

  beforeAll(async () => {
    await ensureBus();
    const mk = async (tag: string): Promise<{ id: string; access: string }> => {
      const res = await app.handle(
        new Request("http://localhost:3001/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-forwarded-for": `f5s-${t}` },
          body: JSON.stringify({
            email: `${tag}${t}@example.com`,
            username: `${tag}${t}`,
            password: "Password123!",
          }),
        })
      );
      const json = (await res.json()) as any;
      return { id: json.data.user.id as string, access: json.data.accessToken as string };
    };
    const a = await mk("f5a");
    const b = await mk("f5b");
    alice = a.id;
    bob = b.id;
    tokenA = a.access;
  });

  afterAll(async () => {
    const convs = await prisma.chatConversation.findMany({
      where: { participants: { some: { userId: alice } } },
      select: { id: true },
    });
    const ids = convs.map((c) => c.id);
    if (ids.length > 0) {
      await prisma.chatMessage.deleteMany({ where: { conversationId: { in: ids } } });
      await prisma.chatParticipant.deleteMany({ where: { conversationId: { in: ids } } });
      await prisma.chatConversation.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.session.deleteMany({ where: { userId: { in: [alice, bob] } } });
    await prisma.user.deleteMany({ where: { id: { in: [alice, bob] } } });
    await disconnectRedis();
  });

  async function send(body: unknown): Promise<any> {
    const res = await app.handle(
      new Request("http://localhost:3001/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify(body),
      })
    );
    return res.json();
  }

  it("dedupes double-send on clientMsgId", async () => {
    const first = await send({ content: "sekali saja", receiverId: bob, clientMsgId: `m-${t}` });
    expect(first.success).toBe(true);
    const second = await send({ content: "sekali saja", receiverId: bob, clientMsgId: `m-${t}` });
    expect(second.success).toBe(true);
    expect(second.data.id).toBe(first.data.id);
  });

  it("rejects social shares without fallback_text", async () => {
    const res = await send({
      type: "reels_share",
      content: "https://cdn.example/v/720p.m3u8",
      receiverId: bob,
      clientMsgId: `m2-${t}`,
    });
    expect(res.success).toBe(false);
    expect(String(res.message)).toContain("fallback_text");
  });

  it("stores E2EE ciphertext-only messages with fallback", async () => {
    const res = await send({
      type: "reels_share",
      receiverId: bob,
      clientMsgId: `m3-${t}`,
      ciphertext: "u5F9...ciphertext...==",
      fallback_text: "reels dari @kreator",
      ctaLabel: "Muat video",
    });
    expect(res.success).toBe(true);
    expect(res.data.fallbackText).toBe("reels dari @kreator");
  });
});
