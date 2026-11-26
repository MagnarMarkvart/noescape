import { mergeContiguous } from './work-intervals.service';

const row = (id: number, start: string, end: string, ms: number) => ({
  id,
  clockKind: 'sessio',
  watchId: null,
  dailyTaskId: 7,
  questRunId: null,
  questSubtaskId: null,
  questId: null,
  scriptoriumWorkId: null,
  startedAt: new Date(start),
  endedAt: new Date(end),
  elapsedMs: ms,
});

describe('mergeContiguous', () => {
  it('collapses back-to-back flushes into one session row', () => {
    const rows = [
      row(3, '2026-08-27T11:34:00Z', '2026-08-27T11:35:00Z', 60_000),
      row(2, '2026-08-27T11:33:00Z', '2026-08-27T11:34:00Z', 60_000),
      row(1, '2026-08-27T11:23:00Z', '2026-08-27T11:33:00Z', 600_000),
    ];
    const merged = mergeContiguous(rows);
    expect(merged).toHaveLength(1);
    expect(merged[0].elapsedMs).toBe(720_000);
    expect(merged[0].startedAt.toISOString()).toBe('2026-08-27T11:23:00.000Z');
  });

  it('keeps rows separated by a pause apart', () => {
    const rows = [
      row(2, '2026-08-27T12:00:00Z', '2026-08-27T12:10:00Z', 600_000),
      row(1, '2026-08-27T11:23:00Z', '2026-08-27T11:48:00Z', 1_500_000),
    ];
    expect(mergeContiguous(rows)).toHaveLength(2);
  });

  it('never merges different targets', () => {
    const other = {
      ...row(2, '2026-08-27T11:33:00Z', '2026-08-27T11:34:00Z', 60_000),
      dailyTaskId: 8,
    };
    const rows = [
      row(3, '2026-08-27T11:34:00Z', '2026-08-27T11:35:00Z', 60_000),
      other,
    ];
    expect(mergeContiguous(rows)).toHaveLength(2);
  });
});
