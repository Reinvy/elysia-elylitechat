import { prisma } from "../../config/db.js";
import {
  pubSub,
  broadcastToConversationParticipants,
  broadcastNewMessage,
  broadcastReadStatusUpdate,
} from "./websocket.js";

// Context type definition for GraphQL resolvers
// export interface ChatContext {
//   user: {
//     id: string;
//     email: string;
//     username: string;
//   } | null;
//   request: String | null;
// }

// Input types for better type safety
interface CreateMessageInput {
  content: string;
  receiverId: string;
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

interface PaginationArgs {
  limit?: number;
  offset?: number;
  cursor?: string;
}

interface PaginatedResult<T> {
  items: T[];
  total: number;
  hasMore: boolean;
  cursor?: string;
}

// Helper function to validate user authentication
// const requireAuth = (context: any): void => {
//   if (!context.user) {
//     throw new Error("Authentication required");
//   }
// };

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
  return !!participant;
};

export const chatResolvers = {
  Query: {
    getConversations: async (
      _: any,
      { filter }: { filter?: ConversationFilterInput },
      context: any
    ) => {
      // requireAuth(context);

      const { participantId, limit = 20, cursor } = filter || {};
      const currentUserId = context.user!.id;

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

        // Filter by specific participant if provided
        if (participantId) {
          whereClause.participants = {
            some: [
              {
                userId: currentUserId,
                isActive: true,
              },
              {
                userId: participantId,
                isActive: true,
              },
            ],
          };
        }

        const orderBy = {
          updatedAt: "desc" as const,
        };

        const take = Math.min(limit || 20, 100); // Limit max to 100 items

        let conversations;
        let newCursor: string | undefined;

        if (cursor) {
          // Cursor-based pagination
          conversations = await prisma.chatConversation.findMany({
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
                orderBy: {
                  createdAt: "desc",
                },
                take: 1,
              },
            },
            orderBy,
            cursor: {
              id: cursor,
            },
            take: take + 1, // Get one extra to check if there are more items
          });
        } else {
          // Offset-based pagination (fallback)
          conversations = await prisma.chatConversation.findMany({
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
                orderBy: {
                  createdAt: "desc",
                },
                take: 1,
              },
            },
            orderBy,
            take,
          });
        }

        // Calculate unread count for each conversation
        const conversationsWithUnreadCount = await Promise.all(
          conversations.map(async (conversation: any) => {
            const unreadCount = await prisma.chatMessage.count({
              where: {
                conversationId: conversation.id,
                isRead: false,
                receiverId: currentUserId,
              },
            });

            const lastMessage = conversation.messages[0] || null;

            return {
              ...conversation,
              unreadCount,
              lastMessage,
            };
          })
        );

        // Check if there are more items for cursor pagination
        if (cursor && conversations.length > take) {
          conversations = conversations.slice(0, -1); // Remove the extra item
          newCursor = conversations[conversations.length - 1]?.id;
        }

        // Get total count for pagination info
        const total = await prisma.chatConversation.count({
          where: whereClause,
        });

        return {
          items: conversationsWithUnreadCount,
          total,
          hasMore: cursor ? conversations.length === take : false,
          cursor: newCursor,
        };
      } catch (error) {
        console.error("Error fetching conversations:", error);
        throw new Error("Failed to fetch conversations");
      }
    },

    getConversation: async (_: any, { id }: { id: string }, context: any) => {
      // requireAuth(context);

      try {
        const conversation = await prisma.chatConversation.findUnique({
          where: { id },
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
              orderBy: {
                createdAt: "asc",
              },
              include: {
                sender: {
                  select: {
                    id: true,
                    email: true,
                    username: true,
                  },
                },
              },
            },
          },
        });

        if (!conversation) {
          throw new Error("Conversation not found");
        }

        // Check if user is a participant
        const isParticipant = await isConversationParticipant(
          id,
          context.user!.id
        );
        if (!isParticipant) {
          throw new Error(
            "Access denied: You are not a participant in this conversation"
          );
        }

        return conversation;
      } catch (error) {
        console.error("Error fetching conversation:", error);
        throw new Error("Failed to fetch conversation");
      }
    },

    getMessages: async (
      _: any,
      { filter }: { filter: MessageFilterInput },
      context: any
    ) => {
      // requireAuth(context);

      const { conversationId, limit = 50, cursor } = filter;
      const currentUserId = context.user!.id;

      try {
        // Check if user is a participant in the conversation
        const isParticipant = await isConversationParticipant(
          conversationId,
          currentUserId
        );
        if (!isParticipant) {
          throw new Error(
            "Access denied: You are not a participant in this conversation"
          );
        }

        const orderBy = {
          createdAt: "asc" as const,
        };

        const take = Math.min(limit || 50, 100); // Limit max to 100 items

        let messages;
        let newCursor: string | undefined;

        if (cursor) {
          // Cursor-based pagination
          messages = await prisma.chatMessage.findMany({
            where: {
              conversationId,
              // Only show messages where user is either sender or receiver
              OR: [{ senderId: currentUserId }, { receiverId: currentUserId }],
            },
            include: {
              sender: {
                select: {
                  id: true,
                  email: true,
                  username: true,
                },
              },
            },
            orderBy,
            cursor: {
              id: cursor,
            },
            take: take + 1, // Get one extra to check if there are more items
          });
        } else {
          // Offset-based pagination (fallback)
          messages = await prisma.chatMessage.findMany({
            where: {
              conversationId,
              // Only show messages where user is either sender or receiver
              OR: [{ senderId: currentUserId }, { receiverId: currentUserId }],
            },
            include: {
              sender: {
                select: {
                  id: true,
                  email: true,
                  username: true,
                },
              },
            },
            orderBy,
            take,
          });
        }

        // Check if there are more items for cursor pagination
        if (cursor && messages.length > take) {
          messages = messages.slice(0, -1); // Remove the extra item
          newCursor = messages[messages.length - 1]?.id;
        }

        // Get total count for pagination info
        const total = await prisma.chatMessage.count({
          where: {
            conversationId,
            // Only count messages where user is either sender or receiver
            OR: [{ senderId: currentUserId }, { receiverId: currentUserId }],
          },
        });

        return {
          items: messages,
          total,
          hasMore: cursor ? messages.length === take : false,
          cursor: newCursor,
        };
      } catch (error) {
        console.error("Error fetching messages:", error);
        throw new Error("Failed to fetch messages");
      }
    },

    getMessage: async (_: any, { id }: { id: string }, context: any) => {
      // requireAuth(context);

      try {
        const message = await prisma.chatMessage.findUnique({
          where: { id },
          include: {
            sender: {
              select: {
                id: true,
                email: true,
                username: true,
              },
            },
            receiver: {
              select: {
                id: true,
                email: true,
                username: true,
              },
            },
            conversation: {
              include: {
                participants: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        email: true,
                        username: true,
                      },
                    },
                  },
                },
              },
            },
          },
        });

        if (!message) {
          throw new Error("Message not found");
        }

        // Check if user is authorized to view this message
        const isAuthorized =
          message.senderId === context.user!.id ||
          message.receiverId === context.user!.id;
        if (!isAuthorized) {
          throw new Error(
            "Access denied: You are not authorized to view this message"
          );
        }

        return message;
      } catch (error) {
        console.error("Error fetching message:", error);
        throw new Error("Failed to fetch message");
      }
    },
  },

  Mutation: {
    sendMessage: async (
      _: any,
      { input }: { input: CreateMessageInput },
      context: any
    ) => {
      console.log("sendMessage called with input:", input);
      console.log("context:", context.user);
      // requireAuth(context);

      const { content, receiverId } = input;
      const senderId = context.user!.id;

      try {
        // Validate input
        if (!content?.trim()) {
          throw new Error("Message content is required");
        }

        // Check if receiver exists
        const receiver = await prisma.user.findUnique({
          where: { id: receiverId },
        });

        if (!receiver) {
          throw new Error("Receiver not found");
        }

        // Find or create conversation between sender and receiver
        let conversation = await prisma.chatConversation.findFirst({
          where: {
            isActive: true,
            participants: {
              every: {
                userId: {
                  in: [senderId, receiverId],
                },
              },
            },
          },
          include: {
            participants: true,
          },
        });

        // Check if it's a 1-1 conversation
        const isOneOnOne = conversation?.participants.length === 2;
        if (!isOneOnOne) {
          conversation = null;
        }

        // Create conversation if it doesn't exist
        if (!conversation) {
          conversation = await prisma.chatConversation.create({
            data: {
              participants: {
                create: [
                  {
                    userId: senderId,
                    isAdmin: true,
                  },
                  {
                    userId: receiverId,
                  },
                ],
              },
            },
            include: {
              participants: {
                include: {
                  user: {
                    select: {
                      id: true,
                      email: true,
                      username: true,
                    },
                  },
                },
              },
            },
          });
        }

        // Create the message
        const message = await prisma.chatMessage.create({
          data: {
            content: content.trim(),
            senderId,
            receiverId,
            conversationId: conversation.id,
          },
          include: {
            sender: {
              select: {
                id: true,
                email: true,
                username: true,
              },
            },
          },
        });

        // Mark message as read for the sender
        await prisma.chatMessage.update({
          where: { id: message.id },
          data: { isRead: true },
        });

        // Broadcast the message to conversation participants
        broadcastToConversationParticipants(conversation.id, message, senderId);

        // Publish to pub/sub for GraphQL subscriptions
        pubSub.publish(`MESSAGE_ADDED:${conversation.id}`, message);
        pubSub.publish(`NEW_MESSAGE:${senderId}`, message);

        return message;
      } catch (error) {
        console.error("Error sending message:", error);
        throw new Error("Failed to send message");
      }
    },

    markMessagesAsRead: async (
      _: any,
      { input }: { input: MarkMessagesAsReadInput },
      context: any
    ) => {
      // requireAuth(context);

      const { conversationId, messageIds } = input;
      const currentUserId = context.user!.id;

      try {
        // Check if user is a participant in the conversation
        const isParticipant = await isConversationParticipant(
          conversationId,
          currentUserId
        );
        if (!isParticipant) {
          throw new Error(
            "Access denied: You are not a participant in this conversation"
          );
        }

        // Validate message IDs
        if (!messageIds || messageIds.length === 0) {
          throw new Error("No message IDs provided");
        }

        // Update messages as read
        const result = await prisma.chatMessage.updateMany({
          where: {
            id: {
              in: messageIds,
            },
            receiverId: currentUserId,
            isRead: false,
          },
          data: {
            isRead: true,
            readAt: new Date(),
          },
        });

        // Broadcast read status update to conversation participants
        if (result.count > 0) {
          messageIds.forEach((messageId) => {
            broadcastReadStatusUpdate(conversationId, messageId, currentUserId);
            pubSub.publish(`MESSAGES_READ:${conversationId}`, {
              messageId,
              conversationId,
              userId: currentUserId,
              timestamp: new Date().toISOString(),
            });
          });
        }

        return result.count > 0;
      } catch (error) {
        console.error("Error marking messages as read:", error);
        throw new Error("Failed to mark messages as read");
      }
    },

    createConversation: async (
      _: any,
      { participantId }: { participantId: string },
      context: any
    ) => {
      // requireAuth(context);

      const currentUserId = context.user!.id;

      try {
        // Validate participant ID
        if (!participantId) {
          throw new Error("Participant ID is required");
        }

        // Check if participant exists
        const participant = await prisma.user.findUnique({
          where: { id: participantId },
        });

        if (!participant) {
          throw new Error("Participant not found");
        }

        // Check if conversation already exists
        const existingConversation = await prisma.chatConversation.findFirst({
          where: {
            isActive: true,
            participants: {
              every: {
                userId: {
                  in: [currentUserId, participantId],
                },
              },
            },
          },
        });

        if (existingConversation) {
          return existingConversation;
        }

        // Create new conversation
        const conversation = await prisma.chatConversation.create({
          data: {
            participants: {
              create: [
                {
                  userId: currentUserId,
                  isAdmin: true,
                },
                {
                  userId: participantId,
                },
              ],
            },
          },
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
          },
        });

        return conversation;
      } catch (error) {
        console.error("Error creating conversation:", error);
        throw new Error("Failed to create conversation");
      }
    },
  },

  Subscription: {
    messageAdded: {
      subscribe: (
        _: any,
        { conversationId }: { conversationId: string },
        context: any
      ) => {
        // requireAuth(context);

        // Check if user is a participant in the conversation
        return pubSub.asyncIterator(`MESSAGE_ADDED:${conversationId}`);
      },
    },

    newMessage: {
      subscribe: (_: any, __: any, context: any) => {
        // requireAuth(context);

        // Subscribe to all messages where the user is either sender or receiver
        return pubSub.asyncIterator(`NEW_MESSAGE:${context.user!.id}`);
      },
    },

    messagesRead: {
      subscribe: (
        _: any,
        { conversationId }: { conversationId: string },
        context: any
      ) => {
        // requireAuth(context);

        // Check if user is a participant in the conversation
        return pubSub.asyncIterator(`MESSAGES_READ:${conversationId}`);
      },
    },
  },

  // Custom resolvers for nested fields
  ChatMessage: {
    sender: async (parent: any, _: any, context: any) => {
      // requireAuth(context);

      try {
        const sender = await prisma.user.findUnique({
          where: { id: parent.senderId },
          select: {
            id: true,
            email: true,
            username: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
          },
        });
        return sender;
      } catch (error) {
        console.error("Error fetching sender:", error);
        return null;
      }
    },

    receiver: async (parent: any, _: any, context: any) => {
      // requireAuth(context);

      try {
        const receiver = await prisma.user.findUnique({
          where: { id: parent.receiverId },
          select: {
            id: true,
            email: true,
            username: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
          },
        });
        return receiver;
      } catch (error) {
        console.error("Error fetching receiver:", error);
        return null;
      }
    },
  },

  ChatConversation: {
    participants: async (parent: any, _: any, context: any) => {
      // requireAuth(context);

      try {
        const participants = await prisma.chatParticipant.findMany({
          where: {
            conversationId: parent.id,
            isActive: true,
          },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                username: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
        });
        return participants.map((p: any) => p.user);
      } catch (error) {
        console.error("Error fetching participants:", error);
        return [];
      }
    },

    messages: async (parent: any, args: any, context: any) => {
      // requireAuth(context);

      try {
        const { limit = 50, offset = 0 } = args;

        const messages = await prisma.chatMessage.findMany({
          where: {
            conversationId: parent.id,
          },
          include: {
            sender: {
              select: {
                id: true,
                email: true,
                username: true,
              },
            },
          },
          orderBy: {
            createdAt: "asc",
          },
          skip: offset,
          take: limit,
        });
        return messages;
      } catch (error) {
        console.error("Error fetching messages:", error);
        return [];
      }
    },

    lastMessage: async (parent: any, _: any, context: any) => {
      // requireAuth(context);

      try {
        const lastMessage = await prisma.chatMessage.findFirst({
          where: {
            conversationId: parent.id,
          },
          include: {
            sender: {
              select: {
                id: true,
                email: true,
                username: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        });
        return lastMessage;
      } catch (error) {
        console.error("Error fetching last message:", error);
        return null;
      }
    },

    unreadCount: async (parent: any, _: any, context: any) => {
      // requireAuth(context);

      try {
        const currentUserId = context.user!.id;
        const unreadCount = await prisma.chatMessage.count({
          where: {
            conversationId: parent.id,
            isRead: false,
            receiverId: currentUserId,
          },
        });
        return unreadCount;
      } catch (error) {
        console.error("Error counting unread messages:", error);
        return 0;
      }
    },
  },
};
