import { ChangeDetectionStrategy, Component, computed, inject, input, signal, type OnInit } from '@angular/core';
import { formatCpfCnpjDisplay, isValidCpfCnpj } from '@nexago/br-documents';
import { ModalComponent } from '../ui/modal.component';
import { firstName, linkMessage, money, whatsappUrl, type CrmCustomer } from './crm.model';
import { CrmUiService } from './crm-ui.service';
import { CrmStore } from './crm.store';

/** "Cobrar online": link do Asaas (Pix ou cartão) para uma ou mais parcelas; pago, dá baixa sozinho. */
@Component({
  selector: 'ar-crm-charge-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent],
  styleUrls: ['./crm.scss'],
  template: `
    <ar-modal (close)="ui.chargeFor.set(null)">
      @if (result(); as r) {
        <div class="ok" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--nx-win)" stroke-width="2.2" stroke-linecap="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg></div>
        <h2 class="m-t">Link pronto</h2>
        <p class="card-desc">
          {{ r.installments }} {{ r.installments === 1 ? 'parcela' : 'parcelas' }} · {{ money(r.amountReais) }}.
          Quando {{ first() }} pagar, as parcelas dão baixa sozinhas e o valor entra no caixa da arena (menos a taxa).
        </p>
        <div class="link">{{ r.invoiceUrl }}</div>
        <div class="acts">
          <button type="button" class="btn wa lg grow" [disabled]="!customer().whatsapp" (click)="send(r)">Enviar no WhatsApp</button>
          <button type="button" class="btn lg" (click)="copy(r.invoiceUrl)">{{ copied() ? 'Copiado' : 'Copiar' }}</button>
        </div>
        <p class="sub">Os lembretes automáticos de cobrança passam a levar esse link.</p>
      } @else {
        <h2 class="m-t">Cobrar online</h2>
        <p class="card-desc">{{ customer().name }} · {{ customer().contract?.planName }}</p>
        @if (customer().contract; as v) {
          @if (v.overdueCount > 0) {
            <p class="late">{{ v.overdueCount }} {{ v.overdueCount === 1 ? 'parcela atrasada' : 'parcelas atrasadas' }} · {{ money(v.overdueReais) }}</p>
          }
          <span class="field-l" id="cl-l">Parcelas no link</span>
          <div class="seg" role="radiogroup" aria-labelledby="cl-l">
            @for (n of options(); track n) {
              <button type="button" role="radio" [class.on]="count() === n" [attr.aria-checked]="count() === n" (click)="count.set(n)">{{ n }}</button>
            }
          </div>
          <div class="box"><span class="sub">Valor do link</span><b>{{ money(amount()) }}</b></div>
          @if (needCpf()) {
            <label class="field-l" for="cpf">CPF de {{ first() }}</label>
            <input id="cpf" class="input" inputmode="numeric" placeholder="000.000.000-00" [value]="cpf()" (input)="cpf.set($any($event.target).value)" (blur)="formatCpf()" />
            <p class="sub">O Asaas pede o CPF de quem paga. Fica salvo no cadastro dele para as próximas cobranças.</p>
          }
          <div class="ways"><span>Pix<small>cai na hora</small></span><span>Cartão<small>na fatura do Asaas</small></span></div>
          @if (error(); as err) { <p class="err" role="alert">{{ err }}</p> }
          <div class="acts end">
            <button type="button" class="btn lg" (click)="ui.chargeFor.set(null)">Cancelar</button>
            <button type="button" class="btn primary lg" [disabled]="busy()" (click)="generate()">{{ busy() ? 'Gerando…' : 'Gerar link' }}</button>
          </div>
        }
      }
    </ar-modal>
  `,
  styles: `
    .m-t { font-family: var(--nx-font-display); font-weight: 700; font-size: 20px; margin: 0; color: var(--nx-text); }
    .ok { width: 48px; height: 48px; border-radius: 50%; background: rgba(43,209,126,.12); border: 1px solid rgba(43,209,126,.45); display: flex; align-items: center; justify-content: center; margin-bottom: 14px; }
    .late { margin: 12px 0 0; padding: 10px 12px; border-radius: 10px; background: rgba(255,59,48,.08); border: 1px solid rgba(255,59,48,.35); color: var(--nx-live); font-size: 12.5px; font-weight: 600; }
    .field-l { display: block; font-size: 12.5px; font-weight: 600; color: var(--nx-text); margin: 16px 0 8px; }
    .seg { display: flex; padding: 3px; border-radius: 10px; background: var(--nx-surface-1); border: 1px solid var(--nx-line); }
    .seg button { flex: 1; padding: 9px 6px; border-radius: 8px; font: 600 12.5px var(--nx-font-ui); color: var(--nx-text-mute); background: none; border: none; cursor: pointer; }
    .seg button.on { background: var(--nx-orange-500); color: var(--nx-text-on-orange); }
    .box { display: flex; justify-content: space-between; align-items: baseline; margin-top: 16px; padding: 14px 16px; border-radius: 12px; background: var(--nx-surface-1); border: 1px solid var(--nx-line); }
    .box b { font-family: var(--nx-font-display); font-size: 24px; color: var(--nx-text); }
    .input { width: 100%; box-sizing: border-box; height: 44px; padding: 0 12px; border-radius: 10px; background: var(--nx-surface-1); border: 1px solid var(--nx-line-strong); font: 14px var(--nx-font-mono); color: var(--nx-text); }
    .ways { display: flex; gap: 8px; margin-top: 14px; }
    .ways span { flex: 1; padding: 10px 12px; border-radius: 10px; background: var(--nx-surface-1); border: 1px solid var(--nx-line); font-size: 12.5px; font-weight: 600; color: var(--nx-text); }
    .ways small { display: block; font-weight: 500; color: var(--nx-text-dim); font-size: 11px; }
    .err { color: var(--nx-live); font-size: 12.5px; margin: 12px 0 0; }
    .acts { display: flex; gap: 10px; margin-top: 18px; }
    .acts.end { justify-content: flex-end; }
    .grow { flex: 1; }
    .link { margin-top: 16px; padding: 12px 14px; border-radius: 10px; background: var(--nx-surface-1); border: 1px dashed rgba(255,106,26,.5); font: 12px var(--nx-font-mono); color: var(--nx-orange-400); word-break: break-all; }
    .sub { margin-top: 10px; }
  `,
})
export class CrmChargeModalComponent implements OnInit {
  readonly customer = input.required<CrmCustomer>();

  protected readonly store = inject(CrmStore);
  protected readonly ui = inject(CrmUiService);
  protected readonly money = money;

  protected readonly count = signal(1);
  protected readonly cpf = signal('');
  protected readonly needCpf = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly copied = signal(false);
  protected readonly result = signal<{ invoiceUrl: string; amountReais: number; installments: number } | null>(null);

  protected readonly first = computed(() => firstName(this.customer().name));
  protected readonly options = computed(() => {
    const v = this.customer().contract;
    const left = v?.totalInstallments != null ? v.totalInstallments - v.paidInstallments : 12;
    return [1, 2, 3, 6, 12].filter((n) => n <= Math.max(1, left));
  });
  protected readonly amount = computed(() => Math.round(this.count() * (this.customer().contract?.monthlyPriceReais ?? 0) * 100) / 100);

  ngOnInit(): void {
    const v = this.customer().contract;
    const want = Math.max(1, v?.overdueCount || 1);
    this.count.set(this.options().filter((n) => n <= want).at(-1) ?? 1);
  }

  protected formatCpf(): void {
    if (isValidCpfCnpj(this.cpf())) this.cpf.set(formatCpfCnpjDisplay(this.cpf()));
  }

  protected async generate(): Promise<void> {
    const v = this.customer().contract;
    if (!v || this.busy()) return;
    const cpf = this.cpf().trim();
    if (this.needCpf() && !isValidCpfCnpj(cpf)) return this.error.set('CPF inválido.');
    this.busy.set(true);
    this.error.set(null);
    try {
      this.result.set(await this.store.createPaymentLink(v.id, this.count(), this.needCpf() ? cpf : null));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível gerar o link.';
      if (/CPF/.test(message) && !this.needCpf()) {
        this.needCpf.set(true);
        this.error.set(null);
      } else {
        this.error.set(message);
      }
    } finally {
      this.busy.set(false);
    }
  }

  protected send(r: { invoiceUrl: string; amountReais: number; installments: number }): void {
    const c = this.customer();
    void this.ui.whatsapp(c, linkMessage(c, this.store.arenaName(), r), c.contract?.status === 'overdue' ? 'overdue' : 'due');
  }

  protected async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.copied.set(true);
    } catch {
      this.ui.flash('Não foi possível copiar. Selecione o link e copie.');
    }
  }
}
