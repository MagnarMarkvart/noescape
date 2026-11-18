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
  score: number;
}

export interface ListView {
  id: number;
  name: string;
  icon: string | null;
  isMain: boolean;
  suggestionsEnabled: boolean;
  sortOrder: number;
  activeCount: number;
  doneCount: number;
  createdAt: string;
  updatedAt: string;
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
