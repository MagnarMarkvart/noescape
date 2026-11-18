-- Log-day start hour and 12/24h clock on the player profile.

ALTER TABLE "Character" ADD COLUMN "timeFormat" TEXT NOT NULL DEFAULT 'H24';
ALTER TABLE "Character" ADD COLUMN "dayStartHour" INTEGER NOT NULL DEFAULT 0;
