import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { arenaFunctions } from '../data/functions';
import { IconComponent } from '../ui/icon.component';
import { ModalComponent } from '../ui/modal.component';
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
 *  se a recepção define na chegada (reservas por capacidade). Desenho: canvas NexaGO, página
 *  Arena › "Reservas por capacidade" › 01 · Quadras. */
@Component({
  selector: 'ar-booking-allocation-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, ModalComponent],
  template: `
    <section class="card" aria-labelledby="como-reserva-title">
      <h2 class="card-title" id="como-reserva-title">Como o atleta reserva</h2>
      <p class="card-desc">Vale para as próximas reservas. As que já existem continuam como estão.</p>

      <div class="modes" role="radiogroup" aria-labelledby="como-reserva-title">
        <label class="mode" [class.on]="form().mode === 'court'">
          <input type="radio" name="allocation-mode" [checked]="form().mode === 'court'" [disabled]="readOnly()" (change)="setMode('court')" />
          <span>
            <span class="mode-title">O atleta escolhe a quadra</span>
            <span class="mode-desc">Como sempre: a reserva já sai com a quadra escolhida.</span>
          </span>
        </label>
        <label class="mode" [class.on]="form().mode === 'capacity'">
          <input type="radio" name="allocation-mode" [checked]="form().mode === 'capacity'" [disabled]="readOnly()" (change)="setMode('capacity')" />
          <span>
            <span class="mode-title">A arena define a quadra</span>
            <span class="mode-desc">O atleta reserva o horário. A recepção direciona cada grupo na chegada.</span>
          </span>
        </label>
      </div>

      @if (form().mode === 'capacity') {
        <div class="sep"></div>
        <p class="label" id="distribuicao-label">Quadras da distribuição</p>
        <div class="chips" role="group" aria-labelledby="distribuicao-label">
          @for (court of courts(); track court.id) {
            <label class="chip" [class.on]="form().courtIds.includes(court.id)" [class.dim]="court.status === 'maintenance'">
              <input type="checkbox" [checked]="form().courtIds.includes(court.id)" [disabled]="readOnly()" (change)="toggleCourt(court.id)" />
              @if (form().courtIds.includes(court.id)) {
                <ar-icon name="check" [size]="14" />
              }
              {{ court.name }}
              @if (court.status === 'maintenance') {
                <small>manutenção</small>
              }
            </label>
          }
        </div>
        <p class="hint">
          {{ selectedCount() }} de {{ courts().length }} quadras · o sistema tenta nesta ordem e prefere a quadra que encosta em outra reserva
        </p>

        @if (sports().length > 0) {
          <div class="sep"></div>
          <p class="label">Preço do horário (por hora)</p>
          <div class="prices">
            @for (sport of sports(); track sport.code) {
              <div>
                <label class="field-label" [attr.for]="'preco-' + sport.code">{{ sport.label }}</label>
                <div class="money">
                  <span>R$</span>
                  <input
                    [id]="'preco-' + sport.code"
                    type="number"
                    min="1"
                    step="1"
                    inputmode="decimal"
                    [value]="form().priceBySport[sport.code] ?? ''"
                    [disabled]="readOnly()"
                    (input)="setPrice(sport.code, $any($event.target).value)"
                  />
                </div>
              </div>
            }
          </div>
          <p class="hint">Promoções e regras de horário de pico continuam valendo em cima deste preço.</p>
        }

        <div class="sep"></div>
        <div class="toggle">
          <div>
            <div class="toggle-title" id="reveal-label">Mostrar a quadra ao atleta antes da chegada</div>
            <div class="toggle-desc">Quando a recepção definir a quadra antes, o atleta vê no app.</div>
          </div>
          <button
            type="button"
            class="switch"
            role="switch"
            aria-labelledby="reveal-label"
            [class.on]="form().revealBeforeArrival"
            [attr.aria-checked]="form().revealBeforeArrival"
            [disabled]="readOnly()"
            (click)="toggle('revealBeforeArrival')"
          ></button>
        </div>
        <div class="toggle">
          <div>
            <div class="toggle-title" id="choice-label">O atleta pode escolher a quadra, se quiser</div>
            <div class="toggle-desc">Quem não escolher entra na distribuição.</div>
          </div>
          <button
            type="button"
            class="switch"
            role="switch"
            aria-labelledby="choice-label"
            [class.on]="form().allowCourtChoice"
            [attr.aria-checked]="form().allowCourtChoice"
            [disabled]="readOnly()"
            (click)="toggle('allowCourtChoice')"
          ></button>
        </div>

        <p class="notice">
          <ar-icon name="alert-triangle" [size]="14" />
          <span>Quem estiver com uma versão antiga do app vai ver “Atualize o app” ao reservar nesta arena.</span>
        </p>
      }

      @if (errorMessage(); as err) {
        <div class="banner banner-error">{{ err }}</div>
      }
      @if (savedMessage(); as ok) {
        <div class="banner banner-ok">{{ ok }}</div>
      }

      @if (!readOnly()) {
        <div class="actions">
          <button type="button" class="ar-mini-btn ar-mini-btn-primary save-btn" [disabled]="saving() || !dirty() || !!formError()" (click)="requestSave()">
            <ar-icon name="check" [size]="14" />
            {{ saving() ? 'Salvando…' : 'Salvar' }}
          </button>
          @if (dirty()) {
            <span class="hint inline">{{ formError() ?? 'Alterações não salvas' }}</span>
          }
        </div>
      }
    </section>

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
    .card {
      background: var(--nx-surface-0, #0b0b0c);
      border: 1px solid var(--nx-line);
      border-radius: 16px;
      padding: 20px 22px;
    }
    .card-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 16px;
      color: var(--nx-text);
      margin: 0;
    }
    .card-desc {
      font-size: 13px;
      color: var(--nx-text-mute);
      margin: 4px 0 0;
      line-height: 1.5;
    }
    .modes {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-top: 18px;
    }
    .mode {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      padding: 16px;
      border-radius: 14px;
      border: 1px solid var(--nx-line);
      background: var(--nx-surface-1);
      cursor: pointer;
    }
    .mode.on {
      border-color: var(--nx-orange-500);
      background: rgba(255, 106, 26, 0.06);
    }
    .mode input {
      accent-color: var(--nx-orange-500);
      margin: 3px 0 0;
      width: 16px;
      height: 16px;
      flex: none;
    }
    .mode-title {
      display: block;
      font-weight: 700;
      font-size: 14px;
      color: var(--nx-text);
    }
    .mode-desc {
      display: block;
      font-size: 12.5px;
      color: var(--nx-text-mute);
      margin-top: 4px;
      line-height: 1.45;
    }
    .sep {
      height: 1px;
      background: var(--nx-line);
      margin: 20px 0;
    }
    .label {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin: 0 0 10px;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .chip {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 36px;
      padding: 0 14px;
      border-radius: 999px;
      border: 1px solid var(--nx-line);
      background: var(--nx-surface-1);
      color: var(--nx-text-mute);
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
    }
    .chip input {
      position: absolute;
      opacity: 0;
      width: 1px;
      height: 1px;
    }
    .chip:focus-within {
      outline: 2px solid var(--nx-orange-500);
      outline-offset: 2px;
    }
    .chip.on {
      background: rgba(255, 106, 26, 0.12);
      border-color: rgba(255, 106, 26, 0.55);
      color: var(--nx-orange-400, #ff8a4a);
    }
    .chip.dim:not(.on) {
      opacity: 0.55;
    }
    .chip small {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      opacity: 0.8;
    }
    .hint {
      font-size: 12px;
      color: var(--nx-text-dim);
      margin: 10px 0 0;
    }
    .hint.inline {
      margin: 0;
    }
    .prices {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 12px;
    }
    .field-label {
      display: block;
      font-size: 12.5px;
      font-weight: 600;
      color: var(--nx-text);
      margin-bottom: 8px;
    }
    .money {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 44px;
      padding: 0 14px;
      border-radius: 10px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      font-family: var(--nx-font-mono);
      font-size: 14px;
    }
    .money:focus-within {
      border-color: var(--nx-orange-500);
    }
    .money span {
      color: var(--nx-text-dim);
    }
    .money input {
      flex: 1;
      min-width: 0;
      background: transparent;
      border: none;
      color: var(--nx-text);
      font: inherit;
      outline: none;
    }
    .toggle {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 12px 0;
    }
    .toggle + .toggle {
      border-top: 1px solid var(--nx-line);
    }
    .toggle-title {
      font-size: 13.5px;
      font-weight: 600;
      color: var(--nx-text);
    }
    .toggle-desc {
      font-size: 12px;
      color: var(--nx-text-mute);
      margin-top: 3px;
    }
    .switch {
      position: relative;
      width: 40px;
      height: 22px;
      flex: none;
      padding: 0;
      border-radius: 999px;
      background: var(--nx-surface-2, #1b1b1f);
      border: 1px solid var(--nx-line);
      cursor: pointer;
    }
    .switch::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--nx-text-mute);
      transition: left 160ms cubic-bezier(0.22, 1, 0.36, 1);
    }
    .switch.on {
      background: var(--nx-orange-500);
      border-color: var(--nx-orange-500);
    }
    .switch.on::after {
      left: 20px;
      background: #0a0a0a;
    }
    .switch:focus-visible {
      outline: 2px solid var(--nx-orange-500);
      outline-offset: 2px;
    }
    .switch:disabled {
      cursor: default;
      opacity: 0.6;
    }
    .notice {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      margin: 14px 0 0;
      padding: 12px 14px;
      border-radius: 10px;
      border: 1px solid rgba(244, 197, 67, 0.3);
      background: rgba(244, 197, 67, 0.06);
      color: var(--nx-text-mute);
      font-size: 12.5px;
      line-height: 1.5;
    }
    .banner {
      margin-top: 16px;
      border-radius: 10px;
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
      border: 1px solid var(--nx-win);
      background: rgba(47, 179, 107, 0.1);
    }
    .actions {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-top: 20px;
      flex-wrap: wrap;
    }
    .save-btn {
      height: 40px;
      padding: 0 18px;
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
  protected readonly selectedCount = computed(
    () => this.form().courtIds.filter((id) => this.courts().some((c) => c.id === id)).length,
  );

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
    if (this.readOnly()) return;
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
