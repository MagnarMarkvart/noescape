-- CreateTable
CREATE TABLE "HorologiumSession" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" TEXT NOT NULL,
    "workMinutes" INTEGER NOT NULL,
    "restMinutes" INTEGER NOT NULL,
    "iterations" INTEGER NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "presetId" TEXT,
    "skillId" INTEGER,
    "xpAwarded" INTEGER NOT NULL,
    "activityId" INTEGER,
    "note" TEXT,
    "completedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HorologiumSession_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "HorologiumSession_date_idx" ON "HorologiumSession"("date");

-- CreateIndex
CREATE INDEX "HorologiumSession_completedAt_idx" ON "HorologiumSession"("completedAt");
