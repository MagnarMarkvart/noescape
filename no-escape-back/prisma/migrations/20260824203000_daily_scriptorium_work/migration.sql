-- AlterTable
ALTER TABLE "DailyTask" ADD COLUMN "scriptoriumWorkId" INTEGER;

-- CreateIndex
CREATE INDEX "DailyTask_scriptoriumWorkId_idx" ON "DailyTask"("scriptoriumWorkId");
