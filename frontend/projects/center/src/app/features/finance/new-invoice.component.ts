import { ChangeDetectionStrategy, Component, computed, inject, OnInit, output, signal } from '@angular/core';
import { CenterContextService } from '../../core/center-context.service';
import { writeErrorMessage } from '../../data/actions/actor';
import { InvoicesActions } from '../../data/actions/invoices.actions';
import { CenterStore } from '../../data/center-store.service';
import { isValidDayKey, todayKey } from '../../domain/dates';
import { parseBRL } from '../../domain/money';
import { SegmentedComponent, ModalComponent } from '../../ui/kit';
import { payerNameFor } from '../enrollments/enrollment-view';

/** Cobrança avulsa: de um aluno (pagador = responsável se menor) ou de um pagador livre. */
@Component({
  selector: 'ct-new-invoice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, SegmentedComponent],
  template: `
    <ct-modal kicker="Financeiro" title="Cobrança avulsa" [width]="540" (closed)="closed.emit()">
      <ct-segmented [options]="modes" [(value)]="mode" />
      @if (mode() === 'student') {
        <div class="ct-field">
          <label for="ni-st">Aluno</label>
          <select id="ni-st" class="ct-input" (change)="studentId.set(val($event))">
            <option value="">Escolha o aluno</option>
            @for (s of store.students(); track s.id) {
              <option [value]="s.id" [selected]="s.id === studentId()">{{ s.name }}</option>
            }
          </select>
          @if (payer() && student()?.isMinor) {
            <span class="ct-dim">Pagador: {{ payer() }} (responsável)</span>
          }
        </div>
      } @else {
        <div class="ct-field">
          <label for="ni-payer">Pagador</label>
          <input id="ni-payer" class="ct-input" [value]="freePayer()" (input)="freePayer.set(val($event))" placeholder="Nome de quem paga" />
        </div>
      }
      <div class="ct-field">
        <label for="ni-ref">Referência</label>
        <input id="ni-ref" class="ct-input" [value]="reference()" (input)="reference.set(val($event))" placeholder="Ex.: Uniforme · camiseta" />
      </div>
      <div class="ct-form-grid">
        <div class="ct-field">
          <label for="ni-val">Valor (R$)</label>
          <input id="ni-val" class="ct-input mono" inputmode="decimal" [value]="amount()" (input)="amount.set(val($event))" placeholder="120,00" />
        </div>
        <div class="ct-field">
          <label for="ni-due">Vencimento</label>
          <input id="ni-due" class="ct-input mono" type="date" [value]="dueDate()" (input)="dueDate.set(val($event))" />
        </div>
      </div>
      <div class="ct-dim">A cobrança nasce pendente. Só conta como recebida depois de confirmada.</div>
      @if (error()) {
        <div class="ct-error-text">{{ error() }}</div>
      }
      <div footer class="ct-row">
        <button type="button" class="ct-ghost-btn" [disabled]="busy()" (click)="closed.emit()">Cancelar</button>
        <button type="button" class="ct-mini-btn ct-mini-btn-primary" [disabled]="busy() || !!invalid()" [attr.title]="invalid()" (click)="save()">
          {{ busy() ? 'Criando…' : 'Criar cobrança' }}
        </button>
      </div>
    </ct-modal>
  `,
})
export class NewInvoiceComponent implements OnInit {
  readonly closed = output<void>();

  private readonly ctx = inject(CenterContextService);
  protected readonly store = inject(CenterStore);
  private readonly actions = inject(InvoicesActions);

  protected readonly modes = [
    { value: 'student', label: 'Aluno' },
    { value: 'free', label: 'Pagador livre' },
  ];
  protected readonly mode = signal('student');
  protected readonly studentId = signal('');
  protected readonly freePayer = signal('');
  protected readonly reference = signal('');
  protected readonly amount = signal('');
  protected readonly dueDate = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected readonly student = computed(() => (this.studentId() ? (this.store.studentById(this.studentId()) ?? null) : null));
  protected readonly payer = computed(() => {
    if (this.mode() === 'free') {
      return this.freePayer().trim();
    }
    const s = this.student();
    return s ? payerNameFor(s) : '';
  });

  protected readonly invalid = computed(() => {
    if (this.payer().length < 2) {
      return this.mode() === 'free' ? 'Informe o pagador.' : 'Escolha o aluno.';
    }
    if (this.reference().trim().length < 2) {
      return 'Informe a referência.';
    }
    const cents = parseBRL(this.amount());
    if (cents == null || cents <= 0) {
      return 'Informe um valor válido.';
    }
    if (!isValidDayKey(this.dueDate())) {
      return 'Informe o vencimento.';
    }
    return null;
  });

  ngOnInit(): void {
    this.dueDate.set(todayKey(this.ctx.center()?.timezone));
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
      await this.actions.create({
        studentId: this.mode() === 'student' ? this.studentId() : null,
        payerName: this.payer(),
        reference: this.reference(),
        amountCents: parseBRL(this.amount())!,
        dueDate: this.dueDate(),
      });
      this.closed.emit();
    } catch (err) {
      this.error.set(writeErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
