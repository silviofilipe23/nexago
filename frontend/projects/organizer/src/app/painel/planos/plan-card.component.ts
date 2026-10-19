import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { brl, extraHourLabel, planRefs, type CatalogPlan } from '../data/plan-contracts';
import { OgIconComponent } from '../ui/icon.component';

/** Card de um plano NexaGO (protótipo 26a/04b). `selected === null` = vitrine, sem escolha;
 *  `true/false` = opção de um grupo de rádio (o pai cuida do clique e do teclado).
 *
 *  "Tudo do Plano N, mais:" só quando o plano de fato herda o anterior (mesma transmissão,
 *  narração e cobertura) — com plano montado à mão no backoffice a frase poderia mentir. */
@Component({
  selector: 'og-plan-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgIconComponent],
  host: {
    class: 'og-plan-card',
    '[class.selectable]': 'selected() !== null',
    '[class.selected]': 'selected() === true',
  },
  template: `
    @let p = plan();
    @if (badge()) {
      <span class="badge">{{ badge() }}</span>
    }
    <div class="head">
      <span class="name">{{ p.name }}</span>
      @if (selected() !== null) {
        <span class="dot" aria-hidden="true">
          @if (selected()) {
            <span></span>
          }
        </span>
      }
    </div>
    <div class="price">
      <span class="value">{{ price() }}</span>
      <span class="per">por evento</span>
    </div>
    <ul class="specs">
      @if (inherits()) {
        <li class="inherit">Tudo do {{ prev()!.name }}, mais:</li>
      }
      <li><og-icon name="court" [size]="15" />{{ p.courts }} {{ p.courts > 1 ? 'quadras' : 'quadra' }}</li>
      <li><og-icon name="whistle" [size]="15" />{{ refs() }} árbitros</li>
      @if (!inherits()) {
        @if (p.live) {
          <li><og-icon name="video" [size]="15" />Transmissão ao vivo</li>
        }
        @if (p.narrator) {
          <li><og-icon name="mic" [size]="15" />Narrador</li>
        }
        <li><og-icon name="clock" [size]="15" />Até {{ p.hours }}h de cobertura</li>
      }
      <!-- Fora do "Tudo do Plano N": é preço de cada plano, não escopo herdado. -->
      <li [class.off]="p.extraHourCents === 0"><og-icon name="cash" [size]="15" />{{ extraHour() }}</li>
    </ul>
  `,
  styles: `
    :host {
      position: relative;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding: 16px;
      border-radius: var(--nx-r-4);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      transition: border-color 140ms var(--nx-ease-out), background 140ms var(--nx-ease-out);
    }
    :host(.selectable) {
      cursor: pointer;
    }
    :host(.selectable:hover) {
      border-color: var(--nx-line-strong);
    }
    :host(.selectable:focus-visible) {
      outline: 2px solid var(--nx-orange-500);
      outline-offset: 2px;
    }
    :host(.selected),
    :host(.selected:hover) {
      background: var(--nx-orange-tint);
      border-color: var(--nx-orange-500);
    }
    .badge {
      position: absolute;
      top: -10px;
      left: 16px;
      padding: 3px 9px;
      border-radius: 99px;
      background: var(--nx-orange-500);
      color: var(--nx-text-on-orange);
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .head {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .name {
      flex: 1;
      min-width: 0;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 15px;
      color: var(--nx-text);
    }
    :host(.selected) .name {
      color: var(--nx-orange-500);
    }
    .dot {
      flex: none;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      border: 2px solid var(--nx-line-strong);
      display: grid;
      place-items: center;
    }
    :host(.selected) .dot {
      border-color: var(--nx-orange-500);
    }
    .dot span {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: var(--nx-orange-500);
    }
    .value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 24px;
      letter-spacing: -0.03em;
      color: var(--nx-text);
    }
    .per {
      margin-left: 6px;
      font-family: var(--nx-font-ui);
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .specs {
      margin: 0;
      padding: 0;
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .specs li {
      display: flex;
      align-items: center;
      gap: 9px;
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text);
    }
    .specs og-icon {
      flex: none;
      display: inline-flex;
      color: var(--nx-orange-500);
    }
    .specs li.off,
    .specs li.off og-icon {
      color: var(--nx-text-dim);
    }
    .specs li.inherit {
      font-size: 11.5px;
      color: var(--nx-text-dim);
    }
  `,
})
export class OgPlanCardComponent {
  readonly plan = input.required<CatalogPlan>();
  /** O plano anterior da tabela, pra frase "Tudo do Plano N, mais:". */
  readonly prev = input<CatalogPlan | null>(null);
  readonly selected = input<boolean | null>(null);
  readonly badge = input<string | null>(null);

  protected readonly price = computed(() => brl(this.plan().priceCents));
  protected readonly refs = computed(() => planRefs(this.plan()));
  protected readonly extraHour = computed(() => extraHourLabel(this.plan().extraHourCents));
  protected readonly inherits = computed(() => {
    const prev = this.prev();
    const p = this.plan();
    return prev != null && prev.live === p.live && prev.narrator === p.narrator && prev.hours === p.hours;
  });
}
