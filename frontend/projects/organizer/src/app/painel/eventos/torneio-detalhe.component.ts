import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OGD_CATEGORIAS } from '../data/mock-data';
import { OgChartTabsComponent } from '../ui/chart-tabs.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgPillComponent } from '../ui/pill.component';

/** Detalhe do torneio — categorias com progresso de inscrição, pagamentos e ação de sortear chave. */
@Component({
  selector: 'og-torneio-detalhe',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, OgPageHeaderComponent, OgChartTabsComponent, OgIconComponent, OgPillComponent],
  template: `
    <og-page-header title="Open Goiânia Beach" subtitle="Torneio · Arena ErreJota · 28–30 Mar 2026 · Inscrições abertas">
      <button type="button" class="og-ghost-btn"><og-icon name="download" [size]="14" />Compartilhar</button>
      <button type="button" class="og-mini-btn"><og-icon name="edit" [size]="14" />Editar torneio</button>
    </og-page-header>

    <div class="og-content">
      <div class="og-kpi-row">
        <div class="og-card og-card-pad-sm" style="flex:1">
          <div class="og-kpi-label">Inscritos</div>
          <div class="og-kpi-value sm">34</div>
        </div>
        <div class="og-card og-card-pad-sm" style="flex:1">
          <div class="og-kpi-label">Pendentes</div>
          <div class="og-kpi-value sm" style="color:var(--nx-pending)">4</div>
        </div>
        <div class="og-card og-card-pad-sm" style="flex:1">
          <div class="og-kpi-label">Categorias</div>
          <div class="og-kpi-value sm">{{ categorias.length }}</div>
        </div>
        <div class="og-card og-card-pad-sm" style="flex:1">
          <div class="og-kpi-label">Arrecadado</div>
          <div class="og-kpi-value sm" style="color:var(--nx-win)">R$ 5,7K</div>
        </div>
      </div>

      <div class="og-torneio-tabs-row">
        <og-chart-tabs [tabs]="tabs" [active]="tab()" (changed)="tab.set($event)" />
        <div class="og-page-header-spacer"></div>
        <button type="button" class="og-ghost-btn"><og-icon name="plus" [size]="13" />Adicionar categoria</button>
      </div>

      @if (tab() === 'categorias') {
        <div class="og-torneio-cats-grid">
          @for (c of categorias; track c.id) {
            <div class="og-torneio-cat" [class.highlight]="c.full">
              <div class="og-torneio-cat-body">
                <div class="og-torneio-cat-top">
                  <div>
                    <div class="og-torneio-cat-name">{{ c.name }}</div>
                    <div class="og-tag-row" style="margin-top:8px">
                      @for (t of c.tags; track t) {
                        <span class="og-tag">{{ t }}</span>
                      }
                    </div>
                  </div>
                  <og-pill [tone]="c.full ? 'green' : 'orange'">{{ c.full ? 'Lotado' : 'Abertas' }}</og-pill>
                </div>
                <div class="og-torneio-cat-progress">
                  <div class="row">
                    <span class="frac">{{ c.taken }}<em>/{{ c.total }} duplas</em></span>
                    <span class="pct" [style.color]="c.full ? 'var(--nx-win)' : 'var(--nx-orange-500)'">{{ pct(c) }}%</span>
                  </div>
                  <div class="og-progress" [class.win]="c.full"><span [style.width.%]="pct(c)"></span></div>
                </div>
                <div class="og-torneio-cat-footer">
                  <span class="paid">{{ c.pagas }} pagas</span>
                  @if (c.pend > 0) {
                    <span class="pend">{{ c.pend }} pend.</span>
                  }
                  <span class="rev">{{ c.receita }}</span>
                  <div class="og-page-header-spacer"></div>
                  <a class="og-ghost-btn" [routerLink]="['/painel/eventos', id(), 'categorias', c.id]">Abrir</a>
                </div>
              </div>
              @if (c.hint) {
                <div class="og-torneio-cat-hint">
                  <og-icon name="bracket" [size]="16" style="color:var(--nx-orange-500)" />
                  <span>{{ c.hint }}</span>
                  <a class="og-mini-btn og-mini-btn-primary" [routerLink]="['/painel/eventos', id(), 'categorias', c.id, 'seeds']">Gerar chave</a>
                </div>
              }
            </div>
          }
        </div>
      } @else {
        <div class="og-card" style="color:var(--nx-text-dim);font-family:var(--nx-font-ui);font-size:13px">
          Sem dados nesta aba ainda — protótipo mockado.
        </div>
      }
    </div>
  `,
  styles: `
    .og-torneio-tabs-row {
      display: flex;
      align-items: center;
      gap: 10px;
      flex: none;
    }
    .og-torneio-cats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }
    .og-torneio-cat {
      border-radius: var(--nx-r-3);
      overflow: hidden;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
    }
    .og-torneio-cat.highlight {
      background: var(--nx-orange-tint);
      border-color: rgba(255, 106, 26, 0.3);
    }
    .og-torneio-cat-body {
      padding: 16px;
    }
    .og-torneio-cat-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }
    .og-torneio-cat-name {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 16px;
      color: var(--nx-text);
    }
    .og-torneio-cat-progress {
      margin-top: 14px;
    }
    .og-torneio-cat-progress .row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 6px;
    }
    .og-torneio-cat-progress .frac {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13.5px;
      color: var(--nx-text);
    }
    .og-torneio-cat-progress .frac em {
      font-style: normal;
      color: var(--nx-text-dim);
    }
    .og-torneio-cat-progress .pct {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      font-weight: 700;
    }
    .og-torneio-cat-footer {
      margin-top: 14px;
      padding-top: 13px;
      border-top: 1px solid var(--nx-line);
      display: flex;
      align-items: center;
      gap: 16px;
      font-family: var(--nx-font-mono);
      font-size: 11.5px;
      font-weight: 700;
    }
    .og-torneio-cat-footer .paid {
      color: var(--nx-win);
    }
    .og-torneio-cat-footer .pend {
      color: var(--nx-pending);
    }
    .og-torneio-cat-footer .rev {
      color: var(--nx-text-mute);
    }
    .og-torneio-cat-hint {
      padding: 11px 16px;
      display: flex;
      align-items: center;
      gap: 11px;
      background: var(--nx-orange-tint);
      border-top: 1px solid rgba(255, 106, 26, 0.2);
    }
    .og-torneio-cat-hint span {
      flex: 1;
      font-family: var(--nx-font-ui);
      font-size: 11.5px;
      color: var(--nx-text-mute);
      line-height: 1.35;
    }
  `,
})
export class TorneioDetalheComponent {
  readonly id = input<string>('');

  protected readonly tabs = ['categorias', 'visão geral', 'financeiro'];
  protected readonly tab = signal('categorias');
  protected readonly categorias = OGD_CATEGORIAS;

  protected pct(c: (typeof OGD_CATEGORIAS)[number]): number {
    return Math.round((c.taken / c.total) * 100);
  }
}
