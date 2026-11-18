-- Sessio/Track: auto-continue work↔rest, or wait for a click.
ALTER TABLE "Character" ADD COLUMN "pomodoroAutoContinue" BOOLEAN NOT NULL DEFAULT true;
