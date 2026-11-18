# Lists Feature Implementation Plan

## Overview

The Lists feature provides users with a flexible list management system modeled after the existing Scriptorium module. Users can create multiple lists (e.g., shopping, tasks, books), add items, mark them done, and benefit from intelligent suggestions based on previously completed items.

## Requirements Summary

1. **Core list operations**: Create/delete lists, assign icons, add/remove/mark done items
2. **Item memory system**: Remember completed items, suggest them for re-adding
3. **Memory toggle**: Per-list setting to enable/disable suggestions (default: ON)
4. **Smart suggestions**: Rank by frequency + recency, no duplicates
5. **Catalog view**: Accordion-style preview with one "main" list expanded by default
6. **Single view**: Full list management page

## Data Model

### Database Schema (Prisma)

```prisma
model List {
  id                  Int               @id @default(autoincrement())
  name                String
  icon                String?
  isMain              Boolean           @default(false)
  suggestionsEnabled  Boolean           @default(true)
  sortOrder           Int               @default(0)
  createdAt           DateTime          @default(now())
  updatedAt           DateTime          @updatedAt
  items               ListItem[]
  itemMemory          ListItemMemory[]
  
  @@index([sortOrder])
}

model ListItem {
  id          Int      @id @default(autoincrement())
  listId      Int
  list        List     @relation(fields: [listId], references: [id], onDelete: Cascade)
  title       String
  done        Boolean  @default(false)
  sortOrder   Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@index([listId])
  @@index([listId, done])
}

model ListItemMemory {
  id          Int      @id @default(autoincrement())
  listId      Int
  list        List     @relation(fields: [listId], references: [id], onDelete: Cascade)
  title       String
  lastUsedAt  DateTime @default(now())
  useCount    Int      @default(1)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@unique([listId, title])
  @@index([listId])
  @@index([listId, lastUsedAt])
}
```

### Design Decisions

1. **No deduplication in active items**: Users can add the same item multiple times to the active list (e.g., "Milk" twice if they need two cartons)
2. **Case-sensitive memory**: "Bread" and "bread" are different entries to preserve user intent
3. **Memory persistence**: Completed items stay in memory even if deleted from active list
4. **Main list**: Only one list can be "main" at a time; setting a new main un-marks the previous one
5. **Suggestions ranking**: `score = useCount * 2 + daysRecency`, where `daysRecency = max(0, 30 - daysSinceLastUse)`

## API Endpoints

### Backend (NestJS)

**Module**: `ListsModule` (imports `PrismaModule`, `TimeModule`)

**Controller**: `ListsController` at `/lists`

| Method | Path | Description | Request Body | Response |
|--------|------|-------------|--------------|----------|
| GET | `/lists` | Get all lists | - | `ListView[]` |
| GET | `/lists/:id` | Get single list with items + memory | - | `ListDetailView` |
| POST | `/lists` | Create list | `ListUpsertInput` | `ListView` |
| PATCH | `/lists/:id` | Update list | `ListUpsertInput` | `ListView` |
| DELETE | `/lists/:id` | Delete list | - | `{ deleted: boolean, id: number }` |
| POST | `/lists/:id/items` | Add item to list | `{ title: string }` | `ListDetailView` |
| PATCH | `/lists/:id/items/:itemId` | Update item | `{ title?: string, done?: boolean }` | `ListDetailView` |
| DELETE | `/lists/:id/items/:itemId` | Remove item | - | `ListDetailView` |
| PATCH | `/lists/:id/items/order` | Reorder items | `{ ids: number[] }` | `ListDetailView` |
| GET | `/lists/:id/memory` | Get memory suggestions | `?query=` | `ListItemMemoryView[]` |
| DELETE | `/lists/:id/memory/:memoryId` | Delete memory entry | - | `ListDetailView` |
| POST | `/lists/:id/memory/:memoryId/restore` | Add memory item back to active | - | `ListDetailView` |

### Service Layer Logic

**When marking an item done**:
1. Set `item.done = true`
2. If `list.suggestionsEnabled`, upsert to `ListItemMemory`:
   - If memory exists: increment `useCount`, update `lastUsedAt`
   - If not: create new entry with `useCount = 1`

**When adding an item**:
- No automatic memory update (only happens on done)

**When removing an item**:
- Memory stays intact (not affected)

**Suggestion ranking**:
```typescript
function rankSuggestions(memories: ListItemMemory[]): ListItemMemory[] {
  const now = Date.now();
  return memories
    .map(mem => {
      const daysSince = Math.floor((now - mem.lastUsedAt.getTime()) / 86400000);
      const recencyScore = Math.max(0, 30 - daysSince);
      const score = mem.useCount * 2 + recencyScore;
      return { ...mem, score };
    })
    .sort((a, b) => b.score - a.score);
}
```

## Frontend (Angular)

### File Structure

```
NoEscape-UI/src/app/lists/
├── lists-page.ts              # Catalog view with accordion
├── lists-page.html
├── lists-page.css
├── list-detail-page.ts        # Single list full view
├── list-detail-page.html
├── list-detail-page.css
├── lists.model.ts             # TypeScript interfaces
└── lists.service.ts           # HTTP API client
```

### Models (TypeScript)

```typescript
export interface ListView {
  id: number;
  name: string;
  icon: string | null;
  isMain: boolean;
  suggestionsEnabled: boolean;
  sortOrder: number;
  activeCount: number;      // Count of !done items
  doneCount: number;        // Count of done items
  createdAt: string;
  updatedAt: string;
}

export interface ListItemView {
  id: number;
  title: string;
  done: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ListItemMemoryView {
  id: number;
  title: string;
  lastUsedAt: string;
  useCount: number;
  score: number;            // Computed by backend
}

export interface ListDetailView extends ListView {
  items: ListItemView[];
  memory: ListItemMemoryView[];
}

export interface ListUpsertPayload {
  name?: string;
  icon?: string | null;
  isMain?: boolean;
  suggestionsEnabled?: boolean;
  sortOrder?: number;
}

export const DEFAULT_LIST_ICON = '📝';
```

### Catalog View (`lists-page`)

**Features**:
- Display all lists as cards in a grid/column layout
- Accordion behavior: clicking a card expands it, collapsing any previously expanded card
- Main list starts expanded
- In preview mode:
  - Show first N active items
  - Can mark items done (PATCH)
  - Cannot delete items
  - "Open" button navigates to full view
- CRUD operations: Create new list, delete list (with confirmation)

**Signals**:
```typescript
lists = signal<ListView[]>([]);
expandedListId = signal<number | null>(null);
loading = signal(true);
error = signal<string | null>(null);
```

### Detail View (`list-detail-page`)

**Features**:
- Full list management
- Add new items with autocomplete from memory
- Mark items done/undone
- Delete items (active only)
- Reorder items (drag or move buttons)
- Search memory
- Delete memory entries
- Restore memory items to active list

**Signals**:
```typescript
list = signal<ListDetailView | null>(null);
newItemTitle = signal('');
memorySuggestions = computed(() => /* filtered by newItemTitle */);
loading = signal(true);
```

### Routing

```typescript
// Add to app.routes.ts
{
  path: 'lists/new',
  loadComponent: () => import('./lists/list-detail-page').then(m => m.ListDetailPage),
  title: 'New List — No Escape',
},
{
  path: 'lists/:id',
  loadComponent: () => import('./lists/list-detail-page').then(m => m.ListDetailPage),
  title: 'List — No Escape',
},
{
  path: 'lists',
  loadComponent: () => import('./lists/lists-page').then(m => m.ListsPage),
  title: 'Lists — No Escape',
},
```

## Migration Strategy

1. Add Prisma schema changes to `schema.prisma`
2. Run `npm run db:push --prefix no-escape-back` (dev pushes schema to Supabase)
3. No data migration needed (greenfield feature)
4. Backend module integrates into `AppModule`
5. Frontend routes integrate into `app.routes.ts`

## Test Strategy

### Backend Tests (Jest)

**Unit tests** (`lists.service.spec.ts`):
- List CRUD operations
- Item CRUD operations
- Memory upsert logic on marking done
- Suggestion ranking algorithm
- Main list toggling (un-marks previous main)
- Validation: empty names, invalid IDs

**Integration/E2E tests** (`lists.e2e-spec.ts`):
- Full workflow: create list → add items → mark done → verify memory → get suggestions
- Accordion behavior doesn't apply to backend (frontend concern)
- Verify cascade deletes (list deleted → items + memory deleted)
- Test memory deduplication (same title marked done multiple times)

### Frontend Tests (Jasmine/Karma if configured)

**Component tests**:
- Lists service HTTP calls (mock backend)
- Catalog accordion behavior (expand/collapse)
- Item autocomplete filtering
- Main list default expand

**Note**: The repo doesn't have extensive Angular component tests currently. If the repo's tooling doesn't support component testing easily, focus on backend coverage and manual UI testing.

## Testing Commands

```bash
# Backend unit tests
npm run test --prefix no-escape-back

# Backend E2E tests
npm run test:e2e --prefix no-escape-back

# Run specific test file
npm run test --prefix no-escape-back -- lists.service.spec.ts

# Run with coverage
npm run test:cov --prefix no-escape-back
```

## Acceptance Criteria

- [ ] All list operations work (create, read, update, delete)
- [ ] Items can be added, marked done, removed, reordered
- [ ] Memory tracks completed items when suggestions enabled
- [ ] Suggestions are ranked correctly
- [ ] No duplicate memory entries for same title
- [ ] Catalog accordion works (one expanded at a time)
- [ ] Main list expands by default
- [ ] Items can be marked done in preview but not deleted
- [ ] Memory can be searched, deleted, restored
- [ ] All backend tests pass
- [ ] Lint and typecheck pass
- [ ] Application builds successfully

## Future Enhancements (Out of Scope)

- Item notes/descriptions
- List sharing
- Item due dates
- List templates
- Bulk operations
- Export/import lists
- Integration with Dailies/Quests

## Implementation Order

1. **Backend foundation**
   - Prisma schema
   - Module, controller, service scaffolding
   - Unit tests for service

2. **Backend API**
   - Implement all endpoints
   - E2E tests

3. **Frontend foundation**
   - Models, service
   - Routing

4. **Frontend catalog**
   - Lists page with accordion

5. **Frontend detail**
   - Full list view with memory/suggestions

6. **Integration & polish**
   - End-to-end manual testing
   - Fix bugs, edge cases
   - Ensure lint/typecheck/build pass

## Deployment Notes

Based on README, the project uses:
- Local development: Supabase Docker + Prisma push
- Production: Hosted database (credentials in server `.env`)
- Schema changes: `prisma db push` (no migrations)

**CI/Auto-deploy**: No explicit CI config found in repo (no `.github/workflows`, `.gitlab-ci.yml`, etc.). Deployment appears manual or via platform (e.g., Heroku, Railway, Render).

**Endpoints after deploy**: Backend base URL from `API_BASE_URL` in Angular config, e.g., `https://api.example.com/lists`

**Verification after deploy**:
```bash
# Test list creation
curl -X POST https://api.example.com/lists \
  -H "Content-Type: application/json" \
  -d '{"name":"Test List","icon":"🛒"}'

# Test fetching lists
curl https://api.example.com/lists
```
