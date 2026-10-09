-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "cc" TEXT[];

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "ccEmails" TEXT[];

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "cc" TEXT[];

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Template_workspaceId_updatedAt_idx" ON "Template"("workspaceId", "updatedAt");

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
