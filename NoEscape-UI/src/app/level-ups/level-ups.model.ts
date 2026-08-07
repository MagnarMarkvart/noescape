export interface LevelUpLogItem {
  id: number;
  skillId: number;
  fromLevel: number;
  toLevel: number;
  levelsGained: number;
  createdAt: string;
  skill: {
    id: number;
    name: string;
    slug: string;
    icon: string | null;
    category: string;
    level: number;
  };
}

export interface LevelUpLogPage {
  items: LevelUpLogItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}
