# Chat Module

This module provides comprehensive chat functionality for the ElyLiteChat application, including both REST API endpoints and GraphQL operations.

## Features

- **REST API**: Full RESTful API for chat operations
- **GraphQL API**: GraphQL schema and resolvers for flexible queries
- **Real-time messaging**: Send and receive messages in real-time
- **Conversations**: Manage conversations between users
- **Message status**: Track read/unread message status
- **Subscriptions**: Real-time updates for new messages and read status
- **Authentication**: JWT-based authentication for all operations
- **Error handling**: Comprehensive error handling and validation

## REST API

The chat module provides a comprehensive REST API for all chat operations.

### Authentication

All REST API endpoints require JWT authentication via the `Authorization` header:

```
Authorization: Bearer <your-jwt-token>
```

### Endpoints

#### GET /api/chat/conversations
Get all conversations for the current user.

**Query Parameters:**
- `participantId` (optional): Filter by specific participant
- `limit` (optional): Maximum number of results (default: 20, max: 100)
- `cursor` (optional): Pagination cursor for cursor-based pagination

**Response:**
```json
{
  "success": true,
  "message": "Conversations retrieved successfully",
  "data": {
    "items": [
      {
        "id": "conversation-id",
        "participants": [...],
        "lastMessage": {...},
        "unreadCount": 0
      }
    ],
    "total": 10,
    "hasMore": false,
    "cursor": null
  }
}
```

#### GET /api/chat/conversations/:id
Get a specific conversation by ID.

**Response:**
```json
{
  "success": true,
  "message": "Conversation retrieved successfully",
  "data": {
    "id": "conversation-id",
    "participants": [...],
    "messages": [...]
  }
}
```

#### GET /api/chat/conversations/:id/messages
Get messages for a specific conversation.

**Query Parameters:**
- `limit` (optional): Maximum number of results (default: 50, max: 100)
- `cursor` (optional): Pagination cursor for cursor-based pagination

**Response:**
```json
{
  "success": true,
  "message": "Messages retrieved successfully",
  "data": {
    "items": [...],
    "total": 25,
    "hasMore": false,
    "cursor": null
  }
}
```

#### GET /api/chat/messages/:id
Get a specific message by ID.

**Response:**
```json
{
  "success": true,
  "message": "Message retrieved successfully",
  "data": {
    "id": "message-id",
    "content": "Hello there!",
    "sender": {...},
    "receiver": {...},
    "createdAt": "2023-01-01T00:00:00.000Z"
  }
}
```

#### POST /api/chat/messages
Send a new message.

**Request Body:**
```json
{
  "content": "Hello there!",
  "receiverId": "user-id-123",
  "conversationId": "optional-conversation-id"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Message sent successfully",
  "data": {
    "id": "message-id",
    "content": "Hello there!",
    "sender": {...},
    "receiver": {...},
    "createdAt": "2023-01-01T00:00:00.000Z"
  }
}
```

#### POST /api/chat/messages/read
Mark messages as read.

**Request Body:**
```json
{
  "conversationId": "conversation-id",
  "messageIds": ["message-id-1", "message-id-2"]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Messages marked as read successfully",
  "data": {
    "success": true
  }
}
```

#### POST /api/chat/conversations
Create a new conversation.

**Request Body:**
```json
{
  "participantId": "user-id-123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Conversation created successfully",
  "data": {
    "id": "conversation-id",
    "participants": [...]
  }
}
```

#### GET /api/chat/health
Check chat service health status.

**Response:**
```json
{
  "success": true,
  "message": "Chat service is running",
  "data": {
    "timestamp": "2023-01-01T00:00:00.000Z",
    "service": "chat service",
    "uptime_sec": 123,
    "pid": 12345
  }
}
```

## GraphQL Schema

### Types

#### User
Represents a user in the chat system.

**Fields:**
- `id: ID!` - Unique identifier
- `email: String!` - User's email address
- `username: String!` - User's username
- `createdAt: String!` - Creation timestamp
- `updatedAt: String!` - Last update timestamp
- `isActive: Boolean!` - Account status

#### ChatMessage
Represents a chat message between users.

**Fields:**
- `id: ID!` - Unique identifier
- `content: String!` - Message content
- `senderId: ID!` - ID of the message sender
- `receiverId: ID!` - ID of the message receiver
- `sender: User!` - Sender user object
- `receiver: User!` - Receiver user object
- `createdAt: String!` - Message creation timestamp
- `updatedAt: String!` - Message update timestamp
- `isRead: Boolean!` - Read status

#### ChatConversation
Represents a conversation between users.

**Fields:**
- `id: ID!` - Unique identifier
- `participants: [User!]!` - List of conversation participants
- `messages: [ChatMessage!]!` - List of messages in the conversation
- `createdAt: String!` - Conversation creation timestamp
- `updatedAt: String!` - Conversation update timestamp
- `lastMessage: ChatMessage` - Most recent message in the conversation
- `unreadCount: Int!` - Number of unread messages

### Inputs

#### CreateMessageInput
Input for creating a new message.

**Fields:**
- `content: String!` - Message content
- `receiverId: ID!` - ID of the message receiver

#### MarkMessagesAsReadInput
Input for marking messages as read.

**Fields:**
- `conversationId: ID!` - ID of the conversation
- `messageIds: [ID!]!` - List of message IDs to mark as read

#### ConversationFilterInput
Input for filtering conversations.

**Fields:**
- `participantId: ID` - Filter by participant ID
- `limit: Int` - Maximum number of results
- `offset: Int` - Number of results to skip

#### MessageFilterInput
Input for filtering messages.

**Fields:**
- `conversationId: ID!` - ID of the conversation
- `limit: Int` - Maximum number of results
- `offset: Int` - Number of results to skip

## Operations

### Queries

#### getConversations
Get all conversations for the current user.

**Arguments:**
- `filter: ConversationFilterInput` - Optional filter parameters

**Returns:** `[ChatConversation!]!`

#### getConversation
Get a specific conversation by ID.

**Arguments:**
- `id: ID!` - Conversation ID

**Returns:** `ChatConversation`

#### getMessages
Get messages for a specific conversation.

**Arguments:**
- `filter: MessageFilterInput` - Filter parameters

**Returns:** `[ChatMessage!]!`

#### getMessage
Get a specific message by ID.

**Arguments:**
- `id: ID!` - Message ID

**Returns:** `ChatMessage`

### Mutations

#### sendMessage
Send a new message to another user.

**Arguments:**
- `input: CreateMessageInput!` - Message input data

**Returns:** `ChatMessage`

#### markMessagesAsRead
Mark messages as read in a conversation.

**Arguments:**
- `input: MarkMessagesAsReadInput!` - Read status input data

**Returns:** `Boolean`

#### createConversation
Create a new conversation (if needed).

**Arguments:**
- `participantId: ID!` - ID of the participant

**Returns:** `ChatConversation`

### Subscriptions

#### messageAdded
Receive real-time messages in a specific conversation.

**Arguments:**
- `conversationId: ID!` - Conversation ID

**Returns:** `ChatMessage`

#### newMessage
Receive real-time messages for all user conversations.

**Returns:** `ChatMessage`

#### messagesRead
Receive updates when messages are marked as read.

**Arguments:**
- `conversationId: ID!` - Conversation ID

**Returns:** `ChatMessage`

## Usage Examples

### Sending a Message

```graphql
mutation {
  sendMessage(input: {
    content: "Hello there!",
    receiverId: "user-id-123"
  }) {
    id
    content
    sender {
      id
      username
    }
    receiver {
      id
      username
    }
    createdAt
  }
}
```

### Getting Conversations

```graphql
query {
  getConversations {
    id
    participants {
      id
      username
    }
    lastMessage {
      id
      content
      createdAt
    }
    unreadCount
  }
}
```

### Subscribing to New Messages

```graphql
subscription {
  newMessage {
    id
    content
    sender {
      id
      username
    }
    createdAt
  }
}
```

## Implementation Notes

### Architecture

The chat module follows a clean architecture pattern with:

- **Controller Layer**: Handles HTTP requests and responses ([`chat.controller.ts`](./chat.controller.ts))
- **Service Layer**: Contains business logic and database operations ([`chat.service.ts`](./chat.service.ts))
- **Routes**: Defines REST API endpoints ([`chat.routes.ts`](./chat.routes.ts))
- **Module**: Provides dependency injection configuration ([`chat.module.ts`](./chat.module.ts))
- **GraphQL**: Schema and resolvers for GraphQL operations ([`schema.ts`](./schema.ts), [`resolvers.ts`](./resolvers.ts))
- **WebSocket**: Real-time communication support ([`websocket.ts`](./websocket.ts))

### Database Schema

The chat functionality uses the following Prisma models:

- **User**: Core user information
- **ChatConversation**: Represents conversations between users
- **ChatParticipant**: Manages user participation in conversations
- **ChatMessage**: Stores individual messages with read status

### Authentication & Security

- JWT-based authentication for all REST API endpoints
- Authorization checks to ensure users can only access their own conversations
- Input validation and sanitization
- Custom error handling with proper error codes

### Error Handling

The module implements comprehensive error handling with:

- Custom error classes: `ChatError`, `ValidationError`, `AuthorizationError`, `NotFoundError`
- Proper HTTP status codes and error responses
- Detailed error information for debugging
- Graceful degradation for edge cases

### Real-time Features

- WebSocket support for real-time messaging
- GraphQL subscriptions for live updates
- Message status tracking (read/unread)
- Connection management for multiple users

### Pagination

- Cursor-based pagination for better performance
- Offset-based pagination as fallback
- Configurable page sizes with reasonable limits
- Proper metadata for pagination state

### Testing

The module has been tested for:

- Integration with the main application
- Proper error handling and validation
- Database operations and relationships
- Authentication and authorization
- API endpoint functionality