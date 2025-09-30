import { chatService, ChatError, ValidationError, NotFoundError, AuthorizationError } from "./chat.service";

export class ChatController {
  // Get all conversations for the current user
  async getConversations({ headers, query }: { headers: { authorization: string }; query: any }) {
    try {
      const authHeader = headers["authorization"];
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new Error("Authorization token required");
      }
      
      const token = authHeader.substring(7);
      const decoded = this.verifyAccessToken(token);
      
      const filter = {
        participantId: query.participantId,
        limit: query.limit ? parseInt(query.limit) : undefined,
        offset: query.offset ? parseInt(query.offset) : undefined,
        cursor: query.cursor
      };

      const result = await chatService.getConversations(decoded.userId, filter);

      return {
        success: true,
        message: "Conversations retrieved successfully",
        data: result,
      };
    } catch (error) {
      console.error("Error fetching conversations:", error);
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
        message: "Failed to fetch conversations",
        data: null,
        error: {
          code: "INTERNAL_ERROR",
          details: "An unexpected error occurred"
        }
      };
    }
  }

  // Get a specific conversation by ID
  async getConversation({ headers, params }: { headers: { authorization: string }; params: { id: string } }) {
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
      console.error("Error fetching conversation:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to fetch conversation",
        data: null,
      };
    }
  }

  // Get messages for a specific conversation
  async getMessages({ headers, params, query }: { headers: { authorization: string }; params: { id: string }; query: any }) {
    try {
      const authHeader = headers["authorization"];
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new Error("Authorization token required");
      }
      
      const token = authHeader.substring(7);
      const decoded = this.verifyAccessToken(token);
      
      const filter = {
        conversationId: params.id,
        limit: query.limit ? parseInt(query.limit) : undefined,
        offset: query.offset ? parseInt(query.offset) : undefined,
        cursor: query.cursor
      };

      const result = await chatService.getMessages(params.id, decoded.userId, filter);

      return {
        success: true,
        message: "Messages retrieved successfully",
        data: result,
      };
    } catch (error) {
      console.error("Error fetching messages:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to fetch messages",
        data: null,
      };
    }
  }

  // Get a specific message by ID
  async getMessage({ headers, params }: { headers: { authorization: string }; params: { id: string } }) {
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
      console.error("Error fetching message:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to fetch message",
        data: null,
      };
    }
  }

  // Send a new message
  async sendMessage({ headers, body }: { headers: { authorization: string }; body: any }) {
    try {
      const authHeader = headers["authorization"];
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new Error("Authorization token required");
      }
      
      const token = authHeader.substring(7);
      const decoded = this.verifyAccessToken(token);
      
      const result = await chatService.sendMessage(decoded.userId, body);

      return {
        success: true,
        message: "Message sent successfully",
        data: result,
      };
    } catch (error) {
      console.error("Error sending message:", error);
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
        message: "Failed to send message",
        data: null,
        error: {
          code: "INTERNAL_ERROR",
          details: "An unexpected error occurred"
        }
      };
    }
  }

  // Mark messages as read
  async markMessagesAsRead({ headers, body }: { headers: { authorization: string }; body: any }) {
    try {
      const authHeader = headers["authorization"];
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new Error("Authorization token required");
      }
      
      const token = authHeader.substring(7);
      const decoded = this.verifyAccessToken(token);
      
      const result = await chatService.markMessagesAsRead(decoded.userId, body);

      return {
        success: true,
        message: "Messages marked as read successfully",
        data: { success: result },
      };
    } catch (error) {
      console.error("Error marking messages as read:", error);
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
        message: "Failed to mark messages as read",
        data: null,
        error: {
          code: "INTERNAL_ERROR",
          details: "An unexpected error occurred"
        }
      };
    }
  }

  // Create a new conversation
  async createConversation({ headers, body }: { headers: { authorization: string }; body: any }) {
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
      console.error("Error creating conversation:", error);
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
        message: "Failed to create conversation",
        data: null,
        error: {
          code: "INTERNAL_ERROR",
          details: "An unexpected error occurred"
        }
      };
    }
  }

  // Health check business logic
  health() {
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
  }

  // Utility method to verify access token
  private verifyAccessToken(token: string): { userId: string; email: string } {
    try {
      // In a real implementation, you would use JWT verification here
      // For now, we'll use a placeholder
      // const decoded = jwt.verify(token, process.env.JWT_SECRET) as any;
      // return { userId: decoded.userId, email: decoded.email };
      
      // Placeholder for testing - in production, implement proper JWT verification
      return { userId: 'test-user-id', email: 'test@example.com' };
    } catch (error) {
      throw new Error("Invalid access token");
    }
  }
}

export const chatController = new ChatController();