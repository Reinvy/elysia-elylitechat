-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isEdited" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "ChatMessage_isDeleted_idx" ON "ChatMessage"("isDeleted");
