-- Custom groupings, quest-link rules, and XP tracking on habit completions.

CREATE TABLE "HabitGroup" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "Habit" ADD COLUMN "groupId" INTEGER;
CREATE INDEX "Habit_groupId_idx" ON "Habit"("groupId");

CREATE TABLE "HabitQuestLink" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "habitId" INTEGER NOT NULL,
    "questId" INTEGER NOT NULL,
    "target" TEXT NOT NULL DEFAULT 'JOURNEY',
    "subtaskId" INTEGER,
    "rule" TEXT NOT NULL DEFAULT 'COUNT',
    "requiredCount" INTEGER NOT NULL DEFAULT 1,
    "windowDays" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HabitQuestLink_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HabitQuestLink_questId_fkey" FOREIGN KEY ("questId") REFERENCES "Quest" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HabitQuestLink_subtaskId_fkey" FOREIGN KEY ("subtaskId") REFERENCES "QuestSubtask" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "HabitQuestLink_habitId_key" ON "HabitQuestLink"("habitId");
CREATE INDEX "HabitQuestLink_questId_idx" ON "HabitQuestLink"("questId");

CREATE TABLE "HabitQuestEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "linkId" INTEGER NOT NULL,
    "habitId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "kind" TEXT NOT NULL,
    "tallyInBand" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HabitQuestEvent_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "HabitQuestLink" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HabitQuestEvent_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "HabitQuestEvent_linkId_idx" ON "HabitQuestEvent"("linkId");
CREATE INDEX "HabitQuestEvent_habitId_date_idx" ON "HabitQuestEvent"("habitId", "date");

ALTER TABLE "HabitCompletion" ADD COLUMN "xpAwarded" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "HabitCompletion" ADD COLUMN "xpActivityIdsJson" TEXT;

UPDATE "Habit" SET "allowInDailies" = 0 WHERE "kind" = 'tally';

INSERT INTO "HabitQuestLink" ("habitId", "questId", "target", "rule", "requiredCount")
SELECT "id", "questId", 'JOURNEY', 'COUNT', 1
FROM "Habit"
WHERE "questId" IS NOT NULL;
