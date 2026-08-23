-- Catalog click: land in scenery by default, or the Horologium dial.
ALTER TABLE "Character" ADD COLUMN "consuetudoStartInScenery" BOOLEAN NOT NULL DEFAULT true;
