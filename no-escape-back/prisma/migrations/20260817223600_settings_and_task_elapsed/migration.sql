-- AlterTable
ALTER TABLE "Character" ADD COLUMN "nickname" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Character" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Europe/Tallinn';

-- AlterTable
ALTER TABLE "DailyTask" ADD COLUMN "elapsedMs" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "QuestSubtaskCompletion" ADD COLUMN "elapsedMs" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "QuestSubtaskCompletion" ADD COLUMN "done" BOOLEAN NOT NULL DEFAULT 1;
