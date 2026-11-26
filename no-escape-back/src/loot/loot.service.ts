import {
  CallHandler,
  Controller,
  ExecutionContext,
  Get,
  Global,
  Injectable,
  Logger,
  Module,
  NestInterceptor,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AsyncLocalStorage } from 'async_hooks';
import { randomInt } from 'crypto';
import { Observable } from 'rxjs';
import { LiveBus } from '../live-bus/live-bus';
import { PrismaService } from '../prisma/prisma.service';
import {
  LOOT_TABLE,
  ROLL_MAX,
  itemByKey,
  itemForScore,
  scoreFor,
} from './loot.table';

export type LootDropView = {
  id: number;
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

/** XP gathered during one user action (one HTTP request) = one drop. */
type LootScope = { xp: number; skillId: number | null };
const lootScope = new AsyncLocalStorage<LootScope>();

@Injectable()
export class LootService {
  private readonly logger = new Logger(LootService.name);
  /** Swappable for tests. Returns an integer in [1, ROLL_MAX]. */
  rng: () => number = () => randomInt(1, ROLL_MAX + 1);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bus: LiveBus,
  ) {}

  /**
   * Called for every XP award. Inside a user action the XP is pooled and the
   * action gets exactly one roll when it finishes (see LootScopeInterceptor);
   * outside one (background jobs) the award rolls on its own.
   */
  async rollForXp(
    skillId: number | null,
    xpGained: number,
  ): Promise<LootDropView | null> {
    if (!(xpGained > 0)) return null;
    const scope = lootScope.getStore();
    if (scope) {
      scope.xp += xpGained;
      scope.skillId ??= skillId;
      return null;
    }
    return this.rollDrop(skillId, xpGained);
  }

  /** Run `fn` as one drop event. */
  runScoped<T>(scope: LootScope, fn: () => T): T {
    return lootScope.run(scope, fn);
  }

  async flush(scope: LootScope): Promise<LootDropView | null> {
    if (!(scope.xp > 0)) return null;
    const { xp, skillId } = scope;
    scope.xp = 0;
    return this.rollDrop(skillId, xp);
  }

  /** One roll for one XP drop. Most rolls find nothing. Never throws. */
  async rollDrop(
    skillId: number | null,
    xpGained: number,
  ): Promise<LootDropView | null> {
    try {
      const roll = this.rng();
      const score = scoreFor(roll, xpGained);
      const item = itemForScore(score);
      if (!item) return null;
      const owned = await this.prisma.collectibleDrop.count({
        where: { itemKey: item.key },
      });
      const row = await this.prisma.collectibleDrop.create({
        data: {
          roll,
          score,
          itemKey: item.key,
          tier: item.tier,
          skillId,
          xpGained: Math.floor(xpGained),
        },
      });
      const view: LootDropView = {
        id: row.id,
        key: item.key,
        name: item.name,
        icon: item.icon,
        tier: item.tier,
        flavor: item.flavor,
        xpGained: row.xpGained,
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

  /** The player's collection. Deliberately no odds, ranges or roll numbers. */
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
    return {
      totalFinds: grouped.reduce((n, g) => n + g._count._all, 0),
      items: LOOT_TABLE.map((item) => ({
        key: item.key,
        name: item.name,
        icon: item.icon,
        tier: item.tier,
        flavor: item.flavor,
        count: counts.get(item.key)?._count._all ?? 0,
        lastFoundAt: counts.get(item.key)?._max.createdAt ?? null,
      })),
      recent: recent.map((r) => {
        const item = itemByKey(r.itemKey);
        return {
          id: r.id,
          key: r.itemKey,
          name: item?.name ?? r.itemKey,
          icon: item?.icon ?? '❔',
          tier: item?.tier ?? r.tier,
          xpGained: r.xpGained,
          createdAt: r.createdAt,
        };
      }),
    };
  }
}

/** Wraps each HTTP request so all XP it awards becomes one drop / one roll. */
@Injectable()
export class LootScopeInterceptor implements NestInterceptor {
  constructor(private readonly loot: LootService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const scope: LootScope = { xp: 0, skillId: null };
    return new Observable((subscriber) => {
      const finish = (done: () => void) => {
        void this.loot.flush(scope).finally(done);
      };
      const sub = this.loot.runScoped(scope, () =>
        next.handle().subscribe({
          next: (v) => subscriber.next(v),
          error: (e) => finish(() => subscriber.error(e)),
          complete: () => finish(() => subscriber.complete()),
        }),
      );
      return () => sub.unsubscribe();
    });
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
  providers: [
    LootService,
    { provide: APP_INTERCEPTOR, useClass: LootScopeInterceptor },
  ],
  exports: [LootService],
})
export class LootModule {}
