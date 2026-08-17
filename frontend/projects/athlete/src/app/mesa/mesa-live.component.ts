import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { deleteField, serverTimestamp } from 'firebase/firestore';
import { map } from 'rxjs';
import {
  applyBestOfChange,
  applyPoint,
  canReduceBestOf,
  elapsedSecondsFromStart,
  lastUndoablePoint,
  liveSetToMap,
  matchWinnerSide,
  needsStartingServe,
  setsWonOf,
  undoPoint,
  validateScoreSubmission,
  type LiveMatch,
  type LivePointEvent,
  type MatchDisplayStatus,
  type ScoreSet,
} from '@nexago/live-scoring';
import { NxPageLoadingComponent } from '../shared/loading/nx-page-loading.component';
import { NxSpinnerComponent } from '../shared/loading/nx-spinner.component';
import {
  bestOfLabelOf,
  courtLabelOf,
  currentSetIndexOf,
  currentSetOf,
  elapsedLabelOf,
  flagOf,
  phaseLabelOf,
  scoreText,
  setPillsOf,
  setRuleLineOf,
  type MesaSetPill,
  type MesaSide,
} from './mesa-board';
import { EMPTY_HEADER, MesaLiveGateway, type MesaHeaderInfo } from './mesa-live.gateway';
import { EMPTY_TEAM_NAMES, teamLabelOf, type MesaTeamNames } from './mesa-team-names';

const STATUS_LABEL: Record<MatchDisplayStatus, string> = { scheduled: 'Agendada', in_progress: 'Ao vivo', completed: 'Encerrada', canceled: 'Cancelada' };

const TIME = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

interface FeedRowView {
  key: string;
  time: string;
  label: string;
  score: string;
  undo: boolean;
}

/** Mesa ao vivo do mesário — placar de quadra, não formulário: a tela inteira são os dois
 *  painéis, toque em qualquer lugar do painel marca o ponto, e o número cresce com a janela
 *  (unidades de container) porque em parte dos eventos ESTA tela fica virada para os atletas,
 *  no celular ou no tablet. O modo exibição tira cabeçalho e ferramentas e deixa só o placar,
 *  em retrato ou paisagem.
 *
 *  As escritas são as MESMAS da mesa do organizador (`mesa-ao-vivo.component.ts`) e da mesa I1
 *  do app, pelo motor compartilhado `@nexago/live-scoring`: cada ponto roda a transação com
 *  `sets`/`currentSetIndex`/`status`/saque + evento em `pointEvents`, o START passa por
 *  `updateLiveMatchScore` zerado e o ponto final grava Completed + winnerId (o avanço da chave
 *  é do servidor). O SET FECHA SOZINHO quando o placar valida — mesma regra das outras duas
 *  superfícies, decisão do dono ao portar este desenho; não há "fechar set" manual.
 *
 *  Quem pode: rules (`canScoreTournament` + `scorerCanOnlyEditScoreFields`) e
 *  `assertCanScoreTournament` nos callables — dono, gestor e mesário.
 *
 *  Fora da tela de propósito: sanção, atendimento médico e súmula existem no protótipo mas não
 *  têm nada no backend — botão que só abre explicação é pior que ausência numa mesa. */
@Component({
  selector: 'app-mesa-live',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NxPageLoadingComponent, NxSpinnerComponent],
  host: { '[class.mesa-present]': 'present()', '[class.mesa-asking]': 'askingServe()' },
  template: `
    @if (!loaded()) {
      <div class="mesa-state"><app-nx-page-loading title="Carregando partida…" subtitle="Conectando à mesa ao vivo" /></div>
    } @else if (!match()) {
      <div class="mesa-state">
        <p class="mesa-state-title">Partida não encontrada</p>
        <p class="mesa-state-sub">Abra pela lista de partidas do torneio.</p>
        <a class="mesa-btn" [routerLink]="['/mesa', tournamentId()]">Voltar</a>
      </div>
    } @else if (!teamsReady()) {
      <div class="mesa-state">
        <p class="mesa-state-title">Aguardando as duas duplas</p>
        <p class="mesa-state-sub">A mesa só abre quando os dois lados da partida estiverem definidos na chave.</p>
        <a class="mesa-btn" [routerLink]="['/mesa', tournamentId()]">Voltar</a>
      </div>
    } @else {
      <header class="mesa-top">
        <a class="mesa-ico" [routerLink]="['/mesa', tournamentId()]" aria-label="Voltar para as partidas">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
        </a>
        <div class="mesa-meta">
          <div class="mesa-eyebrow">{{ eyebrow() }}</div>
          <div class="mesa-place">{{ placeLine() }}</div>
        </div>
        <span class="mesa-chip" [attr.data-state]="status()">
          @if (status() === 'in_progress') {
            <span class="mesa-dot"></span>{{ elapsed() }}
          } @else {
            {{ statusLabel() }}
          }
        </span>
        <button type="button" class="mesa-ico" (click)="enterPresent()" aria-label="Modo exibição para os atletas">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
        </button>
      </header>

      <div class="mesa-sets">
        @for (pill of setPills(); track pill.label) {
          <span class="mesa-pill" [attr.data-state]="pill.state"><b>{{ pill.label }}</b>{{ pill.score ?? '—' }}</span>
        }
        <span class="mesa-grow"></span>
        <button type="button" class="mesa-chip mesa-chip--tap" [disabled]="saving() || status() === 'completed'" (click)="toggleFormat()">{{ bestOfLabel() }}</button>
      </div>

      @if (askingServe()) {
        <div class="mesa-ask">
          <span class="mesa-eyebrow">Quem começa sacando?</span>
          @for (side of sidesInOrder(); track side) {
            <button
              type="button"
              class="mesa-askbtn"
              [disabled]="saving()"
              [attr.aria-label]="'Saque inicial para ' + label(side)"
              (click)="chooseServe(side)"
            >
              <span class="mesa-badge">{{ side }}</span>{{ label(side) }}
            </button>
          }
        </div>
      }

      @for (side of sidesInOrder(); track side) {
        <!-- O −1 é irmão do painel, não filho: botão dentro de botão é HTML inválido, e o toque
             no painel inteiro é o alvo do ponto. -->
        <div class="mesa-sidewrap" [attr.data-team]="side" [class.mesa-sidewrap--first]="$first" [class.mesa-side--serving]="servingSide() === side">
          <button
            type="button"
            class="mesa-side"
            [class.mesa-side--bump]="bumped() === side"
            [disabled]="!canScore()"
            [attr.aria-label]="'Ponto para ' + label(side)"
            (click)="point(side)"
          >
            <span class="mesa-uni"></span>
            <span class="mesa-team">
              <span class="mesa-badge">{{ side }}</span>
              <span class="mesa-nm" [title]="label(side)">{{ label(side) }}</span>
              @if (flag(side); as f) {
                <span class="mesa-flag">{{ f === 'match' ? 'MATCH POINT' : 'SET POINT' }}</span>
              }
              @if (servingSide() === side) {
                <span class="mesa-chip mesa-chip--acc">SAQUE</span>
              }
            </span>
            <span class="mesa-num">{{ points(side) }}</span>
            <span class="mesa-foot">
              <span class="mesa-to">
                <b>tempo</b>
                @for (i of timeoutSlots; track i) {
                  <i [class.used]="timeouts()[side] > i"></i>
                }
              </span>
              @if (canScore()) {
                <span class="mesa-tapcue">toque = ponto</span>
              }
            </span>
          </button>
          <button
            type="button"
            class="mesa-minus"
            [disabled]="!canUndoSide(side)"
            [attr.aria-label]="'Desfazer ponto de ' + label(side)"
            (click)="undoSide(side)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14" /></svg>
          </button>
        </div>

        @if ($first) {
          <div class="mesa-mid">
            <a class="mesa-midctl" [routerLink]="['/mesa', tournamentId()]" aria-label="Voltar para as partidas">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
            </a>
            <div class="mesa-setsw">
              <span [class.lo]="wins().a < wins().b">{{ wins().a }}</span>
              <span class="d">·</span>
              <span [class.lo]="wins().b < wins().a">{{ wins().b }}</span>
            </div>
            <div class="mesa-midmeta">
              <div class="mesa-eyebrow">sets</div>
              <div class="mesa-midline">{{ midLine() }}</div>
            </div>
            @switch (status()) {
              @case ('scheduled') {
                <button type="button" class="mesa-midbtn mesa-midbtn--primary" [disabled]="saving()" (click)="start()">
                  @if (busyKey() === 'start') {
                    <app-nx-spinner [size]="13" tone="dark" />
                  }
                  {{ busyKey() === 'start' ? 'Iniciando…' : 'Iniciar partida' }}
                </button>
              }
              @case ('completed') {
                <button type="button" class="mesa-midbtn" [disabled]="saving()" (click)="validate()">
                  @if (busyKey() === 'validate') {
                    <app-nx-spinner [size]="12" />
                  }
                  {{ busyKey() === 'validate' ? 'Validando…' : 'Validar' }}
                </button>
              }
              @default {
                <button type="button" class="mesa-midbtn" [disabled]="saving() || lastPoint() === null" (click)="undoLast()">
                  @if (busyKey() === 'undo') {
                    <app-nx-spinner [size]="12" />
                  }
                  Desfazer
                </button>
              }
            }
            <button type="button" class="mesa-midctl" (click)="exitPresent()" aria-label="Sair do modo exibição">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
        }
      }

      <div class="mesa-tools">
        <button type="button" class="mesa-tool" [disabled]="saving() || status() === 'completed'" (click)="swapServe()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8" /><path d="M4.5 9.5c5 .5 9 3 11.5 7M9.5 4.5c.5 5 3 9 7 11.5" /></svg>
          Saque
        </button>
        <button type="button" class="mesa-tool" (click)="swapSides()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 4 3 8l4 4" /><path d="M3 8h13" /><path d="M17 20l4-4-4-4" /><path d="M21 16H8" /></svg>
          Quadra
        </button>
        <button type="button" class="mesa-tool" (click)="addTimeout()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>
          Tempo
        </button>
        <button type="button" class="mesa-tool" (click)="openScoreSheet()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 3h9l4 4v14H6z" /><path d="M9 12h7M9 16h5" /></svg>
          Placar
        </button>
      </div>

      @if (feedback(); as fb) {
        <div class="mesa-banner" [class.ok]="fb.ok" role="status" (click)="feedback.set(null)">{{ fb.message }}</div>
      }

      @if (sheetOpen()) {
        <div class="mesa-scrim" (click)="closeSheet()">
          <div class="mesa-sheet" (click)="$event.stopPropagation()">
            <div>
              <div class="mesa-eyebrow" style="color: var(--nx-orange-400)">mesa · placar por sets</div>
              <h3>Lançar ou corrigir o resultado</h3>
            </div>
            <p class="mesa-note">Para a partida que já aconteceu na areia, sem marcar ponto a ponto. O servidor revalida antes de gravar.</p>

            <div class="mesa-quick">
              @for (set of quickSets(); track $index) {
                <div class="mesa-quick-row">
                  <span class="mesa-eyebrow">Set {{ $index + 1 }}</span>
                  <input
                    class="mesa-input"
                    type="number"
                    inputmode="numeric"
                    min="0"
                    max="99"
                    [attr.aria-label]="'Pontos de ' + label('A') + ' no set ' + ($index + 1)"
                    [value]="set.a"
                    (input)="updateQuickSet($index, 'a', $event)"
                  />
                  <span class="mesa-quick-x">×</span>
                  <input
                    class="mesa-input"
                    type="number"
                    inputmode="numeric"
                    min="0"
                    max="99"
                    [attr.aria-label]="'Pontos de ' + label('B') + ' no set ' + ($index + 1)"
                    [value]="set.b"
                    (input)="updateQuickSet($index, 'b', $event)"
                  />
                  <button type="button" class="mesa-quick-del" [disabled]="saving()" (click)="removeQuickSet($index)" aria-label="Remover set">×</button>
                </div>
              }

              @if (quickIssues().length > 0) {
                <ul class="mesa-issues">
                  @for (issue of quickIssues(); track issue.message) {
                    <li>{{ issue.message }}</li>
                  }
                </ul>
              }
            </div>

            <div class="mesa-sheetbtns">
              <button type="button" class="mesa-btn" [disabled]="saving() || quickSets().length >= bestOf()" (click)="addQuickSet()">Adicionar set</button>
              <button type="button" class="mesa-btn mesa-btn--go" [disabled]="saving() || !canSubmitQuick()" (click)="saveQuick()">
                @if (busyKey() === 'quick') {
                  <app-nx-spinner [size]="13" tone="dark" />
                }
                {{ busyKey() === 'quick' ? 'Salvando…' : 'Salvar placar' }}
              </button>
            </div>

            @if (feed().length > 0) {
              <div>
                <div class="mesa-eyebrow">últimos lances</div>
                <ul class="mesa-feed">
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
          </div>
        </div>
      }
    }
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      display: grid;
      grid-template-rows: auto auto 1fr auto 1fr auto;
      /* O placar dimensiona por unidades de container (cqh/cqw): é o que faz o número encher a
         tela em qualquer aparelho, do celular em pé ao tablet deitado. */
      container-type: size;
      background: var(--nx-bg);
      color: var(--nx-text);
      overflow: hidden;
      overscroll-behavior: none;
    }
    /* A pergunta do saque entra como uma linha própria, entre os sets e o painel de cima. Fica
       ANTES do bloco do modo exibição de propósito: as duas regras têm a mesma especificidade e
       ali o layout de exibição (1fr auto 1fr) tem que ganhar por ordem. */
    :host(.mesa-asking) {
      grid-template-rows: auto auto auto 1fr auto 1fr auto;
    }

    .mesa-ask {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      background: var(--nx-orange-tint);
      border-bottom: 1px solid rgba(255, 106, 26, 0.32);
      overflow-x: auto;
      scrollbar-width: none;
      min-width: 0;
    }
    .mesa-ask::-webkit-scrollbar {
      display: none;
    }
    .mesa-ask .mesa-eyebrow {
      color: var(--nx-orange-400);
      flex-shrink: 0;
    }
    /* Alvo de mesário na areia: 40px de altura mesmo numa faixa temporária. */
    .mesa-askbtn {
      display: flex;
      align-items: center;
      gap: 7px;
      min-height: 40px;
      padding: 0 12px;
      border-radius: 9px;
      border: 1px solid rgba(255, 106, 26, 0.42);
      background: var(--nx-surface-0);
      color: var(--nx-text);
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13px;
      white-space: nowrap;
      flex-shrink: 0;
      cursor: pointer;
    }
    .mesa-askbtn:active {
      background: var(--nx-orange-tint);
    }
    .mesa-askbtn:disabled {
      opacity: 0.5;
      pointer-events: none;
    }

    .mesa-state {
      grid-row: 1 / -1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 32px 24px;
      text-align: center;
    }
    .mesa-state-title {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 18px;
      margin: 0;
    }
    .mesa-state-sub {
      font-size: 13px;
      color: var(--nx-text-mute);
      margin: 0 0 8px;
      max-width: 32ch;
    }

    /* ── cabeçalho ── */
    .mesa-top {
      display: flex;
      align-items: center;
      gap: 9px;
      padding: calc(10px + env(safe-area-inset-top)) 14px 8px;
      background: var(--nx-surface-0);
      border-bottom: 1px solid var(--nx-line);
      min-width: 0;
    }
    .mesa-meta {
      min-width: 0;
      flex: 1;
    }
    .mesa-eyebrow {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 9.5px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .mesa-place {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 12px;
      letter-spacing: -0.01em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .mesa-ico {
      width: 34px;
      height: 34px;
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-line-strong);
      background: transparent;
      display: grid;
      place-items: center;
      color: var(--nx-text-mute);
      flex-shrink: 0;
      cursor: pointer;
    }
    .mesa-ico:active {
      background: rgba(255, 255, 255, 0.06);
    }

    .mesa-chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      height: 23px;
      padding: 0 8px;
      border-radius: 7px;
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 10px;
      letter-spacing: 0.06em;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--nx-line-strong);
      color: var(--nx-text-mute);
      white-space: nowrap;
      flex-shrink: 0;
    }
    .mesa-chip[data-state='in_progress'] {
      background: rgba(255, 59, 48, 0.14);
      border-color: rgba(255, 59, 48, 0.34);
      color: #ff6259;
    }
    .mesa-chip--acc {
      background: var(--nx-orange-tint);
      border-color: rgba(255, 106, 26, 0.34);
      color: var(--nx-orange-400);
    }
    .mesa-chip--tap {
      cursor: pointer;
    }
    .mesa-chip--tap:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .mesa-dot {
      width: 6px;
      height: 6px;
      border-radius: var(--nx-r-pill);
      background: currentColor;
      animation: mesa-pulse 1.6s ease-in-out infinite;
    }
    @keyframes mesa-pulse {
      50% {
        opacity: 0.35;
      }
    }

    /* ── barra de sets ── */
    .mesa-sets {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      background: var(--nx-surface-0);
      border-bottom: 1px solid var(--nx-line);
      overflow-x: auto;
      scrollbar-width: none;
      min-width: 0;
    }
    .mesa-sets::-webkit-scrollbar {
      display: none;
    }
    .mesa-grow {
      flex: 1;
    }
    .mesa-pill {
      display: flex;
      align-items: baseline;
      gap: 5px;
      padding: 4px 9px;
      border-radius: 7px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--nx-line);
      font-family: var(--nx-font-mono);
      font-size: 11.5px;
      font-weight: 800;
      color: var(--nx-text-mute);
      white-space: nowrap;
      flex-shrink: 0;
    }
    .mesa-pill b {
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .mesa-pill[data-state='current'] {
      background: var(--nx-orange-tint);
      border-color: rgba(255, 106, 26, 0.32);
      color: var(--nx-text);
    }
    .mesa-pill[data-state='current'] b {
      color: var(--nx-orange-400);
    }
    .mesa-pill[data-state='upcoming'] {
      opacity: 0.45;
    }

    /* ── painel da dupla ── */
    .mesa-sidewrap {
      position: relative;
      min-width: 0;
      min-height: 0;
      display: grid;
      /* O número é medido POR ESTE PAINEL, não pela janela: medido pela janela ele passava da
         altura da linha em tela baixa (desktop, celular deitado) e saía cortado. */
      container-type: size;
    }
    .mesa-side {
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      /* Linhas fixas nas pontas e o número no meio absorvendo a folga: em painel baixo é o
         número que encolhe, nunca a linha do nome ou o rodapé que somem por baixo. */
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      align-items: center;
      justify-items: center;
      gap: 4px;
      padding: 12px 14px 10px;
      background: var(--nx-surface-0);
      border: none;
      color: inherit;
      cursor: pointer;
      transition: background var(--nx-d-fast) var(--nx-ease-out);
    }
    .mesa-side:disabled {
      cursor: default;
    }
    .mesa-side:not(:disabled):active {
      background: var(--nx-surface-1);
    }
    .mesa-side--serving .mesa-side {
      background: linear-gradient(180deg, rgba(255, 106, 26, 0.14), var(--nx-surface-0) 66%);
      box-shadow: inset 0 0 0 1.5px rgba(255, 106, 26, 0.3);
    }
    .mesa-uni {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 4px;
      background: var(--nx-orange-500);
    }
    .mesa-sidewrap[data-team='A'] .mesa-uni {
      background: #2f6bff;
    }
    .mesa-team {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      min-width: 0;
    }
    .mesa-badge {
      width: 22px;
      height: 22px;
      border-radius: 6px;
      display: grid;
      place-items: center;
      font-family: var(--nx-font-mono);
      font-weight: 800;
      font-size: 11px;
      color: #fff;
      background: var(--nx-orange-500);
      flex-shrink: 0;
    }
    .mesa-sidewrap[data-team='A'] .mesa-badge {
      background: #2f6bff;
    }
    .mesa-nm {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 15px;
      letter-spacing: -0.02em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
      min-width: 0;
      text-align: left;
    }
    .mesa-num {
      font-family: var(--nx-font-mono);
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      line-height: 0.82;
      letter-spacing: -0.06em;
      font-size: min(58cqh, 34cqw);
      text-shadow: 0 12px 50px rgba(0, 0, 0, 0.6);
    }
    .mesa-side--serving .mesa-num {
      color: #fff;
      text-shadow: 0 0 60px rgba(255, 106, 26, 0.3);
    }
    .mesa-side--bump .mesa-num {
      animation: mesa-bump 0.22s var(--nx-ease-spring, cubic-bezier(0.34, 1.56, 0.64, 1));
    }
    @keyframes mesa-bump {
      0% {
        transform: scale(1);
      }
      45% {
        transform: scale(1.08);
      }
      100% {
        transform: scale(1);
      }
    }
    .mesa-foot {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      min-height: 32px;
      align-self: end;
      /* espaço do −1, que flutua por cima */
      padding-right: 64px;
    }
    .mesa-to {
      display: flex;
      gap: 4px;
      align-items: center;
    }
    .mesa-to b {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 9.5px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-right: 3px;
    }
    .mesa-to i {
      width: 8px;
      height: 8px;
      border-radius: var(--nx-r-pill);
      background: rgba(255, 255, 255, 0.14);
      display: block;
    }
    .mesa-to i.used {
      background: var(--nx-pending);
    }
    .mesa-tapcue {
      margin-left: auto;
      font-family: var(--nx-font-mono);
      font-size: 8.5px;
      letter-spacing: 0.13em;
      text-transform: uppercase;
      color: rgba(244, 244, 245, 0.2);
    }
    .mesa-minus {
      position: absolute;
      right: 14px;
      bottom: 10px;
      z-index: 5;
      width: 52px;
      height: 32px;
      border-radius: 9px;
      border: 1px solid var(--nx-line-strong);
      background: var(--nx-surface-1);
      display: grid;
      place-items: center;
      color: var(--nx-text-mute);
      cursor: pointer;
    }
    .mesa-minus:active {
      background: rgba(255, 255, 255, 0.07);
    }
    .mesa-minus:disabled {
      opacity: 0.35;
      pointer-events: none;
    }
    /* Na própria linha da dupla, não flutuando no canto: sobreposta ao selo de SAQUE ela
       aparecia exatamente no momento em que mais importa (set/match point de quem saca). */
    .mesa-flag {
      display: flex;
      align-items: center;
      flex-shrink: 0;
      padding: 5px 10px;
      border-radius: 8px;
      background: rgba(255, 106, 26, 0.16);
      border: 1px solid rgba(255, 106, 26, 0.4);
      font-family: var(--nx-font-mono);
      font-weight: 800;
      font-size: 9.5px;
      letter-spacing: 0.12em;
      color: var(--nx-orange-400);
      white-space: nowrap;
      z-index: 12;
    }

    /* ── faixa central ── */
    .mesa-mid {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      background: var(--nx-bg);
      border-top: 1px solid var(--nx-line);
      border-bottom: 1px solid var(--nx-line);
      min-width: 0;
    }
    .mesa-setsw {
      display: flex;
      align-items: center;
      gap: 7px;
      font-family: var(--nx-font-mono);
      font-weight: 800;
      font-size: 24px;
      flex-shrink: 0;
    }
    .mesa-setsw .d {
      color: rgba(244, 244, 245, 0.22);
      font-size: 0.7em;
    }
    .mesa-setsw .lo {
      color: var(--nx-text-mute);
    }
    .mesa-midmeta {
      min-width: 0;
      flex-shrink: 1;
      overflow: hidden;
    }
    .mesa-midline {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 9.5px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-mute);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .mesa-midbtn {
      height: 40px;
      border-radius: 11px;
      border: 1px solid var(--nx-line-strong);
      background: transparent;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 12px;
      color: var(--nx-text-mute);
      padding: 0 12px;
      flex: 1;
      min-width: 0;
      white-space: nowrap;
      cursor: pointer;
    }
    .mesa-midbtn:active {
      background: rgba(255, 255, 255, 0.06);
    }
    .mesa-midbtn--primary {
      background: var(--nx-orange-500);
      border-color: var(--nx-orange-500);
      color: var(--nx-text-on-orange);
      box-shadow: 0 8px 24px rgba(255, 106, 26, 0.3);
    }
    .mesa-midbtn:disabled {
      opacity: 0.4;
      pointer-events: none;
      box-shadow: none;
    }

    /* ── ferramentas ── */
    .mesa-tools {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
      padding: 10px 12px calc(12px + env(safe-area-inset-bottom));
      background: var(--nx-surface-0);
      border-top: 1px solid var(--nx-line);
    }
    .mesa-tool {
      height: 44px;
      border-radius: 11px;
      border: 1px solid var(--nx-line-strong);
      background: transparent;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 11.5px;
      color: var(--nx-text-mute);
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      cursor: pointer;
    }
    .mesa-tool:active {
      background: rgba(255, 255, 255, 0.06);
    }
    .mesa-tool:disabled {
      opacity: 0.4;
      pointer-events: none;
    }

    /* ── modo exibição (tela virada para os atletas) ── */
    /* Voltar e sair moram na FAIXA CENTRAL, não flutuando sobre os painéis: painel é alvo de
       ponto, e controle por cima dele vira ponto marcado sem querer (além de cobrir o selo de
       SAQUE, que foi como esta tela nasceu). */
    .mesa-midctl {
      display: none;
      width: 40px;
      height: 40px;
      flex: none;
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-line-strong);
      background: var(--nx-surface-1);
      place-items: center;
      color: var(--nx-text-mute);
      cursor: pointer;
    }
    .mesa-midctl:active {
      background: rgba(255, 255, 255, 0.07);
    }
    :host(.mesa-present) .mesa-midctl {
      display: grid;
    }
    :host(.mesa-present) {
      grid-template-rows: 1fr auto 1fr;
    }
    :host(.mesa-present) .mesa-top,
    :host(.mesa-present) .mesa-sets,
    :host(.mesa-present) .mesa-tools,
    :host(.mesa-present) .mesa-minus,
    :host(.mesa-present) .mesa-tapcue,
    :host(.mesa-present) .mesa-to,
    :host(.mesa-present) .mesa-midmeta {
      display: none;
    }
    /* Desfazer FICA: com a tela virada pros atletas, corrigir o ponto errado é a ação mais
       frequente da mesa — esconder obrigava a sair do modo exibição a cada engano. */
    :host(.mesa-present) .mesa-midbtn {
      flex: none;
      min-width: 116px;
    }
    :host(.mesa-present) .mesa-side {
      /* Sem o rodapé (escondido aqui), o space-between empurrava o número pro alto de um lado e
         pro meio do outro — a dupla que saca tem uma linha a mais de selo. */
      justify-content: center;
      gap: 10px;
    }
    :host(.mesa-present) .mesa-num {
      font-size: min(74cqh, 56cqw);
    }
    :host(.mesa-present) .mesa-nm {
      font-size: 19px;
      text-align: center;
      flex: 0 1 auto;
    }
    :host(.mesa-present) .mesa-team {
      justify-content: center;
    }
    /* Selo de set/match point + SAQUE + nome não cabem numa linha só no painel estreito: deixa
       quebrar, o nome continua sendo a primeira linha. */
    :host(.mesa-present) .mesa-team {
      flex-wrap: wrap;
      row-gap: 6px;
    }
    :host(.mesa-present) .mesa-nm {
      flex: 0 1 auto;
      max-width: 100%;
    }
    :host(.mesa-present) .mesa-mid {
      justify-content: space-between;
      gap: 12px;
      padding: 8px 12px calc(8px + env(safe-area-inset-bottom));
    }
    :host(.mesa-present) .mesa-setsw {
      flex: 1;
      justify-content: center;
    }
    /* Paisagem no modo exibição: duplas lado a lado, sets no meio — é como o tablet fica
       apoiado na mesa da quadra. Regra de MEDIA, não de container: o container é o próprio
       :host, e consulta de container só vale para os DESCENDENTES dele — nunca casaria. */
    @media (min-aspect-ratio: 1/1) {
      :host(.mesa-present) {
        grid-template-rows: 1fr;
        grid-template-columns: 1fr auto 1fr;
      }
      :host(.mesa-present) .mesa-mid {
        flex-direction: column;
        /* Coluna central lida como um bloco só (voltar · sets · regra · sair), não espalhada
           pelas pontas como no retrato. */
        justify-content: center;
        gap: 16px;
        border-top: none;
        border-bottom: none;
        border-left: 1px solid var(--nx-line);
        border-right: 1px solid var(--nx-line);
        padding: 12px 18px;
      }
      :host(.mesa-present) .mesa-midmeta {
        display: block;
        text-align: center;
      }
      :host(.mesa-present) .mesa-num {
        font-size: min(62cqh, 62cqw);
      }
      :host(.mesa-present) .mesa-setsw {
        flex: none;
      }
    }

    /* ── faixa de aviso ── */
    .mesa-banner {
      position: absolute;
      left: 12px;
      right: 12px;
      bottom: calc(12px + env(safe-area-inset-bottom));
      z-index: 50;
      border-radius: var(--nx-r-3);
      border: 1px solid var(--nx-line-strong);
      border-left: 3px solid var(--nx-live);
      background: var(--nx-surface-2);
      padding: 12px 14px;
      font-size: 13px;
      box-shadow: var(--nx-elev-2);
      cursor: pointer;
    }
    .mesa-banner.ok {
      border-left-color: var(--nx-win);
    }

    /* ── folha do placar por sets ── */
    .mesa-scrim {
      position: absolute;
      inset: 0;
      z-index: 60;
      background: rgba(5, 5, 5, 0.74);
      backdrop-filter: blur(3px);
      display: flex;
      align-items: flex-end;
      padding: 12px;
    }
    .mesa-sheet {
      width: 100%;
      max-height: 88cqh;
      overflow-y: auto;
      border-radius: 20px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line-strong);
      box-shadow: var(--nx-elev-3);
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .mesa-sheet h3 {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 18px;
      letter-spacing: -0.02em;
      margin: 6px 0 0;
    }
    .mesa-note {
      padding: 9px 12px;
      border-radius: var(--nx-r-2);
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--nx-line);
      font-size: 11.5px;
      color: var(--nx-text-mute);
      margin: 0;
    }
    .mesa-quick {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .mesa-quick-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .mesa-quick-row .mesa-eyebrow {
      width: 52px;
    }
    .mesa-quick-x {
      color: var(--nx-text-dim);
    }
    .mesa-input {
      width: 68px;
      height: 44px;
      text-align: center;
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-line-strong);
      background: var(--nx-surface-0);
      color: var(--nx-text);
      font-family: var(--nx-font-mono);
      font-weight: 800;
      font-size: 16px;
    }
    .mesa-quick-del {
      margin-left: auto;
      width: 34px;
      height: 34px;
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-line);
      background: transparent;
      color: var(--nx-text-dim);
      cursor: pointer;
    }
    .mesa-issues {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 12.5px;
      color: var(--nx-live);
    }
    .mesa-sheetbtns {
      display: flex;
      gap: 9px;
    }
    .mesa-btn {
      flex: 1;
      height: 46px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      border-radius: 12px;
      border: 1px solid var(--nx-line-strong);
      background: transparent;
      color: var(--nx-text);
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13px;
      text-decoration: none;
      cursor: pointer;
    }
    .mesa-btn--go {
      background: var(--nx-orange-500);
      border-color: var(--nx-orange-500);
      color: var(--nx-text-on-orange);
    }
    .mesa-btn:disabled {
      opacity: 0.4;
      pointer-events: none;
    }
    .mesa-feed {
      list-style: none;
      margin: 6px 0 0;
      padding: 0;
      display: flex;
      flex-direction: column;
    }
    .mesa-feed li {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 7px 2px;
      border-bottom: 1px solid var(--nx-line);
      font-size: 12.5px;
    }
    .mesa-feed li:last-child {
      border-bottom: none;
    }
    .mesa-feed li.undo {
      color: var(--nx-text-dim);
    }
    .mesa-feed .t {
      font-family: var(--nx-font-mono);
      font-size: 11px;
      color: var(--nx-text-dim);
      width: 44px;
    }
    .mesa-feed .l {
      flex: 1;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .mesa-feed .s {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 12px;
    }

    /* Tela larga (notebook, tablet deitado) FORA do modo exibição: a mesa foi desenhada em
       retrato e esticada vira uma faixa de nada com o placar perdido no meio. Mantém a coluna
       do desenho, centralizada; o modo exibição continua ocupando tudo, que é o ponto dele. */
    @media (min-width: 700px) {
      :host(:not(.mesa-present)) > * {
        width: min(520px, 100%);
        justify-self: center;
      }
      :host(:not(.mesa-present)) .mesa-sidewrap {
        border-left: 1px solid var(--nx-line);
        border-right: 1px solid var(--nx-line);
      }
    }

    /* Toque grosso (celular/tablet na quadra): o alvo do ponto é a tela toda, mas os controles
       pequenos também precisam caber no dedo. */
    @media (pointer: coarse) {
      .mesa-minus {
        width: 60px;
        height: 40px;
      }
      .mesa-tool {
        height: 48px;
      }
    }
  `,
})
export class MesaLiveComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly gateway = inject(MesaLiveGateway);

  protected readonly timeoutSlots = [0, 1] as const;

  protected readonly tournamentId = toSignal(this.route.paramMap.pipe(map((p) => p.get('tournamentId')?.trim() ?? '')), {
    initialValue: this.route.snapshot.paramMap.get('tournamentId')?.trim() ?? '',
  });
  protected readonly matchId = toSignal(this.route.paramMap.pipe(map((p) => p.get('matchId')?.trim() ?? '')), {
    initialValue: this.route.snapshot.paramMap.get('matchId')?.trim() ?? '',
  });

  private readonly live = signal<LiveMatch | null>(null);
  private readonly events = signal<LivePointEvent[]>([]);
  private readonly names = signal<MesaTeamNames>(EMPTY_TEAM_NAMES);
  private readonly headerInfo = signal<MesaHeaderInfo>(EMPTY_HEADER);
  private readonly now = signal(Date.now());
  protected readonly loaded = signal(false);

  protected readonly saving = signal(false);
  protected readonly busyKey = signal<string | null>(null);
  protected readonly feedback = signal<{ ok: boolean; message: string } | null>(null);

  /** Estado só da sessão: o doc não guarda tempo técnico nem de que lado a dupla está na
   *  quadra. Recarregar a página zera — o placar não, esse é do servidor. */
  protected readonly present = signal(false);
  protected readonly swapped = signal(false);
  protected readonly timeouts = signal<Record<MesaSide, number>>({ A: 0, B: 0 });
  protected readonly bumped = signal<MesaSide | null>(null);

  protected readonly sheetOpen = signal(false);
  protected readonly quickSets = signal<ScoreSet[]>([]);
  private hydratedQuickFor = '';
  private resolvedTeamIds = '';
  private resolvedHeaderFor = '';
  private lastScore: { a: number; b: number } | null = null;

  constructor() {
    // A mesa é dirigida pelo doc em tempo real: troca de matchId refaz as assinaturas.
    effect((onCleanup) => {
      const id = this.matchId();
      this.live.set(null);
      this.events.set([]);
      this.feedback.set(null);
      this.loaded.set(false);
      this.hydratedQuickFor = '';
      this.lastScore = null;
      if (!id || !this.gateway.available) {
        this.loaded.set(true);
        return;
      }
      const unsubMatch = this.gateway.watchMatch(
        id,
        (m) => {
          this.live.set(m);
          this.loaded.set(true);
          if (m) {
            void this.hydrateNames(m);
            void this.hydrateHeader(m);
          }
        },
        () => this.loaded.set(true),
      );
      const unsubEvents = this.gateway.watchEvents(id, (events) => this.events.set(events));
      onCleanup(() => {
        unsubMatch();
        unsubEvents();
      });
    });

    // Pulso do número: dispara pelo DOC (não pelo toque), então o ponto marcado na mesa do
    // organizador ou no app também acende aqui.
    effect(() => {
      const m = this.live();
      if (!m) return;
      const score = currentSetOf(m);
      const previous = this.lastScore;
      this.lastScore = score;
      if (!previous) return;
      const side: MesaSide | null = score.a !== previous.a ? 'A' : score.b !== previous.b ? 'B' : null;
      if (!side) return;
      this.bumped.set(side);
      const timer = setTimeout(() => this.bumped.set(null), 240);
      this.destroyRef.onDestroy(() => clearTimeout(timer));
    });

    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    this.destroyRef.onDestroy(() => clearInterval(timer));

    void this.keepScreenAwake();
  }

  /** Tablet apoiado na quadra não pode apagar a tela no meio do set. Sem suporte, segue a vida. */
  private async keepScreenAwake(): Promise<void> {
    const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } };
    if (!nav.wakeLock) return;
    try {
      const lock = await nav.wakeLock.request('screen');
      this.destroyRef.onDestroy(() => void lock.release().catch(() => undefined));
    } catch {
      // Aba em segundo plano ou navegador sem permissão — nada a fazer.
    }
  }

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

  private async hydrateHeader(m: LiveMatch): Promise<void> {
    const key = `${m.tournamentId}:${m.categoryId ?? ''}`;
    if (key === this.resolvedHeaderFor) return;
    this.resolvedHeaderFor = key;
    this.headerInfo.set(await this.gateway.header(m.tournamentId, m.categoryId));
  }

  protected readonly match = computed(() => this.live());
  protected readonly status = computed<MatchDisplayStatus>(() => this.match()?.status ?? 'scheduled');
  protected readonly statusLabel = computed(() => STATUS_LABEL[this.status()]);
  protected readonly bestOf = computed(() => this.match()?.bestOf ?? 3);
  protected readonly bestOfLabel = computed(() => bestOfLabelOf(this.bestOf()));

  protected readonly teamsReady = computed(() => {
    const m = this.match();
    return m != null && m.teamAId.length > 0 && m.teamBId.length > 0;
  });

  /** Ordem visual dos painéis — "Quadra" inverte os lados na tela, como as duplas trocam de
   *  lado na areia. Não toca no doc: A continua sendo A. */
  protected readonly sidesInOrder = computed<MesaSide[]>(() => (this.swapped() ? ['B', 'A'] : ['A', 'B']));

  protected label(side: MesaSide): string {
    const m = this.match();
    if (!m) return side === 'A' ? 'Dupla A' : 'Dupla B';
    return side === 'A' ? teamLabelOf(this.names(), m.teamAId, m.teamADescription) : teamLabelOf(this.names(), m.teamBId, m.teamBDescription);
  }

  protected points(side: MesaSide): string {
    const m = this.match();
    if (!m) return '00';
    const set = currentSetOf(m);
    return scoreText(side === 'A' ? set.a : set.b);
  }

  protected flag(side: MesaSide) {
    const m = this.match();
    return m ? flagOf(m, side) : null;
  }

  protected readonly winnerLabel = computed(() => {
    const m = this.match();
    if (!m?.winnerId) return '—';
    return m.winnerId === m.teamAId ? this.label('A') : this.label('B');
  });

  protected readonly wins = computed(() => {
    const m = this.match();
    return m ? setsWonOf(m.sets, m.bestOf) : { a: 0, b: 0 };
  });

  protected readonly setPills = computed<MesaSetPill[]>(() => {
    const m = this.match();
    return m ? setPillsOf(m) : [];
  });

  protected readonly eyebrow = computed(() => {
    const m = this.match();
    if (!m) return '';
    return [this.headerInfo().categoryName, phaseLabelOf(m)].filter((p): p is string => Boolean(p)).join(' · ');
  });

  /** Quadra e horário PRIMEIRO, torneio por último: é o que o mesário usa pra confirmar que
   *  está na partida certa, e num nome de torneio comprido o fim da linha é o que se perde. */
  protected readonly placeLine = computed(() => {
    const m = this.match();
    if (!m) return '';
    const parts = [courtLabelOf(m.courtName), m.scheduleTime ? TIME.format(m.scheduleTime) : null, this.headerInfo().tournamentName];
    return parts.filter((p): p is string => Boolean(p)).join(' · ');
  });

  /** Linha do meio: a regra do set enquanto joga, o vencedor quando acabou. */
  protected readonly midLine = computed(() => {
    const m = this.match();
    if (!m) return '';
    if (this.status() === 'completed') return `vitória de ${this.winnerLabel()}`;
    return setRuleLineOf(m);
  });

  protected readonly elapsed = computed(() => {
    const m = this.match();
    if (!m?.matchStartedAt) return '00:00';
    return elapsedLabelOf(elapsedSecondsFromStart(m.matchStartedAt, new Date(this.now())));
  });

  protected readonly servingSide = computed<MesaSide | null>(() => {
    const m = this.match();
    if (!m || !m.servingTeamId) return null;
    if (m.servingTeamId === m.teamAId) return 'A';
    if (m.servingTeamId === m.teamBId) return 'B';
    return null;
  });

  /** A pergunta de abertura do saque — regra em `needsStartingServe`, compartilhada com a mesa do
   *  organizador e a do app. Some no modo exibição: ali a tela está virada para os atletas e não
   *  aceita toque de mesário. */
  protected readonly askingServe = computed(() => {
    const m = this.match();
    if (!m || this.present()) return false;
    return needsStartingServe({ servingTeamId: m.servingTeamId, status: m.status, teamAId: m.teamAId, teamBId: m.teamBId });
  });

  protected readonly canScore = computed(() => !this.saving() && this.status() === 'in_progress' && this.teamsReady());

  /** Último ponto ainda "vivo" (replay de `pointEvents` casando undo com ponto). */
  protected readonly lastPoint = computed(() => lastUndoablePoint(this.events()));

  protected readonly feed = computed<FeedRowView[]>(() => {
    const nameOf = (side: 'A' | 'B' | null): string => (side === 'A' ? this.label('A') : side === 'B' ? this.label('B') : '—');
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

  // ── Modo exibição ──────────────────────────────────────────────────────────

  protected enterPresent(): void {
    this.present.set(true);
    const el = this.host.nativeElement;
    if (el.requestFullscreen) void el.requestFullscreen().catch(() => undefined);
  }

  protected exitPresent(): void {
    this.present.set(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }

  // ── Estado local da mesa ───────────────────────────────────────────────────

  protected swapSides(): void {
    this.swapped.update((v) => !v);
  }

  /** Tempo técnico da dupla que está no saque (2 por set, como na regra) — visual, o doc não
   *  tem campo pra isso. */
  protected addTimeout(): void {
    const side = this.servingSide();
    if (!side) return;
    this.timeouts.update((t) => (t[side] >= 2 ? t : { ...t, [side]: t[side] + 1 }));
  }

  // ── Escritas ───────────────────────────────────────────────────────────────

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
      this.timeouts.set({ A: 0, B: 0 });
      this.feedback.set({ ok: true, message: 'Partida iniciada — já aparece ao vivo para os atletas.' });
    } catch (e) {
      this.feedback.set({ ok: false, message: (e as Error).message || 'Falha ao iniciar a partida.' });
    } finally {
      this.saving.set(false);
      this.busyKey.set(null);
    }
  }

  /** Mesma escrita do `_point` do app: transação com sets/currentSetIndex/status/saque +
   *  evento `point`. O ponto que fecha a partida grava Completed+winnerId. */
  protected async point(side: MesaSide): Promise<void> {
    const m = this.match();
    if (!m || !this.canScore()) return;

    const result = applyPoint({ sets: m.sets, currentSetIndex: m.currentSetIndex, side, teamAId: m.teamAId, teamBId: m.teamBId, bestOf: m.bestOf });
    const setIdx = currentSetIndexOf(m);
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
          servingTeamId: result.servingTeamId,
          ...(result.winnerId != null ? { winnerId: result.winnerId, matchEndedAt: serverTimestamp() } : {}),
          ...(m.matchStartedAt == null ? { matchStartedAt: serverTimestamp() } : {}),
          resultA: `${wins.a}`,
          resultB: `${wins.b}`,
        },
        pointEvent: { type: 'point', side, setIndex: setIdx, scoreA: current?.a ?? 0, scoreB: current?.b ?? 0 },
      });
      // Set novo começa com os tempos técnicos zerados.
      if (result.currentSetIndex !== setIdx) this.timeouts.set({ A: 0, B: 0 });
      if (result.winnerId != null) {
        this.feedback.set({
          ok: true,
          message: `Partida encerrada — vitória de ${result.winnerId === m.teamAId ? this.label('A') : this.label('B')}. A chave avança automaticamente.`,
        });
      }
    } catch (e) {
      this.feedback.set({ ok: false, message: (e as Error).message || 'Falha ao marcar o ponto.' });
    } finally {
      this.saving.set(false);
    }
  }

  /** O −1 desfaz o último ponto — e só do lado que o marcou, pra não inventar história na
   *  timeline de `pointEvents`. */
  protected canUndoSide(side: MesaSide): boolean {
    return this.canScore() && this.lastPoint()?.side === side;
  }

  protected undoSide(side: MesaSide): void {
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
    const result = undoPoint({ sets: m.sets, currentSetIndex: last.setIndex, side, teamAId: m.teamAId, teamBId: m.teamBId, bestOf: m.bestOf });
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
          servingTeamId: result.servingTeamId,
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

  /** Abre o saque na dupla escolhida. Não inicia a partida nem marca ponto: grava só o campo,
   *  como o "Saque" das ferramentas — daí em diante o rally resolve sozinho. */
  protected async chooseServe(side: MesaSide): Promise<void> {
    const m = this.match();
    if (!m || this.saving() || !this.askingServe()) return;
    const teamId = side === 'A' ? m.teamAId : m.teamBId;
    if (!teamId) return;
    this.saving.set(true);
    try {
      await this.gateway.updateFields(m.id, { servingTeamId: teamId });
    } catch (e) {
      this.feedback.set({ ok: false, message: (e as Error).message || 'Falha ao definir quem começa sacando.' });
    } finally {
      this.saving.set(false);
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

  /** Set único ↔ MD3 pelo chip do formato, com o mesmo guard de não descartar sets pontuados. */
  protected async toggleFormat(): Promise<void> {
    const m = this.match();
    if (!m || this.saving() || m.status === 'completed') return;
    const newBestOf = m.bestOf === 1 ? 3 : 1;
    if (newBestOf < m.bestOf && !canReduceBestOf(m.sets, newBestOf)) {
      this.feedback.set({ ok: false, message: 'Não dá para mudar para set único: há sets já pontuados.' });
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

  /** Abre já preenchido com o que está no doc — corrigir é o caso mais comum depois de a
   *  partida ter acontecido. */
  protected openScoreSheet(): void {
    this.sheetOpen.set(true);
    const m = this.match();
    if (!m || this.hydratedQuickFor === m.id) return;
    this.hydratedQuickFor = m.id;
    const fromDoc = m.sets.map((s) => ({ a: s.a, b: s.b }));
    this.quickSets.set(fromDoc.length > 0 ? fromDoc : [{ a: 0, b: 0 }]);
  }

  protected closeSheet(): void {
    this.sheetOpen.set(false);
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
      const winnerLabel = winner === 'A' ? this.label('A') : this.label('B');
      this.feedback.set({
        ok: true,
        message: result.completed ? `Placar salvo — vitória de ${winnerLabel}. A chave avança automaticamente.` : 'Placar parcial salvo.',
      });
      this.sheetOpen.set(false);
    } catch (e) {
      this.feedback.set({ ok: false, message: (e as Error).message || 'Falha ao salvar o placar.' });
    } finally {
      this.saving.set(false);
      this.busyKey.set(null);
    }
  }
}
