import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, signal } from '@angular/core';
import { PanelCardComponent } from '../../../ui/panel-card.component';
import {
  COMMISSION_PCT,
  brl,
  planCost,
  type PlanRules,
  type SponsorsConfig,
  type TournamentPlan,
} from '../data/tournament-plans';

/**
 * Resultado de um evento hipotético: plano + comissão das inscrições + parte da NexaGO nas
 * cotas − custo. Só simulação local; nada é gravado.
 */
@Component({
  selector: 'bo-event-simulator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelCardComponent],
  template: `
    <bo-panel-card kicker="Simulador" title="Resultado de um evento">
      <label class="slider">
        <span class="row"><span>Inscrições</span><b>{{ entries() }}</b></span>
        <input type="range" min="8" max="256" step="4" [value]="entries()" (input)="entries.set(num($event))" />
      </label>
      <label class="slider">
        <span class="row"><span>Valor da inscrição</span><b>{{ brl(fee() * 100) }}</b></span>
        <input type="range" min="40" max="300" step="10" [value]="fee()" (input)="fee.set(num($event))" />
      </label>
      @if (tiers().length > 0) {
        <div class="tiers" [style.grid-template-columns]="'repeat(' + tiers().length + ', minmax(0, 1fr))'">
          @for (t of tiers(); track t.id) {
            <div class="tier">
              <span class="tn" [style.color]="t.color">{{ t.name }}</span>
              <div class="ctl">
                <button type="button" [attr.aria-label]="'Menos uma cota ' + t.name" [disabled]="count(t.id) === 0" (click)="bump(t.id, -1, t.maxPerEvent)">−</button>
                <span>{{ count(t.id) }}</span>
                <button type="button" [attr.aria-label]="'Mais uma cota ' + t.name" [disabled]="count(t.id) >= t.maxPerEvent" (click)="bump(t.id, 1, t.maxPerEvent)">+</button>
              </div>
            </div>
          }
        </div>
      }
      <dl>
        <div><dt>Plano</dt><dd>{{ brl(plan().priceCents) }}</dd></div>
        <div><dt>Comissão {{ commission }}%</dt><dd>{{ brl(commissionCents()) }}</dd></div>
        <div><dt>Sponsors · {{ 100 - sponsors().organizerSharePct }}% NexaGO</dt><dd>{{ brl(sponsorCents()) }}</dd></div>
        <div><dt>Custo do evento</dt><dd class="neg">− {{ brl(cost()) }}</dd></div>
      </dl>
      <div class="total">
        <span>Margem do evento</span>
        <strong [class.neg]="margin() < 0" [class.pos]="margin() >= 0">{{ brl(margin()) }}</strong>
      </div>
      <div class="sub">{{ revenue() ? marginShare() + '% da receita · ' + brl(revenue()) : '' }}</div>
    </bo-panel-card>
  `,
  styles: `
    .slider { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
    .row { display: flex; justify-content: space-between; font-size: 12.5px; color: var(--nx-text-mute); }
    .row b { font-family: var(--nx-font-mono); color: var(--nx-text); }
    input[type='range'] { width: 100%; accent-color: var(--nx-orange-500); }
    .tiers { display: grid; gap: 8px; }
    .tier { padding: 10px 8px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 0; }
    .tn { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ctl { display: flex; align-items: center; gap: 8px; }
    .ctl span { min-width: 14px; text-align: center; font-family: var(--nx-font-mono); font-weight: 700; font-size: 13px; }
    .ctl button { width: 24px; height: 24px; border-radius: 7px; border: 1px solid var(--nx-line-strong); background: var(--nx-surface-2); color: var(--nx-text); cursor: pointer; }
    .ctl button:disabled { opacity: 0.4; cursor: default; }
    dl { margin: 16px 0 0; }
    dl div { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--nx-line); font-size: 12.5px; }
    dt { color: var(--nx-text-dim); }
    dd { margin: 0; font-family: var(--nx-font-mono); }
    .neg { color: var(--nx-live); }
    .pos { color: var(--nx-win); }
    .total { display: flex; justify-content: space-between; align-items: baseline; padding-top: 12px; font-family: var(--nx-font-display); font-weight: 700; font-size: 13px; }
    .total strong { font-weight: 800; font-size: 22px; }
    .sub { margin-top: 2px; text-align: right; font-family: var(--nx-font-mono); font-size: 10.5px; color: var(--nx-text-dim); }
  `,
})
export class EventSimulatorComponent {
  readonly plan = input.required<TournamentPlan>();
  readonly rules = input.required<PlanRules>();
  readonly sponsors = input.required<SponsorsConfig>();

  protected readonly commission = COMMISSION_PCT;
  protected readonly brl = brl;
  protected readonly entries = signal(64);
  /** Reais. */
  protected readonly fee = signal(120);

  /** Cotas à venda; sem transmissão no plano, não há onde exibir logo. */
  // `equal` por conteúdo: editar o plano não pode zerar as cotas escolhidas.
  protected readonly tiers = computed(() => (this.plan().live ? this.sponsors().tiers.filter((t) => t.onSale) : []), {
    equal: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  });
  private readonly counts = linkedSignal<Record<string, number>>(() =>
    Object.fromEntries(this.tiers().map((t, i) => [t.id, Math.min(t.maxPerEvent, Math.max(0, 3 - i))])),
  );

  protected readonly cost = computed(() => planCost(this.plan().courts, this.rules()));
  protected readonly commissionCents = computed(() =>
    Math.round((this.entries() * this.fee() * 100 * COMMISSION_PCT) / 100),
  );
  protected readonly sponsorCents = computed(() => {
    const gross = this.tiers().reduce((s, t) => s + t.priceCents * (this.counts()[t.id] ?? 0), 0);
    return Math.round((gross * (100 - this.sponsors().organizerSharePct)) / 100);
  });
  protected readonly revenue = computed(() => this.plan().priceCents + this.commissionCents() + this.sponsorCents());
  protected readonly margin = computed(() => this.revenue() - this.cost());
  protected readonly marginShare = computed(() => Math.round((this.margin() / this.revenue()) * 100));

  protected count(id: string): number {
    return this.counts()[id] ?? 0;
  }

  protected bump(id: string, delta: number, max: number): void {
    this.counts.update((c) => ({ ...c, [id]: Math.max(0, Math.min(max, (c[id] ?? 0) + delta)) }));
  }

  protected num(event: Event): number {
    return Number((event.target as HTMLInputElement).value);
  }
}
