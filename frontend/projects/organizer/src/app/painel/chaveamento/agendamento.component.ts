import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { OGA_END, OGA_ROW_H, OGA_SLOT, OGA_START } from '../data/mock-data';
import { OgCardComponent } from '../ui/card.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { ChaveamentoContextService } from './chaveamento-context.service';
import { ChaveamentoSelectorComponent } from './chaveamento-selector.component';
import { ChaveamentoSubnavComponent } from './chaveamento-subnav.component';

/** Duração fixa assumida pro bloco visual — `TournamentMatch` não expõe duração real de
 *  partida (só horário de início em `scheduledAt`), então usamos um valor padrão só pra
 *  desenhar o bloco na grade (mesma simplificação documentada no `og-agenda-block`). */
const DEFAULT_DURATION_MIN = 60;

interface AgendaBloco {
  matchId: string;
  start: number;
  dur: number;
  partida: string;
  status: 'confirmada' | 'pendente';
}

interface AgendaFilaItem {
  partida: string;
  evento: string;
  categoria: string;
}

/** Grade quadras × horários — dados reais de `listMatches` (Task O6): colunas de quadra
 *  derivadas das quadras distintas usadas pelos jogos do torneio/categoria selecionados;
 *  blocos posicionados pelo horário real (`scheduledAt`); fila = jogos sem horário definido.
 *  Arrastar um card pra reagendar continua mock/fase 2 (operação real fica no app). */
@Component({
  selector: 'og-agendamento',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgPageHeaderComponent, OgCardComponent, OgIconComponent, ChaveamentoSubnavComponent, ChaveamentoSelectorComponent],
  template: `
    <og-page-header title="Agendamento de jogos" [subtitle]="headerSubtitle()">
      <!-- mock (fase 2): agendamento manual continua operação do app -->
      <button type="button" class="og-mini-btn og-mini-btn-primary"><og-icon name="plus" [size]="14" />Nova partida</button>
    </og-page-header>

    <og-chaveamento-subnav active="agendamento" />
    <og-chaveamento-selector />

    @if (ctx.loadingTournaments() || ctx.loadingMatches()) {
      <div class="og-card" style="color:var(--nx-text-dim);font-family:var(--nx-font-ui);font-size:13px">Carregando jogos…</div>
    } @else if (ctx.tournaments().length > 0 && ctx.matches().length === 0) {
      <div class="og-card" style="color:var(--nx-text-dim);font-family:var(--nx-font-ui);font-size:13px">Chaves ainda não geradas</div>
    } @else {
      <div class="og-content" style="display:grid;grid-template-columns:1fr 300px;gap:16px;min-height:0">
        <og-card style="min-height:0;overflow:hidden">
          <div class="og-agenda">
            <div class="og-agenda-cols">
              @for (c of courts(); track c) {
                <div class="og-agenda-col-label">{{ c }}</div>
              } @empty {
                <div class="og-agenda-col-label" style="color:var(--nx-text-dim)">Nenhum jogo com quadra e horário definidos</div>
              }
            </div>
            <div class="og-agenda-scroll">
              <div class="og-agenda-grid" [style.height.px]="rows * rowH + 10">
                @for (i of rowIndexes; track i) {
                  <div class="og-agenda-hour-row" [style.top.px]="i * rowH">
                    @if ((start + i * slot) % 60 === 0) {
                      <div class="og-agenda-hour-label">{{ fmt(start + i * slot) }}</div>
                    }
                    <div class="og-agenda-hour-line" [class.solid]="(start + i * slot) % 60 === 0"></div>
                  </div>
                }
                <div class="og-agenda-columns">
                  @for (c of courts(); track c) {
                    <div class="og-agenda-column">
                      @for (b of blocks()[c]; track b.matchId) {
                        <div
                          class="og-agenda-block"
                          [class.confirmada]="b.status === 'confirmada'"
                          [class.pendente]="b.status === 'pendente'"
                          [style.top.px]="minToY(b.start) + 1"
                          [style.height.px]="(b.dur / slot) * rowH - 3"
                        >
                          <div class="partida">{{ b.partida }}</div>
                          <div class="hora">{{ fmt(b.start) }}–{{ fmt(b.start + b.dur) }}</div>
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
          <div class="og-agenda-fila">
            @for (f of fila(); track f.partida) {
              <div class="og-agenda-fila-item" draggable="true">
                <div class="partida">{{ f.partida }}</div>
                <div class="meta">{{ f.evento }} · {{ f.categoria }}</div>
              </div>
            } @empty {
              <p class="og-empty">Nenhuma partida aguardando horário</p>
            }
          </div>
          <!-- mock (fase 2): arrastar um card da fila pra grade continua operação do app -->
          <div class="og-agenda-fila-hint">Arraste um card para um horário livre na grade, ou clique num espaço vazio para agendar manualmente.</div>
        </og-card>
      </div>
    }
  `,
  styles: `
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
      height: 32px;
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
    .og-agenda-block {
      position: absolute;
      left: 3px;
      right: 3px;
      cursor: grab;
      border-radius: 8px;
      padding: 5px 8px;
      overflow: hidden;
      border-left: 3px solid;
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
    .og-agenda-block .partida {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 11px;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .og-agenda-block .hora {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      color: var(--nx-text-dim);
      margin-top: 2px;
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
      cursor: grab;
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

  protected readonly start = OGA_START;
  protected readonly slot = OGA_SLOT;
  protected readonly rowH = OGA_ROW_H;
  protected readonly rows = (OGA_END - OGA_START) / OGA_SLOT;
  protected readonly rowIndexes = Array.from({ length: this.rows }, (_, i) => i);

  protected readonly headerSubtitle = computed(() => {
    const t = this.ctx.tournament();
    if (!t) return '';
    const cat = this.ctx.categoryName();
    return `${cat ? `${t.name} · categoria ${cat}` : t.name} · arraste uma partida da fila para um horário livre`;
  });

  /** Jogos com quadra + horário dentro da janela do grid (08:00–20:00). */
  private readonly scheduledInGrid = computed(() =>
    this.ctx
      .matchesFiltered()
      .filter((m) => m.court && m.scheduledAt)
      .map((m) => ({ match: m, minutes: m.scheduledAt!.getHours() * 60 + m.scheduledAt!.getMinutes() }))
      .filter((x) => x.minutes >= OGA_START && x.minutes < OGA_END),
  );

  protected readonly courts = computed(() => {
    const set = new Set(this.scheduledInGrid().map((x) => x.match.court!));
    return [...set].sort((a, b) => a.localeCompare(b));
  });

  protected readonly blocks = computed(() => {
    const byCourt: Record<string, AgendaBloco[]> = {};
    for (const { match, minutes } of this.scheduledInGrid()) {
      const list = byCourt[match.court!] ?? [];
      list.push({
        matchId: match.id,
        start: minutes,
        dur: DEFAULT_DURATION_MIN,
        partida: `${match.team1Label} vs ${match.team2Label}`,
        status: match.score != null ? 'confirmada' : 'pendente',
      });
      byCourt[match.court!] = list;
    }
    return byCourt;
  });

  protected readonly fila = computed<AgendaFilaItem[]>(() => {
    const t = this.ctx.tournament();
    const categoryNameOf = new Map((t?.categories ?? []).map((c) => [c.id, c.name]));
    return this.ctx
      .matchesFiltered()
      .filter((m) => !m.scheduledAt)
      .map((m) => ({
        partida: `${m.team1Label} vs ${m.team2Label}`,
        evento: t?.name ?? '',
        categoria: (m.categoryId && categoryNameOf.get(m.categoryId)) || 'Sem categoria',
      }));
  });

  protected minToY(min: number): number {
    return ((min - OGA_START) / OGA_SLOT) * OGA_ROW_H;
  }

  protected fmt(min: number): string {
    return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  }
}
