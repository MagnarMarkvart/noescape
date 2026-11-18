# Plan: Quest Task Picker in Dailies Setup

**Feature:** In the Dailies Setup form, add a quest task picker that lets the user select a quest subtask OR the quest's main "daily work" slice and fill the slot form with its data.

## Changes (one atomic feature)

### 1. Backend DTO — `UpsertDailyTaskDto`
**File:** `no-escape-back/src/dailies/dto/upsert-daily-task.dto.ts`

Add two optional fields:
```typescript
questId?: number | null;
questSubtaskId?: number | null;
```

### 2. Backend Service — `DailiesService.upsertSlot()`
**File:** `no-escape-back/src/dailies/dailies.service.ts`

In the `upsertSlot` method (around line 422-490), when creating/updating the DailyTask record via Prisma, include the quest-link fields from the DTO:
- `questId` — set from dto.questId when provided
- `questSubtaskId` — set from dto.questSubtaskId when provided
- `questBindKind` — set to `'subtask'` when questSubtaskId > 0, or `'daily_work'` when only questId > 0
- `questRunId` — look up the active QuestRun for this quest (QuestRun where questId matches AND status === 'ACTIVE'). If found, set it. If not found, leave null.

The run lookup already exists in `fromQuest()` — just replicate the `findFirst({ where: { questId, status: 'ACTIVE' } })` pattern.

Also update the Prisma `update` branch (when the slot already exists) to accept the same fields so editing a quest-linked slot preserves the link.

### 3. Frontend Model — `SlotFormModel`
**File:** `NoEscape-UI/src/app/dailies/daily.model.ts`

Add quest link fields:
```typescript
questId: number;        // 0 = not set
questSubtaskId: number; // 0 = not set
```

### 4. Frontend Model — `UpsertDailyTaskPayload`
**File:** `NoEscape-UI/src/app/dailies/daily.model.ts`

Add optional quest fields:
```typescript
questId?: number | null;
questSubtaskId?: number | null;
```

### 5. NEW Component — `QuestTaskPicker`
**File:** `NoEscape-UI/src/app/dailies/quest-task-picker.ts`

A searchable quest picker component.

**Behavior:**
- Fetches active quests with full details (including subtasks) via `GET /quests?filter=active` — returns QuestView[] which has `.subtasks: QuestSubtaskView[]`
- Shows a search input + results list
- Each quest is a collapsible group with:
  - Quest name + tier badge + progress info
  - "Add daily work" row (shown when quest has dailyWorkMinutes or subtasks exist) — labeled with quest.dailyWorkTitle or "Daily work" fallback, with estimated duration
  - Subtask list — each subtask shows title + estimateMinutes if set
- Clicking any row emits `{ title, questId, questSubtaskId, skillWeights, durationMinutes, effortLevel }`
- effortLevel = 5 (default)
- skillWeights = parsed from quest.skillWeightsJson (already comes as QuestSkillShareView[] with slug/weight)
- durationMinutes = subtask.estimateMinutes || quest.dailyWorkMinutes || 45
- title = subtask.title || quest.dailyWorkTitle || quest.journeyLabel || quest.name
- Matches the existing RuneScape dark theme styling (same as default-task-picker)

**Search matching:** matches against quest name, subtask titles, skill names — case-insensitive.

**Layout:** Similar visual style to `DefaultTaskPicker` — dark background, gold borders, serif font for titles, muted meta text.

### 6. Frontend Page — `DailiesPage`
**File:** `NoEscape-UI/src/app/dailies/dailies-page.ts`

Changes:
- Import `QuestTaskPicker` and add to component `imports` array
- Add `applyQuestTask(pick: QuestTaskPick)` method:
  ```typescript
  protected applyQuestTask(pick: { title: string; questId: number; questSubtaskId?: number; skillWeights: Array<{slug: string; weight: number}>; durationMinutes: number; effortLevel: number }): void {
    const skillId = ... // resolve from skillWeights[0] slug via allSkills()
    this.slotModel.set({
      ...this.blankModel(),
      title: pick.title,
      skillId: skillId,
      skillWeights: pick.skillWeights,
      effortLevel: pick.effortLevel,
      durationMinutes: pick.durationMinutes,
      questId: pick.questId,
      questSubtaskId: pick.questSubtaskId ?? 0,
    });
    // Auto-select the first skill's category
    const slug = pick.skillWeights[0]?.slug;
    if (slug) {
      const skill = this.allSkills().find(s => s.slug === slug);
      if (skill) {
        this.selectedCategory.set(skill.category);
      }
    }
  }
  ```

### 7. Frontend Template — `dailies-page.html`
**File:** `NoEscape-UI/src/app/dailies/dailies-page.html`

Add the quest picker to the form, after the `<app-default-task-picker>` element and before the habit selector:

```html
<app-quest-task-picker (pick)="applyQuestTask($event)" />
```

### 8. Frontend — `saveSlot()` method
**File:** `NoEscape-UI/src/app/dailies/dailies-page.ts`

In the `upsertSlot` call, pass questId and questSubtaskId from the model when set:
```typescript
questId: model.questId > 0 ? model.questId : null,
questSubtaskId: model.questSubtaskId > 0 ? model.questSubtaskId : null,
```

### 9. Frontend — `blankModel()` method
Update the blank model to include default values for quest fields:
```typescript
questId: 0,
questSubtaskId: 0,
```

### 10. Frontend — `DailiesService.upsertSlot()` payload type
**File:** `NoEscape-UI/src/app/dailies/dailies.service.ts`

The `upsertSlot` method already passes the full payload to the PUT endpoint. Since `UpsertDailyTaskPayload` will include the new quest fields, and TypeScript interfaces are structural, no change needed here — the extra fields flow through.

## Scope: ONE atomic feature
- One backend DTO change
- One backend service change (~15 lines)
- One new frontend component (quest-task-picker.ts, ~200 lines)
- Two model interface updates (daily.model.ts)
- One page TS update (dailies-page.ts)
- One template update (dailies-page.html)

## What this does NOT do
- Does NOT change the `fromQuest` endpoint (that's for auto-slot-assignment from outside setup)
- Does NOT change how quest-subtask binding works for Horologium tracking — the existing fields on DailyTask handle that
- Does NOT add new API endpoints — reuses the existing `upsertSlot` flow with extra quest fields
