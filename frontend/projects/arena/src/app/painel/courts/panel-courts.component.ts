import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ArenaContextService } from '../data/arena-context.service';
import { maxCourtsFor } from '../data/arena-plan.model';
import { arenaFirestore } from '../data/firestore';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';
import { ARENA_COURT_STATUS_LABEL, type ArenaCourt, type ArenaCourtStatus } from './court.model';
import { fetchCourtsList } from './courts-repository';

const STATUS_TONE: Record<ArenaCourtStatus, PillTone> = { active: 'green', maintenance: 'yellow' };

function formatBRL(n: number): string {
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

/** Tela Quadras do painel: CRUD real de `arenas/{arenaId}/courts`. Sem "ocupação"/"reservas
 *  hoje"/"cobertura" — nenhum desses campos existe no schema real (ocupação é derivada de
 *  reservas, não persistida na quadra). Limite de quadras por plano (sem plano/Starter=2,
 *  Pro=5, Elite=ilimitado) já reforçado nas rules — a UI só ajuda a não bater de frente. */
@Component({
  selector: 'ar-panel-courts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, PillComponent, IconComponent, RouterLink],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Quadras" [subtitle]="headerSubtitle()">
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="atCap()" (click)="createCourt()">
          <ar-icon name="plus" [size]="14" />
          Nova quadra
        </button>
      </ar-page-header>

      <div class="body">
        @if (arenaNotFound()) {
          <p class="state-text">Nenhuma arena vinculada à sua conta ainda.</p>
        } @else if (arenaLoading() || loading()) {
          <p class="state-text">Carregando quadras…</p>
        } @else if (loadError(); as err) {
          <p class="state-text">{{ err }}</p>
        } @else {
          @if (atCap()) {
            <div class="cap-banner">
              Limite de {{ maxCourts() }} quadras do seu plano atingido — faça upgrade em
              <a routerLink="/painel/planos" class="link">Planos</a> pra cadastrar mais.
            </div>
          }

          <div class="kpi-row">
            <ar-panel-card pad="sm" class="kpi-card">
              <div class="kpi-label">Quadras cadastradas</div>
              <div class="kpi-value">{{ courts().length }}</div>
            </ar-panel-card>
            <ar-panel-card pad="sm" class="kpi-card">
              <div class="kpi-label">Ativas</div>
              <div class="kpi-value tone-green">{{ activeCount() }}</div>
            </ar-panel-card>
            <ar-panel-card pad="sm" class="kpi-card">
              <div class="kpi-label">Em manutenção</div>
              <div class="kpi-value tone-pending">{{ maintenanceCount() }}</div>
            </ar-panel-card>
          </div>

          <div class="grid-wrap">
            <div class="grid">
              @for (c of courts(); track c.id) {
                <div class="card">
                  <div class="card-head">
                    <div class="card-icon">
                      <ar-icon name="courts" [size]="20" />
                    </div>
                    <ar-pill [tone]="statusTone[c.status]">{{ statusLabel[c.status] }}</ar-pill>
                  </div>
                  <div>
                    <div class="card-title">{{ c.name }}</div>
                    <div class="card-meta">{{ c.types.join(', ') || 'Sem modalidade' }}</div>
                  </div>
                  <div class="stat-box">
                    <div class="stat-label">Preço/h</div>
                    <div class="stat-value">{{ c.basePricePerHourReais != null ? formatBRL(c.basePricePerHourReais) : 'Não definido' }}</div>
                  </div>
                  <div class="card-foot">
                    <button type="button" class="ar-mini-btn" (click)="editCourt(c.id)">
                      <ar-icon name="edit" [size]="13" />
                      Editar
                    </button>
                  </div>
                </div>
              } @empty {
                <p class="state-text">Nenhuma quadra cadastrada ainda.</p>
              }
            </div>
          </div>
        }
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

    .state-text {
      font-size: 13.5px;
      color: var(--nx-text-mute);
    }

    .link {
      color: var(--nx-orange-500);
    }

    .cap-banner {
      flex: none;
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-line-strong);
      background: var(--nx-surface-1);
      padding: 10px 14px;
      font-size: 12.5px;
      color: var(--nx-text-mute);
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

    .stat-box {
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
  private readonly arenaContext = inject(ArenaContextService);
  private readonly router = inject(Router);

  protected readonly statusLabel = ARENA_COURT_STATUS_LABEL;
  protected readonly statusTone = STATUS_TONE;
  protected readonly formatBRL = formatBRL;

  protected readonly arenaLoading = computed(() => this.arenaContext.loading());
  protected readonly arenaNotFound = computed(() => this.arenaContext.notFound());

  protected readonly courts = signal<ArenaCourt[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  protected readonly activeCount = computed(() => this.courts().filter((c) => c.status === 'active').length);
  protected readonly maintenanceCount = computed(() => this.courts().filter((c) => c.status === 'maintenance').length);

  protected readonly maxCourts = computed(() => maxCourtsFor(this.arenaContext.planStatus().tier, this.arenaContext.entitled()));
  protected readonly atCap = computed(() => {
    const max = this.maxCourts();
    return max != null && this.courts().length >= max;
  });

  protected readonly headerSubtitle = computed(
    () => `${this.arenaContext.arenaName() ?? 'Arena'} · ${this.courts().length} quadras cadastradas`,
  );

  constructor() {
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      if (!arenaId) return;
      void this.load(arenaId);
    });
  }

  private async load(arenaId: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.courts.set(await fetchCourtsList(arenaFirestore(), arenaId));
    } catch {
      this.loadError.set('Não foi possível carregar as quadras.');
    } finally {
      this.loading.set(false);
    }
  }

  protected createCourt(): void {
    if (this.atCap()) return;
    this.router.navigate(['/painel/quadras/nova']);
  }

  protected editCourt(id: string): void {
    this.router.navigate(['/painel/quadras', id, 'editar']);
  }
}
