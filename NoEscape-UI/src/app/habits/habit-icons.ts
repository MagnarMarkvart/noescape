/** Curated free Unicode emoji set for habit icons (no npm license baggage). */
export interface HabitIconOption {
  glyph: string;
  label: string;
}

export interface HabitIconGroup {
  id: string;
  label: string;
  icons: HabitIconOption[];
}

export const HABIT_ICON_GROUPS: HabitIconGroup[] = [
  {
    id: 'body',
    label: 'Body',
    icons: [
      { glyph: '🏋️', label: 'Gym' },
      { glyph: '🏃', label: 'Run' },
      { glyph: '🚶', label: 'Walk' },
      { glyph: '🚴', label: 'Cycle' },
      { glyph: '🧘', label: 'Yoga' },
      { glyph: '🤸', label: 'Mobility' },
      { glyph: '💪', label: 'Strength' },
      { glyph: '🏊', label: 'Swim' },
      { glyph: '🥊', label: 'Fight' },
      { glyph: '⚽', label: 'Sport' },
    ],
  },
  {
    id: 'mind',
    label: 'Mind',
    icons: [
      { glyph: '📚', label: 'Read' },
      { glyph: '🧠', label: 'Focus' },
      { glyph: '✍️', label: 'Write' },
      { glyph: '📓', label: 'Journal' },
      { glyph: '🎓', label: 'Study' },
      { glyph: '🗣️', label: 'Language' },
      { glyph: '🎵', label: 'Music' },
      { glyph: '♟️', label: 'Strategy' },
      { glyph: '🧩', label: 'Puzzle' },
      { glyph: '🎯', label: 'Target' },
    ],
  },
  {
    id: 'discipline',
    label: 'Discipline',
    icons: [
      { glyph: '📵', label: 'No phone' },
      { glyph: '🛡️', label: 'Guard' },
      { glyph: '⏰', label: 'Wake' },
      { glyph: '🌅', label: 'Morning' },
      { glyph: '🌙', label: 'Night' },
      { glyph: '🛏️', label: 'Sleep' },
      { glyph: '🧹', label: 'Clean' },
      { glyph: '✅', label: 'Check' },
      { glyph: '🔒', label: 'Lock' },
      { glyph: '⚔️', label: 'Quest' },
    ],
  },
  {
    id: 'vital',
    label: 'Vital',
    icons: [
      { glyph: '💧', label: 'Water' },
      { glyph: '🍎', label: 'Food' },
      { glyph: '🥗', label: 'Diet' },
      { glyph: '☕', label: 'Coffee' },
      { glyph: '🍵', label: 'Tea' },
      { glyph: '💊', label: 'Meds' },
      { glyph: '🦷', label: 'Teeth' },
      { glyph: '🌡️', label: 'Health' },
      { glyph: '❤️', label: 'Heart' },
      { glyph: '🌿', label: 'Nature' },
    ],
  },
  {
    id: 'craft',
    label: 'Craft',
    icons: [
      { glyph: '💻', label: 'Code' },
      { glyph: '🐛', label: 'Bug' },
      { glyph: '🛠️', label: 'Build' },
      { glyph: '🎨', label: 'Art' },
      { glyph: '📷', label: 'Photo' },
      { glyph: '🎬', label: 'Film' },
      { glyph: '💰', label: 'Wealth' },
      { glyph: '📈', label: 'Growth' },
      { glyph: '🏠', label: 'Home' },
      { glyph: '🌱', label: 'Grow' },
      { glyph: '🔥', label: 'Streak' },
      { glyph: '📜', label: 'Scroll' },
      { glyph: '📋', label: 'Ledger' },
    ],
  },
];

export const DEFAULT_HABIT_ICON = HABIT_ICON_GROUPS[0].icons[0].glyph;

export const ALL_HABIT_ICONS = HABIT_ICON_GROUPS.flatMap((g) => g.icons);
