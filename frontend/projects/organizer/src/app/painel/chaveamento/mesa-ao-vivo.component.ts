import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { deleteField, serverTimestamp } from 'firebase/firestore';
import type { PillTone } from '../data/mock-data';
import { initialsOf, truncateName } from '../data/mock-data';
import {
  applyBestOfChange,
  buildMedicalTimeoutEndWrite,
  buildMedicalTimeoutStartWrite,
  buildPointWrite,
  buildUndoWrite,
  canReduceBestOf,
  elapsedSecondsFromStart,
  formatElapsedMmSs,
  formatMedicalTimeoutMmSs,
  hasUsedMedicalTimeout,
  lastUndoablePoint,
  liveSetToMap,
  medicalTimeoutRemainingSeconds,
  needsServingPlayer,
  needsStartingServe,
  recordPointTransaction,
  servingPlayerFields,
  servingTeamFields,
  setPointHint,
  setRulesLabel,
  setsWonOf,
  updateMatchFields,
  watchLiveMatch,
  watchPointEvents,
  type LiveMatch,
  type LivePointEvent,
  type MatchDisplayStatus,
  type MatchSide,
} from '@nexago/live-scoring';
import { isKingOfCourtMatchType, kocIsExpired, kocPhaseLabel, kocRemainingLabel } from '../data/koc';
import { organizerFirestore } from '../data/firestore';
import { organizerLiveScoringContext } from '../data/live-scoring-context';
import { formatCourtLabel } from '../data/schedule-format';
import { fetchProfileNames, fetchTeamsByIds } from '../data/teams-repository';
import { environment } from '../../../environments/environment';
import { revertMatchToScheduled, updateLiveMatchScore, validateMatchResult } from '../data/organizer-ops.service';
import { OgAvatarComponent } from '../ui/avatar.component';
import { OgCardComponent } from '../ui/card.component';
import { OgConfirmDialogComponent } from '../ui/confirm-dialog.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgPillComponent } from '../ui/pill.component';
import { NxPageLoadingComponent } from '../../shared/loading/nx-page-loading.component';
import { NxSpinnerComponent } from '../../shared/loading/nx-spinner.component';
import { ChaveamentoContextService } from './chaveamento-context.service';
import { MesaKocComponent } from './mesa-koc.component';

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

/** Um atleta no seletor do tempo médico: quem é, de que lado, e se a cota dele já foi usada. */
interface MedicalOptionView {
  side: MatchSide;
  slot: 1 | 2;
  playerName: string;
  teamLabel: string;
  used: boolean;
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
  imports: [RouterLink, OgPageHeaderComponent, OgCardComponent, OgAvatarComponent, OgPillComponent, OgConfirmDialogComponent, NxPageLoadingComponent, NxSpinnerComponent, MesaKocComponent],
  template: `
    <og-page-header title="Mesa ao vivo" [subtitle]="headerSubtitle()">
      @if (isKingOfCourt()) {
        @if (status() === 'in_progress') {
          <span class="og-mesa-koc-live">
            <span class="og-mesa-koc-live-dot" aria-hidden="true"></span>
            Rodada ao vivo
          </span>
          @if (kocHeaderClock(); as clock) {
            <span class="og-mesa-koc-clock">{{ clock }}</span>
          }
        } @else if (kocCourtBadge(); as badge) {
          <span class="og-mesa-koc-badge" [class.done]="status() === 'completed'">{{ badge }}</span>
        }
        <a class="og-ghost-btn" [href]="'/telao/' + id()" target="_blank" rel="noopener">Abrir telão</a>
        <a class="og-ghost-btn" [routerLink]="['/painel/eventos', id(), 'categorias', catId(), 'jogos']">Voltar</a>
      } @else {
        <a class="og-ghost-btn" [routerLink]="['/painel/eventos', id(), 'categorias', catId(), 'jogos']">Voltar</a>
        <a class="og-ghost-btn" [routerLink]="['/painel/eventos', id(), 'categorias', catId(), 'placar', matchId()]">Placar completo</a>
      }
    </og-page-header>

    <div class="og-wizard-body">
      <div class="og-wizard-col" [class.og-mesa-koc-wrap]="isKingOfCourt()">
        @if (!liveLoaded()) {
          <og-card><app-nx-page-loading title="Carregando partida…" subtitle="Conectando à mesa ao vivo" /></og-card>
        } @else if (!match()) {
          <og-card><p class="og-mesa-empty">Partida não encontrada — abra pela lista de jogos.</p></og-card>
        } @else if (isKingOfCourt()) {
          <!-- Rodada KOTC: mesa própria. A checagem vem ANTES de teamsReady(),
               que exige os dois lados definidos — a rodada não tem lados, então
               cairia no aviso de "aguardando as duas equipes" para sempre. -->
          <og-mesa-koc [id]="id()" [matchId]="matchId()" [catId]="catId()" />
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

            @if (askingServe()) {
              <div class="og-mesa-ask">
                <span class="og-mesa-ask-lbl">Quem começa sacando?</span>
                @for (side of SIDES; track side) {
                  <button
                    type="button"
                    class="og-mesa-askbtn"
                    [disabled]="saving()"
                    [attr.aria-label]="'Saque inicial para ' + sideLabel(side)"
                    (click)="chooseServe(side)"
                  >
                    {{ truncate(sideLabel(side), 22) }}
                  </button>
                }
              </div>
            }

            <!-- O andar de baixo do saque: qual ATLETA da dupla vai à linha. Não bloqueia o
                 ponto — o placar é o que não pode esperar. -->
            @if (askingServingPlayer(); as asking) {
              <div class="og-mesa-ask">
                <span class="og-mesa-ask-lbl">Quem saca por {{ truncate(asking.teamLabel, 20) }}?</span>
                @for (option of asking.players; track option.slot) {
                  <button
                    type="button"
                    class="og-mesa-askbtn"
                    [disabled]="saving()"
                    [attr.aria-label]="'Saque de ' + option.playerName"
                    (click)="chooseServingPlayer(option.slot)"
                  >
                    {{ truncate(option.playerName, 22) }}
                  </button>
                }
              </div>
            }

            <div class="og-mesa-board">
              <div class="og-mesa-side">
                <button type="button" class="og-mesa-point" [disabled]="!canScore()" [attr.aria-label]="'Ponto para ' + teamALabel()" (click)="point('A')">
                  <span class="og-mesa-team">
                    <og-avatar [initials]="initialsOf(teamALabel())" [size]="34" />
                    <span class="og-mesa-name" [title]="teamALabel()">{{ truncate(teamALabel(), 22) }}</span>
                    @if (servingSide() === 'A') {
                      <span class="og-mesa-serve" title="No saque">{{ serveBadge() }}</span>
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
                      <span class="og-mesa-serve" title="No saque">{{ serveBadge() }}</span>
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
                <button type="button" class="og-mini-btn" [disabled]="saving() || servingPlayerSlot() === 0" (click)="swapServingPlayer()">Trocar sacador</button>
                <button type="button" class="og-mini-btn og-mesa-medical" [disabled]="saving() || !canOpenMedical()" (click)="openMedicalPicker()">Tempo médico</button>
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

    <!-- Tempo médico: o atendimento vem do DOC, então o overlay cobre a mesa em TODAS as
         superfícies ao mesmo tempo e a contagem é a mesma em todas (derivada do carimbo do
         servidor, sem escrita durante os 5 minutos). -->
    @if (medical(); as m) {
      <div class="og-mesa-medical-overlay" role="dialog" aria-live="polite">
        <div class="og-mesa-medical-box">
          <span class="og-mesa-medical-kicker">TEMPO MÉDICO · 5 MINUTOS</span>
          <strong class="og-mesa-medical-name">{{ m.playerName }}</strong>
          <span class="og-mesa-medical-team">{{ m.teamLabel }}</span>
          <span class="og-mesa-medical-clock" [class.over]="m.ended">{{ m.clock }}</span>
          @if (m.ended) {
            <span class="og-mesa-medical-done">ATENDIMENTO ENCERRADO</span>
          }
          <button type="button" class="og-mini-btn og-mini-btn-primary" [disabled]="saving()" (click)="endMedical()">Encerrar atendimento</button>
        </div>
      </div>
    } @else if (medicalPickerOpen()) {
      <div class="og-mesa-medical-overlay" role="dialog">
        <div class="og-mesa-medical-box">
          <span class="og-mesa-medical-kicker">QUEM VAI SER ATENDIDO?</span>
          <span class="og-mesa-medical-team">Atendimento de 5 minutos — um por atleta na partida.</span>
          <div class="og-mesa-medical-list">
            @for (option of medicalOptions(); track option.side + option.slot) {
              <button type="button" class="og-mesa-medical-opt" [disabled]="option.used || saving()" (click)="startMedical(option)">
                <span class="badge">{{ option.side }}</span>
                <span class="who">
                  <b>{{ option.playerName }}</b>
                  <i>{{ truncate(option.teamLabel, 24) }}</i>
                </span>
                <span class="state">{{ option.used ? 'já usou' : 'disponível' }}</span>
              </button>
            }
          </div>
          <button type="button" class="og-mini-btn" (click)="cancelMedicalPicker()">Cancelar</button>
        </div>
      </div>
    }

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
    .og-mesa-medical {
      border-color: color-mix(in srgb, var(--nx-live) 40%, transparent);
      color: var(--nx-live);
    }
    .og-mesa-medical-overlay {
      position: fixed;
      inset: 0;
      z-index: 60;
      display: grid;
      place-items: center;
      padding: 20px;
      background: rgba(0, 0, 0, 0.72);
      backdrop-filter: blur(10px);
    }
    .og-mesa-medical-box {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      width: min(420px, 100%);
      padding: 24px 20px;
      border-radius: var(--nx-r-3);
      border: 1px solid var(--nx-line);
      background: var(--nx-surface-1);
      text-align: center;
    }
    .og-mesa-medical-kicker {
      font-family: var(--nx-font-mono);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.12em;
      color: var(--nx-live);
    }
    .og-mesa-medical-name {
      font-family: var(--nx-font-ui);
      font-size: 22px;
      color: var(--nx-text);
    }
    .og-mesa-medical-team {
      font-family: var(--nx-font-ui);
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .og-mesa-medical-clock {
      font-family: var(--nx-font-mono);
      font-size: 56px;
      font-weight: 700;
      line-height: 1;
      color: var(--nx-text);
    }
    .og-mesa-medical-clock.over {
      color: var(--nx-live);
    }
    .og-mesa-medical-done {
      font-family: var(--nx-font-mono);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.1em;
      color: var(--nx-win);
    }
    .og-mesa-medical-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 100%;
    }
    .og-mesa-medical-opt {
      display: flex;
      align-items: center;
      gap: 10px;
      /* Alvo de mesário na areia. */
      min-height: 52px;
      padding: 8px 12px;
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-line);
      background: var(--nx-surface-0);
      color: var(--nx-text);
      cursor: pointer;
      text-align: left;
    }
    .og-mesa-medical-opt:disabled {
      opacity: 0.45;
      cursor: default;
    }
    .og-mesa-medical-opt .badge {
      display: grid;
      place-items: center;
      width: 24px;
      height: 24px;
      border-radius: 7px;
      background: var(--nx-orange-500);
      color: #fff;
      font-family: var(--nx-font-mono);
      font-size: 12px;
      font-weight: 700;
    }
    .og-mesa-medical-opt .who {
      display: flex;
      flex-direction: column;
      min-width: 0;
      flex: 1;
    }
    .og-mesa-medical-opt .who b {
      font-family: var(--nx-font-ui);
      font-size: 14px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .og-mesa-medical-opt .who i {
      font-family: var(--nx-font-mono);
      font-style: normal;
      font-size: 10px;
      color: var(--nx-text-dim);
    }
    .og-mesa-medical-opt .state {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      color: var(--nx-text-dim);
    }
    .og-mesa-ask {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 14px;
      padding: 10px 12px;
      border-radius: var(--nx-r-2);
      border: 1px solid color-mix(in srgb, var(--nx-orange-500) 32%, var(--nx-line));
      background: color-mix(in srgb, var(--nx-orange-500) 7%, transparent);
    }
    .og-mesa-ask-lbl {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--nx-orange-500);
    }
    /* Alvo de mesário na quadra: 40px de altura mesmo numa faixa temporária. */
    .og-mesa-askbtn {
      min-height: 40px;
      padding: 0 14px;
      border-radius: var(--nx-r-2);
      border: 1px solid color-mix(in srgb, var(--nx-orange-500) 42%, var(--nx-line));
      background: var(--nx-surface-0);
      color: var(--nx-text);
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
      transition: border-color var(--nx-d-fast) var(--nx-ease-out);
    }
    .og-mesa-askbtn:not(:disabled):hover {
      border-color: var(--nx-orange-500);
    }
    .og-mesa-askbtn:disabled {
      opacity: 0.5;
      pointer-events: none;
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
    .og-mesa-koc-wrap {
      max-width: none;
      width: 100%;
    }
    .og-mesa-koc-badge {
      display: inline-flex;
      align-items: center;
      padding: 6px 12px;
      border-radius: 999px;
      border: 1px solid color-mix(in srgb, var(--nx-orange-500) 55%, transparent);
      color: var(--nx-orange-500);
      font-family: var(--nx-font-mono);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .og-mesa-koc-badge.done {
      border-color: color-mix(in srgb, var(--nx-win) 55%, transparent);
      color: var(--nx-win);
    }
    .og-mesa-koc-live {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      border-radius: 999px;
      border: 1px solid color-mix(in srgb, var(--nx-live) 55%, transparent);
      color: var(--nx-live);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .og-mesa-koc-live-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--nx-live);
      box-shadow: 0 0 8px color-mix(in srgb, var(--nx-live) 70%, transparent);
      animation: og-mesa-koc-dot 1.4s ease-in-out infinite;
    }
    @keyframes og-mesa-koc-dot {
      0%,
      100% {
        opacity: 1;
      }
      50% {
        opacity: 0.35;
      }
    }
    .og-mesa-koc-clock {
      font-family: var(--nx-font-mono);
      font-size: 28px;
      font-weight: 800;
      line-height: 1;
      letter-spacing: -0.02em;
      font-variant-numeric: tabular-nums;
    }
    @media (prefers-reduced-motion: reduce) {
      .og-mesa-koc-live-dot {
        animation: none;
      }
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

  /** Rodada King of the Court — a mesa de duelo delega para `og-mesa-koc`, o que
   *  mantém válido todo link existente para `ao-vivo/:matchId`. */
  protected readonly isKingOfCourt = computed(() =>
    isKingOfCourtMatchType(this.match()?.matchType ?? ''),
  );

  /** Badge do protótipo: "QUADRA 3 · PRONTA" / "AO VIVO" / "ENCERRADA". */
  protected readonly kocCourtBadge = computed(() => {
    const m = this.match();
    if (!m || !this.isKingOfCourt()) return null;
    const court = formatCourtLabel(m.courtName) || 'Quadra';
    const status =
      m.status === 'in_progress' ? 'Ao vivo' : m.status === 'completed' ? 'Encerrada' : 'Pronta';
    return `${court} · ${status}`;
  });

  /** Relógio do header KOTC — lê o match do contexto (mesmo doc que a mesa). */
  protected readonly kocHeaderClock = computed(() => {
    if (!this.isKingOfCourt() || this.status() !== 'in_progress') return null;
    const clock = this.cachedRow()?.koc?.clock;
    if (!clock) return null;
    this.now(); // tick a cada 1s
    return kocIsExpired(clock, this.now()) ? 'TEMPO!' : kocRemainingLabel(clock, this.now());
  });

  private readonly live = signal<LiveMatch | null>(null);
  protected readonly liveLoaded = signal(false);
  private readonly events = signal<LivePointEvent[]>([]);
  private readonly now = signal(Date.now());

  protected readonly saving = signal(false);
  protected readonly busyKey = signal<string | null>(null);
  protected readonly feedback = signal<{ ok: boolean; message: string } | null>(null);
  protected readonly confirmingRevert = signal(false);
  protected readonly revertError = signal<string | null>(null);

  /** Nomes dos DOIS atletas de cada dupla, na ordem de `player1Id`/`player2Id` — é essa ordem
   *  que o doc da partida usa pra dizer quem está sacando (ver `serving-player.ts`). O cache de
   *  rótulos do contexto só traz o nome da dupla inteira, então a mesa hidrata os atletas. */
  private readonly playersByTeam = signal<ReadonlyMap<string, readonly [string, string]>>(new Map());
  private readonly hydratedTeams = new Set<string>();

  protected readonly medicalPickerOpen = signal(false);

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

    // Os nomes dos atletas chegam depois do doc: a mesa abre com "Atleta 1/2" e troca sozinha.
    effect(() => {
      const m = this.live();
      if (!m) return;
      void this.hydratePlayers([m.teamAId, m.teamBId]);
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

  protected readonly SIDES = ['A', 'B'] as const;

  protected sideLabel(side: 'A' | 'B'): string {
    return side === 'A' ? this.teamALabel() : this.teamBLabel();
  }

  private async hydratePlayers(teamIds: readonly string[]): Promise<void> {
    const ids = teamIds.filter((id) => id.length > 0 && !this.hydratedTeams.has(id));
    if (ids.length === 0) return;
    for (const id of ids) this.hydratedTeams.add(id);
    const projectId = environment.firebase.projectId;
    if (!projectId) return;
    try {
      const db = organizerFirestore();
      const teams = await fetchTeamsByIds(db, projectId, ids);
      const names = await fetchProfileNames(db, [...teams.values()].flatMap((t) => [t.player1Id, t.player2Id]));
      this.playersByTeam.update((current) => {
        const next = new Map(current);
        for (const [teamId, team] of teams) next.set(teamId, [names.get(team.player1Id) ?? '', names.get(team.player2Id) ?? '']);
        return next;
      });
    } catch {
      // Sem nome a mesa ainda funciona (mostra "Atleta 1/2") — libera pra tentar de novo.
      for (const id of ids) this.hydratedTeams.delete(id);
    }
  }

  /** Nome do atleta pela POSIÇÃO na dupla (1 ou 2). Cai em "Atleta N" enquanto o join não
   *  chegou ou o perfil não tem nome — o que importa na mesa é a posição, que é o que o doc
   *  guarda. */
  protected playerName(side: MatchSide, slot: 1 | 2): string {
    const m = this.match();
    const teamId = side === 'A' ? m?.teamAId : m?.teamBId;
    const pair = teamId ? this.playersByTeam().get(teamId) : undefined;
    const name = pair?.[slot - 1]?.trim() ?? '';
    return name || `Atleta ${slot}`;
  }

  protected readonly servingPlayerSlot = computed(() => this.match()?.servingPlayerSlot ?? 0);

  /** "SAQUE" ou "SAQUE · BRUNO" — primeiro nome só, pra caber no selo do painel. */
  protected readonly serveBadge = computed(() => {
    const side = this.servingSide();
    const slot = this.servingPlayerSlot();
    if (side == null || (slot !== 1 && slot !== 2)) return 'SAQUE';
    const first = this.playerName(side, slot).split(/\s+/)[0] ?? '';
    return first ? `SAQUE · ${first.toUpperCase()}` : 'SAQUE';
  });

  /** A faixa "Quem saca por…?" — mesma regra (`needsServingPlayer`) das outras duas mesas. */
  protected readonly askingServingPlayer = computed<{ teamLabel: string; players: { slot: 1 | 2; playerName: string }[] } | null>(() => {
    const m = this.match();
    const side = this.servingSide();
    if (!m || side == null) return null;
    if (!needsServingPlayer({ servingTeamId: m.servingTeamId, servingPlayerSlot: m.servingPlayerSlot, status: m.status, teamAId: m.teamAId, teamBId: m.teamBId })) return null;
    return {
      teamLabel: this.sideLabel(side),
      players: ([1, 2] as const).map((slot) => ({ slot, playerName: this.playerName(side, slot) })),
    };
  });

  /** Os quatro atletas da partida, com a cota de atendimento de cada um. */
  protected readonly medicalOptions = computed<MedicalOptionView[]>(() => {
    const m = this.match();
    if (!m) return [];
    return (['A', 'B'] as const).flatMap((side) =>
      ([1, 2] as const).map((slot) => ({
        side,
        slot,
        playerName: this.playerName(side, slot),
        teamLabel: this.sideLabel(side),
        used: hasUsedMedicalTimeout(m.medicalTimeoutPlayers, side, slot),
      })),
    );
  });

  protected readonly canOpenMedical = computed(() => this.match()?.medicalTimeout == null && this.medicalOptions().some((o) => !o.used));

  /** O atendimento em andamento — a contagem é DERIVADA de `startedAt`, o `now` de 1 s só
   *  repinta. */
  protected readonly medical = computed<{ playerName: string; teamLabel: string; clock: string; ended: boolean } | null>(() => {
    const m = this.match();
    const active = m?.medicalTimeout;
    if (!m || !active) return null;
    const remaining = medicalTimeoutRemainingSeconds(active, new Date(this.now()));
    return {
      playerName: active.playerName || this.playerName(active.side, active.playerSlot),
      teamLabel: this.sideLabel(active.side),
      clock: formatMedicalTimeoutMmSs(remaining),
      ended: remaining <= 0,
    };
  });

  /** A pergunta de abertura do saque — mesma regra (`needsStartingServe`) da mesa do portal do
   *  atleta e da mesa I1 do app, pra que as três perguntem na mesma janela. */
  protected readonly askingServe = computed(() => {
    const m = this.match();
    if (!m) return false;
    return needsStartingServe({ servingTeamId: m.servingTeamId, status: m.status, teamAId: m.teamAId, teamBId: m.teamBId });
  });

  /** Atendimento em andamento PARA a partida: nada de ponto ou desfazer enquanto ele roda —
   *  nas três mesas, porque a guarda sai do doc, não da tela. */
  protected readonly canScore = computed(() => !this.saving() && this.status() === 'in_progress' && this.teamsReady() && this.match()?.medicalTimeout == null);

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
    const m = this.match();
    if (m && this.isKingOfCourt()) {
      const phase = kocPhaseLabel(m.matchType, m.matchNumber);
      return m.status === 'completed' ? `${phase} · Final` : phase;
    }
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
   *  evento `point`. O ponto final grava Completed+winnerId (avanço automático no servidor).
   *
   *  O placar sai do doc lido DENTRO da transação (`buildPointWrite`), não do snapshot da tela:
   *  o listener só recebe a versão nova depois da transação resolver, e dois toques dentro
   *  dessa janela gravavam o mesmo placar duas vezes. */
  protected async point(side: 'A' | 'B'): Promise<void> {
    const m = this.match();
    if (!m || !this.canScore()) return;

    this.saving.set(true);
    this.feedback.set(null);
    try {
      const written = await recordPointTransaction(this.scoring, { matchId: m.id, build: (fresh) => buildPointWrite(fresh, side) });
      const winnerId = written?.result.winnerId ?? null;
      if (winnerId != null) {
        this.feedback.set({ ok: true, message: `Partida encerrada — vitória de ${winnerId === m.teamAId ? this.teamALabel() : this.teamBLabel()}. A chave avança automaticamente.` });
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

    this.saving.set(true);
    this.busyKey.set('undo');
    this.feedback.set(null);
    try {
      await recordPointTransaction(this.scoring, { matchId: m.id, build: (fresh) => buildUndoWrite(fresh, side, last.setIndex) });
    } catch (e) {
      this.feedback.set({ ok: false, message: (e as Error).message || 'Falha ao desfazer o ponto.' });
    } finally {
      this.saving.set(false);
      this.busyKey.set(null);
    }
  }

  /** Abre o saque na dupla escolhida. Não inicia a partida nem marca ponto: grava só o campo,
   *  como o "Trocar saque" — daí em diante o rally resolve sozinho. */
  protected async chooseServe(side: 'A' | 'B'): Promise<void> {
    const m = this.match();
    if (!m || this.saving() || !this.askingServe()) return;
    const teamId = side === 'A' ? m.teamAId : m.teamBId;
    if (!teamId) return;
    this.saving.set(true);
    try {
      await updateMatchFields(this.scoring, m.id, servingTeamFields(m, teamId));
    } catch (e) {
      this.feedback.set({ ok: false, message: (e as Error).message || 'Falha ao definir quem começa sacando.' });
    } finally {
      this.saving.set(false);
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
      await updateMatchFields(this.scoring, m.id, servingTeamFields(m, next));
    } catch (e) {
      this.feedback.set({ ok: false, message: (e as Error).message || 'Falha ao trocar o saque.' });
    } finally {
      this.saving.set(false);
    }
  }

  /** Declara qual atleta da dupla no saque vai à linha. Daí em diante o rodízio resolve sozinho
   *  a cada virada de saque — espelha `_chooseServingPlayer` da mesa do app. */
  protected async chooseServingPlayer(slot: 1 | 2): Promise<void> {
    const m = this.match();
    const side = this.servingSide();
    if (!m || side == null || this.saving() || m.status === 'completed') return;
    this.saving.set(true);
    try {
      await updateMatchFields(this.scoring, m.id, servingPlayerFields(m, side, slot));
    } catch (e) {
      this.feedback.set({ ok: false, message: (e as Error).message || 'Falha ao definir o sacador.' });
    } finally {
      this.saving.set(false);
    }
  }

  /** Troca o sacador DENTRO da dupla no saque — o conserto de mão pro caso em que o rodízio
   *  saiu do lugar (um desfazer que caiu numa virada de saque, por exemplo). */
  protected async swapServingPlayer(): Promise<void> {
    const slot = this.servingPlayerSlot();
    if (slot !== 1 && slot !== 2) return;
    await this.chooseServingPlayer(slot === 1 ? 2 : 1);
  }

  protected openMedicalPicker(): void {
    if (!this.canOpenMedical()) return;
    this.medicalPickerOpen.set(true);
  }

  protected cancelMedicalPicker(): void {
    this.medicalPickerOpen.set(false);
  }

  /** Abre o atendimento no doc: a partida PARA em todas as superfícies e a cota daquele atleta
   *  some. Passa pela transação do ponto porque o chamado também vira evento na timeline — é o
   *  que sobra de auditoria depois que o atendimento termina e o campo sai do doc. */
  protected async startMedical(option: MedicalOptionView): Promise<void> {
    const m = this.match();
    if (!m || this.saving() || option.used) return;
    this.medicalPickerOpen.set(false);
    this.saving.set(true);
    this.feedback.set(null);
    try {
      const written = await recordPointTransaction(this.scoring, {
        matchId: m.id,
        build: (fresh) => buildMedicalTimeoutStartWrite(fresh, { side: option.side, playerSlot: option.slot, playerName: option.playerName }),
      });
      if (written == null) this.feedback.set({ ok: false, message: 'Não foi possível abrir o tempo médico — o atleta já usou o dele nesta partida.' });
    } catch (e) {
      this.feedback.set({ ok: false, message: (e as Error).message || 'Falha ao abrir o tempo médico.' });
    } finally {
      this.saving.set(false);
    }
  }

  /** Encerra o atendimento (com ou sem os 5 minutos cheios). A cota do atleta NÃO volta. */
  protected async endMedical(): Promise<void> {
    const m = this.match();
    if (!m || this.saving()) return;
    this.saving.set(true);
    try {
      await recordPointTransaction(this.scoring, { matchId: m.id, build: buildMedicalTimeoutEndWrite });
    } catch (e) {
      this.feedback.set({ ok: false, message: (e as Error).message || 'Falha ao encerrar o tempo médico.' });
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
