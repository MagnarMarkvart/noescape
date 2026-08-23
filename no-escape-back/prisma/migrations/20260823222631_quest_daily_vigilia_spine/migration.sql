-- AlterTable
ALTER TABLE "DailyTask" ADD COLUMN "questBindKind" TEXT;
ALTER TABLE "DailyTask" ADD COLUMN "questId" INTEGER;
ALTER TABLE "DailyTask" ADD COLUMN "questRunId" INTEGER;
ALTER TABLE "DailyTask" ADD COLUMN "questSubtaskId" INTEGER;

-- AlterTable
ALTER TABLE "Quest" ADD COLUMN "dailyWorkMinutes" INTEGER;
ALTER TABLE "Quest" ADD COLUMN "dailyWorkTitle" TEXT;

-- AlterTable
ALTER TABLE "QuestSubtask" ADD COLUMN "estimateMinutes" INTEGER;

-- CreateTable
CREATE TABLE "WorkInterval" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "clockKind" TEXT NOT NULL,
    "watchId" INTEGER,
    "dailyTaskId" INTEGER,
    "questRunId" INTEGER,
    "questSubtaskId" INTEGER,
    "questId" INTEGER,
    "scriptoriumWorkId" INTEGER,
    "startedAt" DATETIME NOT NULL,
    "endedAt" DATETIME NOT NULL,
    "elapsedMs" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Character" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "title" TEXT NOT NULL DEFAULT 'Peasant',
    "nickname" TEXT NOT NULL DEFAULT '',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Tallinn',
    "dateFormat" TEXT NOT NULL DEFAULT 'DMY',
    "timeFormat" TEXT NOT NULL DEFAULT 'H24',
    "dayStartHour" INTEGER NOT NULL DEFAULT 0,
    "weekStartsOn" INTEGER NOT NULL DEFAULT 1,
    "menuAutoToggleMobile" BOOLEAN NOT NULL DEFAULT true,
    "menuAutoToggleDesktop" BOOLEAN NOT NULL DEFAULT true,
    "pomodoroAutoContinue" BOOLEAN NOT NULL DEFAULT true,
    "consuetudoStartInScenery" BOOLEAN NOT NULL DEFAULT true,
    "vigiliaTrackQuests" BOOLEAN NOT NULL DEFAULT true,
    "vigiliaTrackDailies" BOOLEAN NOT NULL DEFAULT false,
    "vigiliaTrackScriptorium" BOOLEAN NOT NULL DEFAULT false,
    "vigiliaTrackCustom" BOOLEAN NOT NULL DEFAULT false,
    "wealthCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Character" ("consuetudoStartInScenery", "createdAt", "currency", "dateFormat", "dayStartHour", "id", "menuAutoToggleDesktop", "menuAutoToggleMobile", "nickname", "pomodoroAutoContinue", "timeFormat", "timezone", "title", "updatedAt", "wealthCents", "weekStartsOn") SELECT "consuetudoStartInScenery", "createdAt", "currency", "dateFormat", "dayStartHour", "id", "menuAutoToggleDesktop", "menuAutoToggleMobile", "nickname", "pomodoroAutoContinue", "timeFormat", "timezone", "title", "updatedAt", "wealthCents", "weekStartsOn" FROM "Character";
DROP TABLE "Character";
ALTER TABLE "new_Character" RENAME TO "Character";
CREATE TABLE "new_Habit" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "skillId" INTEGER,
    "cadence" TEXT NOT NULL DEFAULT 'DAILY',
    "everyNDays" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "wealthCents" INTEGER NOT NULL DEFAULT 0,
    "skillWeightsJson" TEXT,
    "effortLevel" INTEGER NOT NULL DEFAULT 5,
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "allowInDailies" BOOLEAN NOT NULL DEFAULT true,
    "kind" TEXT NOT NULL DEFAULT 'check',
    "period" TEXT NOT NULL DEFAULT 'day',
    "polarity" TEXT NOT NULL DEFAULT 'virtue',
    "normMin" INTEGER NOT NULL DEFAULT 0,
    "normMax" INTEGER NOT NULL DEFAULT 1,
    "step" INTEGER NOT NULL DEFAULT 1,
    "questId" INTEGER,
    "groupId" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Habit_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Habit_questId_fkey" FOREIGN KEY ("questId") REFERENCES "Quest" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Habit_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "HabitGroup" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Habit" ("active", "allowInDailies", "cadence", "createdAt", "durationMinutes", "effortLevel", "everyNDays", "groupId", "icon", "id", "kind", "name", "normMax", "normMin", "period", "polarity", "questId", "skillId", "skillWeightsJson", "sortOrder", "step", "wealthCents") SELECT "active", "allowInDailies", "cadence", "createdAt", "durationMinutes", "effortLevel", "everyNDays", "groupId", "icon", "id", "kind", "name", "normMax", "normMin", "period", "polarity", "questId", "skillId", "skillWeightsJson", "sortOrder", "step", "wealthCents" FROM "Habit";
DROP TABLE "Habit";
ALTER TABLE "new_Habit" RENAME TO "Habit";
CREATE INDEX "Habit_kind_idx" ON "Habit"("kind");
CREATE INDEX "Habit_questId_idx" ON "Habit"("questId");
CREATE INDEX "Habit_groupId_idx" ON "Habit"("groupId");
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
    "bindKind" TEXT NOT NULL DEFAULT 'custom',
    "questId" INTEGER,
    "questRunId" INTEGER,
    "questSubtaskId" INTEGER,
    "dailyTaskId" INTEGER,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HorologiumWatch_scriptoriumWorkId_fkey" FOREIGN KEY ("scriptoriumWorkId") REFERENCES "ScriptoriumWork" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_HorologiumWatch" ("archivedAt", "createdAt", "elapsedMs", "id", "lastStartedAt", "name", "running", "scriptoriumWorkId", "startedAt", "status", "updatedAt") SELECT "archivedAt", "createdAt", "elapsedMs", "id", "lastStartedAt", "name", "running", "scriptoriumWorkId", "startedAt", "status", "updatedAt" FROM "HorologiumWatch";
DROP TABLE "HorologiumWatch";
ALTER TABLE "new_HorologiumWatch" RENAME TO "HorologiumWatch";
CREATE INDEX "HorologiumWatch_status_idx" ON "HorologiumWatch"("status");
CREATE INDEX "HorologiumWatch_scriptoriumWorkId_idx" ON "HorologiumWatch"("scriptoriumWorkId");
CREATE INDEX "HorologiumWatch_questId_idx" ON "HorologiumWatch"("questId");
CREATE INDEX "HorologiumWatch_questSubtaskId_idx" ON "HorologiumWatch"("questSubtaskId");
CREATE INDEX "HorologiumWatch_dailyTaskId_idx" ON "HorologiumWatch"("dailyTaskId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "WorkInterval_dailyTaskId_idx" ON "WorkInterval"("dailyTaskId");

-- CreateIndex
CREATE INDEX "WorkInterval_questSubtaskId_idx" ON "WorkInterval"("questSubtaskId");

-- CreateIndex
CREATE INDEX "WorkInterval_questId_idx" ON "WorkInterval"("questId");

-- CreateIndex
CREATE INDEX "WorkInterval_watchId_idx" ON "WorkInterval"("watchId");

-- CreateIndex
CREATE INDEX "WorkInterval_scriptoriumWorkId_idx" ON "WorkInterval"("scriptoriumWorkId");

-- CreateIndex
CREATE INDEX "DailyTask_questId_idx" ON "DailyTask"("questId");

-- CreateIndex
CREATE INDEX "DailyTask_questSubtaskId_idx" ON "DailyTask"("questSubtaskId");
