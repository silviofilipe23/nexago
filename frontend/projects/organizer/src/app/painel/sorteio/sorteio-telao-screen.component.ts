import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  destinationLabelOf,
  groupsOf,
  remainingInPot,
  seedOrderOf,
} from '../data/draw-session-selectors';
import type { DrawSession, DrawSessionEntrant } from '../data/draw-session.model';
import { OgAvatarComponent } from '../ui/avatar.component';
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
    OgAvatarComponent,
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
          <img class="og-telao-mark" src="/brand/logo.png" alt="" width="44" height="44" />
          <div class="og-telao-marca-texto">
            <div class="og-telao-wordmark">nexa<span>GO</span></div>
            <span class="og-telao-kicker">Sorteio ao vivo</span>
          </div>
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
                  <div class="og-telao-esteira-item" [attr.aria-label]="entrant.label">
                    @for (slot of avatarSlots(entrant); track $index) {
                      <og-avatar [initials]="slot.initials" [photoUrl]="slot.photoUrl" [size]="56" />
                    }
                  </div>
                }
              </div>
            </div>
          }
          @case ('waiting') {
            <div class="og-telao-centro">
              <div class="og-telao-logo-wrap" aria-hidden="true">
                <span class="og-telao-logo-glow"></span>
                <img class="og-telao-logo" src="/brand/logo.png" alt="" width="220" height="220" />
              </div>
              @for (line of [waitingLine()]; track line) {
                <p class="og-telao-frase">{{ line }}</p>
              }
              <span class="og-telao-kicker og-telao-kicker-lg">{{ s.entrants.length }} equipes prontas para o sorteio</span>
              <!-- <div class="og-telao-aviso"></div> -->
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
              [seedOrder]="seedOrder()"
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
      display: flex;
      align-items: center;
      gap: 14px;
      flex: none;
    }
    .og-telao-mark {
      width: 44px;
      height: 44px;
      object-fit: contain;
      flex: none;
    }
    .og-telao-marca-texto {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .og-telao-wordmark {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 32px;
      letter-spacing: -0.02em;
      line-height: 1;
    }
    .og-telao-wordmark span {
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
    .og-telao-logo-wrap {
      position: relative;
      display: grid;
      place-items: center;
      width: 280px;
      height: 280px;
      margin-bottom: 8px;
      animation: og-telao-logo-float 3.6s ease-in-out infinite;
    }
    .og-telao-logo-glow {
      position: absolute;
      inset: 18%;
      border-radius: 50%;
      background: radial-gradient(circle, rgb(255 106 26 / 38%), transparent 70%);
      filter: blur(8px);
      animation: og-telao-logo-glow 3.6s ease-in-out infinite;
      pointer-events: none;
    }
    .og-telao-logo {
      position: relative;
      width: 220px;
      height: 220px;
      object-fit: contain;
      filter: drop-shadow(0 18px 40px rgb(0 0 0 / 45%));
    }
    .og-telao-frase {
      margin: 0;
      max-width: 980px;
      min-height: 1.3em;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 36px;
      line-height: 1.3;
      letter-spacing: -0.02em;
      color: var(--nx-text);
      text-wrap: pretty;
      animation: og-telao-frase-in 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    .og-telao-esteira {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 18px;
      max-width: 1500px;
    }
    .og-telao-esteira-item {
      display: flex;
      flex: none;
      padding: 6px;
      border-radius: 999px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
    }
    .og-telao-esteira-item og-avatar + og-avatar {
      margin-left: -14px;
      border-radius: 50%;
      box-shadow: 0 0 0 3px var(--nx-surface-1);
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
    @keyframes og-telao-logo-float {
      0%,
      100% {
        transform: translateY(0) scale(1);
      }
      50% {
        transform: translateY(-18px) scale(1.04);
      }
    }
    @keyframes og-telao-logo-glow {
      0%,
      100% {
        opacity: 0.55;
        transform: scale(0.92);
      }
      50% {
        opacity: 1;
        transform: scale(1.08);
      }
    }
    @keyframes og-telao-frase-in {
      from {
        opacity: 0;
        transform: translateY(14px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .og-telao-logo-wrap,
      .og-telao-logo-glow,
      .og-telao-frase,
      .og-telao-live-dot {
        animation: none;
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
    :host(.retrato) .og-telao-wordmark {
      font-size: 40px;
    }
    :host(.retrato) .og-telao-mark {
      width: 52px;
      height: 52px;
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
    :host(.retrato) .og-telao-logo-wrap {
      width: 320px;
      height: 320px;
    }
    :host(.retrato) .og-telao-logo {
      width: 260px;
      height: 260px;
    }
    :host(.retrato) .og-telao-frase {
      font-size: 42px;
      max-width: 860px;
    }
    :host(.retrato) .og-telao-esteira {
      gap: 22px;
    }
    :host(.retrato) .og-telao-esteira-item og-avatar + og-avatar {
      margin-left: -16px;
    }
    :host(.retrato) .og-telao-rodape {
      padding: 28px 48px;
    }
    :host(.retrato) .og-telao-app {
      font-size: 26px;
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

  /** Frase sob a logo — troca a cada 8 s pelo relógio do telão. */
  protected readonly waitingLine = computed(() => {
    const tick = Math.floor(this.now() / 7000);
    return WAITING_LINES[tick % WAITING_LINES.length]!;
  });

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
      .map((entrant, i) => (entrant ? null : `POSIÇÃO ${i + 1}`))
      .filter((label): label is string => label != null);
  });

  protected readonly formatLabel = computed(() =>
    this.session().format === 'groups_knockout' ? 'fase de grupos' : 'dupla eliminatória',
  );

  /** Par de avatares da esteira — sempre 2 círculos, como na fila do console. */
  protected avatarSlots(entrant: DrawSessionEntrant): Array<{ initials: string; photoUrl: string | null }> {
    const names = entrant.playerNames.length > 0 ? entrant.playerNames : entrant.label.split('/');
    return [0, 1].map((i) => ({
      initials: initialsOf(names[i] ?? ''),
      photoUrl: entrant.photoUrls[i] ?? null,
    }));
  }

  protected padded(value: number): string {
    return String(value).padStart(2, '0');
  }
}

function initialsOf(name: string): string {
  const clean = name.trim();
  if (!clean) return '?';
  const parts = clean.split(/\s+/);
  const first = parts[0]?.charAt(0) ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

/**
 * Corneta de espera — situacional do esporte, sem mirar atleta.
 * A troca é pelo `now` do telão: TV e espelho do console ficam em fase.
 */
const WAITING_LINES = [

  'A nexaGO conecta. A quadra decide.',

  'A chave ainda não saiu. A resenha já começou.',

  'A nexaGO ainda não sorteou. Mas alguém já está reclamando.',

  'Seu próximo adversário pode estar olhando essa mesma tela.',

  'Hoje o sorteio. Amanhã, história no ranking.',

  'A nexaGO mostra os números. A quadra mostra quem é quem.',

  'A chave ainda está fechada. A corneta já está aberta.',

  'A nexaGO conecta as duplas. O sorteio separa os amigos.',

  'Do primeiro saque ao último ponto, tudo fica registrado.',

  'A bola é de vocês. O resto deixa com a nexaGO.',

  'Torneio, arena, ranking e comunidade. Tudo conectado.',

  'Seu nome na chave. Seu jogo no ranking.',

  'A nexaGO organiza. Vocês fazem história.',

  'A próxima partida começa muito antes do primeiro saque.',

  'Mais que torneio. Um ecossistema inteiro em movimento.',

  'Seu jogo. Seu ranking. Sua história.',

  'A partida acaba. O ranking lembra.',

  'Pode fugir da pressão. Do ranking, não.',

  'A nexaGO registra o resultado. A resenha registra o resto.',

  'A chave define o confronto. O grupo do WhatsApp define a corneta.',

  'A nexaGO sabe quem joga. Agora falta descobrir quem ganha.',

  'A competição começa antes da bola subir.',

  'A chave ainda não saiu. O grupo do WhatsApp já está pegando fogo.',

  'Enquanto vocês esperam a chave, a nexaGO já está trabalhando.',

  'Um sorteio. Várias histórias. Uma comunidade.',

  'A arena está pronta. As duplas também. Falta a chave.',

  'Tem jogo chegando. E a nexaGO já sabe disso.',

  'A chave ainda está fechada. Mas a ansiedade já está ao vivo.',

  'A nexaGO está conectando as duplas. O destino faz o resto.',

  'Atletas. Arenas. Torneios. Tudo conectado.',

  'Do treino à competição, tudo passa pela nexaGO.',

  'Onde atletas encontram arenas e torneios encontram histórias.',

  'Seu esporte não termina quando a partida acaba.',

  'Uma arena. Um torneio. Centenas de histórias.',

  'A quadra conecta. A nexaGO leva além.',

  'Encontre seu jogo. Viva o torneio. Construa seu ranking.',

  'A nexaGO transforma partidas em histórico.',

  'Cada partida conecta atletas. Cada torneio movimenta a comunidade.',

  'Jogue. Compita. Evolua. Conecte.',

  'O esporte acontece na quadra. O ecossistema continua na nexaGO.',

  'A nexaGO ainda não começou. A ansiedade já.',

  'A chave está chegando. O psicológico que lute.',

  'Respira. A próxima dupla pode mudar tudo.',

  'A nexaGO conecta as duplas. Agora o sorteio faz o estrago.',

  'Todo mundo quer uma boa chave. Até descobrir o que é uma boa chave.',

  'A sorte está trabalhando. Por enquanto, ninguém pode reclamar.',

  'A chave vai sair. As desculpas também.',

  'O sorteio ainda nem começou e já tem gente negociando com o universo.',

  'Tem dupla torcendo pela chave. Tem dupla torcendo para a chave errar.',

  'A nexaGO prepara a chave. Vocês preparam as desculpas.',

  'A ansiedade também faz parte do torneio.',

  'Se você está tranquilo, provavelmente ainda não viu a chave.',

  'O jogo começa quando a bola sobe. O nervosismo começa bem antes.',

  'A chave está quase pronta. O coração também não.',

  'A nexaGO está calculando. Vocês estão sofrendo.',

  'A tecnologia faz o sorteio. A resenha faz o resto.',

  'O algoritmo não tem amigos.',

  'A nexaGO não escolhe adversário. Só entrega o destino.',

  'Se cair com seu amigo, finja surpresa.',

  'Se cair com a favorita, finja tranquilidade.',

  'Se cair no grupo da morte, pelo menos rende conteúdo.',

  'Se a chave não agradar, lembre-se: reclamar não altera o ranking.',

  'A nexaGO mostra a chave. A quadra resolve a discussão.',

  'O ranking não mente. Mas a resenha tenta.',

  'Tem ranking, tem chave, tem torneio. Falta só o drama.',

  'O próximo ponto pode ser seu próximo salto no ranking.',

  'Cada partida conta. Algumas contam até na resenha.',

  'Seu próximo jogo pode valer mais do que você imagina.',

  'O ranking observa. A nexaGO registra. A quadra responde.',

  'Hoje adversário. Amanhã talvez dupla de treino. Ou não.',

  'A competição aproxima. O sorteio às vezes afasta.',

  'Amizade até o primeiro saque.',

  'O sorteio separa os amigos e aproxima os memes.',

  'A nexaGO conecta todo mundo. A chave decide quem se enfrenta.',

  'Tem atleta, tem arena, tem torneio. Agora falta a confusão.',

  'O ecossistema está em movimento. A bola ainda não.',

  'Tudo conectado. Menos o emocional de quem está esperando a chave.',

  'nexaGO no controle. Atletas tentando controlar a ansiedade.',

  'A plataforma está pronta. A pergunta é: vocês estão?',  

  'A nexaGO cuida da organização. Vocês cuidam do espetáculo.',

  'Do cadastro à final, cada ponto conta uma história.',

  'Do primeiro jogo ao ranking, a nexaGO acompanha tudo.',

  'O torneio começa aqui. A história continua na quadra.',

  'Seu próximo jogo já está tomando forma.',

  'A próxima história do torneio pode começar com um simples sorteio.',

  'Mais uma partida chegando. Mais uma chance de deixar seu nome na história.',

  'A chave define o caminho. Vocês definem o resultado.',

  'A nexaGO mostra o caminho. A quadra decide até onde você vai.',

  'O sorteio aproxima. A competição define.',

  'A areia é o palco. A nexaGO conecta o espetáculo.',

  'O esporte conecta. A nexaGO leva isso além.',

  'Aqui, cada partida é parte de algo maior.',

  'A próxima partida pode mudar seu ranking. Ou seu humor.',

  'Seu ranking está tranquilo. Por enquanto.',

  'A nexaGO está pronta. Agora falta alguém perder a calma.',

  'O sorteio chamou. A ansiedade atendeu.',

  'A chave está quase lá. Aguenta mais um pouco.',

  'Não pisca. Sua próxima partida pode aparecer aqui.',

  'Atualizando o destino de algumas duplas em 3... 2... 1...',

  'Atenção: seu próximo adversário pode estar prestes a aparecer.',

  'A nexaGO está sorteando. O universo que lute.',

  'Em alguns segundos, alguém vai comemorar. Alguém vai culpar o sorteio.',

  'A sorte está lançada. Literalmente.',

  'Prepare o print. Essa chave vai render.',

  'A chave sai. O print vai para o grupo. A resenha começa.',

  'Se não gostou da chave, pelo menos ela ficou bonita no print.',

  'O sorteio termina. A investigação começa.',

  'Todo mundo entende de chaveamento depois que a chave sai.',

  'O torneio tem regulamento. A resenha tem regras próprias.',

  'Ninguém pediu um grupo da morte. Mas alguém sempre recebe.',

  'A nexaGO não promete caminho fácil. Promete jogo.',

  'Não existe chave perfeita. Existe a chave que você consegue ganhar.',

  'A chave pode ser difícil. A desculpa não precisa ser.',

  'Quem quer chegar na final precisa passar pela chave.',

  'O caminho até a final acaba de ficar mais interessante.',

  'A nexaGO conecta. O ranking provoca. A quadra responde.',

  'A comunidade acompanha. Os atletas competem. A nexaGO registra.',

  'Cada torneio movimenta a comunidade. Cada partida movimenta o ranking.',

  'Uma plataforma. Muitas arenas. Milhares de partidas por vir.',

  'O próximo jogo pode ser na arena ao lado. Ou contra alguém que você conhece.',

  'A nexaGO coloca o esporte inteiro na mesma rede.',

  'Atletas se encontram. Arenas se conectam. Torneios acontecem.',

  'O jogo é na areia. A jornada é na nexaGO.',

  'Não é só sobre ganhar. É sobre estar no jogo.',

  'Compita hoje. Evolua amanhã.',

  'Jogue mais. Conecte mais. Evolua mais.',

  'A próxima partida é só o começo.',

] as const;
