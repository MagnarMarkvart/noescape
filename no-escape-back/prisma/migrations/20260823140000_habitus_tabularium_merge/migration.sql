-- Habitus absorbs Tabularium: optional tally fields, skill split, daily gate, clicks.

ALTER TABLE "Habit" ADD COLUMN "skillWeightsJson" TEXT;
ALTER TABLE "Habit" ADD COLUMN "effortLevel" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "Habit" ADD COLUMN "durationMinutes" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "Habit" ADD COLUMN "allowInDailies" BOOLEAN NOT NULL DEFAULT 1;
ALTER TABLE "Habit" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'check';
ALTER TABLE "Habit" ADD COLUMN "period" TEXT NOT NULL DEFAULT 'day';
ALTER TABLE "Habit" ADD COLUMN "polarity" TEXT NOT NULL DEFAULT 'virtue';
ALTER TABLE "Habit" ADD COLUMN "normMin" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Habit" ADD COLUMN "normMax" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Habit" ADD COLUMN "step" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Habit" ADD COLUMN "questId" INTEGER;
ALTER TABLE "Habit" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Habit" ADD COLUMN "legacyTabulaId" INTEGER;

CREATE TABLE "HabitClick" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "habitId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "delta" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HabitClick_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Habit_kind_idx" ON "Habit"("kind");
CREATE INDEX "Habit_questId_idx" ON "Habit"("questId");
CREATE INDEX "HabitClick_habitId_date_idx" ON "HabitClick"("habitId", "date");
CREATE INDEX "HabitClick_date_idx" ON "HabitClick"("date");

INSERT INTO "Habit" (
    "name", "icon", "cadence", "everyNDays", "active", "wealthCents",
    "effortLevel", "durationMinutes", "allowInDailies", "kind",
    "period", "polarity", "normMin", "normMax", "step", "questId",
    "sortOrder", "createdAt", "legacyTabulaId"
)
SELECT
    t."name",
    t."icon",
    'DAILY',
    1,
    CASE WHEN t."archived" THEN 0 ELSE 1 END,
    0,
    5,
    30,
    0,
    'tally',
    t."period",
    t."polarity",
    t."normMin",
    t."normMax",
    t."step",
    t."questId",
    t."sortOrder",
    t."createdAt",
    t."id"
FROM "Tabula" t;

INSERT INTO "HabitClick" ("habitId", "date", "delta", "createdAt")
SELECT h."id", c."date", c."delta", c."createdAt"
FROM "TabulaClick" c
JOIN "Habit" h ON h."legacyTabulaId" = c."tabulaId";

ALTER TABLE "Habit" DROP COLUMN "legacyTabulaId";

UPDATE "FeatureUnlock"
SET "unlocked" = 1, "unlockedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'feature:habitus';

INSERT INTO "FeatureUnlock" ("key", "unlocked", "unlockedAt")
SELECT 'feature:habitus', 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM "FeatureUnlock" WHERE "key" = 'feature:habitus'
);
