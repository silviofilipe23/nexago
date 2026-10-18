import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent } from '../../../ui/icon.component';
import { PanelCardComponent } from '../../../ui/panel-card.component';
import type { Benefit } from '../data/profile';

/** Benefícios do pacote congelado no contrato. A entrega (kit, inscrições usadas) ainda não é registrada. */
@Component({
  selector: 'bo-benefits-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelCardComponent, IconComponent],
  template: `
    <bo-panel-card title="Benefícios do pacote" [kicker]="kicker()">
      @for (b of benefits(); track b.label) {
        <div class="item">
          <bo-icon name="bag" [size]="16" />
          <span class="text">
            <strong>{{ b.label }}</strong>
            <span>{{ b.sub }}</span>
          </span>
        </div>
      }
    </bo-panel-card>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .item { display: flex; gap: 12px; padding: 9px 0; border-top: 1px solid var(--nx-line); }
    .item bo-icon { color: var(--nx-orange-500); flex: none; margin-top: 1px; }
    .text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
    .text strong { font-size: 13px; font-weight: 600; }
    .text span { font-size: 11.5px; color: var(--nx-text-dim); }
  `,
})
export class BenefitsCardComponent {
  readonly benefits = input.required<Benefit[]>();
  /** "Versão 2 das regras" ou "Pacote vigente", quando a versão do contrato não foi achada. */
  readonly kicker = input('');
}
