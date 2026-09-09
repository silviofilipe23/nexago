import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  destinationLabelOf,
  groupsOf,
  remainingInPot,
  seedOrderOf,
} from '../data/draw-session-selectors';
import type { DrawSession } from '../data/draw-session.model';
import {
  LAND_MS,
  ROLL_MS,
  countdownPartsOf,
  revealPhaseAt,
  spotlightProgressAt,
} from './draw-reveal-phase';
import { SorteioChaveDeComponent } from './sorteio-chave-de.component';
import { SorteioLoaderComponent } from './sorteio-loader.component';
import { SorteioGradeGruposComponent } from './sorteio-grade-grupos.component';
import { SorteioSpotlightComponent } from './sorteio-spotlight.component';

/**
 * O telão de transmissão — arte pura, num canvas lógico de 1920×1080.
 *
 * Recebe TUDO por input (a sessão e o instante) e não busca nada: é o que
 * permite a mesma peça ser a TV em tela cheia e o "espelho do telão" dentro do
 * console, sem risco de as duas divergirem.
 *
 * O que aparece na tela é decidido só pelo motor de fase, ancorado no `at` que
 * o servidor gravou. Nenhum timer local, nenhum estado acumulado.
 */
@Component({
  selector: 'og-sorteio-telao-screen',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.retrato]': 'portrait()' },
  imports: [
    SorteioChaveDeComponent,
    SorteioLoaderComponent,
    SorteioGradeGruposComponent,
    SorteioSpotlightComponent,
  ],
  template: `
    @let s = session();
    <div class="og-telao">
      <header class="og-telao-head">
        <div class="og-telao-marca">
          nexa<span>GO</span>
          <span class="og-telao-kicker">Sorteio ao vivo</span>
        </div>
        <div class="og-telao-sep"></div>
        <div class="og-telao-evento">
          <div class="og-telao-torneio">{{ s.tournamentName }}</div>
          <div class="og-telao-categoria">{{ s.categoryName }} · {{ formatLabel() }}</div>
        </div>
        <div class="og-telao-spacer"></div>
        @if (s.status === 'live' || s.status === 'published') {
          <div class="og-telao-contador">
            <span class="og-telao-kicker">Revelações</span>
            <span class="og-telao-contador-valor">
              {{ padded(s.reveals.length) }}<span>/{{ s.totalReveals }}</span>
            </span>
          </div>
        }
        @if (s.status === 'live') {
          <span class="og-telao-live"><span class="og-telao-live-dot"></span>AO VIVO</span>
        }
      </header>

      <main class="og-telao-palco">
        @switch (stage()) {
          @case ('countdown') {
            <div class="og-telao-centro">
              <span class="og-telao-kicker og-telao-kicker-lg">O sorteio começa em</span>
              @if (countdown(); as c) {
                <div class="og-telao-relogio">
                  {{ padded(c.hours) }}<span>:</span>{{ padded(c.minutes) }}<span>:</span
                  >{{ padded(c.seconds) }}
                </div>
              }
              <div class="og-telao-esteira">
                @for (entrant of s.entrants; track entrant.teamId) {
                  <span class="og-telao-esteira-item">{{ entrant.label }}</span>
                }
              </div>
            </div>
          }
          @case ('waiting') {
            <div class="og-telao-centro">
              <span class="og-telao-kicker og-telao-kicker-lg">Potes fechados</span>
              <div class="og-telao-aviso">{{ s.entrants.length }} duplas prontas para o sorteio</div>
            </div>
          }
          @case ('voided') {
            <div class="og-telao-centro">
              <span class="og-telao-kicker og-telao-kicker-lg og-telao-kicker-danger">
                Sessão anulada
              </span>
              <div class="og-telao-aviso">{{ s.voidReason }}</div>
            </div>
          }
          @case ('rolling') {
            <og-sorteio-loader
              [poolLabels]="poolLabels()"
              [resultNames]="currentNames()"
              [resultLabel]="currentLabel() ?? ''"
              [resultDestination]="currentDestination() ?? ''"
              [landed]="phase() === 'land'"
              [progress]="rollProgress()"
              [portrait]="portrait()"
            />
          }
          @case ('grid') {
            @if (s.format === 'groups_knockout') {
              <og-sorteio-grade-grupos
                [groups]="groups()"
                [highlightGroupId]="highlightGroupId()"
                [portrait]="portrait()"
              />
            } @else {
              <og-sorteio-chave-de
                [seedOrder]="seedOrder()"
                [pairings]="s.bracketOutline?.pairings ?? []"
                [byeSeeds]="s.bracketOutline?.byeSeeds ?? []"
                [lockedSeedCount]="s.config.lockedSeedCount"
                [highlightSeed]="highlightSeed()"
                [portrait]="portrait()"
              />
            }
          }
        }

        @if (stage() === 'spotlight' && currentReveal(); as reveal) {
          @if (currentEntrant(); as entrant) {
            <og-sorteio-spotlight
              [entrant]="entrant"
              [reveal]="reveal"
              [destinationLabel]="currentDestination() ?? ''"
              [progress]="spotlightProgress()"
              [portrait]="portrait()"
            />
          }
        }
      </main>

      <footer class="og-telao-rodape">
        @if (s.status === 'published') {
          <span class="og-telao-publicada">Chave publicada</span>
        } @else {
          <span class="og-telao-kicker">Sorteio no servidor, ao vivo</span>
        }
        <div class="og-telao-spacer"></div>
        <span class="og-telao-app">
          Acompanhe no app <strong>nexa<span>GO</span></strong>
        </span>
      </footer>
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 1920px;
      height: 1080px;
      background: var(--nx-bg);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
    }
    .og-telao {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .og-telao-head {
      flex: none;
      display: flex;
      align-items: center;
      gap: 22px;
      padding: 26px 56px;
      border-bottom: 1px solid var(--nx-line);
    }
    .og-telao-marca {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 32px;
      letter-spacing: -0.02em;
    }
    .og-telao-marca span {
      color: var(--nx-orange-500);
    }
    .og-telao-kicker {
      display: block;
      font-family: var(--nx-font-mono);
      font-size: 14px;
      font-weight: 500;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-telao-kicker-lg {
      font-size: 24px;
      color: var(--nx-orange-500);
    }
    .og-telao-kicker-danger {
      color: var(--nx-live);
    }
    .og-telao-sep {
      width: 1px;
      height: 48px;
      background: var(--nx-line-strong);
    }
    .og-telao-torneio {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 30px;
      letter-spacing: -0.01em;
    }
    .og-telao-categoria {
      font-family: var(--nx-font-mono);
      font-size: 16px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-top: 4px;
    }
    .og-telao-spacer {
      flex: 1;
    }
    .og-telao-contador {
      text-align: right;
      margin-right: 22px;
    }
    .og-telao-contador-valor {
      display: block;
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 40px;
      font-variant-numeric: tabular-nums;
      margin-top: 2px;
    }
    .og-telao-contador-valor span {
      color: var(--nx-text-dim);
    }
    .og-telao-live {
      display: inline-flex;
      align-items: center;
      gap: 11px;
      padding: 10px 20px;
      border-radius: 999px;
      background: rgb(255 59 48 / 14%);
      border: 1px solid rgb(255 59 48 / 45%);
      color: var(--nx-live);
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 18px;
      letter-spacing: 0.14em;
    }
    .og-telao-live-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--nx-live);
      animation: og-pulsa 1.6s ease-in-out infinite;
    }
    .og-telao-palco {
      position: relative;
      flex: 1;
      min-height: 0;
      padding: 28px 56px;
      overflow: hidden;
    }
    .og-telao-centro {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 30px;
      height: 100%;
      text-align: center;
    }
    .og-telao-relogio {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 190px;
      line-height: 1;
      letter-spacing: -0.03em;
      font-variant-numeric: tabular-nums;
    }
    .og-telao-relogio span {
      color: var(--nx-text-dim);
    }
    .og-telao-aviso {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 44px;
      letter-spacing: -0.02em;
      color: var(--nx-text-mute);
      max-width: 1200px;
      text-wrap: pretty;
    }
    .og-telao-esteira {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 12px;
      max-width: 1500px;
    }
    .og-telao-esteira-item {
      padding: 9px 18px;
      border-radius: 999px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      font-size: 22px;
      color: var(--nx-text-mute);
    }
    .og-telao-rodape {
      flex: none;
      display: flex;
      align-items: center;
      gap: 22px;
      padding: 20px 56px;
      border-top: 1px solid var(--nx-line);
      background: var(--nx-surface-0);
    }
    .og-telao-publicada {
      padding: 9px 20px;
      border-radius: 999px;
      background: rgb(43 209 126 / 16%);
      border: 1px solid rgb(43 209 126 / 45%);
      color: var(--nx-win);
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 18px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .og-telao-app {
      font-size: 22px;
      color: var(--nx-text-mute);
    }
    .og-telao-app strong {
      font-family: var(--nx-font-display);
      color: var(--nx-text);
    }
    .og-telao-app span {
      color: var(--nx-orange-500);
    }

    @keyframes og-pulsa {
      0%,
      100% {
        opacity: 1;
      }
      50% {
        opacity: 0.35;
      }
    }

    /* ── Canvas em pé ──────────────────────────────────────────────
       Mesmo conteúdo, proporções refeitas: mais altura pra respirar, menos
       largura pra caber. Nada é escondido — o celular vê o mesmo sorteio. */
    :host(.retrato) {
      width: 1080px;
      height: 1920px;
    }
    :host(.retrato) .og-telao-head {
      flex-wrap: wrap;
      gap: 16px;
      padding: 40px 48px;
    }
    :host(.retrato) .og-telao-sep {
      display: none;
    }
    :host(.retrato) .og-telao-evento {
      flex: 1 0 100%;
      order: 3;
    }
    :host(.retrato) .og-telao-torneio {
      font-size: 40px;
    }
    :host(.retrato) .og-telao-categoria {
      font-size: 22px;
    }
    :host(.retrato) .og-telao-marca {
      font-size: 40px;
    }
    :host(.retrato) .og-telao-kicker {
      font-size: 18px;
    }
    :host(.retrato) .og-telao-contador-valor {
      font-size: 46px;
    }
    :host(.retrato) .og-telao-palco {
      padding: 40px 48px;
    }
    :host(.retrato) .og-telao-relogio {
      font-size: 150px;
    }
    :host(.retrato) .og-telao-aviso {
      font-size: 52px;
    }
    :host(.retrato) .og-telao-esteira-item {
      font-size: 26px;
    }
    :host(.retrato) .og-telao-rodape {
      padding: 28px 48px;
    }
    :host(.retrato) .og-telao-app {
      font-size: 26px;
    }

    /* O ponto do AO VIVO é decorativo — a palavra já diz. */
    @media (prefers-reduced-motion: reduce) {
      .og-telao-live-dot {
        animation: none;
      }
    }
  `,
})
export class SorteioTelaoScreenComponent {
  readonly session = input.required<DrawSession>();
  /** Instante atual — vem do `DrawClockService` de quem hospeda a tela. */
  readonly now = input.required<number>();
  /**
   * Canvas em pé (1080×1920) em vez de deitado.
   *
   * Não é enfeite: no celular em pé, um canvas 16:9 escala pra 375×211 e o
   * texto de 25px vira 5px. O link do telão é público e é justamente no
   * celular que o atleta abre.
   */
  readonly portrait = input(false);

  protected readonly currentReveal = computed(() => {
    const reveals = this.session().reveals;
    return reveals.length > 0 ? reveals[reveals.length - 1]! : null;
  });

  /**
   * No modo manual o spotlight fica na tela até o organizador liberar. Quem
   * decide é o documento (`spotlightClearedIndex`) — o telão é outro cliente e
   * não tem como saber do clique de outra forma.
   */
  private readonly holdSpotlight = computed(() => {
    const s = this.session();
    const reveal = this.currentReveal();
    if (!reveal || s.config.mode !== 'manual') return false;
    return reveal.index > (s.spotlightClearedIndex ?? 0);
  });

  private readonly dismissed = computed(() => {
    const s = this.session();
    const reveal = this.currentReveal();
    if (!reveal || s.config.mode !== 'manual') return false;
    return reveal.index <= (s.spotlightClearedIndex ?? 0);
  });

  protected readonly phase = computed(() =>
    revealPhaseAt(this.currentReveal()?.atMillis ?? null, this.now(), {
      holdSpotlight: this.holdSpotlight(),
      dismissed: this.dismissed(),
    }),
  );

  protected readonly countdown = computed(() =>
    countdownPartsOf(this.session().scheduledAt, this.now()),
  );

  /**
   * A cena da vez. A ordem importa: uma sessão anulada nunca mostra sorteio, e
   * a contagem regressiva só existe enquanto o relógio não zerou.
   */
  protected readonly stage = computed<'countdown' | 'waiting' | 'voided' | 'rolling' | 'spotlight' | 'grid'>(
    () => {
      const s = this.session();
      if (s.status === 'voided') return 'voided';
      if (s.status === 'scheduled' || s.status === 'draft') {
        return this.countdown() && !this.countdown()!.done ? 'countdown' : 'waiting';
      }
      const phase = this.phase();
      if (phase === 'roll' || phase === 'land') return 'rolling';
      if (phase === 'spotlight') return 'spotlight';
      return 'grid';
    },
  );

  protected readonly elapsedMs = computed(() =>
    Math.max(0, this.now() - (this.currentReveal()?.atMillis ?? this.now())),
  );

  protected readonly spotlightProgress = computed(() =>
    spotlightProgressAt(this.currentReveal()?.atMillis ?? null, this.now()),
  );

  protected readonly currentEntrant = computed(() => {
    const reveal = this.currentReveal();
    if (!reveal) return null;
    return this.session().entrants.find((e) => e.teamId === reveal.teamId) ?? null;
  });

  protected readonly currentLabel = computed(() => this.currentEntrant()?.label ?? null);

  /** Nomes dos dois atletas — é o que trava na face da frente de cada dado. */
  protected readonly currentNames = computed(() => {
    const entrant = this.currentEntrant();
    if (!entrant) return [];
    return entrant.playerNames.length > 0 ? entrant.playerNames : entrant.label.split('/');
  });

  /** Progresso do lançamento, do início do rolamento até travar. */
  protected readonly rollProgress = computed(() =>
    Math.min(1, this.elapsedMs() / (ROLL_MS + LAND_MS)),
  );

  protected readonly currentDestination = computed(() => {
    const reveal = this.currentReveal();
    return reveal ? destinationLabelOf(reveal.destination) : null;
  });

  /**
   * Quantas revelações a GRADE pode mostrar.
   *
   * Enquanto a última ainda está no ar (dados rolando ou spotlight), ela fica
   * de fora: a grade não pode entregar o resultado que o show ainda está
   * revelando, mesmo já estando gravado no servidor.
   */
  private readonly visibleCount = computed(() => {
    const total = this.session().reveals.length;
    return this.phase() === 'grid' ? total : Math.max(0, total - 1);
  });

  protected readonly groups = computed(() => groupsOf(this.session(), this.visibleCount()));

  protected readonly seedOrder = computed(() => seedOrderOf(this.session(), this.visibleCount()));

  /** Só acende o destino depois que a revelação terminou de ir ao ar. */
  protected readonly highlightGroupId = computed(() => {
    if (this.phase() !== 'grid') return null;
    const destination = this.currentReveal()?.destination;
    return destination?.type === 'group' ? destination.groupId : null;
  });

  protected readonly highlightSeed = computed(() => {
    if (this.phase() !== 'grid') return null;
    const destination = this.currentReveal()?.destination;
    return destination?.type === 'seed' ? destination.seed : null;
  });

  /** Nomes que passam no dado da esquerda: quem ainda está no pote. */
  protected readonly poolLabels = computed(() => {
    const pending = remainingInPot(this.session()).map((e) => e.label);
    return pending.length > 0 ? pending : [this.currentLabel() ?? '—'];
  });

  /** Destinos que passam no dado da direita. */
  protected readonly destinationLabels = computed(() => {
    const s = this.session();
    if (s.format === 'groups_knockout') return groupsOf(s, 0).map((g) => `GRUPO ${g.groupId}`);
    return this.seedOrder()
      .map((entrant, i) => (entrant ? null : `SEED ${i + 1}`))
      .filter((label): label is string => label != null);
  });

  protected readonly formatLabel = computed(() =>
    this.session().format === 'groups_knockout' ? 'fase de grupos' : 'dupla eliminatória',
  );

  protected padded(value: number): string {
    return String(value).padStart(2, '0');
  }
}
