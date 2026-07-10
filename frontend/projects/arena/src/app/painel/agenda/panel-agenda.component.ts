import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AgendaGridComponent, type AgendaBooking, type AgendaCourt } from '../ui/agenda-grid.component';
import { ChartTabsComponent } from '../ui/chart-tabs.component';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';

type AgendaView = 'Dia' | 'Semana';
type ListFilter = 'todas' | 'confirmada' | 'pendente' | 'manutencao';

interface AgendaListRow {
  id: string;
  time: string;
  court: string;
  client: string;
  sport: string;
  status: 'confirmada' | 'pendente' | 'manutencao';
}

const LIST_FILTERS: { id: ListFilter; label: string }[] = [
  { id: 'todas', label: 'Todas' },
  { id: 'confirmada', label: 'Confirmadas' },
  { id: 'pendente', label: 'Pendentes' },
  { id: 'manutencao', label: 'Bloqueios' },
];

const STATUS_LABEL: Record<AgendaListRow['status'], string> = {
  confirmada: 'Confirmada',
  pendente: 'Pendente',
  manutencao: 'Manutenção',
};

const STATUS_TONE: Record<AgendaListRow['status'], PillTone> = {
  confirmada: 'green',
  pendente: 'yellow',
  manutencao: 'dim',
};

/** Tela Agenda do painel (protótipo ArAgendaScreen): grade de quadras + lista lateral filtrável. */
@Component({
  selector: 'ar-panel-agenda',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, ChartTabsComponent, PillComponent, IconComponent, AgendaGridComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Agenda de quadras" [subtitle]="subtitleLabel()">
        <div class="header-actions">
          <ar-chart-tabs [tabs]="views" [active]="view()" (change)="view.set($any($event))" />
          <button type="button" class="ar-mini-btn ar-mini-btn-primary">
            <ar-icon name="plus" [size]="14" />
            Nova reserva
          </button>
        </div>
      </ar-page-header>

      <div class="body">
        <ar-panel-card class="grid-card">
          <ar-agenda-grid [courts]="courts" [bookings]="bookings" (bookingClick)="openReservation($event)" />
        </ar-panel-card>

        <ar-panel-card title="Reservas de hoje" [kicker]="listKicker()" class="list-card">
          <div class="ar-filter-bar" card-actions>
            @for (f of filters; track f.id) {
              <button type="button" class="ar-chip" [class.active]="filter() === f.id" (click)="filter.set(f.id)">
                {{ f.label }}
              </button>
            }
          </div>
          <div class="list">
            @for (r of filteredList(); track r.id) {
              <div class="agenda-row" [class.clickable]="r.status !== 'manutencao'" (click)="r.status !== 'manutencao' && openReservation(r.id)">
                <div class="agenda-time">{{ r.time }}</div>
                <div class="agenda-body">
                  <div class="agenda-title">{{ r.court }}{{ r.client ? ' · ' + r.client : '' }}</div>
                  <div class="agenda-sport">{{ r.sport }}</div>
                </div>
                <ar-pill [tone]="statusTone[r.status]">{{ statusLabel[r.status] }}</ar-pill>
              </div>
            }
          </div>
        </ar-panel-card>
      </div>
    </ar-panel-shell>
  `,
  styles: `
    .header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: grid;
      grid-template-columns: 1fr 340px;
      gap: 16px;
      min-height: 0;
    }

    .grid-card {
      min-height: 0;
      overflow: hidden;
    }

    .list-card {
      min-height: 0;
      overflow: hidden;
    }

    .list {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      scrollbar-width: none;
      margin-top: 2px;
    }

    .list::-webkit-scrollbar {
      display: none;
    }

    .agenda-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 11px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .agenda-row.clickable {
      cursor: pointer;
    }

    .agenda-row:last-child {
      border-bottom: none;
    }

    .agenda-time {
      width: 46px;
      flex: none;
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 12.5px;
      color: var(--nx-text);
    }

    .agenda-body {
      flex: 1;
      min-width: 0;
    }

    .agenda-title {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 12.5px;
      color: var(--nx-text);
    }

    .agenda-sport {
      font-size: 11px;
      color: var(--nx-text-dim);
      margin-top: 2px;
    }

    @media (max-width: 1180px) {
      .body {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class PanelAgendaComponent {
  private readonly router = inject(Router);

  protected readonly views: AgendaView[] = ['Dia', 'Semana'];
  protected readonly view = signal<AgendaView>('Dia');

  protected readonly filters = LIST_FILTERS;
  protected readonly filter = signal<ListFilter>('todas');
  protected readonly statusLabel = STATUS_LABEL;
  protected readonly statusTone = STATUS_TONE;

  protected readonly courts: AgendaCourt[] = [
    { id: 'q1', name: 'Quadra 1', sport: 'Beach Tennis' },
    { id: 'q2', name: 'Quadra 2', sport: 'Vôlei de praia' },
    { id: 'q3', name: 'Quadra 3', sport: 'Beach Soccer' },
  ];

  protected readonly bookings: AgendaBooking[] = [
    { id: 'r1', courtId: 'q1', start: 9 * 60, dur: 60, status: 'confirmada', client: 'João S.' },
    { id: 'r3', courtId: 'q1', start: 11 * 60 + 30, dur: 60, status: 'confirmada', client: 'Enzo R.' },
    { id: 'r5', courtId: 'q1', start: 16 * 60, dur: 90, status: 'confirmada', client: 'Bruno V.' },
    { id: 'r2', courtId: 'q2', start: 10 * 60, dur: 60, status: 'confirmada', client: 'Maria T.' },
    { id: 'r4', courtId: 'q2', start: 14 * 60, dur: 60, status: 'confirmada', client: 'Camila S.' },
    { id: 'r6', courtId: 'q2', start: 18 * 60, dur: 60, status: 'pendente', client: 'Júlia P.' },
    { id: 'r7', courtId: 'q3', start: 7 * 60, dur: 15 * 60, status: 'manutencao', client: '' },
  ];

  private readonly allList: AgendaListRow[] = [
    { id: 'r1', time: '09:00', court: 'Quadra 1', client: 'João S.', sport: 'Beach Tennis', status: 'confirmada' },
    { id: 'r2', time: '10:00', court: 'Quadra 2', client: 'Maria T.', sport: 'Vôlei de praia', status: 'confirmada' },
    { id: 'r3', time: '11:30', court: 'Quadra 1', client: 'Enzo R.', sport: 'Beach Tennis', status: 'confirmada' },
    { id: 'r4', time: '14:00', court: 'Quadra 2', client: 'Camila S.', sport: 'Vôlei de praia', status: 'confirmada' },
    { id: 'r5', time: '16:00', court: 'Quadra 1', client: 'Bruno V.', sport: 'Beach Tennis', status: 'confirmada' },
    { id: 'r6', time: '18:00', court: 'Quadra 2', client: 'Júlia P.', sport: 'Vôlei de praia', status: 'pendente' },
    { id: 'r7', time: '07:00', court: 'Quadra 3', client: '', sport: 'Beach Soccer', status: 'manutencao' },
  ];

  protected readonly filteredList = computed(() => {
    const f = this.filter();
    return f === 'todas' ? this.allList : this.allList.filter((r) => r.status === f);
  });

  protected readonly listKicker = computed(() => `${this.filteredList().length} de ${this.allList.length}`);

  protected readonly subtitleLabel = computed(() => {
    const now = new Date();
    const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(now).replace('.', '');
    const date = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(now).replace('.', '');
    return `${weekday} · ${date}`;
  });

  protected openReservation(id: string): void {
    this.router.navigate(['/painel/agenda', id]);
  }
}
