-- Scriptorium: vault of works, notions, and dated projects.
CREATE TABLE "ScriptoriumWork" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "icon" TEXT,
    "tier" TEXT NOT NULL DEFAULT 'COGITATA',
    "dueDate" TEXT,
    "durationMinutes" INTEGER,
    "effort" INTEGER NOT NULL DEFAULT 5,
    "skillWeightsJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "questId" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScriptoriumWork_questId_fkey" FOREIGN KEY ("questId") REFERENCES "Quest" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "ScriptoriumSubtask" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ScriptoriumSubtask_workId_fkey" FOREIGN KEY ("workId") REFERENCES "ScriptoriumWork" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ScriptoriumWork_status_idx" ON "ScriptoriumWork"("status");
CREATE INDEX "ScriptoriumWork_tier_idx" ON "ScriptoriumWork"("tier");
CREATE INDEX "ScriptoriumWork_dueDate_idx" ON "ScriptoriumWork"("dueDate");
CREATE INDEX "ScriptoriumWork_questId_idx" ON "ScriptoriumWork"("questId");
CREATE INDEX "ScriptoriumSubtask_workId_idx" ON "ScriptoriumSubtask"("workId");

ALTER TABLE "HorologiumWatch" ADD COLUMN "scriptoriumWorkId" INTEGER;
CREATE INDEX "HorologiumWatch_scriptoriumWorkId_idx" ON "HorologiumWatch"("scriptoriumWorkId");
