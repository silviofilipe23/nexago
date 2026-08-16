import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { deleteField, serverTimestamp } from 'firebase/firestore';
import type { PillTone } from '../data/mock-data';
import { initialsOf, truncateName } from '../data/mock-data';
import {
  applyBestOfChange,
  applyPoint,
  canReduceBestOf,
  elapsedSecondsFromStart,
  formatElapsedMmSs,
  lastUndoablePoint,
  liveSetToMap,
  recordPointTransaction,
  setPointHint,
  setRulesLabel,
  setsWonOf,
  undoPoint,
  updateMatchFields,
  watchLiveMatch,
  watchPointEvents,
  type LiveMatch,
  type LivePointEvent,
  type MatchDisplayStatus,
} from '@nexago/live-scoring';
import { organizerLiveScoringContext } from '../data/live-scoring-context';
import { revertMatchToScheduled, updateLiveMatchScore, validateMatchResult } from '../data/organizer-ops.service';
import { OgAvatarComponent } from '../ui/avatar.component';
import { OgCardComponent } from '../ui/card.component';
import { OgConfirmDialogComponent } from '../ui/confirm-dialog.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgPillComponent } from '../ui/pill.component';
import { NxPageLoadingComponent } from '../../shared/loading/nx-page-loading.component';
import { NxSpinnerComponent } from '../../shared/loading/nx-spinner.component';
import { ChaveamentoContextService } from './chaveamento-context.service';

const STATUS_TONE: Record<MatchDisplayStatus, PillTone> = { scheduled: 'orange', in_progress: 'red', completed: 'green', canceled: 'dim' };
const STATUS_LABEL: Record<MatchDisplayStatus, string> = { scheduled: 'Agendada', in_progress: 'Ao vivo', completed: 'Encerrada', canceled: 'Cancelada' };

const TIME = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

interface SetChipView {
  label: string;
  score: string | null;
  state: 'closed' | 'current' | 'upcoming';
}

interface FeedRowView {
  key: string;
  time: string;
  label: string;
  score: string;
  undo: boolean;
}

/** Mesa ao vivo ponto a ponto — mesma função da mesa I1 do app
 *  (`organizer_match_live_table_page.dart`), com as MESMAS escritas: cada ponto roda a
 *  transação `recordPointTransaction` (sets/currentSetIndex/status/servingTeamId/resultA/B +
 *  evento em `pointEvents`), então a partida marcada aqui aparece ponto a ponto no app e no
 *  portal do atleta. O START é explícito e usa `updateLiveMatchScore` zerado: o servidor seta
 *  `In Progress` + `matchStartedAt` e atualiza `tournaments.liveMatchesNow` — a partida fica
 *  "ao vivo" pros atletas antes do primeiro ponto. O ponto que fecha a partida grava
 *  `Completed` + `winnerId` e o avanço de chave dispara sozinho no servidor. A tela é dirigida
 *  pelo doc em tempo real (`onSnapshot`), como no app — sem estado local de placar. */
@Component({
  selector: 'og-mesa-ao-vivo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, OgPageHeaderComponent, OgCardComponent, OgAvatarComponent, OgPillComponent, OgConfirmDialogComponent, NxPageLoadingComponent, NxSpinnerComponent],
  template: `
    <og-page-header title="Mesa ao vivo" [subtitle]="headerSubtitle()">
      <a class="og-ghost-btn" [routerLink]="['/painel/eventos', id(), 'categorias', catId(), 'jogos']">Voltar</a>
      <a class="og-ghost-btn" [routerLink]="['/painel/eventos', id(), 'categorias', catId(), 'placar', matchId()]">Placar completo</a>
    </og-page-header>

    <div class="og-wizard-body">
      <div class="og-wizard-col">
        @if (!liveLoaded()) {
          <og-card><app-nx-page-loading title="Carregando partida…" subtitle="Conectando à mesa ao vivo" /></og-card>
        } @else if (!match()) {
          <og-card><p class="og-mesa-empty">Partida não encontrada — abra pela lista de jogos.</p></og-card>
        } @else if (!teamsReady()) {
          <og-card kicker="Mesa ao vivo" title="Aguardando as duas equipes">
            <p class="og-mesa-empty">A mesa só abre quando os dois lados da partida estiverem definidos na chave.</p>
          </og-card>
        } @else {
          <og-card pad="lg">
            <div class="og-mesa-top">
              <div class="og-mesa-status">
                @if (status() === 'in_progress') {
                  <span class="og-dot og-dot-red og-dot-pulse"></span>
                }
                <og-pill [tone]="statusTone()">{{ statusLabel() }}</og-pill>
                <span class="og-mesa-meta">{{ metaLine() }}</span>
              </div>
              <span class="og-mesa-clock" aria-label="Tempo de partida">{{ elapsed() }}</span>
            </div>

            <div class="og-mesa-strip" role="list" aria-label="Sets">
              @for (chip of setStrip(); track chip.label) {
                <span class="og-mesa-set" role="listitem" [attr.data-state]="chip.state">
                  <span class="lbl">{{ chip.label }}</span>
                  <span class="val">{{ chip.score ?? '—' }}</span>
                </span>
              }
            </div>

            <div class="og-mesa-board">
              <div class="og-mesa-side">
                <button type="button" class="og-mesa-point" [disabled]="!canScore()" [attr.aria-label]="'Ponto para ' + teamALabel()" (click)="point('A')">
                  <span class="og-mesa-team">
                    <og-avatar [initials]="initialsOf(teamALabel())" [size]="34" />
                    <span class="og-mesa-name" [title]="teamALabel()">{{ truncate(teamALabel(), 22) }}</span>
                    @if (servingSide() === 'A') {
                      <span class="og-mesa-serve" title="No saque">SAQUE</span>
                    }
                  </span>
                  <span class="og-mesa-score">{{ currentSet().a }}</span>
                  @if (canScore()) {
                    <span class="og-mesa-plus">+1 ponto</span>
                  }
                </button>
                <button type="button" class="og-ghost-btn og-mesa-minus" [disabled]="!canUndoSide('A')" (click)="undoSide('A')">−1</button>
              </div>

              <div class="og-mesa-center">
                <span class="og-mesa-sets">{{ wins().a }}<em>×</em>{{ wins().b }}</span>
                <span class="og-mesa-sets-lbl">sets</span>
              </div>

              <div class="og-mesa-side">
                <button type="button" class="og-mesa-point" [disabled]="!canScore()" [attr.aria-label]="'Ponto para ' + teamBLabel()" (click)="point('B')">
                  <span class="og-mesa-team">
                    <og-avatar [initials]="initialsOf(teamBLabel())" [size]="34" />
                    <span class="og-mesa-name" [title]="teamBLabel()">{{ truncate(teamBLabel(), 22) }}</span>
                    @if (servingSide() === 'B') {
                      <span class="og-mesa-serve" title="No saque">SAQUE</span>
                    }
                  </span>
                  <span class="og-mesa-score">{{ currentSet().b }}</span>
                  @if (canScore()) {
                    <span class="og-mesa-plus">+1 ponto</span>
                  }
                </button>
                <button type="button" class="og-ghost-btn og-mesa-minus" [disabled]="!canUndoSide('B')" (click)="undoSide('B')">−1</button>
              </div>
            </div>

            <div class="og-mesa-rules">
              <span>{{ rulesLabel() }}</span>
              @if (hint(); as h) {
                <og-pill tone="yellow">{{ h }}</og-pill>
              }
            </div>
          </og-card>

          @if (status() === 'scheduled') {
            <og-card kicker="Início" title="Partida ainda não iniciada">
              <p class="og-mesa-hint">Ao iniciar, a partida fica <strong>ao vivo</strong> no portal e no app dos atletas, com o placar acompanhando ponto a ponto.</p>
              <button type="button" class="og-mini-btn og-mini-btn-primary og-mesa-start" [disabled]="saving()" (click)="start()">
                @if (busyKey() === 'start') {
                  <app-nx-spinner [size]="14" tone="dark" />
                }
                {{ busyKey() === 'start' ? 'Iniciando…' : 'Iniciar partida' }}
              </button>
            </og-card>
          }

          @if (status() === 'completed') {
            <og-card kicker="Fim de jogo" title="Partida encerrada">
              <div class="og-banner win">Vitória de {{ winnerLabel() }} — a chave avança automaticamente.</div>
              <button type="button" class="og-ghost-btn" style="margin-top:12px" [disabled]="saving()" (click)="validate()">
                @if (busyKey() === 'validate') {
                  <app-nx-spinner [size]="12" />
                }
                {{ busyKey() === 'validate' ? 'Validando…' : 'Validar resultado' }}
              </button>
            </og-card>
          }

          @if (status() === 'in_progress') {
            <og-card kicker="Mesa" title="Ações">
              <div class="og-mesa-actions">
                <button type="button" class="og-mini-btn" [disabled]="saving() || lastPoint() === null" (click)="undoLast()">
                  @if (busyKey() === 'undo') {
                    <app-nx-spinner [size]="12" />
                  }
                  Desfazer último ponto
                </button>
                <button type="button" class="og-mini-btn" [disabled]="saving()" (click)="swapServe()">Trocar saque</button>
                <button type="button" class="og-mini-btn og-mesa-revert" [disabled]="saving()" (click)="askRevert()">Tirar do ao vivo</button>
                <div class="og-filter-bar og-mesa-format">
                  @for (option of [1, 3]; track option) {
                    <button type="button" class="og-chip" [class.active]="bestOf() === option" [disabled]="saving()" (click)="setFormat(option)">
                      {{ option === 1 ? 'Set único' : 'MD3' }}
                    </button>
                  }
                </div>
              </div>
            </og-card>
          }

          @if (feedback(); as fb) {
            <div class="og-banner" [class.win]="fb.ok">{{ fb.message }}</div>
          }

          @if (feed().length > 0) {
            <og-card kicker="Ponto a ponto" title="Últimos lances" pad="sm">
              <ul class="og-mesa-feed">
                @for (row of feed(); track row.key) {
                  <li [class.undo]="row.undo">
                    <span class="t">{{ row.time }}</span>
                    <span class="l">{{ row.label }}</span>
                    <span class="s">{{ row.score }}</span>
                  </li>
                }
              </ul>
            </og-card>
          }
        }
      </div>
    </div>

    @if (confirmingRevert()) {
      <og-confirm-dialog
        title="Tirar a partida do ao vivo?"
        [message]="revertMessage()"
        confirmLabel="Tirar do ao vivo"
        [destructive]="true"
        [busy]="saving()"
        [error]="revertError()"
        (confirmed)="revert()"
        (cancelled)="dismissRevert()"
      />
    }
  `,
  styles: `
    .og-mesa-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .og-mesa-status {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .og-mesa-meta {
      font-family: var(--nx-font-ui);
      font-size: 12px;
      color: var(--nx-text-dim);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .og-mesa-clock {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 18px;
      color: var(--nx-orange-500);
    }
    .og-mesa-strip {
      display: flex;
      gap: 8px;
      margin-top: 14px;
    }
    .og-mesa-set {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      padding: 6px 12px;
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-line);
      background: var(--nx-surface-0);
    }
    .og-mesa-set .lbl {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-mesa-set .val {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13px;
      color: var(--nx-text);
    }
    .og-mesa-set[data-state='current'] {
      border-color: var(--nx-orange-500);
    }
    .og-mesa-set[data-state='current'] .lbl {
      color: var(--nx-orange-500);
    }
    .og-mesa-set[data-state='upcoming'] .val {
      color: var(--nx-text-mute);
    }
    .og-mesa-board {
      display: flex;
      align-items: stretch;
      gap: 14px;
      margin-top: 16px;
    }
    .og-mesa-side {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
    }
    .og-mesa-point {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      padding: 18px 12px 14px;
      border-radius: var(--nx-r-3);
      border: 1px solid var(--nx-line);
      background: var(--nx-surface-0);
      cursor: pointer;
      transition: border-color var(--nx-d-fast) var(--nx-ease-out);
    }
    .og-mesa-point:not(:disabled):hover {
      border-color: var(--nx-orange-500);
    }
    .og-mesa-point:disabled {
      cursor: default;
    }
    .og-mesa-team {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .og-mesa-name {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 14px;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .og-mesa-serve {
      font-family: var(--nx-font-mono);
      font-size: 8.5px;
      font-weight: 700;
      letter-spacing: 0.14em;
      color: var(--nx-orange-500);
      border: 1px solid var(--nx-orange-500);
      border-radius: var(--nx-r-pill);
      padding: 2px 7px;
    }
    .og-mesa-score {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 56px;
      line-height: 1;
      color: var(--nx-text);
      font-variant-numeric: tabular-nums;
    }
    .og-mesa-plus {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-orange-500);
    }
    .og-mesa-minus {
      align-self: center;
      min-width: 64px;
      justify-content: center;
    }
    .og-mesa-minus:disabled {
      opacity: 0.4;
      pointer-events: none;
    }
    .og-mesa-center {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      min-width: 74px;
    }
    .og-mesa-sets {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 24px;
      color: var(--nx-orange-500);
    }
    .og-mesa-sets em {
      font-style: normal;
      color: var(--nx-text-dim);
      font-size: 16px;
      margin: 0 4px;
    }
    .og-mesa-sets-lbl {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-mesa-rules {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 14px;
      font-family: var(--nx-font-mono);
      font-size: 11px;
      color: var(--nx-text-dim);
    }
    .og-mesa-hint {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text-mute);
      margin: 0 0 12px;
    }
    .og-mesa-start {
      min-height: 44px;
      padding-inline: 22px;
    }
    .og-mesa-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .og-mesa-revert {
      color: var(--nx-live);
      border-color: color-mix(in srgb, var(--nx-live) 45%, var(--nx-line));
    }
    .og-mesa-format {
      margin-left: auto;
    }
    .og-mesa-feed {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
    }
    .og-mesa-feed li {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 7px 2px;
      border-bottom: 1px solid var(--nx-line);
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text);
    }
    .og-mesa-feed li:last-child {
      border-bottom: none;
    }
    .og-mesa-feed li.undo {
      color: var(--nx-text-dim);
    }
    .og-mesa-feed .t {
      font-family: var(--nx-font-mono);
      font-size: 11px;
      color: var(--nx-text-dim);
      width: 44px;
    }
    .og-mesa-feed .l {
      flex: 1;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .og-mesa-feed .s {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 12px;
    }
    .og-mesa-empty {
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text-mute);
      margin: 0;
    }
    @media (max-width: 640px) {
      .og-mesa-board {
        gap: 8px;
      }
      .og-mesa-score {
        font-size: 42px;
      }
      .og-mesa-center {
        min-width: 52px;
      }
    }

    /* iPad na quadra: "ponto" é o toque mais repetido do evento inteiro e o mais
       caro de errar. Cresce por ponteiro grosso, e não por largura, porque o
       tablet deitado tem 1180px — pela régua da janela seria desktop. */
    @media (pointer: coarse) {
      .og-mesa-point {
        min-height: 132px;
        justify-content: center;
        padding: 20px 12px;
      }
    }
  `,
})
export class MesaAoVivoComponent {
  protected readonly ctx = inject(ChaveamentoContextService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly scoring = organizerLiveScoringContext();
  protected readonly initialsOf = initialsOf;
  protected readonly truncate = truncateName;

  readonly id = input<string>('');
  readonly catId = input<string>('');
  readonly matchId = input<string>('');

  private readonly live = signal<LiveMatch | null>(null);
  protected readonly liveLoaded = signal(false);
  private readonly events = signal<LivePointEvent[]>([]);
  private readonly now = signal(Date.now());

  protected readonly saving = signal(false);
  protected readonly busyKey = signal<string | null>(null);
  protected readonly feedback = signal<{ ok: boolean; message: string } | null>(null);
  protected readonly confirmingRevert = signal(false);
  protected readonly revertError = signal<string | null>(null);

  constructor() {
    // A mesa é dirigida pelo doc em tempo real: troca de matchId refaz as assinaturas.
    effect((onCleanup) => {
      const id = this.matchId();
      this.live.set(null);
      this.liveLoaded.set(false);
      this.events.set([]);
      this.feedback.set(null);
      if (!id) {
        this.liveLoaded.set(true);
        return;
      }
      const unsubMatch = watchLiveMatch(
        this.scoring,
        id,
        (m) => {
          this.live.set(m);
          this.liveLoaded.set(true);
        },
        () => this.liveLoaded.set(true),
      );
      const unsubEvents = watchPointEvents(this.scoring, id, (events) => this.events.set(events));
      onCleanup(() => {
        unsubMatch();
        unsubEvents();
      });
    });

    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  protected readonly match = computed(() => this.live());
  protected readonly status = computed<MatchDisplayStatus>(() => this.match()?.status ?? 'scheduled');
  protected readonly statusTone = computed(() => STATUS_TONE[this.status()]);
  protected readonly statusLabel = computed(() => STATUS_LABEL[this.status()]);
  protected readonly bestOf = computed(() => this.match()?.bestOf ?? 3);

  protected readonly teamsReady = computed(() => {
    const m = this.match();
    return m != null && m.teamAId.length > 0 && m.teamBId.length > 0;
  });

  /** Nome resolvido da dupla: cache do contexto (join com `teams`) → descrição do slot → id. */
  private readonly cachedRow = computed(() => this.ctx.matches().find((m) => m.id === this.matchId()) ?? null);
  protected readonly teamALabel = computed(() => this.cachedRow()?.team1Label ?? this.match()?.teamADescription ?? 'Dupla A');
  protected readonly teamBLabel = computed(() => this.cachedRow()?.team2Label ?? this.match()?.teamBDescription ?? 'Dupla B');

  protected readonly winnerLabel = computed(() => {
    const m = this.match();
    if (!m?.winnerId) return '—';
    return m.winnerId === m.teamAId ? this.teamALabel() : this.teamBLabel();
  });

  private readonly currentSetIdx = computed(() => {
    const m = this.match();
    if (!m) return 0;
    return Math.min(Math.max(m.currentSetIndex, 0), m.bestOf - 1);
  });

  protected readonly currentSet = computed(() => {
    const m = this.match();
    return m?.sets[this.currentSetIdx()] ?? { a: 0, b: 0 };
  });

  protected readonly wins = computed(() => {
    const m = this.match();
    return m ? setsWonOf(m.sets, m.bestOf) : { a: 0, b: 0 };
  });

  protected readonly setStrip = computed<SetChipView[]>(() => {
    const m = this.match();
    if (!m) return [];
    const idx = this.currentSetIdx();
    return Array.from({ length: m.bestOf }, (_, i) => {
      const s = m.sets[i];
      const state: SetChipView['state'] = i === idx && m.status === 'in_progress' ? 'current' : s && (s.a > 0 || s.b > 0) ? 'closed' : 'upcoming';
      return { label: `Set ${i + 1}`, score: s ? `${s.a}·${s.b}` : null, state };
    });
  });

  protected readonly rulesLabel = computed(() => setRulesLabel(this.currentSetIdx(), this.bestOf()));

  protected readonly hint = computed(() => {
    if (this.status() !== 'in_progress') return null;
    const s = this.currentSet();
    return setPointHint(s.a, s.b, this.currentSetIdx(), this.bestOf());
  });

  protected readonly elapsed = computed(() => {
    const m = this.match();
    if (!m?.matchStartedAt) return '00:00';
    return formatElapsedMmSs(elapsedSecondsFromStart(m.matchStartedAt, new Date(this.now())));
  });

  protected readonly servingSide = computed<'A' | 'B' | null>(() => {
    const m = this.match();
    if (!m || !m.servingTeamId) return null;
    if (m.servingTeamId === m.teamAId) return 'A';
    if (m.servingTeamId === m.teamBId) return 'B';
    return null;
  });

  protected readonly canScore = computed(() => !this.saving() && this.status() === 'in_progress' && this.teamsReady());

  /** Último ponto ainda "vivo" (replay de `pointEvents` casando undo com ponto) — alvo do
   *  desfazer. O app usa o último evento `point` cru; o replay evita desfazer duas vezes o
   *  mesmo lado quando o mesário aperta desfazer em sequência. */
  protected readonly lastPoint = computed(() => lastUndoablePoint(this.events()));

  protected canUndoSide(side: 'A' | 'B'): boolean {
    return this.canScore() && this.lastPoint()?.side === side;
  }

  protected readonly metaLine = computed(() => {
    const m = this.match();
    if (!m) return '';
    const parts = [m.courtName ? (/quadra/i.test(m.courtName) ? m.courtName : `Quadra ${m.courtName}`) : null, m.scheduleTime ? TIME.format(m.scheduleTime) : null];
    return parts.filter((p): p is string => p != null).join(' · ');
  });

  protected readonly headerSubtitle = computed(() => {
    const t = this.ctx.tournament();
    const row = this.cachedRow();
    return [t?.name, row?.round ?? null].filter((p): p is string => Boolean(p)).join(' · ');
  });

  protected readonly feed = computed<FeedRowView[]>(() => {
    const nameOf = (side: 'A' | 'B' | null): string => (side === 'A' ? this.teamALabel() : side === 'B' ? this.teamBLabel() : '—');
    return [...this.events()]
      .reverse()
      .slice(0, 12)
      .map((e) => ({
        key: e.id,
        time: e.ts ? TIME.format(e.ts) : '—',
        label: e.type === 'undo-point' ? `Ponto desfeito (${truncateName(nameOf(e.side), 20)})` : `Ponto ${truncateName(nameOf(e.side), 20)}`,
        score: `${e.scoreA}-${e.scoreB}`,
        undo: e.type === 'undo-point',
      }));
  });

  /** START explícito: `updateLiveMatchScore` zerado — servidor seta In Progress +
   *  matchStartedAt + liveMatchesNow. A partir daqui a mesa libera o ponto a ponto. */
  protected async start(): Promise<void> {
    const m = this.match();
    if (!m || this.saving() || m.status !== 'scheduled' || !this.teamsReady()) return;
    this.saving.set(true);
    this.busyKey.set('start');
    this.feedback.set(null);
    try {
      await updateLiveMatchScore({ matchId: m.id, setsA: 0, setsB: 0, currentGamesA: 0, currentGamesB: 0 });
      this.feedback.set({ ok: true, message: 'Partida iniciada — já aparece ao vivo para os atletas.' });
      await this.ctx.reloadMatches();
    } catch (e) {
      this.feedback.set({ ok: false, message: (e as Error).message || 'Falha ao iniciar a partida.' });
    } finally {
      this.saving.set(false);
      this.busyKey.set(null);
    }
  }

  /** Placar já lançado: define se o diálogo avisa que algo será descartado. */
  private readonly hasScore = computed(() => this.match()?.sets.some((s) => s.a > 0 || s.b > 0) ?? false);

  protected readonly revertMessage = computed(() => {
    const base = 'A partida volta para "Agendada" e sai do ao vivo no portal e no app dos atletas. Horário, quadra e check-in continuam como estão.';
    if (!this.hasScore()) return `${base} Nenhum ponto foi marcado ainda.`;
    const w = this.wins();
    const s = this.currentSet();
    return `${base} O placar já lançado (${w.a}×${w.b} em sets, ${s.a}-${s.b} no set atual) e o histórico ponto a ponto serão descartados — não dá para recuperar.`;
  });

  protected askRevert(): void {
    if (this.saving() || this.status() !== 'in_progress') return;
    this.revertError.set(null);
    this.confirmingRevert.set(true);
  }

  protected dismissRevert(): void {
    if (this.saving()) return;
    this.confirmingRevert.set(false);
  }

  /** Inverso do START: o servidor devolve o doc para `Scheduled`, limpa o placar ao vivo e o
   *  histórico ponto a ponto, e recalcula `liveMatchesNow`. A mesa reage sozinha pelo snapshot —
   *  o card "Iniciar partida" volta a aparecer, pronto pra recomeçar do zero. */
  protected async revert(): Promise<void> {
    const m = this.match();
    if (!m || this.saving() || m.status !== 'in_progress') return;
    this.saving.set(true);
    this.busyKey.set('revert');
    this.revertError.set(null);
    this.feedback.set(null);
    try {
      await revertMatchToScheduled(m.id);
      this.confirmingRevert.set(false);
      this.feedback.set({ ok: true, message: 'Partida tirada do ao vivo — voltou para agendada, no mesmo horário e quadra.' });
      await this.ctx.reloadMatches();
    } catch (e) {
      this.revertError.set((e as Error).message || 'Falha ao tirar a partida do ao vivo.');
    } finally {
      this.saving.set(false);
      this.busyKey.set(null);
    }
  }

  /** Mesma escrita do `_point` do app: transação com sets/currentSetIndex/status/saque +
   *  evento `point`. O ponto final grava Completed+winnerId (avanço automático no servidor). */
  protected async point(side: 'A' | 'B'): Promise<void> {
    const m = this.match();
    if (!m || !this.canScore()) return;

    const result = applyPoint({ sets: m.sets, currentSetIndex: m.currentSetIndex, side, teamAId: m.teamAId, teamBId: m.teamBId, bestOf: m.bestOf });
    const setIdx = this.currentSetIdx();
    const current = result.sets[setIdx] ?? null;
    const wins = setsWonOf(result.sets, m.bestOf);

    this.saving.set(true);
    this.feedback.set(null);
    try {
      await recordPointTransaction(this.scoring, {
        matchId: m.id,
        matchUpdate: {
          sets: result.sets.map(liveSetToMap),
          currentSetIndex: result.currentSetIndex,
          status: result.winnerId != null ? 'Completed' : 'In Progress',
          servingTeamId: side === 'A' ? m.teamAId : m.teamBId,
          ...(result.winnerId != null ? { winnerId: result.winnerId, matchEndedAt: serverTimestamp() } : {}),
          ...(m.matchStartedAt == null ? { matchStartedAt: serverTimestamp() } : {}),
          resultA: `${wins.a}`,
          resultB: `${wins.b}`,
        },
        pointEvent: { type: 'point', side, setIndex: setIdx, scoreA: current?.a ?? 0, scoreB: current?.b ?? 0 },
      });
      if (result.winnerId != null) {
        this.feedback.set({ ok: true, message: `Partida encerrada — vitória de ${result.winnerId === m.teamAId ? this.teamALabel() : this.teamBLabel()}. A chave avança automaticamente.` });
        await this.ctx.reloadMatches();
      }
    } catch (e) {
      this.feedback.set({ ok: false, message: (e as Error).message || 'Falha ao marcar o ponto.' });
    } finally {
      this.saving.set(false);
    }
  }

  protected undoSide(side: 'A' | 'B'): void {
    const last = this.lastPoint();
    if (!last) return;
    if (last.side !== side) {
      this.feedback.set({ ok: false, message: 'O último ponto não foi desta dupla.' });
      return;
    }
    void this.undoLast();
  }

  /** Mesma escrita do `_undoLastPoint` do app: reverte o ponto no set do último evento e grava
   *  o evento `undo-point`; `winnerId`/`matchEndedAt` são apagados por segurança. */
  protected async undoLast(): Promise<void> {
    const m = this.match();
    const last = this.lastPoint();
    if (!m || !last || this.saving() || m.status === 'completed') return;

    const side = last.side ?? 'A';
    const result = undoPoint({ sets: m.sets, currentSetIndex: last.setIndex, side });
    const wins = setsWonOf(result.sets, m.bestOf);
    const current = result.sets[result.currentSetIndex] ?? null;

    this.saving.set(true);
    this.busyKey.set('undo');
    this.feedback.set(null);
    try {
      await recordPointTransaction(this.scoring, {
        matchId: m.id,
        matchUpdate: {
          sets: result.sets.map(liveSetToMap),
          currentSetIndex: result.currentSetIndex,
          status: 'In Progress',
          winnerId: deleteField(),
          matchEndedAt: deleteField(),
          resultA: `${wins.a}`,
          resultB: `${wins.b}`,
        },
        pointEvent: { type: 'undo-point', side, setIndex: result.currentSetIndex, scoreA: current?.a ?? 0, scoreB: current?.b ?? 0 },
      });
    } catch (e) {
      this.feedback.set({ ok: false, message: (e as Error).message || 'Falha ao desfazer o ponto.' });
    } finally {
      this.saving.set(false);
      this.busyKey.set(null);
    }
  }

  /** Espelha `_swapServe` do app. */
  protected async swapServe(): Promise<void> {
    const m = this.match();
    if (!m || this.saving() || m.status === 'completed') return;
    const current = m.servingTeamId.trim();
    const next = current === '' || current === m.teamBId ? m.teamAId : m.teamBId;
    if (!next) return;
    this.saving.set(true);
    try {
      await updateMatchFields(this.scoring, m.id, { servingTeamId: next });
    } catch (e) {
      this.feedback.set({ ok: false, message: (e as Error).message || 'Falha ao trocar o saque.' });
    } finally {
      this.saving.set(false);
    }
  }

  /** Espelha `_changeFormat` do app (Set único ↔ MD3), com o mesmo guard de não descartar
   *  sets já pontuados. */
  protected async setFormat(newBestOf: number): Promise<void> {
    const m = this.match();
    if (!m || this.saving() || m.status === 'completed' || newBestOf === m.bestOf) return;
    if (newBestOf < m.bestOf && !canReduceBestOf(m.sets, newBestOf)) {
      this.feedback.set({ ok: false, message: `Não dá para mudar para ${newBestOf === 1 ? 'set único' : 'MD3'}: há sets já pontuados.` });
      return;
    }

    const result = applyBestOfChange({ sets: m.sets, newBestOf, teamAId: m.teamAId, teamBId: m.teamBId });
    const wins = setsWonOf(result.sets, newBestOf);

    this.saving.set(true);
    this.feedback.set(null);
    try {
      await updateMatchFields(this.scoring, m.id, {
        bestOf: newBestOf,
        sets: result.sets.map(liveSetToMap),
        currentSetIndex: result.currentSetIndex,
        status: result.completed ? 'Completed' : 'In Progress',
        resultA: `${wins.a}`,
        resultB: `${wins.b}`,
        ...(result.completed ? { winnerId: result.winnerId, matchEndedAt: serverTimestamp() } : { winnerId: deleteField(), matchEndedAt: deleteField() }),
      });
      if (result.completed) await this.ctx.reloadMatches();
    } catch (e) {
      this.feedback.set({ ok: false, message: (e as Error).message || 'Falha ao trocar o formato.' });
    } finally {
      this.saving.set(false);
    }
  }

  protected async validate(): Promise<void> {
    const m = this.match();
    if (!m || this.saving()) return;
    this.saving.set(true);
    this.busyKey.set('validate');
    try {
      await validateMatchResult(m.id);
      this.feedback.set({ ok: true, message: 'Resultado validado na súmula.' });
    } catch (e) {
      this.feedback.set({ ok: false, message: (e as Error).message || 'Falha ao validar o resultado.' });
    } finally {
      this.saving.set(false);
      this.busyKey.set(null);
    }
  }
}
