-- CreateTable
CREATE TABLE "Character" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "title" TEXT NOT NULL DEFAULT 'Peasant',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FeatureUnlock" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "key" TEXT NOT NULL,
    "unlocked" BOOLEAN NOT NULL DEFAULT false,
    "unlockedAt" DATETIME
);

-- CreateTable
CREATE TABLE "Quest" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'NOVICE',
    "summary" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "skillSlug" TEXT,
    "durationDays" INTEGER,
    "kind" TEXT NOT NULL DEFAULT 'GENERIC',
    "skillReqsJson" TEXT,
    "unlockReqsJson" TEXT,
    "questReqsJson" TEXT,
    "rewardJson" TEXT,
    "xpPlanJson" TEXT,
    "createdByUser" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "QuestRun" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "questId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "streakCount" INTEGER NOT NULL DEFAULT 0,
    "bestStreak" INTEGER NOT NULL DEFAULT 0,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "lastLogDate" TEXT,
    CONSTRAINT "QuestRun_questId_fkey" FOREIGN KEY ("questId") REFERENCES "Quest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuestDayLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "xpAwarded" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuestDayLog_runId_fkey" FOREIGN KEY ("runId") REFERENCES "QuestRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Habit" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "skillId" INTEGER,
    "cadence" TEXT NOT NULL DEFAULT 'DAILY',
    "everyNDays" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Habit_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HabitCompletion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "habitId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "dailyTaskId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HabitCompletion_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
    "effortLevel" INTEGER NOT NULL DEFAULT 5,
    "durationMinutes" INTEGER NOT NULL DEFAULT 45,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "xpAwarded" INTEGER,
    "activityId" INTEGER,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DailyTask_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DailyTask_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_DailyTask" ("activityId", "completed", "completedAt", "createdAt", "date", "durationMinutes", "effortLevel", "id", "importance", "skillId", "slotIndex", "title", "updatedAt", "xpAwarded") SELECT "activityId", "completed", "completedAt", "createdAt", "date", "durationMinutes", "effortLevel", "id", "importance", "skillId", "slotIndex", "title", "updatedAt", "xpAwarded" FROM "DailyTask";
DROP TABLE "DailyTask";
ALTER TABLE "new_DailyTask" RENAME TO "DailyTask";
CREATE INDEX "DailyTask_date_idx" ON "DailyTask"("date");
CREATE INDEX "DailyTask_habitId_idx" ON "DailyTask"("habitId");
CREATE UNIQUE INDEX "DailyTask_date_importance_slotIndex_key" ON "DailyTask"("date", "importance", "slotIndex");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "FeatureUnlock_key_key" ON "FeatureUnlock"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Quest_slug_key" ON "Quest"("slug");

-- CreateIndex
CREATE INDEX "QuestRun_status_idx" ON "QuestRun"("status");

-- CreateIndex
CREATE INDEX "QuestRun_questId_idx" ON "QuestRun"("questId");

-- CreateIndex
CREATE INDEX "QuestDayLog_date_idx" ON "QuestDayLog"("date");

-- CreateIndex
CREATE UNIQUE INDEX "QuestDayLog_runId_date_key" ON "QuestDayLog"("runId", "date");

-- CreateIndex
CREATE INDEX "HabitCompletion_date_idx" ON "HabitCompletion"("date");

-- CreateIndex
CREATE UNIQUE INDEX "HabitCompletion_habitId_date_key" ON "HabitCompletion"("habitId", "date");
