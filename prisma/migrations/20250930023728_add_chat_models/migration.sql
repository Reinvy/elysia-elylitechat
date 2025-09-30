-- CreateTable
CREATE TABLE "public"."ChatConversation" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ChatConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ChatParticipant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ChatParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ChatMessage" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatConversation_createdAt_idx" ON "public"."ChatConversation"("createdAt");

-- CreateIndex
CREATE INDEX "ChatConversation_isActive_idx" ON "public"."ChatConversation"("isActive");

-- CreateIndex
CREATE INDEX "ChatParticipant_userId_idx" ON "public"."ChatParticipant"("userId");

-- CreateIndex
CREATE INDEX "ChatParticipant_conversationId_idx" ON "public"."ChatParticipant"("conversationId");

-- CreateIndex
CREATE INDEX "ChatParticipant_joinedAt_idx" ON "public"."ChatParticipant"("joinedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatParticipant_userId_conversationId_key" ON "public"."ChatParticipant"("userId", "conversationId");

-- CreateIndex
CREATE INDEX "ChatMessage_senderId_idx" ON "public"."ChatMessage"("senderId");

-- CreateIndex
CREATE INDEX "ChatMessage_receiverId_idx" ON "public"."ChatMessage"("receiverId");

-- CreateIndex
CREATE INDEX "ChatMessage_conversationId_idx" ON "public"."ChatMessage"("conversationId");

-- CreateIndex
CREATE INDEX "ChatMessage_createdAt_idx" ON "public"."ChatMessage"("createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_isRead_idx" ON "public"."ChatMessage"("isRead");

-- AddForeignKey
ALTER TABLE "public"."ChatParticipant" ADD CONSTRAINT "ChatParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatParticipant" ADD CONSTRAINT "ChatParticipant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "public"."ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatMessage" ADD CONSTRAINT "ChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatMessage" ADD CONSTRAINT "ChatMessage_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "public"."ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
