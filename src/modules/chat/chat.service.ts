import { prisma } from "../../config/db";
import { claimDedupe } from "../../redis.js";

const SOCIAL_TYPES = new Set(["feed_share", "reels_share", "live_invite"]);

// Custom error classes for better error handling
export class ChatError extends Error {
  constructor(message: string, public code: string = 'CHAT_ERROR') {
    super(message);
    this.name = 'ChatError';
  }
}

export class ValidationError extends ChatError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class AuthorizationError extends ChatError {
  constructor(message: string) {
    super(message, 'AUTHORIZATION_ERROR');
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends ChatError {
  constructor(message: string) {
    super(message, 'NOT_FOUND_ERROR');
    this.name = 'NotFoundError';
  }
}

export interface CreateMessageInput {
  content?: string;
  type?: string;
  receiverId: string;
  conversationId?: string;
  clientMsgId?: string;
  ciphertext?: string;
  fallback_text?: string;
  fallback_metadata?: Record<string, unknown>;
  ctaLabel?: string;
  ctaUrl?: string;
}

export interface MarkMessagesAsReadInput {
  conversationId: string;
  messageIds: string[];
}

export interface ConversationFilterInput {
  participantId?: string;
  limit?: number;
  offset?: number;
  cursor?: string;
}

export interface MessageFilterInput {
  conversationId: string;
  limit?: number;
  offset?: number;
  cursor?: string;
}

export interface PaginationResult<T> {
  items: T[];
  total: number;
  hasMore: boolean;
  cursor?: string | undefined;
}

export class ChatService {
  // Helper function to check if user is participant in conversation
  private async isConversationParticipant(conversationId: string, userId: string): Promise<boolean> {
    const participant = await prisma.chatParticipant.findUnique({
      where: {
        userId_conversationId: {
          userId,
          conversationId
        }
      }
    });
    return !!participant;
  }

  // Get all conversations for the current user
  async getConversations(userId: string, filter?: ConversationFilterInput): Promise<PaginationResult<any>> {
    const { participantId, limit = 20, cursor } = filter || {};

    // Validate input
    if (!userId || typeof userId !== 'string') {
      throw new ValidationError('User ID is required and must be a string');
    }

    try {
      const whereClause: any = {
        isActive: true,
        participants: {
          some: {
            userId,
            isActive: true
          }
        }
      };

      // Filter by specific participant if provided
      if (participantId) {
        whereClause.participants = {
          some: [
            {
              userId,
              isActive: true
            },
            {
              userId: participantId,
              isActive: true
            }
          ]
        };
      }

      const orderBy = {
        updatedAt: 'desc' as const
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
                    isActive: true
                  }
                }
              }
            },
            messages: {
              orderBy: {
                createdAt: 'desc'
              },
              take: 1
            }
          },
          orderBy,
          cursor: {
            id: cursor
          },
          take: take + 1 // Get one extra to check if there are more items
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
                    isActive: true
                  }
                }
              }
            },
            messages: {
              orderBy: {
                createdAt: 'desc'
              },
              take: 1
            }
          },
          orderBy,
          take
        });
      }

      // Calculate unread count for each conversation
      const conversationsWithUnreadCount = await Promise.all(
        conversations.map(async (conversation: any) => {
          const unreadCount = await prisma.chatMessage.count({
            where: {
              conversationId: conversation.id,
              isRead: false,
              receiverId: userId
            }
          });

          const lastMessage = conversation.messages[0] || null;
          
          return {
            ...conversation,
            unreadCount,
            lastMessage
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
        where: whereClause
      });

      return {
        items: conversationsWithUnreadCount,
        total,
        hasMore: cursor ? conversations.length === take : false,
        cursor: newCursor
      };
    } catch (error) {
      if (error instanceof ChatError) {
        throw error;
      }
      throw new ChatError('Failed to fetch conversations');
    }
  }

  // Get a specific conversation by ID
  async getConversation(conversationId: string, userId: string): Promise<any> {
    try {
      const conversation = await prisma.chatConversation.findUnique({
        where: { id: conversationId },
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  username: true,
                  isActive: true
                }
              }
            }
          },
          messages: {
            orderBy: {
              createdAt: 'asc'
            },
            include: {
              sender: {
                select: {
                  id: true,
                  email: true,
                  username: true
                }
              }
            }
          }
        }
      });

      if (!conversation) {
        throw new Error('Conversation not found');
      }

      // Check if user is a participant
      const isParticipant = await this.isConversationParticipant(conversationId, userId);
      if (!isParticipant) {
        throw new Error('Access denied: You are not a participant in this conversation');
      }

      return conversation;
    } catch (error) {
      if (error instanceof ChatError) {
        throw error;
      }
      throw new ChatError('Failed to fetch conversation');
    }
  }

  // Get messages for a specific conversation
  async getMessages(conversationId: string, userId: string, filter?: MessageFilterInput): Promise<PaginationResult<any>> {
    const { limit = 50, cursor } = filter || {};

    try {
      // Check if user is a participant in the conversation
      const isParticipant = await this.isConversationParticipant(conversationId, userId);
      if (!isParticipant) {
        throw new Error('Access denied: You are not a participant in this conversation');
      }

      const orderBy = {
        createdAt: 'asc' as const
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
            OR: [
              { senderId: userId },
              { receiverId: userId }
            ]
          },
          include: {
            sender: {
              select: {
                id: true,
                email: true,
                username: true
              }
            }
          },
          orderBy,
          cursor: {
            id: cursor
          },
          take: take + 1 // Get one extra to check if there are more items
        });
      } else {
        // Offset-based pagination (fallback)
        messages = await prisma.chatMessage.findMany({
          where: {
            conversationId,
            // Only show messages where user is either sender or receiver
            OR: [
              { senderId: userId },
              { receiverId: userId }
            ]
          },
          include: {
            sender: {
              select: {
                id: true,
                email: true,
                username: true
              }
            }
          },
          orderBy,
          take
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
          OR: [
            { senderId: userId },
            { receiverId: userId }
          ]
        }
      });

      return {
        items: messages,
        total,
        hasMore: cursor ? messages.length === take : false,
        cursor: newCursor
      };
    } catch (error) {
      if (error instanceof ChatError) {
        throw error;
      }
      throw new ChatError('Failed to fetch messages');
    }
  }

  // Get a specific message by ID
  async getMessage(messageId: string, userId: string): Promise<any> {
    try {
      const message = await prisma.chatMessage.findUnique({
        where: { id: messageId },
        include: {
          sender: {
            select: {
              id: true,
              email: true,
              username: true
            }
          },
          receiver: {
            select: {
              id: true,
              email: true,
              username: true
            }
          },
          conversation: {
            include: {
              participants: {
                include: {
                  user: {
                    select: {
                      id: true,
                      email: true,
                      username: true
                    }
                  }
                }
              }
            }
          }
        }
      });

      if (!message) {
        throw new Error('Message not found');
      }

      // Check if user is authorized to view this message
      const isAuthorized = message.senderId === userId ||
                         message.receiverId === userId;
      if (!isAuthorized) {
        throw new Error('Access denied: You are not authorized to view this message');
      }

      return message;
    } catch (error) {
      if (error instanceof ChatError) {
        throw error;
      }
      throw new ChatError('Failed to fetch message');
    }
  }

  // Send a new message (idempotent on clientMsgId; E2EE ciphertext-only allowed)
  async sendMessage(userId: string, input: CreateMessageInput): Promise<any> {
    const { content, receiverId, conversationId } = input;

    // Validate input
    if (!userId || typeof userId !== 'string') {
      throw new ValidationError('User ID is required and must be a string');
    }

    const text = content?.trim() ?? '';
    if (!text && !input.ciphertext) {
      throw new ValidationError('Message content or ciphertext is required');
    }

    if (text.length > 10000) {
      throw new ValidationError('Message content cannot exceed 10000 characters');
    }

    const wireType = (input.type || "text").toLowerCase();
    const messageType = wireType.toUpperCase() as
      | "TEXT" | "IMAGE" | "FILE" | "VOICE" | "SYSTEM"
      | "FEED_SHARE" | "REELS_SHARE" | "LIVE_INVITE" | "STORY_REPLY" | "BOT_CARD";
    if (!["TEXT","IMAGE","FILE","VOICE","SYSTEM","FEED_SHARE","REELS_SHARE","LIVE_INVITE","STORY_REPLY","BOT_CARD"].includes(messageType)) {
      throw new ValidationError(`Unknown message type: ${input.type}`);
    }
    if (SOCIAL_TYPES.has(wireType) && !input.fallback_text?.trim()) {
      const err = new ValidationError(`fallback_text is required for ${input.type}`);
      (err as { code?: string }).code = 'MISSING_FALLBACK';
      throw err;
    }

    if (!receiverId || typeof receiverId !== 'string') {
      throw new ValidationError('Receiver ID is required and must be a string');
    }

    // Idempotent replay: same clientMsgId returns the original row.
    if (input.clientMsgId) {
      const existing = await prisma.chatMessage.findUnique({
        where: { clientMsgId: input.clientMsgId },
      });
      if (existing) return existing;
      await claimDedupe(input.clientMsgId).catch(() => false);
    }

    if (conversationId && typeof conversationId !== 'string') {
      throw new ValidationError('Conversation ID must be a string if provided');
    }

    try {
      // Check if receiver exists
      const receiver = await prisma.user.findUnique({
        where: { id: receiverId }
      });

      if (!receiver) {
        throw new NotFoundError('Receiver not found');
      }

      // Check if user is trying to message themselves
      if (userId === receiverId) {
        throw new ValidationError('Cannot send a message to yourself');
      }

      let targetConversationId = conversationId;

      // If no conversationId is provided, find or create conversation
      if (!targetConversationId) {
        let conversation = await prisma.chatConversation.findFirst({
          where: {
            isActive: true,
            participants: {
              every: {
                userId: {
                  in: [userId, receiverId]
                }
              }
            }
          },
          include: {
            participants: true
          }
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
                    userId,
                    isAdmin: true
                  },
                  {
                    userId: receiverId
                  }
                ]
              }
            },
            include: {
              participants: {
                include: {
                  user: {
                    select: {
                      id: true,
                      email: true,
                      username: true
                    }
                  }
                }
              }
            }
          });
        }

        targetConversationId = conversation.id;
      }

      // Create the message
      const message = await prisma.chatMessage.create({
        data: {
          ...(text ? { content: text } : {}),
          type: messageType,
          senderId: userId,
          receiverId,
          conversationId: targetConversationId,
          ...(input.clientMsgId ? { clientMsgId: input.clientMsgId } : {}),
          ...(input.ciphertext ? { ciphertext: input.ciphertext } : {}),
          ...(input.fallback_text ? { fallbackText: input.fallback_text } : {}),
          ...(input.fallback_metadata ? { fallbackMeta: JSON.parse(JSON.stringify(input.fallback_metadata)) } : {}),
          ...(input.ctaLabel ? { ctaLabel: input.ctaLabel } : {}),
          ...(input.ctaUrl ? { ctaUrl: input.ctaUrl } : {}),
        },
        include: {
          sender: {
            select: {
              id: true,
              email: true,
              username: true
            }
          }
        }
      });

      // Mark message as read for the sender
      await prisma.chatMessage.update({
        where: { id: message.id },
        data: { isRead: true }
      });

      return message;
    } catch (error) {
      if (error instanceof ChatError) {
        throw error;
      }
      throw new ChatError('Failed to send message');
    }
  }

  // Mark messages as read
  async markMessagesAsRead(userId: string, input: MarkMessagesAsReadInput): Promise<boolean> {
    const { conversationId, messageIds } = input;

    try {
      // Check if user is a participant in the conversation
      const isParticipant = await this.isConversationParticipant(conversationId, userId);
      if (!isParticipant) {
        throw new Error('Access denied: You are not a participant in this conversation');
      }

      // Validate message IDs
      if (!messageIds || messageIds.length === 0) {
        throw new Error('No message IDs provided');
      }

      // Update messages as read
      const result = await prisma.chatMessage.updateMany({
        where: {
          id: {
            in: messageIds
          },
          receiverId: userId,
          isRead: false
        },
        data: {
          isRead: true,
          readAt: new Date()
        }
      });

      return result.count > 0;
    } catch (error) {
      if (error instanceof ChatError) {
        throw error;
      }
      throw new ChatError('Failed to mark messages as read');
    }
  }

  // Create a new conversation
  async createConversation(userId: string, participantId: string): Promise<any> {
    try {
      // Validate participant ID
      if (!participantId) {
        throw new Error('Participant ID is required');
      }

      // Check if participant exists
      const participant = await prisma.user.findUnique({
        where: { id: participantId }
      });

      if (!participant) {
        throw new Error('Participant not found');
      }

      // Check if conversation already exists
      const existingConversation = await prisma.chatConversation.findFirst({
        where: {
          isActive: true,
          participants: {
            every: {
              userId: {
                in: [userId, participantId]
              }
            },
          }
        }
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
                userId,
                isAdmin: true
              },
              {
                userId: participantId
              }
            ]
          }
        },
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  username: true,
                  isActive: true
                }
              }
            }
          }
        }
      });

      return conversation;
    } catch (error) {
      if (error instanceof ChatError) {
        throw error;
      }
      throw new ChatError('Failed to create conversation');
    }
  }

  // Edit message
  async editMessage(userId: string, messageId: string, newContent: string): Promise<any> {
    if (!messageId || typeof messageId !== 'string') {
      throw new ValidationError('Message ID is required');
    }
    if (!newContent?.trim()) {
      throw new ValidationError('Message content cannot be empty');
    }

    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId }
    });

    if (!message) {
      throw new NotFoundError('Message not found');
    }

    if (message.senderId !== userId) {
      throw new AuthorizationError('You can only edit your own messages');
    }

    if (message.isDeleted) {
      throw new ValidationError('Cannot edit a deleted message');
    }

    const updated = await prisma.chatMessage.update({
      where: { id: messageId },
      data: {
        content: newContent.trim(),
        isEdited: true,
        updatedAt: new Date()
      },
      include: {
        sender: {
          select: {
            id: true,
            email: true,
            username: true
          }
        }
      }
    });

    return updated;
  }

  // Delete message (soft delete)
  async deleteMessage(userId: string, messageId: string): Promise<any> {
    if (!messageId || typeof messageId !== 'string') {
      throw new ValidationError('Message ID is required');
    }

    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId }
    });

    if (!message) {
      throw new NotFoundError('Message not found');
    }

    if (message.senderId !== userId) {
      throw new AuthorizationError('You can only delete your own messages');
    }

    const deleted = await prisma.chatMessage.update({
      where: { id: messageId },
      data: {
        content: "This message was deleted",
        isDeleted: true,
        updatedAt: new Date()
      },
      include: {
        sender: {
          select: {
            id: true,
            email: true,
            username: true
          }
        }
      }
    });

    return deleted;
  }

  // Mark all messages in a conversation as read
  async markConversationAsRead(userId: string, conversationId: string): Promise<boolean> {
    if (!conversationId || typeof conversationId !== 'string') {
      throw new ValidationError('Conversation ID is required');
    }

    const isParticipant = await this.isConversationParticipant(conversationId, userId);
    if (!isParticipant) {
      throw new AuthorizationError('Access denied: You are not a participant in this conversation');
    }

    await prisma.chatMessage.updateMany({
      where: {
        conversationId,
        receiverId: userId,
        isRead: false
      },
      data: {
        isRead: true,
        readAt: new Date()
      }
    });

    return true;
  }

  // Search users for starting conversations
  async searchUsers(query: string, currentUserId?: string): Promise<any[]> {
    if (!query || query.trim().length === 0) {
      return [];
    }

    const users = await prisma.user.findMany({
      where: {
        AND: [
          currentUserId ? { id: { not: currentUserId } } : {},
          { isActive: true },
          {
            OR: [
              { username: { contains: query.trim(), mode: 'insensitive' } },
              { email: { contains: query.trim(), mode: 'insensitive' } }
            ]
          }
        ]
      },
      select: {
        id: true,
        username: true,
        email: true,
        isActive: true,
        createdAt: true
      },
      take: 20
    });

    return users;
  }

  // Get missed messages for client replay on reconnection
  async getMissedMessages(userId: string, since: Date): Promise<any[]> {
    return prisma.chatMessage.findMany({
      where: {
        conversation: {
          participants: {
            some: {
              userId,
              isActive: true
            }
          }
        },
        createdAt: {
          gt: since
        }
      },
      include: {
        sender: {
          select: {
            id: true,
            email: true,
            username: true
          }
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    });
  }

  // Get health status
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
}

export const chatService = new ChatService();