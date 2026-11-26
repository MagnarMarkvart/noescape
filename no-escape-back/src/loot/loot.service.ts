import {
  Global,
  Injectable,
  Logger,
  Module,
  Controller,
  Get,
} from '@nestjs/common';
import { randomInt } from 'crypto';
import { LiveBus } from '../live-bus/live-bus';
import { PrismaService } from '../prisma/prisma.service';
import { LOOT_TABLE, ROLL_MAX, itemForRoll, oddsOf } from './loot.table';

export type LootDropView = {
  id: number;
  roll: number;
  key: string;
  name: string;
  icon: string;
  tier: string;
  flavor: string;
  xpGained: number;
  skillId: number | null;
  createdAt: string;
  firstFind: boolean;
};

@Injectable()
export class LootService {
  private readonly logger = new Logger(LootService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bus: LiveBus,
  ) {}

  /** One roll per XP drop, however small. Never blocks the XP award. */
  async rollForXp(
    skillId: number | null,
    xpGained: number,
  ): Promise<LootDropView | null> {
    if (!(xpGained > 0)) {
      return null;
    }
    try {
      const roll = randomInt(1, ROLL_MAX + 1);
      const item = itemForRoll(roll);
      const owned = await this.prisma.collectibleDrop.count({
        where: { itemKey: item.key },
      });
      const row = await this.prisma.collectibleDrop.create({
        data: { roll, itemKey: item.key, tier: item.tier, skillId, xpGained },
      });
      const view: LootDropView = {
        id: row.id,
        roll,
        key: item.key,
        name: item.name,
        icon: item.icon,
        tier: item.tier,
        flavor: item.flavor,
        xpGained,
        skillId,
        createdAt: row.createdAt.toISOString(),
        firstFind: owned === 0,
      };
      this.bus.emit('loot.drop', view);
      return view;
    } catch (err) {
      this.logger.warn(`loot roll failed: ${String(err)}`);
      return null;
    }
  }

  async collection() {
    const grouped = await this.prisma.collectibleDrop.groupBy({
      by: ['itemKey'],
      _count: { _all: true },
      _max: { createdAt: true },
    });
    const counts = new Map(grouped.map((g) => [g.itemKey, g]));
    const recent = await this.prisma.collectibleDrop.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const total = grouped.reduce((n, g) => n + g._count._all, 0);
    return {
      rollMax: ROLL_MAX,
      totalRolls: total,
      items: LOOT_TABLE.map((item) => ({
        key: item.key,
        name: item.name,
        icon: item.icon,
        tier: item.tier,
        flavor: item.flavor,
        from: item.from,
        to: item.to,
        odds: oddsOf(item),
        count: counts.get(item.key)?._count._all ?? 0,
        lastFoundAt: counts.get(item.key)?._max.createdAt ?? null,
      })),
      recent: recent.map((r) => {
        const item = itemForRoll(r.roll);
        return {
          id: r.id,
          roll: r.roll,
          key: item.key,
          name: item.name,
          icon: item.icon,
          tier: item.tier,
          xpGained: r.xpGained,
          createdAt: r.createdAt,
        };
      }),
    };
  }
}

@Controller('loot')
export class LootController {
  constructor(private readonly loot: LootService) {}

  @Get()
  collection() {
    return this.loot.collection();
  }
}

@Global()
@Module({
  controllers: [LootController],
  providers: [LootService],
  exports: [LootService],
})
export class LootModule {}
