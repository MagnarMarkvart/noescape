-- Calendar due days on quests and their subtasks.
ALTER TABLE "Quest" ADD COLUMN "deadline" TEXT;
ALTER TABLE "QuestSubtask" ADD COLUMN "deadline" TEXT;
