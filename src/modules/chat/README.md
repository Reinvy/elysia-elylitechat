# Chat Module

> **UPDATE 2026-09:** GraphQL/Apollo removed — REST + Eden Treaty + WS (Redis pub/sub).
> Canonical specs: root `docs/technical/api_spec.md`, `docs/technical/websocket_events.md`.

This module provides comprehensive chat functionality for the ElyLiteChat application via REST API endpoints with Eden Treaty end-to-end types.

## Features

- **REST API**: Full RESTful API for chat operations
- **Eden Treaty RPC**: End-to-end typed client from `export type App` (replaces GraphQL)
- **Real-time messaging**: Send and receive messages in real-time (WS + Redis `room:<id>`)
- **Conversations**: Manage conversations between users
- **Message status**: Track delivered/read receipts (lean payloads)
- **Events**: `chat:new/delivered/read/typing` over WebSocket (no GraphQL subscriptions)
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

## Eden Treaty Typed RPC (replaces GraphQL — removed 2026-09)

> `schema.ts` / `resolvers.ts` (GraphQL/Apollo) are deprecated and pending deletion
> (`AGENTS.md` Phase 6). All operations below are available as REST + Eden Treaty
> typed calls via `treaty<App>` — canonical contract: root `docs/technical/api_spec.md`.

### Queries (Eden)

- `conversations` — list user conversations (`GET /chat/conversations`, cursor pagination)
- `conversation(id)` — conversation details + participants
- `messages(conversationId, limit, before/after)` — history (`GET /chat/conversations/:id/messages`)
- `me` — authenticated profile (`GET /auth/me`, see auth module)

### Mutations (Eden)

- `createConversation(participantIds, title?)` — `POST /chat/conversations`
- `sendMessage(conversationId, content, clientMsgId)` — `POST /chat/messages`
  (idempotent via `clientMsgId`; persist-before-publish)
- `markAsRead(messageId)` / `markConversationAsRead(conversationId)` — receipts

### Real-time (WebSocket, not GraphQL subscriptions)

- `chat:new{roomId}` — new messages (Redis `room:<id>` fan-out)
- `chat:delivered` / `chat:read` — receipts (lean `{m,r,u,t}` payloads)
- `chat:typing` — typing indicator (3s Redis debounce)
- `reconnect{since}` / `missed` — missed-message replay

See root `docs/technical/websocket_events.md` for the canonical event table.

## Implementation Notes

### Architecture

The chat module follows a clean architecture pattern with:

- **Controller Layer**: Handles HTTP requests and responses ([`chat.controller.ts`](./chat.controller.ts))
- **Service Layer**: Contains business logic and database operations ([`chat.service.ts`](./chat.service.ts))
- **Routes**: Defines REST API endpoints ([`chat.routes.ts`](./chat.routes.ts))
- **Module**: Provides dependency injection configuration ([`chat.module.ts`](./chat.module.ts))
- **Typed RPC**: Eden Treaty types from the exported `App` (replaces GraphQL [`schema.ts`](./schema.ts), [`resolvers.ts`](./resolvers.ts) — deprecated, pending deletion)
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

- WebSocket support for real-time messaging (Redis pub/sub fan-out)
- WS events for live updates (no GraphQL subscriptions)
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