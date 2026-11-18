import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const SEED_PRESETS = [
  {
    label: 'Classic',
    workMinutes: 25,
    restMinutes: 5,
    iterations: 4,
    restAfterLast: true,
    sortOrder: 1,
  },
  {
    label: 'Short',
    workMinutes: 15,
    restMinutes: 3,
    iterations: 4,
    restAfterLast: true,
    sortOrder: 2,
  },
  {
    label: 'Deep Focus',
    workMinutes: 50,
    restMinutes: 10,
    iterations: 2,
    restAfterLast: true,
    sortOrder: 3,
  },
  {
    label: 'Sprint',
    workMinutes: 10,
    restMinutes: 2,
    iterations: 6,
    restAfterLast: true,
    sortOrder: 4,
  },
];

export type HorologiumPresetInput = {
  label?: string;
  workMinutes?: number;
  restMinutes?: number;
  iterations?: number;
  restAfterLast?: boolean;
};

@Injectable()
export class HorologiumPresetsService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const count = await this.prisma.horologiumPreset.count();
    if (count > 0) {
      return;
    }
    for (const row of SEED_PRESETS) {
      await this.prisma.horologiumPreset.create({ data: row });
    }
  }

  list() {
    return this.prisma.horologiumPreset.findMany({
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  }

  async create(input: HorologiumPresetInput) {
    const data = this.normalize(input, true);
    const max = await this.prisma.horologiumPreset.aggregate({
      _max: { sortOrder: true },
    });
    return this.prisma.horologiumPreset.create({
      data: {
        ...data,
        sortOrder: (max._max.sortOrder ?? 0) + 1,
      },
    });
  }

  async update(id: number, input: HorologiumPresetInput) {
    const row = await this.prisma.horologiumPreset.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException(`Preset #${id} not found`);
    }
    const data = this.normalize(
      {
        label: input.label ?? row.label,
        workMinutes: input.workMinutes ?? row.workMinutes,
        restMinutes: input.restMinutes ?? row.restMinutes,
        iterations: input.iterations ?? row.iterations,
        restAfterLast: input.restAfterLast ?? row.restAfterLast,
      },
      true,
    );
    return this.prisma.horologiumPreset.update({ where: { id }, data });
  }

  async remove(id: number) {
    const row = await this.prisma.horologiumPreset.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException(`Preset #${id} not found`);
    }
    await this.prisma.horologiumPreset.delete({ where: { id } });
    return { deleted: true, id };
  }

  private normalize(input: HorologiumPresetInput, requireLabel: boolean) {
    const label = String(input.label ?? '').trim().slice(0, 40);
    if (requireLabel && !label) {
      throw new BadRequestException('label is required');
    }
    const workMinutes = this.assertRange(
      input.workMinutes,
      1,
      180,
      'workMinutes',
    );
    const restMinutes = this.assertRange(
      input.restMinutes,
      0,
      60,
      'restMinutes',
    );
    const iterations = this.assertRange(
      input.iterations,
      2,
      12,
      'iterations',
    );
    return {
      label,
      workMinutes,
      restMinutes,
      iterations,
      restAfterLast: input.restAfterLast !== false,
    };
  }

  private assertRange(
    value: number | undefined,
    min: number,
    max: number,
    field: string,
  ) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n) || n < min || n > max) {
      throw new BadRequestException(`${field} must be ${min}–${max}`);
    }
    return n;
  }
}
