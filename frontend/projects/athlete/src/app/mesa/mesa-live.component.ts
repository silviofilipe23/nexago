import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { deleteField, serverTimestamp } from 'firebase/firestore';
import { map } from 'rxjs';
import {
  applyBestOfChange,
  applyPoint,
  canReduceBestOf,
  elapsedSecondsFromStart,
  formatElapsedMmSs,
  lastUndoablePoint,
  liveSetToMap,
  matchWinnerSide,
  setPointHint,
  setRulesLabel,
  setsWonOf,
  undoPoint,
  validateScoreSubmission,
  type LiveMatch,
  type LivePointEvent,
  type MatchDisplayStatus,
  type ScoreSet,
} from '@nexago/live-scoring';
import { AuthService } from '../auth/auth.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { NxPageLoadingComponent } from '../shared/loading/nx-page-loading.component';
import { NxSpinnerComponent } from '../shared/loading/nx-spinner.component';
import { MesaLiveGateway } from './mesa-live.gateway';
import { EMPTY_TEAM_NAMES, teamLabelOf, type MesaTeamNames } from './mesa-team-names';

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

/** Mesa ao vivo do MESÁRIO no portal do atleta — as MESMAS escritas da mesa do organizador
 *  (`mesa-ao-vivo.component.ts`) e da mesa I1 do app (`organizer_match_live_table_page.dart`),
 *  pelo motor compartilhado `@nexago/live-scoring`: cada ponto roda `recordPointTransaction`
 *  (sets/currentSetIndex/status/saque + evento em `pointEvents`), o START explícito passa por
 *  `updateLiveMatchScore` zerado (servidor marca In Progress + `matchStartedAt` + o torneio como
 *  ao vivo) e o ponto final grava Completed + winnerId, com o avanço da chave disparando no
 *  servidor. A tela é dirigida pelo doc em tempo real — sem estado local de placar.
 *
 *  Quem pode: as rules (`canScoreTournament` + `scorerCanOnlyEditScoreFields`) e o
 *  `assertCanScoreTournament` dos callables — dono, gestor e mesário. Nada novo foi aberto. */
@Component({
  selector: 'app-mesa-live',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AtPanelShellComponent, NxPageLoadingComponent, NxSpinnerComponent],
  template: `
    <app-at-panel-shell [userName]="accountLabel()">
      <div class="ml-body">
        <header class="ml-head">
          <a class="ml-back" [routerLink]="['/mesa', tournamentId()]">‹ Partidas</a>
          <h1 class="ml-title">Mesa ao vivo</h1>
        </header>

        @if (!loaded()) {
          <app-nx-page-loading title="Carregando partida…" subtitle="Conectando à mesa ao vivo" />
        } @else if (!match()) {
          <div class="ml-card"><p class="ml-empty">Partida não encontrada — abra pela lista de partidas.</p></div>
        } @else if (!teamsReady()) {
          <div class="ml-card">
            <p class="ml-empty-title">Aguardando as duas duplas</p>
            <p class="ml-empty">A mesa só abre quando os dois lados da partida estiverem definidos na chave.</p>
          </div>
        } @else {
          <div class="ml-card ml-board-card">
            <div class="ml-top">
              <div class="ml-status">
                @if (status() === 'in_progress') {
                  <span class="ml-dot"></span>
                }
                <span class="ml-status-label" [attr.data-state]="status()">{{ statusLabel() }}</span>
                <span class="ml-meta">{{ metaLine() }}</span>
              </div>
              <span class="ml-clock" aria-label="Tempo de partida">{{ elapsed() }}</span>
            </div>

            <div class="ml-strip" role="list" aria-label="Sets">
              @for (chip of setStrip(); track chip.label) {
                <span class="ml-set" role="listitem" [attr.data-state]="chip.state">
                  <span class="lbl">{{ chip.label }}</span>
                  <span class="val">{{ chip.score ?? '—' }}</span>
                </span>
              }
            </div>

            <div class="ml-board">
              <div class="ml-side">
                <button type="button" class="ml-point" [disabled]="!canScore()" [attr.aria-label]="'Ponto para ' + teamALabel()" (click)="point('A')">
                  <span class="ml-team">
                    <span class="ml-name" [title]="teamALabel()">{{ teamALabel() }}</span>
                    @if (servingSide() === 'A') {
                      <span class="ml-serve" title="No saque">SAQUE</span>
                    }
                  </span>
                  <span class="ml-score">{{ currentSet().a }}</span>
                  @if (canScore()) {
                    <span class="ml-plus">+1 ponto</span>
                  }
                </button>
                <button type="button" class="ml-minus" [disabled]="!canUndoSide('A')" (click)="undoSide('A')">−1</button>
              </div>

              <div class="ml-center">
                <span class="ml-sets">{{ wins().a }}<em>×</em>{{ wins().b }}</span>
                <span class="ml-sets-lbl">sets</span>
              </div>

              <div class="ml-side">
                <button type="button" class="ml-point" [disabled]="!canScore()" [attr.aria-label]="'Ponto para ' + teamBLabel()" (click)="point('B')">
                  <span class="ml-team">
                    <span class="ml-name" [title]="teamBLabel()">{{ teamBLabel() }}</span>
                    @if (servingSide() === 'B') {
                      <span class="ml-serve" title="No saque">SAQUE</span>
                    }
                  </span>
                  <span class="ml-score">{{ currentSet().b }}</span>
                  @if (canScore()) {
                    <span class="ml-plus">+1 ponto</span>
                  }
                </button>
                <button type="button" class="ml-minus" [disabled]="!canUndoSide('B')" (click)="undoSide('B')">−1</button>
              </div>
            </div>

            <div class="ml-rules">
              <span>{{ rulesLabel() }}</span>
              @if (hint(); as h) {
                <span class="ml-hint">{{ h }}</span>
              }
            </div>
          </div>

          @if (feedback(); as fb) {
            <div class="ml-banner" [class.ml-banner--ok]="fb.ok" role="status">{{ fb.message }}</div>
          }

          @if (status() === 'scheduled') {
            <div class="ml-card">
              <p class="ml-empty-title">Partida ainda não iniciada</p>
              <p class="ml-empty">Ao iniciar, ela fica <strong>ao vivo</strong> no portal e no app dos atletas, com o placar acompanhando ponto a ponto.</p>
              <button type="button" class="ml-btn ml-btn--primary" [disabled]="saving()" (click)="start()">
                @if (busyKey() === 'start') {
                  <app-nx-spinner [size]="14" tone="dark" />
                }
                {{ busyKey() === 'start' ? 'Iniciando…' : 'Iniciar partida' }}
              </button>
            </div>
          }

          @if (status() === 'in_progress') {
            <div class="ml-card">
              <p class="ml-card-title">Ações</p>
              <div class="ml-actions">
                <button type="button" class="ml-btn" [disabled]="saving() || lastPoint() === null" (click)="undoLast()">
                  @if (busyKey() === 'undo') {
                    <app-nx-spinner [size]="12" />
                  }
                  Desfazer último ponto
                </button>
                <button type="button" class="ml-btn" [disabled]="saving()" (click)="swapServe()">Trocar saque</button>
                <div class="ml-format">
                  @for (option of formats; track option) {
                    <button type="button" class="ml-chip" [class.ml-chip--on]="bestOf() === option" [disabled]="saving()" (click)="setFormat(option)">
                      {{ option === 1 ? 'Set único' : 'MD3' }}
                    </button>
                  }
                </div>
              </div>
            </div>
          }

          @if (status() === 'completed') {
            <div class="ml-card">
              <p class="ml-card-title">Fim de jogo</p>
              <p class="ml-empty">Vitória de <strong>{{ winnerLabel() }}</strong> — a chave avança automaticamente.</p>
              <button type="button" class="ml-btn" [disabled]="saving()" (click)="validate()">
                @if (busyKey() === 'validate') {
                  <app-nx-spinner [size]="12" />
                }
                {{ busyKey() === 'validate' ? 'Validando…' : 'Validar resultado' }}
              </button>
            </div>
          }

          <div class="ml-card">
            <button type="button" class="ml-toggle" [attr.aria-expanded]="quickOpen()" (click)="toggleQuick()">
              <span class="ml-card-title">Lançar placar por sets</span>
              <span class="ml-toggle-icon">{{ quickOpen() ? '−' : '+' }}</span>
            </button>
            <p class="ml-empty ml-quick-hint">
              Para fechar (ou corrigir) o resultado sem marcar ponto a ponto — a partida que já aconteceu na areia.
            </p>

            @if (quickOpen()) {
              <div class="ml-quick">
                @for (set of quickSets(); track $index) {
                  <div class="ml-quick-row">
                    <span class="ml-quick-label">Set {{ $index + 1 }}</span>
                    <input
                      class="ml-input"
                      type="number"
                      inputmode="numeric"
                      min="0"
                      max="99"
                      [attr.aria-label]="'Pontos de ' + teamALabel() + ' no set ' + ($index + 1)"
                      [value]="set.a"
                      (input)="updateQuickSet($index, 'a', $event)"
                    />
                    <span class="ml-quick-x">×</span>
                    <input
                      class="ml-input"
                      type="number"
                      inputmode="numeric"
                      min="0"
                      max="99"
                      [attr.aria-label]="'Pontos de ' + teamBLabel() + ' no set ' + ($index + 1)"
                      [value]="set.b"
                      (input)="updateQuickSet($index, 'b', $event)"
                    />
                    <button type="button" class="ml-quick-del" [disabled]="saving()" (click)="removeQuickSet($index)" aria-label="Remover set">×</button>
                  </div>
                }

                <div class="ml-quick-actions">
                  <button type="button" class="ml-btn" [disabled]="saving() || quickSets().length >= bestOf()" (click)="addQuickSet()">Adicionar set</button>
                  <button type="button" class="ml-btn ml-btn--primary" [disabled]="saving() || !canSubmitQuick()" (click)="saveQuick()">
                    @if (busyKey() === 'quick') {
                      <app-nx-spinner [size]="14" tone="dark" />
                    }
                    {{ busyKey() === 'quick' ? 'Salvando…' : 'Salvar placar' }}
                  </button>
                </div>

                @if (quickIssues().length > 0) {
                  <ul class="ml-issues">
                    @for (issue of quickIssues(); track issue.message) {
                      <li>{{ issue.message }}</li>
                    }
                  </ul>
                }
              </div>
            }
          </div>

          @if (feed().length > 0) {
            <div class="ml-card">
              <p class="ml-card-title">Últimos lances</p>
              <ul class="ml-feed">
                @for (row of feed(); track row.key) {
                  <li [class.undo]="row.undo">
                    <span class="t">{{ row.time }}</span>
                    <span class="l">{{ row.label }}</span>
                    <span class="s">{{ row.score }}</span>
                  </li>
                }
              </ul>
            </div>
          }
        }
      </div>
    </app-at-panel-shell>
  `,
  styles: `
    .ml-body {
      padding: 24px 32px 40px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      max-width: 760px;
    }
    .ml-back {
      display: inline-block;
      font-size: 12.5px;
      color: var(--nx-text-mute);
      text-decoration: none;
      margin-bottom: 8px;
    }
    .ml-back:hover {
      color: var(--nx-orange-500);
    }
    .ml-title {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 24px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
      margin: 0;
    }
    .ml-card {
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-3);
      padding: 16px;
    }
    .ml-card-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 14px;
      color: var(--nx-text);
      margin: 0 0 8px;
    }
    .ml-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .ml-status {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .ml-status-label {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-mute);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-pill);
      padding: 3px 9px;
    }
    .ml-status-label[data-state='in_progress'] {
      color: var(--nx-live);
      border-color: var(--nx-live);
    }
    .ml-status-label[data-state='completed'] {
      color: var(--nx-win);
      border-color: var(--nx-win);
    }
    .ml-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--nx-live);
    }
    .ml-meta {
      font-size: 12px;
      color: var(--nx-text-dim);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .ml-clock {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 18px;
      color: var(--nx-orange-500);
    }
    .ml-strip {
      display: flex;
      gap: 8px;
      margin-top: 14px;
    }
    .ml-set {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      padding: 6px 12px;
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-line);
      background: var(--nx-surface-0);
    }
    .ml-set .lbl {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .ml-set .val {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13px;
      color: var(--nx-text);
    }
    .ml-set[data-state='current'] {
      border-color: var(--nx-orange-500);
    }
    .ml-set[data-state='current'] .lbl {
      color: var(--nx-orange-500);
    }
    .ml-set[data-state='upcoming'] .val {
      color: var(--nx-text-mute);
    }
    .ml-board {
      display: flex;
      align-items: stretch;
      gap: 14px;
      margin-top: 16px;
    }
    .ml-side {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
    }
    .ml-point {
      /* Cresce pra altura do lado (o selo SAQUE só aparece de um lado): sem isso os dois
         cartões ficam com alturas diferentes e os botões −1 desalinham. */
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 18px 12px 14px;
      border-radius: var(--nx-r-3);
      border: 1px solid var(--nx-line);
      background: var(--nx-surface-0);
      cursor: pointer;
      transition: border-color var(--nx-d-fast) var(--nx-ease-out);
    }
    .ml-point:not(:disabled):hover {
      border-color: var(--nx-orange-500);
    }
    .ml-point:disabled {
      cursor: default;
    }
    .ml-team {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      max-width: 100%;
    }
    .ml-name {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 14px;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .ml-serve {
      font-family: var(--nx-font-mono);
      font-size: 8.5px;
      font-weight: 700;
      letter-spacing: 0.14em;
      color: var(--nx-orange-500);
      border: 1px solid var(--nx-orange-500);
      border-radius: var(--nx-r-pill);
      padding: 2px 7px;
      flex: none;
    }
    .ml-score {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 56px;
      line-height: 1;
      color: var(--nx-text);
      font-variant-numeric: tabular-nums;
    }
    .ml-plus {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-orange-500);
    }
    .ml-center {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      min-width: 74px;
    }
    .ml-sets {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 24px;
      color: var(--nx-orange-500);
    }
    .ml-sets em {
      font-style: normal;
      color: var(--nx-text-dim);
      font-size: 16px;
      margin: 0 4px;
    }
    .ml-sets-lbl {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .ml-rules {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 14px;
      font-family: var(--nx-font-mono);
      font-size: 11px;
      color: var(--nx-text-dim);
    }
    .ml-hint {
      color: var(--nx-pending);
      border: 1px solid var(--nx-pending);
      border-radius: var(--nx-r-pill);
      padding: 2px 8px;
    }
    .ml-btn,
    .ml-minus,
    .ml-chip {
      min-height: 38px;
      padding: 0 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-line);
      background: var(--nx-surface-0);
      color: var(--nx-text);
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
    }
    .ml-btn:disabled,
    .ml-minus:disabled,
    .ml-chip:disabled {
      opacity: 0.45;
      pointer-events: none;
    }
    .ml-btn--primary {
      background: var(--nx-orange-500);
      border-color: var(--nx-orange-500);
      color: #10100e;
    }
    .ml-minus {
      align-self: center;
      min-width: 72px;
    }
    .ml-chip--on {
      border-color: var(--nx-orange-500);
      color: var(--nx-orange-500);
    }
    .ml-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .ml-format {
      display: flex;
      gap: 8px;
      margin-left: auto;
    }
    .ml-banner {
      border: 1px solid var(--nx-line);
      border-left: 3px solid var(--nx-live);
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      padding: 12px 14px;
      font-size: 13px;
      color: var(--nx-text);
    }
    .ml-banner--ok {
      border-left-color: var(--nx-win);
    }
    .ml-toggle {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      background: none;
      border: none;
      padding: 0;
      cursor: pointer;
      color: inherit;
    }
    .ml-toggle-icon {
      font-size: 20px;
      color: var(--nx-text-dim);
      line-height: 1;
    }
    .ml-quick-hint {
      margin-top: 2px;
    }
    .ml-quick {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 14px;
    }
    .ml-quick-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .ml-quick-label {
      font-family: var(--nx-font-mono);
      font-size: 11px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      width: 52px;
    }
    .ml-quick-x {
      color: var(--nx-text-dim);
    }
    .ml-input {
      width: 68px;
      height: 40px;
      text-align: center;
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-line);
      background: var(--nx-surface-0);
      color: var(--nx-text);
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 15px;
    }
    .ml-quick-del {
      margin-left: auto;
      width: 32px;
      height: 32px;
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-line);
      background: transparent;
      color: var(--nx-text-dim);
      cursor: pointer;
    }
    .ml-quick-actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .ml-issues {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 12.5px;
      color: var(--nx-live);
    }
    .ml-feed {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
    }
    .ml-feed li {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 7px 2px;
      border-bottom: 1px solid var(--nx-line);
      font-size: 12.5px;
      color: var(--nx-text);
    }
    .ml-feed li:last-child {
      border-bottom: none;
    }
    .ml-feed li.undo {
      color: var(--nx-text-dim);
    }
    .ml-feed .t {
      font-family: var(--nx-font-mono);
      font-size: 11px;
      color: var(--nx-text-dim);
      width: 44px;
    }
    .ml-feed .l {
      flex: 1;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .ml-feed .s {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 12px;
    }
    .ml-empty {
      font-size: 13px;
      color: var(--nx-text-mute);
      margin: 0 0 12px;
    }
    .ml-empty:last-child {
      margin-bottom: 0;
    }
    .ml-empty-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 15px;
      color: var(--nx-text);
      margin: 0 0 6px;
    }
    @media (max-width: 720px) {
      .ml-body {
        padding: 20px 16px 32px;
      }
      .ml-board {
        gap: 8px;
      }
      /* Lado a lado, o selo SAQUE espremia o nome até sobrar uma letra ("A..."). Empilhado, o
         nome fica com a largura inteira do lado — e é ele que o mesário confere antes de tocar. */
      .ml-team {
        flex-direction: column;
        gap: 4px;
        width: 100%;
      }
      .ml-name {
        max-width: 100%;
        font-size: 13px;
      }
      .ml-score {
        font-size: 44px;
      }
      .ml-center {
        min-width: 52px;
      }
      .ml-format {
        margin-left: 0;
      }
    }

    /* Celular/tablet na quadra: "ponto" é o toque mais repetido do evento inteiro e o mais caro
       de errar. Cresce por ponteiro grosso, não por largura. */
    @media (pointer: coarse) {
      .ml-point {
        min-height: 132px;
        justify-content: center;
        padding: 20px 12px;
      }
      .ml-minus {
        min-height: 44px;
      }
    }
  `,
})
export class MesaLiveComponent {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly gateway = inject(MesaLiveGateway);

  protected readonly formats = [1, 3] as const;

  protected readonly tournamentId = toSignal(this.route.paramMap.pipe(map((p) => p.get('tournamentId')?.trim() ?? '')), {
    initialValue: this.route.snapshot.paramMap.get('tournamentId')?.trim() ?? '',
  });
  protected readonly matchId = toSignal(this.route.paramMap.pipe(map((p) => p.get('matchId')?.trim() ?? '')), {
    initialValue: this.route.snapshot.paramMap.get('matchId')?.trim() ?? '',
  });

  private readonly live = signal<LiveMatch | null>(null);
  private readonly events = signal<LivePointEvent[]>([]);
  private readonly names = signal<MesaTeamNames>(EMPTY_TEAM_NAMES);
  private readonly now = signal(Date.now());
  protected readonly loaded = signal(false);

  protected readonly saving = signal(false);
  protected readonly busyKey = signal<string | null>(null);
  protected readonly feedback = signal<{ ok: boolean; message: string } | null>(null);

  protected readonly quickOpen = signal(false);
  protected readonly quickSets = signal<ScoreSet[]>([]);
  private hydratedQuickFor = '';

  protected readonly accountLabel = computed(() => this.auth.user()?.displayName?.trim() || 'Atleta');

  constructor() {
    // A mesa é dirigida pelo doc em tempo real: troca de matchId refaz as assinaturas.
    effect((onCleanup) => {
      const id = this.matchId();
      this.live.set(null);
      this.events.set([]);
      this.feedback.set(null);
      this.loaded.set(false);
      this.hydratedQuickFor = '';
      if (!id || !this.gateway.available) {
        this.loaded.set(true);
        return;
      }
      const unsubMatch = this.gateway.watchMatch(
        id,
        (m) => {
          this.live.set(m);
          this.loaded.set(true);
          if (m) void this.hydrateNames(m);
        },
        () => this.loaded.set(true),
      );
      const unsubEvents = this.gateway.watchEvents(id, (events) => this.events.set(events));
      onCleanup(() => {
        unsubMatch();
        unsubEvents();
      });
    });

    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  private resolvedTeamIds = '';

  private async hydrateNames(m: LiveMatch): Promise<void> {
    const key = [m.teamAId, m.teamBId].sort().join(',');
    if (key === this.resolvedTeamIds) return;
    this.resolvedTeamIds = key;
    try {
      this.names.set(await this.gateway.teamNames([m.teamAId, m.teamBId]));
    } catch {
      // Sem os nomes, a mesa cai na descrição do slot da chave — melhor que travar o placar.
      this.resolvedTeamIds = '';
    }
  }

  protected readonly match = computed(() => this.live());
  protected readonly status = computed<MatchDisplayStatus>(() => this.match()?.status ?? 'scheduled');
  protected readonly statusLabel = computed(() => STATUS_LABEL[this.status()]);
  protected readonly bestOf = computed(() => this.match()?.bestOf ?? 3);

  protected readonly teamsReady = computed(() => {
    const m = this.match();
    return m != null && m.teamAId.length > 0 && m.teamBId.length > 0;
  });

  protected readonly teamALabel = computed(() => {
    const m = this.match();
    return m ? teamLabelOf(this.names(), m.teamAId, m.teamADescription) : 'Dupla A';
  });

  protected readonly teamBLabel = computed(() => {
    const m = this.match();
    return m ? teamLabelOf(this.names(), m.teamBId, m.teamBDescription) : 'Dupla B';
  });

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
   *  desfazer, como na mesa do organizador. */
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

  protected readonly feed = computed<FeedRowView[]>(() => {
    const nameOf = (side: 'A' | 'B' | null): string => (side === 'A' ? this.teamALabel() : side === 'B' ? this.teamBLabel() : '—');
    return [...this.events()]
      .reverse()
      .slice(0, 12)
      .map((e) => ({
        key: e.id,
        time: e.ts ? TIME.format(e.ts) : '—',
        label: e.type === 'undo-point' ? `Ponto desfeito (${nameOf(e.side)})` : `Ponto ${nameOf(e.side)}`,
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
      await this.gateway.start(m.id);
      this.feedback.set({ ok: true, message: 'Partida iniciada — já aparece ao vivo para os atletas.' });
    } catch (e) {
      this.feedback.set({ ok: false, message: (e as Error).message || 'Falha ao iniciar a partida.' });
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
      await this.gateway.recordPoint({
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
        this.feedback.set({
          ok: true,
          message: `Partida encerrada — vitória de ${result.winnerId === m.teamAId ? this.teamALabel() : this.teamBLabel()}. A chave avança automaticamente.`,
        });
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
      await this.gateway.recordPoint({
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

  protected async swapServe(): Promise<void> {
    const m = this.match();
    if (!m || this.saving() || m.status === 'completed') return;
    const current = m.servingTeamId.trim();
    const next = current === '' || current === m.teamBId ? m.teamAId : m.teamBId;
    if (!next) return;
    this.saving.set(true);
    try {
      await this.gateway.updateFields(m.id, { servingTeamId: next });
    } catch (e) {
      this.feedback.set({ ok: false, message: (e as Error).message || 'Falha ao trocar o saque.' });
    } finally {
      this.saving.set(false);
    }
  }

  /** Set único ↔ MD3, com o mesmo guard de não descartar sets já pontuados. */
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
      await this.gateway.updateFields(m.id, {
        bestOf: newBestOf,
        sets: result.sets.map(liveSetToMap),
        currentSetIndex: result.currentSetIndex,
        status: result.completed ? 'Completed' : 'In Progress',
        resultA: `${wins.a}`,
        resultB: `${wins.b}`,
        ...(result.completed ? { winnerId: result.winnerId, matchEndedAt: serverTimestamp() } : { winnerId: deleteField(), matchEndedAt: deleteField() }),
      });
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
      await this.gateway.validate(m.id);
      this.feedback.set({ ok: true, message: 'Resultado validado na súmula.' });
    } catch (e) {
      this.feedback.set({ ok: false, message: (e as Error).message || 'Falha ao validar o resultado.' });
    } finally {
      this.saving.set(false);
      this.busyKey.set(null);
    }
  }

  // ── Placar por sets ────────────────────────────────────────────────────────

  /** Abre já preenchido com o que está no doc (sets fechados) — corrigir é o caso mais comum
   *  depois de a partida ter acontecido. */
  protected toggleQuick(): void {
    const open = !this.quickOpen();
    this.quickOpen.set(open);
    const m = this.match();
    if (!open || !m || this.hydratedQuickFor === m.id) return;
    this.hydratedQuickFor = m.id;
    const fromDoc = m.sets.map((s) => ({ a: s.a, b: s.b }));
    this.quickSets.set(fromDoc.length > 0 ? fromDoc : [{ a: 0, b: 0 }]);
  }

  protected addQuickSet(): void {
    if (this.quickSets().length >= this.bestOf()) return;
    this.quickSets.update((sets) => [...sets, { a: 0, b: 0 }]);
  }

  protected removeQuickSet(index: number): void {
    this.quickSets.update((sets) => sets.filter((_, i) => i !== index));
  }

  protected updateQuickSet(index: number, side: 'a' | 'b', event: Event): void {
    const raw = Number((event.target as HTMLInputElement).value);
    const value = Number.isFinite(raw) ? Math.max(0, Math.min(99, Math.trunc(raw))) : 0;
    this.quickSets.update((sets) => sets.map((s, i) => (i === index ? { ...s, [side]: value } : s)));
  }

  /** Validação local espelhando `match_scoring_logic.dart` (mensagens idênticas às do app); o
   *  servidor revalida em `submitMatchResult`. */
  protected readonly quickIssues = computed(() => validateScoreSubmission(this.quickSets(), this.bestOf()));

  protected canSubmitQuick(): boolean {
    return this.quickSets().length > 0 && this.quickIssues().length === 0;
  }

  protected async saveQuick(): Promise<void> {
    const m = this.match();
    if (!m || this.saving() || !this.canSubmitQuick()) return;
    this.saving.set(true);
    this.busyKey.set('quick');
    this.feedback.set(null);
    try {
      const sets = this.quickSets();
      const result = await this.gateway.submitSets(m.id, sets, this.bestOf());
      const winner = matchWinnerSide(sets, this.bestOf());
      const winnerLabel = winner === 'A' ? this.teamALabel() : this.teamBLabel();
      this.feedback.set({
        ok: true,
        message: result.completed ? `Placar salvo — vitória de ${winnerLabel}. A chave avança automaticamente.` : 'Placar parcial salvo.',
      });
    } catch (e) {
      this.feedback.set({ ok: false, message: (e as Error).message || 'Falha ao salvar o placar.' });
    } finally {
      this.saving.set(false);
      this.busyKey.set(null);
    }
  }
}
