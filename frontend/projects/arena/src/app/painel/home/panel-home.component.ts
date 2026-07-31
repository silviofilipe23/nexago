import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Unsubscribe } from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { bookingIsActive, dateKeyOf, type ArenaBooking } from '../bookings/arena-booking.model';
import { resolveAthleteLabel, watchBookingsForArena } from '../bookings/bookings-repository';
import { fetchCourtsList } from '../courts/courts-repository';
import { computeReviewMetrics, formatRating, formatRelativeDate, type ArenaReview } from '../reviews/arena-review.model';
import { watchReviewsForArena } from '../reviews/reviews-repository';
import type { ArenaTournament } from '../tournaments/tournament.model';
import { fetchArenaTournaments } from '../tournaments/tournaments-repository';
import { ChartTabsComponent } from '../ui/chart-tabs.component';
import { IconComponent } from '../ui/icon.component';
import { initialsOf } from '../ui/initials';
import { KpiCardComponent, type KpiDeltaTone } from '../ui/kpi-card.component';
import { LineChartComponent } from '../ui/line-chart.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';

type ChartTab = 'Faturamento' | 'Reservas';
type ReservationStatus = 'confirmada' | 'pendente' | 'checkin';

interface ReservationRow {
  time: string;
  court: string;
  client: string;
  sport: string;
  status: ReservationStatus;
}

interface ReviewRow {
  initials: string;
  name: string;
  rating: number;
  text: string;
  time: string;
}

interface Shortcut {
  icon: 'calendar' | 'star' | 'tag' | 'edit';
  label: string;
  routerLink: string;
}

const RESERVATION_STATUS_LABEL: Record<ReservationStatus, string> = {
  confirmada: 'Confirmada',
  pendente: 'Pendente',
  checkin: 'Check-in',
};

const RESERVATION_STATUS_TONE: Record<ReservationStatus, PillTone> = {
  confirmada: 'green',
  pendente: 'yellow',
  checkin: 'orange',
};

const SHORTCUTS: Shortcut[] = [
  { icon: 'calendar', label: 'Ver agenda', routerLink: '/painel/agenda' },
  { icon: 'star', label: 'Responder avaliações', routerLink: '/painel/avaliacoes' },
  { icon: 'tag', label: 'Nova promoção', routerLink: '/painel/promocoes/nova' },
  { icon: 'edit', label: 'Editar perfil', routerLink: '/painel/perfil' },
];

function greetingFor(hour: number): string {
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

function dateKeyDaysAgo(n: number, from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() - n);
  return dateKeyOf(d);
}

const WEEKDAY_FORMAT = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });

function weekdayShortLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return dateKey;
  const label = WEEKDAY_FORMAT.format(new Date(y, m - 1, d)).replace('.', '');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function sumAmountForDay(bookings: readonly ArenaBooking[], dateKey: string): number {
  return bookings.filter((b) => b.dateKey === dateKey && bookingIsActive(b)).reduce((sum, b) => sum + (b.amountReais ?? 0), 0);
}

function countActiveForDay(bookings: readonly ArenaBooking[], dateKey: string): number {
  return bookings.filter((b) => b.dateKey === dateKey && bookingIsActive(b)).length;
}

function reservationStatusOf(b: ArenaBooking): ReservationStatus {
  if (b.attendanceStatus === 'checked_in') return 'checkin';
  if (b.attendanceStatus === 'pending') return 'pendente';
  return 'confirmada';
}

function formatBRL(n: number): string {
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

/** Tela Início do painel: KPIs, gráfico, reservas do dia, torneios e avaliações — tudo real,
 *  derivado de `arenaBookings`/`arena_reviews`/`tournaments` (já reais em outras telas). Sem
 *  "Ocupação" (chart tab + KPI + card "Ocupação por quadra" do protótipo): calcular % de
 *  ocupação de verdade exige saber o horário de funcionamento/slots totais por quadra, que ainda
 *  não temos modelado em lugar nenhum — deixado de fora até isso existir, não é fabricação. */
@Component({
  selector: 'ar-panel-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    PanelShellComponent,
    PageHeaderComponent,
    PanelCardComponent,
    KpiCardComponent,
    LineChartComponent,
    ChartTabsComponent,
    PillComponent,
    IconComponent,
  ],
  template: `
    <ar-panel-shell>
      <ar-page-header [title]="greetingTitle()" [subtitle]="subtitleLabel()">
        <div class="header-actions">
          <div class="ar-search-box">
            <ar-icon name="search" [size]="15" />
            <span>Buscar…</span>
            <span class="kbd">⌘K</span>
          </div>
          <button type="button" class="ar-bell-btn" aria-label="Notificações">
            <ar-icon name="bell" [size]="17" />
          </button>
          <div class="avatar" aria-hidden="true">{{ initials() }}</div>
        </div>
      </ar-page-header>

      <div class="body">
        @if (arenaNotFound()) {
          <p class="state-text">Nenhuma arena vinculada à sua conta ainda.</p>
        } @else if (arenaLoading() || loading()) {
          <p class="state-text">Carregando…</p>
        } @else {
          <div class="kpi-row">
            @if (showsRevenue()) {
              <ar-kpi-card label="Faturamento hoje" [value]="formatBRL(faturamentoHoje())" [delta]="faturamentoDeltaLabel()" [deltaTone]="faturamentoDeltaTone()" />
            }
            <ar-kpi-card label="Reservas hoje" [value]="'' + todaysBookings().length" [delta]="pendingTodayCount() + ' pendentes'" deltaTone="orange" />
            <ar-kpi-card label="Torneios ativos" [value]="'' + activeTournaments().length" [delta]="activeTournamentsEnrolled() + ' inscritos'" deltaTone="flat" icon="trophy" />
            <ar-kpi-card label="Avaliação média" [value]="reviewMetrics().totalReviews > 0 ? formatRating(reviewMetrics().averageRating) : '—'" [delta]="reviewMetrics().totalReviews > 0 ? reviewMetrics().totalReviews + ' avaliações' : ''" deltaTone="flat" icon="star" />
          </div>

          <div class="main-grid">
            <div class="col-left">
              <ar-panel-card kicker="Últimos 7 dias" title="Desempenho da operação" class="chart-card">
                <ar-chart-tabs [tabs]="chartTabs()" [active]="chartTab()" (change)="chartTab.set($any($event))" card-actions />
                <ar-line-chart [height]="118" [data]="activeChartData()" [labels]="chartDays()" />
              </ar-panel-card>

              <ar-panel-card title="Reservas de hoje" class="reservations-card">
                <a routerLink="/painel/agenda" class="ar-ghost-btn" card-actions>Ver agenda</a>
                <div class="list">
                  @for (r of reservationRows(); track r.time + r.court) {
                    <div class="reservation-row">
                      <div class="reservation-time">{{ r.time }}</div>
                      <div class="reservation-body">
                        <div class="reservation-title">{{ r.court }} · {{ r.client }}</div>
                        <div class="reservation-sport">{{ r.sport }}</div>
                      </div>
                      <ar-pill [tone]="statusTone[r.status]">{{ statusLabel[r.status] }}</ar-pill>
                    </div>
                  } @empty {
                    <p class="state-text">Nenhuma reserva pra hoje.</p>
                  }
                </div>
              </ar-panel-card>
            </div>

            <div class="col-right">
              <ar-panel-card pad="sm" title="Torneios ativos">
                <a routerLink="/painel/torneios" class="ar-ghost-btn" card-actions>Ver todos</a>
                <div class="list">
                  @for (t of activeTournamentsPreview(); track t.id) {
                    <div class="tournament-row">
                      <div class="tournament-icon">
                        <ar-icon name="trophy" [size]="17" />
                      </div>
                      <div class="tournament-body">
                        <div class="tournament-title">{{ t.name }}</div>
                        <div class="tournament-meta">{{ t.sport }} · {{ t.dateLabel }}</div>
                      </div>
                      <div class="tournament-stats">
                        <div class="tournament-count">{{ t.enrolledCount }}/{{ t.capacity || '—' }}</div>
                        <div class="tournament-pct">{{ pctFull(t) }}% cheio</div>
                      </div>
                    </div>
                  } @empty {
                    <p class="state-text">Nenhum torneio ativo.</p>
                  }
                </div>
              </ar-panel-card>

              <ar-panel-card pad="sm" title="Avaliações recentes" class="reviews-card">
                <ar-pill tone="orange" card-actions>{{ reviewMetrics().totalReviews > 0 ? formatRating(reviewMetrics().averageRating) + ' ★' : '—' }}</ar-pill>
                <div class="list">
                  @for (rv of reviewRows(); track rv.name + rv.time) {
                    <div class="review-row">
                      <div class="review-avatar">{{ rv.initials }}</div>
                      <div class="review-body">
                        <div class="review-head">
                          <span class="review-name">{{ rv.name }}</span>
                          <span class="review-stars">
                            @for (i of starIndexes; track i) {
                              <ar-icon name="star" [size]="10" [style.color]="i < rv.rating ? 'var(--nx-orange-500)' : 'var(--nx-line-strong)'" />
                            }
                          </span>
                        </div>
                        <div class="review-text">{{ rv.text }}</div>
                      </div>
                      <span class="review-time">{{ rv.time }}</span>
                    </div>
                  } @empty {
                    <p class="state-text">Nenhuma avaliação ainda.</p>
                  }
                </div>
              </ar-panel-card>

              <ar-panel-card pad="sm" title="Atalhos">
                <div class="shortcuts-grid">
                  @for (s of shortcuts; track s.label) {
                    <a [routerLink]="s.routerLink" class="ar-shortcut">
                      <ar-icon [name]="s.icon" [size]="16" />
                      <span>{{ s.label }}</span>
                    </a>
                  }
                </div>
              </ar-panel-card>
            </div>
          </div>
        }
      </div>
    </ar-panel-shell>
  `,
  styles: `
    .header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .avatar {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      background: var(--nx-orange-tint);
      border: 1px solid rgba(255, 106, 26, 0.35);
      display: grid;
      place-items: center;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13px;
      color: var(--nx-orange-500);
    }

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
    }

    .kpi-row {
      display: flex;
      gap: 16px;
      flex: none;
    }

    .main-grid {
      flex: 1;
      display: grid;
      grid-template-columns: 1fr 372px;
      gap: 16px;
      min-height: 0;
    }

    .col-left,
    .col-right {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
    }

    .chart-card {
      flex: none;
    }

    .reservations-card {
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    .reviews-card {
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    .list {
      display: flex;
      flex-direction: column;
      margin-top: -6px;
    }

    .reservation-row {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 11px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .reservation-row:last-child {
      border-bottom: none;
    }

    .reservation-time {
      width: 50px;
      flex: none;
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13px;
      color: var(--nx-text);
    }

    .reservation-body {
      flex: 1;
      min-width: 0;
    }

    .reservation-title {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
    }

    .reservation-sport {
      font-size: 11.5px;
      color: var(--nx-text-dim);
      margin-top: 2px;
    }

    .tournament-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 11px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .tournament-row:last-child {
      border-bottom: none;
    }

    .tournament-icon {
      width: 38px;
      height: 38px;
      border-radius: var(--nx-r-2);
      flex: none;
      background: var(--nx-orange-tint);
      color: var(--nx-orange-500);
      display: grid;
      place-items: center;
    }

    .tournament-body {
      flex: 1;
      min-width: 0;
    }

    .tournament-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13px;
      color: var(--nx-text);
    }

    .tournament-meta {
      font-size: 11.5px;
      color: var(--nx-text-dim);
      margin-top: 2px;
    }

    .tournament-stats {
      text-align: right;
      flex: none;
    }

    .tournament-count {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 12.5px;
      color: var(--nx-text);
    }

    .tournament-pct {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      color: var(--nx-text-dim);
    }

    .review-row {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 11px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .review-row:last-child {
      border-bottom: none;
    }

    .review-avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      flex: none;
      margin-top: 1px;
      background: var(--nx-orange-tint);
      border: 1px solid rgba(255, 106, 26, 0.3);
      display: grid;
      place-items: center;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 9.5px;
      color: var(--nx-orange-500);
    }

    .review-body {
      flex: 1;
      min-width: 0;
    }

    .review-head {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .review-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 12.5px;
      color: var(--nx-text);
    }

    .review-stars {
      display: inline-flex;
      align-items: center;
      gap: 2px;
    }

    .review-text {
      font-size: 12px;
      line-height: 1.45;
      color: var(--nx-text-mute);
      margin-top: 3px;
    }

    .review-time {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      color: var(--nx-text-dim);
      flex: none;
      margin-top: 2px;
    }

    .shortcuts-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    @media (max-width: 1180px) {
      .main-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 720px) {
      .kpi-row {
        flex-wrap: wrap;
      }
    }
  `,
})
export class PanelHomeComponent {
  private readonly auth = inject(AuthService);
  private readonly arenaContext = inject(ArenaContextService);
  private readonly access = inject(ArenaAccessService);
  private readonly destroyRef = inject(DestroyRef);

  private unsubscribeBookings: Unsubscribe | null = null;
  private unsubscribeReviews: Unsubscribe | null = null;

  protected readonly showsRevenue = computed(() => this.access.canRead('financeiro'));
  protected readonly chartTabs = computed<ChartTab[]>(() =>
    this.showsRevenue() ? ['Faturamento', 'Reservas'] : ['Reservas'],
  );
  protected readonly chartTab = signal<ChartTab>('Faturamento');

  protected readonly statusLabel = RESERVATION_STATUS_LABEL;
  protected readonly statusTone = RESERVATION_STATUS_TONE;
  protected readonly starIndexes = [0, 1, 2, 3, 4];
  protected readonly shortcuts = SHORTCUTS;
  protected readonly formatBRL = formatBRL;
  protected readonly formatRating = formatRating;

  protected readonly arenaLoading = computed(() => this.arenaContext.loading());
  protected readonly arenaNotFound = computed(() => this.arenaContext.notFound());

  protected readonly loading = signal(true);
  protected readonly bookings = signal<ArenaBooking[]>([]);
  protected readonly reviews = signal<ArenaReview[]>([]);
  protected readonly tournaments = signal<ArenaTournament[]>([]);
  protected readonly courtSportById = signal<Map<string, string>>(new Map());
  protected readonly athleteNames = signal<Map<string, string>>(new Map());

  private readonly todayKey = computed(() => dateKeyOf(new Date()));
  private readonly last7DateKeys = computed(() => Array.from({ length: 7 }, (_, i) => dateKeyDaysAgo(6 - i)));

  protected readonly chartDays = computed(() => this.last7DateKeys().map(weekdayShortLabel));
  private readonly revenueByDay = computed(() => this.last7DateKeys().map((key) => sumAmountForDay(this.bookings(), key)));
  private readonly countByDay = computed(() => this.last7DateKeys().map((key) => countActiveForDay(this.bookings(), key)));
  protected readonly activeChartData = computed(() => (this.chartTab() === 'Faturamento' ? this.revenueByDay() : this.countByDay()));

  protected readonly todaysBookings = computed(() => this.bookings().filter((b) => b.dateKey === this.todayKey() && bookingIsActive(b)));
  protected readonly pendingTodayCount = computed(() => this.todaysBookings().filter((b) => b.attendanceStatus === 'pending').length);

  protected readonly reservationRows = computed<ReservationRow[]>(() => {
    const names = this.athleteNames();
    const courts = this.courtSportById();
    return this.todaysBookings()
      .slice()
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .map((b) => ({
        time: b.startTime,
        court: b.courtName,
        client: b.customerName ?? names.get(b.athleteId) ?? 'Cliente',
        sport: courts.get(b.courtId) ?? 'Esporte',
        status: reservationStatusOf(b),
      }));
  });

  protected readonly faturamentoHoje = computed(() => sumAmountForDay(this.bookings(), this.todayKey()));
  private readonly faturamentoSemanaAnterior = computed(() => sumAmountForDay(this.bookings(), dateKeyDaysAgo(7)));
  private readonly faturamentoDeltaPct = computed(() => {
    const prev = this.faturamentoSemanaAnterior();
    if (prev <= 0) return null;
    return Math.round(((this.faturamentoHoje() - prev) / prev) * 100);
  });
  protected readonly faturamentoDeltaLabel = computed(() => {
    const pct = this.faturamentoDeltaPct();
    return pct == null ? '' : `${pct >= 0 ? '+' : ''}${pct}%`;
  });
  protected readonly faturamentoDeltaTone = computed<KpiDeltaTone>(() => ((this.faturamentoDeltaPct() ?? 0) >= 0 ? 'green' : 'red'));

  protected readonly activeTournaments = computed(() => this.tournaments().filter((t) => t.status !== 'concluido'));
  protected readonly activeTournamentsPreview = computed(() => this.activeTournaments().slice(0, 3));
  protected readonly activeTournamentsEnrolled = computed(() => this.activeTournaments().reduce((sum, t) => sum + t.enrolledCount, 0));

  protected readonly reviewMetrics = computed(() => computeReviewMetrics(this.reviews()));
  protected readonly reviewRows = computed<ReviewRow[]>(() => {
    const names = this.athleteNames();
    return this.reviews()
      .slice(0, 3)
      .map((r) => {
        const name = names.get(r.userId) ?? 'Cliente';
        return {
          initials: initialsOf(name),
          name,
          rating: r.rating,
          text: r.comment ?? 'Sem comentário.',
          time: formatRelativeDate(r.createdAt),
        };
      });
  });

  protected readonly greetingTitle = computed(() => {
    const source = this.auth.displayName() || this.auth.user()?.email || '';
    const firstName = source.split(/[\s@.]/)[0] || '';
    const greeting = greetingFor(new Date().getHours());
    return firstName ? `${greeting}, ${firstName}.` : `${greeting}.`;
  });

  protected readonly subtitleLabel = computed(() => {
    const arenaName = this.arenaContext.arenaName() ?? 'Arena';
    const now = new Date();
    const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(now).replace('.', '');
    const date = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(now).replace('.', '');
    return `${arenaName} · ${weekday} · ${date}`;
  });

  protected readonly initials = computed(() => initialsOf(this.auth.displayName() || this.auth.user()?.email || '·'));

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.unsubscribeBookings?.();
      this.unsubscribeReviews?.();
    });

    effect(() => {
      if (!this.chartTabs().includes(this.chartTab())) {
        this.chartTab.set(this.chartTabs()[0]!);
      }
    });

    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      this.unsubscribeBookings?.();
      this.unsubscribeReviews?.();
      this.unsubscribeBookings = null;
      this.unsubscribeReviews = null;
      if (!arenaId) return;

      this.loading.set(true);
      const db = arenaFirestore();
      this.unsubscribeBookings = watchBookingsForArena(db, arenaId, (list) => {
        this.bookings.set(list);
        this.loading.set(false);
      });
      this.unsubscribeReviews = watchReviewsForArena(db, arenaId, (list) => this.reviews.set(list));

      void fetchCourtsList(db, arenaId).then((courts) => {
        const map = new Map<string, string>();
        for (const c of courts) map.set(c.id, c.types[0] ?? 'Esporte');
        this.courtSportById.set(map);
      });

      const projectId = environment.firebase.projectId;
      if (projectId) {
        void fetchArenaTournaments(db, projectId, arenaId).then((list) => this.tournaments.set(list));
      }
    });

    effect(() => {
      const idsNeeded = new Set<string>();
      for (const b of this.todaysBookings()) {
        if (!b.customerName && b.athleteId) idsNeeded.add(b.athleteId);
      }
      for (const r of this.reviews()) {
        if (r.userId) idsNeeded.add(r.userId);
      }
      const cache = this.athleteNames();
      const missing = [...idsNeeded].filter((id) => !cache.has(id));
      if (missing.length === 0) return;

      const db = arenaFirestore();
      void Promise.all(missing.map(async (id) => [id, await resolveAthleteLabel(db, id)] as const)).then((pairs) => {
        this.athleteNames.update((current) => {
          const next = new Map(current);
          for (const [id, name] of pairs) next.set(id, name);
          return next;
        });
      });
    });
  }

  protected pctFull(t: ArenaTournament): number {
    return t.capacity > 0 ? Math.round((t.enrolledCount / t.capacity) * 100) : 0;
  }
}
