import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { getApps, initializeApp } from 'firebase/app';
import { doc, getDoc, getFirestore, type Firestore } from 'firebase/firestore';
import { environment } from '../../environments/environment';
import { AthleteGamificationService } from './athlete-gamification.service';
import { SAND_RANK_COLOR, SAND_RANK_TRACK, sandRankProgressFromXp } from './sand-rank';

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

/** Card do Sand Rank (escada de elos por XP) — só aparece com a flag
 *  `appConfig/sandRank.enabled` ligada, igual ao app. Escudo desenhado em CSS
 *  com a cor do elo (os emblemas PNG são assets locais do Flutter). */
@Component({
  selector: 'app-sand-rank-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (enabled()) {
      <section class="sr-card">
        <div class="sr-head">
          <div>
            <p class="sr-kicker">Sand Rank</p>
            <span class="sr-title">{{ progress().current.rankName }}</span>
          </div>
          <div class="sr-shield" [style.--sr-color]="colorOf()">
            <span class="sr-shield-division">
              {{ progress().current.division > 0 ? romanOf(progress().current.division) : '★' }}
            </span>
          </div>
        </div>

        <div class="sr-progress">
          <div class="sr-progress-row">
            @if (progress().next; as next) {
              <span class="sr-progress-label">{{ xp() }} XP · faltam {{ progress().xpForNext }} pra {{ next.rankName }}</span>
            } @else {
              <span class="sr-progress-label">{{ xp() }} XP · topo da escada</span>
            }
            <span class="sr-progress-pct">{{ pct() }}%</span>
          </div>
          <div class="sr-progress-bar" role="progressbar" aria-label="Progresso no elo" [attr.aria-valuenow]="pct()" aria-valuemin="0" aria-valuemax="100">
            <span [style.width.%]="pct()" [style.background]="colorOf()"></span>
          </div>
        </div>

        <div class="sr-track" aria-label="Escada de elos">
          @for (s of track; track s.trackIndex) {
            <span
              class="sr-track-step"
              [class.sr-track-step--done]="s.trackIndex <= progress().current.trackIndex"
              [style.--sr-color]="stepColor(s.trackIndex)"
              [title]="s.rankName + ' · ' + s.minXp + ' XP'"
            ></span>
          }
        </div>
        <div class="sr-track-legend">
          <span>Iniciante</span>
          <span>Lenda</span>
        </div>
      </section>
    }
  `,
  styles: `
    .sr-card {
      padding: 18px;
      border-radius: var(--nx-r-4, 16px);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .sr-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .sr-kicker {
      margin: 0 0 3px;
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .sr-title {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 18px;
      letter-spacing: -0.01em;
      color: var(--nx-text);
    }
    .sr-shield {
      width: 46px;
      height: 50px;
      flex: none;
      display: grid;
      place-items: center;
      background: color-mix(in srgb, var(--sr-color) 22%, transparent);
      border: 1.5px solid var(--sr-color);
      clip-path: polygon(50% 0, 100% 14%, 100% 62%, 50% 100%, 0 62%, 0 14%);
    }
    .sr-shield-division {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 15px;
      color: var(--sr-color);
    }
    .sr-progress-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 10px;
      margin-bottom: 6px;
    }
    .sr-progress-label {
      font-family: var(--nx-font-ui);
      font-size: 12px;
      color: var(--nx-text-mute);
    }
    .sr-progress-pct {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      font-weight: 700;
      color: var(--nx-text-dim);
    }
    .sr-progress-bar {
      height: 7px;
      border-radius: 4px;
      background: var(--nx-surface-1);
      overflow: hidden;
    }
    .sr-progress-bar span {
      display: block;
      height: 100%;
      border-radius: 4px;
      transition: width 300ms ease-out;
    }
    .sr-track {
      display: flex;
      gap: 4px;
    }
    .sr-track-step {
      flex: 1;
      height: 8px;
      border-radius: 3px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
    }
    .sr-track-step--done {
      background: var(--sr-color);
      border-color: var(--sr-color);
    }
    .sr-track-legend {
      display: flex;
      justify-content: space-between;
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
  `,
})
export class SandRankCardComponent {
  private readonly gamification = inject(AthleteGamificationService);
  private readonly firestore = createFirestore();

  protected readonly track = SAND_RANK_TRACK;
  protected readonly enabled = signal(false);

  protected readonly xp = computed(() => this.gamification.summary()?.xp ?? 0);
  protected readonly progress = computed(() => sandRankProgressFromXp(this.xp()));
  protected readonly pct = computed(() => Math.round(this.progress().progress * 100));
  protected readonly colorOf = computed(() => SAND_RANK_COLOR[this.progress().current.rankCode]);

  constructor() {
    void this.loadFlag();
  }

  private async loadFlag(): Promise<void> {
    if (!this.firestore) return;
    try {
      const snap = await getDoc(doc(this.firestore, 'appConfig', 'sandRank'));
      this.enabled.set(snap.data()?.['enabled'] === true);
    } catch {
      this.enabled.set(false);
    }
  }

  protected stepColor(index: number): string {
    return SAND_RANK_COLOR[SAND_RANK_TRACK[index]!.rankCode];
  }

  protected romanOf(division: number): string {
    return division === 1 ? 'I' : division === 2 ? 'II' : 'III';
  }
}
