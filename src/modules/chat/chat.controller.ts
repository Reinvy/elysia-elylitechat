import { chatService, ChatError, ValidationError } from "./chat.service";
import { authService } from "../auth/auth.service";
import {
  broadcastNewMessage,
  broadcastMessageEdited,
  broadcastMessageDeleted,
  broadcastReadStatusUpdate,
} from "./websocket.js";

// Broadcasts are best-effort: the DB commit is the source of truth and the
// request stays successful even if Redis publish fails (peers catch up via
// missed-message replay). This preserves persist-before-publish ordering.
async function bestEffort(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch {
    // delivery will be recovered via ?since= replay
  }
}

export class ChatController {
  // Utility method to verify access token
  private verifyAccessToken = (token: string): { userId: string; email: string } => {
    return authService.verifyAccessToken(token);
  };

  // Get all conversations for the current user
  getConversations = async ({ headers, query }: { headers: Record<string, string | undefined>; query: any }) => {
    try {
      const authHeader = headers["authorization"];
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new Error("Authorization token required");
      }
      
      const token = authHeader.substring(7);
      const decoded = this.verifyAccessToken(token);
      
      const filter = {
        ...(query.participantId !== undefined ? { participantId: query.participantId } : {}),
        ...(query.limit ? { limit: parseInt(query.limit) } : {}),
        ...(query.offset ? { offset: parseInt(query.offset) } : {}),
        ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
      };

      const result = await chatService.getConversations(decoded.userId, filter);

      return {
        success: true,
        message: "Conversations retrieved successfully",
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to fetch conversations",
        data: null,
        error: {
          code: "INTERNAL_ERROR",
          details: "An unexpected error occurred"
        }
      };
    }
  };

  // Get a specific conversation by ID
  getConversation = async ({ headers, params }: { headers: Record<string, string | undefined>; params: { id: string } }) => {
    try {
      const authHeader = headers["authorization"];
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new Error("Authorization token required");
      }
      
      const token = authHeader.substring(7);
      const decoded = this.verifyAccessToken(token);
      
      const conversation = await chatService.getConversation(params.id, decoded.userId);

      return {
        success: true,
        message: "Conversation retrieved successfully",
        data: conversation,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to fetch conversation",
        data: null,
      };
    }
  };

  // Get messages for a specific conversation
  getMessages = async ({ headers, params, query }: { headers: Record<string, string | undefined>; params: { id: string }; query: any }) => {
    try {
      const authHeader = headers["authorization"];
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new Error("Authorization token required");
      }
      
      const token = authHeader.substring(7);
      const decoded = this.verifyAccessToken(token);
      
      const filter = {
        conversationId: params.id,
        ...(query.limit ? { limit: parseInt(query.limit) } : {}),
        ...(query.offset ? { offset: parseInt(query.offset) } : {}),
        ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
      };

      const result = await chatService.getMessages(params.id, decoded.userId, filter);

      return {
        success: true,
        message: "Messages retrieved successfully",
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to fetch messages",
        data: null,
      };
    }
  };

  // Get a specific message by ID
  getMessage = async ({ headers, params }: { headers: Record<string, string | undefined>; params: { id: string } }) => {
    try {
      const authHeader = headers["authorization"];
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new Error("Authorization token required");
      }
      
      const token = authHeader.substring(7);
      const decoded = this.verifyAccessToken(token);
      
      const message = await chatService.getMessage(params.id, decoded.userId);

      return {
        success: true,
        message: "Message retrieved successfully",
        data: message,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to fetch message",
        data: null,
      };
    }
  };

  // Send a new message
  sendMessage = async ({ headers, body }: { headers: Record<string, string | undefined>; body: any }) => {
    try {
      const authHeader = headers["authorization"];
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new Error("Authorization token required");
      }
      
      const token = authHeader.substring(7);
      const decoded = this.verifyAccessToken(token);
      
      const message = await chatService.sendMessage(decoded.userId, body);

      await bestEffort(() => broadcastNewMessage({
        id: message.id,
        conversationId: message.conversationId,
        senderId: decoded.userId,
        content: typeof message.content === "string" ? message.content : "",
      }));

      return {
        success: true,
        message: "Message sent successfully",
        data: message,
      };
    } catch (error) {
      if (error instanceof ChatError) {
        return {
          success: false,
          message: error.message,
          data: null,
          error: {
            code: error.code,
            details: error instanceof ValidationError ? "Validation failed" : "Chat operation failed"
          }
        };
      }
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to send message",
        data: null,
        error: {
          code: "INTERNAL_ERROR",
          details: "An unexpected error occurred"
        }
      };
    }
  };

  // Edit an existing message
  editMessage = async ({ headers, params, body }: { headers: Record<string, string | undefined>; params: { id: string }; body: { content: string } }) => {
    try {
      const authHeader = headers["authorization"];
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new Error("Authorization token required");
      }
      
      const token = authHeader.substring(7);
      const decoded = this.verifyAccessToken(token);
      
      const message = await chatService.editMessage(decoded.userId, params.id, body.content);

      await bestEffort(() => broadcastMessageEdited({
        id: message.id,
        conversationId: message.conversationId,
        content: typeof message.content === "string" ? message.content : "",
      }));

      return {
        success: true,
        message: "Message edited successfully",
        data: message,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to edit message",
        data: null,
      };
    }
  };

  // Soft delete a message
  deleteMessage = async ({ headers, params }: { headers: Record<string, string | undefined>; params: { id: string } }) => {
    try {
      const authHeader = headers["authorization"];
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new Error("Authorization token required");
      }
      
      const token = authHeader.substring(7);
      const decoded = this.verifyAccessToken(token);
      
      const message = await chatService.deleteMessage(decoded.userId, params.id);

      await bestEffort(() => broadcastMessageDeleted({
        id: message.id,
        conversationId: message.conversationId,
      }));

      return {
        success: true,
        message: "Message deleted successfully",
        data: message,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to delete message",
        data: null,
      };
    }
  };

  // Mark messages as read
  markMessagesAsRead = async ({ headers, body }: { headers: Record<string, string | undefined>; body: any }) => {
    try {
      const authHeader = headers["authorization"];
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new Error("Authorization token required");
      }
      
      const token = authHeader.substring(7);
      const decoded = this.verifyAccessToken(token);
      
      const result = await chatService.markMessagesAsRead(decoded.userId, body);

      const ids: string[] = Array.isArray(body?.messageIds) ? body.messageIds.slice(0, 20) : [];
      await bestEffort(async () => {
        if (ids.length === 0) {
          await broadcastReadStatusUpdate(body.conversationId, decoded.userId);
        } else {
          for (const id of ids) {
            await broadcastReadStatusUpdate(body.conversationId, decoded.userId, id);
          }
        }
      });

      return {
        success: true,
        message: "Messages marked as read successfully",
        data: { success: result },
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to mark messages as read",
        data: null,
      };
    }
  };

  // Mark all messages in a conversation as read
  markConversationAsRead = async ({ headers, params }: { headers: Record<string, string | undefined>; params: { id: string } }) => {
    try {
      const authHeader = headers["authorization"];
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new Error("Authorization token required");
      }
      
      const token = authHeader.substring(7);
      const decoded = this.verifyAccessToken(token);
      
      const result = await chatService.markConversationAsRead(decoded.userId, params.id);

      await bestEffort(() => broadcastReadStatusUpdate(params.id, decoded.userId));

      return {
        success: true,
        message: "All messages marked as read successfully",
        data: { success: result },
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to mark conversation as read",
        data: null,
      };
    }
  };

  // Search users
  searchUsers = async ({ headers, query }: { headers: Record<string, string | undefined>; query: { q: string } }) => {
    try {
      const authHeader = headers["authorization"];
      let currentUserId: string | undefined;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        try {
          const decoded = this.verifyAccessToken(authHeader.substring(7));
          currentUserId = decoded.userId;
        } catch {
          // Optional user context
        }
      }
      
      const users = await chatService.searchUsers(query?.q || "", currentUserId);

      return {
        success: true,
        message: "Users retrieved successfully",
        data: users,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to search users",
        data: [],
      };
    }
  };

  // Create a new conversation
  createConversation = async ({ headers, body }: { headers: Record<string, string | undefined>; body: any }) => {
    try {
      const authHeader = headers["authorization"];
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new Error("Authorization token required");
      }
      
      const token = authHeader.substring(7);
      const decoded = this.verifyAccessToken(token);
      
      const result = await chatService.createConversation(decoded.userId, body.participantId);

      return {
        success: true,
        message: "Conversation created successfully",
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to create conversation",
        data: null,
      };
    }
  };

  // Health check business logic
  health = () => {
    return {
      success: true,
      message: "Chat service is running",
      data: {
        timestamp: new Date().toISOString(),
        service: process.env.SERVICE_NAME || "chat service",
        uptime_sec: Math.round(process.uptime()),
        pid: process.pid,
      },
    };
  };
}

export const chatController = new ChatController();