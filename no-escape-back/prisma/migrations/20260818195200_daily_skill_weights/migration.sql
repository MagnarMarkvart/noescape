-- Multi-skill dailies: 10-point weights on tasks and defaults.
ALTER TABLE "DailyTask" ADD COLUMN "skillWeightsJson" TEXT;
ALTER TABLE "DailyTask" ADD COLUMN "activityIdsJson" TEXT;
ALTER TABLE "DailyTaskTemplate" ADD COLUMN "skillWeightsJson" TEXT;
