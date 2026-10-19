import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import { ConfirmDialogComponent } from '../../../ui/confirm-dialog.component';
import { FieldComponent } from '../../../ui/field.component';
import { CANCEL_LABEL, CONTRACT_STATUS_VIEW, nextStep, type PlanContract } from '../data/plan-contracts';

const NOTE_MAX = 280;

/**
 * Confirmação de mudança de status (fila e detalhe): o próximo passo, com observação opcional
 * que vai para o histórico, ou o cancelamento, que exige o motivo.
 */
@Component({
  selector: 'bo-contract-status-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ConfirmDialogComponent, FieldComponent],
  template: `
    <bo-confirm-dialog
      [open]="contract() !== null"
      [title]="title()"
      [description]="description()"
      [confirmLabel]="confirmLabel()"
      [tone]="kind() === 'cancel' ? 'danger' : 'primary'"
      size="md"
      [busy]="busy()"
      [error]="error()"
      [confirmDisabled]="!noteOk()"
      (confirmed)="confirmed.emit(note().trim() || null)"
      (dismissed)="dismissed.emit()"
    >
      <bo-field [label]="kind() === 'cancel' ? 'Motivo do cancelamento' : 'Observação (opcional)'"
        [hint]="kind() === 'cancel' ? 'O organizador não vê o motivo; ele fica no histórico do contrato.' : 'Ex.: Pix recebido em 18/10, comprovante no e-mail.'">
        <textarea class="bo-input area" [attr.maxlength]="max" [value]="note()" (input)="note.set(val($event))"></textarea>
      </bo-field>
    </bo-confirm-dialog>
  `,
  styles: `
    .area { height: 84px; padding: 9px 12px; resize: vertical; }
  `,
})
export class ContractStatusDialogComponent {
  /** `null` = fechado. */
  readonly contract = input<PlanContract | null>(null);
  readonly kind = input<'next' | 'cancel'>('next');
  readonly today = input.required<string>();
  readonly busy = input(false);
  readonly error = input<string | null>(null);

  readonly confirmed = output<string | null>();
  readonly dismissed = output<void>();

  protected readonly max = NOTE_MAX;
  protected readonly note = signal('');

  private readonly step = computed(() => {
    const c = this.contract();
    return c ? nextStep(c, this.today()) : null;
  });

  protected readonly title = computed(() => {
    const c = this.contract();
    if (!c) return '';
    if (this.kind() === 'cancel') return `Cancelar o contrato de ${c.tournamentName}?`;
    return `${this.step()?.label ?? 'Avançar'} · ${c.tournamentName}`;
  });

  protected readonly description = computed(() => {
    const c = this.contract();
    if (!c) return '';
    if (this.kind() === 'cancel') {
      const paid = c.status === 'requested' ? 'Nada foi pago ainda.' : `Política do plano: ${CANCEL_LABEL[c.plan.cancelPolicy]}. O reembolso, se houver, é feito à mão.`;
      return `O contrato sai de "${CONTRACT_STATUS_VIEW[c.status].label}" e libera a data na agenda da equipe. ${paid}`;
    }
    return this.step()?.confirm ?? '';
  });

  protected readonly confirmLabel = computed(() =>
    this.kind() === 'cancel' ? 'Cancelar contrato' : this.step()?.label ?? 'Confirmar',
  );

  protected readonly noteOk = computed(() => {
    const n = this.note().trim();
    return n.length <= NOTE_MAX && (this.kind() !== 'cancel' || n.length >= 3);
  });

  constructor() {
    // Cada abertura começa sem a observação da anterior.
    effect(() => {
      this.contract();
      this.kind();
      untracked(() => this.note.set(''));
    });
  }

  protected val(e: Event): string {
    return (e.target as HTMLTextAreaElement).value;
  }
}
