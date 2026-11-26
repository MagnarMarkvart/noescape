import { LOOT_TABLE, ROLL_MAX, itemForRoll } from './loot.table';

describe('loot table', () => {
  it('covers 1..100000 without gaps or overlaps', () => {
    let next = 1;
    for (const item of LOOT_TABLE) {
      expect(item.from).toBe(next);
      expect(item.to).toBeGreaterThanOrEqual(item.from);
      next = item.to + 1;
    }
    expect(next - 1).toBe(ROLL_MAX);
  });

  it('maps rolls to rarer items as they rise', () => {
    expect(itemForRoll(1).tier).toBe('common');
    expect(itemForRoll(60_001).tier).toBe('uncommon');
    expect(itemForRoll(90_000).tier).toBe('rare');
    expect(itemForRoll(99_000).tier).toBe('epic');
    expect(itemForRoll(99_800).tier).toBe('legendary');
    expect(itemForRoll(99_995).tier).toBe('mythic');
    expect(itemForRoll(99_999).key).toBe('the-last-ember');
    expect(itemForRoll(100_000).key).toBe('the-last-ember');
  });
});
