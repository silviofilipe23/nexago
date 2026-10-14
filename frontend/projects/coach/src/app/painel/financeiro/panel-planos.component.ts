import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../ui/icon.component';
import { KpiCardComponent } from '../ui/kpi-card.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent } from '../ui/pill.component';
import { FinanceService } from './finance.service';
import { CYCLE_LABEL, formatBRL, monthlyEquivalentCents } from './finance-rules';
import type { Plan } from './finance-model';

/** Planos de mensalidade do treinador (livro-caixa manual, fase 1). */
@Component({
  selector: 'co-panel-planos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, KpiCardComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent, PillComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Planos" [subtitle]="subtitle()">
        <a class="co-mini-btn" routerLink="/painel/financeiro">Pagamentos</a>
        <a class="co-mini-btn co-mini-btn-primary" routerLink="/painel/financeiro/planos/novo">
          <co-icon name="plus" [size]="14" />
          Novo plano
        </a>
      </co-page-header>

      <div class="body">
        @if (finance.error(); as err) {
          <div class="co-alert" role="alert">{{ err }}</div>
        }
        @if (actionError(); as err) {
          <div class="co-alert" role="alert">{{ err }}</div>
        }

        <div class="kpi-row">
          <co-kpi-card label="Planos ativos" [value]="'' + activePlansCount()" />
          <co-kpi-card label="Alunos matriculados" [value]="'' + enrolledCount()" />
          <co-kpi-card label="Receita mensal prevista" [value]="monthlyRevenue()" delta="Soma das matrículas ativas" deltaTone="flat" />
        </div>

        @if (finance.ready() && !finance.error() && plans().length === 0) {
          <co-panel-card title="Nenhum plano ainda" kicker="Comece por aqui">
            <p class="desc">Crie seu primeiro plano de mensalidade para matricular os alunos.</p>
          </co-panel-card>
        }

        <div class="grid">
          @for (p of plans(); track p.id) {
            <co-panel-card pad="lg">
              <div class="plan-head">
                <div class="plan-name">{{ p.name }}</div>
                <co-pill [tone]="p.active ? 'green' : 'dim'">{{ p.active ? 'Ativo' : 'Inativo' }}</co-pill>
              </div>
              <div class="plan-price">
                <span class="plan-value">{{ money(p.amountCents) }}</span>
                <span class="plan-cycle">{{ cycleLabel(p) }}</span>
              </div>
              <p class="desc">{{ p.description || 'Sem descrição.' }}</p>
              <div class="plan-meta">{{ enrolledIn(p.id) }} aluno(s) matriculado(s)</div>
              <div class="actions">
                <a class="co-ghost-btn" [routerLink]="['/painel/financeiro/planos', p.id, 'editar']">Editar</a>
                <button type="button" class="co-ghost-btn" [disabled]="busyId() === p.id" (click)="toggleActive(p)">
                  {{ p.active ? 'Desativar' : 'Reativar' }}
                </button>
              </div>
            </co-panel-card>
          }
        </div>
      </div>
    </co-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px var(--co-gutter, 32px) 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .kpi-row {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    }
    @media (max-width: 900px) {
      .grid {
        grid-template-columns: 1fr;
      }
    }
    .plan-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .plan-name {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 16px;
      color: var(--nx-text);
    }
    .plan-price {
      margin: 10px 0 6px;
      display: flex;
      align-items: baseline;
      gap: 8px;
    }
    .plan-value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 24px;
      color: var(--nx-text);
    }
    .plan-cycle,
    .plan-meta {
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .desc {
      margin: 6px 0;
      color: var(--nx-text-mute);
      font-size: 13px;
      line-height: 1.5;
    }
    .actions {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }
  `,
})
export class PanelPlanosComponent {
  protected readonly finance = inject(FinanceService);

  protected readonly busyId = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);

  protected readonly plans = computed(() => [...this.finance.plans()].sort((a, b) => a.name.localeCompare(b.name)));
  protected readonly activePlansCount = computed(() => this.plans().filter((p) => p.active).length);
  protected readonly enrolledCount = computed(() => this.finance.enrollments().filter((e) => e.status === 'ativa').length);
  protected readonly monthlyRevenue = computed(() =>
    formatBRL(monthlyEquivalentCents(this.finance.enrollments(), this.finance.plans())),
  );
  protected readonly subtitle = computed(() => {
    const n = this.plans().length;
    return `Planos de mensalidade · ${n} plano${n === 1 ? '' : 's'}`;
  });

  protected money(cents: number): string {
    return formatBRL(cents);
  }

  protected cycleLabel(plan: Plan): string {
    return CYCLE_LABEL[plan.cycle];
  }

  protected enrolledIn(planId: string): number {
    return this.finance.enrollments().filter((e) => e.planId === planId && e.status === 'ativa').length;
  }

  protected async toggleActive(plan: Plan): Promise<void> {
    this.actionError.set(null);
    this.busyId.set(plan.id);
    try {
      await this.finance.setPlanActive(plan.id, !plan.active);
    } catch (err) {
      this.actionError.set(err instanceof Error ? err.message : 'Não foi possível atualizar o plano.');
    } finally {
      this.busyId.set(null);
    }
  }
}
