v# ElyChat API Documentation for Postman

## Table of Contents
1. [Overview](#overview)
2. [API Architecture](#api-architecture)
3. [Authentication Setup](#authentication-setup)
4. [REST API Endpoints](#rest-api-endpoints)
5. [GraphQL API Endpoints](#graphql-api-endpoints)
6. [WebSocket Subscriptions](#websocket-subscriptions)
7. [Error Handling](#error-handling)
8. [Pagination Examples](#pagination-examples)
9. [Postman Setup Guide](#postman-setup-guide)
10. [Testing Workflow](#testing-workflow)

## Overview

This document provides comprehensive documentation for the ElyChat API, which is a **hybrid REST + GraphQL API** designed specifically for testing with Postman. The API provides real-time chat functionality with user authentication, conversation management, and WebSocket subscriptions.

### Base URLs
- **REST Endpoints**: 
  - Auth: `http://localhost:3000/auth`
  - Chat: `http://localhost:3000/chat`
  - Health: `http://localhost:3000/health`
- **GraphQL Endpoint**: `http://localhost:3000/graphql`
- **WebSocket**: `http://localhost:3000/ws`

### API Features
- **Hybrid Architecture**: Both REST and GraphQL endpoints available
- **Authentication**: JWT-based authentication with access and refresh tokens
- **Real-time Messaging**: WebSocket subscriptions for live updates
- **Conversations**: 1-1 and group chat support
- **Message Status**: Read/unread tracking
- **Pagination**: Cursor-based and offset-based pagination
- **Error Handling**: Comprehensive error codes and messages

## API Architecture

The ElyChat API implements a hybrid architecture:

### REST Endpoints
- **Authentication**: `/auth/*` - User registration, login, token management
- **Chat Operations**: `/chat/*` - Conversation and message management
- **Health Checks**: `/health` - Service status monitoring

### GraphQL Endpoints
- **Chat Operations**: Full CRUD operations for conversations and messages
- **Real-time Subscriptions**: Live updates for messages and read status
- **Complex Queries**: Nested data retrieval with single requests

### WebSocket Support
- **Real-time Messaging**: Live message delivery
- **Status Updates**: Read status notifications
- **Connection Management**: WebSocket connection handling

## Authentication Setup

### JWT Token Structure
The API uses JWT tokens for authentication:
- **Access Token**: Expires in 15 minutes
- **Refresh Token**: Expires in 7 days
- **Token Format**: `Bearer {token}`

### Environment Variables for Postman
Create the following environment variables in Postman:

```json
{
  "base_url": "http://localhost:3000",
  "rest_auth_endpoint": "http://localhost:3000/auth",
  "rest_chat_endpoint": "http://localhost:3000/chat",
  "graphql_endpoint": "http://localhost:3000/graphql",
  "websocket_url": "http://localhost:3000/ws",
  "jwt_token": "",
  "refresh_token": "",
  "user_id": "",
  "user_email": ""
}
```

### Authentication Flow
1. **Register** a new user or **Login** with existing credentials using REST endpoints
2. **Extract JWT tokens** from the response
3. **Set environment variables** for subsequent requests
4. **Use Bearer token** in Authorization header for both REST and GraphQL protected operations

## REST API Endpoints

### Authentication Endpoints

#### 1. Register User
**Endpoint**: `POST /auth/register`

**Headers**:
```
Content-Type: application/json
```

**Body**:
```json
{
  "email": "user@example.com",
  "password": "password123",
  "username": "testuser"
}
```

**Response**:
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "username": "testuser",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z",
      "isActive": true
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

#### 2. Login User
**Endpoint**: `POST /auth/login`

**Headers**:
```
Content-Type: application/json
```

**Body**:
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "username": "testuser",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z",
      "isActive": true
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

#### 3. Refresh Access Token
**Endpoint**: `POST /auth/refresh-token`

**Headers**:
```
Content-Type: application/json
```

**Body**:
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response**:
```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

#### 4. Logout User
**Endpoint**: `POST /auth/logout`

**Headers**:
```
Content-Type: application/json
```

**Body**:
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response**:
```json
{
  "success": true,
  "message": "Logout successful",
  "data": null
}
```

#### 5. Get User Profile
**Endpoint**: `GET /auth/profile`

**Headers**:
```
Authorization: Bearer {accessToken}
Content-Type: application/json
```

**Response**:
```json
{
  "success": true,
  "message": "Profile retrieved successfully",
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "username": "testuser",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z",
    "isActive": true
  }
}
```

#### 6. Change Password
**Endpoint**: `POST /auth/change-password`

**Headers**:
```
Authorization: Bearer {accessToken}
Content-Type: application/json
```

**Body**:
```json
{
  "currentPassword": "oldpassword123",
  "newPassword": "newpassword123"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Password changed successfully",
  "data": null
}
```

### Chat Endpoints

#### 1. Get Conversations
**Endpoint**: `GET /chat/conversations`

**Headers**:
```
Authorization: Bearer {accessToken}
Content-Type: application/json
```

**Query Parameters**:
- `participantId` (optional): Filter by specific participant
- `limit` (optional): Number of items per page (max 100)
- `offset` (optional): Offset for pagination
- `cursor` (optional): Cursor for cursor-based pagination

**Response**:
```json
{
  "success": true,
  "message": "Conversations retrieved successfully",
  "data": {
    "items": [
      {
        "id": "conversation-id",
        "participants": [
          {
            "id": "user-id-1",
            "email": "user1@example.com",
            "username": "user1",
            "isActive": true
          },
          {
            "id": "user-id-2",
            "email": "user2@example.com",
            "username": "user2",
            "isActive": true
          }
        ],
        "messages": [
          {
            "id": "message-id",
            "content": "Hello there!",
            "createdAt": "2024-01-01T00:00:00.000Z",
            "isRead": true,
            "sender": {
              "id": "user-id-1",
              "email": "user1@example.com",
              "username": "user1"
            }
          }
        ],
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-01T00:00:00.000Z",
        "lastMessage": {
          "id": "message-id",
          "content": "Hello there!",
          "createdAt": "2024-01-01T00:00:00.000Z",
          "sender": {
            "id": "user-id-1",
            "username": "user1"
          }
        },
        "unreadCount": 3
      }
    ],
    "total": 1,
    "hasMore": false,
    "cursor": null
  }
}
```

#### 2. Get Conversation
**Endpoint**: `GET /chat/conversations/:id`

**Headers**:
```
Authorization: Bearer {accessToken}
Content-Type: application/json
```

**Path Parameters**:
- `id`: Conversation ID

**Response**:
```json
{
  "success": true,
  "message": "Conversation retrieved successfully",
  "data": {
    "id": "conversation-id",
    "participants": [
      {
        "id": "user-id-1",
        "email": "user1@example.com",
        "username": "user1",
        "isActive": true
      },
      {
        "id": "user-id-2",
        "email": "user2@example.com",
        "username": "user2",
        "isActive": true
      }
    ],
    "messages": [
      {
        "id": "message-id",
        "content": "Hello there!",
        "createdAt": "2024-01-01T00:00:00.000Z",
        "isRead": true,
        "sender": {
          "id": "user-id-1",
          "email": "user1@example.com",
          "username": "user1"
        }
      }
    ],
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

#### 3. Get Messages
**Endpoint**: `GET /chat/conversations/:id/messages`

**Headers**:
```
Authorization: Bearer {accessToken}
Content-Type: application/json
```

**Path Parameters**:
- `id`: Conversation ID

**Query Parameters**:
- `limit` (optional): Number of items per page (max 100)
- `offset` (optional): Offset for pagination
- `cursor` (optional): Cursor for cursor-based pagination

**Response**:
```json
{
  "success": true,
  "message": "Messages retrieved successfully",
  "data": {
    "items": [
      {
        "id": "message-id",
        "content": "Hello there!",
        "createdAt": "2024-01-01T00:00:00.000Z",
        "isRead": true,
        "sender": {
          "id": "user-id-1",
          "email": "user1@example.com",
          "username": "user1"
        }
      }
    ],
    "total": 1,
    "hasMore": false,
    "cursor": null
  }
}
```

#### 4. Get Message
**Endpoint**: `GET /chat/messages/:id`

**Headers**:
```
Authorization: Bearer {accessToken}
Content-Type: application/json
```

**Path Parameters**:
- `id`: Message ID

**Response**:
```json
{
  "success": true,
  "message": "Message retrieved successfully",
  "data": {
    "id": "message-id",
    "content": "Hello there!",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "isRead": true,
    "sender": {
      "id": "user-id-1",
      "email": "user1@example.com",
      "username": "user1"
    },
    "receiver": {
      "id": "user-id-2",
      "email": "user2@example.com",
      "username": "user2"
    },
    "conversation": {
      "id": "conversation-id",
      "participants": [
        {
          "id": "user-id-1",
          "username": "user1"
        },
        {
          "id": "user-id-2",
          "username": "user2"
        }
      ]
    }
  }
}
```

#### 5. Send Message
**Endpoint**: `POST /chat/messages`

**Headers**:
```
Authorization: Bearer {accessToken}
Content-Type: application/json
```

**Body**:
```json
{
  "content": "Hello! This is a test message.",
  "receiverId": "receiver-user-id",
  "conversationId": "optional-conversation-id"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Message sent successfully",
  "data": {
    "id": "message-id",
    "content": "Hello! This is a test message.",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "isRead": true,
    "sender": {
      "id": "sender-user-id",
      "email": "sender@example.com",
      "username": "sender"
    },
    "receiver": {
      "id": "receiver-user-id",
      "email": "receiver@example.com",
      "username": "receiver"
    },
    "conversation": {
      "id": "conversation-id",
      "participants": [
        {
          "id": "sender-user-id",
          "username": "sender"
        },
        {
          "id": "receiver-user-id",
          "username": "receiver"
        }
      ]
    }
  }
}
```

#### 6. Mark Messages as Read
**Endpoint**: `POST /chat/messages/read`

**Headers**:
```
Authorization: Bearer {accessToken}
Content-Type: application/json
```

**Body**:
```json
{
  "conversationId": "conversation-id",
  "messageIds": ["message-id-1", "message-id-2"]
}
```

**Response**:
```json
{
  "success": true,
  "message": "Messages marked as read successfully",
  "data": {
    "success": true
  }
}
```

#### 7. Create Conversation
**Endpoint**: `POST /chat/conversations`

**Headers**:
```
Authorization: Bearer {accessToken}
Content-Type: application/json
```

**Body**:
```json
{
  "participantId": "participant-user-id"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Conversation created successfully",
  "data": {
    "id": "conversation-id",
    "participants": [
      {
        "id": "current-user-id",
        "email": "current@example.com",
        "username": "currentuser",
        "isActive": true
      },
      {
        "id": "participant-user-id",
        "email": "participant@example.com",
        "username": "participant",
        "isActive": true
      }
    ],
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

## GraphQL API Endpoints

### GraphQL Schema Overview

#### Types
```graphql
type User {
  id: ID!
  email: String!
  username: String!
  createdAt: String!
  updatedAt: String!
  isActive: Boolean!
}

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

type ChatConversation {
  id: ID!
  participants: [User!]!
  messages: [ChatMessage!]!
  createdAt: String!
  updatedAt: String!
  lastMessage: ChatMessage
  unreadCount: Int!
}

type PaginatedResponse {
  items: [ChatConversation!]!
  total: Int!
  hasMore: Boolean!
  cursor: String
}
```

### GraphQL Operations

#### 1. Get Conversations (GraphQL)
**Endpoint**: `POST /graphql`

**Headers**:
```
Authorization: Bearer {accessToken}
Content-Type: application/json
```

**Body**:
```json
{
  "query": "query GetConversations($filter: ConversationFilterInput) { getConversations(filter: $filter) { items { id participants { id username email } lastMessage { id content createdAt sender { id username } } unreadCount createdAt updatedAt } total hasMore cursor } }",
  "variables": {
    "filter": {
      "limit": 20,
      "offset": 0,
      "participantId": "user-id-optional"
    }
  }
}
```

**Response**:
```json
{
  "data": {
    "getConversations": {
      "items": [
        {
          "id": "conversation-id",
          "participants": [
            {
              "id": "user-id-1",
              "username": "user1",
              "email": "user1@example.com"
            },
            {
              "id": "user-id-2",
              "username": "user2",
              "email": "user2@example.com"
            }
          ],
          "lastMessage": {
            "id": "message-id",
            "content": "Hello there!",
            "createdAt": "2024-01-01T00:00:00.000Z",
            "sender": {
              "id": "user-id-1",
              "username": "user1"
            }
          },
          "unreadCount": 3,
          "createdAt": "2024-01-01T00:00:00.000Z",
          "updatedAt": "2024-01-01T00:00:00.000Z"
        }
      ],
      "total": 1,
      "hasMore": false,
      "cursor": null
    }
  }
}
```

#### 2. Send Message (GraphQL)
**Endpoint**: `POST /graphql`

**Headers**:
```
Authorization: Bearer {accessToken}
Content-Type: application/json
```

**Body**:
```json
{
  "query": "mutation SendMessage($input: CreateMessageInput!) { sendMessage(input: $input) { id content createdAt isRead sender { id username email } receiver { id username email } conversation { id participants { id username } } } }",
  "variables": {
    "input": {
      "content": "Hello! This is a test message.",
      "receiverId": "receiver-user-id"
    }
  }
}
```

**Response**:
```json
{
  "data": {
    "sendMessage": {
      "id": "message-id",
      "content": "Hello! This is a test message.",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "isRead": true,
      "sender": {
        "id": "sender-user-id",
        "username": "sender",
        "email": "sender@example.com"
      },
      "receiver": {
        "id": "receiver-user-id",
        "username": "receiver",
        "email": "receiver@example.com"
      },
      "conversation": {
        "id": "conversation-id",
        "participants": [
          {
            "id": "sender-user-id",
            "username": "sender"
          },
          {
            "id": "receiver-user-id",
            "username": "receiver"
          }
        ]
      }
    }
  }
}
```

## WebSocket Subscriptions

### 1. Message Added Subscription
**Endpoint**: `ws://localhost:3000/ws`

**Subscription Query**:
```graphql
subscription MessageAdded($conversationId: ID!) {
  messageAdded(conversationId: $conversationId) {
    id
    content
    createdAt
    isRead
    sender {
      id
      username
      email
    }
    receiver {
      id
      username
      email
    }
  }
}
```

**Variables**:
```json
{
  "conversationId": "conversation-id"
}
```

### 2. New Message Subscription
**Subscription Query**:
```graphql
subscription NewMessage {
  newMessage {
    id
    content
    createdAt
    isRead
    sender {
      id
      username
      email
    }
    receiver {
      id
      username
      email
    }
    conversation {
      id
      participants {
        id
        username
      }
    }
  }
}
```

### 3. Messages Read Subscription
**Subscription Query**:
```graphql
subscription MessagesRead($conversationId: ID!) {
  messagesRead(conversationId: $conversationId) {
    id
    content
    createdAt
    isRead
    sender {
      id
      username
      email
    }
    receiver {
      id
      username
      email
    }
  }
}
```

**Variables**:
```json
{
  "conversationId": "conversation-id"
}
```

## Error Handling

### Error Response Format
```json
{
  "success": false,
  "message": "Error description",
  "data": null,
  "error": {
    "code": "ERROR_CODE",
    "details": "Detailed error information"
  }
}
```

### Common Error Codes

#### Authentication Errors
- `AUTH_REQUIRED`: Authentication token is required
- `INVALID_TOKEN`: JWT token is invalid or expired
- `USER_NOT_FOUND`: User does not exist
- `INVALID_CREDENTIALS`: Email or password is incorrect
- `ACCOUNT_DISABLED`: User account is disabled

#### Validation Errors
- `VALIDATION_ERROR`: Input validation failed
- `MISSING_REQUIRED_FIELD`: Required field is missing
- `INVALID_FIELD_FORMAT`: Field format is invalid
- `FIELD_TOO_LONG`: Field exceeds maximum length

#### Chat Errors
- `CONVERSATION_NOT_FOUND`: Conversation does not exist
- `MESSAGE_NOT_FOUND`: Message does not exist
- `ACCESS_DENIED`: User is not authorized to access resource
- `PARTICIPANT_NOT_FOUND`: Participant does not exist
- `CANNOT_MESSAGE_SELF`: Cannot send message to self

#### System Errors
- `INTERNAL_ERROR`: Unexpected server error
- `DATABASE_ERROR`: Database operation failed
- `WEBSOCKET_ERROR`: WebSocket operation failed

### Error Examples

#### Authentication Error
```json
{
  "success": false,
  "message": "Authorization token required",
  "data": null,
  "error": {
    "code": "AUTH_REQUIRED",
    "details": "No authorization header provided"
  }
}
```

#### Validation Error
```json
{
  "success": false,
  "message": "Message content is required and cannot be empty",
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "details": "Content field is required"
  }
}
```

#### Access Denied Error
```json
{
  "success": false,
  "message": "Access denied: You are not a participant in this conversation",
  "data": null,
  "error": {
    "code": "ACCESS_DENIED",
    "details": "User is not authorized to access this conversation"
  }
}
```

## Pagination Examples

### Cursor-based Pagination

#### First Page (REST)
```bash
GET /chat/conversations?limit=20
```

#### Next Page (REST)
```bash
GET /chat/conversations?limit=20&cursor=last-cursor-id
```

#### First Page (GraphQL)
```json
{
  "query": "query GetConversations { getConversations(filter: { limit: 20 }) { items { id participants { username } lastMessage { content } } total hasMore cursor } }"
}
```

#### Next Page (GraphQL)
```json
{
  "query": "query GetConversations { getConversations(filter: { limit: 20, cursor: \"last-cursor-id\" }) { items { id participants { username } lastMessage { content } } total hasMore cursor } }"
}
```

### Offset-based Pagination

#### First Page (REST)
```bash
GET /chat/conversations/123/messages?limit=50&offset=0
```

#### Next Page (REST)
```bash
GET /chat/conversations/123/messages?limit=50&offset=50
```

#### First Page (GraphQL)
```json
{
  "query": "query GetMessages { getMessages(filter: { conversationId: \"123\", limit: 50, offset: 0 }) { items { id content createdAt } total hasMore } }"
}
```

#### Next Page (GraphQL)
```json
{
  "query": "query GetMessages { getMessages(filter: { conversationId: \"123\", limit: 50, offset: 50 }) { items { id content createdAt } total hasMore } }"
}
```

## Postman Setup Guide

### 1. Create a New Collection
1. Open Postman
2. Click "New" → "Collection"
3. Name it "ElyChat API"
4. Add description: "Comprehensive testing for ElyChat hybrid REST + GraphQL API"

### 2. Configure Environment
1. Click the gear icon next to "No Environment"
2. Click "Add" → "Environment"
3. Name it "ElyChat Development"
4. Add the environment variables listed in the Authentication Setup section

### 3. Create Authentication Requests
Create the following requests in your collection:

#### Register User
- **Method**: POST
- **URL**: `{{base_url}}/auth/register`
- **Headers**: `Content-Type: application/json`
- **Body**: Raw JSON (register user data)

#### Login User
- **Method**: POST
- **URL**: `{{base_url}}/auth/login`
- **Headers**: `Content-Type: application/json`
- **Body**: Raw JSON (login credentials)
- **Tests**: Add tests to extract tokens and set environment variables

#### Refresh Token
- **Method**: POST
- **URL**: `{{base_url}}/auth/refresh-token`
- **Headers**: `Content-Type: application/json`
- **Body**: Raw JSON (refresh token)

### 4. Create REST API Requests
Create REST requests with the following structure:

#### Basic REST Request Template
```json
{
  "url": "{{base_url}}/endpoint",
  "method": "GET",
  "headers": {
    "Authorization": "Bearer {{jwt_token}}",
    "Content-Type": "application/json"
  }
}
```

### 5. Create GraphQL Requests
Create GraphQL requests with the following structure:

#### Basic GraphQL Request Template
```json
{
  "url": "{{graphql_endpoint}}",
  "method": "POST",
  "headers": {
    "Authorization": "Bearer {{jwt_token}}",
    "Content-Type": "application/json"
  },
  "body": {
    "query": "query { ... }",
    "variables": { ... }
  }
}
```

### 6. Add Pre-request Scripts
For authentication requests, add pre-request scripts to handle token extraction:

```javascript
// Example for login request
const jsonData = pm.response.json();
if (jsonData.success && jsonData.data) {
    pm.environment.set("jwt_token", jsonData.data.accessToken);
    pm.environment.set("refresh_token", jsonData.data.refreshToken);
    pm.environment.set("user_id", jsonData.data.user.id);
    pm.environment.set("user_email", jsonData.data.user.email);
}
```

### 7. Create Test Suites
Organize requests into folders:
- **Authentication**: Register, Login, Refresh, Logout
- **REST API**: All REST endpoints
- **GraphQL API**: All GraphQL operations
- **WebSocket**: WebSocket subscriptions
- **Error Handling**: Test error scenarios

## Testing Workflow

### 1. Initial Setup
1. **Register** a new user account using REST endpoint
2. **Login** to get authentication tokens using REST endpoint
3. **Set environment variables** with the obtained tokens
4. **Verify** user profile endpoint works (REST)
5. **Test** GraphQL endpoint with basic query

### 2. REST API Testing
1. **Test conversation endpoints**:
   - Get conversations with pagination
   - Get specific conversation
   - Create new conversation
2. **Test message endpoints**:
   - Send messages via REST
   - Get messages with pagination
   - Mark messages as read
3. **Test error scenarios**:
   - Invalid tokens
   - Missing required fields
   - Unauthorized access

### 3. GraphQL API Testing
1. **Test complex queries**:
   - Get conversations with nested data
   - Get messages with sender/receiver info
   - Test pagination in GraphQL
2. **Test mutations**:
   - Send message via GraphQL
   - Mark messages as read via GraphQL
   - Create conversation via GraphQL
3. **Test subscriptions**:
   - Set up GraphQL subscriptions
   - Verify real-time updates

### 4. WebSocket Testing
1. **Connect to WebSocket** endpoint
2. **Subscribe to message updates**
3. **Send messages** from another client
4. **Verify real-time updates** are received
5. **Test subscription error handling**

### 5. Hybrid API Testing
1. **Test both REST and GraphQL** for same operations
2. **Compare response formats** and performance
3. **Test authentication flow** across both APIs
4. **Verify data consistency** between REST and GraphQL

### 6. Error Handling Testing
1. **Test invalid tokens** in both REST and GraphQL
2. **Test missing required fields** in both APIs
3. **Test unauthorized access** to other users' data
4. **Test invalid IDs and formats** in both APIs

### 7. Performance Testing
1. **Test pagination limits** (max 100 items)
2. **Test concurrent requests** across both APIs
3. **Test WebSocket connections** under load
4. **Monitor response times** for REST vs GraphQL

## Best Practices

### Security
- Always use HTTPS in production
- Store tokens securely in environment variables
- Rotate refresh tokens regularly
- Implement proper token expiration
- Validate all input data

### Performance
- Use cursor-based pagination for large datasets
- Implement proper error handling
- Monitor WebSocket connections
- Optimize database queries
- Cache frequently accessed data

### Testing
- Test both happy paths and error scenarios
- Validate all input fields
- Test authentication flows thoroughly
- Verify real-time features work correctly
- Test both REST and GraphQL endpoints

### Monitoring
- Log all authentication attempts
- Monitor API response times
- Track WebSocket connection status
- Set up alerts for error rates
- Monitor database performance

---

This documentation provides everything needed to successfully test the ElyChat hybrid REST + GraphQL API using Postman. Follow the setup guide and testing workflow to ensure comprehensive coverage of all API features.