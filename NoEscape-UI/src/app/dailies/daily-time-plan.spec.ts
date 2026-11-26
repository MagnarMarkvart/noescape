import { autoPlan, fromMinutes, toMinutes } from './daily-time-plan';

describe('time plan', () => {
  it('parses and formats HH:MM', () => {
    expect(toMinutes('07:30')).toBe(450);
    expect(toMinutes('')).toBeNull();
    expect(fromMinutes(450)).toBe('07:30');
  });

  it('fills untimed tasks in order around fixed ones', () => {
    const plan = autoPlan(
      [
        { id: 1, start: null, duration: 60 },
        { id: 2, start: 9 * 60, duration: 30 }, // fixed 09:00-09:30
        { id: 3, start: null, duration: 45 },
      ],
      8 * 60,
    );
    expect(fromMinutes(plan.get(1)!)).toBe('08:00');
    expect(fromMinutes(plan.get(3)!)).toBe('09:30');
    expect(plan.has(2)).toBe(false);
  });
});
