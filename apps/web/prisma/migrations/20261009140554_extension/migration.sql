-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "isSelf" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "selfViewAt" TIMESTAMP(3),
ADD COLUMN     "senderUserId" TEXT;

-- CreateTable
CREATE TABLE "ExtensionToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "ExtensionToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExtensionToken_tokenHash_key" ON "ExtensionToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ExtensionToken_userId_idx" ON "ExtensionToken"("userId");

-- AddForeignKey
ALTER TABLE "ExtensionToken" ADD CONSTRAINT "ExtensionToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtensionToken" ADD CONSTRAINT "ExtensionToken_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
