import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../ui/icon.component';
import { KpiCardComponent } from '../ui/kpi-card.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';

interface PlanDef {
  id: string;
  nome: string;
  valor: number;
  ciclo: string;
  ativos: number;
  tone: PillTone;
  descricao: string;
}

export const PLAN_DEFS: PlanDef[] = [
  { id: 'mensal', nome: 'Mensal', valor: 180, ciclo: 'Mensal', ativos: 14, tone: 'orange', descricao: 'Acesso a treinos regulares e avaliações mensais.' },
  { id: 'trimestral', nome: 'Trimestral', valor: 480, ciclo: 'A cada 3 meses', ativos: 6, tone: 'green', descricao: 'Mesmo acesso do Mensal, com desconto de 11% no ciclo.' },
  { id: 'anual', nome: 'Anual', valor: 1600, ciclo: 'Anual', ativos: 3, tone: 'dim', descricao: 'Inclui inscrição gratuita em 2 torneios por ano.' },
  { id: 'avulso', nome: 'Avulso', valor: 30, ciclo: 'Por treino', ativos: 1, tone: 'yellow', descricao: 'Cobrança por treino avulso, sem vínculo mensal.' },
];

function brl(value: number): string {
  return 'R$ ' + value.toLocaleString('pt-BR');
}

/** Planos — listagem (protótipo TrPlanosScreen) — tela mock, sem Firestore.
 *  Ver docs/superpowers/specs/2026-07-13-coach-remaining-screens-mock-design.md. */
@Component({
  selector: 'co-panel-planos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, KpiCardComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent, PillComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Planos" subtitle="Planos de mensalidade da equipe · 4 ativos">
        <a class="co-mini-btn co-mini-btn-primary" routerLink="/painel/financeiro/planos/novo">
          <co-icon name="plus" [size]="14" />
          Novo plano
        </a>
      </co-page-header>

      <div class="body">
        <div class="kpi-row">
          <co-kpi-card label="Planos ativos" value="4" delta="1 avulso, 3 recorrentes" />
          <co-kpi-card label="Atletas cobertos" value="24" delta="100% da equipe" deltaTone="green" />
          <co-kpi-card label="Receita recorrente" [value]="brl(180 * 14 + 160 * 6 + 133 * 3)" delta="Estimativa mensal" deltaTone="flat" />
        </div>
        <div class="grid">
          @for (p of plans; track p.id) {
            <co-panel-card pad="lg" class="plan-card">
              <div class="plan-head">
                <div class="plan-name">{{ p.nome }}</div>
                <co-pill [tone]="p.tone">{{ p.ativos }} atletas</co-pill>
              </div>
              <div class="plan-price">
                <span class="plan-value">{{ brl(p.valor) }}</span>
                <span class="plan-cycle">/ {{ p.ciclo.toLowerCase() }}</span>
              </div>
              <p class="plan-desc">{{ p.descricao }}</p>
            </co-panel-card>
          }
        </div>
      </div>
    </co-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .kpi-row {
      display: flex;
      gap: 16px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
    }
    .plan-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
    }
    .plan-name {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 15px;
      color: var(--nx-text);
    }
    .plan-price {
      display: flex;
      align-items: baseline;
      gap: 6px;
      margin-bottom: 4px;
    }
    .plan-value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 26px;
      color: var(--nx-orange-500);
      letter-spacing: -0.02em;
    }
    .plan-cycle {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      color: var(--nx-text-dim);
    }
    .plan-desc {
      font-family: var(--nx-font-ui);
      font-size: 11.5px;
      color: var(--nx-text-mute);
      line-height: 1.4;
      margin: 0;
    }
  `,
})
export class PanelPlanosComponent {
  protected readonly plans = PLAN_DEFS;

  protected brl(value: number): string {
    return brl(value);
  }
}
