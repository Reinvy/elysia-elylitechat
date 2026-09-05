import { Elysia, t } from "elysia";
import { prisma } from "../../config/db.js";
import { authService } from "../auth/auth.service.js";

function fullBase(): string {
  return (process.env.FULL_API_URL || "http://localhost:3000").replace(/\/$/, "");
}

function sharedSecret(): string {
  const s = process.env.BRIDGE_SHARED_SECRET || "";
  if (s.length < 32) throw new Error("bridge not configured (BRIDGE_SHARED_SECRET)");
  return s;
}

function checkSecret(headers: Record<string, string | undefined>): void {
  const presented = headers["x-bridge-secret"] ?? "";
  const secret = sharedSecret();
  if (presented.length !== secret.length) throw new Error("bad bridge secret");
  let diff = 0;
  for (let i = 0; i < secret.length; i++) {
    diff |= (presented.charCodeAt(i) ?? 0) ^ (secret.charCodeAt(i) ?? 0);
  }
  if (diff !== 0) throw new Error("bad bridge secret");
}

function err(message: string): { success: false; error: { code: string; message: string } } {
  return { success: false as const, error: { code: "BRIDGE_ERROR", message } };
}

export const bridgeRoute = new Elysia().group("/bridge", (app) =>
  app
    // Service-to-service export for backfill/verify (shared secret, never browsers).
    .get("/export/:conversationId", async ({ headers, params, query }) => {
      try {
        checkSecret(headers);
        const limit = Math.min(Math.max(Number(query.limit ?? 50) || 50, 1), 200);
        const conversation = await prisma.chatConversation.findUnique({
          where: { id: params.conversationId },
          include: { participants: { select: { userId: true } } },
        });
        if (!conversation || !conversation.isActive) {
          return { success: false as const, error: { code: "NOT_FOUND", message: "conversation not found" } };
        }
        const messages = await prisma.chatMessage.findMany({
          where: { conversationId: params.conversationId, isDeleted: false },
          orderBy: { createdAt: "desc" },
          take: limit,
        });
        return {
          success: true as const,
          data: {
            conversation: {
              id: conversation.id,
              participantLiteIds: conversation.participants.map((p) => p.userId),
            },
            messages: messages.reverse().map((m) => ({
              id: m.id,
              content: m.content,
              type: m.type,
              senderLiteId: m.senderId,
              clientMsgId: m.clientMsgId,
              ciphertext: m.ciphertext,
              fallbackText: m.fallbackText,
              fallbackMeta: m.fallbackMeta,
              ctaLabel: m.ctaLabel,
              ctaUrl: m.ctaUrl,
              createdAt: m.createdAt.toISOString(),
            })),
          },
        };
      } catch (error) {
        return err(error instanceof Error ? error.message : "export failed");
      }
    }, {
      params: t.Object({ conversationId: t.String() }),
      query: t.Object({ limit: t.Optional(t.String()) }),
    })

    // Service-to-service import (shared secret). Idempotent on clientMsgId.
    // NOTE (documented): ChatMessage requires one receiverId; group mirrors
    // address the sender when no better peer resolves (see full-side note).
    .post("/import", async ({ headers, body }) => {
      try {
        checkSecret(headers);
        const conversation = await prisma.chatConversation.findUnique({
          where: { id: body.conversationId },
          include: { participants: { select: { userId: true } } },
        });
        if (!conversation || !conversation.isActive) {
          return { success: false as const, error: { code: "NOT_FOUND", message: "conversation not found" } };
        }
        const memberIds = conversation.participants.map((p) => p.userId);
        if (body.senderLiteId && !memberIds.includes(body.senderLiteId)) {
          return { success: false as const, error: { code: "FORBIDDEN", message: "sender not a participant" } };
        }
        const senderId = body.senderLiteId ?? memberIds[0] ?? "";
        if (!senderId) {
          return { success: false as const, error: { code: "VALIDATION_ERROR", message: "empty conversation" } };
        }
        const receiverId =
          body.receiverLiteId && memberIds.includes(body.receiverLiteId)
            ? body.receiverLiteId
            : (memberIds.find((id) => id !== senderId) ?? senderId);

        if (body.clientMsgId) {
          const existing = await prisma.chatMessage.findUnique({
            where: { clientMsgId: body.clientMsgId },
          });
          if (existing) return { success: true as const, data: { id: existing.id, deduped: true } };
        }
        const created = await prisma.chatMessage.create({
          data: {
            ...(body.content ? { content: body.content } : {}),
            ...(body.type ? { type: body.type as "TEXT" } : {}),
            senderId,
            receiverId,
            conversationId: body.conversationId,
            ...(body.clientMsgId ? { clientMsgId: body.clientMsgId } : {}),
            ...(body.ciphertext ? { ciphertext: body.ciphertext } : {}),
            ...(body.fallbackText ? { fallbackText: body.fallbackText } : {}),
            ...(body.fallbackMeta ? { fallbackMeta: JSON.parse(JSON.stringify(body.fallbackMeta)) } : {}),
            ...(body.ctaLabel ? { ctaLabel: body.ctaLabel } : {}),
            ...(body.ctaUrl ? { ctaUrl: body.ctaUrl } : {}),
            ...(body.createdAt ? { createdAt: new Date(body.createdAt) } : {}),
          },
        });
        const { broadcastNewMessage } = await import("../chat/websocket.js");
        await broadcastNewMessage({
          id: created.id,
          conversationId: created.conversationId,
          senderId: created.senderId,
          content: created.content ?? created.fallbackText ?? "",
        }).catch(() => undefined);
        return { success: true as const, data: { id: created.id, deduped: false } };
      } catch (error) {
        return err(error instanceof Error ? error.message : "import failed");
      }
    }, {
      body: t.Object({
        conversationId: t.String(),
        senderLiteId: t.Optional(t.String()),
        receiverLiteId: t.Optional(t.String()),
        content: t.Optional(t.String({ maxLength: 10000 })),
        type: t.Optional(t.String()),
        clientMsgId: t.Optional(t.String()),
        ciphertext: t.Optional(t.String()),
        fallbackText: t.Optional(t.String({ maxLength: 2000 })),
        fallbackMeta: t.Optional(t.Record(t.String(), t.Unknown())),
        ctaLabel: t.Optional(t.String({ maxLength: 100 })),
        ctaUrl: t.Optional(t.String({ maxLength: 2000 })),
        createdAt: t.Optional(t.String()),
      }),
    })

    // User-facing redeem: Lite user links their Full identity via one-time code.
    .post("/redeem", async ({ headers, body }) => {
      try {
        const authHeader = headers["authorization"];
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
          return { success: false as const, error: { code: "UNAUTHORIZED", message: "auth required" } };
        }
        const decoded = authService.verifyAccessToken(authHeader.substring(7));
        const res = await fetch(`${fullBase()}/api/v1/bridge/redeem`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-bridge-secret": sharedSecret() },
          body: JSON.stringify({ code: body.code, liteUserId: decoded.userId }),
        });
        const json = (await res.json()) as { success: boolean; data?: unknown; error?: unknown };
        if (!res.ok || !json.success) {
          return {
            success: false as const,
            error: {
              code: "REDEEM_FAILED",
              message: typeof json.error === "string" ? json.error : "redeem failed",
            },
          };
        }
        return { success: true as const, data: json.data };
      } catch (error) {
        return err(error instanceof Error ? error.message : "redeem failed");
      }
    }, {
      body: t.Object({ code: t.String({ minLength: 4, maxLength: 16 }) }),
    })
);
