# Plans — backlog round 26 Nov 2026

Two backlog items were too large or too ambiguous to build blind. These are the proposed designs.

## 1. "Project DB"

**What it probably means:** one place that holds a *project* — a long-lived thing like "Thesis" or "Renovate kitchen" —
and everything attached to it. Today that is spread across Quests (goals + subtasks), Scriptorium works (writing/folios),
Inventarium lists, Horologium watches and Dailies.

**Proposed v1 (additive schema only):**
- `Project { id, name, icon, status OPEN|PAUSED|DONE, notes, color, sortOrder, createdAt, updatedAt }`
- Nullable `projectId` on `Quest`, `ScriptoriumWork`, `List`, `HorologiumWatch`, `PalmaresRecord`.
- `GET /projects/:id` aggregates: open quests and subtasks, scriptorium works, lists, total tracked time
  (WorkInterval + Horologium sessions through the linked items), XP earned from linked activities, last activity.
- UI: a "Projecta" page — catalogue cards plus a detail page with tabs (Overview / Quests / Scriptorium / Lists / Time).
  Each forge gets an optional "Project" select.
- No data migration needed: existing rows simply have `projectId = null`.

**Open question for Magnar:** is "Project DB" this grouping layer, or a Notion-style free-form database (custom columns)?
The grouping layer is far cheaper and fits the RPG model. A custom-column database is a separate product.

## 17. Combining Habitus and Tabularium

They overlap: Habitus = check/tally habits per day with streaks, calendar, quest links and XP. Tabularium = clicker tallies
per day/week/month/year with a vice/virtue polarity and a norm band.

**Proposal: keep one engine (Habitus) and fold Tabularium into it as habit "kinds".**
1. Add nullable fields to `Habit`: `period` (day|week|month|year, default day), `polarity` (virtue|vice),
   `normMin`, `normMax`, `step`. Today's tally habit = `period=day, polarity=virtue`.
2. A one-off, idempotent migration endpoint copies each `Tabula` → `Habit(kind=tally)` and each `TabulaClick` → `HabitLog`,
   storing `migratedFromTabulaId`. Tabula rows are **not deleted**; they are marked `archived=true`, so it can be rolled back.
3. Habitus UI gets a period switch (Day / Week / Month / Year) and colours vice tallies red when over the norm.
   The calendar already supports per-day icons.
4. `/tabularium` redirects to `/habitus?kind=tally` for one release, then the nav link goes away.
5. Log archive (Settings → Logs) keeps the `tabularium` kind read-only until the migration is confirmed.

Risk: the streak semantics for weekly/monthly vices need a decision (a "clean week" streak instead of a daily streak).
Effort: about 1.5–2 days including e2e. Not started; it needs Magnar's OK because it touches real data.
