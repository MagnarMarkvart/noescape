-- Split Menu Auto-Toggle into independent mobile / desktop flags (both on by default).
ALTER TABLE "Character" ADD COLUMN "menuAutoToggleMobile" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Character" ADD COLUMN "menuAutoToggleDesktop" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Character" DROP COLUMN "menuAutoToggle";
