-- AlterTable
ALTER TABLE "HorologiumSession" ADD COLUMN "outcome" TEXT NOT NULL DEFAULT 'complete';
ALTER TABLE "HorologiumSession" ADD COLUMN "endedEarly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "HorologiumSession" ADD COLUMN "elapsedMinutes" INTEGER;
ALTER TABLE "HorologiumSession" ADD COLUMN "questRunId" INTEGER;
ALTER TABLE "HorologiumSession" ADD COLUMN "taskLabel" TEXT;
ALTER TABLE "HorologiumSession" ADD COLUMN "focusXpAwarded" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "HorologiumSession" ADD COLUMN "disciplineXpAwarded" INTEGER NOT NULL DEFAULT 0;
