import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { maxRecurringActiveFor } from '../data/arena-plan.model';
import { arenaFirestore } from '../data/firestore';
import { arenaFunctions } from '../data/functions';
import { fetchCourtsList } from '../courts/courts-repository';
import type { ArenaCourt } from '../courts/court.model';
import { formatBRL } from '../bookings/arena-booking.model';
import { IconComponent } from '../ui/icon.component';
import { ModalComponent } from '../ui/modal.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent } from '../ui/pill.component';
import { StatusDotComponent } from '../ui/status-dot.component';
import { DateRangePickerComponent } from '../ui/date-range-picker.component';
import {
  RECURRING_WEEKDAYS,
  RECURRING_WEEKDAY_LABEL,
  estimateMonthlyReais,
  recurringCustomerLabel,
  type ArenaRecurringBooking,
  type ArenaRecurringPaymentType,
} from './arena-recurring-booking.model';
import { cancelRecurringSeries, createRecurringSeries, pauseRecurringSeries, resumeRecurringSeries, updateRecurringSeries, watchVisibleSeries } from './recurring-bookings-repository';
import { AthleteSearchFieldComponent } from './athlete-search-field.component';
import type { AthleteCandidate } from './athlete-search-filter';

/** Tela Horários fixos (mensalista): leitura direta de `arenaRecurringBookings`, escrita
 *  100% via Cloud Functions (`createArenaRecurringBooking`/`cancelArenaRecurringBooking`) —
 *  a série exige transação com locks e materialização de ocorrências (Admin SDK only). */
@Component({
  selector: 'ar-panel-recurring',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PanelShellComponent,
    PageHeaderComponent,
    PanelCardComponent,
    IconComponent,
    ModalComponent,
    PillComponent,
    StatusDotComponent,
    RouterLink,
    DatePipe,
    DateRangePickerComponent,
    AthleteSearchFieldComponent,
  ],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Horários fixos" [subtitle]="headerSubtitle()">
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="atCap() || readOnly()" (click)="openCreate()">
          <ar-icon name="plus" [size]="14" />
          Novo horário fixo
        </button>
      </ar-page-header>

      <div class="body">
        @if (arenaNotFound()) {
          <p class="state-text">Nenhuma arena vinculada à sua conta ainda.</p>
        } @else if (arenaLoading() || loading()) {
          <p class="state-text">Carregando horários fixos…</p>
        } @else {
          @if (atCap()) {
            <div class="cap-banner">
              Limite de {{ maxActive() }} horários fixos ativos do seu plano atingido — faça upgrade em
              <a routerLink="/painel/planos" class="link">Planos</a> pra cadastrar mais.
            </div>
          }

          <ar-panel-card [kicker]="listKicker()" title="Séries ativas" class="list-card">
            @if (series().length === 0) {
              <p class="state-text empty-text">Nenhum horário fixo cadastrado ainda.</p>
            } @else {
              <div class="table-head">
                <span>Mensalista</span>
                <span>Dia / horário</span>
                <span>Quadra</span>
                <span>Pagamento</span>
                <span class="right">Valor</span>
                <span></span>
              </div>
              <div class="table-list">
                @for (s of series(); track s.id) {
                  <div class="table-row">
                    <div class="cell-client">
                      {{ customerLabel(s) }}
                      @if (s.status === 'paused') {
                        <div class="paused-hint">
                          <ar-status-dot tone="yellow" [size]="6" />
                          Pausado{{ s.pausedAt ? ' desde ' + (s.pausedAt | date: 'dd/MM') : '' }}
                        </div>
                      } @else {
                        <div class="active-hint">
                          <ar-status-dot tone="green" [size]="6" />
                          Ativo
                        </div>
                      }
                    </div>
                    <div class="cell-slot">{{ weekdayLabel[s.weekday] }} · {{ s.startTime }}–{{ s.endTime }}</div>
                    <div class="cell-court">{{ s.courtName }}</div>
                    <div class="cell-payment">
                      <ar-pill [tone]="s.paymentType === 'monthly' ? 'orange' : 'dim'">
                        {{ s.paymentType === 'monthly' ? 'Mensal' : 'Por ocorrência' }}
                      </ar-pill>
                    </div>
                    <div class="cell-amount right">
                      @if (s.paymentType === 'monthly') {
                        <div class="amount-primary">{{ formatBRL(estimateMonthlyReais(s.amountReais)) }}/mês</div>
                        <div class="amount-secondary">{{ formatBRL(s.amountReais) }}/ocorrência</div>
                      } @else {
                        <div class="amount-primary">{{ formatBRL(s.amountReais) }}/ocorrência</div>
                        <div class="amount-secondary">≈ {{ formatBRL(estimateMonthlyReais(s.amountReais)) }}/mês</div>
                      }
                    </div>
                    <div class="cell-actions">
                      <button type="button" class="icon-action" [attr.aria-label]="'Editar'" [disabled]="readOnly()" (click)="openEdit(s)">
                        <ar-icon name="edit" [size]="15" />
                      </button>
                      @if (s.status === 'active') {
                        <button type="button" class="icon-action" [attr.aria-label]="'Pausar'" [disabled]="readOnly()" (click)="openPause(s)">
                          <ar-icon name="pause" [size]="15" />
                        </button>
                      } @else {
                        <button type="button" class="icon-action" [attr.aria-label]="'Retomar'" [disabled]="resuming() === s.id || readOnly()" (click)="resume(s)">
                          <ar-icon name="play" [size]="15" />
                        </button>
                      }
                      <button type="button" class="ar-ghost-btn danger-link" [disabled]="readOnly()" (click)="openCancel(s)">Encerrar</button>
                    </div>
                  </div>
                }
              </div>
            }
          </ar-panel-card>
        }
      </div>

      @if (formOpen()) {
        <ar-modal (close)="closeForm()">
          <h2 class="modal-title">{{ editTarget() ? 'Editar horário fixo' : 'Novo horário fixo' }}</h2>
          <p class="modal-subtitle">Reserva semanal recorrente (mensalista) — as próximas ocorrências são criadas automaticamente.</p>

          @if (formError(); as err) {
            <div class="error-banner">{{ err }}</div>
          }

          <div class="field-label">Quadra</div>
          <select class="input-box" [value]="courtId()" (change)="courtId.set($any($event.target).value)">
            <option value="" disabled>Selecione a quadra</option>
            @for (c of courts(); track c.id) {
              <option [value]="c.id">{{ c.name }}</option>
            }
          </select>

          <div class="field-label">Dia da semana</div>
          <div class="ar-filter-bar weekday-bar">
            @for (d of weekdayOptions; track d) {
              <button type="button" class="ar-chip" [class.active]="weekday() === d" (click)="weekday.set(d)">{{ weekdayLabel[d] }}</button>
            }
          </div>

          <div class="time-row">
            <div>
              <div class="field-label">Início</div>
              <input type="time" class="input-box" [value]="startTime()" (input)="startTime.set($any($event.target).value)" />
            </div>
            <div>
              <div class="field-label">Fim</div>
              <input type="time" class="input-box" [value]="endTime()" (input)="endTime.set($any($event.target).value)" />
            </div>
          </div>

          <div class="field-label">Data de início / término</div>
          <ar-date-range-picker
            [startDate]="startDate()"
            [endDate]="endDate()"
            (rangeChange)="onRangeChange($event)"
          />
          <div class="spacer"></div>

          <div class="field-label">Mensalista</div>
          <div class="ar-filter-bar weekday-bar">
            <button type="button" class="ar-chip" [class.active]="mensalistaMode() === 'atleta'" (click)="setMensalistaMode('atleta')">Atleta cadastrado</button>
            <button type="button" class="ar-chip" [class.active]="mensalistaMode() === 'avulso'" (click)="setMensalistaMode('avulso')">Avulso</button>
          </div>

          @if (mensalistaMode() === 'atleta') {
            <ar-athlete-search-field [arenaId]="arenaContext.arenaId() ?? ''" (selected)="onAthleteSelected($event)" />
            @if (athleteId()) {
              <p class="athlete-selected-hint">Selecionado: {{ athleteName() }}</p>
            }
          } @else {
            <input
              type="text"
              class="input-box"
              placeholder="Ex.: João Silva"
              [value]="customerName()"
              (input)="customerName.set($any($event.target).value)"
            />
          }

          <div class="field-label">Valor por ocorrência (R$)</div>
          <input
            type="text"
            inputmode="decimal"
            class="input-box"
            placeholder="0,00"
            [value]="amountValue()"
            (input)="amountValue.set($any($event.target).value)"
          />
          <p class="monthly-hint">≈ {{ formatBRL(estimateMonthlyReais(parsedAmount())) }}/mês</p>

          <div class="field-label">Forma de pagamento</div>
          <div class="ar-filter-bar weekday-bar">
            <button type="button" class="ar-chip" [class.active]="paymentType() === 'monthly'" (click)="paymentType.set('monthly')">Mensal</button>
            <button type="button" class="ar-chip" [class.active]="paymentType() === 'per_occurrence'" (click)="paymentType.set('per_occurrence')">Por ocorrência</button>
          </div>

          <div class="actions">
            <button type="button" class="ar-ghost-btn" [disabled]="saving()" (click)="closeForm()">Cancelar</button>
            <button type="button" class="ar-mini-btn ar-mini-btn-primary confirm-btn" [disabled]="!canSubmit()" (click)="submitForm()">
              {{ saving() ? 'Salvando…' : (editTarget() ? 'Salvar alterações' : 'Criar horário fixo') }}
            </button>
          </div>
        </ar-modal>
      }

      @if (confirmTarget(); as target) {
        <ar-modal (close)="closeConfirm()">
          <h2 class="confirm-title">{{ confirmMode() === 'pause' ? 'Pausar horário fixo?' : 'Encerrar horário fixo?' }}</h2>
          <p class="confirm-body">
            {{ weekdayLabel[target.weekday] }} · {{ target.startTime }}–{{ target.endTime }} · {{ target.courtName }} ·
            {{ customerLabel(target) }}.
            @if (confirmMode() === 'pause') {
              As ocorrências futuras já agendadas serão liberadas da agenda até você retomar.
            } @else {
              As ocorrências futuras são canceladas; as já feitas ficam preservadas no histórico.
            }
          </p>
          @if (confirmError(); as err) {
            <div class="error-banner">{{ err }}</div>
          }
          <div class="confirm-actions">
            <button type="button" class="ar-ghost-btn" [disabled]="confirming()" (click)="closeConfirm()">Voltar</button>
            <button type="button" class="ar-mini-btn danger-btn" [disabled]="confirming()" (click)="confirmAction()">
              {{ confirming() ? (confirmMode() === 'pause' ? 'Pausando…' : 'Encerrando…') : (confirmMode() === 'pause' ? 'Pausar horário fixo' : 'Encerrar horário fixo') }}
            </button>
          </div>
        </ar-modal>
      }
    </ar-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow: auto;
    }

    .state-text {
      font-size: 13.5px;
      color: var(--nx-text-mute);
      margin: 0 0 12px;
    }

    .empty-text {
      margin: 12px 0;
    }

    .link {
      color: var(--nx-orange-500);
    }

    .cap-banner {
      flex: none;
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-line-strong);
      background: var(--nx-surface-1);
      padding: 10px 14px;
      font-size: 12.5px;
      color: var(--nx-text-mute);
    }

    .list-card {
      flex: 1;
      min-height: 0;
    }

    .table-head,
    .table-row {
      display: grid;
      grid-template-columns: 1.3fr 1.4fr 0.8fr 1fr 140px 180px;
      gap: 14px;
      align-items: center;
    }

    .table-head {
      padding: 0 0 8px;
      border-bottom: 1px solid var(--nx-line-strong);
      flex: none;
    }

    .table-head span {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .table-list {
      display: flex;
      flex-direction: column;
    }

    .table-row {
      padding: 14px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .table-row:last-child {
      border-bottom: none;
    }

    .cell-client {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13.5px;
      color: var(--nx-text);
    }

    .cell-slot,
    .cell-court {
      font-size: 13px;
      color: var(--nx-text-mute);
    }

    .right {
      text-align: right;
    }

    .cell-actions {
      text-align: right;
    }

    .paused-hint,
    .active-hint {
      display: flex;
      align-items: center;
      gap: 5px;
      margin-top: 3px;
      font-size: 10.5px;
      color: var(--nx-text-dim);
    }

    .cell-payment {
      display: flex;
    }

    .amount-primary {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13.5px;
      color: var(--nx-text);
    }

    .amount-secondary {
      font-size: 10.5px;
      color: var(--nx-text-dim);
      margin-top: 2px;
    }

    .icon-action {
      display: inline-grid;
      place-items: center;
      width: 30px;
      height: 30px;
      border-radius: var(--nx-r-2);
      background: transparent;
      border: none;
      color: var(--nx-text-mute);
      cursor: pointer;
      margin-right: 2px;
    }

    .icon-action:hover:not(:disabled) {
      background: var(--nx-surface-2);
      color: var(--nx-text);
    }

    .icon-action:disabled {
      opacity: 0.4;
      cursor: default;
    }

    .danger-link {
      color: var(--nx-live);
      height: 30px;
      padding: 0 10px;
      font-size: 12px;
    }

    .modal-title,
    .confirm-title {
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

    .confirm-body {
      font-size: 13.5px;
      line-height: 1.55;
      color: var(--nx-text-mute);
      margin: 0 0 22px;
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

    .weekday-bar {
      margin-bottom: 18px;
    }

    .spacer {
      height: 18px;
    }

    .athlete-selected-hint,
    .monthly-hint {
      font-size: 11.5px;
      color: var(--nx-text-dim);
      margin: -8px 0 18px;
    }

    .time-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
    }

    .actions,
    .confirm-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 16px;
    }

    .confirm-btn {
      height: 44px;
      padding: 0 20px;
    }

    .danger-btn {
      height: 44px;
      padding: 0 20px;
      background: var(--nx-live);
      color: #fff;
      border: none;
    }

    .danger-btn:hover:not(:disabled) {
      background: #ff564c;
    }
  `,
})
export class PanelRecurringComponent {
  protected readonly arenaContext = inject(ArenaContextService);
  private readonly access = inject(ArenaAccessService);

  /** Cargo com leitura mas sem escrita em `agenda` (manutenção): criar/editar/pausar/
   *  retomar/encerrar horário fixo ficam indisponíveis. */
  protected readonly readOnly = computed(() => !this.access.canWrite('agenda'));

  protected readonly weekdayOptions = RECURRING_WEEKDAYS;
  protected readonly weekdayLabel = RECURRING_WEEKDAY_LABEL;
  protected readonly formatBRL = formatBRL;
  protected readonly customerLabel = recurringCustomerLabel;

  protected readonly arenaLoading = computed(() => this.arenaContext.loading());
  protected readonly arenaNotFound = computed(() => this.arenaContext.notFound());

  protected readonly loading = signal(true);
  protected readonly series = signal<ArenaRecurringBooking[]>([]);
  protected readonly courts = signal<ArenaCourt[]>([]);

  protected readonly maxActive = computed(() => maxRecurringActiveFor(this.arenaContext.planStatus().tier, this.arenaContext.entitled()));
  protected readonly atCap = computed(() => {
    const max = this.maxActive();
    return max != null && this.series().length >= max;
  });

  protected readonly formOpen = signal(false);
  protected readonly editTarget = signal<ArenaRecurringBooking | null>(null);
  protected readonly courtId = signal('');
  protected readonly weekday = signal(1);
  protected readonly startTime = signal('19:00');
  protected readonly endTime = signal('20:00');
  protected readonly startDate = signal<string | null>(null);
  protected readonly endDate = signal<string | null>(null);
  protected readonly mensalistaMode = signal<'atleta' | 'avulso'>('avulso');
  protected readonly athleteId = signal<string | null>(null);
  protected readonly athleteName = signal('');
  protected readonly customerName = signal('');
  protected readonly amountValue = signal('');
  protected readonly paymentType = signal<ArenaRecurringPaymentType>('per_occurrence');
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly confirmTarget = signal<ArenaRecurringBooking | null>(null);
  protected readonly confirmMode = signal<'pause' | 'cancel'>('cancel');
  protected readonly confirming = signal(false);
  protected readonly confirmError = signal<string | null>(null);

  protected readonly listKicker = computed(() => `${this.series().length} ativos`);
  protected readonly headerSubtitle = computed(() => `${this.arenaContext.arenaName() ?? 'Arena'} · mensalistas recorrentes`);

  protected readonly canSubmit = computed(() => {
    return (
      !this.saving() &&
      this.courtId().length > 0 &&
      this.startTime().length === 5 &&
      this.endTime().length === 5 &&
      this.startDate() != null &&
      this.parsedAmount() > 0 &&
      (this.mensalistaMode() === 'atleta' ? this.athleteId() != null : this.customerName().trim().length > 0)
    );
  });

  private unsubscribeSeries: (() => void) | null = null;

  constructor() {
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      this.unsubscribeSeries?.();
      this.unsubscribeSeries = null;
      if (!arenaId) return;

      this.loading.set(true);
      const db = arenaFirestore();
      void fetchCourtsList(db, arenaId).then((list) => this.courts.set(list));
      this.unsubscribeSeries = watchVisibleSeries(db, arenaId, (list) => {
        this.series.set(list);
        this.loading.set(false);
      });
    });
  }

  protected parsedAmount(): number {
    const normalized = this.amountValue().trim().replace(/\./g, '').replace(',', '.');
    const value = Number(normalized);
    return Number.isFinite(value) ? value : 0;
  }

  protected openCreate(): void {
    if (this.atCap() || this.readOnly()) return;
    this.editTarget.set(null);
    this.courtId.set(this.courts()[0]?.id ?? '');
    this.weekday.set(1);
    this.startTime.set('19:00');
    this.endTime.set('20:00');
    this.startDate.set(null);
    this.endDate.set(null);
    this.mensalistaMode.set('avulso');
    this.athleteId.set(null);
    this.athleteName.set('');
    this.customerName.set('');
    this.amountValue.set('');
    this.paymentType.set('per_occurrence');
    this.formError.set(null);
    this.formOpen.set(true);
  }

  protected openEdit(series: ArenaRecurringBooking): void {
    if (this.readOnly()) return;
    this.editTarget.set(series);
    this.courtId.set(series.courtId);
    this.weekday.set(series.weekday);
    this.startTime.set(series.startTime);
    this.endTime.set(series.endTime);
    this.startDate.set(series.startDate);
    this.endDate.set(series.endDate);
    this.mensalistaMode.set(series.athleteId ? 'atleta' : 'avulso');
    this.athleteId.set(series.athleteId);
    this.athleteName.set(series.customerName ?? (series.athleteId ? recurringCustomerLabel(series) : ''));
    this.customerName.set(series.customerName ?? '');
    this.amountValue.set(series.amountReais.toString().replace('.', ','));
    this.paymentType.set(series.paymentType);
    this.formError.set(null);
    this.formOpen.set(true);
  }

  protected closeForm(): void {
    this.formOpen.set(false);
  }

  protected setMensalistaMode(mode: 'atleta' | 'avulso'): void {
    if (this.mensalistaMode() === mode) return;
    this.mensalistaMode.set(mode);
    this.athleteId.set(null);
    this.athleteName.set('');
    this.customerName.set('');
  }

  protected onAthleteSelected(candidate: AthleteCandidate): void {
    this.athleteId.set(candidate.athleteId);
    this.athleteName.set(candidate.name);
  }

  protected onRangeChange(range: { startDate: string; endDate: string | null }): void {
    this.startDate.set(range.startDate);
    this.endDate.set(range.endDate);
  }

  protected async submitForm(): Promise<void> {
    if (!this.canSubmit() || this.readOnly()) return;
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId) return;

    this.saving.set(true);
    this.formError.set(null);
    try {
      const payload = {
        arenaId,
        courtId: this.courtId(),
        weekday: this.weekday(),
        startTime: this.startTime(),
        endTime: this.endTime(),
        amountReais: this.parsedAmount(),
        paymentType: this.paymentType(),
        startDate: this.startDate() ?? undefined,
        endDate: this.endDate() ?? undefined,
        ...(this.mensalistaMode() === 'atleta'
          ? { athleteId: this.athleteId() ?? undefined }
          : { customerName: this.customerName().trim() }),
      };

      const target = this.editTarget();
      if (target) {
        await updateRecurringSeries(arenaFunctions(), { ...payload, seriesId: target.id });
      } else {
        await createRecurringSeries(arenaFunctions(), payload);
      }
      this.formOpen.set(false);
    } catch (err) {
      this.formError.set(err instanceof Error ? err.message : 'Não foi possível salvar o horário fixo.');
    } finally {
      this.saving.set(false);
    }
  }

  protected readonly resuming = signal<string | null>(null);
  protected readonly estimateMonthlyReais = estimateMonthlyReais;

  protected openPause(series: ArenaRecurringBooking): void {
    if (this.readOnly()) return;
    this.confirmMode.set('pause');
    this.confirmError.set(null);
    this.confirmTarget.set(series);
  }

  protected openCancel(series: ArenaRecurringBooking): void {
    if (this.readOnly()) return;
    this.confirmMode.set('cancel');
    this.confirmError.set(null);
    this.confirmTarget.set(series);
  }

  protected closeConfirm(): void {
    this.confirmTarget.set(null);
  }

  protected async confirmAction(): Promise<void> {
    const target = this.confirmTarget();
    if (!target || this.readOnly()) return;
    this.confirming.set(true);
    this.confirmError.set(null);
    try {
      if (this.confirmMode() === 'pause') {
        await pauseRecurringSeries(arenaFunctions(), target.id);
      } else {
        await cancelRecurringSeries(arenaFunctions(), target.id);
      }
      this.confirmTarget.set(null);
    } catch (err) {
      const fallback = this.confirmMode() === 'pause' ? 'Não foi possível pausar o horário fixo.' : 'Não foi possível encerrar o horário fixo.';
      this.confirmError.set(err instanceof Error ? err.message : fallback);
    } finally {
      this.confirming.set(false);
    }
  }

  protected async resume(series: ArenaRecurringBooking): Promise<void> {
    if (this.readOnly()) return;
    this.resuming.set(series.id);
    try {
      await resumeRecurringSeries(arenaFunctions(), series.id);
    } catch {
      // A linha volta a mostrar "Pausado" via onSnapshot — sem toast no
      // portal (não existe componente de toast aqui hoje); se falhar, o
      // gestor tenta de novo pelo mesmo botão.
    } finally {
      this.resuming.set(null);
    }
  }
}
