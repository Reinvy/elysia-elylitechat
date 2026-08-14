import { prisma } from '../../config/db.js';
import { authService } from '../auth/auth.service.js';

// Connection context type for WebSocket connections
export interface AuthenticatedUser {
  id: string;
  email: string;
  username: string;
}

export interface ClientConnection {
  id: string;
  ws: any;
  user: AuthenticatedUser;
  lastPing: number;
  conversations: Set<string>;
}

// In-Memory Pub/Sub implementation for GraphQL and WS message broadcasting
export class PubSub {
  private subscriptions: Map<string, Set<(data: any) => void>> = new Map();

  // Subscribe to a specific topic
  subscribe(topic: string, callback: (data: any) => void): () => void {
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, new Set());
    }
    this.subscriptions.get(topic)!.add(callback);

    // Return unsubscribe function
    return () => {
      const topicCallbacks = this.subscriptions.get(topic);
      if (topicCallbacks) {
        topicCallbacks.delete(callback);
        if (topicCallbacks.size === 0) {
          this.subscriptions.delete(topic);
        }
      }
    };
  }

  // Publish a message to a topic
  publish(topic: string, data: any): void {
    const callbacks = this.subscriptions.get(topic);
    if (callbacks) {
      callbacks.forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in subscription callback for topic ${topic}:`, error);
        }
      });
    }
  }

  // Create an async iterator for GraphQL subscriptions
  asyncIterator(topic: string): AsyncIterableIterator<any> {
    const self = this;
    const queue: any[] = [];
    let resolveQueue: ((value: any) => void) | null = null;

    const unsubscribe = self.subscribe(topic, (data: any) => {
      if (resolveQueue) {
        const resolve = resolveQueue;
        resolveQueue = null;
        resolve({ value: data, done: false });
      } else {
        queue.push(data);
      }
    });

    const iterator: AsyncIterableIterator<any> = {
      [Symbol.asyncIterator]: () => iterator,
      next: async () => {
        if (queue.length > 0) {
          return { value: queue.shift(), done: false };
        }
        return new Promise((resolve) => {
          resolveQueue = resolve;
        });
      },
      return: async () => {
        unsubscribe();
        return { value: undefined, done: true };
      },
    };
    return iterator;
  }
}

export const pubSub = new PubSub();

// Active connections manager
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
        // If no activity or pong in 60s, close
        if (now - conn.lastPing > 60000) {
          deadConnectionIds.push(id);
        } else {
          try {
            conn.ws.send(JSON.stringify({ type: 'PING', timestamp: now }));
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

    console.log(`[WS] Client connected: ${user.username} (${user.id}) [Conn: ${connectionId}]`);
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
      } catch {}
      this.connections.delete(connectionId);
      console.log(`[WS] Client disconnected: ${conn.user.username} [Conn: ${connectionId}]`);
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

  // Send message to all sockets of a specific user
  sendToUser(userId: string, data: any): void {
    const connIds = this.userToConnections.get(userId);
    if (!connIds) return;

    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    connIds.forEach((connId) => {
      const conn = this.connections.get(connId);
      if (conn) {
        try {
          conn.ws.send(payload);
        } catch (err) {
          console.error(`[WS] Failed to send message to connection ${connId}:`, err);
        }
      }
    });
  }

  // Broadcast event to all participants of a conversation
  async broadcastToConversation(conversationId: string, eventType: string, payload: any, excludeUserId?: string): Promise<void> {
    try {
      const participants = await prisma.chatParticipant.findMany({
        where: {
          conversationId,
          isActive: true,
        },
        select: {
          userId: true,
        },
      });

      const messageEvent = {
        type: eventType,
        conversationId,
        payload,
        timestamp: new Date().toISOString(),
      };

      participants.forEach((p) => {
        if (p.userId !== excludeUserId) {
          this.sendToUser(p.userId, messageEvent);
        }
      });
    } catch (error) {
      console.error(`[WS] Failed to broadcast to conversation ${conversationId}:`, error);
    }
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

export const connectionManager = new WebSocketConnectionManager();

// Broadcast helpers
export async function broadcastNewMessage(message: any): Promise<void> {
  // 1. Publish to GraphQL Subscriptions
  pubSub.publish(`MESSAGE_ADDED:${message.conversationId}`, { messageAdded: message });
  pubSub.publish(`NEW_MESSAGE:${message.receiverId}`, { newMessage: message });

  // 2. Direct WS broadcast to conversation participants
  await connectionManager.broadcastToConversation(message.conversationId, 'NEW_MESSAGE', message);
}

export async function broadcastMessageEdited(message: any): Promise<void> {
  pubSub.publish(`MESSAGE_ADDED:${message.conversationId}`, { messageAdded: message });
  await connectionManager.broadcastToConversation(message.conversationId, 'MESSAGE_EDITED', message);
}

export async function broadcastMessageDeleted(message: any): Promise<void> {
  await connectionManager.broadcastToConversation(message.conversationId, 'MESSAGE_DELETED', message);
}

export async function broadcastReadStatusUpdate(conversationId: string, userId: string): Promise<void> {
  pubSub.publish(`MESSAGES_READ:${conversationId}`, {
    messagesRead: {
      conversationId,
      userId,
      readAt: new Date().toISOString(),
    },
  });

  await connectionManager.broadcastToConversation(conversationId, 'MESSAGES_READ', {
    conversationId,
    userId,
    readAt: new Date().toISOString(),
  }, userId);
}

export async function broadcastTypingEvent(conversationId: string, user: AuthenticatedUser, isTyping: boolean): Promise<void> {
  const typingEvent = {
    userId: user.id,
    username: user.username,
    conversationId,
    isTyping,
  };

  pubSub.publish(`TYPING_STATUS:${conversationId}`, { typingStatus: typingEvent });
  await connectionManager.broadcastToConversation(conversationId, 'TYPING_STATUS', typingEvent, user.id);
}