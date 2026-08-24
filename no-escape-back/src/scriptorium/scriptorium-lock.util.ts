import { PrismaService } from '../prisma/prisma.service';

export type ScriptoriumDailyBind = {
  id: number;
  date: string;
};

/** Incomplete dailies on unsealed days that still lock a Scriptorium work. */
export async function findActiveScriptoriumDailies(
  prisma: PrismaService,
  workIds: number[],
): Promise<Map<number, ScriptoriumDailyBind>> {
  const ids = [...new Set(workIds.filter((id) => Number.isInteger(id) && id > 0))];
  const result = new Map<number, ScriptoriumDailyBind>();
  if (ids.length === 0) {
    return result;
  }

  const tasks = await prisma.dailyTask.findMany({
    where: {
      scriptoriumWorkId: { in: ids },
      completed: false,
    },
    select: {
      id: true,
      date: true,
      scriptoriumWorkId: true,
    },
  });
  if (tasks.length === 0) {
    return result;
  }

  const dates = [...new Set(tasks.map((row) => row.date))];
  const logs = await prisma.dailyLog.findMany({
    where: { date: { in: dates } },
    select: { date: true },
  });
  const sealed = new Set(logs.map((row) => row.date));

  for (const task of tasks) {
    const workId = task.scriptoriumWorkId;
    if (workId == null || sealed.has(task.date) || result.has(workId)) {
      continue;
    }
    result.set(workId, { id: task.id, date: task.date });
  }
  return result;
}
