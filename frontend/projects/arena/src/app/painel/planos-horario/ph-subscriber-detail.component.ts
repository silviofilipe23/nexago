import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import type { Unsubscribe } from 'firebase/firestore';
import { addDaysKey, isoWeekdayOf, shortDate, todayKeyLocal } from '../aulas/class.model';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { arenaFunctions } from '../data/functions';
import { AvatarComponent } from '../ui/avatar.component';
import { ModalComponent } from '../ui/modal.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PillComponent } from '../ui/pill.component';
import { brl, monthLong, monthYear } from './ph-format';
import { PhIconComponent } from './planos-horario-ui';
import { PhSubscriberHistoryComponent } from './ph-subscriber-history.component';
import { occurrenceOutcome } from './subscriber-history';
import {
  chargeVoidsAutopay,
  chargeVoidsOnlineLink,
  durationLabel,
  onlineChargeBadge,
  onlineChargeInvoiceUrl,
  slotCourtsLabel,
  windowsLabel,
  type OnlineChargeBadge,
  type SubscriberState,
} from './schedule-plan.logic';
import {
  CYCLE_LABEL,
  MANUAL_METHODS,
  MANUAL_METHOD_LABEL,
  WEEKDAYS,
  WEEKDAY_LONG,
  WEEKDAY_SHORT,
  type PlanOccurrence,
  type ScheduleCharge,
  type ScheduleCredit,
  type ScheduleManualMethod,
  type SchedulePlan,
  type ScheduleSubscription,
} from './schedule-plan.model';
import {
  cancelScheduleCharge,
  changeScheduleSlots,
  endScheduleSubscription,
  grantScheduleMakeup,
  pauseScheduleSubscription,
  registerSchedulePayment,
  resumeScheduleSubscription,
  watchSubscriptionCharges,
  watchSubscriptionCredits,
  watchSubscriptionOccurrences,
} from './schedule-plan-repository';

type OccKind = 'done' | 'today' | 'next' | 'skip' | 'makeup';
type Dialog = 'change' | 'pause' | 'resume' | 'makeup' | 'end';

const OCC_LABEL: Record<OccKind, string> = { done: 'Jogou', today: 'Hoje', next: '', skip: 'Não vai', makeup: 'Reposição' };

/** Detalhe do assinante (lado direito da 04): horário, ocorrências do mês, rateio/mensalidades e as
 *  ações do gestor — trocar horário, pausar/retomar, dar reposição, encerrar e dar baixa. Mensalidade
 *  online mostra o estado do link (selo) e "Copiar link". */
@Component({
  selector: 'ar-ph-subscriber-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvatarComponent, PillComponent, PanelCardComponent, ModalComponent, PhIconComponent, PhSubscriberHistoryComponent],
  styleUrl: './planos-horario.scss',
  template: `
    @let s = sub();
    <ar-panel-card>
      <div class="head">
        <ar-avatar [name]="s.holderName" [photoUrl]="s.holderPhotoUrl" [size]="42" zoomable />
        <div class="who">
          <div class="name">{{ s.holderName }}</div>
          <div class="meta">{{ s.planName }} · desde {{ monthYear(s.startDate) }}</div>
        </div>
        <ar-pill [tone]="state().tone">{{ state().label }}</ar-pill>
      </div>
      <div class="slot">
        <span class="slot-time">{{ s.slots[0]?.startTime ?? '—' }}</span>
        <span class="slot-text">{{ slotText() }}</span>
      </div>
      <div class="occ-head">
        <span class="kicker">{{ occMonth() }}</span>
        <span class="mono-dim">{{ s.makeupBalance }} reposiç{{ s.makeupBalance === 1 ? 'ão' : 'ões' }} para usar</span>
      </div>
      <div class="occ-grid">
        @for (o of occurrences(); track o.id) {
          <div class="occ" [class]="'occ ' + o.kind">
            <div class="occ-w">{{ o.weekday }}</div>
            <div class="occ-d">{{ o.day }}</div>
            <div class="occ-l">{{ o.label }}</div>
          </div>
        } @empty {
          <p class="hint flush">Nenhuma ocorrência neste mês.</p>
        }
      </div>
      @if (s.endsOn && s.endRequestedBy === 'athlete' && s.status !== 'canceled') {
        <p class="hint">O atleta cancelou pelo app: joga até a véspera de {{ shortDate(s.endsOn) }}, quando a vaga abre.</p>
      }
      @if (s.holderPhone) {
        <p class="hint">Telefone: {{ s.holderPhone }} · {{ cycleLabel[s.cycle] }} · {{ brl(s.monthlyPriceReais) }}/mês</p>
      }
    </ar-panel-card>

    <ar-panel-card [title]="s.members.length > 1 ? 'Rateio' : 'Mensalidades'" [kicker]="s.members.length > 1 ? brl(s.monthlyPriceReais) + ' dividido em ' + s.members.length : brl(s.monthlyPriceReais) + ' por mês'">
      @if (nextDue(); as due) {
        <span card-actions class="mono-dim">vence {{ shortDate(due) }}</span>
      }
      @for (c of visibleCharges(); track c.id) {
        @let online = onlineBadge(c);
        <div class="charge">
          <ar-avatar [name]="c.payerName" [size]="24" />
          <div class="charge-who">
            <span>{{ c.payerName }}{{ c.payerIndex === 0 && s.members.length > 1 ? ' · titular' : '' }}@if (hasAutopay(s, c)) { <ar-pill tone="blue">Débito automático ligado</ar-pill> }</span>
            <small>{{ periodLabel(c) }}</small>
          </div>
          <span class="amount">{{ brl(c.amountReais) }}</span>
          @if (c.status === 'paid') {
            <ar-pill tone="green">{{ online?.label ?? 'Pago' }}</ar-pill>
          } @else if (c.dueDate < today) {
            <ar-pill tone="yellow">Atrasado</ar-pill>
          } @else {
            <ar-pill tone="dim">Aberto</ar-pill>
          }
        </div>
        @if (c.status === 'open') {
          <div class="charge-actions">
            @if (online) {
              <span class="online-state"><ar-pill [tone]="online.tone">{{ online.label }}</ar-pill></span>
            }
            @if (invoiceUrl(c); as url) {
              <button type="button" class="ar-ghost-btn" (click)="copyLink(url)">{{ copied() === url ? 'Copiado ✓' : 'Copiar link' }}</button>
            }
            <button type="button" class="ar-ghost-btn" [disabled]="readOnly()" (click)="openPay(c)">Registrar pagamento</button>
            <button type="button" class="ar-ghost-btn" [disabled]="readOnly()" (click)="canceling.set(c)">Cancelar</button>
          </div>
        }
      } @empty {
        <p class="state-text">Nenhuma mensalidade deste mês ou em aberto.</p>
      }
    </ar-panel-card>

    @if (message(); as m) {
      <div class="notice">{{ m }}</div>
    }

    <div class="actions">
      <button type="button" class="ar-mini-btn" [disabled]="readOnly() || s.status === 'canceled'" (click)="openDialog('change')"><ar-ph-icon name="swap" [size]="14" /> Trocar horário</button>
      @if (s.status === 'paused') {
        <button type="button" class="ar-mini-btn" [disabled]="readOnly()" (click)="openDialog('resume')"><ar-ph-icon name="pause" [size]="13" /> Retomar</button>
      } @else {
        <button type="button" class="ar-mini-btn" [disabled]="readOnly() || s.status !== 'active' || (plan() && !plan()!.rules.pause.enabled)" (click)="openDialog('pause')"><ar-ph-icon name="pause" [size]="13" /> Pausar</button>
      }
      <button type="button" class="ar-mini-btn" [disabled]="readOnly()" (click)="openDialog('makeup')"><ar-ph-icon name="undo" [size]="14" /> Dar reposição</button>
      <button type="button" class="ar-ghost-btn danger" [disabled]="readOnly()" (click)="openDialog('end')">Encerrar plano</button>
    </div>

    <ar-ph-subscriber-history [sub]="s" [plan]="plan()" [charges]="charges()" [occurrences]="rawOccurrences()" [credits]="credits()" />

    @switch (dialog()) {
      @case ('change') {
        <ar-modal (close)="dialog.set(null)">
          <p class="modal-title">Trocar horário</p>
          <p class="modal-sub">Escolha {{ s.slots.length }} dia{{ s.slots.length === 1 ? '' : 's' }} e o horário de início dentro da janela do plano ({{ planWindow() }}). A quadra é escolhida pelo sistema e fica a mesma toda semana.</p>
          @if (error(); as err) { <div class="error-banner">{{ err }}</div> }
          <div class="field-label">Dias</div>
          <div class="chip-row">
            @for (d of weekdays; track d) {
              <button type="button" class="sm-chip" [class.active]="newDays().includes(d)" (click)="toggleDay(d)">{{ dayShort[d] }}</button>
            }
          </div>
          <div class="field-label spaced">Início</div>
          <input class="input-box" type="time" step="1800" [value]="newTime()" (input)="newTime.set($any($event.target).value)" />
          <p class="hint">Vale a partir da próxima ocorrência. Precisa ter quadra livre em todos os dias e respeitar o limite do horário nobre.</p>
          <div class="modal-actions">
            <button type="button" class="ar-mini-btn" [disabled]="busy()" (click)="dialog.set(null)">Voltar</button>
            <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="busy() || newDays().length !== s.slots.length || !newTime()" (click)="changeSlots()">{{ busy() ? 'Trocando…' : 'Trocar horário' }}</button>
          </div>
        </ar-modal>
      }
      @case ('pause') {
        <ar-modal (close)="dialog.set(null)">
          <p class="modal-title">Pausar plano</p>
          <p class="modal-sub">O horário volta para o avulso e a cobrança congela até a volta. Este plano permite até {{ plan()?.rules?.pause?.maxDaysPerYear ?? 30 }} dias de pausa por ano.</p>
          @if (error(); as err) { <div class="error-banner">{{ err }}</div> }
          <div class="field-label">Volta em</div>
          <input class="input-box" type="date" [min]="tomorrow" [value]="dateValue()" (input)="dateValue.set($any($event.target).value)" />
          <div class="modal-actions">
            <button type="button" class="ar-mini-btn" [disabled]="busy()" (click)="dialog.set(null)">Voltar</button>
            <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="busy() || !dateValue() || dateValue() <= today" (click)="pause()">{{ busy() ? 'Pausando…' : 'Pausar' }}</button>
          </div>
        </ar-modal>
      }
      @case ('resume') {
        <ar-modal (close)="dialog.set(null)">
          <p class="modal-title">Retomar plano?</p>
          <p class="modal-sub">O assinante volta para o mesmo horário a partir da próxima ocorrência, se a quadra ainda estiver livre. A mensalidade do mês da volta sai proporcional.</p>
          @if (error(); as err) { <div class="error-banner">{{ err }}</div> }
          <div class="modal-actions">
            <button type="button" class="ar-mini-btn" [disabled]="busy()" (click)="dialog.set(null)">Voltar</button>
            <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="busy()" (click)="resume()">{{ busy() ? 'Retomando…' : 'Retomar' }}</button>
          </div>
        </ar-modal>
      }
      @case ('makeup') {
        <ar-modal (close)="dialog.set(null)">
          <p class="modal-title">Dar reposição</p>
          <p class="modal-sub">{{ s.holderName }} ganha um crédito para jogar em outro horário livre, fora do limite mensal do plano.</p>
          @if (error(); as err) { <div class="error-banner">{{ err }}</div> }
          <div class="field-label">Motivo (opcional)</div>
          <input class="input-box" type="text" maxlength="120" placeholder="Ex.: quadra em manutenção" [value]="note()" (input)="note.set($any($event.target).value)" />
          <div class="modal-actions">
            <button type="button" class="ar-mini-btn" [disabled]="busy()" (click)="dialog.set(null)">Voltar</button>
            <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="busy()" (click)="grant()">{{ busy() ? 'Gerando…' : 'Dar reposição' }}</button>
          </div>
        </ar-modal>
      }
      @case ('end') {
        <ar-modal (close)="dialog.set(null)">
          <p class="modal-title">Encerrar plano de {{ s.holderName }}?</p>
          <p class="modal-sub">Hoje encerra já. Data futura vira "Sai em dd/mm" e o plano encerra no dia. O horário é liberado, mensalidades abertas de meses depois do fim são canceladas e, com a oferta automática ligada, a vaga vai para o 1º da lista de espera.</p>
          @if (error(); as err) { <div class="error-banner">{{ err }}</div> }
          <div class="field-label">Último dia</div>
          <input class="input-box" type="date" [min]="today" [value]="dateValue()" (input)="dateValue.set($any($event.target).value)" />
          <div class="field-label spaced">Motivo (opcional)</div>
          <input class="input-box" type="text" maxlength="120" [value]="note()" (input)="note.set($any($event.target).value)" />
          <div class="modal-actions">
            <button type="button" class="ar-mini-btn" [disabled]="busy()" (click)="dialog.set(null)">Voltar</button>
            <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="busy() || !dateValue() || dateValue() < today" (click)="end()">{{ busy() ? 'Encerrando…' : 'Encerrar plano' }}</button>
          </div>
        </ar-modal>
      }
    }

    @if (paying(); as c) {
      <ar-modal (close)="paying.set(null)">
        <p class="modal-title">Registrar pagamento</p>
        <p class="modal-sub">{{ c.payerName }} · {{ periodLabel(c) }} · {{ brl(c.amountReais) }}</p>
        @if (error(); as err) { <div class="error-banner">{{ err }}</div> }
        @if (voidsAutopay(c)) {
          <p class="hint warn">O débito automático desta mensalidade será cancelado.</p>
        }
        @if (voidsLink(c)) {
          <p class="hint warn">Esta mensalidade tem cobrança online: registrar o pagamento aqui cancela o link enviado ao atleta. Se ele pagar pelo link depois, o valor é estornado.</p>
        }
        <div class="field-label">Forma</div>
        <div class="chip-row">
          @for (m of methods; track m) {
            <button type="button" class="sm-chip" [class.active]="payMethod() === m" (click)="payMethod.set(m)">{{ methodLabel[m] }}</button>
          }
        </div>
        <div class="field-label spaced">Data do pagamento</div>
        <input class="input-box" type="date" [max]="today" [value]="dateValue()" (input)="dateValue.set($any($event.target).value)" />
        <p class="hint">O valor foi recebido direto pela arena — a plataforma só registra a baixa. Se zerar o atraso de um plano suspenso, ele volta sozinho.</p>
        <div class="modal-actions">
          <button type="button" class="ar-mini-btn" [disabled]="busy()" (click)="paying.set(null)">Cancelar</button>
          <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="busy() || !dateValue()" (click)="pay(c)">{{ busy() ? 'Salvando…' : 'Confirmar pagamento' }}</button>
        </div>
      </ar-modal>
    }

    @if (canceling(); as c) {
      <ar-modal (close)="canceling.set(null)">
        <p class="modal-title">Cancelar mensalidade?</p>
        <p class="modal-sub">{{ c.payerName }} · {{ periodLabel(c) }} · {{ brl(c.amountReais) }}. Ela sai do que o assinante deve e não volta a ser cobrada.</p>
        @if (error(); as err) { <div class="error-banner">{{ err }}</div> }
        @if (voidsAutopay(c)) {
          <p class="hint warn">O débito automático desta mensalidade será cancelado.</p>
        }
        @if (voidsLink(c)) {
          <p class="hint warn">O link online também é cancelado e deixa de valer.</p>
        }
        <div class="modal-actions">
          <button type="button" class="ar-mini-btn" [disabled]="busy()" (click)="canceling.set(null)">Voltar</button>
          <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="busy()" (click)="cancelCharge(c)">{{ busy() ? 'Cancelando…' : 'Cancelar mensalidade' }}</button>
        </div>
      </ar-modal>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .head { display: flex; align-items: center; gap: 12px; }
    .who { flex: 1; min-width: 0; }
    .name { font-family: var(--nx-font-display); font-weight: 700; font-size: 15px; color: var(--nx-text); }
    .meta, .mono-dim { font-family: var(--nx-font-mono); font-size: 10.5px; color: var(--nx-text-dim); }
    .meta { margin-top: 3px; }
    .slot { margin-top: 14px; padding: 12px; border-radius: 10px; background: var(--nx-surface-1); display: flex; align-items: center; gap: 12px; }
    .slot-time { font-family: var(--nx-font-mono); font-weight: 800; font-size: 20px; color: var(--nx-text); }
    .slot-text { font-size: 12.5px; color: var(--nx-text-mute); }
    .occ-head { display: flex; justify-content: space-between; margin: 16px 0 8px; }
    .kicker { font-family: var(--nx-font-mono); font-size: 9px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--nx-text-dim); }
    .occ-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(40px, 1fr)); gap: 4px; }
    .occ { padding: 8px 0; border-radius: 9px; text-align: center; border: 1px solid var(--nx-line); color: var(--nx-text); }
    .occ.done { background: var(--nx-surface-1); border-color: transparent; color: var(--nx-text-dim); }
    .occ.today { background: var(--nx-orange-500); border-color: transparent; color: #0a0a0a; }
    .occ.skip, .occ.makeup { background: rgba(244, 197, 67, 0.1); border-color: rgba(244, 197, 67, 0.3); color: var(--nx-pending); }
    .occ-w { font-family: var(--nx-font-mono); font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.75; }
    .occ-d { font-family: var(--nx-font-mono); font-size: 15px; font-weight: 800; margin-top: 2px; }
    .occ-l { font-size: 9px; margin-top: 2px; height: 11px; }
    .flush { margin: 0; grid-column: 1 / -1; }
    .charge { display: flex; align-items: center; gap: 10px; padding: 7px 0; }
    .charge-who { flex: 1; min-width: 0; display: flex; flex-direction: column; font-size: 12.5px; color: var(--nx-text-mute); }
    .charge-who small { font-family: var(--nx-font-mono); font-size: 10px; color: var(--nx-text-dim); }
    .amount { font-family: var(--nx-font-mono); font-size: 12px; color: var(--nx-text); }
    .charge-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 4px; margin: -4px 0 4px; }
    .online-state { margin-right: auto; padding-left: 34px; }
    .hint.warn { margin: 0 0 12px; color: var(--nx-pending); }
    .charge-actions .ar-ghost-btn { height: 26px; font-size: 11.5px; color: var(--nx-orange-500); }
    .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .actions .ar-mini-btn, .actions .ar-ghost-btn { justify-content: center; }
    .danger { color: var(--nx-live); border: 1px solid rgba(255, 59, 48, 0.3); }
    .notice { padding: 10px 14px; border-radius: var(--nx-r-2); background: rgba(43, 209, 126, 0.08); border: 1px solid rgba(43, 209, 126, 0.28); color: var(--nx-win); font-size: 12.5px; }
  `,
})
export class PhSubscriberDetailComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly destroyRef = inject(DestroyRef);

  readonly sub = input.required<ScheduleSubscription>();
  readonly state = input.required<SubscriberState>();
  readonly plan = input<SchedulePlan | null>(null);
  readonly readOnly = input(false);

  protected readonly brl = brl;
  protected readonly shortDate = shortDate;
  protected readonly monthYear = monthYear;
  protected readonly cycleLabel = CYCLE_LABEL;
  protected readonly weekdays = WEEKDAYS;
  protected readonly dayShort = WEEKDAY_SHORT;
  protected readonly methods = MANUAL_METHODS;
  protected readonly methodLabel = MANUAL_METHOD_LABEL;
  protected readonly today = todayKeyLocal();
  protected readonly tomorrow = addDaysKey(this.today, 1);

  protected readonly charges = signal<ScheduleCharge[]>([]);
  protected readonly rawOccurrences = signal<PlanOccurrence[]>([]);
  protected readonly credits = signal<ScheduleCredit[]>([]);
  protected readonly dialog = signal<Dialog | null>(null);
  protected readonly paying = signal<ScheduleCharge | null>(null);
  protected readonly canceling = signal<ScheduleCharge | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);
  protected readonly newDays = signal<number[]>([]);
  protected readonly newTime = signal('');
  protected readonly dateValue = signal('');
  protected readonly note = signal('');
  protected readonly payMethod = signal<ScheduleManualMethod>('pix');
  protected readonly copied = signal<string | null>(null);

  protected readonly slotText = computed(() => {
    const s = this.sub();
    const days = [...s.slots].sort((a, b) => a.weekday - b.weekday).map((x) => WEEKDAY_LONG[x.weekday]!.toLowerCase());
    const dayText = days.length <= 1 ? days.join('') : `${days.slice(0, -1).join(', ')} e ${days[days.length - 1]}`;
    const text = `${dayText.charAt(0).toUpperCase()}${dayText.slice(1)} · ${slotCourtsLabel(s.slots)} · ${durationLabel(s.durationMinutes)}`;
    return s.slots.length ? text : 'Sem horário (plano suspenso ou encerrado)';
  });
  protected readonly planWindow = computed(() => windowsLabel(this.plan()?.windows ?? []));

  /** Ocorrências do mês corrente; perto do fim do mês, as do próximo. */
  private readonly occMonthKey = computed(() => {
    const month = this.today.slice(0, 7);
    const occ = this.rawOccurrences();
    const left = occ.filter((o) => o.dateKey.startsWith(month) && o.dateKey >= this.today).length;
    if (left > 0 || occ.every((o) => o.dateKey < month)) return month;
    return addDaysKey(`${month}-28`, 7).slice(0, 7);
  });
  protected readonly occMonth = computed(() => {
    const [y, m] = this.occMonthKey().split('-').map(Number);
    return monthLong(new Date(y!, m! - 1, 1));
  });
  protected readonly occurrences = computed(() =>
    this.rawOccurrences()
      // Liberadas pelo sistema (pausa, troca de horário, saída) não são "Não vai": saem da grade.
      .filter((o) => o.dateKey.startsWith(this.occMonthKey()) && occurrenceOutcome(o, this.today) !== null)
      .slice(0, 12)
      .map((o) => {
        // Reserva cancelada pode vir `cancelled` (reposição/aviso do atleta) ou `canceled`.
        const canceled = o.status.toLowerCase().startsWith('cancel');
        const kind: OccKind = o.makeup ? 'makeup' : canceled ? 'skip' : o.dateKey === this.today ? 'today' : o.dateKey < this.today ? 'done' : 'next';
        const [, , d] = o.dateKey.split('-');
        return { id: o.id, kind, day: d ?? '', weekday: WEEKDAY_SHORT[isoWeekdayOf(o.dateKey)] ?? '', label: OCC_LABEL[kind] };
      }),
  );
  /** Abertas de qualquer mês + as do mês corrente (pagas), pagador por pagador. */
  protected readonly visibleCharges = computed(() => {
    const period = this.today.slice(0, 7);
    return this.charges()
      .filter((c) => c.status === 'open' || (c.status === 'paid' && c.period <= period && (c.coversThrough ?? c.period) >= period))
      .sort((a, b) => a.period.localeCompare(b.period) || a.payerIndex - b.payerIndex);
  });
  protected readonly nextDue = computed(() => this.visibleCharges().filter((c) => c.status === 'open').map((c) => c.dueDate).sort()[0] ?? null);

  constructor() {
    let unsubs: Unsubscribe[] = [];
    effect(() => {
      const id = this.sub().id;
      const arenaId = this.sub().arenaId || this.arenaContext.arenaId();
      for (const u of unsubs) u();
      this.charges.set([]);
      this.rawOccurrences.set([]);
      this.credits.set([]);
      this.message.set(null);
      if (!arenaId) return;
      const db = arenaFirestore();
      unsubs = [
        watchSubscriptionCharges(db, arenaId, id, (c) => this.charges.set(c)),
        watchSubscriptionOccurrences(db, arenaId, id, (o) => this.rawOccurrences.set(o)),
        watchSubscriptionCredits(db, arenaId, id, (c) => this.credits.set(c)),
      ];
    });
    this.destroyRef.onDestroy(() => unsubs.forEach((u) => u()));
  }

  protected periodLabel(c: ScheduleCharge): string {
    if (c.coversThrough && c.coversThrough > c.period) {
      return `Anual à vista · ${monthYear(c.period)} a ${monthYear(c.coversThrough)} · vence ${shortDate(c.dueDate)}`;
    }
    const kind = c.kind === 'first' ? '1ª mensalidade' : c.kind === 'resume' ? 'Volta da pausa' : 'Mensalidade';
    return `${kind} · ${monthYear(c.period)} · vence ${shortDate(c.dueDate)}`;
  }

  protected onlineBadge(c: ScheduleCharge): OnlineChargeBadge | null {
    return onlineChargeBadge(c);
  }

  protected invoiceUrl(c: ScheduleCharge): string | null {
    return onlineChargeInvoiceUrl(c);
  }

  protected voidsAutopay(c: ScheduleCharge): boolean {
    return chargeVoidsAutopay(c);
  }

  protected hasAutopay(s: ScheduleSubscription, c: ScheduleCharge): boolean {
    return !!c.payerAthleteId && s.autopayPayers.includes(c.payerAthleteId);
  }

  protected voidsLink(c: ScheduleCharge): boolean {
    return chargeVoidsOnlineLink(c);
  }

  protected copyLink(url: string): void {
    // Clipboard indisponível (contexto não seguro/permissão): sem fallback, como nas Aulas.
    void navigator.clipboard?.writeText(url).then(() => this.copied.set(url), () => undefined);
  }

  protected openDialog(kind: Dialog): void {
    const s = this.sub();
    this.error.set(null);
    this.note.set('');
    this.dateValue.set(kind === 'end' ? this.today : kind === 'pause' ? addDaysKey(this.today, 15) : '');
    if (kind === 'change') {
      this.newDays.set(s.slots.map((x) => x.weekday).sort((a, b) => a - b));
      this.newTime.set(s.slots[0]?.startTime ?? '');
    }
    this.dialog.set(kind);
  }

  protected openPay(c: ScheduleCharge): void {
    this.error.set(null);
    this.payMethod.set('pix');
    this.dateValue.set(this.today);
    this.paying.set(c);
  }

  protected toggleDay(d: number): void {
    this.newDays.update((days) => (days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => a - b)));
  }

  protected changeSlots(): Promise<void> {
    const time = this.newTime();
    return this.run(async (fn) => {
      const res = await changeScheduleSlots(fn, this.sub().id, this.newDays(), time);
      const skipped = res.skippedDates?.length ?? 0;
      return `Novo horário na ${res.courtName}${skipped ? ` · ${skipped} data${skipped === 1 ? '' : 's'} pulada${skipped === 1 ? '' : 's'} por reserva avulsa` : ''}.`;
    }, !!time);
  }

  protected pause(): Promise<void> {
    return this.run(async (fn) => {
      const res = await pauseScheduleSubscription(fn, this.sub().id, this.dateValue());
      return `Pausado até ${shortDate(res.pausedUntil)}. Restam ${res.daysLeft} dias de pausa no ano.`;
    });
  }

  protected resume(): Promise<void> {
    return this.run(async (fn) => {
      await resumeScheduleSubscription(fn, this.sub().id);
      return 'Plano retomado.';
    });
  }

  protected grant(): Promise<void> {
    return this.run(async (fn) => {
      await grantScheduleMakeup(fn, this.sub().id, this.note().trim() || undefined);
      return 'Reposição criada para o assinante.';
    });
  }

  protected end(): Promise<void> {
    return this.run(async (fn) => {
      const res = await endScheduleSubscription(fn, this.sub().id, this.dateValue(), this.note().trim() || undefined);
      return res.endsOn && res.endsOn > this.today ? `Plano encerra em ${shortDate(res.endsOn)}.` : 'Plano encerrado.';
    });
  }

  protected pay(c: ScheduleCharge): Promise<void> {
    return this.run(async (fn) => {
      const res = await registerSchedulePayment(fn, c.id, this.payMethod(), this.dateValue());
      return res.reactivated ? 'Pagamento registrado — o plano voltou a valer.' : 'Pagamento registrado.';
    });
  }

  protected cancelCharge(c: ScheduleCharge): Promise<void> {
    return this.run(async (fn) => {
      await cancelScheduleCharge(fn, c.id);
      return 'Mensalidade cancelada.';
    });
  }

  private async run(action: (fn: ReturnType<typeof arenaFunctions>) => Promise<string>, ok = true): Promise<void> {
    if (this.readOnly() || !ok) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const msg = await action(arenaFunctions());
      this.dialog.set(null);
      this.paying.set(null);
      this.canceling.set(null);
      this.message.set(msg);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível concluir a operação.');
    } finally {
      this.busy.set(false);
    }
  }
}

