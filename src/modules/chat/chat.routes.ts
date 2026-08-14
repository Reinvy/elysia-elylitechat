import { Elysia, t } from "elysia";
import { chatController } from "./chat.controller.js";

export const chatRoute = new Elysia().group("/chat", (app) =>
  app
    // Get all conversations for the current user
    .get("/conversations", chatController.getConversations, {
      query: t.Object({
        participantId: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        offset: t.Optional(t.String()),
        cursor: t.Optional(t.String()),
      }),
      headers: t.Object({
        authorization: t.String(),
      }),
      detail: {
        summary: "Get all conversations for the current user",
        tags: ["chat"],
      },
    })
    
    // Get a specific conversation by ID
    .get("/conversations/:id", chatController.getConversation, {
      params: t.Object({
        id: t.String(),
      }),
      headers: t.Object({
        authorization: t.String(),
      }),
      detail: {
        summary: "Get a specific conversation by ID",
        tags: ["chat"],
      },
    })
    
    // Get messages for a specific conversation
    .get("/conversations/:id/messages", chatController.getMessages, {
      params: t.Object({
        id: t.String(),
      }),
      query: t.Object({
        limit: t.Optional(t.String()),
        offset: t.Optional(t.String()),
        cursor: t.Optional(t.String()),
      }),
      headers: t.Object({
        authorization: t.String(),
      }),
      detail: {
        summary: "Get messages for a specific conversation",
        tags: ["chat"],
      },
    })
    
    // Get a specific message by ID
    .get("/messages/:id", chatController.getMessage, {
      params: t.Object({
        id: t.String(),
      }),
      headers: t.Object({
        authorization: t.String(),
      }),
      detail: {
        summary: "Get a specific message by ID",
        tags: ["chat"],
      },
    })
    
    // Send a new message
    .post("/messages", chatController.sendMessage, {
      body: t.Object({
        content: t.String({
          minLength: 1,
          description: "Message content (minimum 1 character)",
        }),
        receiverId: t.String({
          description: "ID of the message receiver",
        }),
        conversationId: t.Optional(t.String({
          description: "Optional conversation ID (if not provided, will be created)",
        })),
      }),
      headers: t.Object({
        authorization: t.String(),
      }),
      detail: {
        summary: "Send a new message to another user",
        tags: ["chat"],
      },
    })
    
    // Mark messages as read
    .post("/messages/read", chatController.markMessagesAsRead, {
      body: t.Object({
        conversationId: t.String({
          description: "ID of the conversation",
        }),
        messageIds: t.Array(t.String(), {
          description: "Array of message IDs to mark as read",
        }),
      }),
      headers: t.Object({
        authorization: t.String(),
      }),
      detail: {
        summary: "Mark messages as read in a conversation",
        tags: ["chat"],
      },
    })
    
    // Edit message
    .put("/messages/:id", chatController.editMessage, {
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        content: t.String({
          minLength: 1,
          description: "New message content",
        }),
      }),
      headers: t.Object({
        authorization: t.String(),
      }),
      detail: {
        summary: "Edit a message sent by current user",
        tags: ["chat"],
      },
    })

    // Soft delete a message
    .delete("/messages/:id", chatController.deleteMessage, {
      params: t.Object({
        id: t.String(),
      }),
      headers: t.Object({
        authorization: t.String(),
      }),
      detail: {
        summary: "Delete a message sent by current user",
        tags: ["chat"],
      },
    })

    // Mark all messages in conversation as read
    .post("/conversations/:id/read-all", chatController.markConversationAsRead, {
      params: t.Object({
        id: t.String(),
      }),
      headers: t.Object({
        authorization: t.String(),
      }),
      detail: {
        summary: "Mark all messages in conversation as read",
        tags: ["chat"],
      },
    })

    // Search users
    .get("/users/search", chatController.searchUsers, {
      query: t.Object({
        q: t.String({
          description: "Search query for username or email",
        }),
      }),
      detail: {
        summary: "Search users by username or email",
        tags: ["chat"],
      },
    })

    // Create a new conversation
    .post("/conversations", chatController.createConversation, {
      body: t.Object({
        participantId: t.String({
          description: "ID of the participant to create conversation with",
        }),
      }),
      headers: t.Object({
        authorization: t.String(),
      }),
      detail: {
        summary: "Create a new conversation with a participant",
        tags: ["chat"],
      },
    })
    
    // Health check for chat service
    .get("/health", chatController.health, {
      detail: {
        summary: "Health Check for Chat Service",
        tags: ["chat"],
      },
    })
);