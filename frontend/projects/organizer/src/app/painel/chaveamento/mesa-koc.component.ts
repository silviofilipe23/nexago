import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { ledPanelHref } from '../../publico/led/led-link';
import {
  KOC_MAX_TEAMS_PER_ROUND,
  KOC_MIN_TEAMS_PER_ROUND,
  kocFinalTable,
  kocFinishBlockedLabel,
  kocLastTiebreakWinner,
  kocQualifyingSpotsAtStake,
  kocQualifyingTieGroup,
  kocTiebreakOrder,
  type KocLogLine,
  kocHasStarted,
  kocIsExpired,
  kocLiveOrder,
  kocLogLines,
  kocMatchPhaseLabel,
  kocPointsOf,
  kocRemainingLabel,
  type KocRoundState,
} from '../data/koc';
import { watchMatches, type TournamentMatch } from '../data/matches-repository';
import { organizerFirestore } from '../data/firestore';
import { initialsOf } from '../data/mock-data';
import {
  finishKocRound,
  registerKocGoldenPoint,
  registerKocRally,
  type KocRallyOutcome,
  setKocClock,
  startKocRound,
  undoKocRally,
  validateMatchResult,
} from '../data/organizer-ops.service';
import { formatCourtLabel } from '../data/schedule-format';
import { shareQrSvgDataUrl } from '../data/share-qr';
import { fetchProfileDisplays, fetchTeamsByIds } from '../data/teams-repository';
import { KOC_FINISHED_SHOWCASE_MS } from '../telao/telao-koc-mode';
import { OgAvatarComponent } from '../ui/avatar.component';
import { OgIconComponent } from '../ui/icon.component';
import { ChaveamentoContextService } from './chaveamento-context.service';

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
/** O que cada desfecho fez com o placar, na linha do log. Mapa e não ternário:
 *  com quatro desfechos, um `else` engoliria o erro de saque e a bola de ouro
 *  como se fossem coroação. */
const LOG_ACTION: Record<KocLogLine['kind'], string> = {
  point: '+1 · defendeu o trono',
  crown: 'coroou — assume o trono',
  fault: 'errou o saque — perdeu a vez, sem ponto',
  golden: '+1 · venceu a bola de ouro',
};

@Component({
  selector: 'og-mesa-koc',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, OgAvatarComponent, OgIconComponent],
  host: {
    '(document:keydown.escape)': 'onDocEscape()',
  },
  template: `
    @if (!loaded()) {
      <div class="og-mk-msg">Carregando rodada…</div>
    } @else if (!round()) {
      <div class="og-mk-msg">Rodada não encontrada.</div>
    } @else if (roster().length === 0) {
      <div class="og-mk-msg">Elenco definido quando a fase anterior terminar.</div>
    } @else if (finished()) {
      <section class="og-mk-done">
        @if (champion(); as champ) {
          <article class="og-mk-champ">
            <span class="og-mk-champ-badge">Sessão encerrada · Rei da quadra</span>
            <div class="og-mk-champ-row">
              <div class="og-mk-champ-team">
                <span class="og-mk-champ-avatars">
                  @for (p of faceOf(champ.teamId).players; track $index) {
                    <og-avatar [initials]="p.initials" [photoUrl]="p.photoUrl" [size]="56" />
                  } @empty {
                    <og-avatar initials="?" [size]="56" />
                  }
                </span>
                <div class="og-mk-champ-body">
                  <strong class="og-mk-champ-name">{{ champ.name }}</strong>
                  @if (faceOf(champ.teamId).sub; as sub) {
                    <span class="og-mk-champ-sub">{{ sub }}</span>
                  }
                </div>
              </div>
              <div class="og-mk-champ-stats">
                <div class="og-mk-champ-stat">
                  <strong>{{ champ.points }}</strong>
                  <span>Pts da campeã</span>
                </div>
                <div class="og-mk-champ-stat">
                  <strong>{{ champ.crowns }}</strong>
                  <span>Coroas</span>
                </div>
                <div class="og-mk-champ-stat">
                  <strong>{{ rallies() }}</strong>
                  <span>Rallys na rodada</span>
                </div>
                <div class="og-mk-champ-stat">
                  <strong>{{ durationLabel() }}</strong>
                  <span>Duração</span>
                </div>
              </div>
            </div>
          </article>
        }

        <div class="og-mk-final">
          <div class="og-mk-final-head">
            <span>Pos</span>
            <span>Dupla</span>
            <span class="num">Coroas</span>
            <span class="num">Rallys</span>
            <span class="num">Pts</span>
            </div>
            @for (row of finalRows(); track row.teamId) {
            <div
              class="og-mk-final-row"
              [class.king]="row.place === 1"
              [class.advances]="row.qualifies && row.place > 1"
            >
              <span class="og-mk-final-place">{{ row.place }}.</span>
              <div class="og-mk-final-dupla">
                <span class="og-mk-final-avatars">
                  @for (p of faceOf(row.teamId).players; track $index) {
                    <og-avatar [initials]="p.initials" [photoUrl]="p.photoUrl" [size]="36" />
                  }
                </span>
                <div class="og-mk-final-body">
                  <span class="og-mk-final-name">{{ row.name }}</span>
                  @if (faceOf(row.teamId).sub; as sub) {
                    <span class="og-mk-final-sub">{{ sub }}</span>
                  }
              </div>
                @if (row.place === 1) {
                  <span class="og-mk-final-tag king">Rei da quadra</span>
                } @else if (row.qualifies) {
                  <span class="og-mk-final-tag advances">Avança</span>
            }
          </div>
              <span class="og-mk-final-num">{{ row.crowns }}</span>
              <span class="og-mk-final-num">{{ row.rallyWins }}</span>
              <span class="og-mk-final-pts">{{ row.points }}</span>
            </div>
          }
          <p class="og-mk-final-legend">
            <span class="og-mk-final-dot" aria-hidden="true"></span>
            As {{ qualifiers() }} primeira{{ qualifiers() === 1 ? '' : 's' }} avançam para a próxima fase
          </p>
          <p class="og-mk-final-rule">
            Coroas = vezes que a dupla assumiu o trono · empate em pts resolvido por coroas
          </p>
        </div>

        <footer class="og-mk-done-foot">
          <span class="og-mk-done-status">{{ doneFootStatus() }}</span>
          <div class="og-mk-done-actions">
            <a class="og-mk-done-back" [routerLink]="backLink()">Voltar ao evento</a>
            <button type="button" class="og-ghost-btn og-mk-done-btn" [disabled]="busy()" (click)="exportTable()">
              Exportar tabela
          </button>
            <button type="button" class="og-ghost-btn og-mk-done-btn solid" [disabled]="busy()" (click)="askCorrectScore()">
              Corrigir pontuação
            </button>
            <button type="button" class="og-btn-primary og-mk-homolog" [disabled]="busy()" (click)="homologate()">
              Homologar e seguir
            </button>
          </div>
        </footer>

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
          <section class="og-mk-panel og-mk-config">
            <div class="og-mk-config-block">
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
            </div>
          </section>

          <section class="og-mk-panel">
            <span class="og-mk-panel-title">Regras da rodada</span>
            <ul class="og-mk-rules">
              <li>
                <strong>Trono vence o rally:</strong>
                <span>+1 ponto e segue no trono</span>
              </li>
              <li>
                <strong>Desafiante vence:</strong>
                <span>assume o trono, sem ponto</span>
              </li>
              <li>
                <strong>Quem sai:</strong>
                <span>vai para o fim da fila</span>
              </li>
              <li>
                <strong>Fim da rodada:</strong>
                <span>{{ draftDurationMin() }} min · {{ draftQualifiers() }} dupla{{ draftQualifiers() === 1 ? '' : 's' }} avançam</span>
              </li>
            </ul>
          </section>

          <section class="og-mk-panel">
            <span class="og-mk-panel-title">Telão da quadra</span>
            <div class="og-mk-telao">
              <div class="og-mk-telao-qr" aria-hidden="true">
                @if (telaoQr(); as qr) {
                  <img [src]="qr" alt="" />
                } @else {
                  <span>QR telão</span>
                }
              </div>
              <div class="og-mk-telao-body">
                <span class="og-mk-telao-url" [title]="telaoAbsoluteUrl()">{{ telaoDisplayUrl() }}</span>
                <div class="og-mk-telao-actions">
                  <a class="og-ghost-btn og-mk-telao-open" [href]="telaoHref()" target="_blank" rel="noopener">
                    Abrir em nova janela
                  </a>
                  <button type="button" class="og-ghost-btn og-mk-telao-copy" (click)="copyTelaoLink()">Copiar</button>
                  @if (ledHref(); as href) {
                    <a class="og-ghost-btn og-mk-led-open" [href]="href" target="_blank" rel="noopener">
                      Painel de LED
                    </a>
                  }
                </div>
              </div>
            </div>
          </section>

          <button type="button" class="og-btn-primary og-mk-start" [disabled]="busy() || !canStart()" (click)="askStart()">
            <span class="og-mk-start-label">Iniciar rodada</span>
            <span class="og-mk-start-meta">{{ startMeta() }}</span>
          </button>
          <a class="og-mk-cancel" [routerLink]="backLink()">Cancelar e voltar ao evento</a>

          @if (feedback(); as f) {
            <p class="og-mk-feedback" [class.err]="!f.ok">{{ f.message }}</p>
          }
        </aside>
            </div>
    } @else {
      <div class="og-mk-live">
        <div class="og-mk-live-main">
          <section class="og-mk-open">
            <header class="og-mk-section-head">
              <span class="og-mk-section-title">Confronto de abertura</span>
              <span class="og-mk-section-rule">Só o trono pontua · coroação não vale ponto</span>
            </header>
            <div class="og-mk-sides">
              <article class="og-mk-side throne">
                <span class="og-mk-side-badge">
                  <span class="og-mk-side-dot" aria-hidden="true"></span>
                  No trono
                </span>
                <div class="og-mk-side-avatars">
                  @for (p of faceOf(kingId()).players; track $index) {
                    <og-avatar [initials]="p.initials" [photoUrl]="p.photoUrl" [size]="72" />
                  } @empty {
                    <og-avatar initials="?" [size]="72" />
                  }
              </div>
                <p class="og-mk-side-name">{{ faceOf(kingId()).name }}</p>
                @if (faceOf(kingId()).sub; as sub) {
                  <p class="og-mk-side-sub">{{ sub }}</p>
                }
                <p class="og-mk-side-pts">
                  <strong>{{ pointsOf(kingId()) }}</strong>
                  <span>PTS</span>
                </p>
              </article>
              <span class="og-mk-vs">vs</span>
              <article class="og-mk-side challenger">
                <span class="og-mk-side-badge muted">Desafiante · saca</span>
                <div class="og-mk-side-avatars">
                  @for (p of faceOf(challengerId()).players; track $index) {
                    <og-avatar [initials]="p.initials" [photoUrl]="p.photoUrl" [size]="72" />
                  } @empty {
                    <og-avatar initials="?" [size]="72" />
                  }
                </div>
                <p class="og-mk-side-name">{{ faceOf(challengerId()).name }}</p>
                @if (faceOf(challengerId()).sub; as sub) {
                  <p class="og-mk-side-sub">{{ sub }}</p>
                }
                <p class="og-mk-side-pts muted">
                  <strong>{{ pointsOf(challengerId()) }}</strong>
                  <span>PTS</span>
                </p>
              </article>
            </div>
          </section>

          <section class="og-mk-order">
            <header class="og-mk-section-head">
              <span class="og-mk-section-title">Ordem da fila</span>
              <!-- No modo quadra o log sai do fluxo vertical e vira gaveta: e consulta,
                   nao operacao, e a faixa fixa dele custava a altura que faltava. -->
              <button type="button" class="og-ghost-btn og-mk-log-toggle" (click)="logOpen.set(true)">
                Log · {{ logRows().length }}
              </button>
            </header>
            <ul class="og-mk-order-list">
              @for (row of liveQueueRows(); track row.teamId) {
                <li
                  class="og-mk-order-row"
                  [class.throne]="row.role === 'trono'"
                  [class.challenger]="row.role === 'desafia'"
                >
                  <span class="og-mk-order-n" [class.lead]="row.place === 1">{{ row.place }}</span>
                  <span class="og-mk-order-avatars">
                    @for (p of faceOf(row.teamId).players; track $index) {
                      <og-avatar [initials]="p.initials" [photoUrl]="p.photoUrl" [size]="36" />
                    }
                  </span>
                  <span class="og-mk-order-body">
                    <span class="og-mk-order-name">{{ faceOf(row.teamId).name }}</span>
                    @if (faceOf(row.teamId).sub; as sub) {
                      <span class="og-mk-order-sub">{{ sub }}</span>
                    }
                  </span>
                  <span class="og-mk-order-pts">{{ row.points }}</span>
                  <span class="og-mk-order-role" [attr.data-role]="row.role">{{ row.roleLabel }}</span>
                </li>
              }
            </ul>

            @if (tie()) {
              <!-- Empate na vaga: card único com título, alerta e botões de quem pontuou.
                   Cada mini-rodada resolve UMA vaga — o chip e o kicker dizem quantas faltam. -->
              <section class="og-mk-tie" [attr.data-count]="tieOrder().length">
                <header class="og-mk-tie-head">
                  <div class="og-mk-tie-titles">
                    <span class="og-mk-tie-kicker">EMPATE NA VAGA</span>
                    <h2 class="og-mk-tie-title">{{ tieTitle() }}</h2>
                  </div>
                  <span class="og-mk-tie-chip">
                    {{ spotsAtStake() }} {{ spotsAtStake() === 1 ? 'VAGA' : 'VAGAS' }} EM DISPUTA
                  </span>
                </header>

                <div class="og-mk-tie-alert" [class.og-mk-tie-alert--ok]="lastTiebreakWinner() != null">
                  @if (lastTiebreakWinner(); as vencedora) {
                    <p class="og-mk-tie-alert-lead">
                      <og-icon name="check" [size]="16" />
                      <span>
                        <strong>{{ faceOf(vencedora).name }}</strong>
                        pontuou na {{ ordinalDe(miniRoundNumber() - 1) }} mini-rodada e está classificada.
                        {{ spotsAtStake() === 1 ? 'Falta 1.' : 'Faltam ' + spotsAtStake() + '.' }}
                      </span>
                    </p>
                  } @else if (tieGroup().length === 2) {
                    <p class="og-mk-tie-alert-lead">
                      <og-icon name="alert" [size]="16" />
                      <span>Bola de ouro entre as duas — quem pontuar leva a vaga.</span>
                    </p>
                  } @else if (spotsAtStake() > 1) {
                    <p class="og-mk-tie-alert-lead">
                      <og-icon name="alert" [size]="16" />
                      <span>
                        Cada mini-rodada decide <em>uma</em> vaga. Faltam <em>{{ spotsAtStake() }}</em>.
                      </span>
                    </p>
                  } @else {
                    <p class="og-mk-tie-alert-lead">
                      <og-icon name="alert" [size]="16" />
                      <span>
                        Mini-rodada entre as {{ tieGroup().length }} —
                        <em>quem pontuar primeiro leva a vaga.</em>
                      </span>
              </p>
            }

                  @if (tieGroup().length > 2) {
                    <div class="og-mk-tie-roles">
                      @for (slot of tieRoleSlots(); track slot.role; let i = $index) {
                        @if (i > 0) {
                          <span class="og-mk-tie-sep" aria-hidden="true"></span>
                        }
                        <span class="og-mk-tie-role" [class.og-mk-tie-role--throne]="slot.role === 'TRONO'">
                          <span class="papel">{{ slot.role }}</span>
                          <span class="dupla">{{ slot.names }}</span>
                        </span>
                      }
                    </div>
            }
          </div>

                <div class="og-mk-golden">
                  <span class="og-mk-golden-kicker">{{ goldenKicker() }}</span>
                  <div class="og-mk-golden-grid">
                    @for (teamId of tieOrder(); track teamId) {
                      <button
                        type="button"
                        class="og-mk-golden-card"
                        [disabled]="busy()"
                        (click)="golden(teamId)"
                      >
                        <span class="og-mk-golden-ini" aria-hidden="true">{{ duoInitials(teamId) }}</span>
                        <span class="og-mk-golden-name">{{ faceOf(teamId).name }}</span>
                        <span class="og-mk-golden-pts">{{ pointsOf(teamId) }} pt</span>
            </button>
                    }
          </div>
                </div>
              </section>
            }
            <div class="og-mk-live-controls">
              <div class="og-mk-live-actions">
                <button type="button" class="og-btn-primary og-mk-rally-king" [disabled]="busy()" (click)="rally('king')">
                  Ponto do trono
                </button>
                <button type="button" class="og-ghost-btn og-mk-rally-crown" [disabled]="busy()" (click)="rally('challenger')">
                  Desafiante venceu · coroa
                </button>
              </div>

              <!-- Terceiro desfecho, menor de propósito: é o menos frequente, e
                   confundi-lo com "ponto do trono" daria ao rei um ponto que o
                   regulamento não dá. -->
              <button type="button" class="og-mk-fault" [disabled]="busy()" (click)="rally('serve_fault')">
                Erro de saque de {{ faceOf(challengerId()).name }} · perde a vez, sem ponto
              </button>
            </div>

        @if (feedback(); as f) {
          <p class="og-mk-feedback" [class.err]="!f.ok">{{ f.message }}</p>
        }
          </section>
        </div>

        <aside class="og-mk-live-side">
          <section class="og-mk-panel og-mk-live-clock" [class.expired]="expired()">
            <!-- Saida do modo quadra: em tablet/celular a mesa cobre a topbar e o
                 cabecalho da pagina, entao o caminho de volta tem de morar aqui
                 dentro. No desktop o cabecalho continua na tela e este some. -->
            <a class="og-mk-quadra-back" [routerLink]="backLink()" aria-label="Sair da mesa">
              <og-icon name="back" [size]="18" />
            </a>
            <span class="og-mk-panel-title">Tempo restante</span>
            <!-- display:contents no desktop: os filhos seguem sendo itens diretos da
                 coluna flex do painel, como antes. No modo quadra o grupo vira a
                 coluna de leitura do relogio, ao lado dos botoes. -->
            <div class="og-mk-clock-read">
              <span class="og-mk-live-time">{{ clockLabel() }}</span>
              <span class="og-mk-live-clock-meta">{{ clockMeta() }}</span>
              @if (expired()) {
                <span class="og-mk-clock-note">Conclua o rally em andamento e encerre.</span>
              } @else if (paused()) {
                <span class="og-mk-clock-note">Pausado</span>
              }
            </div>
            <div class="og-mk-live-clock-actions">
              <button type="button" class="og-ghost-btn" [disabled]="busy()" (click)="togglePause()">
                {{ paused() ? 'Retomar' : 'Pausar' }}
              </button>
              <button type="button" class="og-ghost-btn" [disabled]="busy()" (click)="nudge(60)">+1 min</button>
            </div>
          </section>

          @if (logOpen()) {
            <button
              type="button"
              class="og-mk-log-scrim"
              aria-label="Fechar log"
              (click)="logOpen.set(false)"
            ></button>
          }
          <section class="og-mk-panel og-mk-live-log" [class.open]="logOpen()">
            <span class="og-mk-panel-title">Log da rodada</span>
            <button type="button" class="og-mk-log-close" aria-label="Fechar log" (click)="logOpen.set(false)">
              <og-icon name="close" [size]="16" />
            </button>
            <div class="og-mk-log-body">
              @if (logRows().length === 0) {
                <p class="og-mk-log-empty">Nada registrado ainda.</p>
              } @else {
                <ul class="og-mk-log-list">
                  @for (row of logRows(); track row.key) {
                    <li class="og-mk-log-row">
                      <span class="og-mk-log-time">{{ row.time }}</span>
                      <span class="og-mk-log-text">
                        <strong>{{ row.name }}</strong>
                        {{ row.action }}
                      </span>
                    </li>
                  }
                </ul>
                <button type="button" class="og-ghost-btn og-mk-log-undo" [disabled]="busy()" (click)="undo()">
                  <og-icon name="back" [size]="14" />
                  Desfazer último
                </button>
              }
            </div>
          </section>

          @if (tie()) {
            <!-- Com empate aberto o caminho padrão é resolver na areia, e o
                 botão diz o que falta em vez de deixar clicar para o servidor
                 recusar. Mas o regulamento PERMITE encerrar pelo critério
                 automático: só desabilitar deixaria a rodada sem saída quando
                 a mesa decide não jogar o desempate. A saída fica separada e
                 escrita. -->
            <div class="og-mk-live-footer">
              <button type="button" class="og-mk-end" disabled>{{ finishBlockedLabel() }}</button>
              <button type="button" class="og-mk-end-auto" [disabled]="busy()" (click)="finishByCriterion()">
                Encerrar pelo critério automático
              </button>
            </div>
          } @else {
            <div class="og-mk-live-footer">
              <button type="button" class="og-mk-end" [disabled]="busy()" (click)="finish()">Encerrar rodada</button>
            </div>
          }
        </aside>
      </div>
    }

    @if (confirmStartOpen()) {
      <div
        class="og-mk-confirm-backdrop"
        role="presentation"
        (click)="cancelStart()"
      >
        <div
          class="og-mk-confirm"
          role="dialog"
          aria-modal="true"
          [attr.aria-label]="confirmStartTitle()"
          (click)="$event.stopPropagation()"
        >
          <span class="og-mk-confirm-badge">Confirmar início</span>
          <h2 class="og-mk-confirm-title">{{ confirmStartTitle() }}</h2>
          <p class="og-mk-confirm-text">
            O cronômetro começa agora e o telão da quadra passa a exibir o confronto. A ordem da fila fica travada até o
            fim da rodada.
          </p>
          <div class="og-mk-confirm-grid">
            <div class="og-mk-confirm-tile">
              <span class="og-mk-confirm-kicker">Trono</span>
              <strong class="og-mk-confirm-value">{{ faceOf(kingDraftId()).name }}</strong>
            </div>
            <div class="og-mk-confirm-tile">
              <span class="og-mk-confirm-kicker">Desafiante</span>
              <strong class="og-mk-confirm-value">{{ faceOf(challengerDraftId()).name }}</strong>
            </div>
            <div class="og-mk-confirm-tile">
              <span class="og-mk-confirm-kicker">Duração</span>
              <strong class="og-mk-confirm-value">{{ draftDurationMin() }} min</strong>
            </div>
            <div class="og-mk-confirm-tile">
              <span class="og-mk-confirm-kicker">Avançam</span>
              <strong class="og-mk-confirm-value">
                {{ draftQualifiers() }} dupla{{ draftQualifiers() === 1 ? '' : 's' }}
              </strong>
            </div>
          </div>
          <div class="og-mk-confirm-actions">
            <button type="button" class="og-ghost-btn" [disabled]="busy()" (click)="cancelStart()">
              Voltar e ajustar
            </button>
            <button type="button" class="og-btn-primary og-mk-confirm-go" [disabled]="busy()" (click)="confirmStart()">
              {{ busy() ? 'Iniciando…' : 'Confirmar e iniciar' }}
            </button>
          </div>
        </div>
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
    .og-mk-open .og-mk-section-rule {
      margin-left: auto;
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
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-orange-500);
    }
    .og-mk-side-badge.muted {
      color: var(--nx-text-mute);
    }
    .og-mk-side-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--nx-orange-500);
      box-shadow: 0 0 8px rgba(255, 106, 26, 0.55);
    }
    .og-mk-side-avatars {
      display: inline-flex;
      align-items: center;
      margin-top: 4px;
    }
    .og-mk-side-avatars og-avatar {
      border: 2px solid rgba(255, 255, 255, 0.1);
      border-radius: 50%;
      position: relative;
    }
    .og-mk-side.throne .og-mk-side-avatars og-avatar {
      border-color: rgba(255, 106, 26, 0.55);
    }
    .og-mk-side-avatars og-avatar + og-avatar {
      margin-left: -18px;
    }
    .og-mk-side-avatars og-avatar:nth-child(1) {
      z-index: 1;
    }
    .og-mk-side-avatars og-avatar:nth-child(2) {
      z-index: 2;
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
    .og-mk-side-pts {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      margin: 6px 0 0;
      color: var(--nx-orange-500);
    }
    .og-mk-side-pts strong {
      font-family: var(--nx-font-display);
      font-size: 56px;
      font-weight: 800;
      line-height: 0.95;
      letter-spacing: -0.03em;
      font-variant-numeric: tabular-nums;
    }
    .og-mk-side-pts span {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.14em;
    }
    .og-mk-side-pts.muted {
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
    .og-mk-order-n.lead {
      color: var(--nx-orange-500);
    }
    .og-mk-order-avatars {
      display: inline-flex;
      align-items: center;
    }
    .og-mk-order-avatars og-avatar {
      border: 2px solid rgba(255, 255, 255, 0.08);
      border-radius: 50%;
      position: relative;
    }
    .og-mk-order-avatars og-avatar + og-avatar {
      margin-left: -10px;
    }
    .og-mk-order-avatars og-avatar:nth-child(1) {
      z-index: 1;
    }
    .og-mk-order-avatars og-avatar:nth-child(2) {
      z-index: 2;
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
    .og-mk-order-pts {
      font-family: var(--nx-font-mono);
      font-size: 16px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      min-width: 1.5ch;
      text-align: right;
    }
    .og-mk-order-role {
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.08em;
      color: var(--nx-text-dim);
      white-space: nowrap;
    }
    .og-mk-order-role[data-role='trono'] {
      color: var(--nx-orange-500);
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
    .og-mk-config {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    .og-mk-config-block .og-mk-panel-title {
      margin-bottom: 10px;
    }
    .og-mk-chips {
      display: flex;
      gap: 8px;
    }
    .og-mk-chip {
      flex: 1 1 0;
      min-width: 0;
      height: 40px;
      padding: 0 8px;
      border-radius: 12px;
      border: 1px solid var(--nx-line);
      background: var(--nx-surface-1);
      color: var(--nx-text-mute);
      font: inherit;
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
      transition: border-color 140ms ease, color 140ms ease, background 140ms ease;
    }
    .og-mk-chip:hover:not(.active) {
      border-color: color-mix(in srgb, var(--nx-line) 60%, var(--nx-text-mute));
      color: var(--nx-text);
    }
    .og-mk-chip.active {
      border-color: var(--nx-orange-500);
      color: var(--nx-orange-500);
      background: color-mix(in srgb, var(--nx-surface-1) 88%, var(--nx-orange-500));
    }
    .og-mk-rules {
      margin: 0;
      padding: 0;
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .og-mk-rules li {
      position: relative;
      padding-left: 16px;
      font-size: 13px;
      line-height: 1.45;
    }
    .og-mk-rules li::before {
      content: '';
      position: absolute;
      left: 0;
      top: 6px;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--nx-orange-500);
    }
    .og-mk-rules strong {
      display: block;
      color: var(--nx-text);
      font-weight: 700;
    }
    .og-mk-rules span {
      display: block;
      color: var(--nx-text-mute);
    }
    .og-mk-telao {
      display: grid;
      grid-template-columns: 88px minmax(0, 1fr);
      gap: 12px;
      align-items: center;
    }
    .og-mk-telao-qr {
      width: 88px;
      height: 88px;
      display: grid;
      place-items: center;
      border-radius: 12px;
      background: #fff;
      border: 1px solid var(--nx-line);
      overflow: hidden;
      color: var(--nx-text-dim);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .og-mk-telao-qr img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
    }
    .og-mk-telao-body {
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-width: 0;
    }
    .og-mk-telao-url {
      font-family: var(--nx-font-mono);
      font-size: 12px;
      color: var(--nx-text-mute);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .og-mk-telao-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .og-mk-telao-open,
    .og-mk-led-open {
      flex: 1 1 auto;
      justify-content: center;
      min-height: 36px;
      padding-inline: 12px;
      white-space: nowrap;
    }
    .og-mk-telao-copy {
      flex: 0 0 auto;
      justify-content: center;
      min-height: 36px;
      padding-inline: 14px;
    }
    .og-mk-start {
      height: auto;
      width: 100%;
      min-height: 64px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 14px 20px;
      border-radius: 18px;
      color: var(--nx-text-on-orange);
      line-height: 1.15;
      box-shadow: 0 10px 28px rgba(255, 106, 26, 0.28);
    }
    .og-mk-start-label {
      font-family: var(--nx-font-display);
      font-size: 17px;
      font-weight: 800;
      letter-spacing: -0.01em;
      color: inherit;
    }
    .og-mk-start-meta {
      font-family: var(--nx-font-ui);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: inherit;
      opacity: 0.92;
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
    .og-mk-live {
      display: grid;
      grid-template-columns: minmax(0, 1.55fr) minmax(260px, 0.85fr);
      gap: 18px;
      align-items: start;
      padding: 4px 0 8px;
    }
    .og-mk-live-main {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
    }
    .og-mk-live-side {
      display: flex;
      flex-direction: column;
      gap: 12px;
      position: sticky;
      top: 12px;
    }
    .og-mk-live-actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 14px;
    }
    .og-mk-live-controls {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 14px;
    }
    .og-mk-live-controls .og-mk-live-actions {
      margin-top: 0;
    }
    .og-mk-rally-king {
      flex: 1 1 180px;
      min-height: 48px;
      border-radius: 14px;
      box-shadow: 0 10px 28px rgba(255, 106, 26, 0.28);
    }
    .og-mk-rally-crown {
      flex: 1 1 200px;
      min-height: 48px;
      justify-content: center;
    }
    .og-mk-live-clock {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      text-align: center;
    }
    .og-mk-live-clock .og-mk-panel-title {
      margin-bottom: 0;
    }
    /* Peças do modo quadra: no desktop nao existem. O grupo de leitura fica em
       display:contents para o relogio seguir sendo a mesma coluna flex de sempre. */
    .og-mk-clock-read {
      display: contents;
    }
    .og-mk-quadra-back,
    .og-mk-log-toggle,
    .og-mk-log-close,
    .og-mk-log-scrim {
      display: none;
    }
    .og-mk-live-time {
      font-family: var(--nx-font-mono);
      font-size: 56px;
      font-weight: 800;
      line-height: 1;
      letter-spacing: -0.03em;
      font-variant-numeric: tabular-nums;
    }
    .og-mk-live-clock.expired .og-mk-live-time {
      color: var(--nx-pending);
    }
    .og-mk-live-clock-meta {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--nx-text-mute);
    }
    .og-mk-live-clock-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      width: 100%;
      margin-top: 8px;
    }
    .og-mk-live-clock-actions .og-ghost-btn {
      justify-content: center;
      min-height: 42px;
      font-weight: 700;
    }
    .og-mk-clock-note {
      font-size: 12px;
      color: var(--nx-text-mute);
    }
    .og-mk-live-log {
      flex: 1;
      min-height: 220px;
      display: flex;
      flex-direction: column;
    }
    .og-mk-log-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-height: 160px;
    }
    .og-mk-log-empty {
      margin: auto 0;
      padding: 24px 4px;
      font-size: 13px;
      color: var(--nx-text-mute);
      text-align: center;
    }
    .og-mk-log-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
      overflow: auto;
      max-height: 280px;
    }
    .og-mk-log-row {
      display: grid;
      grid-template-columns: 44px minmax(0, 1fr);
      gap: 10px;
      align-items: baseline;
      font-size: 13px;
      line-height: 1.4;
    }
    .og-mk-log-time {
      font-family: var(--nx-font-mono);
      font-size: 12px;
      font-weight: 600;
      color: var(--nx-text-mute);
      font-variant-numeric: tabular-nums;
    }
    .og-mk-log-text {
      min-width: 0;
      color: var(--nx-text-mute);
    }
    .og-mk-log-text strong {
      color: var(--nx-text);
      font-weight: 700;
      margin-right: 4px;
    }
    .og-mk-log-undo {
      align-self: flex-start;
      gap: 6px;
      margin-top: auto;
    }
    .og-mk-end {
      width: 100%;
      min-height: 52px;
      border-radius: 14px;
      border: 1px solid color-mix(in srgb, var(--nx-live) 45%, transparent);
      background: color-mix(in srgb, var(--nx-live) 16%, transparent);
      color: var(--nx-live);
      font: inherit;
      font-weight: 800;
      font-size: 15px;
      cursor: pointer;
      transition: background 140ms ease, border-color 140ms ease;
    }
    .og-mk-end:hover:not(:disabled) {
      background: color-mix(in srgb, var(--nx-live) 24%, transparent);
    }
    .og-mk-end:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .og-mk-end-auto {
      width: 100%;
      min-height: 44px;
      margin-top: 0;
      border-radius: 12px;
      border: 1px solid var(--nx-line);
      background: transparent;
      color: var(--nx-text-dim);
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: color 140ms ease, border-color 140ms ease;
    }
    .og-mk-end-auto:hover:not(:disabled) {
      color: var(--nx-text);
      border-color: var(--nx-text-mute);
    }
    .og-mk-end-auto:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .og-mk-live-footer {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .og-mk-done {
      display: flex;
      flex-direction: column;
      gap: 18px;
      padding: 4px 0 8px;
    }
    .og-mk-champ {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 20px 22px;
      border-radius: 18px;
      border: 1px solid rgba(255, 106, 26, 0.45);
      background: linear-gradient(120deg, rgba(255, 106, 26, 0.18), rgba(20, 12, 8, 0.92) 55%);
      box-shadow: inset 0 0 0 1px rgba(255, 106, 26, 0.08);
    }
    .og-mk-champ-badge {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--nx-orange-500);
    }
    .og-mk-champ-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
      flex-wrap: wrap;
    }
    .og-mk-champ-team {
      display: flex;
      align-items: center;
      gap: 14px;
      min-width: 0;
    }
    .og-mk-champ-avatars {
      display: inline-flex;
      align-items: center;
    }
    .og-mk-champ-avatars og-avatar {
      border: 2px solid rgba(255, 106, 26, 0.55);
      border-radius: 50%;
      position: relative;
    }
    .og-mk-champ-avatars og-avatar + og-avatar {
      margin-left: -14px;
    }
    .og-mk-champ-avatars og-avatar:nth-child(1) {
      z-index: 1;
    }
    .og-mk-champ-avatars og-avatar:nth-child(2) {
      z-index: 2;
    }
    .og-mk-champ-body {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
    .og-mk-champ-name {
      font-family: var(--nx-font-display);
      font-size: 28px;
      font-weight: 800;
      letter-spacing: -0.02em;
      line-height: 1.1;
    }
    .og-mk-champ-sub {
      font-size: 13px;
      color: var(--nx-text-mute);
    }
    .og-mk-champ-stats {
      display: grid;
      grid-template-columns: repeat(4, auto);
      gap: 22px;
    }
    .og-mk-champ-stat {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 4px;
      text-align: right;
    }
    .og-mk-champ-stat strong {
      font-family: var(--nx-font-display);
      font-size: 34px;
      font-weight: 800;
      line-height: 1;
      color: var(--nx-orange-500);
      font-variant-numeric: tabular-nums;
    }
    .og-mk-champ-stat span {
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-mute);
      white-space: nowrap;
    }
    @media (max-width: 720px) {
      .og-mk-champ-stats {
        grid-template-columns: repeat(2, 1fr);
        width: 100%;
      }
      .og-mk-champ-stat {
        align-items: flex-start;
        text-align: left;
      }
    }

    .og-mk-final {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .og-mk-final-head,
    .og-mk-final-row {
      display: grid;
      grid-template-columns: 40px minmax(0, 1fr) 72px 72px 64px;
      gap: 12px;
      align-items: center;
    }
    .og-mk-final-head {
      padding: 0 16px 6px;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-mk-final-head .num {
      text-align: right;
    }
    .og-mk-final-row {
      padding: 14px 16px;
      border-radius: 14px;
      border: 1px solid var(--nx-line);
      background: var(--nx-surface-0);
    }
    .og-mk-final-row.king {
      border-color: rgba(255, 106, 26, 0.5);
      background: linear-gradient(90deg, rgba(255, 106, 26, 0.14), transparent 70%);
    }
    .og-mk-final-row.advances {
      border-color: color-mix(in srgb, var(--nx-win) 45%, transparent);
      background: linear-gradient(90deg, color-mix(in srgb, var(--nx-win) 14%, transparent), transparent 70%);
    }
    .og-mk-final-place {
      font-family: var(--nx-font-mono);
      font-weight: 800;
      font-size: 15px;
      color: var(--nx-text-mute);
    }
    .og-mk-final-row.king .og-mk-final-place {
      color: var(--nx-orange-500);
    }
    .og-mk-final-row.advances .og-mk-final-place {
      color: var(--nx-win);
    }
    .og-mk-final-dupla {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }
    .og-mk-final-avatars {
      display: inline-flex;
      align-items: center;
      flex: none;
    }
    .og-mk-final-avatars og-avatar {
      border: 2px solid rgba(255, 255, 255, 0.08);
      border-radius: 50%;
      position: relative;
    }
    .og-mk-final-avatars og-avatar + og-avatar {
      margin-left: -10px;
    }
    .og-mk-final-avatars og-avatar:nth-child(1) {
      z-index: 1;
    }
    .og-mk-final-avatars og-avatar:nth-child(2) {
      z-index: 2;
    }
    .og-mk-final-body {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .og-mk-final-name {
      font-weight: 700;
      font-size: 15px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .og-mk-final-sub {
      font-size: 11px;
      color: var(--nx-text-dim);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .og-mk-final-tag {
      flex: none;
      margin-left: auto;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .og-mk-final-tag.king {
      color: var(--nx-orange-500);
      background: rgba(255, 106, 26, 0.16);
      border: 1px solid rgba(255, 106, 26, 0.4);
    }
    .og-mk-final-tag.advances {
      color: var(--nx-win);
      background: color-mix(in srgb, var(--nx-win) 16%, transparent);
      border: 1px solid color-mix(in srgb, var(--nx-win) 40%, transparent);
    }
    .og-mk-final-num {
      text-align: right;
      font-family: var(--nx-font-mono);
      font-size: 15px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      color: var(--nx-text-mute);
    }
    .og-mk-final-pts {
      text-align: right;
      font-family: var(--nx-font-display);
      font-size: 24px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      line-height: 1;
    }
    .og-mk-final-row.king .og-mk-final-pts {
      color: var(--nx-orange-500);
    }
    .og-mk-final-row.advances .og-mk-final-pts {
      color: var(--nx-win);
    }
    .og-mk-final-legend {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 10px 0 0;
      font-size: 13px;
      color: var(--nx-text-mute);
    }
    .og-mk-final-dot {
      width: 10px;
      height: 10px;
      border-radius: 3px;
      background: var(--nx-win);
      flex: none;
    }
    .og-mk-final-rule {
      margin: 0;
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .og-mk-done-foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: nowrap;
      margin-top: 4px;
      padding: 16px 0 4px;
      border-top: 1px solid var(--nx-line);
    }
    .og-mk-done-status {
      flex: 1 1 auto;
      min-width: 0;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      line-height: 1.35;
    }
    .og-mk-done-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 0 0 auto;
      flex-wrap: nowrap;
      margin-left: auto;
    }
    .og-mk-done-back {
      padding: 0 4px;
      font-size: 13px;
      font-weight: 700;
      color: var(--nx-text);
      text-decoration: none;
      white-space: nowrap;
    }
    .og-mk-done-back:hover {
      color: var(--nx-orange-500);
    }
    .og-mk-done-btn {
      min-height: 36px;
      height: 36px;
      padding-inline: 12px;
      border-radius: 10px;
      justify-content: center;
      white-space: nowrap;
      font-size: 13px;
      font-weight: 600;
    }
    .og-mk-done-btn.solid {
      font-weight: 700;
      background: var(--nx-surface-1);
      border-color: color-mix(in srgb, var(--nx-line) 70%, var(--nx-text-mute));
    }
    .og-mk-homolog {
      min-height: 36px;
      height: 36px;
      width: auto;
      min-width: 0;
      padding-inline: 14px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 800;
      color: var(--nx-text-on-orange);
      box-shadow: 0 8px 20px rgba(255, 106, 26, 0.24);
      white-space: nowrap;
    }
    .og-mk-lead {
      margin: 0;
      font-size: 13px;
      color: var(--nx-text-mute);
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
      color: var(--nx-orange-500);
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
    .og-mk-fault {
      width: 100%;
      margin-top: 0;
      padding: 10px 12px;
      border: 1px dashed rgb(255 255 255 / 22%);
      border-radius: 12px;
      background: none;
      color: inherit;
      opacity: 0.75;
      font: inherit;
      font-size: 13px;
      cursor: pointer;
    }
    .og-mk-fault:disabled {
      opacity: 0.4;
      cursor: default;
    }

    /* ── Empate na vaga (protótipos: card, alerta, grade de quem pontuou) ─ */
    .og-mk-tie {
      margin-top: 14px;
      padding: 16px;
      border: 1px solid color-mix(in srgb, var(--nx-pending) 55%, transparent);
      border-radius: 14px;
      background: color-mix(in srgb, var(--nx-pending) 6%, var(--nx-surface-0));
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .og-mk-tie-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }
    .og-mk-tie-titles {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
    .og-mk-tie-kicker {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      color: var(--nx-pending);
    }
    .og-mk-tie-title {
      margin: 0;
      font-family: var(--nx-font-display);
      font-size: 18px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: var(--nx-text);
      line-height: 1.2;
    }
    .og-mk-tie-chip {
      flex: none;
      align-self: center;
      padding: 6px 12px;
      border: 1px solid var(--nx-pending);
      border-radius: 999px;
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.06em;
      color: var(--nx-pending);
      white-space: nowrap;
    }
    .og-mk-tie-alert {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 12px 14px;
      border-radius: 12px;
      border-left: 3px solid var(--nx-pending);
      background: color-mix(in srgb, var(--nx-pending) 10%, var(--nx-surface-1));
    }
    .og-mk-tie-alert--ok {
      border-left-color: var(--nx-orange-500);
      background: color-mix(in srgb, var(--nx-orange-500) 10%, var(--nx-surface-1));
    }
    .og-mk-tie-alert-lead {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      margin: 0;
      font-size: 13.5px;
      line-height: 1.45;
      color: var(--nx-text);
    }
    .og-mk-tie-alert-lead og-icon {
      flex: none;
      margin-top: 1px;
      color: var(--nx-pending);
    }
    .og-mk-tie-alert--ok .og-mk-tie-alert-lead og-icon {
      color: var(--nx-orange-500);
    }
    .og-mk-tie-alert-lead em {
      font-style: normal;
      font-weight: 800;
      color: var(--nx-pending);
    }
    .og-mk-tie-alert-lead strong {
      color: var(--nx-orange-500);
      font-weight: 800;
    }
    .og-mk-tie-roles {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 8px 0;
      padding-top: 10px;
      border-top: 1px solid color-mix(in srgb, var(--nx-line) 80%, transparent);
      font-size: 13px;
    }
    .og-mk-tie-sep {
      width: 1px;
      height: 12px;
      margin: 0 12px;
      background: var(--nx-line);
      align-self: center;
    }
    .og-mk-tie-role {
      display: inline-flex;
      align-items: baseline;
      gap: 6px;
    }
    .og-mk-tie-role .papel {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-mute);
    }
    .og-mk-tie-role--throne .papel {
      color: var(--nx-orange-500);
    }
    .og-mk-tie-role .dupla {
      color: var(--nx-text);
      font-weight: 600;
    }

    .og-mk-golden {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .og-mk-golden-kicker {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--nx-text-mute);
    }
    .og-mk-golden-grid {
      display: grid;
      gap: 8px;
    }
    /* 2 ou 4 empatadas: grade; 3: lista vertical (lê-se melhor no tablet da mesa). */
    .og-mk-tie[data-count='2'] .og-mk-golden-grid,
    .og-mk-tie[data-count='4'] .og-mk-golden-grid {
      grid-template-columns: 1fr 1fr;
    }
    .og-mk-tie[data-count='3'] .og-mk-golden-grid {
      grid-template-columns: 1fr;
    }
    .og-mk-golden-card {
      display: flex;
      align-items: center;
      min-width: 0;
      gap: 12px;
      min-height: 52px;
      padding: 12px 14px;
      border: 1px solid var(--nx-line);
      border-radius: 12px;
      background: var(--nx-surface-1);
      color: var(--nx-text);
      font: inherit;
      text-align: left;
      cursor: pointer;
      transition:
        border-color 120ms ease,
        background 120ms ease;
    }
    .og-mk-golden-card:hover:not(:disabled) {
      border-color: color-mix(in srgb, var(--nx-pending) 55%, var(--nx-line));
      background: color-mix(in srgb, var(--nx-pending) 8%, var(--nx-surface-1));
    }
    .og-mk-golden-card:disabled {
      opacity: 0.45;
      cursor: default;
    }
    .og-mk-golden-ini {
      flex: none;
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      font-family: var(--nx-font-mono);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: var(--nx-text-mute);
    }
    .og-mk-golden-name {
      flex: 1;
      min-width: 0;
      font-weight: 800;
      font-size: 14.5px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .og-mk-golden-pts {
      flex: none;
      font-family: var(--nx-font-mono);
      font-size: 13px;
      font-weight: 600;
      color: var(--nx-text-mute);
    }
    /* Com 2/4 em grade, o placar some — o mesário só aponta quem pontuou. */
    .og-mk-tie[data-count='2'] .og-mk-golden-pts,
    .og-mk-tie[data-count='4'] .og-mk-golden-pts {
      display: none;
    }

    .og-mk-feedback {
      margin: 8px 0 0;
      font-size: 13px;
    }
    .og-mk-feedback.err {
      color: var(--nx-pending);
    }

    /* ── Confirmar início ───────────────────────────────────── */
    .og-mk-confirm-backdrop {
      position: fixed;
      inset: 0;
      z-index: 60;
      display: grid;
      place-items: center;
      padding: 20px;
      background: rgba(7, 7, 8, 0.72);
      backdrop-filter: blur(5px);
    }
    .og-mk-confirm {
      width: min(480px, 100%);
      padding: 22px;
      border-radius: var(--nx-r-4);
      border: 1px solid var(--nx-line);
      background: var(--nx-surface-0);
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
    }
    .og-mk-confirm-badge {
      display: inline-flex;
      align-items: center;
      padding: 5px 10px;
      border-radius: 999px;
      border: 1px solid color-mix(in srgb, var(--nx-orange-500) 55%, transparent);
      color: var(--nx-orange-500);
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    .og-mk-confirm-title {
      margin: 12px 0 0;
      font-family: var(--nx-font-display);
      font-size: 22px;
      font-weight: 800;
      line-height: 1.25;
      color: var(--nx-text);
    }
    .og-mk-confirm-text {
      margin: 10px 0 0;
      font-size: 13px;
      line-height: 1.55;
      color: var(--nx-text-mute);
    }
    .og-mk-confirm-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 18px;
    }
    .og-mk-confirm-tile {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
      padding: 12px 14px;
      border-radius: 12px;
      border: 1px solid var(--nx-line);
      background: var(--nx-surface-1);
    }
    .og-mk-confirm-kicker {
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-mk-confirm-value {
      font-size: 14px;
      font-weight: 800;
      color: var(--nx-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .og-mk-confirm-actions {
      display: flex;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 20px;
    }
    .og-mk-confirm-go {
      width: auto;
      min-width: 168px;
      height: 44px;
      padding-inline: 18px;
      border-radius: 12px;
      box-shadow: 0 10px 28px rgba(255, 106, 26, 0.28);
    }

    /* ── Modo quadra: tablet e celular na areia ───────────────────────────
       Na quadra a mesa vira aplicação de tela cheia e NÃO rola: quem marca ponto
       a cada rally não pode caçar o botão dentro de um scroll. O bloco ao vivo
       sai do fluxo do painel e cobre topbar + cabeçalho da página — uns 115px de
       altura que voltam pro placar. Saída pelo ← da barra de comando.

       Quatro faixas, de cima pra baixo:
         comando (relógio + encerrar) · confronto · fila (a única que rola) · ações.

       Encerrar fica em cima DE PROPÓSITO, longe do polegar que marca ponto.
       Desktop (>1024px) não muda: lá o aside volta a ser coluna. */
    @media (max-width: 1023.98px) {
      .og-mk-live {
        position: fixed;
        inset: 0;
        z-index: 40;
        background: var(--nx-bg);
        display: grid;
        /* Áreas NOMEADAS, não posições: o bloco de empate entra e sai do DOM e
           linha posicional de grid se desloca junto quando um filho some. */
        align-items: stretch;
        grid-template-columns: minmax(0, 1fr) minmax(0, 136px);
        grid-template-areas:
          'clock end'
          'duel duel'
          'queue queue';
        /* A sobra de altura vai pro CONFRONTO, nao pro rodape: o placar e o que se
           le de longe, em pe, com sol na tela. A fila cede (minmax 0) e rola. */
        grid-template-rows: auto minmax(0, 1fr) minmax(0, auto);
        gap: 10px;
        padding: calc(8px + env(safe-area-inset-top, 0px)) 12px
          calc(8px + env(safe-area-inset-bottom, 0px));
        overflow: hidden;
      }
      /* display:contents sobe confronto/fila/relógio/log/encerrar pro grid da mesa —
         sem isso o aside empacotaria os três últimos num bloco só, embaixo de tudo. */
      .og-mk-live-main,
      .og-mk-live-side {
        display: contents;
      }

      /* ── Barra de comando ─────────────────────────────────────── */
      .og-mk-live-clock {
        grid-area: clock;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: center;
        gap: 10px;
        padding: 6px 10px;
        text-align: left;
      }
      /* O relógio se explica sozinho; o rótulo custava uma linha inteira. */
      .og-mk-live-clock .og-mk-panel-title {
        display: none;
      }
      .og-mk-quadra-back {
        display: inline-grid;
        place-items: center;
        width: 40px;
        height: 40px;
        border-radius: 12px;
        border: 1px solid var(--nx-line);
        background: var(--nx-surface-1);
        color: var(--nx-text-mute);
      }
      .og-mk-clock-read {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 1px;
        min-width: 0;
      }
      .og-mk-live-time {
        font-size: 30px;
      }
      .og-mk-live-clock-meta,
      .og-mk-clock-note {
        max-width: 100%;
        margin: 0;
        font-size: 10px;
        letter-spacing: 0.08em;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .og-mk-live-clock-actions {
        width: auto;
        margin-top: 0;
        grid-template-columns: auto auto;
        gap: 6px;
      }
      .og-mk-live-clock-actions .og-ghost-btn {
        min-height: 44px;
        min-width: 0;
        padding-inline: 12px;
        font-size: 12px;
      }
      .og-mk-live-footer {
        grid-area: end;
        align-self: center;
      }
      .og-mk-end {
        width: 100%;
        min-height: 44px;
        padding: 6px 12px;
        font-size: 13px;
        line-height: 1.15;
        white-space: normal;
      }
      .og-mk-end-auto {
        min-height: 40px;
        padding: 6px 10px;
        font-size: 11px;
        line-height: 1.15;
      }

      /* ── Confronto ────────────────────────────────────────────── */
      .og-mk-live .og-mk-open {
        grid-area: duel;
        display: flex;
        flex-direction: column;
        min-height: 0;
      }
      .og-mk-live .og-mk-sides {
        flex: 1;
        min-height: 0;
      }
      .og-mk-live .og-mk-side-name {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      /* O placar acompanha a altura que sobrou: no iPad em pé ele é enorme, no
         telefone encolhe sem empurrar os botões pra fora da tela. */
      .og-mk-live .og-mk-side-pts strong {
        font-size: clamp(38px, 10vh, 124px);
      }
      .og-mk-live .og-mk-side-name {
        font-size: clamp(15px, 2.2vh, 26px);
      }
      .og-mk-live .og-mk-side {
        justify-content: center;
      }

      /* ── Fila ─────────────────────────────────────────────────── */
      .og-mk-live .og-mk-order {
        grid-area: queue;
        display: flex;
        flex-direction: column;
        min-height: 0;
      }
      .og-mk-live .og-mk-order > .og-mk-section-head {
        flex: none;
        margin-bottom: 8px;
      }
      .og-mk-log-toggle {
        display: inline-flex;
        margin-left: auto;
        min-height: 36px;
        padding-inline: 12px;
        font-size: 12px;
      }
      /* Trono e desafiante já estão no confronto, em corpo grande. Repeti-los aqui
         gastava ~96px de altura pra mostrar duas vezes a mesma dupla. Só isto vale
         duas linhas de fila. Na PREPARAÇÃO a lista continua inteira — lá ela é o
         que se arrasta pra definir a ordem. */
      .og-mk-live .og-mk-order-row.throne,
      .og-mk-live .og-mk-order-row.challenger {
        display: none;
      }
      /* A fila é a única faixa que rola, e é a que cede altura quando aperta. */
      .og-mk-live .og-mk-order-list {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        gap: 6px;
      }
      .og-mk-order-row {
        padding: 8px 10px;
        gap: 8px;
        min-height: 48px;
      }

      /* ── Ações: sempre no rodapé da faixa da fila, sem sticky ───── */
      .og-mk-live .og-mk-live-controls {
        flex: none;
        margin-top: 10px;
      }
      .og-mk-live-actions {
        flex-wrap: nowrap;
        gap: 8px;
        margin-top: 0;
      }
      .og-mk-rally-king,
      .og-mk-rally-crown {
        flex: 1 1 0;
        min-width: 0;
        min-height: clamp(58px, 8.5vh, 88px);
        font-size: 15px;
        font-weight: 800;
        line-height: 1.15;
        white-space: normal;
        border-radius: 14px;
      }
      .og-mk-rally-crown {
        border-color: color-mix(in srgb, var(--nx-orange-500) 45%, transparent);
        background: color-mix(in srgb, var(--nx-orange-500) 12%, var(--nx-surface-1));
        color: var(--nx-text);
      }
      .og-mk-fault {
        min-height: 44px;
        font-size: 12.5px;
      }

      /* ── Log: gaveta ──────────────────────────────────────────── */
      .og-mk-live-log {
        display: none;
      }
      .og-mk-live-log.open {
        display: flex;
        position: fixed;
        z-index: 46;
        left: 12px;
        right: 12px;
        bottom: calc(10px + env(safe-area-inset-bottom, 0px));
        flex-direction: column;
        min-height: 0;
        max-height: 60dvh;
        border-radius: 16px;
        box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.55);
      }
      .og-mk-live-log.open .og-mk-log-body {
        min-height: 0;
        overflow: hidden;
      }
      .og-mk-live-log.open .og-mk-log-list {
        flex: 1 1 auto;
        min-height: 0;
        max-height: none;
        overflow-y: auto;
      }
      .og-mk-live-log.open .og-mk-log-undo {
        flex: none;
        min-height: 44px;
        align-self: stretch;
        justify-content: center;
      }
      /* Espaco pro X nao montar em cima do titulo. */
      .og-mk-live-log.open .og-mk-panel-title {
        padding-right: 48px;
      }
      .og-mk-log-scrim {
        display: block;
        position: fixed;
        inset: 0;
        z-index: 45;
        border: 0;
        padding: 0;
        background: rgba(0, 0, 0, 0.55);
      }
      .og-mk-log-close {
        display: inline-grid;
        place-items: center;
        position: absolute;
        top: 8px;
        right: 8px;
        width: 40px;
        height: 40px;
        border-radius: 12px;
        border: 1px solid var(--nx-line);
        background: var(--nx-surface-1);
        color: var(--nx-text-mute);
        cursor: pointer;
      }

      /* ── Empate: a bola de ouro toma a tela ───────────────────── */
      .og-mk-live .og-mk-order:has(.og-mk-tie) .og-mk-live-controls {
        display: none;
      }
      .og-mk-live .og-mk-tie {
        flex: none;
        margin-top: 10px;
      }
      .og-mk-live:has(.og-mk-tie) {
        grid-template-rows: auto 0 minmax(0, 1fr);
      }
      .og-mk-live:has(.og-mk-tie) .og-mk-open {
        display: none;
      }
      .og-mk-live:has(.og-mk-tie) .og-mk-end {
        display: none;
      }
      /* Com o confronto fora, a fila volta a listar TODAS as duplas: no empate a
         classificacao inteira e que importa — e ela que produziu o empate. */
      .og-mk-live:has(.og-mk-tie) .og-mk-order-row.throne,
      .og-mk-live:has(.og-mk-tie) .og-mk-order-row.challenger {
        display: grid;
      }
      /* O card de empate NAO estica nem encolhe: com min-height:0 ele afundava abaixo
         do proprio conteudo no telefone e o alerta vazava por cima da fila. Quem cede
         altura e a lista, que rola. Os cards da bola de ouro crescem so ate onde a
         tela permite — sao o alvo de toque da mesa durante o desempate. */
      .og-mk-live:has(.og-mk-tie) .og-mk-golden-card {
        min-height: clamp(56px, 9vh, 96px);
      }

      /* ── Densidade comum às três telas ────────────────────────── */
      .og-mk-open,
      .og-mk-order,
      .og-mk-panel {
        padding: 12px 14px;
      }
      .og-mk-sides {
        gap: 10px;
      }
      .og-mk-side {
        padding: 12px 10px;
        gap: 6px;
        min-width: 0;
      }
      .og-mk-side-name {
        font-size: 15px;
      }
      .og-mk-order-list {
        gap: 6px;
      }
      .og-mk-tie {
        padding: 12px;
        gap: 12px;
      }
      .og-mk-tie-head {
        flex-wrap: wrap;
      }
      .og-mk-tie-chip {
        align-self: flex-start;
      }
      .og-mk-tie-title {
        font-size: 16px;
      }
      .og-mk-tie[data-count='2'] .og-mk-golden-grid,
      .og-mk-tie[data-count='4'] .og-mk-golden-grid {
        grid-template-columns: 1fr;
      }
      .og-mk-tie[data-count='2'] .og-mk-golden-pts,
      .og-mk-tie[data-count='4'] .og-mk-golden-pts {
        display: inline;
      }
      .og-mk-golden-card {
        min-height: 56px;
        padding: 14px 16px;
      }
      .og-mk-golden-name {
        font-size: 16px;
      }

      /* ── Preparação: iniciar fica no polegar ──────────────────── */
      .og-mk-prep-side {
        position: static;
      }
      .og-mk-start {
        position: sticky;
        bottom: 0;
        z-index: 30;
        margin: 0 -4px;
        padding-bottom: calc(14px + env(safe-area-inset-bottom, 0px));
        border-radius: 18px 18px 0 0;
        box-shadow: 0 -8px 28px rgba(0, 0, 0, 0.35), 0 10px 28px rgba(255, 106, 26, 0.28);
      }
      .og-mk-move {
        width: 40px;
        height: 40px;
      }
      .og-mk-chip {
        min-height: 44px;
        height: 44px;
      }

      .og-mk-done-foot {
        flex-direction: column;
        align-items: stretch;
        gap: 12px;
      }
      .og-mk-done-actions {
        flex-wrap: wrap;
        margin-left: 0;
      }

      .og-mk-confirm-grid {
        grid-template-columns: 1fr;
      }
      .og-mk-confirm-actions {
        flex-direction: column-reverse;
      }
      .og-mk-confirm-actions .og-ghost-btn,
      .og-mk-confirm-go {
        width: 100%;
        min-height: 48px;
      }
    }

    @media (max-width: 639.98px) {
      .og-mk-live {
        gap: 8px;
        padding-inline: 8px;
      }
      .og-mk-live-clock {
        grid-template-columns: auto minmax(0, 1fr);
        grid-template-areas:
          'back read'
          'acts acts';
        gap: 6px 8px;
        padding: 6px 8px;
      }
      .og-mk-quadra-back {
        grid-area: back;
      }
      .og-mk-clock-read {
        grid-area: read;
      }
      .og-mk-live-clock-actions {
        grid-area: acts;
        width: 100%;
        grid-template-columns: 1fr 1fr;
      }
      .og-mk-live-time {
        font-size: 26px;
      }
      .og-mk-live-clock-actions .og-ghost-btn {
        padding-inline: 9px;
        font-size: 11px;
      }
      .og-mk-end {
        padding-inline: 10px;
        font-size: 12px;
      }

      /* O confronto CONTINUA lado a lado no telefone. Empilhar as duas duplas era
         o que estourava a altura e obrigava a rolar pra achar o botão de ponto. */
      .og-mk-live .og-mk-open > .og-mk-section-head {
        display: none;
      }
      .og-mk-live .og-mk-side-avatars {
        display: none;
      }
      .og-mk-live .og-mk-side-sub {
        display: none;
      }
      .og-mk-live .og-mk-side {
        padding: 10px 8px;
      }
      .og-mk-live .og-mk-side-name {
        font-size: 13px;
      }
      .og-mk-live .og-mk-side-badge {
        font-size: 10px;
        letter-spacing: 0.06em;
      }
      .og-mk-vs {
        font-size: 11px;
      }

      /* Sem o papel, a linha da fila fica: nº · avatares · dupla · pts. As colunas
         precisam ser redeclaradas — esconder um filho desloca as trilhas de grid. */
      .og-mk-live .og-mk-order-row {
        grid-template-columns: 22px auto minmax(0, 1fr) auto;
      }
      .og-mk-prep .og-mk-order-row {
        grid-template-columns: 24px auto minmax(0, 1fr) auto;
      }
      .og-mk-order-role {
        display: none;
      }

      .og-mk-rally-king,
      .og-mk-rally-crown {
        font-size: 13.5px;
        letter-spacing: -0.01em;
      }
      .og-mk-fault {
        font-size: 11.5px;
      }

      .og-mk-open .og-mk-section-rule {
        display: none;
      }
      .og-mk-tie-roles {
        flex-direction: column;
        gap: 6px;
      }
      .og-mk-tie-sep {
        display: none;
      }

      /* Tabela final: as colunas de numero encolhem e os avatares saem — o que
         precisa de largura e o nome da dupla. O selo desce pra baixo do nome em vez
         de disputar a mesma linha com ele. */
      .og-mk-final-head,
      .og-mk-final-row {
        grid-template-columns: 22px minmax(0, 1fr) 42px 42px 42px;
        gap: 8px;
      }
      .og-mk-final-head {
        padding: 0 12px 6px;
        font-size: 9px;
        letter-spacing: 0.06em;
      }
      .og-mk-final-row {
        padding: 12px;
      }
      .og-mk-final-avatars {
        display: none;
      }
      .og-mk-final-dupla {
        flex-direction: column;
        align-items: flex-start;
        gap: 2px;
      }
      .og-mk-final-name {
        font-size: 14px;
      }
      .og-mk-champ-name {
        font-size: 21px;
      }

      /* Homologar e a acao que fecha a rodada: linha inteira, longe das outras. */
      .og-mk-done-actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        width: 100%;
      }
      .og-mk-done-back,
      .og-mk-homolog {
        grid-column: 1 / -1;
      }
      .og-mk-done-back {
        display: grid;
        place-items: center;
        min-height: 44px;
      }
      .og-mk-done-btn,
      .og-mk-homolog {
        justify-content: center;
        min-height: 44px;
      }
    }

    @media (pointer: coarse) {
      .og-mk-rally-king,
      .og-mk-rally-crown {
        min-height: 56px;
      }
      .og-mk-golden-card {
        min-height: 52px;
      }
      .og-mk-live-clock-actions .og-ghost-btn,
      .og-mk-end,
      .og-mk-end-auto {
        min-height: 48px;
      }
    }
  `,
})
export class MesaKocComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly ctx = inject(ChaveamentoContextService);

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
  protected readonly telaoQr = signal<string | null>(null);
  protected readonly confirmStartOpen = signal(false);
  /** Gaveta do log — so existe no modo quadra (tablet/celular); no desktop o log e
   *  um painel fixo da coluna lateral e este sinal nao tem efeito nenhum. */
  protected readonly logOpen = signal(false);

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

    effect(() => {
      const tid = this.id();
      this.telaoQr.set(null);
      if (!tid) return;
      const url = this.telaoAbsoluteUrl();
      void shareQrSvgDataUrl(url).then((src) => {
        if (this.id() === tid) this.telaoQr.set(src);
      });
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

  protected readonly finalRows = computed(() => {
    const r = this.round();
    if (!r) return [];
    const wins = new Map<string, number>();
    for (const line of kocLogLines(r)) {
      wins.set(line.teamId, (wins.get(line.teamId) ?? 0) + 1);
    }
    return kocFinalTable(r).map((row) => ({
      teamId: row.teamId,
      place: row.place,
      name: this.faceOf(row.teamId).name,
      points: row.points,
      crowns: row.crowns,
      rallyWins: wins.get(row.teamId) ?? 0,
      qualifies: row.place <= r.qualifiersPerRound,
    }));
  });

  protected readonly champion = computed(() => this.finalRows().find((r) => r.place === 1) ?? null);

  protected durationLabel(): string {
    const sec = this.round()?.configuredDurationSec ?? this.round()?.clock?.durationSec ?? 900;
    return `${Math.max(1, Math.round(sec / 60))}'`;
  }

  protected doneFootStatus(): string {
    const sec = Math.round(KOC_FINISHED_SHOWCASE_MS / 1000);
    return `Telão exibindo os resultados por ${sec}s · resultado ainda não homologado`;
  }

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

  protected readonly liveQueueRows = computed(() => {
    const r = this.round();
    if (!r?.kingTeamId || !r.challengerTeamId) return [];
    const ids = [r.kingTeamId, r.challengerTeamId, ...r.queue];
    return ids.map((teamId, i) => {
      const role: 'trono' | 'desafia' | 'fila' = i === 0 ? 'trono' : i === 1 ? 'desafia' : 'fila';
      const roleLabel =
        role === 'trono' ? 'TRONO' : role === 'desafia' ? 'DESAFIA' : `${i - 1}º NA FILA`;
      return {
        teamId,
        place: i + 1,
        points: kocPointsOf(r, teamId),
        role,
        roleLabel,
      };
    });
  });

  protected readonly logRows = computed(() => {
    const r = this.round();
    if (!r) return [];
    return kocLogLines(r).map((line) => ({
      key: line.key,
      time: formatLogTime(line.atMs),
      name: this.faceOf(line.teamId).name,
      action: LOG_ACTION[line.kind],
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

  protected confirmStartTitle(): string {
    const m = this.match();
    const n = m?.koc?.roundLabel || m?.matchNumber || 0;
    const court = (formatCourtLabel(m?.court ?? '') || 'quadra').toLowerCase();
    const roundBit = n > 0 ? `rodada ${n}` : 'rodada';
    return `Iniciar a ${roundBit} na ${court}?`;
  }

  protected askStart(): void {
    if (!this.canStart() || this.busy()) return;
    this.feedback.set(null);
    this.confirmStartOpen.set(true);
  }

  protected cancelStart(): void {
    if (this.busy()) return;
    this.confirmStartOpen.set(false);
  }

  protected onDocEscape(): void {
    if (this.confirmStartOpen()) this.cancelStart();
    else if (this.logOpen()) this.logOpen.set(false);
  }

  protected confirmStart(): void {
    if (!this.canStart() || this.busy()) return;
    void this.run(async () => {
      await startKocRound({
        matchId: this.matchId(),
        teamIds: this.draftOrder(),
        durationSec: this.draftDurationMin() * 60,
        qualifiersPerRound: this.draftQualifiers(),
      });
      this.confirmStartOpen.set(false);
    }, 'Rodada iniciada.');
  }

  /** Painel de LED da quadra desta rodada. Vazio (botão escondido) enquanto a partida não tem
   *  quadra: o painel segue a QUADRA, não a partida. */
  protected readonly ledHref = computed(() => ledPanelHref(this.id(), this.match()?.courtId ?? ''));

  protected telaoHref(): string {
    return `/telao/${encodeURIComponent(this.id())}`;
  }

  protected telaoAbsoluteUrl(): string {
    if (typeof location === 'undefined') return this.telaoHref();
    return `${location.origin}${this.telaoHref()}`;
  }

  protected telaoDisplayUrl(): string {
    try {
      const u = new URL(this.telaoAbsoluteUrl());
      return `${u.host}${u.pathname}`;
    } catch {
      return this.telaoHref().replace(/^\//, '');
    }
  }

  protected async copyTelaoLink(): Promise<void> {
    const url = this.telaoAbsoluteUrl();
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

  protected exportTable(): void {
    const rows = this.finalRows();
    if (rows.length === 0) return;
    const lines = [
      'pos,dupla,coroas,rallys,pts',
      ...rows.map(
        (r) =>
          `${r.place},"${r.name.replace(/"/g, '""')}",${r.crowns},${r.rallyWins},${r.points}`,
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `koc-rodada-${this.matchId() || 'tabela'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this.feedback.set({ ok: true, message: 'Tabela exportada.' });
  }

  protected homologate(): void {
    void this.run(async () => {
      await validateMatchResult(this.matchId());
      await this.ctx.reloadMatches();
      await this.router.navigate(this.backLink());
    }, null);
  }

  protected askCorrectScore(): void {
    this.feedback.set({
      ok: false,
      message:
        'Para corrigir a pontuação, a rodada precisa ser reaberta antes. Isso ainda não está disponível nesta tela.',
    });
  }

  /** Mesmo rótulo do telão da quadra — chave e bateria incluídas. Sem elas o
   *  tablet dizia "Rodada 2" para a rodada que o telão ao lado chama de
   *  "Chave 4 · Bateria 3", e casar as duas telas é o que decide qual bateria
   *  o mesário abre. */
  protected phaseLabel(): string {
    const m = this.match();
    return m ? kocMatchPhaseLabel(m, m.koc) : 'Rodada';
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

  protected clockMeta(): string {
    const r = this.round();
    const sec = r?.clock?.durationSec ?? r?.configuredDurationSec ?? 900;
    const min = Math.max(1, Math.round(sec / 60));
    const court = (formatCourtLabel(this.match()?.court ?? '') || 'Quadra').toUpperCase();
    return `DE ${min} MIN · ${court}`;
  }

  protected expired(): boolean {
    const clock = this.round()?.clock;
    return clock != null && kocIsExpired(clock, this.nowMs());
  }

  protected paused(): boolean {
    return this.round()?.clock?.pausedAtMs != null;
  }

  protected tie(): boolean {
    return this.tieGroup().length > 0;
  }

  /** Quantas vagas o empate decide — o que o chip mostra. */
  protected readonly spotsAtStake = computed(() => {
    const r = this.round();
    return r ? kocQualifyingSpotsAtStake(r) : 0;
  });

  /** A dupla que pontuou no desempate anterior e já saiu do empate. */
  protected readonly lastTiebreakWinner = computed(() => {
    const r = this.round();
    return r ? kocLastTiebreakWinner(r) : null;
  });

  /** As empatadas na ORDEM DE ENTRADA da mini-rodada: a primeira começa no
   *  trono. Com duas é a mesma lista, e a ordem não muda nada. */
  protected readonly tieOrder = computed(() => {
    const r = this.round();
    return r ? kocTiebreakOrder(r) : [];
  });

  /** Quem joga a bola de ouro: TODAS as duplas na pontuação da última vaga —
   *  com poucos rallies, empate de três pela mesma vaga é o caso comum. */
  protected readonly tieGroup = computed(() => {
    const r = this.round();
    return r ? kocQualifyingTieGroup(r) : [];
  });

  /** Pontuação do empate — todas as empatadas têm o mesmo placar. */
  protected readonly tiePoints = computed(() => {
    const id = this.tieOrder()[0];
    return id ? this.pointsOf(id) : 0;
  });

  /** Mini-rodada atual (1-based): cada bola de ouro já registrada é uma resolvida. */
  protected readonly miniRoundNumber = computed(() => {
    const r = this.round();
    if (!r) return 1;
    return r.rallyLog.filter((e) => e.winner === 'golden_point').length + 1;
  });

  /** Papéis da mini-rodada no alerta: trono, desafia, e quem espera (agrupado). */
  protected readonly tieRoleSlots = computed(() => {
    const order = this.tieOrder();
    if (order.length < 3) return [];
    const waiting = order.slice(2);
    return [
      { role: 'TRONO', names: this.faceOf(order[0]!).name },
      { role: 'DESAFIA', names: this.faceOf(order[1]!).name },
      {
        role: waiting.length > 1 ? 'ESPERAM' : 'ESPERA',
        names: waiting.map((id) => this.faceOf(id).name).join(', '),
      },
    ];
  });

  protected tieTitle(): string {
    const n = this.tieGroup().length;
    const pts = this.tiePoints();
    const ptsLabel = pts === 1 ? '1 ponto' : `${pts} pontos`;
    return `${n} duplas empatadas em ${ptsLabel}`;
  }

  protected goldenKicker(): string {
    if (this.tieGroup().length === 2) return 'VENCEU A BOLA DE OURO';
    const n = this.miniRoundNumber();
    if (this.spotsAtStake() === 1 && n === 1) return 'PONTUOU NA MINI-RODADA';
    return `PONTUOU NA ${this.ordinalDe(n).toUpperCase()} MINI-RODADA`;
  }

  protected ordinalDe(n: number): string {
    if (n === 1) return '1ª';
    if (n === 2) return '2ª';
    if (n === 3) return '3ª';
    return `${n}ª`;
  }

  /** Iniciais da dupla pro disco do card — uma letra de cada atleta. */
  protected duoInitials(teamId: string): string {
    const players = this.faceOf(teamId).players;
    if (players.length >= 2) {
      const a = players[0]!.initials.trim().charAt(0);
      const b = players[1]!.initials.trim().charAt(0);
      if (a && b) return (a + b).toUpperCase();
    }
    return initialsOf(this.faceOf(teamId).name).slice(0, 2).toUpperCase() || '?';
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

  protected rally(outcome: KocRallyOutcome): void {
    void this.run(
      () => registerKocRally({ matchId: this.matchId(), outcome, expectedSeq: this.rallies() + 1 }),
      null,
    );
  }

  /** Bola de ouro. O servidor recusa se não houver empate na vaga ou se a
   *  dupla não estiver nele — aqui a mesa só aponta quem venceu. */
  protected golden(teamId: string): void {
    void this.run(
      () => registerKocGoldenPoint({ matchId: this.matchId(), teamId, expectedSeq: this.rallies() + 1 }),
      'Bola de ouro registrada.',
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
        // O empate é calculado no cliente; entre o render e o clique pode ter
        // entrado um rally. Se o servidor recusar, cai na MESMA confirmação da
        // saída explícita em vez de estourar um erro cru na mesa.
        if (reasonOf(error) !== 'koc_unresolved_tie') throw error;
        if (!this.confirmTiebreak()) return;
        await finishKocRound({ matchId: this.matchId(), acceptTiebreak: true });
      }
      // Lista de Jogos lê o cache do contexto — sem isto o selo "Encerrado" só
      // aparecia depois de um reload manual.
      await this.ctx.reloadMatches();
    }, 'Rodada encerrada.');
  }

  protected readonly finishBlockedLabel = computed(() =>
    kocFinishBlockedLabel(this.spotsAtStake()));

  /** Encerrar deixando a vaga sair pelo critério automático. É a saída que o
   *  regulamento prevê para quando a mesa decide não jogar o desempate. */
  protected finishByCriterion(): void {
    if (!this.confirmTiebreak()) return;
    void this.run(async () => {
      await finishKocRound({ matchId: this.matchId(), acceptTiebreak: true });
      await this.ctx.reloadMatches();
    }, 'Rodada encerrada pelo critério automático.');
  }

  /** A copy nomeia o que a mesa acabou de mostrar: com duas é bola de ouro,
   *  com três ou mais é a mini-rodada. Dizer "bola de ouro" nos dois casos era
   *  o que deixava o empate de três sem instrução. */
  private confirmTiebreak(): boolean {
    const emDisputa = this.tieGroup().length;
    const vagas = this.spotsAtStake();
    return confirm(
      `Há empate de ${emDisputa} duplas decidindo ` +
        `${vagas === 1 ? 'uma vaga' : `${vagas} vagas`}.\n\n` +
        (emDisputa === 2 ?
          'O regulamento resolve na areia: joguem a bola de ouro e registrem quem venceu. ' :
          'O regulamento resolve na areia: joguem a mini-rodada entre elas (quem pontuar ' +
            'primeiro leva a vaga) e registrem quem pontuou. ') +
        `Encerrar agora faz ${vagas === 1 ? 'a vaga sair' : 'as vagas saírem'} pelo ` +
        'desempate automático (quem foi rei por último).\n\n' +
        'Encerrar assim?',
    );
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
  if (text.length > 0) return text;
  return error instanceof Error && error.message ? error.message : 'Não foi possível registrar. Tente de novo.';
}

const LOG_TIME = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'America/Sao_Paulo',
});

function formatLogTime(atMs: number | null): string {
  if (atMs == null || atMs <= 0) return '—:—';
  return LOG_TIME.format(new Date(atMs));
}
