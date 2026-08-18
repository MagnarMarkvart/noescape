-- Consuetudo (Practice): named routines with timed steps and completion logs.
CREATE TABLE "Routine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "effortLevel" INTEGER NOT NULL DEFAULT 5,
    "skillWeightsJson" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "RoutineStep" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "routineId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "icon" TEXT,
    "durationMinutes" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "RoutineStep_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "Routine" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "RoutineRun" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "routineId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "completedCount" INTEGER NOT NULL DEFAULT 0,
    "plannedSeconds" INTEGER NOT NULL DEFAULT 0,
    "elapsedMs" BIGINT NOT NULL DEFAULT 0,
    "baseXp" INTEGER NOT NULL DEFAULT 0,
    "bonusXp" INTEGER NOT NULL DEFAULT 0,
    "xpAwarded" INTEGER NOT NULL DEFAULT 0,
    "activityIdsJson" TEXT,
    CONSTRAINT "RoutineRun_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "Routine" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "RoutineStepLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runId" INTEGER NOT NULL,
    "stepId" INTEGER,
    "title" TEXT NOT NULL,
    "icon" TEXT,
    "plannedSeconds" INTEGER NOT NULL,
    "elapsedMs" BIGINT NOT NULL DEFAULT 0,
    "outcome" TEXT NOT NULL,
    "deltaMs" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "RoutineStepLog_runId_fkey" FOREIGN KEY ("runId") REFERENCES "RoutineRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RoutineStepLog_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "RoutineStep" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "RoutineStep_routineId_idx" ON "RoutineStep"("routineId");
CREATE INDEX "RoutineRun_routineId_idx" ON "RoutineRun"("routineId");
CREATE INDEX "RoutineRun_date_idx" ON "RoutineRun"("date");
CREATE INDEX "RoutineStepLog_runId_idx" ON "RoutineStepLog"("runId");
