import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { destinationLabelOf, remainingInPot, winRateOf } from '../data/draw-session-selectors';
import type { DrawSession } from '../data/draw-session.model';
import {
  drawNextReveal,
  publishDrawSession,
  replaceRevealPhrase,
  voidDrawSession,
} from '../data/organizer-ops.service';
import { OgCardComponent } from '../ui/card.component';
import { OgConfirmDialogComponent } from '../ui/confirm-dialog.component';
import { OgIconComponent } from '../ui/icon.component';
import { crossesPotBoundary, shouldAutoDraw } from './draw-auto-advance';
import { DrawClockService } from './draw-clock.service';
import { drawTelaoUrl } from './draw-links';
import { DrawSessionStore } from './draw-session.store';
import { SorteioDuplaRowComponent } from './sorteio-dupla-row.component';
import { SorteioEspelhoComponent } from './sorteio-espelho.component';

/**
 * O console de controle — a ÚNICA superfície do sorteio com botões.
 *
 * Três colunas, como no protótipo: à esquerda o que está NO AR e o que vem a
 * seguir, no meio o espelho do telão, à direita o que já aconteceu. A barra de
 * transporte fica fixa no rodapé porque é de onde o organizador conduz — e
 * durante uma transmissão ele não pode caçar botão.
 *
 * Nos modos automático e híbrido o timer roda AQUI, no navegador do
 * organizador: agendar no servidor custaria uma função por revelação, e
 * "console fechou, show pausou" é o comportamento desejado.
 */
@Component({
  selector: 'og-sorteio-console',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DrawSessionStore, DrawClockService],
  imports: [
    DatePipe,
    OgCardComponent,
    OgConfirmDialogComponent,
    OgIconComponent,
    SorteioDuplaRowComponent,
    SorteioEspelhoComponent,
  ],
  template: `
    @let s = store.session();
    @if (!s) {
      <div class="og-cs-vazio">
        {{
          store.loading()
            ? 'Carregando a sessão…'
            : 'Sessão não encontrada. Volte para a configuração do sorteio.'
        }}
      </div>
    } @else {
      <header class="og-cs-head">
        <div>
          <div class="og-cs-titulo">
            <h1>Console do sorteio</h1>
            @if (s.status === 'live') {
              <span class="og-cs-live"><i></i>AO VIVO</span>
            }
          </div>
          <p>
            {{ s.tournamentName }} · {{ s.categoryName }} ·
            {{ s.format === 'groups_knockout' ? 'grupos' : 'dupla eliminatória' }} · modo
            {{ modeLabel(s) }}
          </p>
        </div>
        <div class="og-cs-spacer"></div>
        @if (s.format === 'double_elimination') {
          <div class="og-cs-etapas">
            @for (stage of deStages(); track stage.n) {
              <span
                class="og-cs-etapa"
                [class.live]="stage.state === 'live'"
                [class.done]="stage.state === 'done'"
              >
                {{ stage.n }} · {{ stage.label }}
              </span>
            }
          </div>
        }
        <a class="og-mini-btn" [href]="telaoUrl(s)" target="_blank" rel="noopener">Ver telão</a>
      </header>

      @if (error(); as msg) {
        <div class="og-cs-erro" role="alert">{{ msg }}</div>
      }

      <div class="og-cs-grid">
        <div class="og-cs-col">
          <og-card [kicker]="currentKicker(s)" title="No ar agora">
            @if (currentEntrant(); as e) {
              <div class="og-cs-atual">
                <span class="og-cs-capsula">{{ current()?.index }}</span>
                <span class="og-cs-atual-texto">
                  <strong>{{ e.label }}</strong>
                  <em>→ {{ currentDestination() }}</em>
                </span>
              </div>
              <div class="og-cs-stats">
                @for (stat of currentStats(); track stat.label) {
                  <div>
                    <span>{{ stat.label }}</span><strong>{{ stat.value }}</strong>
                  </div>
                }
              </div>

              @if (consequence(); as texto) {
                <div class="og-cs-consequencia">
                  <span class="og-cs-label">Consequência imediata</span>
                  <p>{{ texto }}</p>
                </div>
              }

              @if (s.config.phrasesEnabled) {
                <div class="og-cs-frase-head">
                  <span class="og-cs-label">Frase no telão</span>
                  <div class="og-cs-spacer"></div>
                  <button
                    type="button"
                    class="og-mini-btn"
                    [disabled]="pending()"
                    (click)="swapPhrase(s)"
                  >
                    Trocar
                  </button>
                  <button
                    type="button"
                    class="og-mini-btn"
                    [disabled]="pending()"
                    (click)="clearPhrase(s)"
                  >
                    Sem frase
                  </button>
                </div>
                <div class="og-cs-frase">
                  <span class="og-cs-frase-icone"><og-icon name="bell" [size]="13" /></span>
                  <p>{{ current()?.phrase?.text ?? 'Esta revelação foi ao ar sem frase.' }}</p>
                </div>
              }
            } @else {
              <div class="og-cs-atual">
                <span class="og-cs-capsula vazia">?</span>
                <p class="og-cs-texto">
                  Potes fechados. Dispare a primeira revelação quando quiser.
                </p>
              </div>
            }
          </og-card>

          <og-card kicker="Fila" [title]="queueTitle(s)" flex="1">
            <div class="og-cs-fila">
              @for (entrant of queue(); track entrant.teamId) {
                <og-sorteio-dupla-row
                  [entrant]="entrant"
                  [tone]="$first ? 'hot' : 'soft'"
                  [compact]="true"
                >
                  <span class="og-cs-pote">P{{ entrant.potIndex }}</span>
                </og-sorteio-dupla-row>
              }
              @empty {
                <p class="og-cs-texto">Todos os potes esvaziados.</p>
              }
            </div>
          </og-card>
        </div>

        <og-card kicker="Espelho do telão" [title]="mirrorTitle(s)" pad="sm" class="og-cs-espelho">
          <span card-action class="og-cs-sync">
            @if (s.status === 'live') {
              <i></i>sincronizado
            } @else {
              {{ statusLabel(s) }}
            }
          </span>
          <og-sorteio-espelho [session]="s" [visibleCount]="visibleCount()" />
        </og-card>

        <div class="og-cs-col">
          <div class="og-cs-tempo">
            <span class="og-cs-label">No ar há</span>
            <strong>{{ onAirLabel(s) }}</strong>
          </div>

          <og-card kicker="Log imutável" [title]="logTitle(s)" flex="1">
            <ol class="og-cs-log">
              @for (row of logRows(); track row.index) {
                <li>
                  <span class="num">#{{ padded(row.index) }}</span>
                  <span class="nome">{{ row.label }}</span>
                  <span class="dest">{{ row.destination }}</span>
                  <span class="hora">{{ row.atMillis | date: 'HH:mm:ss' }}</span>
                </li>
              }
              @empty {
                <li class="og-cs-texto">Nada registrado ainda.</li>
              }
            </ol>
          </og-card>
        </div>
      </div>

      <footer class="og-cs-transporte">
        <button
          type="button"
          class="og-btn og-cs-sortear"
          [disabled]="pending() || done() || s.status !== 'live'"
          (click)="next(s)"
        >
          @if (!done() && !pending()) {
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M5 3l14 9-14 9z" />
            </svg>
          }
          {{ done() ? 'Sorteio completo' : pending() ? 'Sorteando…' : 'Sortear próxima' }}
        </button>

        @if (s.config.mode !== 'manual') {
          <button type="button" class="og-mini-btn" [disabled]="done()" (click)="togglePlaying()">
            {{ playing() ? 'Pausar automático' : 'Retomar automático' }}
          </button>
        }

        <div class="og-cs-medidor">
          <span class="og-cs-label">Revelações</span>
          <strong>{{ padded(s.reveals.length) }}<em>/{{ s.totalReveals }}</em></strong>
        </div>
        <div class="og-cs-medidor">
          <span class="og-cs-label">Etapa</span>
          <b>{{ stageLabel(s) }}</b>
        </div>

        <div class="og-cs-progresso"><div [style.width.%]="progress(s)"></div></div>

        <button
          type="button"
          class="og-btn"
          [disabled]="!done() || pending() || s.status !== 'live'"
          (click)="publish(s)"
        >
          Publicar chave
        </button>
        <button
          type="button"
          class="og-mini-btn og-mini-btn-danger"
          [disabled]="pending() || s.status !== 'live'"
          (click)="voidPrompt.set(true)"
        >
          Anular sessão
        </button>
      </footer>

      @if (voidPrompt()) {
        <og-confirm-dialog
          title="Anular esta sessão de sorteio?"
          message="Não existe desfazer revelação — só anular a sessão inteira e recomeçar do zero. O comprovante da sessão anulada continua público, com o motivo que você escrever abaixo. É isso que prova que ninguém sorteou até dar certo em silêncio."
          confirmLabel="Anular sessão"
          [destructive]="true"
          [busy]="pending()"
          [prompt]="voidPromptConfig"
          (confirmed)="confirmVoid(s, $event)"
          (cancelled)="voidPrompt.set(false)"
        />
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      /* Cadeia de altura: sem isso o espelho não sabe qual altura ocupar. */
      height: 100%;
      min-height: 0;
    }
    .og-cs-head {
      flex: none;
      display: flex;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
      padding: 16px 32px;
      border-bottom: 1px solid var(--nx-line);
    }
    .og-cs-titulo {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .og-cs-head h1 {
      margin: 0;
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 21px;
      letter-spacing: -0.02em;
    }
    .og-cs-head p {
      margin: 5px 0 0;
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-cs-spacer {
      flex: 1;
    }
    .og-cs-live {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 5px 12px;
      border-radius: 999px;
      background: rgb(255 59 48 / 14%);
      border: 1px solid rgb(255 59 48 / 45%);
      color: var(--nx-live);
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 10.5px;
      letter-spacing: 0.14em;
    }
    .og-cs-live i {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--nx-live);
      animation: og-cs-pulsa 1.6s ease-in-out infinite;
    }
    .og-cs-etapas {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .og-cs-etapa {
      padding: 6px 12px;
      border-radius: 999px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-cs-etapa.done {
      color: var(--nx-win);
    }
    .og-cs-etapa.live {
      background: var(--nx-orange-tint);
      border-color: rgb(255 106 26 / 45%);
      color: var(--nx-orange-500);
    }
    .og-cs-erro {
      flex: none;
      margin: 12px 32px 0;
      padding: 11px 14px;
      border-radius: var(--nx-r-2);
      background: rgb(255 59 48 / 10%);
      border: 1px solid rgb(255 59 48 / 40%);
      color: var(--nx-live);
      font-size: 13px;
    }
    .og-cs-grid {
      flex: 1;
      min-height: 0;
      display: grid;
      grid-template-columns: 320px minmax(0, 1fr) 300px;
      gap: 14px;
      padding: 16px 32px;
    }
    .og-cs-col {
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-height: 0;
    }
    .og-cs-espelho {
      min-width: 0;
      min-height: 0;
    }
    .og-cs-sync {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-win);
    }
    .og-cs-sync i {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--nx-win);
    }
    .og-cs-atual {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    /* A cápsula repete o número que o telão mostra: mesmo objeto, mesma cor.
       É o que liga o console à TV sem precisar de legenda. */
    .og-cs-capsula {
      flex: none;
      display: grid;
      place-items: center;
      width: 62px;
      height: 62px;
      border-radius: 50%;
      background: var(--nx-orange-500);
      border: 2px solid var(--nx-orange-600);
      color: var(--nx-text-on-orange);
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 24px;
      font-variant-numeric: tabular-nums;
      box-shadow: 0 0 34px rgb(255 106 26 / 35%);
    }
    .og-cs-capsula.vazia {
      background: var(--nx-surface-2);
      border-color: var(--nx-line-strong);
      color: var(--nx-text-dim);
      box-shadow: inset 0 2px 10px rgb(0 0 0 / 50%);
    }
    .og-cs-atual-texto {
      min-width: 0;
    }
    .og-cs-atual-texto strong {
      display: block;
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 17px;
      letter-spacing: -0.01em;
      overflow-wrap: anywhere;
    }
    .og-cs-atual-texto em {
      display: block;
      margin-top: 3px;
      font-style: normal;
      font-family: var(--nx-font-mono);
      font-size: 12px;
      color: var(--nx-orange-500);
    }
    .og-cs-stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 5px;
      margin-top: 12px;
    }
    .og-cs-stats div {
      padding: 7px 8px;
      border-radius: 9px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      min-width: 0;
    }
    .og-cs-stats span {
      display: block;
      font-family: var(--nx-font-mono);
      font-size: 8px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-cs-stats strong {
      display: block;
      margin-top: 2px;
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13px;
      font-variant-numeric: tabular-nums;
    }
    .og-cs-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-cs-consequencia {
      margin-top: 12px;
      padding: 10px 12px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
    }
    .og-cs-consequencia p {
      margin: 5px 0 0;
      font-size: 12.5px;
      line-height: 1.5;
      color: var(--nx-text-mute);
      text-wrap: pretty;
    }
    .og-cs-frase-head {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 12px 0 6px;
    }
    .og-cs-frase {
      display: flex;
      gap: 10px;
      padding: 11px 12px;
      border-radius: var(--nx-r-3);
      background: var(--nx-orange-tint);
      border: 1px solid rgb(255 106 26 / 32%);
    }
    .og-cs-frase-icone {
      flex: none;
      display: grid;
      place-items: center;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: var(--nx-orange-500);
      color: var(--nx-text-on-orange);
    }
    .og-cs-frase p {
      margin: 0;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13.5px;
      line-height: 1.4;
      color: var(--nx-text);
      text-wrap: pretty;
    }
    .og-cs-texto {
      margin: 0;
      font-size: 12.5px;
      line-height: 1.5;
      color: var(--nx-text-mute);
    }
    /* Mesma cadeia de altura do espelho: flex:1 + min-height:0 para a lista
       rolar DENTRO do card em vez de esticá-lo. */
    .og-cs-fila,
    .og-cs-log {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 5px;
      overflow-y: auto;
      min-height: 0;
      scrollbar-width: none;
    }
    .og-cs-log {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .og-cs-pote {
      flex: none;
      font-family: var(--nx-font-mono);
      font-size: 10px;
      color: var(--nx-text-dim);
    }
    .og-cs-log li {
      display: grid;
      grid-template-columns: 32px minmax(0, 1fr) auto auto;
      gap: 7px;
      align-items: center;
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      color: var(--nx-text-dim);
      font-variant-numeric: tabular-nums;
    }
    .og-cs-log .num {
      color: var(--nx-orange-500);
    }
    .og-cs-log .nome {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--nx-text);
    }
    .og-cs-tempo {
      flex: none;
      padding: 11px 13px;
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
    }
    .og-cs-tempo strong {
      display: block;
      margin-top: 4px;
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 22px;
      font-variant-numeric: tabular-nums;
      color: var(--nx-live);
    }
    .og-cs-transporte {
      flex: none;
      display: flex;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
      padding: 14px 32px;
      border-top: 1px solid var(--nx-line);
      background: #070708;
    }
    .og-cs-sortear {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      min-height: 54px;
      font-size: 16px;
      padding: 0 26px;
    }
    .og-cs-medidor strong {
      display: block;
      margin-top: 2px;
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 20px;
      font-variant-numeric: tabular-nums;
    }
    .og-cs-medidor em {
      font-style: normal;
      color: var(--nx-text-dim);
    }
    .og-cs-medidor b {
      display: block;
      margin-top: 4px;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 15px;
    }
    .og-cs-progresso {
      flex: 1;
      min-width: 100px;
      height: 6px;
      border-radius: 4px;
      background: var(--nx-surface-2);
      overflow: hidden;
    }
    .og-cs-progresso div {
      height: 100%;
      background: var(--nx-orange-500);
      transition: width 400ms var(--nx-ease-out);
    }
    .og-cs-vazio {
      display: grid;
      place-items: center;
      height: 100%;
      padding: 32px;
      text-align: center;
      color: var(--nx-text-mute);
      font-size: 15px;
    }

    @keyframes og-cs-pulsa {
      0%,
      100% {
        opacity: 1;
      }
      50% {
        opacity: 0.35;
      }
    }

    /* Tablet: espelho em cima, colunas de apoio dividindo a linha de baixo. */
    @media (max-width: 1279px) {
      .og-cs-grid {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        grid-template-rows: minmax(280px, 1fr) auto;
        padding: 14px 20px;
      }
      .og-cs-espelho {
        grid-column: 1 / -1;
        grid-row: 1;
      }
    }

    @media (max-width: 899px) {
      .og-cs-grid {
        grid-template-columns: minmax(0, 1fr);
        overflow-y: auto;
      }
      .og-cs-head,
      .og-cs-transporte {
        padding-inline: 20px;
      }
      .og-cs-transporte {
        position: sticky;
        bottom: 0;
      }
      .og-cs-sortear {
        flex: 1 0 100%;
      }
      .og-cs-transporte .og-mini-btn {
        min-height: 44px;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .og-cs-live i {
        animation: none;
      }
      .og-cs-progresso div {
        transition: none;
      }
    }
  `,
})
export class SorteioConsoleComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly store = inject(DrawSessionStore);
  protected readonly clock = inject(DrawClockService);

  protected readonly playing = signal(true);
  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly voidPrompt = signal(false);

  protected readonly voidPromptConfig = {
    label: 'Motivo da anulação',
    placeholder: 'Ex.: dupla errada no pote — sorteio refeito com a lista corrigida',
    helper: 'Este texto aparece no comprovante público da sessão anulada.',
  };

  constructor() {
    effect(() => this.store.sessionId.set(this.route.snapshot.queryParamMap.get('s')));

    // O maestro do ritmo é este relógio. A idempotência do servidor
    // (`expectedIndex`) é a rede de segurança: se este disparo correr com um
    // clique do organizador, um dos dois volta sem efeito.
    effect(() => {
      const session = this.store.session();
      if (!session || session.status !== 'live' || session.config.mode === 'manual') return;

      const shouldDraw = shouldAutoDraw({
        playing: this.playing(),
        lastRevealAt: this.current()?.atMillis ?? null,
        intervalMs: session.config.intervalMs,
        now: this.clock.now(),
        pending: this.pending(),
        done: session.reveals.length >= session.totalReveals,
      });
      if (!shouldDraw) return;

      // Híbrido pausa sozinho na virada de pote — o respiro pro organizador
      // comentar sem travar o ritmo dentro do pote.
      if (
        session.config.mode === 'hybrid' &&
        crossesPotBoundary(session.pots, session.reveals.length)
      ) {
        this.playing.set(false);
        return;
      }
      void this.next(session);
    });
  }

  protected readonly current = computed(() => {
    const reveals = this.store.session()?.reveals ?? [];
    return reveals.length > 0 ? reveals[reveals.length - 1]! : null;
  });

  /** O espelho mostra tudo que já foi gravado: o console conduz e pode ver o
   *  resultado antes de o telão terminar a animação. */
  protected readonly visibleCount = computed(() => this.store.session()?.reveals.length ?? 0);

  protected readonly currentEntrant = computed(() => {
    const session = this.store.session();
    const reveal = this.current();
    if (!session || !reveal) return null;
    return session.entrants.find((e) => e.teamId === reveal.teamId) ?? null;
  });

  protected readonly currentDestination = computed(() => {
    const reveal = this.current();
    return reveal ? destinationLabelOf(reveal.destination) : '';
  });

  protected readonly currentStats = computed(() => {
    const e = this.currentEntrant();
    if (!e) return [];
    const rate = winRateOf(e);
    return [
      { label: 'pontos', value: e.points == null ? '—' : String(e.points) },
      { label: 'aprov.', value: rate == null ? '—' : `${rate}%` },
      { label: 'cartel', value: `${e.stats.wins}–${e.stats.losses}` },
      { label: 'títulos', value: String(e.stats.titles) },
    ];
  });

  /** A consequência da dupla eliminatória, já resolvida pela planta no servidor. */
  protected readonly consequence = computed(() => {
    const placement = this.current()?.dePlacement;
    if (!placement) return null;
    const debut = placement.hasBye ?
      'Entra direto na segunda rodada — tem bye.' :
      placement.opponentSeed != null ?
        `Enfrenta a cabeça ${placement.opponentSeed} na primeira rodada.` :
        placement.opponentFromMatch != null ?
          `Enfrenta o vencedor do jogo ${placement.opponentFromMatch}.` :
          null;
    const meeting = placement.meetsSeed;
    if (!meeting) return debut;
    const path =
      meeting.winsNeeded === 0 ?
        `Cruza com a cabeça ${meeting.seed} já na estreia.` :
        `Se ganhar ${meeting.winsNeeded === 1 ? 'uma' : meeting.winsNeeded}, cruza com a cabeça ${meeting.seed}.`;
    return [debut, path].filter(Boolean).join(' ');
  });

  protected readonly queue = computed(() => {
    const session = this.store.session();
    return session ? remainingInPot(session) : [];
  });

  protected readonly done = computed(() => {
    const session = this.store.session();
    return !!session && session.reveals.length >= session.totalReveals;
  });

  /** Log do mais recente pro mais antigo — é o que o organizador confere. */
  protected readonly logRows = computed(() => {
    const session = this.store.session();
    if (!session) return [];
    return [...session.reveals].reverse().map((reveal) => ({
      index: reveal.index,
      label: session.entrants.find((e) => e.teamId === reveal.teamId)?.label ?? reveal.teamId,
      destination: destinationLabelOf(reveal.destination),
      atMillis: reveal.atMillis,
    }));
  });

  /** Etapas da dupla eliminatória. Cabeças e byes vêm da planta, não do
   *  sorteio — aparecem como concluídas desde o início, e é essa transparência
   *  que o roteiro pede antes da tensão. */
  protected readonly deStages = computed(() => {
    const session = this.store.session();
    const drawing = !!session && session.reveals.length < session.totalReveals;
    return [
      { n: 1, label: 'Cabeças', state: 'done' as const },
      { n: 2, label: 'Byes', state: 'done' as const },
      { n: 3, label: 'Posições', state: drawing ? ('live' as const) : ('done' as const) },
      {
        n: 4,
        label: 'Publicação',
        state: session?.status === 'published' ? ('done' as const) : ('wait' as const),
      },
    ];
  });

  protected currentKicker(session: DrawSession): string {
    const reveal = this.current();
    return reveal ? `Revelação ${reveal.index} de ${session.totalReveals}` : 'Aguardando';
  }

  protected queueTitle(session: DrawSession): string {
    return session.format === 'groups_knockout' ? 'Ainda no pote' : 'Não-cabeças no pote';
  }

  protected mirrorTitle(session: DrawSession): string {
    return session.format === 'groups_knockout' ?
      'Grupos ao vivo' :
      'Chave dos vencedores · rodada 1';
  }

  protected logTitle(session: DrawSession): string {
    return `${session.reveals.length} de ${session.totalReveals} registradas`;
  }

  protected statusLabel(session: DrawSession): string {
    return {
      draft: 'rascunho',
      scheduled: 'agendada',
      live: 'no ar',
      published: 'publicada',
      voided: 'anulada',
    }[session.status];
  }

  /** Tempo de transmissão em mm:ss, do relógio compartilhado. */
  protected onAirLabel(session: DrawSession): string {
    if (session.startedAt == null) return '--:--';
    const elapsed = Math.max(0, Math.floor((this.clock.now() - session.startedAt) / 1000));
    return `${this.padded(Math.floor(elapsed / 60))}:${this.padded(elapsed % 60)}`;
  }

  protected stageLabel(session: DrawSession): string {
    if (this.done()) return 'Encerrado';
    if (session.format === 'double_elimination') return 'Posições R1';
    const revealed = session.reveals.length;
    let seen = 0;
    for (const pot of session.pots) {
      seen += pot.teamIds.length;
      if (revealed < seen) return `Pote ${pot.index}`;
    }
    return 'Encerrado';
  }

  protected telaoUrl(session: DrawSession): string {
    return drawTelaoUrl(location.origin, session.id);
  }

  protected modeLabel(session: DrawSession): string {
    return { manual: 'manual', auto: 'automático', hybrid: 'híbrido' }[session.config.mode];
  }

  protected progress(session: DrawSession): number {
    return session.totalReveals === 0 ? 0 : (session.reveals.length / session.totalReveals) * 100;
  }

  protected padded(value: number): string {
    return String(value).padStart(2, '0');
  }

  protected togglePlaying(): void {
    this.playing.update((v) => !v);
  }

  protected async next(session: DrawSession): Promise<void> {
    if (this.pending()) return;
    this.pending.set(true);
    this.error.set(null);
    try {
      // `expectedIndex` é o contrato de idempotência: o servidor só sorteia se
      // o console estiver falando do mesmo ponto da história.
      const result = await drawNextReveal(session.id, session.reveals.length);
      if (result.done) this.playing.set(false);
    } catch (e) {
      this.playing.set(false);
      this.error.set(this.messageOf(e));
    } finally {
      this.pending.set(false);
    }
  }

  protected async swapPhrase(session: DrawSession): Promise<void> {
    const reveal = this.current();
    if (!reveal) return;
    await this.guard(() => replaceRevealPhrase(session.id, reveal.index));
  }

  protected async clearPhrase(session: DrawSession): Promise<void> {
    const reveal = this.current();
    if (!reveal) return;
    await this.guard(() => replaceRevealPhrase(session.id, reveal.index, { clear: true }));
  }

  protected async publish(session: DrawSession): Promise<void> {
    await this.guard(async () => {
      await publishDrawSession(session.id);
      void this.router.navigate([
        '/painel/eventos',
        session.tournamentId,
        'categorias',
        session.categoryId,
        session.format === 'groups_knockout' ? 'grupos' : 'chave',
      ]);
    });
  }

  protected async confirmVoid(session: DrawSession, reason: string): Promise<void> {
    await this.guard(async () => {
      await voidDrawSession(session.id, reason);
      this.voidPrompt.set(false);
      this.playing.set(false);
    });
  }

  private async guard(action: () => Promise<unknown>): Promise<void> {
    if (this.pending()) return;
    this.pending.set(true);
    this.error.set(null);
    try {
      await action();
    } catch (e) {
      this.error.set(this.messageOf(e));
    } finally {
      this.pending.set(false);
    }
  }

  private messageOf(error: unknown): string {
    const err = error as { message?: string };
    return err?.message || 'Não foi possível concluir a ação.';
  }
}
