/*
  Warnings:

  - You are about to alter the column `elapsedMs` on the `DailyTask` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `elapsedMs` on the `QuestSubtaskCompletion` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DailyTask" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" TEXT NOT NULL,
    "importance" TEXT NOT NULL,
    "slotIndex" INTEGER NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "skillId" INTEGER,
    "habitId" INTEGER,
    "fixedXp" INTEGER,
    "skillWeightsJson" TEXT,
    "activityIdsJson" TEXT,
    "effortLevel" INTEGER NOT NULL DEFAULT 5,
    "durationMinutes" INTEGER NOT NULL DEFAULT 45,
    "elapsedMs" BIGINT NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "xpAwarded" INTEGER,
    "activityId" INTEGER,
    "completedAt" DATETIME,
    "wealthCents" INTEGER NOT NULL DEFAULT 0,
    "wealthAwardedCents" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DailyTask_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DailyTask_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_DailyTask" ("activityId", "activityIdsJson", "completed", "completedAt", "createdAt", "date", "durationMinutes", "effortLevel", "elapsedMs", "fixedXp", "habitId", "id", "importance", "skillId", "skillWeightsJson", "slotIndex", "title", "updatedAt", "wealthAwardedCents", "wealthCents", "xpAwarded") SELECT "activityId", "activityIdsJson", "completed", "completedAt", "createdAt", "date", "durationMinutes", "effortLevel", "elapsedMs", "fixedXp", "habitId", "id", "importance", "skillId", "skillWeightsJson", "slotIndex", "title", "updatedAt", "wealthAwardedCents", "wealthCents", "xpAwarded" FROM "DailyTask";
DROP TABLE "DailyTask";
ALTER TABLE "new_DailyTask" RENAME TO "DailyTask";
CREATE INDEX "DailyTask_date_idx" ON "DailyTask"("date");
CREATE INDEX "DailyTask_habitId_idx" ON "DailyTask"("habitId");
CREATE UNIQUE INDEX "DailyTask_date_importance_slotIndex_key" ON "DailyTask"("date", "importance", "slotIndex");
CREATE TABLE "new_HorologiumWatch" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "elapsedMs" BIGINT NOT NULL DEFAULT 0,
    "running" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastStartedAt" DATETIME,
    "archivedAt" DATETIME,
    "scriptoriumWorkId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HorologiumWatch_scriptoriumWorkId_fkey" FOREIGN KEY ("scriptoriumWorkId") REFERENCES "ScriptoriumWork" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_HorologiumWatch" ("archivedAt", "createdAt", "elapsedMs", "id", "lastStartedAt", "name", "running", "scriptoriumWorkId", "startedAt", "status", "updatedAt") SELECT "archivedAt", "createdAt", "elapsedMs", "id", "lastStartedAt", "name", "running", "scriptoriumWorkId", "startedAt", "status", "updatedAt" FROM "HorologiumWatch";
DROP TABLE "HorologiumWatch";
ALTER TABLE "new_HorologiumWatch" RENAME TO "HorologiumWatch";
CREATE INDEX "HorologiumWatch_status_idx" ON "HorologiumWatch"("status");
CREATE INDEX "HorologiumWatch_scriptoriumWorkId_idx" ON "HorologiumWatch"("scriptoriumWorkId");
CREATE TABLE "new_QuestSubtaskCompletion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runId" INTEGER NOT NULL,
    "subtaskId" INTEGER NOT NULL,
    "completedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "done" BOOLEAN NOT NULL DEFAULT true,
    "elapsedMs" BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT "QuestSubtaskCompletion_runId_fkey" FOREIGN KEY ("runId") REFERENCES "QuestRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuestSubtaskCompletion_subtaskId_fkey" FOREIGN KEY ("subtaskId") REFERENCES "QuestSubtask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_QuestSubtaskCompletion" ("completedAt", "done", "elapsedMs", "id", "runId", "subtaskId") SELECT "completedAt", "done", "elapsedMs", "id", "runId", "subtaskId" FROM "QuestSubtaskCompletion";
DROP TABLE "QuestSubtaskCompletion";
ALTER TABLE "new_QuestSubtaskCompletion" RENAME TO "QuestSubtaskCompletion";
CREATE INDEX "QuestSubtaskCompletion_runId_idx" ON "QuestSubtaskCompletion"("runId");
CREATE UNIQUE INDEX "QuestSubtaskCompletion_runId_subtaskId_key" ON "QuestSubtaskCompletion"("runId", "subtaskId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "HorologiumSession_questRunId_idx" ON "HorologiumSession"("questRunId");
