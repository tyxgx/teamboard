/*
  Warnings:

  - Made the column `lastActivity` on table `Board` required. This step will fail if there are existing NULL values in that column.
  - Made the column `createdAt` on table `Comment` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Board" ALTER COLUMN "lastActivity" SET NOT NULL,
ALTER COLUMN "lastActivity" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Comment" ADD COLUMN     "anonymous" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "createdAt" SET NOT NULL,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);
