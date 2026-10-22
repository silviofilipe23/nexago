import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { CenterContextService } from '../../core/center-context.service';
import { writeErrorMessage } from '../../data/actions/actor';
import { InvoicesActions } from '../../data/actions/invoices.actions';
import { CenterStore } from '../../data/center-store.service';
import { formatDayKey, formatInstant, todayKey } from '../../domain/dates';
import { invoiceDisplayStatus } from '../../domain/enrollment';
import { centsToInput, formatBRL, parseBRL } from '../../domain/money';
import { ENROLLMENT_STATUS, INVOICE_STATUS, PAYMENT_METHOD_LABELS, type Invoice, type PaymentMethod } from '../../domain/models';
import { IconComponent } from '../../ui/icon.component';

type Panel = 'confirm' | 'refund' | 'cancel' | 'note';

/**
 * W22 — Detalhe da cobrança: eventos, efeitos que dependem da confirmação e ações auditadas.
 * Sem integração com provedor ainda: "Consultar provedor" fica desabilitado.
 */
@Component({
  selector: 'ct-invoice-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  host: { '(document:keydown.escape)': 'closed.emit()' },
  templateUrl: './invoice-drawer.component.html',
  styles: `
    .backdrop { position: fixed; inset: 0; z-index: 40; background: rgba(0,0,0,0.5); }
    .drawer { position: fixed; z-index: 41; top: 0; right: 0; bottom: 0; width: min(480px, 100vw); background: var(--nx-surface-1); border-left: 1px solid var(--nx-line-strong); box-shadow: var(--nx-elev-3); display: flex; flex-direction: column; }
    .head { padding: 20px 22px 16px; border-bottom: 1px solid var(--nx-line); }
    .amount { margin-top: 8px; font-family: var(--nx-font-display); font-weight: 800; font-size: 20px; color: var(--nx-text); }
    .ref { margin-top: 4px; font-family: var(--nx-font-mono); font-size: 10.5px; color: var(--nx-text-dim); text-transform: uppercase; }
    .body { padding: 22px; display: flex; flex-direction: column; gap: 16px; flex: 1; overflow-y: auto; }
    .ev { display: grid; grid-template-columns: 78px 1fr; gap: 10px; padding: 9px 0; border-top: 1px solid var(--nx-line); }
    .ev:first-of-type { border-top: none; }
    .ev-t { font-family: var(--nx-font-mono); font-size: 10.5px; font-weight: 600; color: var(--nx-text-mute); }
    .ev-a { font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; color: var(--nx-text); }
    .ev-a.dup { color: var(--nx-text-dim); }
    .ev-d { margin-top: 2px; font-family: var(--nx-font-mono); font-size: 10px; color: var(--nx-text-dim); word-break: break-word; }
    .foot { padding: 14px 22px; border-top: 1px solid var(--nx-line); display: flex; flex-direction: column; gap: 10px; }
    .form { display: flex; flex-direction: column; gap: 10px; }
    @media (max-width: 600px) { .drawer { border-left: none; } }
  `,
})
export class InvoiceDrawerComponent {
  readonly invoice = input.required<Invoice>();
  readonly canWrite = input(false);
  readonly closed = output<void>();

  private readonly ctx = inject(CenterContextService);
  private readonly store = inject(CenterStore);
  private readonly actions = inject(InvoicesActions);

  protected readonly STATUS = INVOICE_STATUS;
  protected readonly ENR_STATUS = ENROLLMENT_STATUS;
  protected readonly methods = Object.entries(PAYMENT_METHOD_LABELS) as [PaymentMethod, string][];
  protected readonly formatBRL = formatBRL;
  protected readonly formatDayKey = formatDayKey;

  /** Id primitivo: o doc chega novo a cada snapshot, mas só a troca de cobrança importa. */
  private readonly invoiceId = computed(() => this.invoice().id);
  protected readonly tz = computed(() => this.ctx.center()?.timezone);
  protected readonly today = computed(() => todayKey(this.tz()));
  protected readonly status = computed(() => invoiceDisplayStatus(this.invoice(), this.today()));
  protected readonly isPending = computed(() => this.invoice().status === 'pending');
  protected readonly refundable = computed(() => {
    const i = this.invoice();
    return i.status === 'approved' ? i.amountCents - i.refundedCents : 0;
  });
  protected readonly enrollment = computed(() => {
    const id = this.invoice().enrollmentId;
    return id ? (this.store.enrollments().find((e) => e.id === id) ?? null) : null;
  });

  protected readonly events = computed(() =>
    this.invoice().events.map((e) => ({ ...e, when: formatInstant(e.at, this.tz()) })),
  );

  protected readonly enrollmentEffect = computed(() => {
    const inv = this.invoice();
    const e = this.enrollment();
    if (!inv.enrollmentId) {
      return 'Cobrança avulsa · sem matrícula';
    }
    if (!e) {
      return 'Matrícula não encontrada';
    }
    const label = ENROLLMENT_STATUS[e.status][0];
    return e.status === 'pending' && e.holdUntil ? `${label} · vaga reservada até ${formatInstant(e.holdUntil, this.tz())}` : label;
  });

  protected readonly creditsEffect = computed(() => {
    const e = this.enrollment();
    if (e?.contract?.planType !== 'class_pack') {
      return 'Não se aplica';
    }
    return this.invoice().status === 'approved' ? `${e.creditsLeft ?? 0} disponíveis` : 'Nenhum concedido';
  });

  protected readonly revenueEffect = computed(() => {
    const i = this.invoice();
    return i.status === 'approved' ? `Contabilizada · ${formatBRL(i.amountCents - i.refundedCents)}` : 'Não contabilizada';
  });

  protected readonly panel = signal<Panel | null>(null);
  protected readonly method = signal<PaymentMethod>('pix');
  protected readonly proof = signal('');
  protected readonly reason = signal('');
  protected readonly refundAmount = signal('');
  protected readonly note = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected readonly invalid = computed(() => {
    const p = this.panel();
    const reason = this.reason().trim();
    if (p === 'confirm') {
      return this.proof().trim().length < 2 ? 'Informe o comprovante.' : reason.length < 3 ? 'Informe o motivo.' : null;
    }
    if (p === 'refund') {
      const cents = parseBRL(this.refundAmount());
      if (cents == null || cents <= 0 || cents > this.refundable()) {
        return `Valor até ${formatBRL(this.refundable())}.`;
      }
      return reason.length < 3 ? 'Informe o motivo.' : null;
    }
    if (p === 'cancel') {
      return reason.length < 3 ? 'Informe o motivo.' : null;
    }
    if (p === 'note') {
      return this.note().trim().length < 2 ? 'Escreva a observação.' : null;
    }
    return 'Escolha uma ação.';
  });

  constructor() {
    // Trocar de cobrança fecha o formulário aberto.
    effect(() => {
      this.invoiceId();
      this.panel.set(null);
      this.error.set('');
    });
  }

  open(p: Panel): void {
    this.panel.set(p);
    this.proof.set('');
    this.reason.set('');
    this.note.set('');
    this.refundAmount.set(centsToInput(this.refundable()));
    this.error.set('');
  }

  val(ev: Event): string {
    return (ev.target as HTMLInputElement).value;
  }

  async submit(): Promise<void> {
    const p = this.panel();
    if (!p || this.invalid() || this.busy()) {
      return;
    }
    const inv = this.invoice();
    this.busy.set(true);
    this.error.set('');
    try {
      if (p === 'confirm') {
        await this.actions.confirmManual(inv, this.method(), this.proof(), this.reason().trim());
      } else if (p === 'refund') {
        await this.actions.refund(inv, parseBRL(this.refundAmount())!, this.reason().trim());
      } else if (p === 'cancel') {
        await this.actions.cancel(inv, this.reason().trim());
      } else {
        await this.actions.addNote(inv, this.note());
      }
      this.panel.set(null);
    } catch (err) {
      this.error.set(writeErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
