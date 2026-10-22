import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { CenterContextService } from '../../core/center-context.service';
import { CenterStore } from '../../data/center-store.service';
import { formatDayKey, formatDayWithWeekday, greeting, monthKey, monthLabel, wallClock } from '../../domain/dates';
import { attendanceRate, moneySplit, occupancy, pct, tallyAttendance } from '../../domain/metrics';
import { formatBRL } from '../../domain/money';
import { IconComponent } from '../../ui/icon.component';
import { PageHeaderComponent, PersonComponent, StatComponent } from '../../ui/kit';
import { SubscriptionCardComponent } from '../settings/subscription-card.component';
import { placeLabel } from '../../domain/locations';
import { TODAY_STATE_LABEL, buildPendencies, coachLocationHops, todayHeadcount, todayState } from './dashboard.utils';

/** O que a suspensão bloqueia e o que continua liberado (W5). */
const SUSPENSION_POLICY: [string, boolean, string][] = [
  ['Matricular alunos', false, 'Bloqueado'],
  ['Gerar cobranças', false, 'Bloqueado'],
  ['Registrar presença', false, 'Bloqueado'],
  ['Consultar histórico e relatórios', true, 'Liberado'],
  ['Exportar dados', true, 'Liberado'],
];

@Component({
  selector: 'ct-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, PageHeaderComponent, StatComponent, PersonComponent, SubscriptionCardComponent],
  templateUrl: './dashboard.component.html',
  styles: `
    .body { padding: 20px var(--ct-gutter) 26px; display: flex; flex-direction: column; gap: 16px; }
    .dimmed { opacity: 0.55; }
    .two { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); gap: 16px; align-items: start; }
    .occ { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 12px 28px; }
    .occ-row { display: grid; grid-template-columns: minmax(0, 150px) 1fr 54px; gap: 12px; align-items: center; font-size: 12.5px; color: var(--nx-text); }
    .occ-row .ct-strong-mono { text-align: right; font-size: 11px; }
    .occ-row .ct-strong-mono.full { color: var(--nx-pending); }
    .cancel { text-decoration: line-through; opacity: 0.5; }
    .big { font-family: var(--nx-font-display); font-weight: 800; font-size: 28px; color: var(--nx-win); }
    .split { display: flex; height: 10px; border-radius: 5px; overflow: hidden; margin: 14px 0 12px; gap: 2px; background: var(--nx-surface-2); }
    .split > span { min-width: 0; }
    .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
    .dot.red, .split .red { background: var(--nx-live); }
    .dot.yellow, .split .yellow { background: var(--nx-pending); }
    .dot.orange { background: var(--nx-orange-500); }
    .split .green { background: var(--nx-win); }
    a.ct-list-row { text-decoration: none; color: inherit; }
    a.ct-list-row:hover .ct-disp { color: var(--nx-orange-400); }
    .ok { color: var(--nx-win); } .no { color: var(--nx-live); }
    .ct-mono.ok, .ct-mono.no { font-weight: 600; }
  `,
})
export class DashboardComponent {
  readonly centerId = input.required<string>();

  protected readonly ctx = inject(CenterContextService);
  protected readonly store = inject(CenterStore);
  private readonly auth = inject(AuthService);

  protected readonly policy = SUSPENSION_POLICY;
  protected readonly stateLabel = TODAY_STATE_LABEL;
  protected readonly brl = formatBRL;

  /** Relógio de parede: atualiza "em andamento"/"prevista" sem recarregar. */
  private readonly now = signal(new Date());

  constructor() {
    const t = setInterval(() => this.now.set(new Date()), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(t));
  }

  protected readonly tz = computed(() => this.ctx.center()?.timezone ?? 'America/Sao_Paulo');
  private readonly clock = computed(() => wallClock(this.now(), this.tz()));
  protected readonly today = computed(() => this.clock().dayKey);
  protected readonly month = computed(() => monthKey(this.today()));
  protected readonly monthShort = computed(() => monthLabel(this.month()).toLowerCase());

  protected readonly seesEnrollments = computed(() => this.ctx.has('view_enrollments') || this.ctx.has('enroll_students'));
  protected readonly seesFinance = computed(() => this.ctx.has('view_finance'));
  protected readonly canEnroll = computed(() => this.ctx.has('enroll_students') && this.ctx.canWrite());

  protected readonly title = computed(() => {
    const first = (this.ctx.me()?.displayName || this.auth.displayName() || '').trim().split(/\s+/)[0];
    const g = greeting(this.clock().time);
    return first ? `${g}, ${first}` : g;
  });

  protected readonly subtitle = computed(() => {
    const c = this.ctx.center();
    if (!c) {
      return '';
    }
    if (c.status === 'suspended') {
      const since = c.suspendedAt ? formatDayKey(wallClock(c.suspendedAt, this.tz()).dayKey, true) : '';
      return since ? `Situação: suspenso desde ${since}` : 'Situação: suspenso';
    }
    return `${formatDayWithWeekday(this.today())} · ${c.name} · ${c.timezone}`;
  });

  // ── Números ─────────────────────────────────────────────
  protected readonly activeStudents = computed(() => this.store.students().filter((s) => s.status === 'active'));
  protected readonly newStudents = computed(() => {
    const m = this.month();
    const tz = this.tz();
    return this.activeStudents().filter((s) => s.createdAt && monthKey(wallClock(s.createdAt, tz).dayKey) === m).length;
  });

  protected readonly enrollmentCounts = computed(() => {
    const c = { active: 0, paused: 0, waitlisted: 0, pending: 0 };
    for (const e of this.store.enrollments()) {
      if (e.status in c) {
        c[e.status as keyof typeof c]++;
      }
    }
    return c;
  });

  protected readonly occ = computed(() => occupancy(this.store.classes()));

  protected readonly attendance = computed(() => {
    const m = this.month();
    const today = this.today();
    const t = tallyAttendance(this.store.sessions().filter((s) => monthKey(s.date) === m && s.date <= today));
    return { t, rate: attendanceRate(t) };
  });

  protected readonly money = computed(() => moneySplit(this.store.invoices(), this.month(), this.today()));
  protected readonly receivedPct = computed(() => pct(this.money().approvedCents, this.money().chargedCents));

  // ── Aulas de hoje ───────────────────────────────────────
  protected readonly todayRows = computed(() => {
    const today = this.today();
    const time = this.clock().time;
    const list = this.store.sessions().filter((s) => s.date === today);
    const hops = coachLocationHops(list);
    return list
      .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.className.localeCompare(b.className))
      .map((s) => ({
        s,
        state: todayState(s, time),
        count: todayHeadcount(s, this.store.classById(s.classId)),
        coachFirst: s.coachName.split(' ')[0] ?? '',
        place: placeLabel(s),
        hopFrom: hops.get(s.id) ?? '',
      }));
  });

  protected readonly todayKicker = computed(() => {
    const rows = this.todayRows();
    const done = rows.filter((r) => r.state === 'done').length;
    const cancelled = rows.filter((r) => r.state === 'cancelled').length;
    const parts = [formatDayWithWeekday(this.today()), `${rows.length - cancelled} ${rows.length - cancelled === 1 ? 'prevista' : 'previstas'}`, `${done} ${done === 1 ? 'realizada' : 'realizadas'}`];
    if (cancelled) {
      parts.push(`${cancelled} ${cancelled === 1 ? 'cancelada' : 'canceladas'}`);
    }
    return parts.join(' · ');
  });

  protected readonly occRows = computed(() =>
    this.store
      .classes()
      .filter((c) => c.status === 'active')
      .map((c) => ({ c, pct: c.capacity ? Math.min(100, Math.round((c.seatsTaken / c.capacity) * 100)) : 0, full: c.seatsTaken >= c.capacity })),
  );

  protected readonly pendencies = computed(() => {
    const tz = this.tz();
    return buildPendencies({
      today: this.today(),
      now: this.now(),
      formatDay: (at) => (at ? formatDayKey(wallClock(at, tz).dayKey) : '—'),
      enrollments: this.seesEnrollments() ? this.store.enrollments() : null,
      invoices: this.seesFinance() ? this.store.invoices() : null,
      invites: this.ctx.isManager() ? this.store.invites() : null,
      sessions: this.ctx.has('attendance') ? this.store.sessions() : null,
      classById: (id) => this.store.classById(id),
    });
  });

  // ── Suspenso ────────────────────────────────────────────
  protected readonly cancelledSinceSuspension = computed(() => {
    const at = this.ctx.center()?.suspendedAt;
    if (!at) {
      return null;
    }
    const from = wallClock(at, this.tz()).dayKey;
    return this.store.sessions().filter((s) => s.status === 'cancelled' && s.date >= from).length;
  });

  protected readonly frozenEnrollments = computed(() => {
    const c = this.enrollmentCounts();
    return c.active + c.paused + c.pending;
  });
}
