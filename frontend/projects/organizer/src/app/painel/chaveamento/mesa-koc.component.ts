import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import {
  KOC_MAX_TEAMS_PER_ROUND,
  KOC_MIN_TEAMS_PER_ROUND,
  kocFinalTable,
  kocHasQualifyingTie,
  kocHasStarted,
  kocIsExpired,
  kocLiveOrder,
  kocPhaseLabel,
  kocPointsOf,
  kocRemainingLabel,
  type KocRoundState,
} from '../data/koc';
import { watchMatches, type TournamentMatch } from '../data/matches-repository';
import { organizerFirestore } from '../data/firestore';
import { initialsOf } from '../data/mock-data';
import {
  finishKocRound,
  registerKocRally,
  setKocClock,
  startKocRound,
  undoKocRally,
} from '../data/organizer-ops.service';
import { formatCourtLabel } from '../data/schedule-format';
import { fetchProfileDisplays, fetchTeamsByIds } from '../data/teams-repository';
import { OgAvatarComponent } from '../ui/avatar.component';
import { OgIconComponent } from '../ui/icon.component';

/** Opções de duração do protótipo (min). Servidor aceita 5–40. */
const DURATION_OPTIONS_MIN = [10, 12, 15, 20] as const;

interface TeamFace {
  name: string;
  sub: string | null;
  players: { initials: string; photoUrl: string | null }[];
}

/** Mesa da rodada King of the Court, no portal.
 *
 *  Layout alinhado ao protótipo de preparação (confronto de abertura + ordem da
 *  fila + duração/vagas) e à mesa ao vivo (dois alvos grandes). Toda mutação
 *  passa por callable; o relógio vem de `endsAtMs` do servidor. */
@Component({
  selector: 'og-mesa-koc',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, OgAvatarComponent, OgIconComponent],
  template: `
    @if (!loaded()) {
      <div class="og-mk-msg">Carregando rodada…</div>
    } @else if (!round()) {
      <div class="og-mk-msg">Rodada não encontrada.</div>
    } @else if (roster().length === 0) {
      <div class="og-mk-msg">Elenco definido quando a fase anterior terminar.</div>
    } @else if (finished()) {
      <section class="og-mk-done">
        <p class="og-mk-lead">
          Rodada encerrada · {{ rallies() }} rallies
          @if (crownsKnown()) {
            <span> · coroas = vezes que assumiu o trono</span>
          }
        </p>
        <div class="og-mk-table">
          <div class="og-mk-table-head">
            <span>TABELA FINAL</span>
            <span class="og-mk-flex"></span>
            @if (crownsKnown()) {
              <span>COROAS</span>
            }
            <span>PTS</span>
          </div>
          @for (row of finalRows(); track row.teamId) {
            <div class="og-mk-row" [class.qualifies]="row.qualifies">
              <span class="og-mk-place">{{ row.place }}º</span>
              <span class="og-mk-name">{{ row.name }}</span>
              @if (crownsKnown()) {
                <span class="og-mk-crowns">{{ row.crowns }}</span>
              }
              <span class="og-mk-pts">{{ row.points }}</span>
            </div>
          }
        </div>
        <p class="og-mk-done-note">Destacadas: as {{ qualifiers() }} que avançam.</p>
        @if (feedback(); as f) {
          <p class="og-mk-feedback" [class.err]="!f.ok">{{ f.message }}</p>
        }
      </section>
    } @else if (!started()) {
      <div class="og-mk-prep">
        <div class="og-mk-prep-main">
          <section class="og-mk-open">
            <header class="og-mk-section-head">
              <span class="og-mk-section-title">Confronto de abertura</span>
              <span class="og-mk-section-rule">Só o trono pontua · coroação não vale ponto</span>
            </header>
            <div class="og-mk-sides">
              <article class="og-mk-side throne">
                <span class="og-mk-side-badge">Entra no trono</span>
                <div class="og-mk-side-avatars">
                  @for (p of faceOf(kingDraftId()).players; track $index) {
                    <og-avatar [initials]="p.initials" [photoUrl]="p.photoUrl" [size]="64" />
                  } @empty {
                    <og-avatar initials="?" [size]="64" />
                  }
                </div>
                <p class="og-mk-side-name">{{ faceOf(kingDraftId()).name }}</p>
                @if (faceOf(kingDraftId()).sub; as sub) {
                  <p class="og-mk-side-sub">{{ sub }}</p>
                }
              </article>
              <span class="og-mk-vs">vs</span>
              <article class="og-mk-side challenger">
                <span class="og-mk-side-badge muted">Desafia primeiro · saca</span>
                <div class="og-mk-side-avatars">
                  @for (p of faceOf(challengerDraftId()).players; track $index) {
                    <og-avatar [initials]="p.initials" [photoUrl]="p.photoUrl" [size]="64" />
                  } @empty {
                    <og-avatar initials="?" [size]="64" />
                  }
                </div>
                <p class="og-mk-side-name">{{ faceOf(challengerDraftId()).name }}</p>
                @if (faceOf(challengerDraftId()).sub; as sub) {
                  <p class="og-mk-side-sub">{{ sub }}</p>
                }
              </article>
            </div>
          </section>

          <section class="og-mk-order">
            <header class="og-mk-section-head">
              <span class="og-mk-section-title">Ordem da fila</span>
              <span class="og-mk-section-hint">Arraste ↑↓ para reordenar</span>
              <button type="button" class="og-ghost-btn og-mk-shuffle" [disabled]="busy()" (click)="shuffleOrder()">
                Sortear ordem
              </button>
            </header>
            <ul class="og-mk-order-list">
              @for (teamId of draftOrder(); track teamId; let i = $index) {
                <li class="og-mk-order-row" [class.throne]="i === 0" [class.challenger]="i === 1">
                  <span class="og-mk-order-n">{{ i + 1 }}</span>
                  <span class="og-mk-order-avatars">
                    @for (p of faceOf(teamId).players; track $index) {
                      <og-avatar [initials]="p.initials" [photoUrl]="p.photoUrl" [size]="36" />
                    }
                  </span>
                  <span class="og-mk-order-body">
                    <span class="og-mk-order-name">{{ faceOf(teamId).name }}</span>
                    @if (faceOf(teamId).sub; as sub) {
                      <span class="og-mk-order-sub">{{ sub }}</span>
                    }
                  </span>
                  <span class="og-mk-order-role" [attr.data-role]="roleAt(i)">{{ roleLabel(roleAt(i)) }}</span>
                  <span class="og-mk-order-moves">
                    <button type="button" class="og-mk-move" [disabled]="busy() || i === 0" (click)="moveOrder(i, -1)" aria-label="Subir">
                      <og-icon name="chevronUp" [size]="14" />
                    </button>
                    <button
                      type="button"
                      class="og-mk-move"
                      [disabled]="busy() || i === draftOrder().length - 1"
                      (click)="moveOrder(i, 1)"
                      aria-label="Descer"
                    >
                      <og-icon name="chevronDown" [size]="14" />
                    </button>
                  </span>
                </li>
              }
            </ul>
          </section>
        </div>

        <aside class="og-mk-prep-side">
          <section class="og-mk-panel">
            <span class="og-mk-panel-title">Duração da rodada</span>
            <div class="og-mk-chips">
              @for (min of durationOptions; track min) {
                <button
                  type="button"
                  class="og-mk-chip"
                  [class.active]="draftDurationMin() === min"
                  (click)="draftDurationMin.set(min)"
                >
                  {{ min }} min
                </button>
              }
            </div>
          </section>

          <section class="og-mk-panel">
            <span class="og-mk-panel-title">Duplas que avançam</span>
            <div class="og-mk-chips">
              @for (n of qualifierOptions(); track n) {
                <button
                  type="button"
                  class="og-mk-chip"
                  [class.active]="draftQualifiers() === n"
                  (click)="draftQualifiers.set(n)"
                >
                  {{ n }}
                </button>
              }
            </div>
          </section>

          <section class="og-mk-panel">
            <span class="og-mk-panel-title">Regras da rodada</span>
            <ul class="og-mk-rules">
              <li>Trono vence o rally: <strong>+1 ponto</strong> e segue no trono</li>
              <li>Desafiante vence: <strong>assume o trono, sem ponto</strong></li>
              <li>Quem sai: vai para o fim da fila</li>
              <li>
                Fim da rodada: <strong>{{ draftDurationMin() }} min</strong> —
                <strong>{{ draftQualifiers() }}</strong>
                dupla{{ draftQualifiers() === 1 ? '' : 's' }} avançam
              </li>
            </ul>
          </section>

          <section class="og-mk-panel">
            <span class="og-mk-panel-title">Telão da quadra</span>
            <p class="og-mk-telao-hint">A TV segue a rodada ao vivo nas quadras do telão.</p>
            <div class="og-mk-telao-actions">
              <a class="og-ghost-btn og-mk-telao-btn" [href]="telaoHref()" target="_blank" rel="noopener">
                Abrir em nova janela
              </a>
              <button type="button" class="og-ghost-btn og-mk-telao-btn" (click)="copyTelaoLink()">
                <og-icon name="copy" [size]="14" />
                Copiar
              </button>
            </div>
          </section>

          <button type="button" class="og-primary-btn og-mk-start" [disabled]="busy() || !canStart()" (click)="start()">
            Iniciar rodada
          </button>
          <p class="og-mk-start-meta">{{ startMeta() }}</p>
          <a class="og-mk-cancel" [routerLink]="backLink()">Cancelar e voltar ao evento</a>

          @if (feedback(); as f) {
            <p class="og-mk-feedback" [class.err]="!f.ok">{{ f.message }}</p>
          }
        </aside>
      </div>
    } @else {
      <div class="og-mk-live">
        <div class="og-mk-clock" [class.expired]="expired()">
          <span class="og-mk-time">{{ clockLabel() }}</span>
          @if (expired()) {
            <span class="og-mk-clock-note">Conclua o rally em andamento e encerre.</span>
          } @else if (paused()) {
            <span class="og-mk-clock-note">Pausado</span>
          }
          <span class="og-mk-flex"></span>
          <button type="button" class="og-ghost-btn" [disabled]="busy()" (click)="nudge(-60)" title="-1 min">−1 min</button>
          <button type="button" class="og-ghost-btn" [disabled]="busy()" (click)="nudge(60)" title="+1 min">+1 min</button>
          <button type="button" class="og-ghost-btn" [disabled]="busy()" (click)="togglePause()">
            {{ paused() ? 'Retomar' : 'Pausar' }}
          </button>
        </div>

        <button type="button" class="og-mk-target king" [disabled]="busy()" (click)="rally(true)">
          <span class="og-mk-target-badge">No trono</span>
          <span class="og-mk-target-avatars">
            @for (p of faceOf(kingId()).players; track $index) {
              <og-avatar [initials]="p.initials" [photoUrl]="p.photoUrl" [size]="48" />
            }
          </span>
          <span class="og-mk-target-body">
            <span class="og-mk-target-name">{{ faceOf(kingId()).name }}</span>
            <span class="og-mk-target-desc">Defendeu o trono · +1 ponto</span>
          </span>
          <span class="og-mk-target-pts">{{ pointsOf(kingId()) }}</span>
        </button>
        <button type="button" class="og-mk-target challenger" [disabled]="busy()" (click)="rally(false)">
          <span class="og-mk-target-badge muted">Desafiante · saca</span>
          <span class="og-mk-target-avatars">
            @for (p of faceOf(challengerId()).players; track $index) {
              <og-avatar [initials]="p.initials" [photoUrl]="p.photoUrl" [size]="48" />
            }
          </span>
          <span class="og-mk-target-body">
            <span class="og-mk-target-name">{{ faceOf(challengerId()).name }}</span>
            <span class="og-mk-target-desc">Destronou · assume o trono, sem ponto</span>
          </span>
          <span class="og-mk-target-pts">{{ pointsOf(challengerId()) }}</span>
        </button>

        @if (queue().length > 0) {
          <p class="og-mk-queue"><span>FILA</span> {{ queueLabel() }}</p>
        }

        <div class="og-mk-table">
          <div class="og-mk-table-head">
            <span>TABELA</span>
            <span class="og-mk-flex"></span>
            <span>{{ rallies() }} rallies</span>
          </div>
          @for (row of rows(); track row.teamId) {
            <div class="og-mk-row" [class.qualifies]="row.qualifies">
              <span class="og-mk-place">{{ row.place }}º</span>
              <span class="og-mk-name">{{ row.name }}</span>
              @if (row.tied) {
                <span class="og-mk-tied">empate</span>
              }
              <span class="og-mk-pts">{{ row.points }}</span>
            </div>
          }
          @if (tie()) {
            <p class="og-mk-tie-note">Empate na vaga de classificação — bola de ouro entre as empatadas.</p>
          }
        </div>

        <div class="og-mk-actions">
          <button type="button" class="og-ghost-btn" [disabled]="busy() || rallies() === 0" (click)="undo()">
            <og-icon name="back" [size]="14" />Desfazer
          </button>
          <button type="button" class="og-primary-btn" [disabled]="busy()" (click)="finish()">Encerrar rodada</button>
        </div>

        @if (feedback(); as f) {
          <p class="og-mk-feedback" [class.err]="!f.ok">{{ f.message }}</p>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .og-mk-msg {
      padding: 28px 4px;
      color: var(--nx-text-mute);
      font-size: 14px;
    }
    .og-mk-flex {
      flex: 1;
    }

    /* ── Preparação ─────────────────────────────────────────── */
    .og-mk-prep {
      display: grid;
      grid-template-columns: minmax(0, 1.55fr) minmax(280px, 0.9fr);
      gap: 18px;
      align-items: start;
    }
    @media (max-width: 1023.98px) {
      .og-mk-prep {
        grid-template-columns: 1fr;
      }
    }
    .og-mk-prep-main {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
    }
    .og-mk-open,
    .og-mk-order,
    .og-mk-panel {
      padding: 16px 18px;
      border-radius: 16px;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
    }
    .og-mk-section-head {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      margin-bottom: 14px;
    }
    .og-mk-section-title {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 12px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-mute);
    }
    .og-mk-section-rule,
    .og-mk-section-hint {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-mk-shuffle {
      margin-left: auto;
    }
    .og-mk-sides {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      gap: 14px;
      align-items: stretch;
    }
    .og-mk-side {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 18px 14px;
      border-radius: 14px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      text-align: center;
    }
    .og-mk-side.throne {
      border-color: rgba(255, 106, 26, 0.55);
      background: linear-gradient(160deg, rgba(255, 106, 26, 0.16), rgba(20, 12, 8, 0.9));
    }
    .og-mk-side-badge {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-brand);
    }
    .og-mk-side-badge.muted {
      color: var(--nx-text-mute);
    }
    .og-mk-side-avatars {
      display: flex;
      gap: 6px;
    }
    .og-mk-side-name {
      margin: 0;
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 22px;
      letter-spacing: -0.02em;
      line-height: 1.15;
    }
    .og-mk-side-sub {
      margin: 0;
      font-size: 12px;
      color: var(--nx-text-mute);
    }
    .og-mk-vs {
      align-self: center;
      font-size: 13px;
      font-weight: 700;
      color: var(--nx-text-dim);
      text-transform: uppercase;
    }

    .og-mk-order-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .og-mk-order-row {
      display: grid;
      grid-template-columns: 28px auto 1fr auto auto;
      gap: 10px;
      align-items: center;
      padding: 10px 12px;
      border-radius: 12px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
    }
    .og-mk-order-row.throne {
      border-color: rgba(255, 106, 26, 0.5);
    }
    .og-mk-order-n {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      color: var(--nx-text-mute);
    }
    .og-mk-order-avatars {
      display: flex;
      gap: 4px;
    }
    .og-mk-order-body {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .og-mk-order-name {
      font-weight: 700;
      font-size: 14px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .og-mk-order-sub {
      font-size: 11px;
      color: var(--nx-text-dim);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .og-mk-order-role {
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.08em;
      color: var(--nx-text-dim);
    }
    .og-mk-order-role[data-role='trono'] {
      color: var(--nx-brand);
    }
    .og-mk-order-role[data-role='desafia'] {
      color: var(--nx-win);
    }
    .og-mk-order-moves {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .og-mk-move {
      display: grid;
      place-items: center;
      width: 28px;
      height: 22px;
      border: 1px solid var(--nx-line);
      border-radius: 6px;
      background: var(--nx-surface-0);
      color: var(--nx-text-mute);
      cursor: pointer;
    }
    .og-mk-move:disabled {
      opacity: 0.35;
      cursor: default;
    }

    .og-mk-prep-side {
      display: flex;
      flex-direction: column;
      gap: 12px;
      position: sticky;
      top: 12px;
    }
    .og-mk-panel-title {
      display: block;
      margin-bottom: 10px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-mute);
    }
    .og-mk-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .og-mk-chip {
      min-width: 52px;
      height: 36px;
      padding: 0 12px;
      border-radius: 10px;
      border: 1px solid var(--nx-line);
      background: var(--nx-surface-1);
      color: var(--nx-text-mute);
      font: inherit;
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
    }
    .og-mk-chip.active {
      border-color: var(--nx-brand);
      color: var(--nx-brand);
      background: rgba(255, 106, 26, 0.12);
    }
    .og-mk-rules {
      margin: 0;
      padding-left: 18px;
      font-size: 13px;
      line-height: 1.55;
      color: var(--nx-text-mute);
    }
    .og-mk-rules strong {
      color: var(--nx-text);
      font-weight: 700;
    }
    .og-mk-telao-hint {
      margin: 0 0 10px;
      font-size: 13px;
      color: var(--nx-text-dim);
    }
    .og-mk-telao-actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .og-mk-telao-btn {
      width: 100%;
      justify-content: center;
      gap: 6px;
    }
    .og-mk-start {
      width: 100%;
      min-height: 48px;
      font-size: 15px;
    }
    .og-mk-start-meta {
      margin: 0;
      text-align: center;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-mk-cancel {
      display: block;
      text-align: center;
      font-size: 13px;
      color: var(--nx-text-mute);
      text-decoration: none;
    }
    .og-mk-cancel:hover {
      color: var(--nx-text);
    }

    /* ── Ao vivo / final ────────────────────────────────────── */
    .og-mk-live,
    .og-mk-done {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 4px 0 8px;
    }
    .og-mk-lead {
      margin: 0;
      font-size: 13px;
      color: var(--nx-text-mute);
    }
    .og-mk-clock {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .og-mk-time {
      font-family: var(--nx-font-mono);
      font-size: 34px;
      font-weight: 800;
      line-height: 1;
    }
    .og-mk-clock.expired .og-mk-time {
      color: var(--nx-pending);
    }
    .og-mk-clock-note {
      font-size: 12px;
      color: var(--nx-text-mute);
    }
    .og-mk-target {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      padding: 16px;
      border: 1px solid var(--nx-line);
      border-radius: 16px;
      background: var(--nx-surface-0);
      color: inherit;
      cursor: pointer;
      text-align: left;
      font: inherit;
    }
    .og-mk-target.king {
      background: linear-gradient(160deg, rgba(255, 106, 26, 0.18), var(--nx-surface-0));
      border-color: rgba(255, 106, 26, 0.5);
    }
    .og-mk-target:disabled {
      opacity: 0.55;
      cursor: default;
    }
    .og-mk-target-badge {
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-brand);
      writing-mode: vertical-rl;
      transform: rotate(180deg);
    }
    .og-mk-target-badge.muted {
      color: var(--nx-text-mute);
    }
    .og-mk-target-avatars {
      display: flex;
      gap: 4px;
    }
    .og-mk-target-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .og-mk-target-name {
      font-size: 18px;
      font-weight: 800;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .og-mk-target-desc {
      font-size: 12px;
      color: var(--nx-text-mute);
    }
    .og-mk-target-pts {
      font-family: var(--nx-font-mono);
      font-size: 28px;
      font-weight: 800;
    }
    .og-mk-queue {
      margin: 0;
      font-size: 13px;
      color: var(--nx-text-mute);
    }
    .og-mk-queue span {
      font-size: 10px;
      letter-spacing: 0.08em;
      margin-right: 8px;
    }
    .og-mk-table-head {
      display: flex;
      gap: 10px;
      font-size: 10px;
      letter-spacing: 0.08em;
      color: var(--nx-text-dim);
      margin-bottom: 6px;
    }
    .og-mk-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      border-radius: 10px;
    }
    .og-mk-row.qualifies {
      background: rgba(255, 106, 26, 0.12);
    }
    .og-mk-place {
      min-width: 26px;
      font-size: 13px;
      color: var(--nx-text-mute);
    }
    .og-mk-row.qualifies .og-mk-place {
      color: var(--nx-brand);
      font-weight: 800;
    }
    .og-mk-name {
      flex: 1;
      font-size: 14px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .og-mk-tied {
      font-size: 11px;
      color: var(--nx-pending);
    }
    .og-mk-pts {
      font-family: var(--nx-font-mono);
      font-size: 17px;
      font-weight: 800;
    }
    .og-mk-crowns {
      min-width: 26px;
      text-align: right;
      font-size: 13px;
      color: var(--nx-text-mute);
    }
    .og-mk-done-note {
      margin: 0;
      font-size: 13px;
      color: var(--nx-text-mute);
    }
    .og-mk-tie-note {
      margin: 8px 0 0;
      font-size: 12px;
      color: var(--nx-pending);
    }
    .og-mk-actions {
      display: flex;
      gap: 12px;
      margin-top: 6px;
    }
    .og-mk-actions button {
      flex: 1;
    }
    .og-mk-feedback {
      margin: 4px 0 0;
      font-size: 13px;
    }
    .og-mk-feedback.err {
      color: var(--nx-pending);
    }
  `,
})
export class MesaKocComponent {
  private readonly destroyRef = inject(DestroyRef);

  readonly id = input<string>('');
  readonly matchId = input<string>('');
  readonly catId = input<string>('');

  protected readonly durationOptions = DURATION_OPTIONS_MIN;

  private readonly match = signal<TournamentMatch | null>(null);
  private readonly faces = signal<ReadonlyMap<string, TeamFace>>(new Map());
  private readonly hydrated = new Set<string>();
  private readonly nowMs = signal(Date.now());

  /** Rascunho local da preparação — só entra no servidor no apito. */
  protected readonly draftOrder = signal<string[]>([]);
  protected readonly draftDurationMin = signal(15);
  protected readonly draftQualifiers = signal(2);

  protected readonly loaded = signal(false);
  protected readonly busy = signal(false);
  protected readonly feedback = signal<{ ok: boolean; message: string } | null>(null);

  constructor() {
    effect((onCleanup) => {
      const tid = this.id();
      const mid = this.matchId();
      this.match.set(null);
      this.loaded.set(false);
      if (!tid || !mid) return;
      const stop = watchMatches(
        tid,
        (matches) => {
          const found = matches.find((m) => m.id === mid) ?? null;
          this.match.set(found);
          this.loaded.set(true);
          this.seedDraftFrom(found);
          void this.hydrateFaces();
        },
        () => this.loaded.set(true),
      );
      onCleanup(() => stop());
    });

    const timer = setInterval(() => this.nowMs.set(Date.now()), 1000);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  protected readonly round = computed<KocRoundState | null>(() => this.match()?.koc ?? null);
  protected readonly roster = computed(() => this.round()?.teamIds ?? []);
  protected readonly started = computed(() => {
    const r = this.round();
    return r != null && kocHasStarted(r);
  });
  protected readonly kingId = computed(() => this.round()?.kingTeamId ?? '');
  protected readonly challengerId = computed(() => this.round()?.challengerTeamId ?? '');
  protected readonly queue = computed(() => this.round()?.queue ?? []);
  protected readonly rallies = computed(() => this.round()?.rallies ?? 0);
  protected readonly finished = computed(() => this.match()?.status === 'completed');
  protected readonly qualifiers = computed(() => this.round()?.qualifiersPerRound ?? 0);
  protected readonly crownsKnown = computed(() => (this.round()?.standings.length ?? 0) > 0);

  protected readonly kingDraftId = computed(() => this.draftOrder()[0] ?? '');
  protected readonly challengerDraftId = computed(() => this.draftOrder()[1] ?? '');

  protected readonly qualifierOptions = computed(() => {
    const max = Math.max(1, this.draftOrder().length - 1);
    const out: number[] = [];
    for (let n = 1; n <= Math.min(3, max); n++) out.push(n);
    return out;
  });

  protected readonly finalRows = computed(() => {
    const r = this.round();
    if (!r) return [];
    return kocFinalTable(r).map((row) => ({
      teamId: row.teamId,
      place: row.place,
      name: this.faceOf(row.teamId).name,
      points: row.points,
      crowns: row.crowns,
      qualifies: row.place <= r.qualifiersPerRound,
    }));
  });

  protected readonly rows = computed(() => {
    const r = this.round();
    if (!r) return [];
    return kocLiveOrder(r).map((teamId, i) => ({
      teamId,
      place: i + 1,
      name: this.faceOf(teamId).name,
      points: kocPointsOf(r, teamId),
      qualifies: i < r.qualifiersPerRound,
      tied: r.teamIds.some((id) => id !== teamId && kocPointsOf(r, id) === kocPointsOf(r, teamId)),
    }));
  });

  protected faceOf(teamId: string): TeamFace {
    return this.faces().get(teamId) ?? { name: 'Dupla', sub: null, players: [] };
  }

  protected roleAt(index: number): 'trono' | 'desafia' | 'fila' {
    if (index === 0) return 'trono';
    if (index === 1) return 'desafia';
    return 'fila';
  }

  protected roleLabel(role: 'trono' | 'desafia' | 'fila'): string {
    if (role === 'trono') return 'TRONO';
    if (role === 'desafia') return 'DESAFIA';
    return 'NA FILA';
  }

  protected canStart(): boolean {
    return this.draftOrder().length >= KOC_MIN_TEAMS_PER_ROUND && this.draftOrder().length <= KOC_MAX_TEAMS_PER_ROUND;
  }

  protected startMeta(): string {
    const court = formatCourtLabel(this.match()?.court ?? '') || 'Quadra';
    return `${this.draftOrder().length} duplas · ${this.draftDurationMin()} min · ${court}`;
  }

  protected telaoHref(): string {
    return `/telao/${encodeURIComponent(this.id())}`;
  }

  protected async copyTelaoLink(): Promise<void> {
    const url = `${window.location.origin}${this.telaoHref()}`;
    try {
      await navigator.clipboard.writeText(url);
      this.feedback.set({ ok: true, message: 'Link do telão copiado.' });
    } catch {
      this.feedback.set({ ok: false, message: 'Não foi possível copiar o link.' });
    }
  }

  protected backLink(): string[] {
    const tid = this.id();
    const cid = this.catId();
    if (tid && cid) return ['/painel/eventos', tid, 'categorias', cid, 'jogos'];
    if (tid) return ['/painel/eventos', tid];
    return ['/painel/eventos'];
  }

  protected phaseLabel(): string {
    const m = this.match();
    const round = m?.koc;
    const n = round?.roundLabel || m?.matchNumber || 0;
    return m ? kocPhaseLabel(m.matchType, n) : 'Rodada';
  }

  protected pointsOf(teamId: string): number {
    const r = this.round();
    return r ? kocPointsOf(r, teamId) : 0;
  }

  protected clockLabel(): string {
    const clock = this.round()?.clock;
    if (!clock) return '—';
    return kocIsExpired(clock, this.nowMs()) ? 'TEMPO!' : kocRemainingLabel(clock, this.nowMs());
  }

  protected expired(): boolean {
    const clock = this.round()?.clock;
    return clock != null && kocIsExpired(clock, this.nowMs());
  }

  protected paused(): boolean {
    return this.round()?.clock?.pausedAtMs != null;
  }

  protected queueLabel(): string {
    return this.queue()
      .map((id) => this.faceOf(id).name)
      .join('  →  ');
  }

  protected tie(): boolean {
    const r = this.round();
    return r != null && kocHasQualifyingTie(r);
  }

  protected moveOrder(index: number, delta: number): void {
    const next = [...this.draftOrder()];
    const j = index + delta;
    if (j < 0 || j >= next.length) return;
    const tmp = next[index]!;
    next[index] = next[j]!;
    next[j] = tmp;
    this.draftOrder.set(next);
  }

  protected shuffleOrder(): void {
    const next = [...this.draftOrder()];
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = next[i]!;
      next[i] = next[j]!;
      next[j] = tmp;
    }
    this.draftOrder.set(next);
  }

  protected start(): void {
    void this.run(
      () =>
        startKocRound({
          matchId: this.matchId(),
          teamIds: this.draftOrder(),
          durationSec: this.draftDurationMin() * 60,
          qualifiersPerRound: this.draftQualifiers(),
        }),
      'Rodada iniciada.',
    );
  }

  protected rally(kingWon: boolean): void {
    void this.run(
      () => registerKocRally({ matchId: this.matchId(), kingWon, expectedSeq: this.rallies() + 1 }),
      null,
    );
  }

  protected undo(): void {
    void this.run(() => undoKocRally(this.matchId()), 'Rally desfeito.');
  }

  protected togglePause(): void {
    const action = this.paused() ? 'resume' : 'pause';
    void this.run(() => setKocClock({ matchId: this.matchId(), action }), null);
  }

  protected nudge(deltaSec: number): void {
    void this.run(() => setKocClock({ matchId: this.matchId(), action: 'nudge', deltaSec }), null);
  }

  protected finish(): void {
    void this.run(async () => {
      try {
        await finishKocRound({ matchId: this.matchId() });
      } catch (error) {
        if (reasonOf(error) !== 'koc_unresolved_tie') throw error;
        const ok = confirm(
          'Há empate em pontos decidindo a classificação.\n\n' +
            'O regulamento resolve na areia: joguem a bola de ouro e registrem o rally. ' +
            'Encerrar agora faz a vaga sair pelo desempate automático (quem foi rei por último).\n\n' +
            'Encerrar assim?',
        );
        if (!ok) return;
        await finishKocRound({ matchId: this.matchId(), acceptTiebreak: true });
      }
    }, 'Rodada encerrada.');
  }

  private seedDraftFrom(match: TournamentMatch | null): void {
    const round = match?.koc;
    if (!round || kocHasStarted(round) || match?.status === 'completed') return;
    const roster = round.teamIds;
    if (roster.length === 0) return;
    // Só reseeda se o rascunho ainda não bate com o elenco (evita apagar reorder
    // a cada snapshot). Duração/vagas só na 1ª carga — depois o mesário edita.
    const current = this.draftOrder();
    const wasEmpty = current.length === 0;
    const same =
      current.length === roster.length && current.every((id) => roster.includes(id)) && roster.every((id) => current.includes(id));
    if (!same) this.draftOrder.set([...roster]);

    if (!wasEmpty) return;

    const min = Math.round(round.configuredDurationSec / 60);
    const nearest = DURATION_OPTIONS_MIN.reduce((best, opt) =>
      Math.abs(opt - min) < Math.abs(best - min) ? opt : best,
    );
    this.draftDurationMin.set(nearest);

    const maxQ = Math.max(1, roster.length - 1);
    this.draftQualifiers.set(Math.min(maxQ, Math.max(1, round.qualifiersPerRound || 2)));
  }

  private async run(action: () => Promise<unknown>, okMessage: string | null): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.feedback.set(null);
    try {
      await action();
      if (okMessage) this.feedback.set({ ok: true, message: okMessage });
    } catch (error) {
      this.feedback.set({ ok: false, message: messageOf(error) });
    } finally {
      this.busy.set(false);
    }
  }

  private async hydrateFaces(): Promise<void> {
    const ids = this.roster().filter((id) => !this.hydrated.has(id));
    if (ids.length === 0) return;
    for (const id of ids) this.hydrated.add(id);
    const projectId = environment.firebase.projectId;
    if (!projectId) return;
    try {
      const db = organizerFirestore();
      const teams = await fetchTeamsByIds(db, projectId, ids);
      const playerIds = [...teams.values()].flatMap((t) => [t.player1Id, t.player2Id]).filter((x) => x.length > 0);
      const profiles = await fetchProfileDisplays(db, playerIds);
      this.faces.update((current) => {
        const next = new Map(current);
        for (const [teamId, team] of teams) {
          const p1 = team.player1Id ? profiles.get(team.player1Id) : undefined;
          const p2 = team.player2Id && team.player2Id !== team.player1Id ? profiles.get(team.player2Id) : undefined;
          const fullNames = [p1?.name, p2?.name].filter((n): n is string => !!n?.trim());
          const shortParts = fullNames.map((n) => n.trim().split(/\s+/)[0]!).filter(Boolean);
          const name = team.teamName ?? (shortParts.length > 0 ? shortParts.join(' / ') : 'Dupla');
          next.set(teamId, {
            name,
            sub: fullNames.length > 0 ? fullNames.join(' · ') : null,
            players: [p1, p2]
              .filter((p): p is NonNullable<typeof p> => !!p)
              .map((p) => ({ initials: initialsOf(p.name), photoUrl: p.photoUrl })),
          });
        }
        return next;
      });
    } catch {
      for (const id of ids) this.hydrated.delete(id);
    }
  }
}

function reasonOf(error: unknown): string {
  const details = (error as { details?: { reason?: unknown } } | null)?.details;
  return typeof details?.reason === 'string' ? details.reason : '';
}

function messageOf(error: unknown): string {
  const message = (error as { message?: unknown } | null)?.message;
  const text = typeof message === 'string' ? message.trim() : '';
  return text.length > 0 ? text : 'Não foi possível registrar. Tente de novo.';
}
