import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CharacterProfile, CharacterService } from './character.service';

@Component({
  selector: 'app-character-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './character-page.html',
  styleUrl: './character-page.css',
})
export class CharacterPage implements OnInit {
  private readonly characterService = inject(CharacterService);

  protected readonly profile = signal<CharacterProfile | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly wealthLabel = this.characterService.wealthLabel;

  protected readonly skillGroups = computed(() => {
    const skills = this.profile()?.skills ?? [];
    const order: string[] = [];
    const map = new Map<string, typeof skills>();
    for (const s of skills) {
      const key = s.category || 'Other';
      if (!map.has(key)) {
        order.push(key);
        map.set(key, []);
      }
      map.get(key)!.push(s);
    }
    return order.map((category) => ({
      category,
      skills: map.get(category)!,
    }));
  });

  ngOnInit(): void {
    this.characterService.getProfile().subscribe({
      next: (p) => this.profile.set(p),
      error: () => this.error.set('Could not load character'),
    });
  }
}
