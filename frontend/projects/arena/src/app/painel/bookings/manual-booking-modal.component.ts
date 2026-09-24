import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { arenaFunctions } from '../data/functions';
import { AthleteSearchFieldComponent } from '../recurring/athlete-search-field.component';
import type { AthleteCandidate } from '../recurring/athlete-search-filter';
import type { ArenaCourt } from '../courts/court.model';
import { ModalComponent } from '../ui/modal.component';
import { dateKeyOf } from './arena-booking.model';
import { quoteKeyOf, validateManualBookingForm, type ManualBookingFormState } from './manual-booking-form';
import { createManualBooking, quoteManualBooking } from './manual-booking-repository';

/** Reserva de balcão: o gestor vende o horário na recepção, para um atleta da base
 *  ou para um cliente sem conta (só o nome). O valor vem cotado pelo motor de preço
 *  e é editável — cortesia, permuta e desconto de caixa são decisão do gestor. */
@Component({
  selector: 'ar-manual-booking-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, AthleteSearchFieldComponent],
  template: `
    <ar-modal (close)="close.emit()">
      <h2 class="modal-title">Nova reserva</h2>
      <p class="modal-subtitle">Reserva criada pela arena, para pagamento no local.</p>

      @if (error(); as err) {
        <div class="error-banner">{{ err }}</div>
      }

      <div class="field-label">Quadra</div>
      <select class="input-box" [value]="courtIdValue()" (change)="courtIdValue.set($any($event.target).value)">
        <option value="">Selecione a quadra</option>
        @for (c of courts(); track c.id) {
          <option [value]="c.id">{{ c.name }}</option>
        }
      </select>

      <div class="field-label">Data</div>
      <input type="date" class="input-box" [value]="dateValue()" (input)="dateValue.set($any($event.target).value)" />

      <div class="row">
        <div class="col">
          <div class="field-label">Início</div>
          <input type="time" class="input-box" [value]="startValue()" (input)="startValue.set($any($event.target).value)" />
        </div>
        <div class="col">
          <div class="field-label">Fim</div>
          <input type="time" class="input-box" [value]="endValue()" (input)="endValue.set($any($event.target).value)" />
        </div>
      </div>

      @if (athleteId()) {
        <div class="field-label">Atleta</div>
        <div class="selected-athlete">
          <span class="selected-name">{{ customerName() }}</span>
          <button type="button" class="ar-ghost-btn clear-btn" (click)="clearAthlete()">Trocar</button>
        </div>
      } @else {
        <ar-athlete-search-field [arenaId]="arenaId()" (selected)="onAthleteSelected($event)" />
        <div class="field-label">Ou nome do cliente</div>
        <input
          type="text"
          class="input-box"
          placeholder="Ex.: João Silva"
          [value]="customerName()"
          (input)="customerName.set($any($event.target).value)"
        />
      }

      <div class="field-label">Valor (R$)</div>
      <input
        type="text"
        inputmode="decimal"
        class="input-box"
        [placeholder]="quoting() ? 'Calculando…' : '0,00'"
        [value]="amountText()"
        (input)="onAmountInput($any($event.target).value)"
      />

      <div class="field-label">Observação (opcional)</div>
      <input
        type="text"
        class="input-box"
        placeholder="Ex.: pagou em dinheiro na recepção"
        [value]="note()"
        (input)="note.set($any($event.target).value)"
      />

      <div class="actions">
        <button type="button" class="ar-ghost-btn" [disabled]="saving()" (click)="close.emit()">Cancelar</button>
        <button type="button" class="ar-mini-btn ar-mini-btn-primary confirm-btn" [disabled]="saving()" (click)="submit()">
          {{ saving() ? 'Criando…' : 'Criar reserva' }}
        </button>
      </div>
    </ar-modal>
  `,
  styles: `
    .modal-title {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 19px;
      color: var(--nx-text);
      margin: 0 0 10px;
    }

    .modal-subtitle {
      font-size: 13px;
      color: var(--nx-text-dim);
      margin: 4px 0 20px;
    }

    .error-banner {
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-live);
      background: rgba(255, 59, 48, 0.08);
      color: var(--nx-live);
      padding: 10px 14px;
      font-size: 12.5px;
      margin-bottom: 16px;
    }

    .field-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 10px;
    }

    .input-box {
      width: 100%;
      height: 46px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 14px;
      padding: 0 14px;
      box-sizing: border-box;
      margin-bottom: 18px;
    }

    .input-box:focus {
      outline: none;
      border-color: var(--nx-orange-500);
    }

    .row {
      display: flex;
      gap: 12px;
    }

    .col {
      flex: 1;
      min-width: 0;
    }

    .selected-athlete {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 18px;
    }

    .selected-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 14px;
      color: var(--nx-text);
    }

    .clear-btn {
      height: 30px;
      padding: 0 12px;
      flex: none;
    }

    .actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 16px;
    }

    .confirm-btn {
      height: 44px;
      padding: 0 20px;
    }
  `,
})
export class ManualBookingModalComponent {
  readonly arenaId = input.required<string>();
  readonly courts = input.required<ArenaCourt[]>();
  readonly dateKey = input.required<string>();
  readonly courtId = input<string | null>(null);
  readonly startTime = input<string | null>(null);
  readonly endTime = input<string | null>(null);

  readonly close = output<void>();
  readonly created = output<string>();

  protected readonly courtIdValue = signal('');
  protected readonly dateValue = signal('');
  protected readonly startValue = signal('');
  protected readonly endValue = signal('');
  protected readonly athleteId = signal<string | null>(null);
  protected readonly customerName = signal('');
  protected readonly amountText = signal('');
  protected readonly note = signal('');

  protected readonly quoting = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Primeira digitação do gestor no valor trava a sobrescrita pela cotação —
   *  cortesia e desconto de caixa não podem ser desfeitos por uma cotação que
   *  chega depois. */
  private amountTouched = false;
  private lastQuoteKey: string | null = null;

  private readonly formState = computed<ManualBookingFormState>(() => ({
    courtId: this.courtIdValue(),
    dateKey: this.dateValue(),
    startTime: this.startValue(),
    endTime: this.endValue(),
    athleteId: this.athleteId(),
    customerName: this.customerName(),
    amountText: this.amountText(),
    note: this.note(),
  }));

  constructor() {
    // Pré-preenchimento vindo da grade (ou só a data, quando abre pelo header).
    effect(() => {
      this.courtIdValue.set(this.courtId() ?? '');
      this.dateValue.set(this.dateKey());
      this.startValue.set(this.startTime() ?? '');
      this.endValue.set(this.endTime() ?? '');
    });

    effect(() => {
      const key = quoteKeyOf(this.formState());
      if (!key || key === this.lastQuoteKey || this.amountTouched) return;
      this.lastQuoteKey = key;
      void this.runQuote();
    });
  }

  private async runQuote(): Promise<void> {
    const state = this.formState();
    this.quoting.set(true);
    try {
      const quote = await quoteManualBooking(arenaFunctions(), {
        arenaId: this.arenaId(),
        courtId: state.courtId,
        date: state.dateKey,
        startTime: state.startTime,
        endTime: state.endTime,
      });
      // Corrida: se o gestor digitou enquanto a cotação vinha, o que ele digitou manda.
      if (!this.amountTouched) {
        this.amountText.set(quote.amountReais.toFixed(2).replace('.', ','));
      }
    } catch {
      // Cotação é sugestão: falhar não trava a criação, o gestor digita o valor.
    } finally {
      this.quoting.set(false);
    }
  }

  protected onAmountInput(value: string): void {
    this.amountTouched = true;
    this.amountText.set(value);
  }

  protected onAthleteSelected(candidate: AthleteCandidate): void {
    this.athleteId.set(candidate.athleteId);
    this.customerName.set(candidate.name);
  }

  protected clearAthlete(): void {
    this.athleteId.set(null);
    this.customerName.set('');
  }

  protected async submit(): Promise<void> {
    const result = validateManualBookingForm(this.formState(), this.arenaId(), dateKeyOf(new Date()));
    if (!result.ok) {
      this.error.set(result.error);
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    try {
      const { bookingId } = await createManualBooking(arenaFunctions(), result.payload);
      this.created.emit(bookingId);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível criar a reserva.');
    } finally {
      this.saving.set(false);
    }
  }
}
