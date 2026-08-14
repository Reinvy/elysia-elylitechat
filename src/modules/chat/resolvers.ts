import { prisma } from "../../config/db.js";
import {
  pubSub,
  broadcastNewMessage,
  broadcastMessageEdited,
  broadcastMessageDeleted,
  broadcastReadStatusUpdate,
} from "./websocket.js";

// Input types for better type safety
interface CreateMessageInput {
  content: string;
  receiverId: string;
  conversationId?: string;
}

interface MarkMessagesAsReadInput {
  conversationId: string;
  messageIds: string[];
}

interface ConversationFilterInput {
  participantId?: string;
  limit?: number;
  offset?: number;
  cursor?: string;
}

interface MessageFilterInput {
  conversationId: string;
  limit?: number;
  offset?: number;
  cursor?: string;
}

// Helper function to validate user authentication
const requireAuth = (context: any): { id: string; email: string; username: string } => {
  if (!context?.user?.id) {
    throw new Error("Authentication required: Please provide a valid Bearer token");
  }
  return context.user;
};

// Helper function to check if user is participant in conversation
const isConversationParticipant = async (
  conversationId: string,
  userId: string
): Promise<boolean> => {
  const participant = await prisma.chatParticipant.findUnique({
    where: {
      userId_conversationId: {
        userId,
        conversationId,
      },
    },
  });
  return !!participant && participant.isActive;
};

export const chatResolvers = {
  Query: {
    getConversations: async (
      _: any,
      { filter }: { filter?: ConversationFilterInput },
      context: any
    ) => {
      const user = requireAuth(context);
      const { participantId, limit = 20, cursor } = filter || {};
      const currentUserId = user.id;

      try {
        const whereClause: any = {
          isActive: true,
          participants: {
            some: {
              userId: currentUserId,
              isActive: true,
            },
          },
        };

        if (participantId) {
          whereClause.participants = {
            some: [
              { userId: currentUserId, isActive: true },
              { userId: participantId, isActive: true },
            ],
          };
        }

        const orderBy = { updatedAt: "desc" as const };
        const take = Math.min(limit || 20, 100);

        let conversations = await prisma.chatConversation.findMany({
          where: whereClause,
          include: {
            participants: {
              include: {
                user: {
                  select: {
                    id: true,
                    email: true,
                    username: true,
                    isActive: true,
                  },
                },
              },
            },
            messages: {
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
          orderBy,
          take: take + 1,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });

        const hasMore = conversations.length > take;
        if (hasMore) {
          conversations = conversations.slice(0, take);
        }

        const total = await prisma.chatConversation.count({ where: whereClause });

        return {
          items: conversations,
          total,
          hasMore,
        };
      } catch (error) {
        console.error("Error fetching conversations:", error);
        throw new Error(error instanceof Error ? error.message : "Failed to fetch conversations");
      }
    },

    getConversation: async (
      _: any,
      { id }: { id: string },
      context: any
    ) => {
      const user = requireAuth(context);

      const isParticipant = await isConversationParticipant(id, user.id);
      if (!isParticipant) {
        throw new Error("Access denied: You are not a participant in this conversation");
      }

      const conversation = await prisma.chatConversation.findUnique({
        where: { id },
        include: {
          participants: {
            include: {
              user: true,
            },
          },
        },
      });

      if (!conversation) {
        throw new Error("Conversation not found");
      }

      return conversation;
    },

    getMessages: async (
      _: any,
      { filter }: { filter: MessageFilterInput },
      context: any
    ) => {
      const user = requireAuth(context);
      const { conversationId, limit = 50, cursor } = filter;

      const isParticipant = await isConversationParticipant(conversationId, user.id);
      if (!isParticipant) {
        throw new Error("Access denied: You are not a participant in this conversation");
      }

      const take = Math.min(limit || 50, 100);

      const messages = await prisma.chatMessage.findMany({
        where: {
          conversationId,
        },
        include: {
          sender: true,
          receiver: true,
        },
        orderBy: { createdAt: "asc" },
        take: take + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      const hasMore = messages.length > take;
      const items = hasMore ? messages.slice(0, take) : messages;
      const total = await prisma.chatMessage.count({ where: { conversationId } });

      return {
        items,
        total,
        hasMore,
      };
    },

    getMessage: async (
      _: any,
      { id }: { id: string },
      context: any
    ) => {
      const user = requireAuth(context);

      const message = await prisma.chatMessage.findUnique({
        where: { id },
        include: {
          sender: true,
          receiver: true,
        },
      });

      if (!message) {
        throw new Error("Message not found");
      }

      const isParticipant = await isConversationParticipant(message.conversationId, user.id);
      if (!isParticipant) {
        throw new Error("Access denied: You are not authorized to view this message");
      }

      return message;
    },

    searchUsers: async (
      _: any,
      { query }: { query: string },
      context: any
    ) => {
      const user = requireAuth(context);
      if (!query || query.trim().length === 0) return [];

      return prisma.user.findMany({
        where: {
          AND: [
            { id: { not: user.id } },
            { isActive: true },
            {
              OR: [
                { username: { contains: query.trim(), mode: "insensitive" } },
                { email: { contains: query.trim(), mode: "insensitive" } },
              ],
            },
          ],
        },
        select: {
          id: true,
          email: true,
          username: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
        take: 20,
      });
    },
  },

  Mutation: {
    sendMessage: async (
      _: any,
      { input }: { input: CreateMessageInput },
      context: any
    ) => {
      const user = requireAuth(context);
      const { content, receiverId, conversationId } = input;

      if (!content || content.trim().length === 0) {
        throw new Error("Message content cannot be empty");
      }

      if (user.id === receiverId) {
        throw new Error("Cannot send a message to yourself");
      }

      let targetConversationId = conversationId;

      if (!targetConversationId) {
        // Find existing 1-on-1 conversation
        let conversation = await prisma.chatConversation.findFirst({
          where: {
            isActive: true,
            participants: {
              every: {
                userId: { in: [user.id, receiverId] },
              },
            },
          },
          include: { participants: true },
        });

        if (!conversation || conversation.participants.length !== 2) {
          conversation = await prisma.chatConversation.create({
            data: {
              participants: {
                create: [
                  { userId: user.id, isAdmin: true },
                  { userId: receiverId },
                ],
              },
            },
            include: { participants: true },
          });
        }
        targetConversationId = conversation.id;
      }

      const message = await prisma.chatMessage.create({
        data: {
          content: content.trim(),
          senderId: user.id,
          receiverId,
          conversationId: targetConversationId,
        },
        include: {
          sender: true,
          receiver: true,
        },
      });

      // Update conversation timestamp
      await prisma.chatConversation.update({
        where: { id: targetConversationId },
        data: { updatedAt: new Date() },
      });

      // Real-time broadcast
      await broadcastNewMessage(message);

      return message;
    },

    editMessage: async (
      _: any,
      { messageId, content }: { messageId: string; content: string },
      context: any
    ) => {
      const user = requireAuth(context);

      const message = await prisma.chatMessage.findUnique({ where: { id: messageId } });
      if (!message) throw new Error("Message not found");
      if (message.senderId !== user.id) throw new Error("You can only edit your own messages");
      if (message.isDeleted) throw new Error("Cannot edit a deleted message");

      const updated = await prisma.chatMessage.update({
        where: { id: messageId },
        data: {
          content: content.trim(),
          isEdited: true,
          updatedAt: new Date(),
        },
        include: {
          sender: true,
          receiver: true,
        },
      });

      await broadcastMessageEdited(updated);
      return updated;
    },

    deleteMessage: async (
      _: any,
      { messageId }: { messageId: string },
      context: any
    ) => {
      const user = requireAuth(context);

      const message = await prisma.chatMessage.findUnique({ where: { id: messageId } });
      if (!message) throw new Error("Message not found");
      if (message.senderId !== user.id) throw new Error("You can only delete your own messages");

      const deleted = await prisma.chatMessage.update({
        where: { id: messageId },
        data: {
          content: "This message was deleted",
          isDeleted: true,
          updatedAt: new Date(),
        },
        include: {
          sender: true,
          receiver: true,
        },
      });

      await broadcastMessageDeleted(deleted);
      return deleted;
    },

    markMessagesAsRead: async (
      _: any,
      { input }: { input: MarkMessagesAsReadInput },
      context: any
    ) => {
      const user = requireAuth(context);
      const { conversationId, messageIds } = input;

      const isParticipant = await isConversationParticipant(conversationId, user.id);
      if (!isParticipant) throw new Error("Access denied: You are not a participant in this conversation");

      await prisma.chatMessage.updateMany({
        where: {
          id: { in: messageIds },
          conversationId,
          receiverId: user.id,
          isRead: false,
        },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });

      await broadcastReadStatusUpdate(conversationId, user.id);
      return true;
    },

    markConversationAsRead: async (
      _: any,
      { conversationId }: { conversationId: string },
      context: any
    ) => {
      const user = requireAuth(context);

      const isParticipant = await isConversationParticipant(conversationId, user.id);
      if (!isParticipant) throw new Error("Access denied: You are not a participant in this conversation");

      await prisma.chatMessage.updateMany({
        where: {
          conversationId,
          receiverId: user.id,
          isRead: false,
        },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });

      await broadcastReadStatusUpdate(conversationId, user.id);
      return true;
    },

    createConversation: async (
      _: any,
      { participantId }: { participantId: string },
      context: any
    ) => {
      const user = requireAuth(context);

      let conversation = await prisma.chatConversation.findFirst({
        where: {
          isActive: true,
          participants: {
            every: {
              userId: { in: [user.id, participantId] },
            },
          },
        },
        include: {
          participants: {
            include: { user: true },
          },
        },
      });

      if (!conversation || conversation.participants.length !== 2) {
        conversation = await prisma.chatConversation.create({
          data: {
            participants: {
              create: [
                { userId: user.id, isAdmin: true },
                { userId: participantId },
              ],
            },
          },
          include: {
            participants: {
              include: { user: true },
            },
          },
        });
      }

      return conversation;
    },
  },

  Subscription: {
    messageAdded: {
      subscribe: (
        _: any,
        { conversationId }: { conversationId: string },
        context: any
      ) => {
        return pubSub.asyncIterator(`MESSAGE_ADDED:${conversationId}`);
      },
    },

    newMessage: {
      subscribe: (_: any, __: any, context: any) => {
        const user = requireAuth(context);
        return pubSub.asyncIterator(`NEW_MESSAGE:${user.id}`);
      },
    },

    messagesRead: {
      subscribe: (
        _: any,
        { conversationId }: { conversationId: string }
      ) => {
        return pubSub.asyncIterator(`MESSAGES_READ:${conversationId}`);
      },
    },

    typingStatus: {
      subscribe: (
        _: any,
        { conversationId }: { conversationId: string }
      ) => {
        return pubSub.asyncIterator(`TYPING_STATUS:${conversationId}`);
      },
    },
  },

  ChatMessage: {
    sender: async (parent: any) => {
      if (parent.sender) return parent.sender;
      return prisma.user.findUnique({ where: { id: parent.senderId } });
    },
    receiver: async (parent: any) => {
      if (parent.receiver) return parent.receiver;
      return prisma.user.findUnique({ where: { id: parent.receiverId } });
    },
  },

  ChatConversation: {
    participants: async (parent: any) => {
      if (parent.participants && parent.participants[0]?.user) {
        return parent.participants.map((p: any) => p.user);
      }
      const participants = await prisma.chatParticipant.findMany({
        where: { conversationId: parent.id, isActive: true },
        include: { user: true },
      });
      return participants.map((p) => p.user);
    },

    messages: async (parent: any, args: any) => {
      const { limit = 50, offset = 0 } = args;
      return prisma.chatMessage.findMany({
        where: { conversationId: parent.id },
        include: { sender: true, receiver: true },
        orderBy: { createdAt: "asc" },
        skip: offset,
        take: limit,
      });
    },

    lastMessage: async (parent: any) => {
      return prisma.chatMessage.findFirst({
        where: { conversationId: parent.id },
        include: { sender: true, receiver: true },
        orderBy: { createdAt: "desc" },
      });
    },

    unreadCount: async (parent: any, _: any, context: any) => {
      if (!context?.user?.id) return 0;
      return prisma.chatMessage.count({
        where: {
          conversationId: parent.id,
          isRead: false,
          receiverId: context.user.id,
        },
      });
    },
  },
};
