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
import { TelaoStageComponent } from '../telao/telao-stage.component';
import { OgCardComponent } from '../ui/card.component';
import { OgConfirmDialogComponent } from '../ui/confirm-dialog.component';
import { crossesPotBoundary, shouldAutoDraw } from './draw-auto-advance';
import { DrawClockService } from './draw-clock.service';
import { drawTelaoUrl } from './draw-links';
import { DrawSessionStore } from './draw-session.store';
import { SorteioTelaoScreenComponent } from './sorteio-telao-screen.component';

/**
 * O console de controle — a ÚNICA superfície do sorteio com botões.
 *
 * O "Espelho do telão" no centro não é um desenho parecido com o telão: é o
 * telão, o mesmo componente, escalado pelo `og-telao-stage`. Some com isso a
 * categoria inteira de bug "o espelho mostra uma coisa e a TV mostra outra", e
 * o console ganha as animações de revelação de graça.
 *
 * Nos modos automático e híbrido o timer roda AQUI, no navegador do
 * organizador. É deliberado: agendar no servidor custaria uma função por
 * revelação, e "console fechou, show pausou" é o comportamento desejado.
 */
@Component({
  selector: 'og-sorteio-console',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DrawSessionStore, DrawClockService],
  imports: [
    DatePipe,
    OgCardComponent,
    OgConfirmDialogComponent,
    SorteioTelaoScreenComponent,
    TelaoStageComponent,
  ],
  template: `
    @let s = store.session();
    @if (!s) {
      <div class="og-console-vazio">
        @if (store.loading()) {
          Carregando a sessão…
        } @else {
          Sessão não encontrada. Volte para a configuração do sorteio.
        }
      </div>
    } @else {
      <header class="og-console-head">
        <div class="og-console-head-text">
          <h1>Console do sorteio</h1>
          <p>
            {{ s.tournamentName }} · {{ s.categoryName }} ·
            {{ s.format === 'groups_knockout' ? 'grupos' : 'dupla eliminatória' }} ·
            modo {{ modeLabel(s) }}
          </p>
        </div>
        @if (s.status === 'live') {
          <span class="og-console-live"><i></i>AO VIVO</span>
        }
        <div class="og-console-spacer"></div>
        <a class="og-mini-btn" [href]="telaoUrl(s)" target="_blank" rel="noopener">Ver telão</a>
      </header>

      @if (error(); as msg) {
        <div class="og-console-erro" role="alert">{{ msg }}</div>
      }

      <div class="og-console-grid">
        <div class="og-console-col">
          <og-card [kicker]="current() ? 'Revelação ' + current()!.index : 'Aguardando'" title="No ar agora">
            @if (currentEntrant(); as e) {
              <div class="og-console-atual">
                <strong>{{ e.label }}</strong>
                <span class="og-console-destino">→ {{ currentDestination() }}</span>
              </div>
              <div class="og-console-stats">
                @for (stat of currentStats(); track stat.label) {
                  <div><span>{{ stat.label }}</span><strong>{{ stat.value }}</strong></div>
                }
              </div>
              @if (s.config.phrasesEnabled) {
                <div class="og-console-frase-head">
                  <span class="og-console-label">Frase no telão</span>
                  <div class="og-console-spacer"></div>
                  <button type="button" class="og-mini-btn" [disabled]="pending()" (click)="swapPhrase(s)">
                    Trocar
                  </button>
                  <button type="button" class="og-mini-btn" [disabled]="pending()" (click)="clearPhrase(s)">
                    Sem frase
                  </button>
                </div>
                <p class="og-console-frase">
                  {{ current()?.phrase?.text ?? 'Esta revelação foi ao ar sem frase.' }}
                </p>
              }
            } @else {
              <p class="og-console-texto">
                Potes fechados. Dispare a primeira revelação quando quiser.
              </p>
            }
          </og-card>

          <og-card kicker="Fila" title="Ainda no pote" flex="1">
            <ol class="og-console-fila">
              @for (entrant of queue(); track entrant.teamId) {
                <li [class.proxima]="$first">
                  <span>{{ entrant.label }}</span>
                  <em>P{{ entrant.potIndex }}</em>
                </li>
              }
              @empty {
                <li class="og-console-fila-vazia">Todos os potes esvaziados.</li>
              }
            </ol>
          </og-card>
        </div>

        <og-card kicker="Espelho do telão" title="O que está na TV agora" pad="sm" class="og-console-espelho">
          <og-telao-stage class="og-console-stage">
            <og-sorteio-telao-screen [session]="s" [now]="clock.now()" />
          </og-telao-stage>
        </og-card>

        <div class="og-console-col">
          <og-card kicker="Log imutável" title="{{ s.reveals.length }} de {{ s.totalReveals }} registradas" flex="1">
            <ol class="og-console-log">
              @for (row of logRows(); track row.index) {
                <li>
                  <span class="og-console-log-num">#{{ padded(row.index) }}</span>
                  <span class="og-console-log-nome">{{ row.label }}</span>
                  <span class="og-console-log-dest">{{ row.destination }}</span>
                  <span class="og-console-log-hora">{{ row.atMillis | date: 'HH:mm:ss' }}</span>
                </li>
              }
              @empty {
                <li class="og-console-fila-vazia">Nada registrado ainda.</li>
              }
            </ol>
          </og-card>
        </div>
      </div>

      <footer class="og-console-transporte">
        <button
          type="button"
          class="og-btn og-console-sortear"
          [disabled]="pending() || done() || s.status !== 'live'"
          (click)="next(s)"
        >
          {{ done() ? 'Sorteio completo' : pending() ? 'Sorteando…' : 'Sortear próxima' }}
        </button>

        @if (s.config.mode !== 'manual') {
          <button type="button" class="og-mini-btn" [disabled]="done()" (click)="togglePlaying()">
            {{ playing() ? 'Pausar automático' : 'Retomar automático' }}
          </button>
        }

        <div class="og-console-contagem">
          <span class="og-console-label">Revelações</span>
          <strong>{{ padded(s.reveals.length) }}<em>/{{ s.totalReveals }}</em></strong>
        </div>

        <div class="og-console-progresso">
          <div [style.width.%]="progress(s)"></div>
        </div>

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
      /* Cadeia de altura: o host precisa ocupar a área do router-outlet pra que
         o espelho tenha altura definida e o og-telao-stage saiba escalar. */
      height: 100%;
      min-height: 0;
    }
    .og-console-head {
      flex: none;
      display: flex;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
      padding: 18px 32px;
      border-bottom: 1px solid var(--nx-line);
    }
    .og-console-head h1 {
      margin: 0;
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 21px;
      letter-spacing: -0.02em;
    }
    .og-console-head p {
      margin: 5px 0 0;
      font-family: var(--nx-font-mono);
      font-size: 11px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-console-spacer {
      flex: 1;
    }
    .og-console-live {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 13px;
      border-radius: 999px;
      background: rgb(255 59 48 / 14%);
      border: 1px solid rgb(255 59 48 / 45%);
      color: var(--nx-live);
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 11px;
      letter-spacing: 0.14em;
    }
    .og-console-live i {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--nx-live);
      animation: og-console-pulsa 1.6s ease-in-out infinite;
    }
    .og-console-erro {
      flex: none;
      margin: 12px 32px 0;
      padding: 11px 14px;
      border-radius: var(--nx-r-2);
      background: rgb(255 59 48 / 10%);
      border: 1px solid rgb(255 59 48 / 40%);
      color: var(--nx-live);
      font-size: 13px;
    }
    .og-console-grid {
      flex: 1;
      min-height: 0;
      display: grid;
      grid-template-columns: 300px minmax(0, 1fr) 300px;
      gap: 14px;
      padding: 16px 32px;
    }
    .og-console-col {
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-height: 0;
    }
    .og-console-espelho {
      min-width: 0;
      min-height: 0;
    }
    .og-console-stage {
      display: block;
      width: 100%;
      height: 100%;
      min-height: 0;
    }
    .og-console-atual strong {
      display: block;
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 17px;
      letter-spacing: -0.01em;
    }
    .og-console-destino {
      display: block;
      margin-top: 3px;
      font-family: var(--nx-font-mono);
      font-size: 12px;
      color: var(--nx-orange-500);
    }
    .og-console-stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 5px;
      margin-top: 12px;
    }
    .og-console-stats div {
      padding: 7px 8px;
      border-radius: 9px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      min-width: 0;
    }
    .og-console-stats span {
      display: block;
      font-family: var(--nx-font-mono);
      font-size: 8.5px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-console-stats strong {
      display: block;
      margin-top: 2px;
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13px;
      font-variant-numeric: tabular-nums;
    }
    .og-console-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-console-frase-head {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 12px 0 6px;
    }
    .og-console-frase {
      margin: 0;
      padding: 10px 12px;
      border-radius: var(--nx-r-2);
      background: var(--nx-orange-tint);
      border: 1px solid rgb(255 106 26 / 30%);
      font-size: 13px;
      line-height: 1.45;
      color: var(--nx-text);
    }
    .og-console-texto {
      margin: 0;
      font-size: 12.5px;
      line-height: 1.5;
      color: var(--nx-text-mute);
    }
    .og-console-fila,
    .og-console-log {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 5px;
      overflow-y: auto;
      min-height: 0;
    }
    .og-console-fila li {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border-radius: 10px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      font-size: 12.5px;
    }
    .og-console-fila li.proxima {
      background: var(--nx-orange-tint);
      border-color: rgb(255 106 26 / 40%);
    }
    .og-console-fila li span {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .og-console-fila li em {
      font-family: var(--nx-font-mono);
      font-style: normal;
      font-size: 10px;
      color: var(--nx-text-dim);
    }
    .og-console-fila-vazia {
      font-size: 12px;
      color: var(--nx-text-dim);
      padding: 6px;
    }
    .og-console-log li {
      display: grid;
      grid-template-columns: 34px minmax(0, 1fr) auto auto;
      gap: 7px;
      align-items: center;
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      color: var(--nx-text-dim);
    }
    .og-console-log-num {
      color: var(--nx-orange-500);
    }
    .og-console-log-nome {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--nx-text);
    }
    .og-console-transporte {
      flex: none;
      display: flex;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
      padding: 16px 32px;
      border-top: 1px solid var(--nx-line);
      background: #070708;
    }
    .og-console-sortear {
      min-height: 56px;
      font-size: 16px;
      padding: 0 26px;
    }
    .og-console-contagem strong {
      display: block;
      margin-top: 2px;
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 20px;
      font-variant-numeric: tabular-nums;
    }
    .og-console-contagem em {
      font-style: normal;
      color: var(--nx-text-dim);
    }
    .og-console-progresso {
      flex: 1;
      min-width: 120px;
      height: 6px;
      border-radius: 4px;
      background: var(--nx-surface-2);
      overflow: hidden;
    }
    .og-console-progresso div {
      height: 100%;
      background: var(--nx-orange-500);
      transition: width 400ms var(--nx-ease-out);
    }
    .og-console-vazio {
      display: grid;
      place-items: center;
      height: 100%;
      padding: 32px;
      text-align: center;
      color: var(--nx-text-mute);
      font-size: 15px;
    }

    @keyframes og-console-pulsa {
      0%,
      100% {
        opacity: 1;
      }
      50% {
        opacity: 0.35;
      }
    }

    /* Tablet: o espelho vai pra cima e as duas colunas dividem a linha de baixo.
       Abaixo de 768px vira coluna única — o console é ferramenta de mesa, mas
       precisa continuar operável no celular do organizador. */
    @media (max-width: 1199px) {
      .og-console-grid {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        grid-template-rows: minmax(260px, 1fr) auto;
        padding: 14px 20px;
      }
      .og-console-espelho {
        grid-column: 1 / -1;
        grid-row: 1;
      }
    }

    @media (max-width: 767px) {
      .og-console-grid {
        grid-template-columns: minmax(0, 1fr);
        overflow-y: auto;
      }
      .og-console-head,
      .og-console-transporte {
        padding-inline: 20px;
      }
      .og-console-transporte {
        position: sticky;
        bottom: 0;
      }
      .og-console-sortear {
        flex: 1 0 100%;
      }
      /* Área de toque confortável na barra de transporte. */
      .og-console-transporte .og-mini-btn {
        min-height: 44px;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .og-console-live i {
        animation: none;
      }
      .og-console-progresso div {
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
    effect(() => {
      const id = this.route.snapshot.queryParamMap.get('s');
      this.store.sessionId.set(id);
    });

    // O maestro do ritmo é este relógio. A idempotência do servidor
    // (`expectedIndex`) é a rede de segurança: se este disparo correr com um
    // clique do organizador, um dos dois volta sem efeito em vez de sortear
    // duas vezes.
    effect(() => {
      const session = this.store.session();
      if (!session || session.status !== 'live') return;
      if (session.config.mode === 'manual') return;

      const now = this.clock.now();
      const shouldDraw = shouldAutoDraw({
        playing: this.playing(),
        lastRevealAt: this.lastRevealAt(),
        intervalMs: session.config.intervalMs,
        now,
        pending: this.pending(),
        done: session.reveals.length >= session.totalReveals,
      });
      if (!shouldDraw) return;

      // Híbrido: pausa sozinho na virada de pote — o respiro pro organizador
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

  private readonly lastRevealAt = computed(() => this.current()?.atMillis ?? null);

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

  protected readonly queue = computed(() => {
    const session = this.store.session();
    return session ? remainingInPot(session) : [];
  });

  protected readonly done = computed(() => {
    const session = this.store.session();
    return !!session && session.reveals.length >= session.totalReveals;
  });

  /** Log do mais recente pro mais antigo — é o que o organizador quer conferir. */
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
