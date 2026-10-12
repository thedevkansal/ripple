-- AlterTable
ALTER TABLE "GmailAccount" ADD COLUMN     "canRead" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "repliesSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "gmailThreadId" TEXT,
ADD COLUMN     "repliedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Reply" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "fromName" TEXT,
    "snippet" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Reply_gmailMessageId_key" ON "Reply"("gmailMessageId");

-- CreateIndex
CREATE INDEX "Reply_messageId_receivedAt_idx" ON "Reply"("messageId", "receivedAt");

-- CreateIndex
CREATE INDEX "Message_gmailAccountId_gmailThreadId_idx" ON "Message"("gmailAccountId", "gmailThreadId");

-- AddForeignKey
ALTER TABLE "Reply" ADD CONSTRAINT "Reply_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
