# Loot (Collectanea) — odds and rules

This is internal reference only. **The app never shows odds, ranges, rolls or percentages.** The player just plays and now and then finds something.

## How a drop works

1. **One user action = one XP drop = one roll.** Every HTTP request runs inside a loot scope (`LootScopeInterceptor`, AsyncLocalStorage).
   - Each `SkillsService.awardXp` call inside that request adds its XP to the scope.
   - When the request finishes, the summed XP gets exactly one roll.
   - A task that trains three skills is therefore still one roll.
   - XP awarded outside a request (background jobs) rolls once per award.
2. `roll` is a cryptographically random integer from 1 to 1 000 000.
3. `score = roll + bonus`:
   - `bonus = min(XP of the drop, 10 000)`.
   - Example: a 1000 XP drop with roll 506 789 gives score 507 789.
   - **Overflow rule:** if `roll + bonus > 1 000 000`, the bonus is forfeited and `score = roll`. It is not clamped, because clamping would push every overflow onto the unique item. A 1000 XP drop would then find it about 1 in 1000 times, more often than a legendary.
4. Scores below 980 000 find nothing, which covers about 98% of drops. Only drops that find an item are stored, in `CollectibleDrop` with `roll`, `score` and `xpGained`.

Rows from before this change (the old 1–100 000 table, where every roll found something) are kept as they are. They have `score = null`, and their item is looked up by `itemKey`.

## Thresholds

Odds below are per drop with 0 XP bonus. A bonus of B moves the whole window down by B: a 1000 XP drop finds *something* about 2.1% of the time instead of 2.0%. Within the top B values the density is at most doubled, because of the overflow rule.

| Tier | Score range | Items | Each item | Tier odds | ≈ 1 in |
|---|---|---|---|---|---|
| nothing | 1 – 979 999 | — | — | 98.0% | — |
| common | 980 000 – 991 999 | 6 | 2 000 values | 1.2% | 83 |
| uncommon | 992 000 – 997 199 | 5 | 1 040 values | 0.52% | 192 |
| rare | 997 200 – 999 199 | 4 | 500 values | 0.20% | 500 |
| epic | 999 200 – 999 799 | 4 | 150 values | 0.06% | 1 667 |
| legendary | 999 800 – 999 949 | 3 | 50 values | 0.015% | 6 667 |
| mythic | 999 950 – 999 989 | 1 (Relic of the Unbroken) | 40 values | 0.004% | 25 000 |
| unique | 999 990 – 1 000 000 | 1 (The Last Ember) | 11 values | 0.0011% | ~90 900 |

The whole find band is about 2.0% (1 in 50 drops). At around 15 XP drops a day that is roughly 2 finds a week, mostly commons. A rare comes about once a month, an epic about every 4 months, and a legendary about once a year.

Item-level ranges are in `no-escape-back/src/loot/loot.table.ts`. Unit tests check that there are no gaps or overlaps, that each tier is rarer than the one below, and the overflow rule.
