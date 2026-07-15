import { ChangeDetectionStrategy, Component } from '@angular/core';
import {
  OGA_BLOCKS,
  OGA_END,
  OGA_FILA,
  OGA_QUADRAS,
  OGA_ROW_H,
  OGA_SLOT,
  OGA_START,
  type OgaBloco,
} from '../data/mock-data';
import { OgCardComponent } from '../ui/card.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { ChaveamentoSubnavComponent } from './chaveamento-subnav.component';

/** Grade quadras × horários para agendar partidas — arraste um card da fila para um horário livre. */
@Component({
  selector: 'og-agendamento',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgPageHeaderComponent, OgCardComponent, OgIconComponent, ChaveamentoSubnavComponent],
  template: `
    <og-page-header
      title="Agendamento de jogos"
      subtitle="Liga Municipal de Beach Tennis · rodada 6 · arraste uma partida da fila para um horário livre"
    >
      <button type="button" class="og-mini-btn og-mini-btn-primary"><og-icon name="plus" [size]="14" />Nova partida</button>
    </og-page-header>

    <og-chaveamento-subnav active="agendamento" />
    <div class="og-content" style="display:grid;grid-template-columns:1fr 300px;gap:16px;min-height:0">
      <og-card style="min-height:0;overflow:hidden">
        <div class="og-agenda">
          <div class="og-agenda-cols">
            @for (c of quadras; track c.id) {
              <div class="og-agenda-col-label">{{ c.name }}</div>
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
                @for (c of quadras; track c.id) {
                  <div class="og-agenda-column">
                    @for (b of blocks[c.id]; track b.partida) {
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
          @for (f of fila; track f.partida) {
            <div class="og-agenda-fila-item" draggable="true">
              <div class="partida">{{ f.partida }}</div>
              <div class="meta">{{ f.evento }} · {{ f.categoria }}</div>
            </div>
          }
        </div>
        <div class="og-agenda-fila-hint">Arraste um card para um horário livre na grade, ou clique num espaço vazio para agendar manualmente.</div>
      </og-card>
    </div>
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
  `,
})
export class AgendamentoComponent {
  protected readonly quadras = OGA_QUADRAS;
  protected readonly blocks: Record<string, OgaBloco[]> = OGA_BLOCKS;
  protected readonly fila = OGA_FILA;

  protected readonly start = OGA_START;
  protected readonly slot = OGA_SLOT;
  protected readonly rowH = OGA_ROW_H;
  protected readonly rows = (OGA_END - OGA_START) / OGA_SLOT;
  protected readonly rowIndexes = Array.from({ length: this.rows }, (_, i) => i);

  protected minToY(min: number): number {
    return ((min - OGA_START) / OGA_SLOT) * OGA_ROW_H;
  }

  protected fmt(min: number): string {
    return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  }
}
