import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { ConfirmDialogComponent } from '../../ui/confirm-dialog.component';
import { FieldComponent } from '../../ui/field.component';
import type { RecordRevenueInput } from '../data/company-finance.repository';
import { money, reaisInputToCents, saoPauloDay, type RevenueArena } from '../data/company-finance';

const NOTE_MAX = 200;
/** Mesmo teto do servidor (R$ 20.000). */
const MAX_CENTS = 2_000_000;
const TIER_LABEL: Record<string, string> = { starter: 'Starter', pro: 'Pro', elite: 'Elite', parceiro: 'Parceiro' };

/** Lança a mensalidade de plano que a arena pagou fora do Asaas (PIX direto, transferência, dinheiro). */
@Component({
  selector: 'bo-record-revenue-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ConfirmDialogComponent, FieldComponent],
  template: `
    <bo-confirm-dialog [open]="open()" title="Registrar mensalidade paga fora do Asaas" size="md" [busy]="busy()" [error]="error()"
      confirmLabel="Registrar" [confirmDisabled]="!valid()"
      description="Só o que entrou por fora (PIX direto na chave, transferência, dinheiro). O que a arena paga pela assinatura no Asaas já entra sozinho em Planos das arenas, inclusive a cobrança marcada como recebida em dinheiro no Asaas: nesse caso não registre aqui."
      (confirmed)="submit()" (dismissed)="dismissed.emit()">
      <bo-field label="Arena que pagou" [hint]="arenas().length ? '' : 'Nenhuma arena cadastrada.'">
        <select class="bo-select" (change)="arenaId.set(selectValue($event))">
          <option value="" [selected]="!arenaId()">Escolha a arena</option>
          @for (a of arenas(); track a.arenaId) {
            <option [value]="a.arenaId" [selected]="a.arenaId === arenaId()">{{ arenaLabel(a) }}</option>
          }
        </select>
      </bo-field>
      <div class="pair">
        <bo-field label="Valor recebido" [hint]="amountHint()">
          <input class="bo-input" type="text" inputmode="decimal" placeholder="249,00" [value]="amount()" (input)="amount.set(inputValue($event))" />
        </bo-field>
        <bo-field label="Dia em que entrou">
          <input class="bo-input" type="date" [max]="today()" min="2025-01-01" [value]="receivedOn()" (input)="receivedOn.set(inputValue($event))" />
        </bo-field>
      </div>
      <bo-field label="Observação (opcional)" [hint]="note().length + '/' + noteMax">
        <input class="bo-input" type="text" [maxLength]="noteMax" [value]="note()" (input)="note.set(inputValue($event))"
          placeholder="Ex.: mensalidade de novembro, PIX direto na chave" />
      </bo-field>
    </bo-confirm-dialog>
  `,
  styles: `
    bo-field { display: block; margin-bottom: 12px; }
    .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media (max-width: 520px) { .pair { grid-template-columns: 1fr; } }
  `,
})
export class RecordRevenueDialogComponent {
  readonly open = input(false);
  readonly arenas = input<readonly RevenueArena[]>([]);
  readonly busy = input(false);
  readonly error = input<string | null>(null);
  readonly submitted = output<RecordRevenueInput>();
  readonly dismissed = output<void>();

  protected readonly noteMax = NOTE_MAX;
  protected readonly today = signal(saoPauloDay());
  protected readonly arenaId = signal('');
  protected readonly amount = signal('');
  protected readonly receivedOn = signal('');
  protected readonly note = signal('');

  private readonly cents = computed(() => reaisInputToCents(this.amount()));

  protected readonly amountHint = computed(() => {
    if (!this.amount().trim()) return '';
    const c = this.cents();
    if (c === null) return 'Valor inválido.';
    return c > MAX_CENTS ? 'Acima de R$ 20.000,00.' : money(c);
  });

  protected readonly valid = computed(() => {
    const c = this.cents();
    const day = this.receivedOn();
    return !!this.arenaId() &&
      c !== null && c <= MAX_CENTS &&
      /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= '2025-01-01' && day <= this.today() &&
      this.note().length <= NOTE_MAX;
  });

  constructor() {
    // Abrir de novo começa limpo, com hoje como data.
    effect(() => {
      if (!this.open()) return;
      const today = saoPauloDay();
      this.today.set(today);
      this.arenaId.set('');
      this.amount.set('');
      this.receivedOn.set(today);
      this.note.set('');
    });
  }

  protected arenaLabel(a: RevenueArena): string {
    const name = a.name ?? `Arena sem nome (…${a.arenaId.slice(-6)})`;
    const tier = a.planTier ? TIER_LABEL[a.planTier] ?? a.planTier : null;
    return tier ? `${name} · ${tier}` : name;
  }

  protected submit(): void {
    const cents = this.cents();
    if (!this.valid() || cents === null) return;
    this.submitted.emit({
      source: 'planosArena',
      arenaId: this.arenaId(),
      amountCents: cents,
      receivedOn: this.receivedOn(),
      note: this.note().trim(),
    });
  }

  protected inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected selectValue(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }
}
