import { ChangeDetectionStrategy, Component } from '@angular/core';
import { OgPageHeaderComponent } from '../ui/page-header.component';

/** Financeiro — stub mínimo; conteúdo real (saldo, extrato, saque) entra na Task 5. */
@Component({
  selector: 'og-panel-financeiro',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgPageHeaderComponent],
  template: `
    <og-page-header title="Financeiro" />
    <div class="og-content"></div>
  `,
})
export class PanelFinanceiroComponent {}
