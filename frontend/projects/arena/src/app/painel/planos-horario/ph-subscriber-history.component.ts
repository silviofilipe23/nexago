import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { shortDate, todayKeyLocal } from '../aulas/class.model';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PillComponent } from '../ui/pill.component';
import { brl, monthYear, weekdayShortDate } from './ph-format';
import type { PlanOccurrence, ScheduleCharge, ScheduleCredit, SchedulePlan, ScheduleSubscription } from './schedule-plan.model';
import { buildSubscriberHistory, type OccurrenceOutcome } from './subscriber-history';

const MONTHS_COLLAPSED = 4;

const OUTCOME_TITLE: Record<OccurrenceOutcome, string> = {
  played: 'Jogou',
  noshow: 'Faltou',
  skip: 'Avisou que não ia',
  arena: 'Cancelado pela arena',
  makeup: 'Reposição',
  next: 'A jogar',
};

/** Histórico do assinante no plano: dinheiro, presença, reposições, pausa e o mês a mês. */
@Component({
  selector: 'ar-ph-subscriber-history',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelCardComponent, PillComponent],
  template: `
    @let h = history();
    <ar-panel-card title="Histórico no plano" [kicker]="tenure()">
      <div class="kpis">
        <div class="kpi">
          <span class="k">Total pago</span>
          <span class="v">{{ brl(h.paidTotal) }}</span>
          <span class="s">{{ h.paidCount }} mensalidade{{ h.paidCount === 1 ? '' : 's' }} · {{ h.openCount ? brl(h.openTotal) + ' em aberto' : 'nada em aberto' }}</span>
        </div>
        <div class="kpi">
          <span class="k">Pontualidade</span>
          <span class="v" [class]="'v ' + tone(h.punctualityPercent)">{{ h.punctualityPercent === null ? '—' : h.punctualityPercent + '%' }}</span>
          <span class="s">{{ punctualityText() }}</span>
        </div>
        <div class="kpi">
          <span class="k">Presença</span>
          <span class="v" [class]="'v ' + tone(h.attendancePercent)">{{ h.attendancePercent === null ? '—' : h.attendancePercent + '%' }}</span>
          <span class="s">{{ attendanceText() }}</span>
        </div>
        <div class="kpi">
          <span class="k">Reposições</span>
          <span class="v">{{ h.credits.total }}</span>
          <span class="s">{{ creditsText() }}</span>
        </div>
      </div>

      <dl class="facts">
        <div><dt>Como entrou</dt><dd>{{ h.sourceLabel }}</dd></div>
        <div><dt>Último jogo</dt><dd>{{ h.lastPlayed ? weekdayShortDate(h.lastPlayed.dateKey) + ' · ' + h.lastPlayed.startTime : 'ainda não jogou' }}</dd></div>
        @if (h.arenaCanceled > 0) {
          <div><dt>Cancelados pela arena</dt><dd>{{ h.arenaCanceled }}{{ h.holidays ? ' (' + h.holidays + ' feriado' + (h.holidays === 1 ? '' : 's') + ')' : '' }}</dd></div>
        }
        @if (pauseLimit(); as max) {
          <div><dt>Pausa em {{ year }}</dt><dd>{{ h.pauseDaysThisYear }} de {{ max }} dias</dd></div>
        }
        <div><dt>Fidelidade</dt><dd>{{ sub().commitmentEndsOn ? 'até ' + fullDate(sub().commitmentEndsOn!) : 'sem fidelidade' }}</dd></div>
      </dl>

      <div class="mhead"><span>Mês a mês</span><span>jogos · mensalidade</span></div>
      @for (m of visibleMonths(); track m.period) {
        <div class="month">
          <div class="mline">
            <span class="mm">{{ monthYear(m.period) }}</span>
            @if (m.payment; as p) {
              <ar-pill [tone]="p.tone">{{ p.label }}</ar-pill>
            } @else {
              <span class="nopay">sem mensalidade</span>
            }
          </div>
          <div class="msum">
            @if (m.outcomes.length) {
              <span class="dots" aria-hidden="true">
                @for (o of m.outcomes; track $index) {
                  <i [class]="'dot ' + o" [title]="outcomeTitle[o]"></i>
                }
              </span>
            }
            <span>{{ m.summary }}</span>
          </div>
        </div>
      }
      <div class="legend" aria-hidden="true">
        <span><i class="dot played"></i>jogou</span>
        <span><i class="dot skip"></i>avisou</span>
        <span><i class="dot noshow"></i>faltou</span>
        <span><i class="dot makeup"></i>reposição</span>
        <span><i class="dot arena"></i>arena</span>
      </div>
      @if (h.months.length > collapsed) {
        <button type="button" class="more" (click)="expanded.set(!expanded())">
          {{ expanded() ? 'Mostrar só os últimos meses' : 'Ver os ' + h.months.length + ' meses' }}
        </button>
      }
    </ar-panel-card>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .kpis { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .kpi { display: flex; flex-direction: column; gap: 3px; padding: 11px 12px; border-radius: 12px; background: var(--nx-surface-1); min-width: 0; }
    .k, .mhead { font-family: var(--nx-font-mono); font-size: 9px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--nx-text-dim); }
    .v { font-family: var(--nx-font-display); font-weight: 800; font-size: 19px; color: var(--nx-text); }
    .v.good { color: var(--nx-win); }
    .v.warn { color: var(--nx-pending); }
    .v.bad { color: var(--nx-live); }
    .s { font-size: 11px; line-height: 1.35; color: var(--nx-text-mute); }
    .facts { margin: 12px 0 0; }
    .facts div { display: flex; justify-content: space-between; gap: 12px; padding: 7px 0; border-bottom: 1px solid var(--nx-line); font-size: 12.5px; }
    .facts dt { color: var(--nx-text-mute); }
    .facts dd { margin: 0; color: var(--nx-text); font-weight: 600; text-align: right; }
    .mhead { display: flex; justify-content: space-between; margin: 16px 0 4px; }
    .month { padding: 8px 0; border-bottom: 1px solid var(--nx-line); }
    .mline { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .mm { font-family: var(--nx-font-mono); font-size: 11.5px; font-weight: 700; color: var(--nx-text); }
    .nopay { font-size: 11px; color: var(--nx-text-dim); }
    .msum { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin-top: 6px; font-size: 11.5px; color: var(--nx-text-mute); }
    .dots { display: flex; flex-wrap: wrap; gap: 3px; }
    .dot { display: inline-block; width: 8px; height: 8px; border-radius: 2px; background: var(--nx-win); }
    .dot.skip { background: var(--nx-pending); }
    .dot.noshow { background: var(--nx-live); }
    .dot.makeup { background: #5b9bff; }
    .dot.arena { background: transparent; box-shadow: inset 0 0 0 1.5px var(--nx-text-dim); }
    .dot.next { background: var(--nx-line-strong); }
    .legend { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 10px; font-size: 11px; color: var(--nx-text-dim); }
    .legend span { display: inline-flex; align-items: center; gap: 5px; }
    .more { display: block; width: 100%; margin-top: 10px; height: 34px; border-radius: var(--nx-r-2); background: transparent; border: 1px solid var(--nx-line-strong); color: var(--nx-orange-500); font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }
  `,
})
export class PhSubscriberHistoryComponent {
  readonly sub = input.required<ScheduleSubscription>();
  readonly plan = input<SchedulePlan | null>(null);
  readonly charges = input.required<ScheduleCharge[]>();
  readonly occurrences = input.required<PlanOccurrence[]>();
  readonly credits = input.required<ScheduleCredit[]>();

  protected readonly brl = brl;
  protected readonly monthYear = monthYear;
  protected readonly weekdayShortDate = weekdayShortDate;
  protected readonly outcomeTitle = OUTCOME_TITLE;
  protected readonly collapsed = MONTHS_COLLAPSED;
  private readonly today = todayKeyLocal();
  protected readonly year = this.today.slice(0, 4);
  protected readonly expanded = signal(false);

  protected readonly history = computed(() =>
    buildSubscriberHistory({
      sub: this.sub(),
      charges: this.charges(),
      occurrences: this.occurrences(),
      credits: this.credits(),
      todayKey: this.today,
    }),
  );
  protected readonly visibleMonths = computed(() => {
    const months = this.history().months;
    return this.expanded() ? months : months.slice(0, MONTHS_COLLAPSED);
  });
  protected readonly tenure = computed(() => {
    const s = this.sub();
    const n = this.history().monthsInPlan;
    if (n === 0) return s.startDate ? `começa em ${shortDate(s.startDate)}` : '';
    return `${n} ${n === 1 ? 'mês' : 'meses'} · desde ${monthYear(s.startDate)}`;
  });
  protected readonly pauseLimit = computed(() => {
    const rule = this.plan()?.rules.pause;
    return rule?.enabled ? rule.maxDaysPerYear : null;
  });
  protected readonly punctualityText = computed(() => {
    const h = this.history();
    if (h.punctualityPercent === null) return 'Nenhuma mensalidade venceu ainda';
    const parts = [`${h.onTimeCount} em dia`];
    if (h.paidLateCount) parts.push(`${h.paidLateCount} paga${h.paidLateCount === 1 ? '' : 's'} com atraso`);
    if (h.overdueOpenCount) parts.push(`${h.overdueOpenCount} vencida${h.overdueOpenCount === 1 ? '' : 's'}`);
    if (h.maxLateDays) parts.push(`até ${h.maxLateDays}d`);
    return parts.join(' · ');
  });
  protected readonly attendanceText = computed(() => {
    const h = this.history();
    const due = h.played + h.noShows + h.skips;
    if (due === 0) return 'Nenhum horário passado ainda';
    const parts = [`Jogou ${h.played} de ${due}`];
    if (h.skips) parts.push(`avisou ${h.skips}`);
    if (h.noShows) parts.push(`faltou ${h.noShows}`);
    return parts.join(' · ');
  });
  protected readonly creditsText = computed(() => {
    const c = this.history().credits;
    if (c.total === 0) return 'Nenhuma gerada';
    const parts = [`${c.used} usada${c.used === 1 ? '' : 's'}`];
    if (c.available) parts.push(`${c.available} para usar`);
    if (c.expired) parts.push(`${c.expired} venc${c.expired === 1 ? 'eu' : 'eram'}`);
    return parts.join(' · ');
  });

  protected tone(percent: number | null): string {
    if (percent === null) return '';
    return percent >= 85 ? 'good' : percent >= 60 ? 'warn' : 'bad';
  }

  protected fullDate(dateKey: string): string {
    const [y, m, d] = dateKey.split('-');
    return `${d}/${m}/${y}`;
  }
}
