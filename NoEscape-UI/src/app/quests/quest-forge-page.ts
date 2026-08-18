import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { form, FormField, required, submit } from '@angular/forms/signals';
import { Skill } from '../skills/skill.model';
import { SkillsService } from '../skills/skills.service';
import { RuneCheck } from '../shared/rune-check';
import { CharacterService } from '../character/character.service';
import { TimedToast } from '../shared/timed-toast';
import { boostsWealth } from '../shared/skill-weights';
import { centsToInput, parseMoneyToCents } from '../shared/money';
import { API_BASE_URL } from '../core/api.config';
import {
  QUEST_WEIGHT_TOTAL,
  QuestView,
  resolveQuestCoverUrl,
  splitQuestXp,
} from './quest.model';
import { QuestsService } from './quests.service';

interface ForgeSubtask {
  id?: number;
  title: string;
  gatesJourney: boolean;
}

@Component({
  selector: 'app-quest-forge-page',
  imports: [RouterLink, FormField, DecimalPipe, RuneCheck],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './quest-forge-page.html',
  styleUrl: './quest-forge-page.css',
})
export class QuestForgePage implements OnInit {
  private readonly questsService = inject(QuestsService);
  private readonly skillsService = inject(SkillsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly timed = new TimedToast();
  private readonly character = inject(CharacterService);

  protected readonly toast = this.timed.value;
  protected readonly saving = signal(false);
  protected readonly loading = signal(false);
  protected readonly editId = signal<number | null>(null);
  protected readonly skills = signal<Skill[]>([]);
  protected readonly catalog = signal<QuestView[]>([]);
  protected readonly coverPreview = signal<string | null>(null);
  protected readonly coverDataUrl = signal<string | null>(null);

  protected readonly subtasks = signal<ForgeSubtask[]>([]);
  protected readonly subtaskDraft = signal('');
  protected readonly gateDraft = signal(false);
  protected readonly skillReqs = signal<Array<{ slug: string; level: number }>>(
    [],
  );
  protected readonly skillReqSlug = signal('');
  protected readonly skillReqLevel = signal(1);
  protected readonly questReqs = signal<string[]>([]);
  protected readonly skillPick = signal('');
  protected readonly skillWeights = signal<Array<{ slug: string; weight: number }>>(
    [],
  );
  protected readonly weightTotal = QUEST_WEIGHT_TOTAL;

  protected readonly createModel = signal({
    name: '',
    summary: '',
    rules: '',
    stakes: '',
    howToWin: '',
    destination: '',
    journeyLabel: '',
    journeyNote: '',
    commitmentLevel: 7,
    titleReward: '',
    totalXp: 0,
    wealthAmount: '',
  });
  protected readonly createForm = form(this.createModel, (p) => {
    required(p.name);
  });

  protected readonly isEdit = computed(() => this.editId() !== null);
  protected readonly catalogChoices = computed(() => {
    const id = this.editId();
    return this.catalog().filter((q) => q.id !== id);
  });
  protected readonly weightSpent = computed(() =>
    this.skillWeights().reduce((sum, s) => sum + s.weight, 0),
  );
  protected readonly weightRemaining = computed(
    () => this.weightTotal - this.weightSpent(),
  );
  protected readonly xpShares = computed(() =>
    splitQuestXp(this.createModel().totalXp, this.skillWeights()),
  );
  protected readonly weightsValid = computed(() => {
    const rows = this.skillWeights();
    if (rows.length === 0) {
      return true;
    }
    return this.weightRemaining() === 0;
  });

  protected readonly showWealth = computed(() =>
    boostsWealth(this.skillWeights()) ||
    parseMoneyToCents(this.createModel().wealthAmount) > 0,
  );

  protected readonly currencyLabel = computed(() => this.character.currency());

  ngOnInit(): void {
    this.skillsService.getAll().subscribe({
      next: (rows) => this.skills.set(rows),
    });
    this.questsService.list('all').subscribe({
      next: (rows) => this.catalog.set(rows),
    });
    const rawId = this.route.snapshot.paramMap.get('id');
    const id = rawId ? Number(rawId) : NaN;
    if (Number.isFinite(id) && id > 0) {
      this.editId.set(id);
      this.loadQuest(id);
    }
  }

  protected readonly availableSkills = computed(() => {
    const taken = new Set(this.skillWeights().map((s) => s.slug));
    return this.skills().filter((s) => !taken.has(s.slug));
  });

  protected onCover(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      this.coverPreview.set(null);
      this.coverDataUrl.set(null);
      return;
    }
    if (!file.type.startsWith('image/')) {
      this.timed.set('Cover must be an image');
      input.value = '';
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      this.timed.set('Cover image is too large (max 4MB)');
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result ?? '');
      this.coverPreview.set(url);
      this.coverDataUrl.set(url);
    };
    reader.readAsDataURL(file);
  }

  protected clearCover(): void {
    this.coverPreview.set(null);
    this.coverDataUrl.set(null);
  }

  protected addSubtask(): void {
    const title = this.subtaskDraft().trim();
    if (!title) {
      return;
    }
    this.subtasks.update((rows) => [
      ...rows,
      { title, gatesJourney: this.gateDraft() },
    ]);
    this.subtaskDraft.set('');
    this.gateDraft.set(false);
  }

  protected removeSubtask(index: number): void {
    this.subtasks.update((rows) => rows.filter((_, i) => i !== index));
  }

  protected toggleGate(index: number): void {
    this.subtasks.update((rows) =>
      rows.map((row, i) =>
        i === index ? { ...row, gatesJourney: !row.gatesJourney } : row,
      ),
    );
  }

  protected setGateDraft(checked: boolean): void {
    this.gateDraft.set(checked);
  }

  protected addSkillReq(): void {
    const slug = this.skillReqSlug();
    const level = Math.min(99, Math.max(1, Number(this.skillReqLevel()) || 1));
    if (!slug) {
      return;
    }
    this.skillReqs.update((rows) => {
      const rest = rows.filter((r) => r.slug !== slug);
      return [...rest, { slug, level }];
    });
  }

  protected setSkillReqSlug(event: Event): void {
    this.skillReqSlug.set((event.target as HTMLSelectElement).value);
  }

  protected setSkillReqLevel(event: Event): void {
    this.skillReqLevel.set(Number((event.target as HTMLInputElement).value) || 1);
  }

  protected setSubtaskDraft(event: Event): void {
    this.subtaskDraft.set((event.target as HTMLInputElement).value);
  }

  protected setSkillPick(event: Event): void {
    this.skillPick.set((event.target as HTMLSelectElement).value);
  }

  protected setTotalXp(event: Event): void {
    const n = Math.max(0, Math.round(Number((event.target as HTMLInputElement).value) || 0));
    this.createModel.update((m) => ({ ...m, totalXp: n }));
  }

  protected setWealthAmount(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.createModel.update((m) => ({ ...m, wealthAmount: value }));
  }

  protected addSkillShare(): void {
    const slug = this.skillPick();
    if (!slug || this.skillWeights().some((s) => s.slug === slug)) {
      return;
    }
    const remaining = this.weightRemaining();
    this.skillWeights.update((rows) => {
      if (rows.length === 0) {
        return [{ slug, weight: this.weightTotal }];
      }
      if (remaining > 0) {
        return [...rows, { slug, weight: remaining }];
      }
      const donor = rows.reduce((best, s) => (s.weight > best.weight ? s : best));
      if (donor.weight <= 1) {
        return rows;
      }
      return [
        ...rows.map((s) =>
          s.slug === donor.slug ? { ...s, weight: s.weight - 1 } : s,
        ),
        { slug, weight: 1 },
      ];
    });
    this.skillPick.set('');
  }

  protected bumpWeight(slug: string, delta: number): void {
    this.skillWeights.update((rows) => {
      const current = rows.find((s) => s.slug === slug);
      if (!current) {
        return rows;
      }
      const next = current.weight + delta;
      if (next < 1) {
        return rows;
      }
      const spentOthers = rows
        .filter((s) => s.slug !== slug)
        .reduce((n, s) => n + s.weight, 0);
      if (spentOthers + next > this.weightTotal) {
        return rows;
      }
      return rows.map((s) => (s.slug === slug ? { ...s, weight: next } : s));
    });
  }

  protected removeSkillShare(slug: string): void {
    this.skillWeights.update((rows) => {
      const rest = rows.filter((s) => s.slug !== slug);
      if (rest.length === 0) {
        return [];
      }
      if (rest.length === 1) {
        return [{ ...rest[0], weight: this.weightTotal }];
      }
      const spent = rest.reduce((n, s) => n + s.weight, 0);
      const extra = this.weightTotal - spent;
      if (extra <= 0) {
        return rest;
      }
      return rest.map((s, i) =>
        i === 0 ? { ...s, weight: s.weight + extra } : s,
      );
    });
  }

  protected setCommitment(event: Event): void {
    const n = Number((event.target as HTMLInputElement).value) || 7;
    this.createModel.update((m) => ({
      ...m,
      commitmentLevel: Math.min(7, Math.max(1, n)),
    }));
  }

  protected removeSkillReq(slug: string): void {
    this.skillReqs.update((rows) => rows.filter((r) => r.slug !== slug));
  }

  protected skillName(slug: string): string {
    return this.skills().find((s) => s.slug === slug)?.name ?? slug;
  }

  protected setQuestReq(slug: string, on: boolean): void {
    this.questReqs.update((rows) => {
      if (on) {
        return rows.includes(slug) ? rows : [...rows, slug];
      }
      return rows.filter((s) => s !== slug);
    });
  }

  protected commitmentLabel(n: number): string {
    if (n >= 7) {
      return 'Every day';
    }
    if (n <= 1) {
      return 'Once a week';
    }
    return `${n}× per week`;
  }

  protected saveQuest(): void {
    void submit(this.createForm, async () => {
      const m = this.createModel();
      if (!this.weightsValid()) {
        this.timed.set(
          `Distribute all ${this.weightTotal} weight points across the chosen skills`,
        );
        return;
      }
      this.saving.set(true);
      const payload = {
        name: m.name.trim(),
        summary: m.summary.trim() || undefined,
        rules: m.rules.trim() || undefined,
        stakes: m.stakes.trim() || undefined,
        howToWin: m.howToWin.trim() || undefined,
        destination: m.destination.trim() || undefined,
        journeyLabel: m.journeyLabel.trim() || undefined,
        journeyNote: m.journeyNote.trim() || undefined,
        commitmentLevel: Number(m.commitmentLevel) || 7,
        coverDataUrl: this.coverDataUrl() ?? undefined,
        skillReqs: this.skillReqs(),
        questReqs: this.questReqs(),
        subtasks: this.subtasks().map((s) => ({
          id: s.id,
          title: s.title,
          gatesJourney: s.gatesJourney,
        })),
        rewards: m.titleReward.trim()
          ? { title: m.titleReward.trim() }
          : undefined,
        totalXp: Math.max(0, Math.round(Number(m.totalXp) || 0)),
        skillWeights: this.skillWeights(),
        wealthCents: boostsWealth(this.skillWeights())
          ? parseMoneyToCents(m.wealthAmount)
          : 0,
      };
      const id = this.editId();
      const req =
        id !== null
          ? this.questsService.update(id, payload)
          : this.questsService.create(payload);
      req.subscribe({
        next: (q) => {
          this.saving.set(false);
          void this.router.navigate(['/quests', q.id]);
        },
        error: (err: { error?: { message?: string } }) => {
          this.saving.set(false);
          this.timed.set(err.error?.message ?? 'Save failed');
        },
      });
    });
  }

  private loadQuest(id: number): void {
    this.loading.set(true);
    this.questsService.getOne(id).subscribe({
      next: (q) => {
        this.applyQuest(q);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.timed.set('Could not load quest for editing');
      },
    });
  }

  private applyQuest(q: QuestView): void {
    this.createModel.set({
      name: q.name,
      summary: q.summary ?? '',
      rules: q.rules ?? '',
      stakes: q.stakes ?? '',
      howToWin: q.howToWin ?? '',
      destination: q.destination ?? '',
      journeyLabel: q.journeyLabel ?? '',
      journeyNote: q.journeyNote ?? '',
      commitmentLevel: q.commitmentLevel || 7,
      titleReward: q.rewards?.title ?? '',
      totalXp: q.totalXp || 0,
      wealthAmount: centsToInput(q.wealthCents),
    });
    this.subtasks.set(
      q.subtasks.map((s) => ({
        id: s.id,
        title: s.title,
        gatesJourney: Boolean(s.gatesJourney),
      })),
    );
    this.skillReqs.set(
      q.requirements
        .filter((r) => r.kind === 'skill' && r.slug)
        .map((r) => ({ slug: r.slug!, level: r.level ?? 1 })),
    );
    this.questReqs.set(
      q.requirements
        .filter((r) => r.kind === 'quest' && r.slug)
        .map((r) => r.slug!),
    );
    this.skillWeights.set(
      q.skillShares.map((s) => ({ slug: s.slug, weight: s.weight })),
    );
    const existing = resolveQuestCoverUrl(q.coverUrl, API_BASE_URL);
    this.coverPreview.set(existing);
    this.coverDataUrl.set(null);
  }
}
