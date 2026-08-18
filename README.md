# No Escape

Life RPG — real-world skills, RuneScape-shaped progression, daily quest log.

## Quick start

```bash
npm install
npm install --prefix no-escape-back
npm install --prefix NoEscape-UI
cp no-escape-back/.env.example no-escape-back/.env
npm run db:migrate
npm run db:seed
npm run dev
```

- Backend: `http://localhost:3000`
- UI Dashboard: `http://localhost:4200/status`
- UI Dailies: `http://localhost:4200/dailies`

---

## XP & progression formulas

All XP math lives in the backend under `no-escape-back/src/xp/`.

### Skill levels (1 → 99) — exact OSRS curve

Max level is **99**. Same formula as Old School RuneScape
([Experience](https://oldschool.runescape.wiki/w/Experience)):

```
xpForLevel(1) = 0
xpForLevel(L) = floor( (1/4) * sum_{n=1}^{L-1} floor(n + 300 * 2^(n/7)) )
```

XP needed roughly doubles every 7 levels. Famous checkpoint: **92 is half of 99**.

| Milestone | Cumulative XP (`xpForLevel`) |
|-----------|------------------------------|
| Level 2   | 83 |
| Level 50  | 101,333 |
| Level 92  | **6,517,253** (≈ 50% to 99) |
| Level 99  | **13,034,431** |

So a skill at 0 XP is level 1. Hitting 13,034,431 XP maxes the skill.

Level from XP:

```
level = largest L in 1..99 such that xpForLevel(L) ≤ currentXp
```

Progress bar within a level:

```
intoLevel = xp - xpForLevel(level)
needed    = xpForLevel(level + 1) - xpForLevel(level)
percent   = intoLevel / needed × 100
```

### Manual activity log

`POST /skills/:id/activities` awards the XP amount you send (no extra multiplier). Used for ad-hoc training outside Dailies.

### Horologium (deep-work timer) XP

Independent of Dailies. Awards Focus XP (`slug: focus`).

**Modes**
- **Track (adhoc):** open-ended work/rest loops. Block XP only (low rate). No goal bonus.
- **Sessio (planned):** set iterations. Each finished work block pays planned block XP. Finishing *all* iterations pays a goal bonus. Abort early → block XP only, never the bonus.

**Per finished work block**
```
XP = max(1, round(workMinutes × RATE × restMult × workLengthMult × modeMult))

RATE = 1 XP / work minute

restMult (rest length):
  ≤ 5 min  → 1.00×  (best; plateaus below 5)
  5–35 min → lerp 1.00 → 0.45
  ≥ 35 min → 0.45×  (worst; plateaus above 35)

workLengthMult:
  ≤ 10 → 0.85× · ≤ 20 → 1.00× · ≤ 35 → 1.20× · else 1.40×

modeMult:
  planned → 1.00×
  adhoc   → 0.35×
```

**Goal bonus** (planned, full finish only):
```
goalBonus = round(blockXp × iterations × 1.5)
```

API:

- `GET /horologium/preview?workMinutes=&restMinutes=&iterations=&mode=planned|adhoc`
- `GET /horologium/sessions`
- `POST /horologium/blocks` `{ workMinutes, restMinutes, mode, presetId? }`
- `POST /horologium/goal-bonus` `{ workMinutes, restMinutes, iterations, presetId? }`

### Dailies board structure

Each day has a fixed **1 / 3 / 5** slot layout (Most Important / Important / Regular). Slot tier is **layout only** — it does not change XP.

Each filled slot has:

- title
- linked **subskill** (`skillId`)
- **effort** 1–10
- **duration** in minutes

Source of truth for the formula: `no-escape-back/src/xp/daily-xp.util.ts` (UI copy: `NoEscape-UI/src/app/dailies/daily-xp.ts`).

### Daily task XP formula

Every billed minute is worth an effort-scaled rate. Duration past **8 hours** (480 minutes) is ignored — longer tasks do not grant extra XP.

```
billedMinutes = clamp(floor(durationMinutes), 0, 480)
XP            = billedMinutes × xpPerMinute(effort)
```

**xpPerMinute(effort)**

| Effort | XP / minute | How it is derived |
|--------|-------------|-------------------|
| 1 | **1** | `2^(effort−1)` |
| 2 | **2** | powers of two |
| 3 | **4** | |
| 4 | **8** | |
| 5 | **16** | last doubling |
| 6 | **31** | 16 + 15×1 |
| 7 | **46** | 16 + 15×2 |
| 8 | **61** | 16 + 15×3 |
| 9 | **76** | 16 + 15×4 |
| 10 | **100** | special peak (not +15 from 9) |

```
xpPerMinute(e):
  if e <= 5:  2^(e − 1)
  if e == 10: 100
  else:       16 + 15 × (e − 5)    # e = 6..9
```

#### Examples

| Task | Effort | Duration | XP |
|------|--------|----------|----|
| Showering | 1 | 15 min | 15 |
| Typical block | 5 | 45 min | 720 |
| Hard hour | 8 | 60 min | 3,660 |
| Deep work | 10 | 3 h | 18,000 |
| Full-day grind | 5 | 9 h | 7,680 (capped at 8 h × 16) |

Completing a daily task:

1. Computes XP with the formula above
2. Splits that XP across the task’s skills using the same **10-point weight** split as quests (largest remainder so the pieces still add up to the full reward)
3. Awards each share to its skill (same progression curve)
4. Writes an `Activity` note like `Daily: <title>` per skill
5. Locks the slot (completed tasks cannot be edited)

### Consuetudo (practice) XP

Walking a routine in Horologium uses the **same duration × effort rate** as dailies, billed from **completed** (not skipped) planned minutes. Finishing the whole practice adds a bonus that shrinks with skips:

```
baseXp  = billedMinutes(completed steps) × xpPerMinute(effort)
bonus   = skipRatio > 0.5 ? 0
        : round(baseXp × 0.5 × (1 − skipRatio / 0.5))
totalXp = baseXp + bonus
```

`skipRatio = skippedSteps / totalSteps`. More than half skipped → no bonus. Total XP is then split with the same 10-point skill weights as dailies and quests.

Source of truth: `no-escape-back/src/xp/consuetudo-xp.util.ts`.

---

## API sketch

### Skills

- `GET /skills` — flat list
- `GET /skills/tree` — categories + progress
- `GET /skills/:id`
- `GET /skills/:id/activities`
- `POST /skills/:id/activities` `{ xpGained, duration?, note? }`
- `GET /skills/level-ups?page=&pageSize=` — paginated level-up log

### Dailies

- `GET /dailies?date=YYYY-MM-DD` — board for a day (auto-seals any older unlogged days into Quest Logs)
- `PUT /dailies/slots` — create/update a slot
- `POST /dailies/:id/complete` — complete + award XP
- `POST /dailies/:id/uncomplete` — undo completion and reverse awarded XP
- `DELETE /dailies/:id` — clear an incomplete slot
- `POST /dailies/regular-slots` `{ date? }` — add an extra Regular slot (default 5, max 20)
- `POST /dailies/seal` `{ date? }` — seal the day into Quest Logs (board + skill tree snapshot)
- `POST /dailies/copy-incomplete` `{ date?, sourceDate? }` — copy **incomplete only** from last (or given) log into the target day
- `GET /dailies/logs` — sealed day list
- `GET /dailies/logs/:date` — full sealed snapshot (quests + skill tree)

### Day rollover / Seal gate

Unsealed prior days with filled tasks **block** working ahead. Seal them manually first (`POST /dailies/seal`). After seal, the new day is open. **Carry Over** copies incomplete quests from the last log only.

### UI notes

Forms use Angular **Signal Forms** (`@angular/forms/signals`) — not template-driven / reactive legacy forms. Dailies skill / effort / duration pickers are tile-based (parent skill → subskill icons; effort 1–10; duration 15m→4h + custom).
