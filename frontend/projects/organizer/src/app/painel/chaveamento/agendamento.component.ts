import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { truncateName } from '../data/mock-data';
import type { TournamentMatch } from '../data/matches-repository';
import {
  formatHHMM,
  minutesFromDayStart,
  parseHHMM,
  previewBlocksByCourt,
  spWallToDate,
  startTimeOptions,
} from '../data/auto-schedule-preview';
import type { AutoScheduleSkip, AutoScheduleSlot } from '../data/organizer-ops.service';
import {
  autoScheduleTournamentDay,
  dayKeyFromDate,
  scheduleMatch,
  unscheduleMatch,
  updateMatchOpsSettings,
} from '../data/organizer-ops.service';
import { OgCardComponent } from '../ui/card.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { NxProcessingOverlayComponent } from '../../shared/loading/nx-processing-overlay.component';
import { NxSpinnerComponent } from '../../shared/loading/nx-spinner.component';
import { ChaveamentoContextService } from './chaveamento-context.service';

const ROW_H = 100; // px por slot de 30min — cards mais altos pra caber confronto + meta
const SLOT_MIN = 30;
/** Mesma largura em que o shell troca a sidebar pela gaveta — abaixo dela o
 *  layout de duas colunas desta tela também empilha. */
const COMPACT_QUERY = '(max-width: 1023.98px)';

interface AgendaBloco {
  match: TournamentMatch;
  startMin: number;
  durMin: number;
  /** Fora da categoria selecionada — só aparece (apagado) com o painel de
   *  auto-agendamento aberto, porque essas partidas ocupam quadra de verdade. */
  foreign: boolean;
}

/** Agendamento real — mesmos Cloud Functions do app (`scheduleMatch`/`unscheduleMatch`/
 *  `autoScheduleTournamentDay`, ver `organizer_match_schedule_service.dart`): colunas são as
 *  quadras REAIS do doc do torneio (`courts`), a jornada vem de `matchOps`
 *  (dayStart/dayEnd/duração padrão) e os horários são gravados em UTC a partir da parede
 *  America/Sao_Paulo (fuso canônico dos eventos, offset fixo -03 desde 2019). Interação por
 *  clique no lugar do drag do protótipo: selecionar partida na fila (ou um bloco já agendado)
 *  → clicar num slot livre agenda/reagenda; conflito de quadra é rejeitado pelo servidor e
 *  avisos de descanso insuficiente aparecem no banner. */
@Component({
  selector: 'og-agendamento',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgPageHeaderComponent, OgCardComponent, OgIconComponent, NxProcessingOverlayComponent, NxSpinnerComponent],
  host: { '(document:keydown.escape)': 'onEscape()' },
  template: `
    <og-page-header title="Agendamento de jogos" [subtitle]="headerSubtitle()">
      <button type="button" class="og-mini-btn" [disabled]="busy() || autoOpen() || !ctx.tournament()" (click)="openAuto()">
        @if (autoApplying()) {
          <app-nx-spinner [size]="14" />
        } @else {
          <og-icon name="clock" [size]="14" />
        }
        {{ busy() ? 'Processando…' : 'Auto-agendar dia' }}
      </button>
    </og-page-header>

    <div class="og-content">
      @if (dayKeys().length > 1) {
        <div class="og-filter-bar">
          @for (d of dayKeys(); track d) {
            <button type="button" class="og-chip" [class.active]="selectedDayKey() === d" (click)="selectDay(d)">{{ dayLabel(d) }}</button>
          }
        </div>
      }

      @if (feedback(); as fb) {
        <div class="og-banner" [class.win]="fb.ok">{{ fb.message }}</div>
      }

      @if (skippedDetail().length > 0) {
        <ul class="og-auto-skipped">
          @for (s of skippedDetail(); track s.matchId) {
            <li>{{ s.label }} — {{ s.reason }}</li>
          }
        </ul>
      }

      @if (ctx.loadingTournaments() || ctx.loadingMatches()) {
        <div class="og-card" style="color:var(--nx-text-dim);font-family:var(--nx-font-ui);font-size:13px">Carregando jogos…</div>
      } @else if (ctx.tournaments().length > 0 && ctx.matches().length === 0) {
        <div class="og-card" style="color:var(--nx-text-dim);font-family:var(--nx-font-ui);font-size:13px">Chaves ainda não geradas</div>
      } @else {
        <div class="og-agenda-layout" [class.with-minibar]="autoMinibar()">
        <og-card style="min-height:0;overflow:hidden">
          <div class="og-agenda">
            <div class="og-agenda-cols">
              @for (c of courts(); track c.id) {
                <div class="og-agenda-col-label" [class.off]="autoOpen() && !isCourtSelected(c.id)">{{ c.name }}</div>
              }
            </div>
            <div class="og-agenda-scroll">
              <div class="og-agenda-grid" [style.height.px]="rows() * rowH + 10">
                @for (i of rowIndexes(); track i) {
                  <div class="og-agenda-hour-row" [style.top.px]="i * rowH">
                    @if ((startMin() + i * slotMin) % 60 === 0) {
                      <div class="og-agenda-hour-label">{{ fmt(startMin() + i * slotMin) }}</div>
                    }
                    <div class="og-agenda-hour-line" [class.solid]="(startMin() + i * slotMin) % 60 === 0"></div>
                  </div>
                }
                <div class="og-agenda-columns">
                  @for (c of courts(); track c.id) {
                    <div class="og-agenda-column" [class.off]="autoOpen() && !isCourtSelected(c.id)">
                      @for (i of rowIndexes(); track i) {
                        <button
                          type="button"
                          class="og-agenda-slot"
                          [class.targetable]="!autoOpen() && selectedMatchId() != null"
                          [style.top.px]="i * rowH"
                          [style.height.px]="rowH"
                          [disabled]="busy() || autoOpen() || selectedMatchId() == null"
                          (click)="scheduleAt(c.id, startMin() + i * slotMin)"
                          [attr.aria-label]="'Agendar às ' + fmt(startMin() + i * slotMin) + ' na ' + c.name"
                        ></button>
                      }
                      @for (b of blocks()[c.id]; track b.match.id) {
                        <div
                          class="og-agenda-block"
                          [class.confirmada]="isFinished(b.match)"
                          [class.pendente]="!isFinished(b.match)"
                          [class.locked]="isFinished(b.match) || autoOpen()"
                          [class.foreign]="b.foreign"
                          [class.selected]="!isFinished(b.match) && selectedMatchId() === b.match.id"
                          [style.top.px]="minToY(b.startMin) + 1"
                          [style.height.px]="(b.durMin / slotMin) * rowH - 3"
                          (click)="toggleSelectBlock(b.match)"
                        >
                          <div class="partida" [title]="b.match.team1Label + ' vs ' + b.match.team2Label">{{ truncate(b.match.team1Label, 14) }} vs {{ truncate(b.match.team2Label, 14) }}</div>
                          <div class="meta">
                            <span>#{{ b.match.matchNumber || '—' }}</span>
                            @if (b.match.round; as round) {
                              <span>· {{ round }}</span>
                            }
                            @if (b.match.score; as score) {
                              <span>· {{ score }}</span>
                            }
                          </div>
                          <div class="hora">{{ fmt(b.startMin) }}–{{ fmt(b.startMin + b.durMin) }}</div>
                        </div>
                      }
                      @for (p of previewBlocks()[c.id]; track p.matchId) {
                        <div
                          class="og-agenda-block preview"
                          [style.top.px]="minToY(p.startMin) + 1"
                          [style.height.px]="(p.durMin / slotMin) * rowH - 3"
                        >
                          <div class="partida">{{ previewLabel(p.matchId) }}</div>
                          <div class="meta">{{ previewMeta(p.matchId) }}</div>
                          <div class="hora">{{ fmt(p.startMin) }}–{{ fmt(p.startMin + p.durMin) }}</div>
                        </div>
                      }
                    </div>
                  }
                </div>
              </div>
            </div>
            @if (autoOpen()) {
              <div class="og-agenda-legend">
                <span><i class="dot pendente"></i> agendado</span>
                <span><i class="dot preview"></i> prévia</span>
                <span><i class="dot foreign"></i> outra categoria</span>
              </div>
            }
          </div>
        </og-card>

        @if (autoMinibar()) {
          <div class="og-auto-minibar">
            <p class="og-auto-summary">{{ autoSummary() }}</p>
            <div class="og-auto-actions">
              <button type="button" class="og-ghost-btn" [disabled]="busy()" (click)="expandAuto()">Ajustar</button>
              <button
                type="button"
                class="og-mini-btn"
                [disabled]="busy() || autoLoading() || autoCourtsIgnored() || autoSlots().length === 0"
                (click)="applyAuto()"
              >
                Aplicar
              </button>
            </div>
          </div>
        } @else if (autoOpen()) {
          @if (narrow()) {
            <button type="button" class="og-auto-backdrop" aria-label="Fechar auto-agendamento" (click)="closeAuto()"></button>
          }
          <og-card
            kicker="Auto-agendamento"
            title="Gerar grade do dia"
            class="og-auto-panel"
            [class.sheet]="narrow()"
            [attr.role]="narrow() ? 'dialog' : null"
            [attr.aria-modal]="narrow() ? 'true' : null"
            [attr.aria-label]="narrow() ? 'Gerar grade do dia' : null"
            style="min-height:0;overflow:hidden"
          >
            @if (narrow()) {
              <button card-action type="button" class="og-auto-close" aria-label="Fechar" (click)="closeAuto()">
                <og-icon name="close" [size]="16" />
              </button>
            }
            <div class="og-auto-fields">
              <div class="og-auto-field">
                <span class="og-auto-label">Dia</span>
                @if (dayKeys().length > 1) {
                  <div class="og-auto-chips">
                    @for (d of dayKeys(); track d) {
                      <button type="button" class="og-chip" [class.active]="selectedDayKey() === d" (click)="selectDay(d)">{{ dayLabel(d) }}</button>
                    }
                  </div>
                } @else {
                  <span class="og-auto-static">{{ dayLabel(selectedDayKey()) }}</span>
                }
              </div>

              <div class="og-auto-field">
                <span class="og-auto-label">Começar a partir das</span>
                <div class="og-auto-chips">
                  @for (min of startOptions(); track min) {
                    <button type="button" class="og-chip" [class.active]="autoStartMin() === min" (click)="setAutoStart(min)">{{ fmt(min) }}</button>
                  }
                </div>
              </div>

              <div class="og-auto-field">
                <span class="og-auto-label">Quadras</span>
                <div class="og-auto-checks">
                  @for (c of courts(); track c.id) {
                    <label class="og-auto-check">
                      <input type="checkbox" [checked]="isCourtSelected(c.id)" (change)="toggleCourt(c.id)" />
                      <span>{{ c.name }}</span>
                    </label>
                  }
                </div>
                @if (autoCourtIds().length === 0) {
                  <p class="og-auto-warn">Selecione ao menos uma quadra.</p>
                }
              </div>

              @if (ctx.categoryName(); as cat) {
                <div class="og-auto-field">
                  <span class="og-auto-label">Agendar</span>
                  <div class="og-auto-chips">
                    <button type="button" class="og-chip" [class.active]="autoScopeCategory()" (click)="setAutoScope(true)">Só {{ cat }}</button>
                    <button type="button" class="og-chip" [class.active]="!autoScopeCategory()" (click)="setAutoScope(false)">Torneio inteiro</button>
                  </div>
                </div>
              }

              <label class="og-auto-check">
                <input type="checkbox" [checked]="autoAvoidConflict()" (change)="toggleAvoidConflict()" />
                <span>Evitar conflito de atletas</span>
              </label>
              <label class="og-auto-check">
                <input type="checkbox" [checked]="autoRespectDeps()" (change)="toggleRespectDeps()" />
                <span>Respeitar dependências da chave</span>
              </label>
              <label class="og-auto-check">
                <input
                  type="checkbox"
                  [checked]="autoDynamicReschedule()"
                  [disabled]="autoDynamicSaving()"
                  (change)="toggleDynamicReschedule()"
                />
                <span>Reagendamento dinâmico</span>
              </label>
              <p class="og-auto-hint">
                Recalcula automaticamente o horário das próximas partidas da quadra quando uma
                termina antes/depois ou vira W.O.
              </p>
            </div>

            <div class="og-auto-footer">
              @if (autoCourtsIgnored()) {
                <p class="og-auto-warn">
                  O servidor ignorou a seleção de quadras e distribuiu em todas — as Cloud Functions
                  ainda não têm essa atualização. Aplicar está bloqueado até o deploy.
                </p>
              }
              <p class="og-auto-summary">{{ autoSummary() }}</p>
              <div class="og-auto-actions">
                @if (narrow()) {
                  <button type="button" class="og-ghost-btn" [disabled]="busy()" (click)="collapseAuto()">Ver na grade</button>
                } @else {
                  <button type="button" class="og-ghost-btn" [disabled]="busy()" (click)="closeAuto()">Cancelar</button>
                }
                <button type="button" class="og-ghost-btn" [disabled]="busy() || autoLoading() || autoCourtIds().length === 0" (click)="recalcAuto()">Recalcular</button>
                <button type="button" class="og-mini-btn" [disabled]="busy() || autoLoading() || autoCourtsIgnored() || autoSlots().length === 0" (click)="applyAuto()">Aplicar</button>
              </div>
            </div>
          </og-card>
        } @else {
        <og-card kicker="Aguardando horário" title="Fila de partidas" style="min-height:0;overflow:hidden">
          @if (selectedMatch(); as sel) {
            <div class="og-agenda-selected">
              <div class="partida" [title]="sel.team1Label + ' vs ' + sel.team2Label">{{ truncate(sel.team1Label, 16) }} vs {{ truncate(sel.team2Label, 16) }}</div>
              <div class="meta">Clique num slot livre da grade pra {{ sel.scheduledAt ? 'reagendar' : 'agendar' }}</div>
              <div style="display:flex;gap:8px;margin-top:8px">
                @if (sel.scheduledAt) {
                  <button type="button" class="og-ghost-btn" [disabled]="busy()" (click)="unschedule(sel)">Remover horário</button>
                }
                <button type="button" class="og-ghost-btn" (click)="selectedMatchId.set(null)">Cancelar</button>
              </div>
            </div>
          }
          <div class="og-agenda-fila">
            @for (m of fila(); track m.id) {
              <button type="button" class="og-agenda-fila-item" [class.selected]="selectedMatchId() === m.id" (click)="toggleSelectQueue(m.id)">
                <div class="partida" [title]="m.team1Label + ' vs ' + m.team2Label">{{ truncate(m.team1Label, 16) }} vs {{ truncate(m.team2Label, 16) }}</div>
                <div class="meta">
                  #{{ m.matchNumber || '—' }}
                  @if (m.round) {
                    · {{ m.round }}
                  }
                  @if (m.scheduledAt) {
                    · {{ timeLabel(m.scheduledAt) }} ({{ dayLabel(dayKeyOf(m.scheduledAt)) }})
                  }
                </div>
              </button>
            } @empty {
              <p class="og-empty">Nenhuma partida aguardando horário</p>
            }
          </div>
          <div class="og-agenda-fila-hint">Clique numa partida da fila (ou num bloco da grade) e depois num horário livre pra agendar. Duração padrão: {{ durationMin() }} min.</div>
        </og-card>
        }
        </div>
      }
    </div>
    @if (autoApplying()) {
      <app-nx-processing-overlay title="Auto-agendando o dia…" description="Distribuindo as partidas elegíveis nos horários livres das quadras." />
    }
  `,
  styles: `
    :host {
      /* O box do host é do shell (regra .og-main > router-outlet + * em styles.scss), que faz
         dele uma coluna flex de altura limitada — é o que dá altura pro .og-content rolar por
         dentro. Aqui fica só o que é desta tela: a âncora do overlay de processamento. */
      position: relative;
    }

    .og-agenda-layout {
      flex: 1;
      min-height: 0;
      display: grid;
      grid-template-columns: 1fr 300px;
      gap: 16px;
    }

    .og-agenda {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }

    /* Tablet: a coluna lateral de 300px comeria metade da grade num iPad em
       retrato (584px úteis). Empilha, e a grade — que é o trabalho da tela —
       fica com a largura inteira; a fila de partidas desce e rola com a página.
       Precisa vir DEPOIS das regras base acima: mesma especificidade, quem estiver por
       último no arquivo vence. Declarado antes, o bloco era descartado inteiro — o 70dvh
       saía como 3239px na medição. */
    @media (max-width: 1023.98px) {
      .og-agenda-layout {
        grid-template-columns: 1fr;
        grid-auto-rows: min-content;
        min-height: 0;
        overflow-y: auto;
        scrollbar-width: none;
      }

      .og-agenda {
        /* Sem altura de coluna pra dividir, a grade precisa de altura própria
           senão colapsa pro conteúdo e perde a rolagem interna das horas. */
        height: 70dvh;
      }
    }
    .og-agenda-cols {
      display: flex;
      padding-left: 52px;
      flex: none;
      padding-bottom: 10px;
    }
    .og-agenda-col-label {
      flex: 1;
      text-align: center;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13.5px;
      color: var(--nx-text);
    }
    .og-agenda-col-label.off {
      color: var(--nx-text-mute);
      text-decoration: line-through;
    }
    .og-agenda-scroll {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      scrollbar-width: none;
    }
    .og-agenda-grid {
      position: relative;
      padding-left: 52px;
    }
    .og-agenda-hour-row {
      position: absolute;
      left: 0;
      right: 0;
      height: 56px;
    }
    .og-agenda-hour-label {
      position: absolute;
      top: -6px;
      left: 0;
      width: 42px;
      text-align: right;
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      font-weight: 600;
      color: var(--nx-text-dim);
    }
    .og-agenda-hour-line {
      position: absolute;
      top: 0;
      left: 52px;
      right: 0;
      border-top: 1px dotted var(--nx-line);
    }
    .og-agenda-hour-line.solid {
      border-top-style: solid;
    }
    .og-agenda-columns {
      position: absolute;
      top: 0;
      left: 52px;
      right: 0;
      bottom: 0;
      display: flex;
    }
    .og-agenda-column {
      flex: 1;
      position: relative;
      border-left: 1px solid var(--nx-line);
    }
    .og-agenda-column.off {
      opacity: 0.4;
      background: repeating-linear-gradient(135deg, transparent, transparent 6px, var(--nx-line) 6px, var(--nx-line) 7px);
    }
    .og-agenda-slot {
      position: absolute;
      left: 0;
      right: 0;
      background: transparent;
      border: none;
      padding: 0;
      cursor: default;
    }
    .og-agenda-slot.targetable {
      cursor: pointer;
    }
    .og-agenda-slot.targetable:hover {
      background: var(--nx-orange-tint);
      outline: 1px dashed var(--nx-orange-500);
      outline-offset: -1px;
    }
    .og-agenda-block {
      position: absolute;
      left: 3px;
      right: 3px;
      cursor: pointer;
      border-radius: 8px;
      padding: 7px 9px;
      overflow: hidden;
      border-left: 3px solid;
      z-index: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 2px;
      transition: filter 140ms var(--nx-ease-out);
    }
    .og-agenda-block:hover {
      filter: brightness(1.25);
    }
    .og-agenda-block.confirmada {
      background: rgba(43, 209, 126, 0.12);
      border-color: rgba(43, 209, 126, 0.35);
      border-left-color: var(--nx-win);
    }
    .og-agenda-block.pendente {
      background: rgba(244, 197, 67, 0.12);
      border-color: rgba(244, 197, 67, 0.35);
      border-left-color: var(--nx-pending);
    }
    .og-agenda-block.selected {
      outline: 2px solid var(--nx-orange-500);
      outline-offset: 0;
    }
    .og-agenda-block.locked {
      cursor: default;
      opacity: 0.92;
    }
    .og-agenda-block.locked:hover {
      filter: none;
    }
    .og-agenda-block.foreign {
      opacity: 0.4;
    }
    .og-agenda-block.preview {
      background: var(--nx-orange-tint);
      border: 1px dashed var(--nx-orange-500);
      border-left: 3px dashed var(--nx-orange-500);
      cursor: default;
      pointer-events: none;
      z-index: 2;
    }
    .og-agenda-legend {
      flex: none;
      display: flex;
      gap: 14px;
      padding-top: 10px;
      font-family: var(--nx-font-ui);
      font-size: 11px;
      color: var(--nx-text-dim);
    }
    .og-agenda-legend span {
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    .og-agenda-legend .dot {
      width: 9px;
      height: 9px;
      border-radius: 2px;
      background: rgba(244, 197, 67, 0.35);
      border: 1px solid var(--nx-pending);
    }
    .og-agenda-legend .dot.preview {
      background: var(--nx-orange-tint);
      border: 1px dashed var(--nx-orange-500);
    }
    .og-agenda-legend .dot.foreign {
      opacity: 0.4;
    }
    .og-agenda-block .partida {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 12px;
      line-height: 1.25;
      color: var(--nx-text);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .og-agenda-block .meta {
      font-family: var(--nx-font-ui);
      font-size: 10px;
      font-weight: 600;
      color: var(--nx-text-mute);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .og-agenda-block .hora {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 600;
      color: var(--nx-text-dim);
    }
    .og-agenda-selected {
      padding: 12px 14px;
      margin-bottom: 10px;
      border-radius: var(--nx-r-3);
      background: var(--nx-orange-tint);
      border: 1px solid rgba(255, 106, 26, 0.3);
    }
    .og-agenda-selected .partida {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 12.5px;
      color: var(--nx-text);
    }
    .og-agenda-selected .meta {
      font-family: var(--nx-font-ui);
      font-size: 11px;
      color: var(--nx-text-mute);
      margin-top: 4px;
    }
    .og-agenda-fila {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      scrollbar-width: none;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .og-agenda-fila-item {
      padding: 12px 14px;
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      cursor: pointer;
      text-align: left;
      transition: border-color 140ms var(--nx-ease-out);
    }
    .og-agenda-fila-item:hover {
      border-color: var(--nx-line-strong);
    }
    .og-agenda-fila-item.selected {
      border-color: var(--nx-orange-500);
      background: var(--nx-orange-tint);
    }
    .og-agenda-fila-item .partida {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 12.5px;
      color: var(--nx-text);
    }
    .og-agenda-fila-item .meta {
      font-family: var(--nx-font-ui);
      font-size: 11px;
      color: var(--nx-text-dim);
      margin-top: 4px;
    }
    .og-agenda-fila-hint {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--nx-line);
      font-family: var(--nx-font-ui);
      font-size: 11.5px;
      color: var(--nx-text-dim);
      line-height: 1.5;
    }
    .og-empty {
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text-mute);
      padding: 0;
      margin: 0;
    }

    .og-auto-fields {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      scrollbar-width: none;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .og-auto-field {
      display: flex;
      flex-direction: column;
      gap: 7px;
    }
    .og-auto-label {
      font-family: var(--nx-font-ui);
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-auto-static {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13px;
      color: var(--nx-text);
    }
    .og-auto-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .og-auto-checks {
      display: flex;
      flex-direction: column;
      gap: 7px;
    }
    .og-auto-check {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text);
    }
    .og-auto-check input {
      accent-color: var(--nx-orange-500);
      width: 15px;
      height: 15px;
      cursor: pointer;
    }
    .og-auto-hint {
      margin: -3px 0 0;
      font-family: var(--nx-font-ui);
      font-size: 11px;
      line-height: 1.4;
      color: var(--nx-text-dim);
    }
    .og-auto-warn {
      margin: 0 0 8px;
      font-family: var(--nx-font-ui);
      font-size: 11.5px;
      line-height: 1.5;
      color: var(--nx-pending);
    }
    .og-auto-footer {
      flex: none;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--nx-line);
    }
    .og-auto-summary {
      margin: 0 0 10px;
      font-family: var(--nx-font-ui);
      font-size: 11.5px;
      line-height: 1.5;
      color: var(--nx-text-dim);
    }
    .og-auto-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .og-auto-skipped {
      margin: 0 0 10px;
      padding-left: 18px;
      font-family: var(--nx-font-ui);
      font-size: 11.5px;
      line-height: 1.6;
      color: var(--nx-text-dim);
    }

    /* ── Auto-agendamento no estreito: sheet em vez de coluna ──────────────────
       Empilhado, o painel caía DEPOIS da grade de 70dvh: pra chegar nos controles
       o organizador rolava a tela inteira, e aí perdia de vista a prévia que eles
       comandam. Vira um sheet sobre a grade, e "Ver na grade" o recolhe pra uma
       barra fina — a prévia tracejada volta a aparecer inteira sem perder o que
       já foi configurado. Fica abaixo do overlay de gravação (40) e da gaveta do
       shell (55/60): os dois têm de cobrir o sheet quando aparecem. */
    .og-auto-backdrop {
      position: fixed;
      inset: 0;
      z-index: 30;
      border: none;
      padding: 0;
      background: rgba(7, 7, 8, 0.6);
      backdrop-filter: blur(2px);
      cursor: pointer;
    }
    .og-auto-panel.sheet {
      position: fixed;
      z-index: 31;
      left: 0;
      right: 0;
      bottom: 0;
      max-height: 85dvh;
      border-radius: var(--nx-r-4) var(--nx-r-4) 0 0;
      border-bottom: none;
      box-shadow: 0 -20px 60px rgba(0, 0, 0, 0.5);
      padding-bottom: calc(20px + env(safe-area-inset-bottom, 0px));
    }
    .og-auto-close {
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      flex: none;
      border: none;
      border-radius: var(--nx-r-2);
      background: transparent;
      color: var(--nx-text-mute);
      cursor: pointer;
    }
    .og-auto-close:hover {
      color: var(--nx-text);
    }
    .og-auto-minibar {
      position: fixed;
      z-index: 31;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px calc(12px + env(safe-area-inset-bottom, 0px));
      background: var(--nx-surface-0);
      border-top: 1px solid var(--nx-line-strong);
      box-shadow: 0 -12px 32px rgba(0, 0, 0, 0.4);
    }
    .og-auto-minibar .og-auto-summary {
      flex: 1;
      min-width: 0;
      margin: 0;
    }
    .og-auto-minibar .og-auto-actions {
      flex: none;
      flex-wrap: nowrap;
    }
    /* A barra é fixa: sem esta folga ela cobre a última faixa de horário da grade. */
    .og-agenda-layout.with-minibar {
      padding-bottom: 88px;
    }
  `,
})
export class AgendamentoComponent {
  protected readonly ctx = inject(ChaveamentoContextService);

  protected readonly rowH = ROW_H;
  protected readonly slotMin = SLOT_MIN;
  protected readonly truncate = truncateName;
  protected readonly busy = signal(false);
  /** Gravação do auto-agendamento em andamento — liga o overlay. */
  protected readonly autoApplying = signal(false);
  protected readonly feedback = signal<{ ok: boolean; message: string } | null>(null);
  protected readonly selectedMatchId = signal<string | null>(null);
  protected readonly selectedDayKey = signal<string>(dayKeyFromDate(new Date()));

  // ── Painel de auto-agendamento ──────────────────────────────────────────────
  protected readonly autoOpen = signal(false);
  protected readonly autoLoading = signal(false);
  /** Largura em que o painel deixa de ser coluna lateral e vira sheet sobre a grade. */
  protected readonly narrow = signal(false);
  /** Sheet recolhido na barra fina — só existe no estreito. */
  protected readonly autoCollapsed = signal(false);
  /** Minutos do dia — o "começar a partir das", que vai como `dayStart`. */
  protected readonly autoStartMin = signal(0);
  protected readonly autoCourtIds = signal<readonly string[]>([]);
  protected readonly autoAvoidConflict = signal(true);
  protected readonly autoRespectDeps = signal(true);
  /** true = só a categoria selecionada; false = torneio inteiro. */
  protected readonly autoScopeCategory = signal(true);
  /** `matchOps.dynamicRescheduleEnabled` do torneio — config persistida (não um parâmetro
   *  desta execução do auto-agendamento), por isso é semeada na troca de torneio abaixo,
   *  não toda vez que o sheet abre como os dois checkboxes acima. */
  protected readonly autoDynamicReschedule = signal(false);
  protected readonly autoDynamicSaving = signal(false);
  private readonly autoSlotsSignal = signal<AutoScheduleSlot[]>([]);
  private readonly autoSkipped = signal<AutoScheduleSkip[]>([]);
  /** Descarta resposta de prévia que chega depois de outra mais nova. */
  private autoGeneration = 0;
  private autoDebounce: ReturnType<typeof setTimeout> | null = null;

  protected readonly headerSubtitle = computed(() => {
    const t = this.ctx.tournament();
    if (!t) return '';
    const cat = this.ctx.categoryName();
    return cat ? `${t.name} · categoria ${cat}` : t.name;
  });

  protected readonly courts = computed(() => this.ctx.tournament()?.courts ?? []);

  protected readonly durationMin = computed(() => this.ctx.tournament()?.matchOps.defaultMatchDurationMin ?? 30);

  protected readonly startMin = computed(() => parseHHMM(this.ctx.tournament()?.matchOps.dayStart ?? '07:00'));
  protected readonly endMin = computed(() => parseHHMM(this.ctx.tournament()?.matchOps.dayEnd ?? '24:00'));
  protected readonly rows = computed(() => Math.max(1, Math.floor((this.endMin() - this.startMin()) / SLOT_MIN)));
  protected readonly rowIndexes = computed(() => Array.from({ length: this.rows() }, (_, i) => i));

  /** Dias do torneio (startAt..endAt na parede SP, máx. 14) + hoje como fallback. */
  protected readonly dayKeys = computed<string[]>(() => {
    const t = this.ctx.tournament();
    if (!t?.startAt) return [this.selectedDayKey()];
    const keys: string[] = [];
    const end = t.endAt ?? t.startAt;
    const cursor = new Date(t.startAt);
    for (let i = 0; i < 14 && cursor <= end; i++) {
      keys.push(dayKeyFromDate(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    if (keys.length === 0) keys.push(dayKeyFromDate(t.startAt));
    return keys;
  });

  /** Barra fina no lugar do sheet — o painel segue aberto e configurado. */
  protected readonly autoMinibar = computed(() => this.autoOpen() && this.narrow() && this.autoCollapsed());

  constructor() {
    const destroyRef = inject(DestroyRef);

    const mq = window.matchMedia(COMPACT_QUERY);
    this.narrow.set(mq.matches);
    const onNarrowChange = (e: MediaQueryListEvent) => {
      this.narrow.set(e.matches);
      // Girar pra paisagem e voltar traria o painel recolhido de novo — o estado
      // não sobrevive à largura em que ele nem existe.
      if (!e.matches) this.autoCollapsed.set(false);
    };
    mq.addEventListener('change', onNarrowChange);
    destroyRef.onDestroy(() => mq.removeEventListener('change', onNarrowChange));

    // Ao trocar de torneio, aponta pro dia de hoje se estiver dentro do evento, senão pro 1º dia.
    let lastTournamentId: string | null = null;
    effect(() => {
      const t = this.ctx.tournament();
      if (!t || t.id === lastTournamentId) return;
      lastTournamentId = t.id;
      const keys = this.dayKeys();
      const today = dayKeyFromDate(new Date());
      this.selectedDayKey.set(keys.includes(today) ? today : (keys[0] ?? today));
      this.selectedMatchId.set(null);
      this.feedback.set(null);
      this.autoDynamicReschedule.set(t.matchOps.dynamicRescheduleEnabled);
      this.closeAuto();
    });
    destroyRef.onDestroy(() => this.cancelAutoDebounce());
  }

  protected readonly selectedMatch = computed(() => {
    const id = this.selectedMatchId();
    if (!id) return null;
    const match = this.ctx.matches().find((m) => m.id === id) ?? null;
    // Finalizada não fica selecionável pra reagendar/remover horário.
    return match && !this.isFinished(match) ? match : null;
  });

  /** Jogos com quadra + horário no dia selecionado (parede SP). Com o painel de
   *  auto-agendamento aberto entram os de TODAS as categorias: eles ocupam quadra
   *  de verdade e o servidor conta com essa ocupação, então esconder os de fora da
   *  categoria faria a prévia parecer cair em slot livre que não está livre. */
  private readonly scheduledOnDay = computed(() =>
    (this.autoOpen() ? this.ctx.matches() : this.ctx.matchesFiltered()).filter(
      (m) => m.courtId && m.scheduledAt && dayKeyFromDate(m.scheduledAt) === this.selectedDayKey(),
    ),
  );

  protected readonly blocks = computed(() => {
    const byCourt: Record<string, AgendaBloco[]> = {};
    const fallbackDur = this.durationMin();
    const dayKey = this.selectedDayKey();
    const categoryId = this.ctx.selectedCategoryId();
    for (const match of this.scheduledOnDay()) {
      const startMin = minutesFromDayStart(match.scheduledAt!, dayKey);
      const durMin = match.scheduleEndAt ? Math.max(SLOT_MIN, Math.round((match.scheduleEndAt.getTime() - match.scheduledAt!.getTime()) / 60000)) : fallbackDur;
      const list = byCourt[match.courtId] ?? [];
      list.push({ match, startMin, durMin, foreign: categoryId != null && match.categoryId !== categoryId });
      byCourt[match.courtId] = list;
    }
    return byCourt;
  });

  // ── Auto-agendamento ────────────────────────────────────────────────────────

  protected readonly autoSlots = computed(() => this.autoSlotsSignal());

  private readonly matchById = computed(() => new Map(this.ctx.matches().map((m) => [m.id, m] as const)));

  /** Horários oferecidos em "começar a partir das" — mesma malha de 30min da grade. */
  protected readonly startOptions = computed(() => startTimeOptions(this.startMin(), this.endMin(), SLOT_MIN));

  protected readonly previewBlocks = computed(() =>
    this.autoOpen()
      ? previewBlocksByCourt(this.autoSlots(), { dayKey: this.selectedDayKey(), fallbackDurMin: this.durationMin() })
      : {},
  );

  /** Slots que o servidor jogou pra depois do fim da jornada: o auto-agendamento
   *  não consulta `matchOps.dayEnd`, então uma grade cheia transborda o dia. */
  private readonly autoOutOfWindow = computed(() => {
    const endMin = this.endMin();
    const dayKey = this.selectedDayKey();
    return this.autoSlots().filter((s) => minutesFromDayStart(new Date(s.start), dayKey) >= endMin).length;
  });

  /** O servidor devolveu partida em quadra que o organizador desmarcou — só
   *  acontece contra uma versão das functions anterior ao parâmetro `courtIds`,
   *  que ignora a seleção e agenda em todas as quadras. Sem esse guard a tela
   *  desenha a prévia errada como se estivesse certa. */
  protected readonly autoCourtsIgnored = computed(() => {
    const selected = new Set(this.autoCourtIds());
    if (selected.size === 0) return false;
    return this.autoSlots().some((slot) => !selected.has(slot.courtId));
  });

  protected readonly autoSummary = computed(() => {
    if (this.autoLoading()) return 'Calculando a grade…';
    if (this.autoCourtIds().length === 0) return 'Nenhuma quadra selecionada.';
    const total = this.autoSlots().length;
    if (total === 0) return 'Nenhuma partida elegível pra auto-agendar neste dia.';
    const parts = [`${total} partida(s) serão agendadas.`];
    const out = this.autoOutOfWindow();
    if (out > 0) parts.push(`${out} passa(m) do fim da jornada (${this.fmt(this.endMin())}).`);
    return parts.join(' ');
  });

  /** Puladas na gravação (quadra ocupada / descanso insuficiente) — o servidor só
   *  preenche isso no apply, nunca na prévia. */
  protected readonly skippedDetail = computed(() =>
    this.autoSkipped().map((s) => ({
      matchId: s.matchId,
      label: this.previewMeta(s.matchId),
      reason: s.reason,
    })),
  );

  protected isCourtSelected(courtId: string): boolean {
    return this.autoCourtIds().includes(courtId);
  }

  protected previewLabel(matchId: string): string {
    const match = this.matchById().get(matchId);
    if (!match) return 'Partida';
    return `${truncateName(match.team1Label, 14)} vs ${truncateName(match.team2Label, 14)}`;
  }

  protected previewMeta(matchId: string): string {
    const match = this.matchById().get(matchId);
    if (!match) return '#—';
    const parts = [`#${match.matchNumber || '—'}`];
    if (match.round) parts.push(match.round);
    return parts.join(' · ');
  }

  protected openAuto(): void {
    const t = this.ctx.tournament();
    if (!t || this.busy()) return;
    this.selectedMatchId.set(null);
    this.feedback.set(null);
    this.autoSkipped.set([]);
    this.autoSlotsSignal.set([]);
    this.autoCourtIds.set(this.courts().map((c) => c.id));
    this.autoStartMin.set(this.startMin());
    this.autoAvoidConflict.set(true);
    this.autoRespectDeps.set(true);
    this.autoScopeCategory.set(this.ctx.selectedCategoryId() != null);
    this.autoCollapsed.set(false);
    this.autoOpen.set(true);
    void this.runAutoPreview();
  }

  protected closeAuto(): void {
    this.cancelAutoDebounce();
    this.autoGeneration++;
    this.autoOpen.set(false);
    this.autoCollapsed.set(false);
    this.autoLoading.set(false);
    this.autoSlotsSignal.set([]);
  }

  /** "Ver na grade" — sai da frente da prévia sem perder a configuração. */
  protected collapseAuto(): void {
    this.autoCollapsed.set(true);
  }

  protected expandAuto(): void {
    this.autoCollapsed.set(false);
  }

  /** Esc fecha só o sheet: no desktop o painel é uma coluna, não um modal. */
  protected onEscape(): void {
    if (this.narrow() && this.autoOpen()) this.closeAuto();
  }

  protected selectDay(dayKey: string): void {
    if (this.selectedDayKey() === dayKey) return;
    this.selectedDayKey.set(dayKey);
    this.queueAutoPreview();
  }

  protected setAutoStart(min: number): void {
    this.autoStartMin.set(min);
    this.queueAutoPreview();
  }

  protected toggleCourt(courtId: string): void {
    this.autoCourtIds.update((ids) => (ids.includes(courtId) ? ids.filter((id) => id !== courtId) : [...ids, courtId]));
    this.queueAutoPreview();
  }

  protected setAutoScope(onlyCategory: boolean): void {
    if (this.autoScopeCategory() === onlyCategory) return;
    this.autoScopeCategory.set(onlyCategory);
    this.queueAutoPreview();
  }

  protected toggleAvoidConflict(): void {
    this.autoAvoidConflict.update((v) => !v);
    this.queueAutoPreview();
  }

  protected toggleRespectDeps(): void {
    this.autoRespectDeps.update((v) => !v);
    this.queueAutoPreview();
  }

  /** Ao contrário dos dois acima, não mexe na prévia — é uma config persistida do
   *  torneio, gravada na hora via `updateMatchOpsSettings`. Otimista: marca já e
   *  reverte se o servidor recusar (sem stream local pra confirmar). */
  protected async toggleDynamicReschedule(): Promise<void> {
    const t = this.ctx.tournament();
    if (!t || this.autoDynamicSaving()) return;
    const next = !this.autoDynamicReschedule();
    this.autoDynamicReschedule.set(next);
    this.autoDynamicSaving.set(true);
    this.feedback.set(null);
    try {
      await updateMatchOpsSettings({ tournamentId: t.id, dynamicRescheduleEnabled: next });
    } catch (e) {
      this.autoDynamicReschedule.set(!next);
      this.feedback.set({ ok: false, message: (e as Error).message || 'Falha ao salvar o reagendamento dinâmico.' });
    } finally {
      this.autoDynamicSaving.set(false);
    }
  }

  protected recalcAuto(): void {
    this.cancelAutoDebounce();
    void this.runAutoPreview();
  }

  private cancelAutoDebounce(): void {
    if (this.autoDebounce == null) return;
    clearTimeout(this.autoDebounce);
    this.autoDebounce = null;
  }

  /** Recalcula a prévia após um respiro — mexer nos chips/checkboxes dispara uma
   *  chamada por mudança sem isso. */
  private queueAutoPreview(): void {
    if (!this.autoOpen()) return;
    this.cancelAutoDebounce();
    this.autoLoading.set(true);
    this.autoDebounce = setTimeout(() => {
      this.autoDebounce = null;
      void this.runAutoPreview();
    }, 300);
  }

  /** Parâmetros compartilhados por prévia e gravação — a grade só bate se as duas
   *  chamadas mandarem exatamente a mesma configuração. */
  private autoParams(tournamentId: string) {
    return {
      tournamentId,
      dayKey: this.selectedDayKey(),
      avoidAthleteConflict: this.autoAvoidConflict(),
      respectBracketDeps: this.autoRespectDeps(),
      dayStart: formatHHMM(this.autoStartMin()),
      courtIds: this.autoCourtIds(),
      categoryId: this.autoScopeCategory() ? this.ctx.selectedCategoryId() : null,
    };
  }

  private async runAutoPreview(): Promise<void> {
    const t = this.ctx.tournament();
    if (!t || !this.autoOpen()) return;
    if (this.autoCourtIds().length === 0) {
      this.autoSlotsSignal.set([]);
      this.autoLoading.set(false);
      return;
    }
    const generation = ++this.autoGeneration;
    this.autoLoading.set(true);
    this.feedback.set(null);
    this.autoSkipped.set([]);
    try {
      const result = await autoScheduleTournamentDay({ ...this.autoParams(t.id), preview: true });
      if (generation !== this.autoGeneration) return;
      this.autoSlotsSignal.set(result.slots ?? []);
    } catch (e) {
      if (generation !== this.autoGeneration) return;
      this.autoSlotsSignal.set([]);
      this.feedback.set({ ok: false, message: (e as Error).message || 'Falha ao calcular a grade.' });
    } finally {
      if (generation === this.autoGeneration) this.autoLoading.set(false);
    }
  }

  protected async applyAuto(): Promise<void> {
    const t = this.ctx.tournament();
    if (!t || this.busy() || this.autoSlots().length === 0) return;
    this.cancelAutoDebounce();
    this.busy.set(true);
    this.autoApplying.set(true);
    this.feedback.set(null);
    this.autoSkipped.set([]);
    try {
      const result = await autoScheduleTournamentDay({ ...this.autoParams(t.id), preview: false });
      const skipped = result.skipped ?? [];
      const applied = result.applied ?? Math.max(0, (result.slots ?? []).length - skipped.length);
      this.autoSkipped.set(skipped);
      this.feedback.set({
        ok: applied > 0,
        message:
          applied > 0
            ? `${applied} partida(s) agendadas automaticamente.${skipped.length > 0 ? ` ${skipped.length} pulada(s):` : ''}`
            : 'Nenhuma partida foi agendada — todas foram puladas por conflito:',
      });
      await this.ctx.reloadMatches();
      this.closeAuto();
    } catch (e) {
      this.feedback.set({ ok: false, message: (e as Error).message || 'Falha no auto-agendamento.' });
    } finally {
      this.busy.set(false);
      this.autoApplying.set(false);
    }
  }

  /** Fila: jogos sem horário OU agendados em outro dia/sem quadra — nada some. */
  protected readonly fila = computed<TournamentMatch[]>(() => {
    const onGrid = new Set(this.scheduledOnDay().map((m) => m.id));
    return this.ctx
      .matchesFiltered()
      .filter((m) => !onGrid.has(m.id) && !this.isFinished(m) && m.status !== 'canceled')
      .sort((a, b) => a.matchNumber - b.matchNumber);
  });

  /** Partida encerrada (placar ou status) — sem reagendar/remover horário. */
  protected isFinished(match: TournamentMatch): boolean {
    return match.status === 'completed' || match.score != null;
  }

  protected toggleSelectQueue(matchId: string): void {
    const match = this.ctx.matches().find((m) => m.id === matchId);
    if (match && this.isFinished(match)) return;
    this.selectedMatchId.update((cur) => (cur === matchId ? null : matchId));
    this.feedback.set(null);
  }

  protected toggleSelectBlock(match: TournamentMatch): void {
    if (this.isFinished(match) || this.autoOpen()) return;
    this.selectedMatchId.update((cur) => (cur === match.id ? null : match.id));
    this.feedback.set(null);
  }

  protected async scheduleAt(courtId: string, startMinOfDay: number): Promise<void> {
    const match = this.selectedMatch();
    if (!match || this.isFinished(match) || this.busy() || this.autoOpen()) return;
    const dayKey = this.selectedDayKey();
    const start = spWallToDate(dayKey, startMinOfDay);
    const end = new Date(start.getTime() + this.durationMin() * 60000);
    this.busy.set(true);
    this.feedback.set(null);
    try {
      const result = await scheduleMatch({ matchId: match.id, courtId, scheduleTime: start, scheduleEndTime: end, dayKey });
      const warnings = result.warnings ?? [];
      this.feedback.set({
        ok: true,
        message: warnings.length > 0 ? `Agendado com aviso: ${warnings.map((w) => w.message).join(' ')}` : `Partida agendada às ${this.fmt(startMinOfDay)}.`,
      });
      this.selectedMatchId.set(null);
      await this.ctx.reloadMatches();
    } catch (e) {
      this.feedback.set({ ok: false, message: (e as Error).message || 'Falha ao agendar.' });
    } finally {
      this.busy.set(false);
    }
  }

  protected async unschedule(match: TournamentMatch): Promise<void> {
    if (this.busy() || this.isFinished(match)) return;
    this.busy.set(true);
    this.feedback.set(null);
    try {
      await unscheduleMatch(match.id);
      this.feedback.set({ ok: true, message: 'Horário removido — partida de volta à fila.' });
      this.selectedMatchId.set(null);
      await this.ctx.reloadMatches();
    } catch (e) {
      this.feedback.set({ ok: false, message: (e as Error).message || 'Falha ao remover horário.' });
    } finally {
      this.busy.set(false);
    }
  }

  protected minToY(min: number): number {
    return ((min - this.startMin()) / SLOT_MIN) * ROW_H;
  }

  protected fmt(min: number): string {
    return formatHHMM(min);
  }

  protected dayKeyOf(date: Date): string {
    return dayKeyFromDate(date);
  }

  protected dayLabel(dayKey: string): string {
    const [y, m, d] = dayKey.split('-').map(Number);
    if (!y || !m || !d) return dayKey;
    return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
  }

  protected timeLabel(date: Date): string {
    return this.fmt(minutesFromDayStart(date, dayKeyFromDate(date)));
  }
}
