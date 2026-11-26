/** One roll per XP drop on 1..ROLL_MAX. Odds and thresholds: docs/loot.md (never shown in the UI). */
export const ROLL_MAX = 1_000_000;
/** XP bonus added to the roll is capped so a huge quest reward cannot buy a rare. */
export const XP_BONUS_CAP = 10_000;
/** Scores below this find nothing — most drops are empty. */
export const FIND_FROM = 980_000;

export type LootTier =
  'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'unique';

export type LootItem = {
  key: string;
  name: string;
  icon: string;
  tier: LootTier;
  /** Inclusive score range on 1..ROLL_MAX. */
  from: number;
  to: number;
  flavor: string;
};

const T = (
  key: string,
  name: string,
  icon: string,
  tier: LootTier,
  from: number,
  to: number,
  flavor: string,
): LootItem => ({ key, name, icon, tier, from, to, flavor });

/** Fixed table: the higher the score, the rarer the find. 999 990+ is the top prize. */
export const LOOT_TABLE: LootItem[] = [
  T(
    'copper-coin',
    'Copper Coin',
    '🪙',
    'common',
    980_000,
    981_999,
    'Worn smooth by many hands.',
  ),
  T(
    'tallow-candle',
    'Tallow Candle',
    '🕯️',
    'common',
    982_000,
    983_999,
    'Smoky, but it lights the page.',
  ),
  T(
    'quill-feather',
    'Quill Feather',
    '🪶',
    'common',
    984_000,
    985_999,
    'Ready for the next entry.',
  ),
  T(
    'iron-nail',
    'Iron Nail',
    '📌',
    'common',
    986_000,
    987_999,
    'Holds the work together.',
  ),
  T(
    'clay-token',
    'Clay Token',
    '🟤',
    'common',
    988_000,
    989_999,
    'A promise stamped in clay.',
  ),
  T(
    'linen-scrap',
    'Linen Scrap',
    '🧵',
    'common',
    990_000,
    991_999,
    'Patch for a long road.',
  ),
  T(
    'brass-key',
    'Brass Key',
    '🗝️',
    'uncommon',
    992_000,
    993_039,
    'Opens a small door somewhere.',
  ),
  T(
    'wax-seal',
    'Wax Seal',
    '🔴',
    'uncommon',
    993_040,
    994_079,
    'Sealed, like a finished day.',
  ),
  T(
    'hourglass-sand',
    'Hourglass Sand',
    '⏳',
    'uncommon',
    994_080,
    995_119,
    'Every grain was earned.',
  ),
  T(
    'bone-die',
    'Bone Die',
    '🎲',
    'uncommon',
    995_120,
    996_159,
    'Fortune favours the steady.',
  ),
  T(
    'ink-pot',
    'Ink Pot',
    '🖋️',
    'uncommon',
    996_160,
    997_199,
    'Enough ink for a chapter.',
  ),
  T(
    'silver-hourglass',
    'Silver Hourglass',
    '⌛',
    'rare',
    997_200,
    997_699,
    'Time, made precious.',
  ),
  T(
    'scholars-lens',
    "Scholar's Lens",
    '🔍',
    'rare',
    997_700,
    998_199,
    'Detail is where mastery hides.',
  ),
  T(
    'knights-pin',
    "Knight's Pin",
    '⚔️',
    'rare',
    998_200,
    998_699,
    'Worn by those who show up.',
  ),
  T(
    'map-fragment',
    'Map Fragment',
    '🗺️',
    'rare',
    998_700,
    999_199,
    'Part of a road not yet walked.',
  ),
  T(
    'gilded-codex',
    'Gilded Codex',
    '📕',
    'epic',
    999_200,
    999_349,
    'Knowledge bound in gold.',
  ),
  T(
    'phoenix-feather',
    'Phoenix Feather',
    '🔥',
    'epic',
    999_350,
    999_499,
    'For every comeback.',
  ),
  T(
    'oath-ring',
    'Oath Ring',
    '💍',
    'epic',
    999_500,
    999_649,
    'A vow kept daily.',
  ),
  T(
    'star-chart',
    'Star Chart',
    '✨',
    'epic',
    999_650,
    999_799,
    'The long plan, written in light.',
  ),
  T(
    'crown-of-discipline',
    'Crown of Discipline',
    '👑',
    'legendary',
    999_800,
    999_849,
    'Heavy is the head that keeps the streak.',
  ),
  T(
    'dragon-scale',
    'Dragon Scale',
    '🐉',
    'legendary',
    999_850,
    999_899,
    'Proof you faced the hard thing.',
  ),
  T(
    'philosophers-stone',
    "Philosopher's Stone",
    '💎',
    'legendary',
    999_900,
    999_949,
    'Turns small effort into gold.',
  ),
  T(
    'relic-unbroken',
    'Relic of the Unbroken',
    '🏺',
    'mythic',
    999_950,
    999_989,
    'Whispers of a hundred sealed days.',
  ),
  T(
    'the-last-ember',
    'The Last Ember',
    '🌟',
    'unique',
    999_990,
    1_000_000,
    'The rarest find. Pure luck — even a one-XP task can bring it.',
  ),
];

/**
 * Score = roll + XP of the drop (bonus capped at XP_BONUS_CAP). If the bonus
 * would push the score past ROLL_MAX the bonus is forfeited instead of clamped:
 * clamping would pile every overflow onto the unique item and make it far more
 * common than the tiers below it.
 */
export function scoreFor(roll: number, xp: number): number {
  const r = Math.min(ROLL_MAX, Math.max(1, Math.round(roll)));
  const bonus = Math.min(XP_BONUS_CAP, Math.max(0, Math.floor(xp || 0)));
  return r + bonus > ROLL_MAX ? r : r + bonus;
}

/** The item a score finds, or null (the usual case). */
export function itemForScore(score: number): LootItem | null {
  const s = Math.min(ROLL_MAX, Math.round(score));
  if (s < FIND_FROM) return null;
  return LOOT_TABLE.find((i) => s >= i.from && s <= i.to) ?? null;
}

export function itemByKey(key: string): LootItem | null {
  return LOOT_TABLE.find((i) => i.key === key) ?? null;
}

/** Probability that a zero-XP drop lands on this item (docs/tests only). */
export function oddsOf(item: LootItem): number {
  return (item.to - item.from + 1) / ROLL_MAX;
}
