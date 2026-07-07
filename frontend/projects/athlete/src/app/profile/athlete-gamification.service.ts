import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { getApps, initializeApp } from 'firebase/app';
import { collection, doc, getFirestore, onSnapshot, type Firestore } from 'firebase/firestore';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { computeLevelProgress, type LevelProgress } from './gamification-level';

export interface GamificationSummaryView {
  xp: number;
  level: number;
  streak: number;
  totalGames: number;
  progress: LevelProgress;
}

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) {
    return null;
  }
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

function readSummary(data: Record<string, unknown> | undefined): GamificationSummaryView {
  const rawXp = typeof data?.['xp'] === 'number' ? (data['xp'] as number) : 0;
  const xp = Number.isFinite(rawXp) && rawXp > 0 ? Math.floor(rawXp) : 0;
  // Deriva o nível a partir do xp (mesma regra de gamification-level.ts) e só aceita o `level` do
  // Firestore quando ele bate com esse valor derivado — evita expor um `level` que diverge do
  // nível realmente usado por computeLevelProgress quando o doc está dessincronizado.
  const derivedLevel = Math.floor(xp / 100);
  const rawLevel = typeof data?.['level'] === 'number' ? (data['level'] as number) : derivedLevel;
  const level =
    Number.isFinite(rawLevel) && rawLevel >= 0 && Math.floor(rawLevel) === derivedLevel
      ? Math.floor(rawLevel)
      : derivedLevel;
  const streak = typeof data?.['streak'] === 'number' ? (data['streak'] as number) : 0;
  const totalGames = typeof data?.['totalGames'] === 'number' ? (data['totalGames'] as number) : 0;
  return { xp, level, streak, totalGames, progress: computeLevelProgress(xp, level) };
}

/** Só leitura: users/{uid}/gamification/summary é escrito exclusivamente por Cloud Functions. */
@Injectable({ providedIn: 'root' })
export class AthleteGamificationService {
  private readonly auth = inject(AuthService);
  private readonly firestore = createFirestore();

  private readonly summaryState = signal<GamificationSummaryView | null>(null);
  private readonly unlockedState = signal<ReadonlySet<string>>(new Set());

  readonly summary = computed(() => this.summaryState());
  readonly unlockedAchievementIds = computed(() => this.unlockedState());

  constructor() {
    effect((onCleanup) => {
      const uid = this.auth.user()?.uid ?? null;

      if (!uid || !this.firestore) {
        this.summaryState.set(null);
        this.unlockedState.set(new Set());
        return;
      }

      const stopSummary = onSnapshot(
        doc(this.firestore, 'users', uid, 'gamification', 'summary'),
        (snapshot) => {
          this.summaryState.set(readSummary(snapshot.data()));
        },
        () => this.summaryState.set(null),
      );

      const stopBadges = onSnapshot(
        collection(this.firestore, 'users', uid, 'gamification_badges'),
        (snapshot) => {
          this.unlockedState.set(new Set(snapshot.docs.map((badgeDoc) => badgeDoc.id)));
        },
        () => this.unlockedState.set(new Set()),
      );

      onCleanup(() => {
        stopSummary();
        stopBadges();
      });
    });
  }
}
