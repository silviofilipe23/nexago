import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { OG_INSCRITOS, OG_PAY_LABEL, OG_PAY_TONE, initialsOf, type OgInscrito } from '../data/mock-data';
import { OgAvatarComponent } from '../ui/avatar.component';
import { OgCardComponent } from '../ui/card.component';
import { OgChartTabsComponent } from '../ui/chart-tabs.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgPillComponent } from '../ui/pill.component';

type Tab = 'todos' | 'pago' | 'pendente' | 'estornado';

/** Atletas e duplas inscritos em todos os eventos, com status de pagamento e exportação. */
@Component({
  selector: 'og-inscricoes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgPageHeaderComponent, OgCardComponent, OgChartTabsComponent, OgIconComponent, OgPillComponent, OgAvatarComponent],
  template: `
    <og-page-header title="Inscrições" subtitle="Atletas e duplas inscritos em todos os eventos">
      <div class="og-search-box"><og-icon name="search" [size]="15" /><span>Buscar…</span></div>
      <button type="button" class="og-mini-btn"><og-icon name="download" [size]="14" />Exportar</button>
    </og-page-header>

    <div class="og-content">
      <div class="og-kpi-row">
        <og-card pad="sm" flex="1">
          <div class="og-kpi-label">Total de inscritos</div>
          <div class="og-kpi-value sm">{{ inscritos.length }}</div>
        </og-card>
        <og-card pad="sm" flex="1">
          <div class="og-kpi-label">Pagamentos pendentes</div>
          <div class="og-kpi-value sm" style="color:var(--nx-pending)">{{ pendentes }}</div>
        </og-card>
        <og-card pad="sm" flex="1">
          <div class="og-kpi-label">Categorias abertas</div>
          <div class="og-kpi-value sm">6</div>
        </og-card>
      </div>

      <og-chart-tabs [tabs]="tabs" [active]="tab()" (changed)="tab.set($any($event))" />

      <og-card pad="0" flex="1">
        <div class="og-table-head">
          <span style="flex:1.4">Atleta / Dupla</span>
          <span style="flex:1">Evento</span>
          <span style="width:70px">Data</span>
          <span style="width:110px">Pagamento</span>
          <span style="width:80px"></span>
        </div>
        <div class="og-table-body">
          @for (r of filtered(); track r.name + r.evento) {
            <div class="og-row">
              <og-avatar [initials]="initialsOf(r.name, ' ')" [size]="34" />
              <span style="flex:1.4;min-width:0">
                <div class="og-inscricoes-name">{{ r.name }}</div>
                <div class="og-inscricoes-cat">{{ r.categoria }}</div>
              </span>
              <span style="flex:1" class="og-inscricoes-evento">{{ r.evento }}</span>
              <span style="width:70px" class="og-inscricoes-date">{{ r.date }}</span>
              <span style="width:110px"><og-pill [tone]="payTone[r.pay]">{{ payLabel[r.pay] }}</og-pill></span>
              <button type="button" class="og-ghost-btn">Detalhes</button>
            </div>
          }
        </div>
      </og-card>
    </div>
  `,
  styles: `
    .og-inscricoes-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13.5px;
      color: var(--nx-text);
    }
    .og-inscricoes-cat {
      font-family: var(--nx-font-ui);
      font-size: 11.5px;
      color: var(--nx-text-dim);
      margin-top: 2px;
    }
    .og-inscricoes-evento {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text-mute);
    }
    .og-inscricoes-date {
      font-family: var(--nx-font-mono);
      font-size: 11.5px;
      color: var(--nx-text-dim);
    }
  `,
})
export class InscricoesComponent {
  protected readonly inscritos = OG_INSCRITOS;
  protected readonly tabs = ['todos', 'pago', 'pendente', 'estornado'];
  protected readonly tab = signal<Tab>('todos');
  protected readonly payTone = OG_PAY_TONE;
  protected readonly payLabel = OG_PAY_LABEL;
  protected readonly initialsOf = initialsOf;
  protected readonly pendentes = OG_INSCRITOS.filter((r) => r.pay === 'pendente').length;

  protected readonly filtered = computed<OgInscrito[]>(() => {
    const t = this.tab();
    return t === 'todos' ? OG_INSCRITOS : OG_INSCRITOS.filter((r) => r.pay === t);
  });
}
