import { ChangeDetectionStrategy, Component, computed, inject, input, signal, type OnInit } from '@angular/core';
import { ModalComponent } from '../ui/modal.component';
import { PAYMENT_METHODS, money, type CrmCustomer, type CrmPaymentMethod } from './crm.model';
import { CrmUiService } from './crm-ui.service';
import { CrmStore } from './crm.store';

/** Baixa manual de parcelas do contrato (Pix, dinheiro, maquininha, transferência). */
@Component({
  selector: 'ar-crm-payment-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent],
  styleUrls: ['./crm.scss'],
  template: `
    <ar-modal (close)="ui.paymentFor.set(null)">
      <h2 class="m-t">Registrar pagamento</h2>
      <p class="card-desc">{{ customer().name }} · {{ customer().contract?.planName }}</p>
      @if (contract(); as v) {
        @if (v.overdueCount > 0) {
          <p class="late">{{ v.overdueCount }} {{ v.overdueCount === 1 ? 'parcela atrasada' : 'parcelas atrasadas' }} · {{ money(v.overdueReais) }}</p>
        }
        <span class="field-l" id="pc-l">Parcelas</span>
        <div class="seg" role="radiogroup" aria-labelledby="pc-l">
          @for (n of options(); track n) {
            <button type="button" role="radio" [class.on]="count() === n" [attr.aria-checked]="count() === n" (click)="setCount(n)">{{ n }}</button>
          }
        </div>
        <span class="field-l" id="pm-l">Forma</span>
        <div class="seg" role="radiogroup" aria-labelledby="pm-l">
          @for (m of methods; track m.id) {
            <button type="button" role="radio" [class.on]="method() === m.id" [attr.aria-checked]="method() === m.id" (click)="method.set(m.id)">{{ m.label }}</button>
          }
        </div>
        <div class="row2">
          <label class="field">
            <span class="field-l">Valor recebido</span>
            <span class="input pre"><span>R$</span><input inputmode="decimal" [value]="amountText()" (input)="amountText.set($any($event.target).value)" /></span>
          </label>
          <label class="field">
            <span class="field-l">Pago em</span>
            <input class="input" type="date" [max]="store.today()" [value]="paidOn()" (input)="paidOn.set($any($event.target).value)" />
          </label>
        </div>
        @if (error(); as err) { <p class="err" role="alert">{{ err }}</p> }
        <div class="acts">
          <button type="button" class="btn lg" (click)="ui.paymentFor.set(null)">Cancelar</button>
          <button type="button" class="btn primary lg" [disabled]="busy() || amount() <= 0" (click)="save()">Registrar {{ money(amount()) }}</button>
        </div>
      }
    </ar-modal>
  `,
  styles: `
    .m-t { font-family: var(--nx-font-display); font-weight: 700; font-size: 20px; margin: 0; color: var(--nx-text); }
    .late { margin: 12px 0 0; padding: 10px 12px; border-radius: 10px; background: rgba(255,59,48,.08); border: 1px solid rgba(255,59,48,.35); color: var(--nx-live); font-size: 12.5px; font-weight: 600; }
    .field-l { display: block; font-size: 12.5px; font-weight: 600; color: var(--nx-text); margin: 16px 0 8px; }
    .field .field-l { margin-top: 16px; }
    .seg { display: flex; padding: 3px; border-radius: 10px; background: var(--nx-surface-1); border: 1px solid var(--nx-line); }
    .seg button { flex: 1; padding: 9px 6px; border-radius: 8px; font: 600 12.5px var(--nx-font-ui); color: var(--nx-text-mute); background: none; border: none; cursor: pointer; }
    .seg button.on { background: var(--nx-orange-500); color: var(--nx-text-on-orange); }
    .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .input { display: flex; align-items: center; gap: 8px; height: 44px; box-sizing: border-box; width: 100%; padding: 0 12px; border-radius: 10px; background: var(--nx-surface-1); border: 1px solid var(--nx-line-strong); font: 14px var(--nx-font-ui); color: var(--nx-text); color-scheme: dark; }
    .pre span { font-family: var(--nx-font-mono); color: var(--nx-text-dim); }
    .pre input { flex: 1; min-width: 0; background: transparent; border: none; color: var(--nx-text); font: inherit; outline: none; }
    .err { color: var(--nx-live); font-size: 12.5px; margin: 12px 0 0; }
    .acts { display: flex; justify-content: flex-end; gap: 10px; margin-top: 22px; }
  `,
})
export class CrmPaymentModalComponent implements OnInit {
  readonly customer = input.required<CrmCustomer>();

  protected readonly store = inject(CrmStore);
  protected readonly ui = inject(CrmUiService);
  protected readonly methods = PAYMENT_METHODS;
  protected readonly money = money;

  protected readonly count = signal(1);
  protected readonly method = signal<CrmPaymentMethod>('pix');
  protected readonly amountText = signal('');
  protected readonly paidOn = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly contract = computed(() => (this.customer().contract?.source === 'contract' ? this.customer().contract : null));
  protected readonly options = computed(() => {
    const v = this.contract();
    const left = v?.totalInstallments != null ? v.totalInstallments - v.paidInstallments : 12;
    return [1, 2, 3, 6, 12].filter((n) => n <= Math.max(1, left));
  });
  protected readonly amount = computed(() => {
    const n = Number(this.amountText().replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
  });

  ngOnInit(): void {
    const v = this.contract();
    this.setCount(Math.max(1, Math.min(v?.overdueCount || 1, this.options().at(-1) ?? 1)));
    this.paidOn.set(this.store.today());
  }

  protected setCount(n: number): void {
    this.count.set(n);
    const price = this.contract()?.monthlyPriceReais ?? 0;
    this.amountText.set(String(Math.round(n * price * 100) / 100).replace('.', ','));
  }

  protected async save(): Promise<void> {
    const v = this.contract();
    if (!v || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.store.registerPayment(v.id, this.count(), this.method(), this.amount(), this.paidOn() || this.store.today());
      this.ui.paymentFor.set(null);
      this.ui.flash(`Pagamento de ${money(this.amount())} registrado.`);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível registrar o pagamento.');
    } finally {
      this.busy.set(false);
    }
  }
}
