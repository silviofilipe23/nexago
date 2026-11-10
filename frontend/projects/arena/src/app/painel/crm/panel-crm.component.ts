import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { ArenaContextService } from '../data/arena-context.service';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { CrmContractModalComponent } from './crm-contract-modal.component';
import { CrmConversionComponent } from './crm-conversion.component';
import { CrmCustomerDrawerComponent } from './crm-customer-drawer.component';
import { CrmCustomersComponent } from './crm-customers.component';
import { CrmChargeModalComponent } from './crm-charge-modal.component';
import { CrmPaymentModalComponent } from './crm-payment-modal.component';
import { CrmTodayComponent } from './crm-today.component';
import { CrmUiService } from './crm-ui.service';
import { cacheLabel } from './crm.model';
import { CrmStore } from './crm.store';

type CrmTab = 'hoje' | 'clientes' | 'conversao';

/** CRM da arena (`/painel/clientes`): Hoje (filas do time), Clientes (base) e Conversão. */
@Component({
  selector: 'ar-panel-crm',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CrmStore, CrmUiService],
  imports: [
    PanelShellComponent,
    PageHeaderComponent,
    IconComponent,
    CrmTodayComponent,
    CrmCustomersComponent,
    CrmConversionComponent,
    CrmCustomerDrawerComponent,
    CrmContractModalComponent,
    CrmPaymentModalComponent,
    CrmChargeModalComponent,
  ],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Clientes" [subtitle]="subtitle()">
        <button type="button" class="ar-mini-btn" [disabled]="store.loading() || store.refreshing()" (click)="refresh()"
          [attr.title]="'Relê as reservas (o CRM guarda por até 30 min)'">
          <ar-icon name="repeat" [size]="14" /> {{ store.refreshing() ? 'Atualizando…' : 'Atualizar' }}
        </button>
        @if (ui.canWrite()) {
          <button type="button" class="ar-mini-btn ar-mini-btn-primary" (click)="ui.newContract()">
            <ar-icon name="plus" [size]="14" /> Novo contrato
          </button>
        }
      </ar-page-header>
      <nav class="subnav" aria-label="Seções do CRM">
        @for (t of tabs(); track t.id) {
          <button type="button" class="subnav-item" [class.active]="tab() === t.id" [attr.aria-current]="tab() === t.id ? 'page' : null" (click)="go(t.id)">
            {{ t.label }}
            @if (t.count !== null) {
              <span class="count">{{ t.count }}</span>
            }
          </button>
        }
      </nav>
      <div class="body">
        @if (arenaContext.notFound()) {
          <p class="state">Nenhuma arena vinculada à sua conta ainda.</p>
        } @else if (store.loading()) {
          <div class="skeleton" aria-label="Carregando clientes">
            <i></i><i></i><i></i><i></i>
          </div>
        } @else if (store.loadError() && !store.overview()) {
          <div class="error">
            <p class="state">{{ store.loadError() }}</p>
            <button type="button" class="ar-mini-btn" (click)="store.reload()">Tentar de novo</button>
          </div>
        } @else {
          @switch (tab()) {
            @case ('clientes') { <ar-crm-customers /> }
            @case ('conversao') { <ar-crm-conversion /> }
            @default { <ar-crm-today /> }
          }
        }
      </div>
    </ar-panel-shell>

    @if (ui.drawerKey(); as key) {
      <ar-crm-customer-drawer [customerKey]="key" />
    }
    @if (ui.contractForm(); as form) {
      <ar-crm-contract-modal [state]="form" />
    }
    @if (ui.paymentFor(); as c) {
      <ar-crm-payment-modal [customer]="c" />
    }
    @if (ui.chargeFor(); as c) {
      <ar-crm-charge-modal [customer]="c" />
    }
    @if (ui.toast(); as msg) {
      <div class="toast" role="status">{{ msg }}</div>
    }
  `,
  styles: `
    .subnav {
      display: flex; gap: 22px; padding: 0 var(--ar-pad-page-x); border-bottom: 1px solid var(--nx-line);
      flex: none; overflow-x: auto; scrollbar-width: none;
    }
    .subnav-item {
      height: 44px; display: flex; align-items: center; gap: 7px; border: none; border-bottom: 2px solid transparent;
      margin-bottom: -1px; background: none; cursor: pointer; padding: 0;
      font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; color: var(--nx-text-dim); white-space: nowrap;
    }
    .subnav-item:hover { color: var(--nx-text-mute); }
    .subnav-item.active { color: var(--nx-text); border-bottom-color: var(--nx-orange-500); }
    .count { font-family: var(--nx-font-mono); font-size: 10px; font-weight: 700; color: var(--nx-text-dim); }
    .subnav-item.active .count { color: var(--nx-orange-500); }
    .body { padding: 24px var(--ar-pad-page-x) 40px; }
    .state { font-size: 13.5px; color: var(--nx-text-mute); margin: 0; }
    .error { display: flex; flex-direction: column; gap: 12px; align-items: flex-start; }
    .skeleton { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
    .skeleton i { height: 120px; border-radius: 16px; background: var(--nx-surface-0); border: 1px solid var(--nx-line); animation: pulse 1.4s ease-in-out infinite; }
    @keyframes pulse { 50% { opacity: 0.5; } }
    .toast {
      position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 1100;
      background: var(--nx-surface-2); border: 1px solid var(--nx-line-strong); color: var(--nx-text);
      padding: 12px 18px; border-radius: 12px; font-size: 13px; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
    }
  `,
})
export class PanelCrmComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly arenaContext = inject(ArenaContextService);
  protected readonly store = inject(CrmStore);
  protected readonly ui = inject(CrmUiService);

  protected readonly tab = toSignal(
    this.route.queryParamMap.pipe(map((q) => (['clientes', 'conversao'].includes(q.get('aba') ?? '') ? q.get('aba') : 'hoje') as CrmTab)),
    { initialValue: 'hoje' as CrmTab },
  );

  protected readonly tabs = computed(() => {
    const o = this.store.overview();
    return [
      { id: 'hoje' as const, label: 'Hoje', count: o ? this.store.queueTotal() : null },
      { id: 'clientes' as const, label: 'Clientes', count: o ? o.customers.length : null },
      { id: 'conversao' as const, label: 'Conversão', count: o ? o.queues.convert.length : null },
    ];
  });

  protected readonly subtitle = computed(() => {
    const o = this.store.overview();
    if (!o) return 'CRM';
    const date = new Date(`${o.today}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
    const fresh = cacheLabel(o.cache?.builtAt);
    return fresh ? `CRM · ${date} · ${fresh}` : `CRM · ${date}`;
  });

  protected async refresh(): Promise<void> {
    await this.store.reload(true);
    // O servidor só relê a cada 2 min: avisa em vez de parecer que o botão não fez nada.
    if (this.store.overview()?.cache?.fromCache) this.ui.flash('As reservas foram lidas há menos de 2 minutos.');
  }

  protected go(tab: CrmTab): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { aba: tab === 'hoje' ? null : tab }, queryParamsHandling: 'merge' });
  }
}
