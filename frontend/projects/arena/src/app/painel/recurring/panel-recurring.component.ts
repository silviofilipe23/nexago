import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
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
import {
  RECURRING_WEEKDAYS,
  RECURRING_WEEKDAY_LABEL,
  recurringCustomerLabel,
  type ArenaRecurringBooking,
} from './arena-recurring-booking.model';
import { cancelRecurringSeries, createRecurringSeries, watchActiveSeries } from './recurring-bookings-repository';

/** Tela Horários fixos (mensalista): leitura direta de `arenaRecurringBookings`, escrita
 *  100% via Cloud Functions (`createArenaRecurringBooking`/`cancelArenaRecurringBooking`) —
 *  a série exige transação com locks e materialização de ocorrências (Admin SDK only). */
@Component({
  selector: 'ar-panel-recurring',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, IconComponent, ModalComponent, RouterLink],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Horários fixos" [subtitle]="headerSubtitle()">
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="atCap()" (click)="openCreate()">
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
              Limite de {{ maxActive() }} horários fixos ativos do plano Essencial atingido — faça upgrade em
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
                <span class="right">Valor</span>
                <span></span>
              </div>
              <div class="table-list">
                @for (s of series(); track s.id) {
                  <div class="table-row">
                    <div class="cell-client">{{ customerLabel(s) }}</div>
                    <div class="cell-slot">{{ weekdayLabel[s.weekday] }} · {{ s.startTime }}–{{ s.endTime }}</div>
                    <div class="cell-court">{{ s.courtName }}</div>
                    <div class="cell-amount right">{{ formatBRL(s.amountReais) }}</div>
                    <div class="cell-actions">
                      <button type="button" class="ar-ghost-btn danger-link" (click)="openCancel(s)">Encerrar</button>
                    </div>
                  </div>
                }
              </div>
            }
          </ar-panel-card>
        }
      </div>

      @if (showCreate()) {
        <ar-modal (close)="showCreate.set(false)">
          <h2 class="modal-title">Novo horário fixo</h2>
          <p class="modal-subtitle">Reserva semanal recorrente (mensalista) — as próximas ocorrências são criadas automaticamente.</p>

          @if (createError(); as err) {
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

          <div class="field-label">Nome do mensalista</div>
          <input
            type="text"
            class="input-box"
            placeholder="Ex.: João Silva"
            [value]="customerName()"
            (input)="customerName.set($any($event.target).value)"
          />

          <div class="field-label">Valor por ocorrência (R$)</div>
          <input
            type="text"
            inputmode="decimal"
            class="input-box"
            placeholder="0,00"
            [value]="amountValue()"
            (input)="amountValue.set($any($event.target).value)"
          />

          <div class="actions">
            <button type="button" class="ar-ghost-btn" [disabled]="creating()" (click)="showCreate.set(false)">Cancelar</button>
            <button type="button" class="ar-mini-btn ar-mini-btn-primary confirm-btn" [disabled]="!canCreate()" (click)="create()">
              {{ creating() ? 'Criando…' : 'Criar horário fixo' }}
            </button>
          </div>
        </ar-modal>
      }

      @if (cancelTarget(); as target) {
        <ar-modal (close)="cancelTarget.set(null)">
          <h2 class="confirm-title">Encerrar horário fixo?</h2>
          <p class="confirm-body">
            {{ weekdayLabel[target.weekday] }} · {{ target.startTime }}–{{ target.endTime }} · {{ target.courtName }} ·
            {{ customerLabel(target) }}. As ocorrências futuras são canceladas; as já feitas ficam preservadas no histórico.
          </p>
          @if (cancelError(); as err) {
            <div class="error-banner">{{ err }}</div>
          }
          <div class="confirm-actions">
            <button type="button" class="ar-ghost-btn" [disabled]="canceling()" (click)="cancelTarget.set(null)">Voltar</button>
            <button type="button" class="ar-mini-btn danger-btn" [disabled]="canceling()" (click)="confirmCancel()">
              {{ canceling() ? 'Encerrando…' : 'Encerrar horário fixo' }}
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
      grid-template-columns: 1.3fr 1.6fr 1fr 120px 100px;
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

    .cell-amount {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 14px;
      color: var(--nx-text);
    }

    .right {
      text-align: right;
    }

    .cell-actions {
      text-align: right;
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
  private readonly arenaContext = inject(ArenaContextService);

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

  protected readonly showCreate = signal(false);
  protected readonly courtId = signal('');
  protected readonly weekday = signal(1);
  protected readonly startTime = signal('19:00');
  protected readonly endTime = signal('20:00');
  protected readonly customerName = signal('');
  protected readonly amountValue = signal('');
  protected readonly creating = signal(false);
  protected readonly createError = signal<string | null>(null);

  protected readonly cancelTarget = signal<ArenaRecurringBooking | null>(null);
  protected readonly canceling = signal(false);
  protected readonly cancelError = signal<string | null>(null);

  protected readonly listKicker = computed(() => `${this.series().length} ativos`);
  protected readonly headerSubtitle = computed(() => `${this.arenaContext.arenaName() ?? 'Arena'} · mensalistas recorrentes`);

  protected readonly canCreate = computed(() => {
    return (
      !this.creating() &&
      this.courtId().length > 0 &&
      this.customerName().trim().length > 0 &&
      this.startTime().length === 5 &&
      this.endTime().length === 5 &&
      this.parsedAmount() > 0
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
      this.unsubscribeSeries = watchActiveSeries(db, arenaId, (list) => {
        this.series.set(list);
        this.loading.set(false);
      });
    });
  }

  private parsedAmount(): number {
    const normalized = this.amountValue().trim().replace(/\./g, '').replace(',', '.');
    const value = Number(normalized);
    return Number.isFinite(value) ? value : 0;
  }

  protected openCreate(): void {
    if (this.atCap()) return;
    this.courtId.set(this.courts()[0]?.id ?? '');
    this.weekday.set(1);
    this.startTime.set('19:00');
    this.endTime.set('20:00');
    this.customerName.set('');
    this.amountValue.set('');
    this.createError.set(null);
    this.showCreate.set(true);
  }

  protected async create(): Promise<void> {
    if (!this.canCreate()) return;
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId) return;

    this.creating.set(true);
    this.createError.set(null);
    try {
      await createRecurringSeries(arenaFunctions(), {
        arenaId,
        courtId: this.courtId(),
        weekday: this.weekday(),
        startTime: this.startTime(),
        endTime: this.endTime(),
        amountReais: this.parsedAmount(),
        customerName: this.customerName().trim(),
      });
      this.showCreate.set(false);
    } catch (err) {
      this.createError.set(err instanceof Error ? err.message : 'Não foi possível criar o horário fixo.');
    } finally {
      this.creating.set(false);
    }
  }

  protected openCancel(series: ArenaRecurringBooking): void {
    this.cancelError.set(null);
    this.cancelTarget.set(series);
  }

  protected async confirmCancel(): Promise<void> {
    const target = this.cancelTarget();
    if (!target) return;
    this.canceling.set(true);
    this.cancelError.set(null);
    try {
      await cancelRecurringSeries(arenaFunctions(), target.id);
      this.cancelTarget.set(null);
    } catch (err) {
      this.cancelError.set(err instanceof Error ? err.message : 'Não foi possível encerrar o horário fixo.');
    } finally {
      this.canceling.set(false);
    }
  }
}
