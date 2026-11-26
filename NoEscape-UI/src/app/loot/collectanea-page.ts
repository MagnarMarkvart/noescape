import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { onRemoteChange } from '../core/data-sync';
import { LootCollection, LootService, TIER_ORDER } from './loot';

@Component({
  selector: 'app-collectanea-page',
  imports: [DecimalPipe, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../level-ups/level-ups-page.css',
  styles: `
    .lede { color: var(--rs-muted); font-size: 0.9rem; margin: 0 0 1rem; max-width: 40rem; }
    .tier { margin: 1.1rem 0 0.4rem; font-family: var(--font-display); font-size: 0.85rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--rs-accent); }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr)); gap: 0.5rem; }
    .item { border: 1px solid var(--rs-border); background: rgba(20, 16, 10, 0.5); padding: 0.55rem; display: grid; gap: 0.2rem; min-width: 0; }
    .item.missing { opacity: 0.45; }
    .item .icon { font-size: 1.6rem; }
    .item .name { font-family: var(--font-display); font-size: 0.85rem; }
    .item small { color: var(--rs-muted); font-size: 0.7rem; overflow-wrap: anywhere; }
    .count { color: var(--rs-accent); font-weight: 600; }
    .recent { list-style: none; padding: 0; margin: 0.4rem 0 0; display: grid; gap: 0.3rem; }
    .recent li { display: flex; gap: 0.5rem; align-items: baseline; font-size: 0.85rem; flex-wrap: wrap; }
    .recent .when { color: var(--rs-muted); font-size: 0.75rem; }
    .stats { display: flex; gap: 1.2rem; flex-wrap: wrap; color: var(--rs-muted); font-size: 0.85rem; }
    .stats b { color: var(--rs-text); }
  `,
  template: `
    <section class="levelups-shell">
      <header class="toolbar">
        <div class="brand-block">
          <p class="kicker">Thesaurus</p>
          <h1>Collectanea</h1>
        </div>
      </header>
      <p class="lede">
        Now and then, earning XP turns up something. Most days nothing does — keep living, keep
        playing, and the rare ones find you. Collectibles are separate from XP.
      </p>
      @if (data(); as d) {
        <p class="stats">
          <span>Finds <b>{{ d.totalFinds | number }}</b></span>
          <span>Found <b>{{ foundCount() }}/{{ d.items.length }}</b></span>
        </p>
        @for (t of tiers(); track t.tier) {
          <h2 class="tier">{{ t.tier }}</h2>
          <div class="grid">
            @for (i of t.items; track i.key) {
              <article class="item" [class.missing]="i.count === 0">
                <span class="icon" aria-hidden="true">{{ i.count ? i.icon : '❔' }}</span>
                <span class="name">{{ i.count ? i.name : '???' }}</span>
                @if (i.count) {
                  <small><span class="count">×{{ i.count }}</span></small>
                }
                @if (i.count) {
                  <small>{{ i.flavor }}</small>
                }
              </article>
            }
          </div>
        }
        <h2 class="tier">Recent finds</h2>
        @if (d.recent.length === 0) {
          <p class="lede">Nothing found yet.</p>
        } @else {
          <ul class="recent">
            @for (r of d.recent; track r.id) {
              <li>
                <span aria-hidden="true">{{ r.icon }}</span>
                <span>{{ r.name }}</span>
                <span class="when">{{ r.tier }} · +{{ r.xpGained }} XP · {{ r.createdAt | date: 'd.MM HH:mm' }}</span>
              </li>
            }
          </ul>
        }
      } @else {
        <p class="state-msg">Loading…</p>
      }
    </section>
  `,
})
export class CollectaneaPage implements OnInit {
  private readonly loot = inject(LootService);
  protected readonly data = signal<LootCollection | null>(null);
  private readonly remoteSync = onRemoteChange(['dailies', 'quests', 'habits', 'routines', 'scriptorium', 'horologium', 'skills'], () => this.load());

  protected readonly tiers = computed(() => {
    const d = this.data();
    if (!d) return [];
    return TIER_ORDER.map((tier) => ({ tier, items: d.items.filter((i) => i.tier === tier) })).filter((t) => t.items.length);
  });
  protected readonly foundCount = computed(() => this.data()?.items.filter((i) => i.count > 0).length ?? 0);

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loot.collection().subscribe({ next: (d) => this.data.set(d) });
  }
}
