-- Live timer source of truth + Consuetudo walk notes.
CREATE TABLE "LiveClock" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ownerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "startedAt" DATETIME,
    "endsAt" DATETIME,
    "pausedAccumMs" INTEGER NOT NULL DEFAULT 0,
    "remainingMs" INTEGER NOT NULL DEFAULT 0,
    "totalPhaseMs" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "payloadJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "LiveClock_ownerId_kind_key" ON "LiveClock"("ownerId", "kind");
CREATE INDEX "LiveClock_ownerId_idx" ON "LiveClock"("ownerId");
CREATE INDEX "LiveClock_status_idx" ON "LiveClock"("status");

ALTER TABLE "RoutineRun" ADD COLUMN "notes" TEXT NOT NULL DEFAULT '';
