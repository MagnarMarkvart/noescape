-- AlterTable
ALTER TABLE "Character" ADD COLUMN "wealthCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Character" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'EUR';

-- AlterTable
ALTER TABLE "DailyTask" ADD COLUMN "wealthCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DailyTask" ADD COLUMN "wealthAwardedCents" INTEGER;

-- AlterTable
ALTER TABLE "DailyTaskTemplate" ADD COLUMN "wealthCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Habit" ADD COLUMN "wealthCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "HabitCompletion" ADD COLUMN "wealthAwardedCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Quest" ADD COLUMN "wealthCents" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "WealthEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" TEXT NOT NULL,
    "deltaCents" INTEGER NOT NULL,
    "balanceCents" INTEGER NOT NULL,
    "note" TEXT,
    "source" TEXT NOT NULL,
    "sourceId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "WealthEntry_createdAt_idx" ON "WealthEntry"("createdAt");

-- CreateIndex
CREATE INDEX "WealthEntry_date_idx" ON "WealthEntry"("date");
