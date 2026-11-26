export const ROLL_MAX = 100_000;

export type LootTier =
  'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'unique';

export type LootItem = {
  key: string;
  name: string;
  icon: string;
  tier: LootTier;
  /** Inclusive roll range on 1..ROLL_MAX. */
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

/** Fixed table: the higher the roll, the rarer the find. 99 999+ is the top prize. */
export const LOOT_TABLE: LootItem[] = [
  T(
    'copper-coin',
    'Copper Coin',
    '🪙',
    'common',
    1,
    10_000,
    'Worn smooth by many hands.',
  ),
  T(
    'tallow-candle',
    'Tallow Candle',
    '🕯️',
    'common',
    10_001,
    20_000,
    'Smoky, but it lights the page.',
  ),
  T(
    'quill-feather',
    'Quill Feather',
    '🪶',
    'common',
    20_001,
    30_000,
    'Ready for the next entry.',
  ),
  T(
    'iron-nail',
    'Iron Nail',
    '📌',
    'common',
    30_001,
    40_000,
    'Holds the work together.',
  ),
  T(
    'clay-token',
    'Clay Token',
    '🟤',
    'common',
    40_001,
    50_000,
    'A promise stamped in clay.',
  ),
  T(
    'linen-scrap',
    'Linen Scrap',
    '🧵',
    'common',
    50_001,
    60_000,
    'Patch for a long road.',
  ),
  T(
    'brass-key',
    'Brass Key',
    '🗝️',
    'uncommon',
    60_001,
    65_000,
    'Opens a small door somewhere.',
  ),
  T(
    'wax-seal',
    'Wax Seal',
    '🔴',
    'uncommon',
    65_001,
    70_000,
    'Sealed, like a finished day.',
  ),
  T(
    'hourglass-sand',
    'Hourglass Sand',
    '⏳',
    'uncommon',
    70_001,
    75_000,
    'Every grain was earned.',
  ),
  T(
    'bone-die',
    'Bone Die',
    '🎲',
    'uncommon',
    75_001,
    80_000,
    'Fortune favours the steady.',
  ),
  T(
    'ink-pot',
    'Ink Pot',
    '🖋️',
    'uncommon',
    80_001,
    85_000,
    'Enough ink for a chapter.',
  ),
  T(
    'silver-hourglass',
    'Silver Hourglass',
    '⌛',
    'rare',
    85_001,
    87_750,
    'Time, made precious.',
  ),
  T(
    'scholars-lens',
    "Scholar's Lens",
    '🔍',
    'rare',
    87_751,
    90_500,
    'Detail is where mastery hides.',
  ),
  T(
    'knights-pin',
    "Knight's Pin",
    '⚔️',
    'rare',
    90_501,
    93_250,
    'Worn by those who show up.',
  ),
  T(
    'map-fragment',
    'Map Fragment',
    '🗺️',
    'rare',
    93_251,
    96_000,
    'Part of a road not yet walked.',
  ),
  T(
    'gilded-codex',
    'Gilded Codex',
    '📕',
    'epic',
    96_001,
    96_875,
    'Knowledge bound in gold.',
  ),
  T(
    'phoenix-feather',
    'Phoenix Feather',
    '🔥',
    'epic',
    96_876,
    97_750,
    'For every comeback.',
  ),
  T(
    'oath-ring',
    'Oath Ring',
    '💍',
    'epic',
    97_751,
    98_625,
    'A vow kept daily.',
  ),
  T(
    'star-chart',
    'Star Chart',
    '✨',
    'epic',
    98_626,
    99_500,
    'The long plan, written in light.',
  ),
  T(
    'crown-of-discipline',
    'Crown of Discipline',
    '👑',
    'legendary',
    99_501,
    99_663,
    'Heavy is the head that keeps the streak.',
  ),
  T(
    'dragon-scale',
    'Dragon Scale',
    '🐉',
    'legendary',
    99_664,
    99_826,
    'Proof you faced the hard thing.',
  ),
  T(
    'philosophers-stone',
    "Philosopher's Stone",
    '💎',
    'legendary',
    99_827,
    99_990,
    'Turns small effort into gold.',
  ),
  T(
    'relic-unbroken',
    'Relic of the Unbroken',
    '🏺',
    'mythic',
    99_991,
    99_998,
    'Whispers of a hundred sealed days.',
  ),
  T(
    'the-last-ember',
    'The Last Ember',
    '🌟',
    'unique',
    99_999,
    100_000,
    'The rarest find. Even a one-XP task can bring it.',
  ),
];

export function itemForRoll(roll: number): LootItem {
  const r = Math.min(ROLL_MAX, Math.max(1, Math.round(roll)));
  return LOOT_TABLE.find((i) => r >= i.from && r <= i.to) ?? LOOT_TABLE[0];
}

export function oddsOf(item: LootItem): number {
  return (item.to - item.from + 1) / ROLL_MAX;
}
