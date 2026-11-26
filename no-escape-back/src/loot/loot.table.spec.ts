import {
  FIND_FROM,
  LOOT_TABLE,
  ROLL_MAX,
  XP_BONUS_CAP,
  itemForScore,
  oddsOf,
  scoreFor,
} from './loot.table';

describe('loot table', () => {
  it('covers FIND_FROM..1000000 without gaps or overlaps', () => {
    let next = FIND_FROM;
    for (const item of LOOT_TABLE) {
      expect(item.from).toBe(next);
      expect(item.to).toBeGreaterThanOrEqual(item.from);
      next = item.to + 1;
    }
    expect(next - 1).toBe(ROLL_MAX);
    expect(ROLL_MAX).toBe(1_000_000);
  });

  it('finds nothing on most scores and rarer items higher up', () => {
    expect(itemForScore(1)).toBeNull();
    expect(itemForScore(506_789)).toBeNull();
    expect(itemForScore(FIND_FROM - 1)).toBeNull();
    expect(itemForScore(FIND_FROM)?.tier).toBe('common');
    expect(itemForScore(993_000)?.tier).toBe('uncommon');
    expect(itemForScore(998_000)?.tier).toBe('rare');
    expect(itemForScore(999_500)?.tier).toBe('epic');
    expect(itemForScore(999_900)?.tier).toBe('legendary');
    expect(itemForScore(999_960)?.tier).toBe('mythic');
    expect(itemForScore(999_990)?.key).toBe('the-last-ember');
    expect(itemForScore(1_000_000)?.key).toBe('the-last-ember');
  });

  it('any find is about 2% of zero-XP drops; each tier rarer than the one below', () => {
    const total = LOOT_TABLE.reduce((n, i) => n + oddsOf(i), 0);
    expect(total).toBeCloseTo(0.02, 4);
    const order = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'unique'];
    const byTier = order.map((t) =>
      LOOT_TABLE.filter((i) => i.tier === t).reduce((n, i) => n + oddsOf(i), 0),
    );
    for (let k = 1; k < byTier.length; k++) {
      expect(byTier[k]).toBeLessThan(byTier[k - 1]);
    }
  });

  it('adds the XP of the drop to the roll', () => {
    expect(scoreFor(506_789, 1000)).toBe(507_789);
    expect(scoreFor(979_500, 600)).toBe(980_100);
  });

  it('caps the XP bonus and forfeits it on overflow instead of clamping', () => {
    expect(scoreFor(100, 50_000)).toBe(100 + XP_BONUS_CAP);
    expect(scoreFor(999_500, 1000)).toBe(999_500);
    expect(scoreFor(1_000_000, 5)).toBe(1_000_000);
    expect(scoreFor(10, -5)).toBe(10);
  });

  it('keeps the unique item rare even for big drops (Monte Carlo over all rolls)', () => {
    // Exact: count rolls whose score is unique, for a 1000 XP drop.
    let unique = 0;
    for (let roll = ROLL_MAX - 3000; roll <= ROLL_MAX; roll++) {
      if (itemForScore(scoreFor(roll, 1000))?.tier === 'unique') unique++;
    }
    expect(unique).toBeLessThanOrEqual(22); // at most double the base 11
  });
});
