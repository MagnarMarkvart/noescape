import { Injectable, inject } from '@angular/core';
import { Observable, concat, from, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { API_BASE_URL } from '../core/api.config';
import { ImageWarmService } from '../shared/image-warm.service';
import { QuestView, resolveQuestCoverUrl } from './quest.model';
import { QuestsService } from './quests.service';

export interface QuestReveal {
  quest: QuestView;
  /** True when data + cover were already in memory — skip the loader. */
  instant: boolean;
}

@Injectable({ providedIn: 'root' })
export class QuestRevealService {
  private readonly quests = inject(QuestsService);
  private readonly images = inject(ImageWarmService);

  open(id: number): Observable<QuestReveal> {
    const cached = this.quests.peekFull(id);
    const cover = cached
      ? resolveQuestCoverUrl(cached.coverUrl, API_BASE_URL)
      : null;
    const network$ = this.quests.getOne(id).pipe(
      switchMap((quest) => this.withCover(quest)),
    );
    if (cached && this.images.isWarm(cover)) {
      return concat(of({ quest: cached, instant: true }), network$);
    }
    if (cached) {
      return concat(
        from(this.images.ensure(cover)).pipe(
          map(() => ({ quest: cached, instant: false })),
        ),
        network$,
      );
    }
    return network$;
  }

  private withCover(quest: QuestView): Observable<QuestReveal> {
    const url = resolveQuestCoverUrl(quest.coverUrl, API_BASE_URL);
    return from(this.images.ensure(url)).pipe(
      map(() => ({ quest, instant: false })),
    );
  }
}
