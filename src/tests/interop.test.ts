import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { prisma } from "../config/db.js";

// Fase 2: interop columns + Session/Reaction/ReadReceipt contracts.
describe("ElyLiteChat - Interop data-model contracts", () => {
  const t = Date.now();
  let u1 = "";
  let u2 = "";
  let conv = "";
  let msg = "";

  beforeAll(async () => {
    const a = await prisma.user.create({
      data: { email: `ix1_${t}@example.com`, username: `ix1_${t}`, password: "x" },
    });
    const b = await prisma.user.create({
      data: { email: `ix2_${t}@example.com`, username: `ix2_${t}`, password: "x" },
    });
    u1 = a.id;
    u2 = b.id;
    const c = await prisma.chatConversation.create({
      data: { participants: { create: [{ userId: u1 }, { userId: u2 }] } },
    });
    conv = c.id;
  });

  afterAll(async () => {
    await prisma.chatMessage.deleteMany({ where: { conversationId: conv } });
    await prisma.session.deleteMany({ where: { userId: { in: [u1, u2] } } });
    await prisma.chatParticipant.deleteMany({ where: { conversationId: conv } });
    await prisma.chatConversation.deleteMany({ where: { id: conv } });
    await prisma.user.deleteMany({ where: { id: { in: [u1, u2] } } });
  });

  it("stores social fallback payload on a message", async () => {
    const m = await prisma.chatMessage.create({
      data: {
        content: null,
        type: "REELS_SHARE",
        senderId: u1,
        receiverId: u2,
        conversationId: conv,
        clientMsgId: `c_${t}`,
        fallbackText: "reels from @creator (45s)",
        fallbackMeta: { duration: 45, author: "@creator" },
        ctaLabel: "Muat video",
        ctaUrl: "https://cdn.example/v/240p.mp4",
      },
    });
    msg = m.id;
    expect(m.fallbackText).toBe("reels from @creator (45s)");
    expect(m.type).toBe("REELS_SHARE");
  });

  it("rejects duplicate clientMsgId (idempotency key)", async () => {
    let threw = false;
    try {
      await prisma.chatMessage.create({
        data: {
          content: "dup",
          senderId: u1,
          receiverId: u2,
          conversationId: conv,
          clientMsgId: `c_${t}`,
        },
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it("enforces one reaction per message/user/emoji", async () => {
    await prisma.reaction.create({ data: { messageId: msg, userId: u2, emoji: "👍" } });
    let threw = false;
    try {
      await prisma.reaction.create({ data: { messageId: msg, userId: u2, emoji: "👍" } });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it("tracks read receipts per message/user", async () => {
    const r = await prisma.readReceipt.create({ data: { messageId: msg, userId: u2 } });
    expect(r.readAt).toBeDefined();
  });

  it("allows parallel device sessions per user", async () => {
    const exp = new Date(Date.now() + 7 * 86400 * 1000);
    await prisma.session.create({
      data: { userId: u1, deviceId: "dev-full", deviceType: "elychat", accessTokenHash: "a", refreshTokenHash: "r1", expiresAt: exp },
    });
    await prisma.session.create({
      data: { userId: u1, deviceId: "dev-lite", deviceType: "elylite", accessTokenHash: "b", refreshTokenHash: "r2", expiresAt: exp },
    });
    const count = await prisma.session.count({ where: { userId: u1 } });
    expect(count).toBe(2);
  });
});
