-- CreateTable
CREATE TABLE "Reward" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "skillId" INTEGER NOT NULL,
    "levelReq" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "permissionKey" TEXT,
    "wealthLevelReq" INTEGER,
    "questIds" TEXT,
    "orderIndex" INTEGER NOT NULL,
    "icon" TEXT NOT NULL,
    "unlocked" BOOLEAN NOT NULL DEFAULT false,
    "claimedAt" DATETIME,
    CONSTRAINT "Reward_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Reward_skillId_idx" ON "Reward"("skillId");

-- CreateIndex
CREATE UNIQUE INDEX "Reward_skillId_levelReq_orderIndex_key" ON "Reward"("skillId", "levelReq", "orderIndex");
