import { bestOf, isBetter, xpForAttempt, XP_FIRST, XP_PB, XP_TARGET } from './palmares.logic';

describe('palmares logic', () => {
  it('compares in the right direction', () => {
    expect(isBetter(12, 10, true)).toBe(true);
    expect(isBetter(9, 10, true)).toBe(false);
    expect(isBetter(9, 10, false)).toBe(true);
    expect(isBetter(5, null, true)).toBe(true);
    expect(bestOf([3, 9, 4], true)).toBe(9);
    expect(bestOf([3, 9, 4], false)).toBe(3);
  });

  it('pays baseline, PB and one-time target bonus', () => {
    expect(xpForAttempt(8, null, 15, true)).toEqual({ pb: true, xp: XP_FIRST, targetReached: false });
    expect(xpForAttempt(7, 8, 15, true)).toEqual({ pb: false, xp: 0, targetReached: false });
    expect(xpForAttempt(16, 8, 15, true)).toEqual({ pb: true, xp: XP_PB + XP_TARGET, targetReached: true });
    expect(xpForAttempt(18, 16, 15, true)).toEqual({ pb: true, xp: XP_PB, targetReached: false });
  });
});
