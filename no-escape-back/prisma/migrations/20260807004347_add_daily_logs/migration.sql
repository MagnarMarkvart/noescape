-- CreateTable
CREATE TABLE "DailyLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" TEXT NOT NULL,
    "sealedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "filledCount" INTEGER NOT NULL,
    "completedCount" INTEGER NOT NULL,
    "earnedXp" INTEGER NOT NULL,
    "projectedXp" INTEGER NOT NULL,
    "snapshotJson" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyLog_date_key" ON "DailyLog"("date");
