-- CreateTable
CREATE TABLE "LevelUpEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "skillId" INTEGER NOT NULL,
    "fromLevel" INTEGER NOT NULL,
    "toLevel" INTEGER NOT NULL,
    "levelsGained" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LevelUpEvent_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "LevelUpEvent_createdAt_idx" ON "LevelUpEvent"("createdAt");

-- CreateIndex
CREATE INDEX "LevelUpEvent_skillId_idx" ON "LevelUpEvent"("skillId");
