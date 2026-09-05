import { prisma } from "../../config/db.js";
import {
  connectRedis,
  publishJson,
  subscribeJson,
  roomChannel,
  claimTypingOn,
  clearTyping,
  addPresenceConn,
  removePresenceConn,
  checkRateLimit,
} from "../../redis.js";

// Connection context type for WebSocket connections
export interface AuthenticatedUser {
  id: string;
  email: string;
  username: string;
}

export interface ClientConnection {
  id: string;
  // Elysia WS handle (typed as any: Elysia infers the concrete socket type per route)
  ws: any;
  user: AuthenticatedUser;
  lastPing: number;
  conversations: Set<string>;
}

// --- canonical WS frames (see docs/technical/websocket_events.md) ---

export interface ChatNewFrame {
  t: "chat:new";
  m: string;
  r: string;
  u: string;
  tms: number;
  c: string;
  bridged?: boolean;
}

export interface ReceiptFrame {
  t: "chat:delivered" | "chat:read";
  m?: string;
  r: string;
  u: string;
  tms: number;
}

export interface TypingFrame {
  t: "chat:typing";
  r: string;
  u: string;
  on: boolean;
  tms: number;
}

export interface MessageUpdateFrame {
  t: "message:update";
  m: string;
  r: string;
  kind: "edited" | "deleted";
  c?: string;
  tms: number;
}

export type RoomFrame = ChatNewFrame | ReceiptFrame | TypingFrame | MessageUpdateFrame;

export function leanSnippet(content: unknown, max = 140): string {
  if (typeof content !== "string") return "";
  return content.length > max ? `${content.slice(0, max)}…` : content;
}

// Redis-backed bus with the same subscribe/publish ergonomics the codebase used.
// NOTE: publish is async (network round-trip); tests must await it.
export const pubSub = {
  subscribe(topic: string, callback: (data: any) => void): () => void {
    return subscribeJson(topic, callback);
  },
  async publish(topic: string, data: any): Promise<void> {
    await publishJson(topic, data as Record<string, unknown>);
  },
};

// Active connections manager (local sockets; fan-out arrives via Redis pub/sub)
export class WebSocketConnectionManager {
  private connections: Map<string, ClientConnection> = new Map();
  private userToConnections: Map<string, Set<string>> = new Map();
  private heartbeatInterval: Timer | null = null;

  constructor() {
    this.startHeartbeat();
  }

  // Start 30-second ping/pong heartbeat
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const deadConnectionIds: string[] = [];

      this.connections.forEach((conn, id) => {
        // If no activity or pong in 60s, drop (close is handled by the route)
        if (now - conn.lastPing > 60000) {
          deadConnectionIds.push(id);
        } else {
          try {
            conn.ws.send(JSON.stringify({ t: "ping", tms: now }));
          } catch {
            deadConnectionIds.push(id);
          }
        }
      });

      deadConnectionIds.forEach((id) => {
        this.removeConnection(id);
      });
    }, 30000);
  }

  // Add connection
  addConnection(connectionId: string, ws: any, user: AuthenticatedUser): ClientConnection {
    const conn: ClientConnection = {
      id: connectionId,
      ws,
      user,
      lastPing: Date.now(),
      conversations: new Set(),
    };

    this.connections.set(connectionId, conn);

    if (!this.userToConnections.has(user.id)) {
      this.userToConnections.set(user.id, new Set());
    }
    this.userToConnections.get(user.id)!.add(connectionId);

    void addPresenceConn(user.id, `elylite:${connectionId}`);
    return conn;
  }

  // Remove connection
  removeConnection(connectionId: string): void {
    const conn = this.connections.get(connectionId);
    if (conn) {
      const userConns = this.userToConnections.get(conn.user.id);
      if (userConns) {
        userConns.delete(connectionId);
        if (userConns.size === 0) {
          this.userToConnections.delete(conn.user.id);
        }
      }
      try {
        conn.ws.close();
      } catch {
        // socket already gone
      }
      this.connections.delete(connectionId);
      void clearTypingForConn(conn);
      void removePresenceConn(conn.user.id, `elylite:${connectionId}`);
    }
  }

  // Update ping timestamp
  recordPong(connectionId: string): void {
    const conn = this.connections.get(connectionId);
    if (conn) {
      conn.lastPing = Date.now();
    }
  }

  // Join a conversation room
  joinConversation(connectionId: string, conversationId: string): void {
    const conn = this.connections.get(connectionId);
    if (conn) {
      conn.conversations.add(conversationId);
    }
  }

  // Leave a conversation room
  leaveConversation(connectionId: string, conversationId: string): void {
    const conn = this.connections.get(connectionId);
    if (conn) {
      conn.conversations.delete(conversationId);
    }
  }

  // Get active connection for id
  getConnection(connectionId: string): ClientConnection | undefined {
    return this.connections.get(connectionId);
  }

  // Total active connection count
  getConnectionCount(): number {
    return this.connections.size;
  }

  getUserConnections(userId: string): ClientConnection[] {
    const ids = this.userToConnections.get(userId);
    if (!ids) return [];
    const out: ClientConnection[] = [];
    ids.forEach((id) => {
      const conn = this.connections.get(id);
      if (conn) out.push(conn);
    });
    return out;
  }

  forEachConnInRoom(conversationId: string, fn: (conn: ClientConnection) => void): void {
    this.connections.forEach((conn) => {
      if (conn.conversations.has(conversationId)) fn(conn);
    });
  }

  // Send message to all sockets of a specific user
  sendToUser(userId: string, data: unknown): void {
    const payload = typeof data === "string" ? data : JSON.stringify(data);
    this.getUserConnections(userId).forEach((conn) => {
      try {
        conn.ws.send(payload);
      } catch {
        // heartbeat reaps dead sockets
      }
    });
  }

  // Clean up timer
  cleanup(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.connections.clear();
    this.userToConnections.clear();
  }
}

async function clearTypingForConn(conn: ClientConnection): Promise<void> {
  const rooms = [...conn.conversations];
  await Promise.all(rooms.map((r) => clearTyping(r, conn.user.id)));
}

export const connectionManager = new WebSocketConnectionManager();

// Forward a room frame to local sockets (membership already verified at join).
export function deliverToRoom(
  conversationId: string,
  frame: RoomFrame,
  opts?: { excludeUserId?: string }
): void {
  const payload = JSON.stringify(frame);
  connectionManager.forEachConnInRoom(conversationId, (conn) => {
    if (opts?.excludeUserId && conn.user.id === opts.excludeUserId) return;
    try {
      conn.ws.send(payload);
    } catch {
      // heartbeat reaps dead sockets
    }
  });
}

// Subscribe this process to a room channel and relay frames to local sockets.
export function relayRoom(conversationId: string): () => void {
  return subscribeJson(roomChannel(conversationId), (data) => {
    deliverToRoom(conversationId, data as RoomFrame);
  });
}

// Ensure Redis is connected (call once at boot / in tests).
export async function ensureBus(): Promise<void> {
  await connectRedis();
}

// Verify a user is an active participant (tenant of trust for Lite single-node).
export async function assertParticipant(conversationId: string, userId: string): Promise<void> {
  const participant = await prisma.chatParticipant.findUnique({
    where: { userId_conversationId: { userId, conversationId } },
  });
  if (!participant || !participant.isActive) {
    throw new Error("FORBIDDEN: not a conversation participant");
  }
}

// --- Broadcast helpers (persist-before-publish: call AFTER the DB commit) ---

export async function broadcastNewMessage(message: {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  bridged?: boolean;
}): Promise<void> {
  const frame: ChatNewFrame = {
    t: "chat:new",
    m: message.id,
    r: message.conversationId,
    u: message.senderId,
    tms: Date.now(),
    c: leanSnippet(message.content),
    ...(message.bridged ? { bridged: true as const } : {}),
  };
  await publishJson(roomChannel(message.conversationId), frame);
}

export async function broadcastMessageEdited(message: {
  id: string;
  conversationId: string;
  content: string;
}): Promise<void> {
  const frame: MessageUpdateFrame = {
    t: "message:update",
    m: message.id,
    r: message.conversationId,
    kind: "edited",
    c: leanSnippet(message.content),
    tms: Date.now(),
  };
  await publishJson(roomChannel(message.conversationId), frame);
}

export async function broadcastMessageDeleted(message: {
  id: string;
  conversationId: string;
}): Promise<void> {
  const frame: MessageUpdateFrame = {
    t: "message:update",
    m: message.id,
    r: message.conversationId,
    kind: "deleted",
    tms: Date.now(),
  };
  await publishJson(roomChannel(message.conversationId), frame);
}

export async function broadcastReadStatusUpdate(
  conversationId: string,
  userId: string,
  messageId?: string
): Promise<void> {
  const frame: ReceiptFrame = {
    t: "chat:read",
    r: conversationId,
    u: userId,
    tms: Date.now(),
    ...(messageId ? { m: messageId } : {}),
  };
  await publishJson(roomChannel(conversationId), frame);
}

export async function broadcastDelivered(
  conversationId: string,
  userId: string,
  messageId: string
): Promise<void> {
  const frame: ReceiptFrame = {
    t: "chat:delivered",
    m: messageId,
    r: conversationId,
    u: userId,
    tms: Date.now(),
  };
  await publishJson(roomChannel(conversationId), frame);
}

export async function broadcastTypingEvent(
  conversationId: string,
  user: AuthenticatedUser,
  isTyping: boolean
): Promise<boolean> {
  if (isTyping) {
    // 3s debounce window: only the first claim in a window is published
    const fresh = await claimTypingOn(conversationId, user.id);
    if (!fresh) return false;
  } else {
    await clearTyping(conversationId, user.id);
  }
  const frame: TypingFrame = {
    t: "chat:typing",
    r: conversationId,
    u: user.id,
    on: isTyping,
    tms: Date.now(),
  };
  await publishJson(roomChannel(conversationId), frame);
  return true;
}

// WS frame rate limit: 30 sends/min/user (docs/technical/websocket_events.md §4)
export async function checkSendLimit(userId: string): Promise<{ allowed: boolean; resetSec: number }> {
  const res = await checkRateLimit(`rl:ws:send:${userId}`, 30, 60);
  return { allowed: res.allowed, resetSec: res.resetSec };
}
