import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { BarRowComponent, type BarRowTone } from '../ui/bar-row.component';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';

type CourtStatus = 'livre' | 'ocupada' | 'manutencao';

interface Court {
  id: string;
  name: string;
  sport: string;
  status: CourtStatus;
  preco: number;
  ocupacao: number;
  reservasHoje: number;
  cobertura: string;
}

const STATUS_LABEL: Record<CourtStatus, string> = {
  livre: 'Livre agora',
  ocupada: 'Ocupada agora',
  manutencao: 'Em manutenção',
};

const STATUS_TONE: Record<CourtStatus, PillTone> = {
  livre: 'green',
  ocupada: 'orange',
  manutencao: 'dim',
};

const COURTS: Court[] = [
  { id: 'q1', name: 'Quadra 1', sport: 'Beach Tennis', status: 'livre', preco: 60, ocupacao: 92, reservasHoje: 5, cobertura: 'Coberta' },
  { id: 'q2', name: 'Quadra 2', sport: 'Vôlei de praia', status: 'ocupada', preco: 50, ocupacao: 84, reservasHoje: 4, cobertura: 'Descoberta' },
  { id: 'q3', name: 'Quadra 3', sport: 'Beach Soccer', status: 'manutencao', preco: 80, ocupacao: 0, reservasHoje: 0, cobertura: 'Coberta' },
];

/** Tela Quadras do painel (protótipo ArQuadrasScreen): KPIs e grid de cards de quadra. */
@Component({
  selector: 'ar-panel-courts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, BarRowComponent, PillComponent, IconComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Quadras" [subtitle]="arenaName() + ' · ' + courts.length + ' quadras cadastradas'">
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" (click)="createCourt()">
          <ar-icon name="plus" [size]="14" />
          Nova quadra
        </button>
      </ar-page-header>

      <div class="body">
        <div class="kpi-row">
          <ar-panel-card pad="sm" class="kpi-card">
            <div class="kpi-label">Ocupação média</div>
            <div class="kpi-value">78%</div>
          </ar-panel-card>
          <ar-panel-card pad="sm" class="kpi-card">
            <div class="kpi-label">Quadras livres agora</div>
            <div class="kpi-value tone-green">{{ freeCount() }}</div>
          </ar-panel-card>
          <ar-panel-card pad="sm" class="kpi-card">
            <div class="kpi-label">Em manutenção</div>
            <div class="kpi-value tone-pending">{{ maintenanceCount() }}</div>
          </ar-panel-card>
        </div>

        <div class="grid-wrap">
          <div class="grid">
            @for (c of courts; track c.name) {
              <div class="card">
                <div class="card-head">
                  <div class="card-icon">
                    <ar-icon name="courts" [size]="20" />
                  </div>
                  <ar-pill [tone]="statusTone[c.status]">{{ statusLabel[c.status] }}</ar-pill>
                </div>
                <div>
                  <div class="card-title">{{ c.name }}</div>
                  <div class="card-meta">{{ c.sport }} · {{ c.cobertura }}</div>
                </div>
                <div class="stat-grid">
                  <div class="stat-box">
                    <div class="stat-label">Preço/h</div>
                    <div class="stat-value">R$ {{ c.preco }}</div>
                  </div>
                  <div class="stat-box">
                    <div class="stat-label">Reservas hoje</div>
                    <div class="stat-value">{{ c.reservasHoje }}</div>
                  </div>
                </div>
                <ar-bar-row label="Ocupação (7d)" [pct]="c.ocupacao" [tone]="occupancyTone(c)" [last]="true" />
                <div class="card-foot">
                  <button type="button" class="ar-mini-btn" (click)="editCourt(c.id)">
                    <ar-icon name="edit" [size]="13" />
                    Editar
                  </button>
                  <button type="button" class="ar-ghost-btn">Ver agenda</button>
                </div>
              </div>
            }
          </div>
        </div>
      </div>
    </ar-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow: hidden;
    }

    .kpi-row {
      display: flex;
      gap: 16px;
      flex: none;
    }

    .kpi-card {
      flex: 1;
    }

    .kpi-label {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .kpi-value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 28px;
      color: var(--nx-text);
      margin-top: 8px;
    }

    .kpi-value.tone-green {
      color: var(--nx-win);
    }

    .kpi-value.tone-pending {
      color: var(--nx-pending);
    }

    .grid-wrap {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      scrollbar-width: none;
    }

    .grid-wrap::-webkit-scrollbar {
      display: none;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }

    .card {
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-4);
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .card-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
    }

    .card-icon {
      width: 44px;
      height: 44px;
      border-radius: var(--nx-r-2);
      flex: none;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-orange-500);
      display: grid;
      place-items: center;
    }

    .card-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 16px;
      color: var(--nx-text);
    }

    .card-meta {
      font-size: 12.5px;
      color: var(--nx-text-dim);
      margin-top: 3px;
    }

    .stat-grid {
      display: flex;
      gap: 10px;
    }

    .stat-box {
      flex: 1;
      padding: 10px 12px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
    }

    .stat-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      color: var(--nx-text-dim);
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }

    .stat-value {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 15px;
      color: var(--nx-text);
      margin-top: 2px;
    }

    .card-foot {
      display: flex;
      gap: 8px;
    }

    @media (max-width: 1180px) {
      .grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media (max-width: 720px) {
      .grid {
        grid-template-columns: 1fr;
      }

      .kpi-row {
        flex-wrap: wrap;
      }
    }
  `,
})
export class PanelCourtsComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly courts = COURTS;
  protected readonly statusLabel = STATUS_LABEL;
  protected readonly statusTone = STATUS_TONE;

  protected readonly freeCount = computed(() => this.courts.filter((c) => c.status === 'livre').length);
  protected readonly maintenanceCount = computed(() => this.courts.filter((c) => c.status === 'manutencao').length);

  protected readonly arenaName = computed(() => this.auth.displayName() || 'Arena');

  protected occupancyTone(c: Court): BarRowTone {
    if (c.ocupacao === 0) {
      return 'red';
    }
    return c.ocupacao >= 85 ? 'green' : 'orange';
  }

  protected createCourt(): void {
    this.router.navigate(['/painel/quadras/nova']);
  }

  protected editCourt(id: string): void {
    this.router.navigate(['/painel/quadras', id, 'editar']);
  }
}
