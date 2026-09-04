import { createClient, type RedisClientType } from "redis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// Last connection error (surfaced via health check; never console.* per lint).
let lastError: string | null = null;
export function redisLastError(): string | null {
  return lastError;
}

function trackError(scope: string, err: unknown): void {
  lastError = `[${scope}] ${err instanceof Error ? err.message : String(err)}`;
}

export const redis: RedisClientType = createClient({ url: REDIS_URL });
redis.on("error", (err) => trackError("redis", err));

let subscriber: RedisClientType | null = null;
const topicHandlers = new Map<string, Set<(data: unknown) => void>>();

export async function connectRedis(): Promise<void> {
  if (!redis.isOpen) {
    await redis.connect();
  }
  if (!subscriber) {
    subscriber = redis.duplicate();
    subscriber.on("error", (err) => trackError("redis:sub", err));
    await subscriber.connect();
    await subscriber.pSubscribe("room:*", (message: string, channel: string) => {
      const handlers = topicHandlers.get(channel);
      if (!handlers || handlers.size === 0) return;
      let data: unknown = message;
      try {
        data = JSON.parse(message);
      } catch {
        // keep raw string
      }
      handlers.forEach((cb) => {
        try {
          cb(data);
        } catch (err) {
          trackError(`sub:${channel}`, err);
        }
      });
    });
  }
}

export async function disconnectRedis(): Promise<void> {
  topicHandlers.clear();
  if (subscriber) {
    try {
      await subscriber.quit();
    } catch {
      // ignore shutdown errors
    }
    subscriber = null;
  }
  if (redis.isOpen) {
    try {
      await redis.quit();
    } catch {
      // ignore shutdown errors
    }
  }
}

export async function pingRedis(): Promise<"ok"> {
  const pong = await redis.ping();
  if (pong !== "PONG") throw new Error(`unexpected PING reply: ${pong}`);
  return "ok";
}

// --- channels ---

export const roomChannel = (conversationId: string): string => `room:${conversationId}`;

// --- pub/sub (JSON frames) ---

export async function publishJson(channel: string, frame: unknown): Promise<void> {
  await redis.publish(channel, JSON.stringify(frame));
}

/** Local-process subscription; delivery arrives via the shared Redis psubscribe. */
export function subscribeJson(channel: string, cb: (data: unknown) => void): () => void {
  let set = topicHandlers.get(channel);
  if (!set) {
    set = new Set();
    topicHandlers.set(channel, set);
  }
  set.add(cb);
  return () => {
    const s = topicHandlers.get(channel);
    if (!s) return;
    s.delete(cb);
    if (s.size === 0) topicHandlers.delete(channel);
  };
}

// --- presence (TTL heartbeat) ---

export interface PresenceEntry {
  status: "ONLINE" | "AWAY" | "BUSY" | "OFFLINE";
  lastSeen: string;
  clients: string[];
}

const presenceKey = (userId: string): string => `presence:user:${userId}`;

export async function addPresenceConn(userId: string, connLabel: string): Promise<PresenceEntry> {
  const key = presenceKey(userId);
  const raw = await redis.get(key);
  let entry: PresenceEntry;
  try {
    entry = raw ? (JSON.parse(raw) as PresenceEntry) : { status: "ONLINE", lastSeen: new Date().toISOString(), clients: [] };
  } catch {
    entry = { status: "ONLINE", lastSeen: new Date().toISOString(), clients: [] };
  }
  if (!entry.clients.includes(connLabel)) entry.clients.push(connLabel);
  entry.status = "ONLINE";
  entry.lastSeen = new Date().toISOString();
  await redis.setEx(key, 60, JSON.stringify(entry));
  return entry;
}

export async function refreshPresence(userId: string): Promise<void> {
  await redis.expire(presenceKey(userId), 60);
}

export async function removePresenceConn(userId: string, connLabel: string): Promise<PresenceEntry | null> {
  const key = presenceKey(userId);
  const raw = await redis.get(key);
  if (!raw) return null;
  let entry: PresenceEntry;
  try {
    entry = JSON.parse(raw) as PresenceEntry;
  } catch {
    await redis.del(key);
    return null;
  }
  entry.clients = entry.clients.filter((c) => c !== connLabel);
  if (entry.clients.length === 0) {
    entry.status = "OFFLINE";
    entry.lastSeen = new Date().toISOString();
  }
  await redis.setEx(key, 60, JSON.stringify(entry));
  return entry;
}

export async function getPresence(userId: string): Promise<PresenceEntry | null> {
  const raw = await redis.get(presenceKey(userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PresenceEntry;
  } catch {
    return null;
  }
}

// --- typing indicators (3s debounce window) ---

const typingKey = (conversationId: string, userId: string): string =>
  `typing:${conversationId}:${userId}`;

/** Returns true if this is a fresh typing-on (no active window); refreshes the window. */
export async function claimTypingOn(conversationId: string, userId: string, windowSec = 3): Promise<boolean> {
  const key = typingKey(conversationId, userId);
  const fresh = await redis.set(key, "1", { NX: true, EX: windowSec });
  if (fresh) return true;
  await redis.expire(key, windowSec);
  return false;
}

export async function clearTyping(conversationId: string, userId: string): Promise<void> {
  await redis.del(typingKey(conversationId, userId));
}

// --- fixed-window rate limit ---

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetSec: number;
}

export async function checkRateLimit(key: string, limit: number, windowSec: number): Promise<RateLimitResult> {
  const count = await redis.incr(key);
  let ttl = await redis.ttl(key);
  if (ttl < 0) {
    await redis.expire(key, windowSec);
    ttl = windowSec;
  }
  return { allowed: count <= limit, remaining: Math.max(0, limit - count), resetSec: ttl };
}

// --- idempotency dedupe (clientMsgId, F2 sender path) ---

export async function claimDedupe(clientMsgId: string, ttlSec = 86400): Promise<boolean> {
  const res = await redis.set(`dedupe:${clientMsgId}`, "1", { NX: true, EX: ttlSec });
  return res !== null;
}
