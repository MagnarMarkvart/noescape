-- One-off XP tasks logged from Dashboard / Character.
CREATE TABLE "QuickTaskLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "icon" TEXT,
    "templateId" INTEGER,
    "skillWeightsJson" TEXT NOT NULL,
    "effortLevel" INTEGER NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "xpAwarded" INTEGER NOT NULL,
    "activityIdsJson" TEXT,
    "wealthCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "QuickTaskLog_date_idx" ON "QuickTaskLog"("date");
CREATE INDEX "QuickTaskLog_createdAt_idx" ON "QuickTaskLog"("createdAt");
