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
- UI Scriptorium: `http://localhost:4200/scriptorium`
- UI Tabularium: `http://localhost:4200/tabularium`

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
- `GET /horologium/sessions?date=YYYY-MM-DD` — finished Sessio/Track **and** completed Consuetudo walks (`kind: 'consuetudo'`). Walk step detail stays on the Consuetudo walk log; Horo Log only links there.
- `GET /horologium/sessions/calendar?from=&to=`
- `POST /horologium/blocks` `{ workMinutes, restMinutes, mode, presetId? }`
- `POST /horologium/goal-bonus` `{ workMinutes, restMinutes, iterations, presetId? }`

Live timer state (pause/resume across refresh) is **not** in those session rows. It lives on `/clocks`:

- `GET /clocks` — snapshots + `serverNow` (Sessio, Track, Consuetudo, running Vigilia watches)
- `GET /clocks/stream` — SSE `clock.snapshot` events
- `POST /clocks/sessio/start` · `POST /clocks/track/start`
- `POST /clocks/consuetudo/start` `{ routineId }`
- `POST /clocks/vigilia/start|pause` `{ watchId }`
- `POST /clocks/:kind/pause|resume|skip|stop`
- `POST /clocks/consuetudo/complete-step` · `skip-step`
- `PATCH /clocks/:kind/notes` — live notes while a clock is running (desktop: side panel; mobile: bottom sheet with a Close control so the toggle stays reachable)
- `PATCH /clocks/:kind/bound-daily`

Consuetudo overtime: pausing after the planned duration **keeps** the negative remaining time (the dial does not snap back to `+00:00`). Resume continues from that overtime.

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

If the slot was never tracked in Horologium, the UI asks for **time spent** (`elapsedMs`) before complete. That optional body is stored as a `clockKind: 'manual'` work interval. Tracked slots skip the prompt.

Scriptorium-bound dailies cannot be edited or cleared while assigned. Completing one shelves the folio; undoing complete restores it to OPEN. Carry-over and postpone keep the bind. Sealing the day **incomplete** (without carry-over) makes the folio assignable again.

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

### Scriptorium (works vault)

Folios are dated (or undated) works on three shelves: **Imminens** / **Tempestiva** / **Cogitata**. Default catalogue lists `status=OPEN`. **Show shelves** lists archived folios too (`status=all`).

**Catalogue card actions** (icons, not a browser `confirm()`):

| Action | What it does |
|--------|----------------|
| Complete | Awards daily-formula XP from complexity × volume (skills required; unset volume counts as 45m), then **shelves** the folio. No quest or daily. |
| Assign to quest | Opens Quest Forge with the folio prefilled (`/quests/forge?scriptorium=<id>`). Creating the quest locks the folio. |
| Assign to daily | Opens Dailies (`/dailies?scriptorium=<id>`), fills a Regular slot, and locks the folio. |
| Shelve / Restore | `PATCH` `{ status: 'ARCHIVED' \| 'OPEN' }`. Shelved works stay reachable under Show shelves. |
| Erase | RPG `app-ui-confirm`, then `DELETE`. |

Assigned folios stay on the active catalogue but cannot be edited until the assignment ends. Completing the bound daily shelves them. Completing the folio itself also shelves them (they are not deleted).

Lock source of truth: `questId` **or** an incomplete daily on an **unsealed** day with `scriptoriumWorkId`. Sealed incomplete dailies do not keep the lock unless carried over.

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
- `GET /dailies/templates` · `POST /dailies/templates` · `PATCH|DELETE /dailies/templates/:id` — saved default tasks
- `GET /dailies/quick` · `POST /dailies/quick` — one-off log from Dashboard / Character (same effort × duration XP as a Regular daily)
- `POST /dailies/from-quest` `{ questId, questSubtaskId?, date? }` — fill a slot from a quest (or one subtask)
- `POST /dailies/from-scriptorium` `{ workId, date? }` — fill a slot from a Scriptorium folio and lock it
- `POST /dailies/:id/complete` `{ elapsedMs? }` — complete + award XP (optional manual elapsed when untracked)
- `POST /dailies/:id/uncomplete` — undo completion and reverse awarded XP
- `DELETE /dailies/:id` — clear an incomplete slot
- `POST /dailies/regular-slots` `{ date? }` — add an extra Regular slot (default 5, max 20)
- `POST /dailies/seal` `{ date? }` — seal the day into Quest Logs (board + skill tree snapshot)
- `POST /dailies/copy-incomplete` `{ date?, sourceDate? }` — copy **incomplete only** from last (or given) log into the target day
- `GET /dailies/logs` — sealed day list
- `GET /dailies/logs/:date` — full sealed snapshot (quests + skill tree)

### Tabularium (clicker tallies)

Separate from Horologium and Dailies. Optional quest bind only. One **tabula** is a named counter (cigarettes, water, tempers, …) with a period window and a normal band.

**Polarity**
- `vice` — less is better (green below the band, yellow inside, red above)
- `virtue` — more is better (green above the band, yellow inside, red below)

**Period:** `day` | `week` | `month` | `year` (counts sum click deltas in that window).

- `GET /tabularium?date=YYYY-MM-DD` — board (omit date = today)
- `GET /tabularium/calendar?from=&to=` — mark counts for the ledger calendar
- `GET /tabularium/log?date=YYYY-MM-DD` — day’s clicks + full board
- `GET /tabularium/:id` · `POST /tabularium` · `PATCH /tabularium/:id`
- `DELETE /tabularium/:id` — archive (clicks stay in the ledger)
- `POST /tabularium/:id/click` `{ delta? }` — add `step` (or given delta) for **today**
- `POST /tabularium/:id/undo` — remove the last **today** click

UI: catalog `/tabularium`, forge `/tabularium/new` and `/tabularium/:id`, ledger `/tabularium/log`. Dashboard has a compact clicker widget.

### Scriptorium API

- `GET /scriptorium?status=OPEN|all` — catalogue (`OPEN` is the active vault)
- `GET /scriptorium/due?days=` — open works with a due day in the window
- `GET /scriptorium/:id` — folio + `locked` / `assignedKind` (`quest` \| `daily`)
- `POST /scriptorium` · `PATCH /scriptorium/:id` — create / update (assigned folios cannot be edited)
- `POST /scriptorium/:id/complete` — award XP, then set `status=ARCHIVED`
- `DELETE /scriptorium/:id` — erase
- `POST /scriptorium/:id/subtasks` · `PATCH …/subtasks/:subId` · `DELETE …/subtasks/:subId` · `PATCH …/subtasks/order`

### Day rollover / Seal gate

Unsealed prior days with filled tasks **block** working ahead. Seal them manually first (`POST /dailies/seal`). After seal, the new day is open. **Carry Over** copies incomplete quests from the last log only.

### UI notes

Forms use Angular **Signal Forms** (`@angular/forms/signals`) — not template-driven / reactive legacy forms. Dailies skill pickers are tile-based (parent skill → subskill icons). **Effort / Complexity** in Forge views is a 1–10 slider dial (same values as the old chips). Duration still uses presets (15m→4h + custom). Default-tasks **Back** remembers whether you opened the list from Character, Dailies, or Dashboard. New Scriptorium folios save back to the catalogue (`/scriptorium`), not the folio editor.

Destructive Scriptorium confirms use the shared RPG dialog `app-ui-confirm`, not `window.confirm`. The global emoji picker (`HABIT_ICON_GROUPS` in `habit-icons.ts`) includes **Bug** (`🐛`) in Craft, next to Code. Catalogue / folio chrome icons live in `ui-icon.ts` (`quest`, `shelf`, `check`, `calendar`, `close`).
