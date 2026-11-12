import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { todayKeyLocal } from '../aulas/class.model';
import { bookingAllocationFromArena } from '../courts/booking-allocation';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFunctions } from '../data/functions';
import { AthleteSearchFieldComponent } from '../recurring/athlete-search-field.component';
import type { AthleteCandidate } from '../recurring/athlete-search-filter';
import { ModalComponent } from '../ui/modal.component';
import { brl } from './ph-format';
import { cycleMonthlyPrice, hourLabel } from './schedule-plan.logic';
import {
  CYCLE_LABEL,
  PAYMENT_FORM_LABEL,
  WEEKDAYS,
  WEEKDAY_SHORT,
  type ScheduleCycle,
  type SchedulePaymentForm,
  type SchedulePlan,
} from './schedule-plan.model';
import { createScheduleSubscription } from './schedule-plan-repository';
import { SchedulePlansStore } from './schedule-plans.store';

/** "Adicionar assinante" (gestor): atleta NexaGO ou nome + telefone, plano, dias, horário, ciclo
 *  e forma de cobrança → `createArenaScheduleSubscription`. */
@Component({
  selector: 'ar-ph-add-subscriber-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, AthleteSearchFieldComponent],
  styleUrl: './planos-horario.scss',
  template: `
    <ar-modal size="lg" (close)="close.emit()">
      <p class="modal-title">Adicionar assinante</p>
      <p class="modal-sub">
        @if (capacityMode()) {
          A arena define a quadra: o sistema segura uma quadra da distribuição livre em todos os dias escolhidos.
        } @else {
          A quadra é escolhida pelo sistema: a primeira do plano livre em todos os dias escolhidos.
        }
      </p>
      @if (error(); as err) {
        <div class="error-banner">{{ err }}</div>
      }
      @if (result(); as r) {
        <p class="state-text">{{ r }}</p>
        <div class="modal-actions">
          <button type="button" class="ar-mini-btn ar-mini-btn-primary" (click)="close.emit()">Fechar</button>
        </div>
      } @else {
        <div class="field-label">Titular</div>
        <div class="chip-row">
          <button type="button" class="sm-chip" [class.active]="mode() === 'athlete'" (click)="mode.set('athlete')">Atleta NexaGO</button>
          <button type="button" class="sm-chip" [class.active]="mode() === 'free'" (click)="mode.set('free')">Sem conta no app</button>
        </div>
        <div class="spaced-block">
          @if (mode() === 'athlete') {
            @if (arenaId(); as id) {
              <ar-athlete-search-field [arenaId]="id" (selected)="athlete.set($event)" />
            }
            @if (athlete(); as a) {
              <p class="hint">Selecionado: <b>{{ a.name }}</b></p>
            }
          } @else {
            <div class="row-2">
              <div>
                <div class="field-label">Nome</div>
                <input class="input-box" type="text" maxlength="80" [value]="name()" (input)="name.set($any($event.target).value)" />
              </div>
              <div>
                <div class="field-label">Telefone</div>
                <input class="input-box" type="tel" inputmode="tel" placeholder="(62) 99999-9999" [value]="phone()" (input)="phone.set($any($event.target).value)" />
              </div>
            </div>
          }
        </div>

        <div class="field-label spaced">Plano</div>
        <div class="chip-row">
          @for (p of plans(); track p.id) {
            <button type="button" class="sm-chip" [class.active]="planId() === p.id" (click)="pickPlan(p)">{{ p.name }}</button>
          } @empty {
            <span class="hint">Publique um plano antes de adicionar assinantes.</span>
          }
        </div>

        @if (plan(); as p) {
          @if (p.bookingMode === 'flexible') {
            <p class="hint spaced" data-testid="ph-add-flexible-hint">
              Plano de horário livre: o atleta reserva quando quiser, até {{ p.timesPerWeek }}x por semana, dentro de {{ windowHint() }}.
            </p>
          } @else {
          <div class="field-label spaced">Dias ({{ p.timesPerWeek }}x por semana)</div>
          <div class="chip-row">
            @for (d of weekdays; track d) {
              <button type="button" class="sm-chip" [class.active]="days().includes(d)" [disabled]="!windowDays().includes(d)" (click)="toggleDay(d)">{{ dayShort[d] }}</button>
            }
          </div>
          }
          <div class="row-2">
            @if (p.bookingMode !== 'flexible') {
            <div>
              <div class="field-label spaced">Início</div>
              <input class="input-box" type="time" step="1800" [value]="startTime()" (input)="startTime.set($any($event.target).value)" />
              @if (windowHint()) {
                <p class="hint">Janela: {{ windowHint() }}</p>
              }
            </div>
            }
            <div>
              <div class="field-label spaced">Começa em</div>
              <input class="input-box" type="date" [min]="today" [value]="startDate()" (input)="startDate.set($any($event.target).value)" />
            </div>
          </div>

          <div class="field-label spaced">Ciclo</div>
          <div class="chip-row">
            @for (c of cycles(); track c.id) {
              <button type="button" class="sm-chip" [class.active]="cycle() === c.id" (click)="cycle.set(c.id)">
                {{ c.label }} · {{ c.id === 'annual' ? brl(c.value * 12) + '/ano à vista' : brl(c.value) + '/mês' }}
              </button>
            }
          </div>

          @if (p.billing.dueDayOptions.length > 0) {
            <div class="field-label spaced">Vencimento</div>
            <div class="chip-row" data-testid="ph-add-due-day">
              @for (n of p.billing.dueDayOptions; track n) {
                <button type="button" class="sm-chip" [class.active]="dueDay() === n" (click)="dueDay.set(n)">Dia {{ n }}</button>
              }
            </div>
          }

          <div class="field-label spaced">Forma de cobrança</div>
          <div class="chip-row">
            @for (f of p.billing.methods; track f) {
              <button type="button" class="sm-chip" [class.active]="method() === f" (click)="method.set(f)">{{ formLabel[f] }}</button>
            }
          </div>
          @if (method() !== 'onsite') {
            <p class="hint">
              @if (!onlineBilling()) {
                Cobrança online desligada nas Regras gerais: a baixa é manual.
              } @else if (mode() === 'free') {
                Sem conta no app não dá para cobrar por link: a baixa é manual.
              } @else {
                Cada mensalidade vira um link de Pix ou cartão que o atleta paga pelo app.
              }
            </p>
          }
        }

        <div class="modal-actions">
          <button type="button" class="ar-mini-btn" [disabled]="busy()" (click)="close.emit()">Cancelar</button>
          <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="busy() || !valid()" (click)="submit()">{{ busy() ? 'Adicionando…' : 'Adicionar assinante' }}</button>
        </div>
      }
    </ar-modal>
  `,
  styles: `
    .spaced-block { margin-top: 12px; }
    .hint b { color: var(--nx-text); }
  `,
})
export class PhAddSubscriberModalComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly store = inject(SchedulePlansStore);

  readonly plans = input.required<SchedulePlan[]>();
  readonly close = output<void>();

  protected readonly brl = brl;
  protected readonly weekdays = WEEKDAYS;
  protected readonly dayShort = WEEKDAY_SHORT;
  protected readonly formLabel = PAYMENT_FORM_LABEL;
  protected readonly today = todayKeyLocal();
  protected readonly arenaId = computed(() => this.arenaContext.arenaId());
  protected readonly capacityMode = computed(() => bookingAllocationFromArena(this.arenaContext.arenaDocData()).mode === 'capacity');
  protected readonly onlineBilling = computed(() => this.store.settings().onlineBillingEnabled);

  protected readonly mode = signal<'athlete' | 'free'>('athlete');
  protected readonly athlete = signal<AthleteCandidate | null>(null);
  protected readonly name = signal('');
  protected readonly phone = signal('');
  protected readonly planId = signal<string | null>(null);
  protected readonly days = signal<number[]>([]);
  protected readonly startTime = signal('');
  protected readonly startDate = signal(todayKeyLocal());
  protected readonly cycle = signal<ScheduleCycle>('monthly');
  protected readonly method = signal<SchedulePaymentForm>('onsite');
  /** Plano com opções de vencimento: o dia escolhido (padrão a 1ª opção). */
  protected readonly dueDay = signal<number | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly result = signal<string | null>(null);

  protected readonly plan = computed(() => this.plans().find((p) => p.id === this.planId()) ?? null);
  protected readonly windowDays = computed(() => [...new Set((this.plan()?.windows ?? []).map((w) => w.weekday))]);
  protected readonly windowHint = computed(() => {
    const p = this.plan();
    if (!p) return '';
    const chosen = this.days().length ? this.days() : this.windowDays();
    const ranges = [...new Set(p.windows.filter((w) => chosen.includes(w.weekday)).map((w) => `${hourLabel(w.startTime)}–${hourLabel(w.endTime)}`))];
    return ranges.join(' · ');
  });
  protected readonly cycles = computed(() => {
    const p = this.plan();
    if (!p) return [];
    const out: Array<{ id: ScheduleCycle; label: string; value: number }> = [];
    if (p.cycles.monthly.enabled) out.push({ id: 'monthly', label: CYCLE_LABEL.monthly, value: p.monthlyPriceReais });
    if (p.cycles.quarterly.enabled) out.push({ id: 'quarterly', label: CYCLE_LABEL.quarterly, value: cycleMonthlyPrice(p.monthlyPriceReais, p.cycles.quarterly.discountPercent) });
    if (p.cycles.annual.enabled) out.push({ id: 'annual', label: CYCLE_LABEL.annual, value: cycleMonthlyPrice(p.monthlyPriceReais, p.cycles.annual.discountPercent) });
    return out;
  });
  protected readonly valid = computed(() => {
    const p = this.plan();
    const holder = this.mode() === 'athlete' ? this.athlete() != null : this.name().trim().length >= 2;
    if (!holder || p == null || !this.startDate()) return false;
    // Plano livre: sem dia/horário (o atleta reserva depois, dentro das janelas).
    return p.bookingMode === 'flexible' || (this.days().length === p.timesPerWeek && /^\d{2}:\d{2}$/.test(this.startTime()));
  });

  protected pickPlan(p: SchedulePlan): void {
    this.planId.set(p.id);
    this.dueDay.set(p.billing.dueDayOptions[0] ?? null);
    this.days.set([]);
    this.startTime.set(p.windows[0]?.startTime ?? '');
    this.cycle.set(p.cycles.monthly.enabled ? 'monthly' : p.cycles.quarterly.enabled ? 'quarterly' : 'annual');
    this.method.set(p.billing.methods.includes('onsite') ? 'onsite' : p.billing.methods[0] ?? 'onsite');
  }

  protected toggleDay(d: number): void {
    const max = this.plan()?.timesPerWeek ?? 1;
    this.days.update((days) => {
      if (days.includes(d)) return days.filter((x) => x !== d);
      const next = [...days, d].sort((a, b) => a - b);
      return next.length > max ? next.slice(next.length - max) : next;
    });
  }

  protected async submit(): Promise<void> {
    const arenaId = this.arenaId();
    const p = this.plan();
    if (!arenaId || !p || !this.valid()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const a = this.athlete();
      const res = await createScheduleSubscription(arenaFunctions(), {
        arenaId,
        planId: p.id,
        ...(this.mode() === 'athlete' && a
          ? { holderAthleteId: a.athleteId }
          : { holderName: this.name().trim(), ...(this.phone().trim() ? { holderPhone: this.phone().trim() } : {}) }),
        weekdays: p.bookingMode === 'flexible' ? [] : this.days(),
        startTime: p.bookingMode === 'flexible' ? '' : this.startTime(),
        cycle: this.cycle(),
        paymentMethod: this.method(),
        ...(p.billing.dueDayOptions.length > 0 && this.dueDay() != null ? { dueDay: this.dueDay()! } : {}),
        startDate: this.startDate(),
      });
      const skipped = res.skippedDates?.length ?? 0;
      this.result.set(
        (this.capacityMode() || p.bookingMode === 'flexible' ? 'Assinatura criada.' : `Assinatura criada na ${res.courtName}.`) +
          (skipped ? ` ${skipped} data${skipped === 1 ? '' : 's'} já tinha${skipped === 1 ? '' : 'm'} reserva avulsa e ficou${skipped === 1 ? '' : 'ram'} de fora.` : ''),
      );
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível adicionar o assinante.');
    } finally {
      this.busy.set(false);
    }
  }
}
