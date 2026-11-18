-- AlterTable
ALTER TABLE "Quest" ADD COLUMN "rules" TEXT;
ALTER TABLE "Quest" ADD COLUMN "stakes" TEXT;
ALTER TABLE "Quest" ADD COLUMN "howToWin" TEXT;
ALTER TABLE "Quest" ADD COLUMN "destination" TEXT;
ALTER TABLE "Quest" ADD COLUMN "journeyLabel" TEXT;
ALTER TABLE "Quest" ADD COLUMN "journeyNote" TEXT;
ALTER TABLE "Quest" ADD COLUMN "commitmentLevel" INTEGER NOT NULL DEFAULT 7;

-- AlterTable
ALTER TABLE "QuestRun" ADD COLUMN "destinationDone" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "QuestSubtask" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "questId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "QuestSubtask_questId_fkey" FOREIGN KEY ("questId") REFERENCES "Quest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuestJourneyLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuestJourneyLog_runId_fkey" FOREIGN KEY ("runId") REFERENCES "QuestRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuestSubtaskCompletion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runId" INTEGER NOT NULL,
    "subtaskId" INTEGER NOT NULL,
    "completedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuestSubtaskCompletion_runId_fkey" FOREIGN KEY ("runId") REFERENCES "QuestRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuestSubtaskCompletion_subtaskId_fkey" FOREIGN KEY ("subtaskId") REFERENCES "QuestSubtask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "QuestSubtask_questId_idx" ON "QuestSubtask"("questId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestJourneyLog_runId_date_key" ON "QuestJourneyLog"("runId", "date");

-- CreateIndex
CREATE INDEX "QuestJourneyLog_date_idx" ON "QuestJourneyLog"("date");

-- CreateIndex
CREATE UNIQUE INDEX "QuestSubtaskCompletion_runId_subtaskId_key" ON "QuestSubtaskCompletion"("runId", "subtaskId");

-- CreateIndex
CREATE INDEX "QuestSubtaskCompletion_runId_idx" ON "QuestSubtaskCompletion"("runId");
