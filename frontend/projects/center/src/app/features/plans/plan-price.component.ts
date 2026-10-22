import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { CenterContextService } from '../../core/center-context.service';
import { CatalogActions } from '../../data/actions/catalog.actions';
import { writeErrorMessage } from '../../data/actions/actor';
import { formatDayKey, isValidDayKey, todayKey } from '../../domain/dates';
import { priceOn } from '../../domain/enrollment';
import { centsToInput, formatBRL, parseBRL } from '../../domain/money';
import type { Plan } from '../../domain/models';
import { ModalComponent, ToggleComponent } from '../../ui/kit';
import { priceSuffix, type PlanContracts } from './plan-view';

/** W20 — Alterar preço: vale para contratações novas a partir da data; contratos mantêm o deles. */
@Component({
  selector: 'ct-plan-price',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, ToggleComponent],
  template: `
    <ct-modal [kicker]="plan().name" title="Alterar preço" [width]="540" (closed)="closed.emit()">
      <div class="ct-form-grid">
        <div class="ct-field">
          <label for="pp-cur">Preço atual ({{ suffix() }})</label>
          <input id="pp-cur" class="ct-input mono" [value]="current()" disabled />
        </div>
        <div class="ct-field">
          <label for="pp-new">Novo preço ({{ suffix() }})</label>
          <input id="pp-new" class="ct-input mono" inputmode="decimal" [value]="price()" (input)="price.set(val($event))" placeholder="350,00" />
        </div>
      </div>
      <div class="ct-field">
        <label for="pp-from">Vale para contratações a partir de</label>
        <input id="pp-from" class="ct-input mono" type="date" [min]="today()" [value]="from()" (input)="from.set(val($event))" />
      </div>
      <div class="ct-field">
        <label for="pp-why">Motivo</label>
        <input id="pp-why" class="ct-input" [value]="reason()" (input)="reason.set(val($event))" placeholder="Ex.: reajuste anual" />
      </div>
      @if (plan().scheduledPrice; as s) {
        <div class="ct-dim">Já existe {{ formatBRL(s.priceCents) }} agendado a partir de {{ formatDayKey(s.effectiveFrom, true) }} — salvar substitui o agendamento.</div>
      }
      <div class="ct-box">
        <div class="ct-disp" style="font-weight: 700">{{ keepText() }}</div>
        <div class="ct-muted" style="margin-top: 6px">
          Cada contrato guarda preço, regras de reposição e cancelamento do dia da compra. O novo preço vale só para matrículas feitas a partir da data escolhida.
        </div>
      </div>
      <div class="ct-row">
        <ct-toggle [on]="false" [disabled]="true" label="Propor reajuste aos contratos ativos" />
        <span class="ct-muted">Propor reajuste aos contratos ativos (aviso com 30 dias) <span class="ct-tag">Em breve</span></span>
      </div>
      @if (error()) {
        <div class="ct-error-text">{{ error() }}</div>
      }
      <div footer class="ct-row">
        <button type="button" class="ct-ghost-btn" [disabled]="busy()" (click)="closed.emit()">Cancelar</button>
        <button type="button" class="ct-mini-btn ct-mini-btn-primary" [disabled]="busy() || !!invalid()" [attr.title]="invalid()" (click)="save()">
          {{ busy() ? 'Salvando…' : 'Salvar novo preço' }}
        </button>
      </div>
    </ct-modal>
  `,
})
export class PlanPriceComponent implements OnInit {
  readonly plan = input.required<Plan>();
  readonly contracts = input<PlanContracts | null>(null);
  readonly seesContracts = input(true);
  readonly closed = output<void>();

  private readonly ctx = inject(CenterContextService);
  private readonly catalog = inject(CatalogActions);

  protected readonly formatBRL = formatBRL;
  protected readonly formatDayKey = formatDayKey;

  protected readonly today = computed(() => todayKey(this.ctx.center()?.timezone));
  protected readonly nowCents = computed(() => priceOn(this.plan(), this.today()));
  protected readonly current = computed(() => centsToInput(this.nowCents()));
  protected readonly suffix = computed(() => (priceSuffix(this.plan().type) === 'total' ? 'BRL total' : 'BRL/mês'));

  protected readonly price = signal('');
  protected readonly from = signal('');
  protected readonly reason = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected readonly keepText = computed(() => {
    const c = this.contracts();
    if (!this.seesContracts()) {
      return 'Os contratos ativos continuam com o preço contratado';
    }
    if (!c || c.count === 0) {
      return 'Nenhum contrato ativo neste plano';
    }
    const n = `${c.count} contrato${c.count === 1 ? '' : 's'} ativo${c.count === 1 ? '' : 's'}`;
    return c.prices.length === 1 ? `Os ${n} continuam a ${formatBRL(c.prices[0]!)}` : `Os ${n} continuam com o preço contratado de cada um`;
  });

  protected readonly invalid = computed(() => {
    const cents = parseBRL(this.price());
    if (cents == null || cents <= 0) {
      return 'Informe o novo preço.';
    }
    if (cents === this.nowCents() && this.from() <= this.today()) {
      return 'O preço é igual ao atual.';
    }
    if (!isValidDayKey(this.from()) || this.from() < this.today()) {
      return 'A data precisa ser hoje ou depois.';
    }
    if (this.reason().trim().length < 3) {
      return 'Informe o motivo.';
    }
    return null;
  });

  ngOnInit(): void {
    this.from.set(this.today());
  }

  val(ev: Event): string {
    return (ev.target as HTMLInputElement).value;
  }

  async save(): Promise<void> {
    if (this.invalid() || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      await this.catalog.changePrice(this.plan(), parseBRL(this.price())!, this.from(), this.today(), this.reason().trim());
      this.closed.emit();
    } catch (err) {
      this.error.set(writeErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
