import { gql } from "@elysiajs/apollo";

export const chatTypeDefs = gql`
  """
  Represents a user in the chat system
  """
  type User {
    id: ID!
    email: String!
    username: String!
    createdAt: String!
    updatedAt: String!
    isActive: Boolean!
  }

  """
  Represents a chat message between users
  """
  type ChatMessage {
    id: ID!
    content: String!
    senderId: ID!
    receiverId: ID!
    sender: User!
    receiver: User!
    createdAt: String!
    updatedAt: String!
    isRead: Boolean!
  }

  """
  Represents a conversation between two or more users
  """
  type ChatConversation {
    id: ID!
    participants: [User!]!
    messages: [ChatMessage!]!
    createdAt: String!
    updatedAt: String!
    lastMessage: ChatMessage
    unreadCount: Int!
  }

  """
  Input for creating a new message
  """
  input CreateMessageInput {
    content: String!
    receiverId: ID!
  }

  """
  Input for marking messages as read
  """
  input MarkMessagesAsReadInput {
    conversationId: ID!
    messageIds: [ID!]!
  }

  """
  Input for filtering conversations
  """
  input ConversationFilterInput {
    participantId: ID
    limit: Int
    offset: Int
    cursor: ID
  }

  """
  Input for filtering messages in a conversation
  """
  input MessageFilterInput {
    conversationId: ID!
    limit: Int
    offset: Int
    cursor: ID
  }

  """
  Response for paginated results
  """
  type PaginatedResponse {
    items: [ChatConversation!]!
    total: Int!
    hasMore: Boolean!
  }

  """
  Query operations for chat functionality
  """
  type Query {
    """
    Get all conversations for the current user
    """
    getConversations(filter: ConversationFilterInput): PaginatedResponse!

    """
    Get a specific conversation by ID
    """
    getConversation(id: ID!): ChatConversation

    """
    Get messages for a specific conversation
    """
    getMessages(filter: MessageFilterInput): PaginatedResponse!

    """
    Get a specific message by ID
    """
    getMessage(id: ID!): ChatMessage
  }

  """
  Mutation operations for chat functionality
  """
  type Mutation {
    """
    Send a new message to another user
    """
    sendMessage(input: CreateMessageInput!): ChatMessage!

    """
    Mark messages as read in a conversation
    """
    markMessagesAsRead(input: MarkMessagesAsReadInput!): Boolean!

    """
    Create a new conversation (if needed)
    """
    createConversation(participantId: ID!): ChatConversation!
  }

  """
  Subscription operations for real-time updates
  """
  type Subscription {
    """
    Receive real-time messages in a specific conversation
    """
    messageAdded(conversationId: ID!): ChatMessage!

    """
    Receive real-time messages for all user conversations
    """
    newMessage: ChatMessage!

    """
    Receive updates when messages are marked as read
    """
    messagesRead(conversationId: ID!): ChatMessage!
  }
`;
