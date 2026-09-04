# Product Requirements Document (PRD): ElyLiteChat

> **SUPERSEDES NOTICE (2026-09):** Dokumen ini adalah arsip PRD layanan Lite.
> Spesifikasi produk terkini ada di root **`docs/prd/prd_elylitechat.md`**,
> kontrak API di **`docs/technical/api_spec.md`**, event WS di
> **`docs/technical/websocket_events.md`**, dan model data di
> **`docs/technical/data_models.md`**. Jika ada konflik, root `docs/` menang.
> Perubahan mengikat sejak 2026-09: **GraphQL/Apollo dihapus → Eden Treaty**,
> **Redis single-node wajib** (aturan lama tanpa-Redis dicabut), **ORM tetap Prisma**.

---

## Document Metadata
- **Project Name**: ElyLiteChat (Lite Edition)
- **Version**: 1.0.0
- **Status**: Approved / In Development
- **Target Audience**: Developers, Small Teams, Embedded Chat Integrations, Micro-Communities
- **Primary Runtime**: Bun (>= 1.0.0)
- **Framework**: ElysiaJS
- **Author**: ElyChat Product & Engineering Team

---

## 1. Executive Summary & Product Vision

### 1.1 Product Overview
**ElyLiteChat** is a lightweight, high-performance, developer-centric chat backend built with **ElysiaJS** and **Bun**. It is designed to offer a complete yet frictionless messaging solution without the operational complexity of distributed enterprise infrastructure.

ElyLiteChat combines the simplicity of **REST APIs** with end-to-end type safety via
**Eden Treaty** and real-time streaming over **WebSockets** (backed by single-node Redis pub/sub).

### 1.2 Core Value Proposition
- **Zero-Fuss Deployment**: Single service architecture that runs on minimal resource footprints (can run seamlessly on a 512MB RAM VPS) plus single-node Redis/Dragonfly for pub/sub.
- **Typed API Architecture**: Access chat data via RESTful OpenAPI routes with Eden Treaty typed RPC (`treaty<App>`) and WebSocket events. (GraphQL/Apollo removed 2026-09 — see supersedes notice.)
- **Type-Safe Ecosystem**: End-to-end type safety using Prisma ORM and Prismabox (TypeBox auto-generation for Elysia).
- **Fast Developer Onboarding**: Minimal dependencies: PostgreSQL + single-node Redis; no mandatory Redis clusters, S3 buckets, or message brokers needed for standard operations.

### 1.3 Target Personas
1. **Full-Stack Developers / Indie Hackers**: Looking for a drop-in real-time chat backend for web or mobile apps.
2. **Small-to-Medium Businesses (SMBs)**: Needing simple 1-on-1 and team communication capabilities without heavy infrastructure costs.
3. **App Integrators**: Developers embedding lightweight customer support or community chat widgets into existing platforms.

---

## 2. Technical Architecture & Stack

```mermaid
graph TD
    Client["Web / Mobile / Postman Client"]
    
    subgraph "ElyLiteChat Monolithic Application (Bun Runtime)"
        Elysia["ElysiaJS Core Server"]
        
        subgraph "API Layer"
            OpenAPI["OpenAPI / Swagger REST Engine"]
            Eden["Eden Treaty Typed RPC"]
            WS["WebSocket Handler + Redis Pub/Sub"]
        end
        
        subgraph "Business Logic Modules"
            AuthMod["Auth Service"]
            ChatMod["Chat Service"]
        end
        
        subgraph "Data Access"
            PrismaClient["Prisma ORM + Prismabox"]
        end
    end
    
    subgraph "Persistence"
        DB[("PostgreSQL / SQLite Database")]
        Redis[("Redis single-node (pub/sub, presence, rate-limit)")]
    end
    
    Client -->|HTTP REST| OpenAPI
    Client -->|Typed RPC| Eden
    Client -->|WS Connect| WS
    
    OpenAPI --> AuthMod
    OpenAPI --> ChatMod
    Eden --> ChatMod
    WS --> ChatMod
    WS --> Redis
    
    AuthMod --> PrismaClient
    ChatMod --> PrismaClient
    PrismaClient --> DB
```

### 2.1 Technology Stack Matrix

| Layer | Component / Tool | Rationale |
| :--- | :--- | :--- |
| **Runtime Engine** | [Bun](https://bun.sh/) (>= 1.0.0) | High execution speed, native TypeScript execution, ultra-fast startup. |
| **Web Framework** | [ElysiaJS](https://elysiajs.com/) (latest) | Minimalist syntax, optimized for Bun, high RPS throughput. |
| **API Protocols** | REST (OpenAPI) + Eden Treaty (`@elysiajs/eden`) + WS | Typed RPC instead of GraphQL (Apollo removed 2026-09). |
| **Real-time Bus** | Redis single-node pub/sub (`room:<id>`), presence TTL, typing 3s debounce | Replaces in-memory-only broadcast (rule reversed 2026-09). No cluster/broker in Lite. |
| **Data Layer & ORM** | [Prisma ORM](https://www.prisma.io/) (`@prisma/client` ^7.x) | Declarative schema, automated migrations, type-safe queries. |
| **Type Validation** | [Prismabox](https://github.com/mrmq/prismabox) + [TypeBox](https://github.com/sinclairzx81/typebox) | Generates Elysia-compatible TypeBox schemas directly from Prisma models. |
| **Authentication** | JWT (`@elysiajs/jwt` / `jsonwebtoken`) + `bcrypt` | Stateless access/refresh token pattern. |
| **Database** | PostgreSQL 15+ (Local: `postgres:root@localhost:5432/elylitechat`) | Relational integrity with simple schema. |

---

## 3. Data Model & Schema Design

The ElyLiteChat schema focuses strictly on essential communication entities: `User`, `ChatConversation`, `ChatParticipant`, and `ChatMessage`.

```mermaid
erDiagram
    User ||--o{ ChatParticipant : "participates in"
    User ||--o{ ChatMessage : "sends (SenderMessages)"
    User ||--o{ ChatMessage : "receives (ReceiverMessages)"
    ChatConversation ||--|{ ChatParticipant : "contains"
    ChatConversation ||--o{ ChatMessage : "has messages"

    User {
        String id PK
        String email UK
        String username UK
        String password
        Boolean isActive
        DateTime createdAt
        DateTime updatedAt
    }

    ChatConversation {
        String id PK
        String title
        Boolean isActive
        DateTime createdAt
        DateTime updatedAt
    }

    ChatParticipant {
        String id PK
        String userId FK
        String conversationId FK
        Boolean isAdmin
        Boolean isActive
        DateTime joinedAt
        DateTime leftAt
    }

    ChatMessage {
        String id PK
        String content
        String senderId FK
        String receiverId FK
        String conversationId FK
        Boolean isRead
        DateTime readAt
        DateTime createdAt
        DateTime updatedAt
    }
```

### 3.1 Model Definitions (Prisma)
- **`User`**: Account identity with unique email and username, bcrypt-hashed passwords, and active status flag.
- **`ChatConversation`**: Represents either a direct 1-to-1 conversation or a named group chat conversation (`title`).
- **`ChatParticipant`**: Join entity between `User` and `ChatConversation` with membership state (`isAdmin`, `joinedAt`, `leftAt`, `isActive`) and a unique compound index on `[userId, conversationId]`.
- **`ChatMessage`**: Text messages linked to the conversation, sender, receiver, with boolean read status (`isRead`, `readAt`), indexed on `senderId`, `receiverId`, `conversationId`, and `createdAt`.

---

## 4. Functional Specifications & Features

### 4.1 Authentication & User Management
- **User Registration**:
  - Endpoint: `POST /auth/register`
  - Validates email format, unique username, and password requirements.
  - Returns access token, refresh token, and user profile.
- **User Login**:
  - Endpoint: `POST /auth/login`
  - Validates credentials against bcrypt password hashes.
  - Issues 15-minute Access Token and 7-day Refresh Token.
- **Token Refresh**:
  - Endpoint: `POST /auth/refresh`
  - Validates refresh token and issues a new access token without re-prompting credentials.
- **User Profile**:
  - Endpoint: `GET /auth/me` (Protected)
  - Returns authenticated user details.

### 4.2 Conversation Management
- **Create 1-on-1 Conversation**:
  - Checks if a 1-on-1 thread already exists between the two users; returns the existing conversation if present, or initializes a new one with two participants.
- **Create Group Conversation**:
  - Initializes a conversation with an optional `title` and adds creator as `isAdmin = true`, adding initial participants.
- **List User Conversations**:
  - Fetches all active conversations where `userId` is an active participant, including the latest message snippet and unread counter.
- **Participant Management**:
  - Add participant to group (Admin only).
  - Remove participant / Leave conversation.

### 4.3 Message Operations
- **Send Message**:
  - REST: `POST /chat/messages`
  - Eden Treaty: typed `sendMessage` via `treaty<App>` (GraphQL `sendMessage` mutation removed 2026-09)
  - Persists message to database (persist-before-publish) and broadcasts via Redis `room:<id>` to active WebSocket connections for that conversation.
- **Fetch Message History**:
  - Supports limit and cursor/offset pagination (`limit`, `before`, `offset`).
- **Read Receipt Tracking**:
  - Endpoint: `PUT /chat/messages/:id/read` or `POST /chat/conversations/:id/read-all`
  - Updates `isRead = true` and `readAt = new Date()`.
- **Delete Message**:
  - Soft delete or hard delete of messages by the original sender.

### 4.4 Real-time Communication (WebSocket events + Redis Pub/Sub)
- **Direct WebSocket Route (`/ws`)**:
  - Client connects and authenticates via query parameter token (`?token=&client=elylite&v=1`) or `sec-websocket-protocol` handshake.
  - Receives live events per `docs/technical/websocket_events.md`: `chat:new`, `chat:ack`, `chat:delivered`/`chat:read` (lean `{m,r,u,t}` payloads), `presence`, `error`, `missed` replay.
- **WS Subscriptions (replaces GraphQL Subscriptions removed 2026-09)**:
  - `chat:new{roomId}`: Stream new messages in real-time (Redis `room:<id>` fan-out).
  - `chat:read` / `chat:delivered`: Stream receipt updates (batched, lean payloads).

---

## 5. API Interface Contracts

### 5.1 REST API Endpoints Summary

| Method | Path | Auth Required | Description |
| :--- | :--- | :---: | :--- |
| `POST` | `/auth/register` | No | Register a new user |
| `POST` | `/auth/login` | No | Authenticate user & get tokens |
| `POST` | `/auth/refresh` | No | Refresh expired access token |
| `GET` | `/auth/me` | Yes | Get authenticated user info |
| `GET` | `/chat/conversations` | Yes | List all user conversations |
| `POST` | `/chat/conversations` | Yes | Create new 1-on-1 or group conversation |
| `GET` | `/chat/conversations/:id` | Yes | Get conversation details and participants |
| `GET` | `/chat/conversations/:id/messages` | Yes | Paginated message history of conversation |
| `POST` | `/chat/messages` | Yes | Send a message |
| `PUT` | `/chat/messages/:id/read` | Yes | Mark message as read |
| `GET` | `/health` | No | System health and uptime |

### 5.2 Typed RPC Schema (Eden Treaty — replaces GraphQL SDL removed 2026-09)

> GraphQL SDL di bawah ini **diarsipkan dan tidak berlaku**. Kontrak berjalan
> adalah TypeBox + Eden Treaty di root `docs/technical/api_spec.md`
> (tipe berasal dari `export type App = typeof app`, tidak ditulis manual).
> Operasi yang setara: `me`, `conversations`, `conversation(id)`,
> `messages(conversationId, limit, offset)` (queries) dan `createConversation`,
> `sendMessage`, `markAsRead`, `markConversationAsRead` (mutations) — semuanya
> via Eden/REST, bukan GraphQL. (Blok SDL arsip dihapus 2026-09 bersama
> `GRAPHQL_API_DOCUMENTATION.md`.)


---

## 6. Non-Functional Requirements (NFR)

### 6.1 Performance & Latency
- **API Response Time**: P95 < 50ms for REST endpoints.
- **Real-time Delivery**: Message broadcast via Redis `room:<id>` pub/sub in < 30ms intra-node.
- **Resource Footprint**: Base memory consumption < 120MB backend on Bun; frontend tab < 80MB, First Load JS < 40KB (see root `docs/prd/prd_elylitechat.md`).

### 6.2 Reliability & Fault Handling
- Standardized JSON error response format:
  ```json
  {
    "success": false,
    "error": {
      "code": "RESOURCE_NOT_FOUND",
      "message": "Conversation with id xxx does not exist"
    }
  }
  ```
- Graceful error recovery on database disconnections with automatic reconnect.

### 6.3 Security Baseline
- Passwords hashed with `bcrypt` (10 rounds).
- JWT signed using standard HMAC SHA-256 (`HS256`).
- Input validation on all incoming payload bodies via Zod / TypeBox.
- CORS policy configured for allowable origin domains.

---

## 7. Developer Experience & Operational Setup

### 7.1 Environment Configuration (`.env`)
```env
# Server
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL="postgresql://postgres:root@localhost:5432/elylitechat?schema=public"

# Authentication
JWT_SECRET="super-secret-jwt-key-change-in-prod"
JWT_REFRESH_SECRET="super-secret-refresh-key-change-in-prod"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

# Real-time bus (required since 2026-09; single-node only in Lite)
REDIS_URL="redis://localhost:6379"
```

### 7.2 Running Locally
```bash
# Install dependencies
bun install

# Generate Prisma & Prismabox types
bunx prisma generate

# Apply migrations
bunx prisma migrate dev

# Run development server with live watch
bun run dev
```

---

## 8. Release Roadmap & Implementation Checklist

### Phase 1: Foundation & Authentication (REST) `[COMPLETED]`
- [x] Project initialization with Bun and ElysiaJS.
- [x] Prisma ORM configuration with PostgreSQL/SQLite.
- [x] Core schema models: `User`, `ChatConversation`, `ChatParticipant`, `ChatMessage`.
- [x] Prismabox setup for TypeBox schema auto-generation.
- [x] User registration (`POST /auth/register`) with bcrypt hashing.
- [x] User login (`POST /auth/login`) with access & refresh JWT tokens.
- [x] Token refresh endpoint (`POST /auth/refresh`).
- [x] Authenticated profile endpoint (`GET /auth/me`).
- [x] OpenAPI / Swagger documentation for Auth routes.

### Phase 2: Chat Engine (REST + Eden Treaty + WebSocket) `[COMPLETED]`
- [x] Chat REST endpoints (Conversations, Messages, Read status).
- [x] Eden Treaty typed RPC replacing Apollo GraphQL (`@elysiajs/apollo` removed 2026-09).
- [x] WebSocket handler (`/ws`) for live message streaming.
- [x] Postman API documentation files generated.

### Phase 3: WebSocket Hardening & Subscriptions `[COMPLETED]`
- [x] WS event subscriptions (`chat:new`, receipts, `typingStatus`) via native gateway + Redis (GraphQL Subscriptions removed 2026-09).
- [x] Heartbeat ping-pong mechanism on `/ws` to clean up dead connections.
- [x] Client reconnection and missed message replay protocol.
- [x] Room/Conversation subscription filtering to prevent broadcast leak across conversations.

### Phase 4: Enhanced Chat Features `[COMPLETED]`
- [x] Message soft-delete (`isDeleted = true`) and edit functionality via REST & Eden.
- [x] Ephemeral typing indicator broadcast via WebSocket & Redis PubSub.
- [x] Unread message counter aggregate query per conversation.
- [x] User discovery/search endpoint (`GET /chat/users/search?q=`).

### Phase 5: Automated Testing & Production Readiness `[COMPLETED]`
- [x] Vitest/Bun test suite for Auth (register, login, token refresh, profile).
- [x] Vitest/Bun test suite for Chat (REST endpoints, Eden operations, message lifecycle).
- [x] Redis-backed WebSocket & PubSub engine test suite.
- [x] Lightweight Docker containerization (`Dockerfile` and `docker-compose.yml`, incl. Redis single-node).

### Phase 6: ElyChat Unification (Eden + Redis + Interop) `[IN PROGRESS]`
- [ ] Finish Redis pub/sub migration; remove Apollo/GraphQL deps and `schema.ts`/`resolvers.ts`.
- [ ] Interop columns (`clientMsgId`, `ciphertext`, `fallbackText/Meta`) per root `docs/technical/data_models.md`.
- [ ] Tighten CORS; track in `AGENTS.md` Phase 6.


