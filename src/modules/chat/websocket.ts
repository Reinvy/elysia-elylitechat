import { WebSocketServer } from 'ws';
import { makeServer } from 'graphql-ws';
import { ApolloServer } from '@apollo/server';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { chatTypeDefs } from './schema.js';
import { chatResolvers } from './resolvers.js';
import { prisma } from '../../config/db.js';

// Connection context type for WebSocket connections
export interface WebSocketContext {
  connection: {
    context: {
      user?: {
        id: string;
        email: string;
        username: string;
      };
    };
  };
}

// Pub/Sub implementation for message broadcasting
export class PubSub {
  private subscriptions: Map<string, Set<Function>> = new Map();
  
  // Subscribe to a specific topic
  subscribe(topic: string, callback: Function): () => void {
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
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in subscription callback for topic ${topic}:`, error);
        }
      });
    }
  }
  
  // Get all active subscriptions for debugging
  getSubscriptions(): Map<string, number> {
    const result = new Map<string, number>();
    this.subscriptions.forEach((callbacks, topic) => {
      result.set(topic, callbacks.size);
    });
    return result;
  }
  
  // Create an async iterator for GraphQL subscriptions
  asyncIterator(topic: string): AsyncIterableIterator<any> {
    const self = this;
    const iterator: AsyncIterableIterator<any> = {
      [Symbol.asyncIterator]: () => iterator,
      next: async () => {
        return new Promise((resolve) => {
          const unsubscribe = self.subscribe(topic, (data: any) => {
            unsubscribe();
            resolve({ value: data, done: false });
          });
          
          // Set a timeout to avoid hanging
          setTimeout(() => {
            unsubscribe();
            resolve({ value: undefined, done: true });
          }, 30000); // 30 second timeout
        });
      },
      return: async () => {
        return { value: undefined, done: true };
      }
    };
    return iterator;
  }
}

// Global pub/sub instance
export const pubSub = new PubSub();

// Active connections management
export class ConnectionManager {
  private connections: Map<string, WebSocketContext> = new Map();
  private userConnections: Map<string, Set<string>> = new Map();
  
  // Add a new connection
  addConnection(connectionId: string, context: WebSocketContext): void {
    this.connections.set(connectionId, context);
    
    const user = context.connection.context.user;
    if (user) {
      if (!this.userConnections.has(user.id)) {
        this.userConnections.set(user.id, new Set());
      }
      this.userConnections.get(user.id)!.add(connectionId);
    }
    
    console.log(`WebSocket connection established: ${connectionId}`);
  }
  
  // Remove a connection
  removeConnection(connectionId: string): void {
    const context = this.connections.get(connectionId);
    if (context) {
      const user = context.connection.context.user;
      if (user && this.userConnections.has(user.id)) {
        const userConnIds = this.userConnections.get(user.id)!;
        userConnIds.delete(connectionId);
        if (userConnIds.size === 0) {
          this.userConnections.delete(user.id);
        }
      }
    }
    
    this.connections.delete(connectionId);
    console.log(`WebSocket connection closed: ${connectionId}`);
  }
  
  // Get connections for a specific user
  getUserConnections(userId: string): Set<string> {
    return this.userConnections.get(userId) || new Set();
  }
  
  // Get all active connections
  getAllConnections(): Map<string, WebSocketContext> {
    return new Map(this.connections);
  }
  
  // Get connection count
  getConnectionCount(): number {
    return this.connections.size;
  }
}

// Global connection manager
export const connectionManager = new ConnectionManager();

// WebSocket server setup
export function setupWebSocketServer(server: any): WebSocketServer {
  const wsServer = new WebSocketServer({
    server,
    path: '/graphql',
  });

  // Create executable schema
  const schema = makeExecutableSchema({
    typeDefs: chatTypeDefs,
    resolvers: chatResolvers,
  });

  // Setup GraphQL WebSocket server
  const wsServerInstance = makeServer(
    {
      schema,
      context: async (ctx: any) => {
        // Extract JWT token from connection parameters
        const { connectionParams } = ctx;
        const token = connectionParams?.token as string;
        
        let user = null;
        
        // TODO: Implement JWT verification
        // For now, we'll use a placeholder user
        if (token) {
          try {
            // In a real implementation, you would verify the JWT token here
            // const decoded = jwt.verify(token, process.env.JWT_SECRET);
            // user = decoded;
            
            // Placeholder user for testing
            user = {
              id: 'test-user-id',
              email: 'test@example.com',
              username: 'testuser'
            };
          } catch (error) {
            console.error('JWT verification failed:', error);
          }
        }
        
        return {
          user,
        };
      },
      onConnect: (ctx: any) => {
        console.log('WebSocket client connected');
        connectionManager.addConnection(ctx.connection.id, ctx);
      },
      onDisconnect: (ctx: any) => {
        console.log('WebSocket client disconnected');
        connectionManager.removeConnection(ctx.connection.id);
      },
      onError: (err: any, ctx: any) => {
        console.error('WebSocket error:', err);
        if (ctx) {
          connectionManager.removeConnection(ctx.connection.id);
        }
      },
    }
  );

  // Listen for WebSocket connections and forward them to the GraphQL server
  wsServer.on('connection', (ws, req) => {
    wsServerInstance.opened(ws as any, req);
  });

  return wsServer;
}

// Helper function to broadcast messages to conversation participants
export function broadcastToConversationParticipants(
  conversationId: string,
  message: any,
  excludeUserId?: string
): void {
  // Get all participants in the conversation
  // TODO: Implement this using Prisma to get conversation participants
  // For now, we'll broadcast to all connected users
  
  const messageData = {
    type: 'messageAdded',
    payload: message,
    conversationId,
  };
  
  // Broadcast to all connected users (in production, filter by conversation participants)
  connectionManager.getAllConnections().forEach((context, connectionId) => {
    const user = context.connection.context.user;
    if (user && user.id !== excludeUserId) {
      try {
        (context.connection as any).send(JSON.stringify(messageData));
      } catch (error) {
        console.error(`Error sending message to connection ${connectionId}:`, error);
      }
    }
  });
}

// Helper function to broadcast read status updates
export function broadcastReadStatusUpdate(
  conversationId: string,
  messageId: string,
  userId: string
): void {
  const readStatusData = {
    type: 'messagesRead',
    payload: {
      messageId,
      conversationId,
      userId,
      timestamp: new Date().toISOString(),
    },
  };
  
  // Broadcast to all connected users in the conversation
  connectionManager.getAllConnections().forEach((context, connectionId) => {
    const user = context.connection.context.user;
    if (user && user.id !== userId) {
      try {
        (context.connection as any).send(JSON.stringify(readStatusData));
      } catch (error) {
        console.error(`Error sending read status to connection ${connectionId}:`, error);
      }
    }
  });
}

// Helper function to broadcast new messages
export function broadcastNewMessage(message: any): void {
  const messageData = {
    type: 'newMessage',
    payload: message,
  };
  
  // Broadcast to all connected users
  connectionManager.getAllConnections().forEach((context, connectionId) => {
    const user = context.connection.context.user;
    if (user) {
      try {
        (context.connection as any).send(JSON.stringify(messageData));
      } catch (error) {
        console.error(`Error broadcasting new message to connection ${connectionId}:`, error);
      }
    }
  });
}