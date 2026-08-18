import { Injectable, signal } from '@angular/core';

const ENABLED_KEY = 'noescape.sound.feedbackEnabled';
const VOLUME_KEY = 'noescape.sound.feedbackVolume';

function loadEnabled(): boolean {
  try {
    const raw = localStorage.getItem(ENABLED_KEY);
    if (raw === '0') {
      return false;
    }
    if (raw === '1') {
      return true;
    }
  } catch {
    /* private mode */
  }
  return true;
}

function loadVolume(): number {
  try {
    const raw = Number(localStorage.getItem(VOLUME_KEY));
    if (Number.isFinite(raw)) {
      return Math.min(100, Math.max(0, Math.round(raw)));
    }
  } catch {
    /* private mode */
  }
  return 100;
}

function saveItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

/** Client-side mute/volume for XP completion and level-up / level-down. */
@Injectable({ providedIn: 'root' })
export class SoundSettingsService {
  readonly feedbackEnabled = signal(loadEnabled());
  readonly feedbackVolume = signal(loadVolume());

  setFeedbackEnabled(on: boolean): void {
    this.feedbackEnabled.set(on);
    saveItem(ENABLED_KEY, on ? '1' : '0');
  }

  setFeedbackVolume(raw: number | string): void {
    const value = Math.min(100, Math.max(0, Math.round(Number(raw) || 0)));
    this.feedbackVolume.set(value);
    saveItem(VOLUME_KEY, String(value));
  }

  /** 0–1 gain for HTMLAudioElement.volume, or null when muted. */
  playbackGain(): number | null {
    if (!this.feedbackEnabled()) {
      return null;
    }
    const volume = this.feedbackVolume();
    if (volume <= 0) {
      return null;
    }
    return volume / 100;
  }
}
