import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, of, tap } from 'rxjs';
import { shareReplay } from 'rxjs/operators';
import { API_BASE_URL } from '../core/api.config';
import { LevelUpLogPage } from '../level-ups/level-ups.model';
import {
  LogActivityResponse,
  Reward,
  Skill,
  SkillGuide,
  SkillTree,
} from './skill.model';

@Injectable({ providedIn: 'root' })
export class SkillsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${API_BASE_URL}/skills`;
  private readonly rewardsUrl = `${API_BASE_URL}/rewards`;
  private treeCache: SkillTree | null = null;
  private tree$: Observable<SkillTree> | null = null;

  /** Instant read of last successful tree (may be stale). */
  peekTree(): SkillTree | null {
    return this.treeCache;
  }

  /**
   * @param force when true, always hit the network and refresh cache.
   * When false, return memory cache if present (instant navigation).
   */
  getTree(force = false): Observable<SkillTree> {
    if (!force && this.treeCache) {
      return of(this.treeCache);
    }
    if (!force && this.tree$) {
      return this.tree$;
    }
    if (force) {
      this.tree$ = null;
    }

    this.tree$ = this.http.get<SkillTree>(`${this.baseUrl}/tree`).pipe(
      tap((tree) => {
        this.treeCache = tree;
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.tree$;
  }

  invalidateTree(): void {
    this.treeCache = null;
    this.tree$ = null;
  }

  getAll() {
    return this.http.get<Skill[]>(this.baseUrl);
  }

  getOne(id: number) {
    return this.http.get<Skill>(`${this.baseUrl}/${id}`);
  }

  listLevelUps(page = 1, pageSize = 15) {
    return this.http.get<LevelUpLogPage>(
      `${this.baseUrl}/level-ups?page=${page}&pageSize=${pageSize}`,
    );
  }

  logActivity(
    skillId: number,
    xpGained: number,
    note?: string,
    duration?: number,
  ) {
    return this.http
      .post<LogActivityResponse>(`${this.baseUrl}/${skillId}/activities`, {
        xpGained,
        note,
        duration,
      })
      .pipe(tap(() => this.invalidateTree()));
  }

  getSkillGuide(skillId: number) {
    return this.http.get<SkillGuide>(`${this.rewardsUrl}/guide/${skillId}`);
  }

  claimReward(rewardId: number) {
    return this.http.post<Reward>(`${this.rewardsUrl}/${rewardId}/claim`, {});
  }
}
