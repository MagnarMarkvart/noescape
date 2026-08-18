-- AlterTable
ALTER TABLE "Character" ADD COLUMN "dateFormat" TEXT NOT NULL DEFAULT 'DMY';
ALTER TABLE "Character" ADD COLUMN "weekStartsOn" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "HorologiumPreset" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "label" TEXT NOT NULL,
    "workMinutes" INTEGER NOT NULL,
    "restMinutes" INTEGER NOT NULL,
    "iterations" INTEGER NOT NULL,
    "restAfterLast" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
