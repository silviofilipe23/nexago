import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OGD_DUPLAS, initialsOf } from '../data/mock-data';
import { OgAvatarComponent } from '../ui/avatar.component';
import { OgChartTabsComponent } from '../ui/chart-tabs.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgPillComponent } from '../ui/pill.component';

/** Detalhe da categoria — roster de duplas, status de pagamento e atalho para sortear a chave. */
@Component({
  selector: 'og-categoria-detalhe',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, OgPageHeaderComponent, OgChartTabsComponent, OgIconComponent, OgPillComponent, OgAvatarComponent],
  template: `
    <og-page-header title="Masculino Open" subtitle="Open Goiânia Beach · categoria · pronta pra sortear a chave">
      <button type="button" class="og-ghost-btn"><og-icon name="edit" [size]="13" />Editar</button>
      <a class="og-mini-btn og-mini-btn-primary" [routerLink]="['/painel/eventos', id(), 'categorias', catId(), 'seeds']">
        <og-icon name="bracket" [size]="14" />Sortear chave
      </a>
    </og-page-header>

    <div class="og-content">
      <div class="og-kpi-row">
        <div class="og-card og-card-pad-sm" style="flex:1">
          <div class="og-kpi-label">Duplas</div>
          <div class="og-kpi-value sm">16/16</div>
        </div>
        <div class="og-card og-card-pad-sm" style="flex:1">
          <div class="og-kpi-label">Pagas</div>
          <div class="og-kpi-value sm" style="color:var(--nx-win)">14</div>
        </div>
        <div class="og-card og-card-pad-sm" style="flex:1">
          <div class="og-kpi-label">Formato</div>
          <div class="og-kpi-value sm" style="font-size:15px;margin-top:10px">Grupos + SE</div>
        </div>
        <div class="og-card og-card-pad-sm" style="flex:1">
          <div class="og-kpi-label">Premiação</div>
          <div class="og-kpi-value sm" style="color:var(--nx-win)">R$ 8.000</div>
        </div>
      </div>

      <og-chart-tabs [tabs]="tabs" [active]="tab()" (changed)="tab.set($event)" />

      <div class="og-card og-card-pad-0" style="flex:1;min-height:0">
        @if (tab() === 'Duplas') {
          <div class="og-table-body" style="padding:4px 20px">
            @for (d of duplas; track d.names; let last = $last) {
              <div class="og-row" [class.last]="last">
                <span class="og-categoria-seed" [class.top]="!!d.seed">{{ d.seed ?? pad(d.order!) }}</span>
                <og-avatar [initials]="initialsOf(d.names, ' / ')" [size]="34" />
                <span style="flex:1">
                  <div class="og-categoria-name">{{ d.names }}</div>
                  <div class="og-categoria-meta">{{ d.meta }}</div>
                </span>
                <og-pill [tone]="d.pay === 'pago' ? 'green' : d.pay === 'pendente' ? 'yellow' : 'dim'">
                  {{ d.pay === 'pago' ? 'Pago' : d.pay === 'pendente' ? 'Pendente' : 'Espera' }}
                </og-pill>
                <button type="button" class="og-ghost-btn">Detalhes</button>
              </div>
            }
          </div>
        } @else {
          <div style="padding:20px;color:var(--nx-text-dim);font-family:var(--nx-font-ui);font-size:13px">
            Sem dados nesta aba ainda — protótipo mockado.
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    .og-categoria-seed {
      width: 30px;
      height: 30px;
      border-radius: 9px;
      flex: none;
      display: grid;
      place-items: center;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .og-categoria-seed.top {
      background: var(--nx-orange-tint);
      border-color: rgba(255, 106, 26, 0.34);
      color: var(--nx-orange-500);
    }
    .og-categoria-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13.5px;
      color: var(--nx-text);
    }
    .og-categoria-meta {
      font-family: var(--nx-font-ui);
      font-size: 11.5px;
      color: var(--nx-text-dim);
      margin-top: 2px;
    }
  `,
})
export class CategoriaDetalheComponent {
  readonly id = input<string>('');
  readonly catId = input<string>('');

  protected readonly tabs = ['Duplas', 'Pagamentos', 'Chave', 'Jogos'];
  protected readonly tab = signal('Duplas');
  protected readonly duplas = OGD_DUPLAS;
  protected readonly initialsOf = initialsOf;

  protected pad(n: number): string {
    return String(n).padStart(2, '0');
  }
}
