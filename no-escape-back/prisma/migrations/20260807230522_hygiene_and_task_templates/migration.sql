-- AlterTable
ALTER TABLE "DailyTask" ADD COLUMN "fixedXp" INTEGER;

-- CreateTable
CREATE TABLE "DailyTaskTemplate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "skillId" INTEGER NOT NULL,
    "fixedXp" INTEGER NOT NULL,
    "effortLevel" INTEGER NOT NULL DEFAULT 5,
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdByUser" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DailyTaskTemplate_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DailyTaskTemplate_skillId_idx" ON "DailyTaskTemplate"("skillId");

-- CreateIndex
CREATE INDEX "DailyTaskTemplate_active_idx" ON "DailyTaskTemplate"("active");
