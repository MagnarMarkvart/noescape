-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DailyTaskTemplate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "skillId" INTEGER NOT NULL,
    "habitId" INTEGER,
    "fixedXp" INTEGER NOT NULL DEFAULT 0,
    "effortLevel" INTEGER NOT NULL DEFAULT 5,
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdByUser" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DailyTaskTemplate_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DailyTaskTemplate_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_DailyTaskTemplate" ("id", "name", "icon", "skillId", "fixedXp", "effortLevel", "durationMinutes", "sortOrder", "createdByUser", "active", "createdAt")
SELECT "id", "name", "icon", "skillId", "fixedXp", "effortLevel", "durationMinutes", "sortOrder", "createdByUser", "active", "createdAt"
FROM "DailyTaskTemplate";
DROP TABLE "DailyTaskTemplate";
ALTER TABLE "new_DailyTaskTemplate" RENAME TO "DailyTaskTemplate";
CREATE INDEX "DailyTaskTemplate_skillId_idx" ON "DailyTaskTemplate"("skillId");
CREATE INDEX "DailyTaskTemplate_habitId_idx" ON "DailyTaskTemplate"("habitId");
CREATE INDEX "DailyTaskTemplate_active_idx" ON "DailyTaskTemplate"("active");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
