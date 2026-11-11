import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { shortDate, todayKeyLocal } from '../aulas/class.model';
import { bookingAllocationFromArena } from '../courts/booking-allocation';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFunctions } from '../data/functions';
import { IconComponent } from '../ui/icon.component';
import { ModalComponent } from '../ui/modal.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PillComponent } from '../ui/pill.component';
import { brl, monthLong, weekdayDayMonth, weekdayShortDate } from './ph-format';
import { PhRulesModalComponent } from './ph-rules-modal.component';
import {
  PhBarComponent,
  PhIconBoxComponent,
  PhLineComponent,
  PhPageComponent,
  PhStatComponent,
  type PhIconName,
  type PhTone,
} from './planos-horario-ui';
import {
  DAY_GROUP_DAYS,
  bandOccupancy,
  bandPluralTitle,
  durationLabel,
  holdsSlot,
  holidayImpact,
  nextChargeSummary,
  planEconomy,
  primeCommitment,
  upcomingHolidays,
  waitlistKey,
  windowsLabel,
} from './schedule-plan.logic';
import { PAYMENT_FORM_LABEL, WEEKDAY_SHORT, type SchedulePlan } from './schedule-plan.model';
import { applyScheduleHoliday } from './schedule-plan-repository';
import { SchedulePlansStore } from './schedule-plans.store';

interface PlanCardView {
  plan: SchedulePlan;
  window: string;
  chips: string[];
  subscribers: number;
  revenue: number;
  discount: number | null;
}

interface AlertView {
  icon: PhIconName;
  tone: PhTone;
  title: string;
  sub: string;
  cta: string;
  route?: string;
  query?: Record<string, string>;
  holiday?: { date: string; name: string; total: number; makeup: number };
}

/** 01 · Planos — catálogo de planos de horário com os números do mês, a próxima cobrança e o que
 *  precisa do gestor (atrasos, feriado chegando, vaga abrindo). */
@Component({
  selector: 'ar-panel-ph-plans',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PhPageComponent, PhStatComponent, PhLineComponent, PhBarComponent, PhIconBoxComponent, PhRulesModalComponent,
    PanelCardComponent, PillComponent, IconComponent, ModalComponent, RouterLink,
  ],
  styleUrl: './planos-horario.scss',
  template: `
    <ar-ph-page subtitle="Horário fixo toda semana · cobrança recorrente" tab="planos" [empty]="!store.loading() && store.plans().length === 0">
      <div page-actions class="actions">
        <button type="button" class="ar-mini-btn" [disabled]="readOnly()" (click)="rulesOpen.set(true)">
          <ar-icon name="gear" [size]="13" /> Regras gerais
        </button>
        <a class="ar-mini-btn ar-mini-btn-primary" [class.disabled]="readOnly()" [routerLink]="readOnly() ? null : '/painel/planos-horario/novo'">
          <ar-icon name="plus" [size]="14" /> Novo plano
        </a>
      </div>

      @if (store.loading()) {
        <p class="state-text">Carregando planos…</p>
      } @else if (store.loadError(); as err) {
        <p class="state-text">{{ err }}</p>
      } @else {
        @if (notice(); as n) {
          <div class="notice">{{ n }}</div>
        }
        <div class="stats">
          <ar-ph-stat label="Assinantes ativos" [value]="'' + activeCount()" [sub]="activeSub()" />
          <ar-ph-stat label="Receita recorrente" [value]="brl(mrr())" sub="por mês, antes do mês começar" />
          <ar-ph-stat label="Horário nobre comprometido" [value]="prime().percent + '%'" [tone]="prime().percent >= capPercent() ? 'yellow' : 'default'" [sub]="'limite para planos: ' + capPercent() + '%'" />
          <ar-ph-stat label="Em atraso" [value]="'' + late().count" [tone]="late().count > 0 ? 'yellow' : 'default'" [sub]="late().count > 0 ? brl(late().amount) + ' vencido' : 'ninguém em atraso'" />
        </div>

        <div class="main">
          <div class="cards">
            @for (c of cards(); track c.plan.id) {
              <a class="plan" [class.draft]="c.plan.status === 'draft'" [routerLink]="['/painel/planos-horario', c.plan.id]">
                <div class="plan-head">
                  <div class="plan-titles">
                    <div class="plan-name">{{ c.plan.name }}</div>
                    <div class="plan-window">{{ c.window }}</div>
                  </div>
                  @if (c.plan.status === 'draft') {
                    <ar-pill tone="dim">Rascunho</ar-pill>
                  } @else {
                    <ar-pill tone="green">À venda</ar-pill>
                  }
                </div>
                <div class="price-row">
                  <span class="price">{{ brl(c.plan.monthlyPriceReais) }}</span>
                  <span class="per">/mês</span>
                  @if (c.discount != null && c.discount > 0) {
                    <span class="off">−{{ c.discount }}% vs avulso</span>
                  }
                </div>
                <div class="chip-row">
                  @for (t of c.chips; track $index) {
                    <span class="sm-chip" [title]="t">{{ t }}</span>
                  }
                </div>
                <div class="plan-foot">
                  <div class="foot-row">
                    <span><b>{{ c.subscribers }}</b> de {{ c.plan.capacity }} vagas</span>
                    <span class="mono">{{ c.plan.status === 'draft' ? '—' : brl(c.revenue) + '/mês' }}</span>
                  </div>
                  <ar-ph-bar [v]="c.subscribers" [max]="c.plan.capacity" [color]="c.plan.capacity > 0 && c.subscribers / c.plan.capacity > 0.75 ? 'var(--nx-orange-500)' : 'rgba(255,106,26,0.55)'" />
                </div>
              </a>
            } @empty {
              <div class="plan empty-card">
                <div class="plan-name">Nenhum plano ainda</div>
                <p class="hint">Crie o primeiro plano: escolha os dias e horários que o atleta pode garantir toda semana, o preço e as regras.</p>
              </div>
            }
            @if (suggestion(); as s) {
              <div class="suggest">
                <ar-ph-icon-box icon="trend" tone="green" [size]="32" />
                <div class="suggest-title">{{ s.title }}</div>
                <div class="suggest-text">{{ s.text }}</div>
                <a class="cta green" [routerLink]="readOnly() ? null : '/painel/planos-horario/novo'" [queryParams]="s.query">Criar plano sugerido →</a>
              </div>
            }
          </div>

          <div class="side">
            <ar-panel-card title="Próxima cobrança" [kicker]="next() ? weekdayDayMonth(next()!.dueDate) : 'Mensalidades'">
              @if (next(); as n) {
                <div class="big-row"><span class="big">{{ brl(n.totalReais) }}</span><span class="dim">{{ n.count }} cobrança{{ n.count === 1 ? '' : 's' }}</span></div>
                <div class="lines">
                  <ar-ph-line [k]="formLabel.pix_auto" [v]="'' + n.byForm.pix_auto" />
                  <ar-ph-line [k]="formLabel.card" [v]="'' + n.byForm.card" />
                  <ar-ph-line [k]="formLabel.onsite" [v]="'' + n.byForm.onsite" />
                  <ar-ph-line k="Rateio entre jogadores" [v]="n.splitGroups + ' grupo' + (n.splitGroups === 1 ? '' : 's')" />
                </div>
              } @else {
                <p class="state-text">Nenhuma mensalidade em aberto.</p>
              }
              <p class="hint">
                {{ store.settings().onlineBillingEnabled
                  ? 'Pix e cartão saem por link online, pago pelo app. Na arena segue com baixa manual.'
                  : 'Cobrança online desligada: a baixa é manual. Dá para ligar nas Regras gerais.' }}
              </p>
            </ar-panel-card>

            <ar-panel-card title="Precisa de você">
              @for (a of alerts(); track a.title; let last = $last) {
                <div class="alert" [class.last]="last">
                  <ar-ph-icon-box [icon]="a.icon" [tone]="a.tone" [size]="32" />
                  <div class="alert-body">
                    <div class="alert-title">{{ a.title }}</div>
                    <div class="alert-sub">{{ a.sub }}</div>
                    @if (a.holiday) {
                      <button type="button" class="cta" [disabled]="readOnly()" (click)="holiday.set(a.holiday)">{{ a.cta }} →</button>
                    } @else {
                      <a class="cta" [routerLink]="a.route" [queryParams]="a.query ?? null">{{ a.cta }} →</a>
                    }
                  </div>
                </div>
              } @empty {
                <p class="state-text">Nada pendente agora.</p>
              }
            </ar-panel-card>
          </div>
        </div>
      }
    </ar-ph-page>

    @if (rulesOpen()) {
      <ar-ph-rules-modal [settings]="store.settings()" (close)="rulesOpen.set(false)" (saved)="notice.set('Regras gerais salvas.')" />
    }

    @if (holiday(); as h) {
      <ar-modal (close)="holiday.set(null)">
        <p class="modal-title">{{ weekdayShortDate(h.date) }} · {{ h.name }}</p>
        <p class="modal-sub">
          Marcar o dia como feriado cancela as {{ h.total }} ocorrência{{ h.total === 1 ? '' : 's' }} de plano da data.
          Nos planos com "Feriado vira reposição", cada assinante ganha um crédito ({{ h.makeup }} no total). Planos
          "Joga normal" não são afetados.
        </p>
        @if (holidayError(); as err) {
          <div class="error-banner">{{ err }}</div>
        }
        <div class="modal-actions">
          <button type="button" class="ar-mini-btn" [disabled]="busy()" (click)="holiday.set(null)">Agora não</button>
          <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="busy()" (click)="applyHoliday(h.date)">
            {{ busy() ? 'Aplicando…' : 'Marcar feriado' }}
          </button>
        </div>
      </ar-modal>
    }
  `,
  styles: `
    @use 'breakpoints' as ar;
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .actions a.disabled { opacity: 0.5; pointer-events: none; }
    .notice { padding: 10px 14px; border-radius: var(--nx-r-2); background: rgba(43, 209, 126, 0.08); border: 1px solid rgba(43, 209, 126, 0.28); color: var(--nx-win); font-size: 12.5px; }
    .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; flex: none; }
    .main { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 16px; align-items: start; }
    .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px; min-width: 0; }
    .plan {
      padding: 18px; border-radius: var(--nx-r-4); background: var(--nx-surface-0); border: 1px solid var(--nx-line);
      display: flex; flex-direction: column; gap: 14px; min-width: 0; text-decoration: none; color: inherit;
      transition: border-color 140ms var(--nx-ease-out);
    }
    a.plan:hover { border-color: rgba(255, 106, 26, 0.45); }
    .plan.draft { border-style: dashed; border-color: var(--nx-line-strong); }
    .plan-head { display: flex; align-items: flex-start; gap: 10px; }
    .plan-titles { flex: 1; min-width: 0; }
    .plan-name { font-family: var(--nx-font-display); font-weight: 700; font-size: 15.5px; color: var(--nx-text); overflow-wrap: anywhere; }
    .plan-window { font-family: var(--nx-font-mono); font-size: 10.5px; color: var(--nx-text-dim); margin-top: 4px; }
    .price-row { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
    .price { font-family: var(--nx-font-mono); font-weight: 800; font-size: 24px; letter-spacing: -0.02em; color: var(--nx-text); }
    .per, .dim { font-size: 12px; color: var(--nx-text-dim); }
    .off { margin-left: auto; font-family: var(--nx-font-mono); font-size: 10.5px; font-weight: 700; color: var(--nx-win); }
    /* Chip nunca passa da largura do card: nome de quadra gigante corta com "…" (o title mostra inteiro). */
    .plan .sm-chip { display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; line-height: 24px; box-sizing: border-box; }
    .plan-foot { margin-top: auto; }
    .foot-row { display: flex; justify-content: space-between; gap: 8px; font-size: 11.5px; color: var(--nx-text-mute); margin-bottom: 7px; }
    .foot-row b, .mono { font-family: var(--nx-font-mono); color: var(--nx-text); font-weight: 700; }
    .suggest {
      padding: 18px; border-radius: var(--nx-r-4); background: rgba(43, 209, 126, 0.05); border: 1px solid rgba(43, 209, 126, 0.22);
      display: flex; flex-direction: column; gap: 10px;
    }
    .suggest-title { font-family: var(--nx-font-display); font-weight: 700; font-size: 13.5px; color: var(--nx-text); }
    .suggest-text { font-size: 12px; color: var(--nx-text-dim); line-height: 1.5; }
    .cta.green { margin-top: auto; color: var(--nx-win); }
    .side { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .big-row { display: flex; align-items: baseline; gap: 8px; }
    .big { font-family: var(--nx-font-mono); font-weight: 800; font-size: 26px; color: var(--nx-text); }
    .lines { display: flex; flex-direction: column; gap: 9px; margin-top: 14px; }
    .alert { display: flex; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--nx-line); }
    .alert:first-child { padding-top: 0; }
    .alert.last { border-bottom: none; padding-bottom: 0; }
    .alert-body { flex: 1; min-width: 0; }
    .alert-title { font-family: var(--nx-font-display); font-weight: 700; font-size: 12.5px; color: var(--nx-text); }
    .alert-sub { font-size: 11.5px; color: var(--nx-text-dim); margin-top: 3px; line-height: 1.45; }
    .alert .cta { display: inline-block; margin-top: 7px; }
    @include ar.below(lg) {
      .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .main { grid-template-columns: minmax(0, 1fr); }
    }
    @include ar.below(xs) {
      .stats { grid-template-columns: minmax(0, 1fr); }
    }
  `,
})
export class PanelPhPlansComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly access = inject(ArenaAccessService);
  protected readonly store = inject(SchedulePlansStore);

  protected readonly brl = brl;
  protected readonly weekdayDayMonth = weekdayDayMonth;
  protected readonly weekdayShortDate = weekdayShortDate;
  protected readonly formLabel = PAYMENT_FORM_LABEL;
  protected readonly readOnly = computed(() => !this.access.canWrite('agenda') || !this.arenaContext.hasCapability('planosHorario'));

  /** "A arena define a quadra": o plano não prende quadra, então o card não mostra nenhuma. */
  private readonly capacityMode = computed(() => bookingAllocationFromArena(this.arenaContext.arenaDocData()).mode === 'capacity');

  protected readonly rulesOpen = signal(false);
  protected readonly holiday = signal<AlertView['holiday'] | null>(null);
  protected readonly holidayError = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly notice = signal<string | null>(null);

  private readonly today = todayKeyLocal();

  protected readonly capPercent = computed(() => this.store.settings().primeCapPercent);
  protected readonly activeSubs = computed(() => this.store.subscriptions().filter((s) => s.status === 'active'));
  protected readonly activeCount = computed(() => this.activeSubs().length);
  protected readonly activeSub = computed(() => {
    const month = this.today.slice(0, 7);
    const fresh = this.store.subscriptions().filter((s) => s.startDate.startsWith(month)).length;
    const leaving = this.store.subscriptions().filter((s) => s.endsOn).length;
    const paused = this.store.subscriptions().filter((s) => s.status === 'paused').length;
    return [`+${fresh} em ${monthLong()}`, leaving ? `${leaving} saindo` : '', paused ? `${paused} pausado${paused === 1 ? '' : 's'}` : '']
      .filter(Boolean)
      .join(' · ');
  });
  protected readonly mrr = computed(() => this.activeSubs().reduce((s, sub) => s + sub.monthlyPriceReais, 0));
  protected readonly prime = computed(() =>
    primeCommitment(this.store.settings().primeWindows, this.store.activeCourts().length, this.store.subscriptions()),
  );
  protected readonly late = computed(() => {
    const states = this.store.states();
    const lateSubs = this.store.subscriptions().filter((s) => {
      const k = states.get(s.id)?.kind;
      return k === 'late' || k === 'suspended';
    });
    const amount = this.store.openCharges().filter((c) => c.dueDate < this.today).reduce((s, c) => s + c.amountReais, 0);
    return { count: lateSubs.length, amount, names: lateSubs.map((s) => s.holderName) };
  });

  protected readonly cards = computed<PlanCardView[]>(() => {
    const subs = this.store.subscriptions().filter(holdsSlot);
    return this.store.visiblePlans().map((plan) => {
      const mine = subs.filter((s) => s.planId === plan.id);
      return {
        plan,
        window: windowsLabel(plan.windows),
        chips: [
          ...(plan.bookingMode === 'flexible' ? ['Horário livre', `até ${plan.timesPerWeek}x por semana`] : [`${plan.timesPerWeek}x por semana`]),
          durationLabel(plan.durationMinutes),
          ...this.courtsChips(plan),
        ],
        subscribers: mine.length,
        revenue: mine.reduce((s, sub) => s + sub.monthlyPriceReais, 0),
        discount: planEconomy(plan)?.discountPercent ?? null,
      };
    });
  });

  /** Faixa mais vazia (ocupação por planos fixos) vira o card de sugestão. */
  protected readonly suggestion = computed(() => {
    const courts = this.store.activeCourts().length;
    if (courts === 0 || this.readOnly()) return null;
    const emptiest = bandOccupancy(this.store.subscriptions(), courts)[0];
    if (!emptiest || emptiest.percent >= 30) return null;
    const title = `${bandPluralTitle(emptiest)} ${emptiest.percent < 10 ? 'estão vazias' : 'têm espaço'}`;
    const text =
      `Só ${emptiest.percent}% das horas-quadra de ${emptiest.label} estão com planos fixos. ` +
      'Um plano nessa faixa transforma horário que sobra em receita garantida todo mês.';
    return { title, text, query: { dias: DAY_GROUP_DAYS[emptiest.group].join(','), faixa: emptiest.band.id } };
  });

  protected readonly next = computed(() => nextChargeSummary(this.store.openCharges(), this.store.subById(), this.today));

  protected readonly alerts = computed<AlertView[]>(() => {
    const out: AlertView[] = [];
    const late = this.late();
    if (late.count > 0) {
      const names = late.names.slice(0, 2).join(late.names.length === 2 ? ' e ' : ', ');
      const more = late.count > 2 ? ` e mais ${late.count - 2}` : '';
      out.push({
        icon: 'alert', tone: 'yellow',
        title: `${late.count} assinante${late.count === 1 ? '' : 's'} em atraso`,
        sub: `${names}${more}. Lembretes de atraso saem por push no vencimento, em 1 e em 3 dias.`,
        cta: 'Ver assinantes', route: '/painel/planos-horario/assinantes', query: { filtro: 'atrasados' },
      });
    }
    const plans = this.store.planById();
    for (const h of upcomingHolidays(this.today, 30, this.store.settings().appliedHolidays)) {
      const impact = holidayImpact(h.date, this.store.subscriptions(), (id) => plans.get(id)?.rules.holiday ?? 'makeup');
      if (impact.total === 0) continue;
      out.push({
        icon: 'holiday', tone: 'orange',
        title: `${weekdayShortDate(h.date)} é feriado`,
        sub: `${h.name}. ${impact.total} horário${impact.total === 1 ? '' : 's'} fixo${impact.total === 1 ? '' : 's'} cai${impact.total === 1 ? '' : 'em'} no dia` +
          (impact.makeup > 0 ? `; pela regra, ${impact.makeup} vira${impact.makeup === 1 ? '' : 'm'} reposição.` : '.'),
        cta: 'Revisar', holiday: { ...h, ...impact },
      });
    }
    const waiting = this.store.waitlist();
    for (const sub of this.store.subscriptions().filter((s) => s.endsOn && s.status !== 'canceled').slice(0, 3)) {
      const slot = sub.slots[0];
      if (!slot) continue;
      const queue = waiting.filter((w) => w.weekdays.includes(slot.weekday) && w.startTime === slot.startTime).length;
      out.push({
        icon: 'queue', tone: 'green',
        title: `Vaga abrindo na ${WEEKDAY_SHORT[slot.weekday]} ${slot.startTime}`,
        sub: `${sub.holderName} ${sub.endRequestedBy === 'athlete' ? 'cancelou pelo app e sai' : 'sai'} em ${shortDate(sub.endsOn!)}. ` +
          (queue > 0 ? `Há ${queue} pessoa${queue === 1 ? '' : 's'} na lista de espera.` : 'Ninguém na lista de espera desse horário.'),
        cta: queue > 0 ? 'Ver lista de espera' : 'Ver assinantes',
        route: queue > 0 ? '/painel/planos-horario/espera' : '/painel/planos-horario/assinantes',
        query: queue > 0 ? { horario: waitlistKey([slot.weekday], slot.startTime) } : { filtro: 'saindo' },
      });
    }
    return out;
  });

  /** Um chip por quadra (até 2): nomes emendados num chip só estouravam o card com nome longo.
   *  Na arena que define a quadra não há quadra do plano pra mostrar (nem a de plano antigo). */
  private courtsChips(plan: SchedulePlan): string[] {
    if (this.capacityMode()) return [];
    const n = plan.courtIds.length;
    if (n === 0) return ['Sem quadra'];
    const all = this.store.activeCourts();
    if (all.length > 1 && all.every((c) => plan.courtIds.includes(c.id))) return ['Todas as quadras'];
    if (n <= 2) return plan.courtNames.length > 0 ? [...plan.courtNames] : [`${n} quadra${n === 1 ? '' : 's'}`];
    return [`${n} quadras`];
  }

  protected async applyHoliday(date: string): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId || this.readOnly()) return;
    this.busy.set(true);
    this.holidayError.set(null);
    try {
      const res = await applyScheduleHoliday(arenaFunctions(), arenaId, date);
      this.holiday.set(null);
      this.notice.set(
        `Feriado aplicado: ${res.canceled} horário${res.canceled === 1 ? '' : 's'} cancelado${res.canceled === 1 ? '' : 's'}` +
          (res.credits > 0 ? ` e ${res.credits} reposiç${res.credits === 1 ? 'ão gerada' : 'ões geradas'}.` : '.'),
      );
    } catch (err) {
      this.holidayError.set(err instanceof Error ? err.message : 'Não foi possível aplicar o feriado.');
    } finally {
      this.busy.set(false);
    }
  }
}
