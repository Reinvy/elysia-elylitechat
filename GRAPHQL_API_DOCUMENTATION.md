# ElyChat GraphQL API Documentation for Postman

## Table of Contents
1. [Overview](#overview)
2. [Authentication Setup](#authentication-setup)
3. [GraphQL Schema Reference](#graphql-schema-reference)
4. [Authentication Operations](#authentication-operations)
5. [Chat Operations](#chat-operations)
6. [Subscription Operations](#subscription-operations)
7. [Error Handling](#error-handling)
8. [Pagination Examples](#pagination-examples)
9. [Postman Setup Guide](#postman-setup-guide)
10. [Testing Workflow](#testing-workflow)

## Overview

This document provides comprehensive documentation for the ElyChat GraphQL API, designed specifically for testing with Postman. The API provides real-time chat functionality with user authentication, conversation management, and WebSocket subscriptions.

### Base URL
- **GraphQL Endpoint**: `http://localhost:3000/graphql`
- **REST Endpoints**: 
  - Auth: `http://localhost:3000/auth`
  - Chat: `http://localhost:3000/chat`

### API Features
- **Authentication**: JWT-based authentication with access and refresh tokens
- **Real-time Messaging**: WebSocket subscriptions for live updates
- **Conversations**: 1-1 and group chat support
- **Message Status**: Read/unread tracking
- **Pagination**: Cursor-based and offset-based pagination
- **Error Handling**: Comprehensive error codes and messages

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
  "graphql_endpoint": "http://localhost:3000/graphql",
  "auth_endpoint": "http://localhost:3000/auth",
  "chat_endpoint": "http://localhost:3000/chat",
  "jwt_token": "",
  "refresh_token": "",
  "user_id": "",
  "user_email": ""
}
```

### Authentication Flow
1. **Register** a new user or **Login** with existing credentials
2. **Extract JWT tokens** from the response
3. **Set environment variables** for subsequent requests
4. **Use Bearer token** in Authorization header for protected operations

## GraphQL Schema Reference

### Types

#### User
```graphql
type User {
  id: ID!
  email: String!
  username: String!
  createdAt: String!
  updatedAt: String!
  isActive: Boolean!
}
```

#### ChatMessage
```graphql
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
```

#### ChatConversation
```graphql
type ChatConversation {
  id: ID!
  participants: [User!]!
  messages: [ChatMessage!]!
  createdAt: String!
  updatedAt: String!
  lastMessage: ChatMessage
  unreadCount: Int!
}
```

#### PaginatedResponse
```graphql
type PaginatedResponse {
  items: [ChatConversation!]!
  total: Int!
  hasMore: Boolean!
}
```

### Inputs

#### CreateMessageInput
```graphql
input CreateMessageInput {
  content: String!
  receiverId: ID!
}
```

#### MarkMessagesAsReadInput
```graphql
input MarkMessagesAsReadInput {
  conversationId: ID!
  messageIds: [ID!]!
}
```

#### ConversationFilterInput
```graphql
input ConversationFilterInput {
  participantId: ID
  limit: Int
  offset: Int
  cursor: ID
}
```

#### MessageFilterInput
```graphql
input MessageFilterInput {
  conversationId: ID!
  limit: Int
  offset: Int
  cursor: ID
}
```

## Authentication Operations

### 1. Register User

**REST Endpoint**: `POST /auth/register`

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

### 2. Login User

**REST Endpoint**: `POST /auth/login`

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

### 3. Refresh Access Token

**REST Endpoint**: `POST /auth/refresh-token`

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

### 4. Logout User

**REST Endpoint**: `POST /auth/logout`

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

### 5. Get User Profile

**REST Endpoint**: `GET /auth/profile`

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

## Chat Operations

### 1. Get Conversations

**GraphQL Query**:
```graphql
query GetConversations($filter: ConversationFilterInput) {
  getConversations(filter: $filter) {
    items {
      id
      participants {
        id
        username
        email
      }
      lastMessage {
        id
        content
        createdAt
        sender {
          id
          username
        }
      }
      unreadCount
      createdAt
      updatedAt
    }
    total
    hasMore
    cursor
  }
}
```

**Variables**:
```json
{
  "filter": {
    "limit": 20,
    "offset": 0,
    "participantId": "user-id-optional"
  }
}
```

**Headers**:
```
Authorization: Bearer {accessToken}
Content-Type: application/json
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

### 2. Get Conversation

**GraphQL Query**:
```graphql
query GetConversation($id: ID!) {
  getConversation(id: $id) {
    id
    participants {
      id
      username
      email
    }
    messages {
      id
      content
      createdAt
      isRead
      sender {
        id
        username
      }
    }
    unreadCount
    createdAt
    updatedAt
  }
}
```

**Variables**:
```json
{
  "id": "conversation-id"
}
```

**Headers**:
```
Authorization: Bearer {accessToken}
Content-Type: application/json
```

### 3. Get Messages

**GraphQL Query**:
```graphql
query GetMessages($filter: MessageFilterInput) {
  getMessages(filter: $filter) {
    items {
      id
      content
      createdAt
      isRead
      sender {
        id
        username
        email
      }
    }
    total
    hasMore
    cursor
  }
}
```

**Variables**:
```json
{
  "filter": {
    "conversationId": "conversation-id",
    "limit": 50,
    "offset": 0,
    "cursor": null
  }
}
```

**Headers**:
```
Authorization: Bearer {accessToken}
Content-Type: application/json
```

### 4. Get Message

**GraphQL Query**:
```graphql
query GetMessage($id: ID!) {
  getMessage(id: $id) {
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

**Variables**:
```json
{
  "id": "message-id"
}
```

**Headers**:
```
Authorization: Bearer {accessToken}
Content-Type: application/json
```

### 5. Send Message

**GraphQL Mutation**:
```graphql
mutation SendMessage($input: CreateMessageInput!) {
  sendMessage(input: $input) {
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

**Variables**:
```json
{
  "input": {
    "content": "Hello! This is a test message.",
    "receiverId": "receiver-user-id"
  }
}
```

**Headers**:
```
Authorization: Bearer {accessToken}
Content-Type: application/json
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

### 6. Mark Messages as Read

**GraphQL Mutation**:
```graphql
mutation MarkMessagesAsRead($input: MarkMessagesAsReadInput!) {
  markMessagesAsRead(input: $input)
}
```

**Variables**:
```json
{
  "input": {
    "conversationId": "conversation-id",
    "messageIds": ["message-id-1", "message-id-2"]
  }
}
```

**Headers**:
```
Authorization: Bearer {accessToken}
Content-Type: application/json
```

**Response**:
```json
{
  "data": {
    "markMessagesAsRead": true
  }
}
```

### 7. Create Conversation

**GraphQL Mutation**:
```graphql
mutation CreateConversation($participantId: ID!) {
  createConversation(participantId: $participantId) {
    id
    participants {
      id
      username
      email
    }
    createdAt
    updatedAt
  }
}
```

**Variables**:
```json
{
  "participantId": "participant-user-id"
}
```

**Headers**:
```
Authorization: Bearer {accessToken}
Content-Type: application/json
```

## Subscription Operations

### 1. Message Added Subscription

**GraphQL Subscription**:
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

**Headers**:
```
Authorization: Bearer {accessToken}
Content-Type: application/json
```

### 2. New Message Subscription

**GraphQL Subscription**:
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

**Headers**:
```
Authorization: Bearer {accessToken}
Content-Type: application/json
```

### 3. Messages Read Subscription

**GraphQL Subscription**:
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

**Headers**:
```
Authorization: Bearer {accessToken}
Content-Type: application/json
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

#### First Page
```graphql
query GetConversations {
  getConversations(filter: {
    limit: 20
  }) {
    items {
      id
      participants {
        username
      }
      lastMessage {
        content
      }
    }
    total
    hasMore
    cursor
  }
}
```

#### Next Page
```graphql
query GetConversations {
  getConversations(filter: {
    limit: 20,
    cursor: "last-cursor-id"
  }) {
    items {
      id
      participants {
        username
      }
      lastMessage {
        content
      }
    }
    total
    hasMore
    cursor
  }
}
```

### Offset-based Pagination

#### First Page
```graphql
query GetMessages {
  getMessages(filter: {
    conversationId: "conversation-id",
    limit: 50,
    offset: 0
  }) {
    items {
      id
      content
      createdAt
    }
    total
    hasMore
  }
}
```

#### Next Page
```graphql
query GetMessages {
  getMessages(filter: {
    conversationId: "conversation-id",
    limit: 50,
    offset: 50
  }) {
    items {
      id
      content
      createdAt
    }
    total
    hasMore
  }
}
```

## Postman Setup Guide

### 1. Create a New Collection
1. Open Postman
2. Click "New" → "Collection"
3. Name it "ElyChat GraphQL API"
4. Add description: "Comprehensive testing for ElyChat GraphQL API"

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

### 4. Create GraphQL Requests
Create GraphQL requests with the following structure:

#### Basic GraphQL Request Template
```json
{
  "query": "query { ... }",
  "variables": { ... }
}
```

#### Headers for Protected Requests
```
Authorization: Bearer {{jwt_token}}
Content-Type: application/json
```

### 5. Add Pre-request Scripts
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

### 6. Create Test Suites
Organize requests into folders:
- **Authentication**: Register, Login, Refresh, Logout
- **Chat Operations**: Get Conversations, Get Messages, Send Message
- **Subscriptions**: Real-time subscriptions
- **Error Handling**: Test error scenarios

## Testing Workflow

### 1. Initial Setup
1. **Register** a new user account
2. **Login** to get authentication tokens
3. **Set environment variables** with the obtained tokens
4. **Verify** user profile endpoint works

### 2. Chat Functionality Testing
1. **Create conversations** with other users
2. **Send messages** and verify delivery
3. **Test pagination** with different page sizes
4. **Verify read status** updates
5. **Test error scenarios** (invalid IDs, unauthorized access)

### 3. Real-time Features Testing
1. **Set up subscriptions** in Postman
2. **Send messages** from another client
3. **Verify real-time updates** are received
4. **Test read status subscriptions**

### 4. Error Handling Testing
1. **Test invalid tokens** and expired tokens
2. **Test missing required fields**
3. **Test unauthorized access** to other users' data
4. **Test invalid IDs and formats**

### 5. Performance Testing
1. **Test pagination limits** (max 100 items)
2. **Test concurrent requests**
3. **Test WebSocket connections**
4. **Monitor response times**

## Best Practices

### Security
- Always use HTTPS in production
- Store tokens securely in environment variables
- Rotate refresh tokens regularly
- Implement proper token expiration

### Performance
- Use cursor-based pagination for large datasets
- Implement proper error handling
- Monitor WebSocket connections
- Optimize database queries

### Testing
- Test both happy paths and error scenarios
- Validate all input fields
- Test authentication flows thoroughly
- Verify real-time features work correctly

### Monitoring
- Log all authentication attempts
- Monitor API response times
- Track WebSocket connection status
- Set up alerts for error rates

---

This documentation provides everything needed to successfully test the ElyChat GraphQL API using Postman. Follow the setup guide and testing workflow to ensure comprehensive coverage of all API features.