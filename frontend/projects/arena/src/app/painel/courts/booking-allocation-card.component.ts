import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { arenaFunctions } from '../data/functions';
import { ModalComponent } from '../ui/modal.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import {
  bookingAllocationError,
  bookingAllocationFromArena,
  bookingAllocationPayload,
  countFutureUnassignedBookings,
  saveBookingAllocation,
  sportsOfCourts,
  type BookingAllocationForm,
  type BookingAllocationMode,
} from './booking-allocation';
import type { ArenaCourt } from './court.model';

function todayKey(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

/** Card "Como o atleta reserva" da tela Quadras: a arena escolhe se o atleta escolhe a quadra ou
 *  se a recepção define na chegada (reservas por capacidade). */
@Component({
  selector: 'ar-booking-allocation-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelCardComponent, ModalComponent],
  template: `
    <ar-panel-card title="Como o atleta reserva" pad="lg">
      <div class="modes" role="radiogroup" aria-label="Como o atleta reserva">
        <label class="mode" [class.selected]="form().mode === 'court'">
          <input type="radio" name="allocation-mode" [checked]="form().mode === 'court'" [disabled]="readOnly()" (change)="setMode('court')" />
          <span class="mode-text">
            <span class="mode-title">O atleta escolhe a quadra</span>
            <span class="mode-desc">Como sempre: a reserva já sai com a quadra.</span>
          </span>
        </label>
        <label class="mode" [class.selected]="form().mode === 'capacity'">
          <input type="radio" name="allocation-mode" [checked]="form().mode === 'capacity'" [disabled]="readOnly()" (change)="setMode('capacity')" />
          <span class="mode-text">
            <span class="mode-title">A arena define a quadra</span>
            <span class="mode-desc">O atleta reserva o horário e a recepção direciona na chegada.</span>
          </span>
        </label>
      </div>

      @if (form().mode === 'capacity') {
        <div class="section">
          <div class="field-label">Quadras da distribuição</div>
          <div class="courts">
            @for (court of courts(); track court.id) {
              <label class="check">
                <input type="checkbox" [checked]="form().courtIds.includes(court.id)" [disabled]="readOnly()" (change)="toggleCourt(court.id)" />
                <span>{{ court.name }}@if (court.status === 'maintenance') { <span class="muted"> · em manutenção</span>}</span>
              </label>
            }
          </div>
        </div>

        @if (sports().length > 0) {
          <div class="section">
            <div class="field-label">Preço do horário (por hora)</div>
            <div class="prices">
              @for (sport of sports(); track sport.code) {
                <label class="price">
                  <span>{{ sport.label }}</span>
                  <span class="price-input">
                    <span class="currency">R$</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      inputmode="decimal"
                      [value]="form().priceBySport[sport.code] ?? ''"
                      [disabled]="readOnly()"
                      (input)="setPrice(sport.code, $any($event.target).value)"
                    />
                  </span>
                </label>
              }
            </div>
          </div>
        }

        <div class="section toggles">
          <label class="check">
            <input type="checkbox" [checked]="form().revealBeforeArrival" [disabled]="readOnly()" (change)="toggle('revealBeforeArrival')" />
            <span>Mostrar a quadra ao atleta quando a recepção definir antes da chegada</span>
          </label>
          <label class="check">
            <input type="checkbox" [checked]="form().allowCourtChoice" [disabled]="readOnly()" (change)="toggle('allowCourtChoice')" />
            <span>O atleta pode escolher a quadra, se quiser</span>
          </label>
        </div>

        <p class="note">Quem estiver com uma versão antiga do app vai ver "Atualize o app" ao reservar nesta arena.</p>
      }

      @if (errorMessage(); as err) {
        <div class="banner banner-error">{{ err }}</div>
      }
      @if (savedMessage(); as ok) {
        <div class="banner banner-ok">{{ ok }}</div>
      }

      @if (!readOnly()) {
        <div class="actions">
          <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="saving() || !dirty() || !!formError()" (click)="requestSave()">
            {{ saving() ? 'Salvando…' : 'Salvar' }}
          </button>
          @if (dirty() && formError(); as err) {
            <span class="hint">{{ err }}</span>
          }
        </div>
      }
    </ar-panel-card>

    @if (pendingSwitch(); as count) {
      <ar-modal (close)="pendingSwitch.set(null)">
        <h2 class="confirm-title">Voltar para o atleta escolher a quadra?</h2>
        <p class="confirm-body">
          Há {{ count }} {{ count === 1 ? 'reserva futura' : 'reservas futuras' }} sem quadra definida. Elas continuam assim —
          a recepção define a quadra delas na chegada. As reservas novas já saem com a quadra escolhida pelo atleta.
        </p>
        <div class="confirm-actions">
          <button type="button" class="ar-ghost-btn" (click)="pendingSwitch.set(null)">Voltar</button>
          <button type="button" class="ar-mini-btn ar-mini-btn-primary" (click)="save()">Confirmar</button>
        </div>
      </ar-modal>
    }
  `,
  styles: `
    .modes {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .mode {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      padding: 12px 14px;
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-line);
      background: var(--nx-surface-1);
      cursor: pointer;
    }
    .mode.selected {
      border-color: var(--nx-orange-500);
    }
    .mode-text {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .mode-title {
      font-weight: 700;
      font-size: 13.5px;
      color: var(--nx-text);
    }
    .mode-desc,
    .note,
    .hint,
    .muted {
      font-size: 12.5px;
      color: var(--nx-text-mute);
    }
    .section {
      margin-top: 18px;
    }
    .field-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 10px;
    }
    .courts {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 8px;
    }
    .check {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 32px;
      font-size: 13px;
      color: var(--nx-text);
      cursor: pointer;
    }
    .toggles {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .prices {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .price {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 13px;
      color: var(--nx-text);
    }
    .price-input {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 40px;
      padding: 0 12px;
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-line);
      background: var(--nx-surface-1);
    }
    .price-input input {
      width: 90px;
      border: none;
      background: transparent;
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 14px;
    }
    .price-input input:focus {
      outline: none;
    }
    .currency {
      color: var(--nx-text-dim);
      font-size: 13px;
    }
    .note {
      margin: 16px 0 0;
    }
    .banner {
      margin-top: 16px;
      border-radius: var(--nx-r-2);
      padding: 10px 14px;
      font-size: 12.5px;
      color: var(--nx-text);
    }
    .banner-error {
      border: 1px solid var(--nx-live);
      background: rgba(255, 59, 48, 0.08);
      color: var(--nx-live);
    }
    .banner-ok {
      border: 1px solid var(--nx-success);
      background: rgba(47, 179, 107, 0.1);
    }
    .actions {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 18px;
    }
    .confirm-title {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 19px;
      color: var(--nx-text);
      margin: 0 0 10px;
    }
    .confirm-body {
      font-size: 13.5px;
      line-height: 1.55;
      color: var(--nx-text-mute);
      margin: 0 0 20px;
    }
    .confirm-actions {
      display: flex;
      justify-content: flex-end;
      gap: 16px;
    }
    @media (max-width: 700px) {
      .modes {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class BookingAllocationCardComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly access = inject(ArenaAccessService);

  readonly courts = input.required<readonly ArenaCourt[]>();

  protected readonly readOnly = computed(() => !this.access.canWrite('quadras'));

  /** Configuração salva (ao vivo, do doc da arena). */
  private readonly saved = computed(() => bookingAllocationFromArena(this.arenaContext.arenaDocData()));
  protected readonly form = signal<BookingAllocationForm>(bookingAllocationFromArena(null));
  protected readonly dirty = signal(false);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly savedMessage = signal<string | null>(null);
  /** Nº de reservas sem quadra ao voltar para "atleta escolhe" — abre a confirmação. */
  protected readonly pendingSwitch = signal<number | null>(null);

  protected readonly sports = computed(() => sportsOfCourts(this.courts(), this.form().courtIds));
  protected readonly formError = computed(() => bookingAllocationError(this.form(), this.courts()));

  constructor() {
    // Sem edição em curso, o formulário acompanha o que está salvo.
    effect(() => {
      const saved = this.saved();
      if (!untracked(() => this.dirty())) this.form.set(saved);
    });
  }

  private patch(change: Partial<BookingAllocationForm>): void {
    this.form.update((f) => ({ ...f, ...change }));
    this.dirty.set(true);
    this.savedMessage.set(null);
    this.errorMessage.set(null);
  }

  protected setMode(mode: BookingAllocationMode): void {
    const current = this.form();
    // Primeira vez no modo capacidade: começa com todas as quadras ativas marcadas.
    const courtIds = mode === 'capacity' && current.courtIds.length === 0 ?
      this.courts().filter((c) => c.status === 'active').map((c) => c.id) :
      current.courtIds;
    this.patch({ mode, courtIds });
  }

  protected toggleCourt(courtId: string): void {
    const ids = this.form().courtIds;
    // Mantém a ordem da lista de quadras (é a ordem de preferência da distribuição).
    const next = ids.includes(courtId) ? ids.filter((id) => id !== courtId) : [...ids, courtId];
    const order = this.courts().map((c) => c.id);
    this.patch({ courtIds: next.sort((a, b) => order.indexOf(a) - order.indexOf(b)) });
  }

  protected setPrice(sport: string, raw: string): void {
    const value = Number(String(raw).replace(',', '.'));
    this.patch({ priceBySport: { ...this.form().priceBySport, [sport]: value > 0 ? value : null } });
  }

  protected toggle(field: 'revealBeforeArrival' | 'allowCourtChoice'): void {
    this.patch({ [field]: !this.form()[field] } as Partial<BookingAllocationForm>);
  }

  protected async requestSave(): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId || this.formError()) return;
    if (this.saved().mode === 'capacity' && this.form().mode === 'court') {
      try {
        const count = await countFutureUnassignedBookings(arenaFirestore(), arenaId, todayKey());
        if (count > 0) {
          this.pendingSwitch.set(count);
          return;
        }
      } catch {
        // Sem a contagem, salva mesmo assim: as reservas sem quadra não mudam com a troca.
      }
    }
    await this.save();
  }

  protected async save(): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId) return;
    this.pendingSwitch.set(null);
    this.saving.set(true);
    this.errorMessage.set(null);
    try {
      await saveBookingAllocation(arenaFunctions(), bookingAllocationPayload(arenaId, this.form(), this.courts()));
      this.dirty.set(false);
      this.savedMessage.set(this.form().mode === 'capacity' ?
        'Salvo. As próximas reservas saem sem quadra; a recepção define na chegada.' :
        'Salvo. As próximas reservas saem com a quadra escolhida pelo atleta.');
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      this.saving.set(false);
    }
  }
}
