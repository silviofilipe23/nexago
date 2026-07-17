import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { truncateName } from '../data/mock-data';
import type { TournamentMatch } from '../data/matches-repository';
import { autoScheduleTournamentDay, dayKeyFromDate, scheduleMatch, unscheduleMatch } from '../data/organizer-ops.service';
import { OgCardComponent } from '../ui/card.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { NxProcessingOverlayComponent } from '../../shared/loading/nx-processing-overlay.component';
import { NxSpinnerComponent } from '../../shared/loading/nx-spinner.component';
import { ChaveamentoContextService } from './chaveamento-context.service';

const ROW_H = 100; // px por slot de 30min — cards mais altos pra caber confronto + meta
const SLOT_MIN = 30;

interface AgendaBloco {
  match: TournamentMatch;
  startMin: number;
  durMin: number;
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
  template: `
    <og-page-header title="Agendamento de jogos" [subtitle]="headerSubtitle()">
      <button type="button" class="og-mini-btn" [disabled]="busy() || !ctx.tournament()" (click)="autoSchedule()">
        @if (autoScheduling()) {
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
            <button type="button" class="og-chip" [class.active]="selectedDayKey() === d" (click)="selectedDayKey.set(d)">{{ dayLabel(d) }}</button>
          }
        </div>
      }

      @if (feedback(); as fb) {
        <div class="og-banner" [class.win]="fb.ok">{{ fb.message }}</div>
      }

      @if (ctx.loadingTournaments() || ctx.loadingMatches()) {
        <div class="og-card" style="color:var(--nx-text-dim);font-family:var(--nx-font-ui);font-size:13px">Carregando jogos…</div>
      } @else if (ctx.tournaments().length > 0 && ctx.matches().length === 0) {
        <div class="og-card" style="color:var(--nx-text-dim);font-family:var(--nx-font-ui);font-size:13px">Chaves ainda não geradas</div>
      } @else {
        <div class="og-agenda-layout">
        <og-card style="min-height:0;overflow:hidden">
          <div class="og-agenda">
            <div class="og-agenda-cols">
              @for (c of courts(); track c.id) {
                <div class="og-agenda-col-label">{{ c.name }}</div>
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
                    <div class="og-agenda-column">
                      @for (i of rowIndexes(); track i) {
                        <button
                          type="button"
                          class="og-agenda-slot"
                          [class.targetable]="selectedMatchId() != null"
                          [style.top.px]="i * rowH"
                          [style.height.px]="rowH"
                          [disabled]="busy() || selectedMatchId() == null"
                          (click)="scheduleAt(c.id, startMin() + i * slotMin)"
                          [attr.aria-label]="'Agendar às ' + fmt(startMin() + i * slotMin) + ' na ' + c.name"
                        ></button>
                      }
                      @for (b of blocks()[c.id]; track b.match.id) {
                        <div
                          class="og-agenda-block"
                          [class.confirmada]="isFinished(b.match)"
                          [class.pendente]="!isFinished(b.match)"
                          [class.locked]="isFinished(b.match)"
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
                    </div>
                  }
                </div>
              </div>
            </div>
          </div>
        </og-card>

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
        </div>
      }
    </div>
    @if (autoScheduling()) {
      <app-nx-processing-overlay title="Auto-agendando o dia…" description="Distribuindo as partidas elegíveis nos horários livres das quadras." />
    }
  `,
  styles: `
    :host {
      display: block;
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
  `,
})
export class AgendamentoComponent {
  protected readonly ctx = inject(ChaveamentoContextService);

  protected readonly rowH = ROW_H;
  protected readonly slotMin = SLOT_MIN;
  protected readonly truncate = truncateName;
  protected readonly busy = signal(false);
  /** Auto-agendamento em andamento (preview → confirm → apply) — liga o overlay. */
  protected readonly autoScheduling = signal(false);
  protected readonly feedback = signal<{ ok: boolean; message: string } | null>(null);
  protected readonly selectedMatchId = signal<string | null>(null);
  protected readonly selectedDayKey = signal<string>(dayKeyFromDate(new Date()));

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

  constructor() {
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
    });
  }

  protected readonly selectedMatch = computed(() => {
    const id = this.selectedMatchId();
    if (!id) return null;
    const match = this.ctx.matches().find((m) => m.id === id) ?? null;
    // Finalizada não fica selecionável pra reagendar/remover horário.
    return match && !this.isFinished(match) ? match : null;
  });

  /** Jogos com quadra + horário no dia selecionado (parede SP). */
  private readonly scheduledOnDay = computed(() =>
    this.ctx
      .matchesFiltered()
      .filter((m) => m.courtId && m.scheduledAt && dayKeyFromDate(m.scheduledAt) === this.selectedDayKey()),
  );

  protected readonly blocks = computed(() => {
    const byCourt: Record<string, AgendaBloco[]> = {};
    const fallbackDur = this.durationMin();
    for (const match of this.scheduledOnDay()) {
      const startMin = spWallMinutes(match.scheduledAt!);
      const durMin = match.scheduleEndAt ? Math.max(SLOT_MIN, Math.round((match.scheduleEndAt.getTime() - match.scheduledAt!.getTime()) / 60000)) : fallbackDur;
      const list = byCourt[match.courtId] ?? [];
      list.push({ match, startMin, durMin });
      byCourt[match.courtId] = list;
    }
    return byCourt;
  });

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
    if (this.isFinished(match)) return;
    this.selectedMatchId.update((cur) => (cur === match.id ? null : match.id));
    this.feedback.set(null);
  }

  protected async scheduleAt(courtId: string, startMinOfDay: number): Promise<void> {
    const match = this.selectedMatch();
    if (!match || this.isFinished(match) || this.busy()) return;
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

  protected async autoSchedule(): Promise<void> {
    const t = this.ctx.tournament();
    if (!t || this.busy()) return;
    const dayKey = this.selectedDayKey();
    this.busy.set(true);
    this.autoScheduling.set(true);
    this.feedback.set(null);
    try {
      const preview = await autoScheduleTournamentDay({ tournamentId: t.id, dayKey, preview: true });
      const slots = preview.slots ?? [];
      const skipped = preview.skipped ?? [];
      if (slots.length === 0) {
        this.feedback.set({ ok: false, message: 'Nenhuma partida elegível pra auto-agendar neste dia.' });
        return;
      }
      const proceed = confirm(`Auto-agendar ${slots.length} partida(s) em ${this.dayLabel(dayKey)}?${skipped.length ? ` (${skipped.length} puladas)` : ''}`);
      if (!proceed) return;
      await autoScheduleTournamentDay({ tournamentId: t.id, dayKey, preview: false });
      this.feedback.set({ ok: true, message: `${slots.length} partida(s) agendadas automaticamente.` });
      await this.ctx.reloadMatches();
    } catch (e) {
      this.feedback.set({ ok: false, message: (e as Error).message || 'Falha no auto-agendamento.' });
    } finally {
      this.busy.set(false);
      this.autoScheduling.set(false);
    }
  }

  protected minToY(min: number): number {
    return ((min - this.startMin()) / SLOT_MIN) * ROW_H;
  }

  protected fmt(min: number): string {
    return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
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
    return this.fmt(spWallMinutes(date));
  }
}

/** "HH:mm" → minutos do dia. */
function parseHHMM(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Minutos do dia na parede America/Sao_Paulo pra um instante UTC. */
function spWallMinutes(date: Date): number {
  const parts = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  return parseHHMM(parts);
}

/** dayKey (YYYY-MM-DD) + minutos na parede SP → instante UTC. SP é UTC-3 fixo desde 2019
 *  (sem horário de verão) — mesmo pressuposto do `eventDateFromDayKeyAndTime` do servidor. */
function spWallToDate(dayKey: string, minOfDay: number): Date {
  const h = Math.floor(minOfDay / 60);
  const m = minOfDay % 60;
  return new Date(`${dayKey}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-03:00`);
}
