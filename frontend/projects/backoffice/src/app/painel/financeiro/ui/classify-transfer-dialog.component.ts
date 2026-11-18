import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { ConfirmDialogComponent } from '../../ui/confirm-dialog.component';
import { FieldComponent } from '../../ui/field.component';
import { money, type PayoutTarget, type StatementEntry, type TransferKind } from '../data/company-finance';

export interface ClassifyChoice {
  kind: TransferKind;
  tournamentId: string | null;
  alreadySettled: boolean;
  note: string;
}

const NOTE_MAX = 200;

interface KindOption {
  kind: TransferKind;
  label: string;
  hint: string;
}

const OPTIONS: readonly KindOption[] = [
  { kind: 'withdrawal', label: 'Retirada da Nexa', hint: 'Dinheiro da Nexa que foi para a sua conta. Fica fora do resultado, em “Retiradas da Nexa”.' },
  { kind: 'expense', label: 'Despesa', hint: 'Pagamento de fornecedor ou serviço. Entra em Custos no mês da transferência.' },
  { kind: 'organizerPayout', label: 'Repasse a organizador', hint: 'Pagamento feito por fora ao organizador. Baixa o caixa do torneio e registra o saque.' },
];

/** Classifica uma transferência feita à mão no Asaas: retirada, despesa ou repasse a organizador. */
@Component({
  selector: 'bo-classify-transfer-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ConfirmDialogComponent, FieldComponent],
  template: `
    <bo-confirm-dialog [open]="open()" title="Classificar transferência" size="md" [busy]="busy()" [error]="error()"
      confirmLabel="Salvar" [confirmDisabled]="!valid()" [description]="summary()"
      (confirmed)="submit()" (dismissed)="dismissed.emit()">
      <div class="options" role="radiogroup" aria-label="Tipo da transferência">
        @for (o of options; track o.kind) {
          <label class="option" [class.active]="kind() === o.kind" [class.off]="locked(o.kind)">
            <input type="radio" name="ct-kind" [checked]="kind() === o.kind" [disabled]="locked(o.kind)" (change)="kind.set(o.kind)" />
            <span class="text">
              <span class="label">{{ o.label }}</span>
              <span class="hint">{{ locked(o.kind) ? 'Já classificada: repasse só na primeira classificação.' : o.hint }}</span>
            </span>
          </label>
        }
      </div>

      @if (kind() === 'organizerPayout') {
        <bo-field label="Torneio que recebeu" [hint]="payoutHint()">
          <select class="bo-select" (change)="tournamentId.set(selectValue($event))">
            <option value="" [selected]="!tournamentId()">Escolha o caixa do torneio</option>
            @for (t of targets(); track t.tournamentId) {
              <option [value]="t.tournamentId" [selected]="t.tournamentId === tournamentId()" [disabled]="!alreadySettled() && t.availableCents < amount()">
                {{ targetLabel(t) }}
              </option>
            }
          </select>
        </bo-field>
        <label class="check">
          <input type="checkbox" [checked]="alreadySettled()" (change)="alreadySettled.set(checked($event))" />
          <span>O caixa já foi baixado antes (saque registrado à mão). Só registrar o motivo, sem descontar de novo.</span>
        </label>
      }

      <bo-field label="Observação (opcional)" [hint]="note().length + '/' + noteMax">
        <input class="bo-input" type="text" [maxLength]="noteMax" [value]="note()" (input)="note.set(inputValue($event))"
          placeholder="Ex.: pró-labore, conta de luz, repasse da 2ª etapa" />
      </bo-field>
    </bo-confirm-dialog>
  `,
  styles: `
    .options { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
    .option { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border: 1px solid var(--nx-line); border-radius: var(--nx-r-3); cursor: pointer; }
    .option.active { border-color: rgba(255, 106, 26, 0.5); background: rgba(255, 106, 26, 0.06); }
    .option.off { opacity: 0.55; cursor: not-allowed; }
    .option input { margin-top: 3px; }
    .text { display: flex; flex-direction: column; gap: 2px; }
    .label { font-size: 13px; font-weight: 600; }
    .hint { font-size: 12px; color: var(--nx-text-dim); line-height: 1.4; }
    bo-field { display: block; margin-bottom: 12px; }
    .check { display: flex; gap: 8px; align-items: flex-start; margin: -2px 0 14px; font-size: 12.5px; color: var(--nx-text-mute); line-height: 1.4; cursor: pointer; }
    .check input { margin-top: 2px; }
  `,
})
export class ClassifyTransferDialogComponent {
  readonly open = input(false);
  readonly entry = input<StatementEntry | null>(null);
  readonly targets = input<readonly PayoutTarget[]>([]);
  readonly busy = input(false);
  readonly error = input<string | null>(null);
  readonly submitted = output<ClassifyChoice>();
  readonly dismissed = output<void>();

  protected readonly options = OPTIONS;
  protected readonly noteMax = NOTE_MAX;
  protected readonly kind = signal<TransferKind | null>(null);
  protected readonly tournamentId = signal('');
  protected readonly alreadySettled = signal(false);
  protected readonly note = signal('');

  /** Valor que saiu, em centavos (positivo). */
  protected readonly amount = computed(() => Math.abs(this.entry()?.valueCents ?? 0));
  private readonly current = computed(() => {
    const t = this.entry()?.transfer;
    return t?.state === 'classified' ? t : null;
  });

  protected readonly summary = computed(() => {
    const e = this.entry();
    if (!e) return '';
    const day = e.date.length >= 10 ? `${e.date.slice(8, 10)}/${e.date.slice(5, 7)}/${e.date.slice(0, 4)}` : e.date;
    return `${day} · ${money(this.amount())} · ${e.description || 'Transferência'}`;
  });

  protected readonly valid = computed(() => {
    const k = this.kind();
    if (!k || this.note().length > NOTE_MAX) return false;
    if (k !== 'organizerPayout') return k !== this.current()?.kind || this.note() !== this.current()?.note;
    const target = this.targets().find((t) => t.tournamentId === this.tournamentId());
    return !!target && (this.alreadySettled() || target.availableCents >= this.amount());
  });

  protected readonly payoutHint = computed(() => {
    const target = this.targets().find((t) => t.tournamentId === this.tournamentId());
    if (!target) return this.targets().length ? '' : 'Nenhum caixa de torneio no sistema.';
    if (this.alreadySettled()) return 'Registra o repasse neste torneio sem mexer no caixa.';
    return `Baixa ${money(this.amount())} do caixa (fica ${money(target.availableCents - this.amount())}) e registra o saque pago por fora. Não dá para desfazer por aqui.`;
  });

  constructor() {
    // Abrir de novo começa da classificação atual (ou limpo).
    effect(() => {
      if (!this.open()) return;
      const cur = this.current();
      this.kind.set(cur?.kind ?? null);
      this.tournamentId.set('');
      this.alreadySettled.set(false);
      this.note.set(cur?.note ?? '');
    });
  }

  /** Repasse baixa o caixa: só na primeira classificação, e um repasse não troca. */
  protected locked(kind: TransferKind): boolean {
    const cur = this.current();
    if (!cur) return false;
    return cur.kind === 'organizerPayout' || kind === 'organizerPayout';
  }

  protected targetLabel(t: PayoutTarget): string {
    const name = t.name ?? `Torneio sem nome (…${t.tournamentId.slice(-6)})`;
    const short = !this.alreadySettled() && t.availableCents < this.amount() ? ' · saldo insuficiente' : '';
    return `${name} — ${money(t.availableCents)} disponível${short}`;
  }

  protected submit(): void {
    const kind = this.kind();
    if (!kind || !this.valid()) return;
    this.submitted.emit({
      kind,
      tournamentId: kind === 'organizerPayout' ? this.tournamentId() : null,
      alreadySettled: kind === 'organizerPayout' && this.alreadySettled(),
      note: this.note().trim(),
    });
  }

  protected inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  protected selectValue(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }
}
