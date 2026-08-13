import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { environment } from '../environments/environment';
import { AuthService } from './auth/auth.service';
import { AtBellComponent } from './painel/at-bell.component';
import { AtPanelShellComponent } from './painel/at-panel-shell.component';
import { AtRegistrationTrackerComponent } from './painel/at-registration-tracker.component';
import {
  buildInProgressRegistrations,
  partnerUidsOf,
  type RegistrationProgress,
} from './painel/registration-progress';
import { fetchPublicProfilesByIds } from './data/public-profiles-repository';
import { NxSkeletonComponent } from './shared/loading/nx-skeleton.component';
import { NxBlockingDialogComponent, NxInlineMessageComponent, NxToastService } from './shared/feedback';
import { LgpdConsentDialogComponent } from './shared/lgpd/lgpd-consent-dialog.component';
import { watchCommunityFeed, type CommunityFeedItem } from './data/community-feed-repository';
import { DAILY_MISSION_CATALOG, watchDailyMissions } from './data/daily-missions-repository';
import {
  bookingIsActive,
  bookingIsUpcoming,
  bookingStartsAt,
  watchMyBookings,
  type MyBooking,
} from './data/my-bookings-repository';
import { fetchMyAthleteProfile } from './data/my-athlete-profile-repository';
import { fetchAthleteRankingPosition } from './data/rankings-repository';
import { fetchMatchesForTeam, fetchTeamsForAthlete, matchIsCompleted, type ArenaMatch } from './data/teams-repository';
import {
  acceptPartnerInvite,
  cancelMyRegistration,
  declinePartnerInvite,
  fetchMyPendingPartnerInvites,
  fetchMyRegistrations,
  TournamentRegistrationError,
  type AthleteTournamentRegistration,
} from './data/tournament-registrations-repository';
import { athleteFunctions } from './data/functions';
import { fetchTournamentSummariesByIds, type TournamentSummary } from './data/tournaments-repository';
import { AthleteGamificationService } from './profile/athlete-gamification.service';
import { FocusDayService } from './tournaments/focus/focus-day.service';

type DashboardTone = 'accent' | 'success' | 'warning' | 'neutral';
type ChartTab = 'Jogos' | 'Vitórias';
type KpiTone = 'green' | 'orange';

interface DashboardReservation {
  id: string;
  startsAtMs: number;
  arenaName: string;
  courtName: string;
  /** "Hoje" / "Amanhã" / "15 abr" — o card mostra isso no topo do bloco de horário. */
  dayLabel: string;
  startLabel: string;
  timeLabel: string;
  statusLabel: string;
  statusTone: DashboardTone;
  amountLabel: string | null;
  caption: string;
}

interface DashboardRanking {
  positionLabel: string;
  pointsLabel: string;
  categoryLabel: string;
}

interface DashboardKpi {
  label: string;
  value: string;
  delta: string;
  note: string;
  tone: KpiTone;
  arrow: boolean;
  icon?: 'flame';
}

interface CommunityActivityItem {
  id: string;
  initials: string;
  hue: number;
  name: string;
  message: string;
  time: string;
  link: string;
}

interface MissionItem {
  id: string;
  label: string;
  xp: number;
  done: boolean;
}

interface PendingInviteItem {
  id: string;
  inviterName: string;
  tournamentId: string;
  categoryId: string;
  tournamentName: string;
}

interface MyTournamentItem {
  id: string;
  name: string;
  meta: string;
  statusLabel: string;
  statusTone: 'yellow' | 'green';
}

const CHART_TABS: readonly ChartTab[] = ['Jogos', 'Vitórias'];
const CHART_W = 802;
const CHART_H = 120;
const CHART_MONTH_COUNT = 12;
/** Teto de times consultados pro histórico — evita N+1 sem limite em contas antigas. */
const MAX_TEAMS_FETCH = 12;
const MY_TOURNAMENTS_LIMIT = 4;
const CLOCK_TICK_MS = 60_000;

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) {
    return null;
  }
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

function titleCase(input: string): string {
  return input
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function nameFromEmail(email: string | null | undefined): string {
  const local = email?.split('@')[0]?.trim();
  if (!local) {
    return 'Atleta';
  }
  return titleCase(local);
}

function firstWord(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return 'Atleta';
  }
  return trimmed.split(/\s+/)[0] ?? 'Atleta';
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return 'AT';
  }
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || 'AT';
}

function hueOf(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) % 360;
  }
  return hash;
}

function formatTodayLabel(now = new Date()): string {
  const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' })
    .format(now)
    .replace('.', '');
  const date = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    .format(now)
    .replace('.', '');
  const gmt = -now.getTimezoneOffset() / 60;
  return `${weekday} · ${date} · GMT${gmt >= 0 ? '+' : ''}${gmt}`;
}

function greetingByHour(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) {
    return 'Bom dia';
  }
  if (hour < 18) {
    return 'Boa tarde';
  }
  return 'Boa noite';
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value;
  }
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate: () => Date }).toDate === 'function'
  ) {
    const converted = (value as { toDate: () => Date }).toDate();
    return Number.isFinite(converted.getTime()) ? converted : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const converted = new Date(value);
    return Number.isFinite(converted.getTime()) ? converted : null;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const converted = new Date(value);
    return Number.isFinite(converted.getTime()) ? converted : null;
  }
  return null;
}

function formatCompactDate(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
  })
    .format(date)
    .replace('.', '');
}

/** `YYYY-MM-DD` local — comparação de dia sem passar por UTC. */
function localDayKey(date: Date): string {
  const y = String(date.getFullYear()).padStart(4, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDayLabel(date: Date, now = new Date()): string {
  const today = localDayKey(now);
  if (localDayKey(date) === today) {
    return 'Hoje';
  }
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (localDayKey(date) === localDayKey(tomorrow)) {
    return 'Amanhã';
  }
  return formatCompactDate(date);
}

function formatRelativeTime(value: unknown): string {
  const date = toDate(value);
  if (!date) {
    return 'agora';
  }
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));
  if (diffMinutes < 1) {
    return 'agora';
  }
  if (diffMinutes < 60) {
    return `ha ${diffMinutes} min`;
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `ha ${diffHours} h`;
  }
  const diffDays = Math.round(diffHours / 24);
  if (diffDays === 1) {
    return 'ontem';
  }
  return `ha ${diffDays} dias`;
}

function formatCurrency(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount)) {
    return null;
  }
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(amount);
}

function bookingStatus(status: string): Pick<DashboardReservation, 'statusLabel' | 'statusTone'> {
  switch (status.trim().toUpperCase()) {
    case 'CONFIRMED':
    case 'BOOKED':
    case 'ACTIVE':
      return { statusLabel: 'Confirmada', statusTone: 'success' };
    case 'PAY_AT_ARENA':
      return { statusLabel: 'Pagar na arena', statusTone: 'warning' };
    case 'CHECKIN_OPEN':
      return { statusLabel: 'Check-in aberto', statusTone: 'accent' };
    case 'PENDING_PAYMENT':
      return { statusLabel: 'Pagamento pendente', statusTone: 'warning' };
    case 'PENDING':
      return { statusLabel: 'Em processamento', statusTone: 'accent' };
    default:
      return { statusLabel: 'Reservada', statusTone: 'neutral' };
  }
}

function bookingCaption(booking: MyBooking, statusLabel: string): string {
  if (statusLabel === 'Pagar na arena' || statusLabel === 'Pagamento pendente') {
    return 'Leve um documento e chegue alguns minutos antes.';
  }
  if (booking.attendanceConfirmed) {
    return 'Presença confirmada. Bom jogo!';
  }
  return 'Acompanhe detalhes e combinados por aqui.';
}

function mapBooking(booking: MyBooking, startsAt: Date, now: Date): DashboardReservation {
  const statusInfo = bookingStatus(booking.status);
  return {
    id: booking.id,
    startsAtMs: startsAt.getTime(),
    arenaName: booking.arenaName,
    courtName: booking.courtName,
    dayLabel: formatDayLabel(startsAt, now),
    startLabel: booking.startTime,
    timeLabel: `${booking.startTime} - ${booking.endTime}`,
    statusLabel: statusInfo.statusLabel,
    statusTone: statusInfo.statusTone,
    amountLabel: formatCurrency(booking.amountReais),
    caption: bookingCaption(booking, statusInfo.statusLabel),
  };
}

/** Só as reservas ativas que ainda não terminaram, da mais próxima pra mais distante. */
function upcomingReservations(bookings: readonly MyBooking[], now = new Date()): DashboardReservation[] {
  return bookings
    .filter((booking) => bookingIsActive(booking) && bookingIsUpcoming(booking, now))
    .flatMap((booking) => {
      const startsAt = bookingStartsAt(booking);
      return startsAt ? [mapBooking(booking, startsAt, now)] : [];
    })
    .sort((a, b) => a.startsAtMs - b.startsAtMs);
}

function mapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function chartScale(data: readonly number[]): { max: number; min: number } {
  const max = Math.max(...data) * 1.15;
  const min = Math.min(...data) * 0.75;
  // Série constante (ex.: tudo zero) — abre 1 de folga pra não dividir por zero.
  return max === min ? { max: max + 1, min: min - (min > 0 ? 1 : 0) } : { max, min };
}

function buildLinePath(data: readonly number[], w: number, h: number): string {
  const { max, min } = chartScale(data);
  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * w;
    const y = h - ((value - min) / (max - min)) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `M${points.join(' L')}`;
}

function buildAreaPath(linePath: string, w: number, h: number): string {
  return `${linePath} L${w},${h} L0,${h} Z`;
}

function lastChartPoint(data: readonly number[], w: number, h: number): { x: number; y: number } {
  const { max, min } = chartScale(data);
  const value = data[data.length - 1] ?? 0;
  return { x: w, y: h - ((value - min) / (max - min)) * h };
}

/** Chave ano*12+mês pra agrupar partidas por mês (rolling 12 meses). */
function monthKeyOf(date: Date): number {
  return date.getFullYear() * 12 + date.getMonth();
}

function matchMonthDate(match: ArenaMatch): Date | null {
  return match.matchEndedAt ?? match.scheduleTime;
}

function communityMessage(item: CommunityFeedItem): string {
  if (item.type === 'tournament_open') {
    const cats = item.categoriesCount != null ? ` · ${item.categoriesCount} categoria${item.categoriesCount === 1 ? '' : 's'}` : '';
    const place = item.city ?? item.locationName;
    return `abriu inscrições${cats}${place ? ` — ${place}` : ''}.`;
  }
  const count = item.champions.length;
  return count > 0 ? `definiu os campeões de ${count} categoria${count === 1 ? '' : 's'}.` : 'terminou com campeões definidos.';
}

@Component({
  selector: 'app-athlete-painel',
  standalone: true,
  imports: [
    RouterLink,
    AtPanelShellComponent,
    AtBellComponent,
    NxSkeletonComponent,
    AtRegistrationTrackerComponent,
    NxBlockingDialogComponent,
    NxInlineMessageComponent,
    LgpdConsentDialogComponent,
  ],
  templateUrl: './athlete-painel.component.html',
  styleUrl: './athlete-painel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AthletePainelComponent {
  protected readonly auth = inject(AuthService);
  private readonly gamification = inject(AthleteGamificationService);
  private readonly router = inject(Router);
  /** `protected`, não `private`: o template lê `focusDay.target()` direto pra mostrar "Entrar
   *  no Focus" quando há partida hoje — sem reimplementar a detecção aqui. O signal continua
   *  valendo depois que a entrada automática do dia já foi consumida: é o caminho manual de volta
   *  pro Focus depois que o atleta sai. */
  protected readonly focusDay = inject(FocusDayService);
  private readonly firestore = createFirestore();

  private readonly bookingsState = signal<readonly MyBooking[]>([]);
  private readonly rankingState = signal<DashboardRanking | null>(null);
  /** Convites de parceiro pendentes — mostrados aqui pra não depender de o atleta navegar
   *  até a Agenda ou a inscrição específica pra descobrir que foi convidado. */
  private readonly pendingInvitesState = signal<PendingInviteItem[]>([]);
  /** Foto enviada no onboarding — prioridade sobre o `photoURL` do Firebase Auth. */
  private readonly profilePhotoUrlState = signal<string | null>(null);
  protected readonly respondingInviteId = signal<string | null>(null);
  /** Relógio de 1 min: mantém "Hoje/Amanhã" e o corte de reserva passada corretos
   *  numa aba deixada aberta. */
  private readonly now = signal(new Date());
  /** Partidas de torneio CONCLUÍDAS dos times do atleta (fonte real de jogos/vitórias). */
  private readonly completedMatchesState = signal<ArenaMatch[]>([]);
  private readonly myTeamIdsState = signal<ReadonlySet<string>>(new Set());
  private readonly communityState = signal<CommunityFeedItem[]>([]);
  private readonly missionsDoneState = signal<ReadonlySet<string>>(new Set());
  private readonly myTournamentsState = signal<MyTournamentItem[]>([]);
  /** Inscrições que ainda têm próximo passo (falta dupla/pagamento/uniforme) — o card de
   *  acompanhamento no topo. Sai da lista assim que a inscrição fecha. */
  private readonly inProgressRegistrationsState = signal<readonly RegistrationProgress[]>([]);

  protected readonly loadingRanking = signal(false);
  private readonly toasts = inject(NxToastService);

  /** Só falha de SINCRONIZAÇÃO de dados. Erro de ação (aceitar/recusar convite)
   *  vai pra toast — ele pertence ao gesto, não ao estado da tela. */
  protected readonly syncError = signal<string | null>(null);
  /** Primeira carga do painel — desliga na primeira emissão do snapshot de reservas
   *  (dispara rápido mesmo vazio). Enquanto o Firebase não resolveu a sessão, segue ligada
   *  pra não piscar um painel vazio antes do login ser conhecido. */
  private readonly bootLoadingState = signal(true);
  protected readonly bootLoading = computed(
    () => this.bootLoadingState() || !this.auth.authReady(),
  );

  protected readonly chartTabs = CHART_TABS;
  protected readonly chartW = CHART_W;
  protected readonly chartH = CHART_H;

  protected readonly activeChartTab = signal<ChartTab>('Jogos');

  protected readonly greeting = computed(() => greetingByHour(this.now()));
  protected readonly todayLabel = computed(() => formatTodayLabel(this.now()));
  protected readonly accountLabel = computed(() => {
    const liveUser = this.auth.user();
    if (liveUser?.displayName?.trim()) {
      return liveUser.displayName.trim();
    }
    if (liveUser?.email?.trim()) {
      return nameFromEmail(liveUser.email);
    }
    const devEmail = this.auth.devEmail();
    if (devEmail?.trim()) {
      return nameFromEmail(devEmail);
    }
    return 'Atleta';
  });
  protected readonly firstName = computed(() => firstWord(this.accountLabel()));
  protected readonly headerInitials = computed(() => initialsOf(this.accountLabel()));
  protected readonly headerAvatarUrl = computed(
    () => this.profilePhotoUrlState() ?? this.auth.user()?.photoURL ?? null,
  );
  protected readonly reservations = computed(() =>
    upcomingReservations(this.bookingsState(), this.now()),
  );
  protected readonly ranking = computed(() => this.rankingState());
  protected readonly nextReservation = computed(() => this.reservations()[0] ?? null);
  protected readonly nextReservationMapsUrl = computed(() => {
    const reservation = this.nextReservation();
    return reservation ? mapsSearchUrl(reservation.arenaName) : null;
  });

  /** KPIs reais: jogos/vitórias do histórico de partidas de torneio, sequência da
   *  gamificação (`users/{uid}/gamification/summary`), posição do ranking live. */
  protected readonly kpis = computed<DashboardKpi[]>(() => {
    const completed = this.completedMatchesState();
    const myTeams = this.myTeamIdsState();
    const currentKey = monthKeyOf(this.now());

    const inMonth = (key: number) =>
      completed.filter((m) => {
        const d = matchMonthDate(m);
        return d != null && monthKeyOf(d) === key;
      }).length;
    const gamesThisMonth = inMonth(currentKey);
    const monthDiff = gamesThisMonth - inMonth(currentKey - 1);

    const wins = completed.filter((m) => m.winnerId != null && myTeams.has(m.winnerId)).length;
    const losses = completed.length - wins;
    const winPct = completed.length > 0 ? Math.round((wins / completed.length) * 100) : null;

    const streak = this.gamification.summary()?.streak ?? 0;
    const ranking = this.ranking();

    return [
      {
        label: 'Jogos no mês',
        value: String(gamesThisMonth),
        delta: `${monthDiff >= 0 ? '+' : ''}${monthDiff}`,
        note: 'vs mês anterior',
        tone: monthDiff >= 0 ? 'green' : 'orange',
        arrow: true,
      },
      {
        label: 'Vitórias',
        value: winPct != null ? `${winPct}%` : '—',
        delta: `${wins}V · ${losses}D`,
        note: 'partidas de torneio',
        tone: 'green',
        arrow: false,
      },
      {
        label: 'Sequência',
        value: `${streak} ${streak === 1 ? 'dia' : 'dias'}`,
        delta: 'em jogo',
        note: 'dias ativos seguidos',
        tone: 'orange',
        arrow: false,
        icon: 'flame',
      },
      {
        label: 'Ranking',
        value: ranking?.positionLabel ?? '—',
        delta: ranking?.pointsLabel ?? 'sem pontos',
        note: ranking?.categoryLabel ?? 'temporada',
        tone: 'green',
        arrow: false,
      },
    ];
  });

  /** Missões diárias reais — catálogo em código + estado do dia no Firestore. */
  protected readonly missions = computed<MissionItem[]>(() => {
    const done = this.missionsDoneState();
    return DAILY_MISSION_CATALOG.map((m) => ({
      id: m.id,
      label: m.title,
      xp: m.xpReward,
      done: done.has(m.id),
    }));
  });
  protected readonly missionsDone = computed(() => this.missions().filter((mission) => mission.done).length);

  protected readonly myTournaments = computed(() => this.myTournamentsState());
  protected readonly inProgressRegistrations = computed(() => this.inProgressRegistrationsState());
  protected readonly pendingInvites = computed(() => this.pendingInvitesState());

  /** Atividade da comunidade — itens reais do `communityFeed` (sem UGC). */
  protected readonly communityActivity = computed<CommunityActivityItem[]>(() =>
    this.communityState()
      .slice(0, 4)
      .map((item) => ({
        id: item.id,
        initials: initialsOf(item.tournamentName),
        hue: hueOf(item.tournamentName),
        name: item.tournamentName,
        message: communityMessage(item),
        time: formatRelativeTime(item.createdAt),
        link: `/torneios/${item.tournamentId}`,
      })),
  );

  /** Série mensal real (últimos 12 meses) a partir das partidas concluídas. */
  private readonly chartMonthsKeys = computed(() => {
    const current = monthKeyOf(this.now());
    return Array.from({ length: CHART_MONTH_COUNT }, (_, i) => current - (CHART_MONTH_COUNT - 1) + i);
  });

  protected readonly chartMonths = computed(() => {
    const fmt = new Intl.DateTimeFormat('pt-BR', { month: 'short' });
    return this.chartMonthsKeys().map((key) => {
      const label = fmt.format(new Date(Math.floor(key / 12), key % 12, 1)).replace('.', '');
      return label.charAt(0).toUpperCase() + label.slice(1);
    });
  });

  protected readonly chartData = computed<readonly number[]>(() => {
    const completed = this.completedMatchesState();
    const myTeams = this.myTeamIdsState();
    const buckets = new Map<number, { games: number; wins: number }>();
    for (const key of this.chartMonthsKeys()) {
      buckets.set(key, { games: 0, wins: 0 });
    }
    for (const match of completed) {
      const date = matchMonthDate(match);
      if (!date) continue;
      const bucket = buckets.get(monthKeyOf(date));
      if (!bucket) continue;
      bucket.games++;
      if (match.winnerId != null && myTeams.has(match.winnerId)) bucket.wins++;
    }
    const rows = this.chartMonthsKeys().map((key) => buckets.get(key)!);
    if (this.activeChartTab() === 'Jogos') {
      return rows.map((r) => r.games);
    }
    return rows.map((r) => (r.games > 0 ? Math.round((r.wins / r.games) * 100) : 0));
  });

  protected readonly chartLinePath = computed(() => buildLinePath(this.chartData(), CHART_W, CHART_H));
  protected readonly chartAreaPath = computed(() =>
    buildAreaPath(this.chartLinePath(), CHART_W, CHART_H),
  );
  protected readonly chartLastPoint = computed(() => lastChartPoint(this.chartData(), CHART_W, CHART_H));

  constructor() {
    const clock = setInterval(() => this.now.set(new Date()), CLOCK_TICK_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(clock));

    // Entrada automática no Modo Focus: sem guard, porque um guard bloquearia a navegação
    // esperando o Firestore e daria tela branca. O painel renderiza normal e só redireciona
    // quando a resposta chega. O serviço já devolve `null` para "não dispensar" (sem jogo hoje,
    // já dispensado, deslogado ou leitura falhou) — o painel não precisa saber qual caso é.
    void this.focusDay.resolve().then((target) => {
      if (target) void this.router.navigate(['/torneios', target.tournamentId, 'focus']);
    });

    effect((onCleanup) => {
      const user = this.auth.user();
      this.syncError.set(null);

      if (!user) {
        this.bookingsState.set([]);
        this.rankingState.set(null);
        this.completedMatchesState.set([]);
        this.myTeamIdsState.set(new Set());
        this.communityState.set([]);
        this.missionsDoneState.set(new Set());
        this.myTournamentsState.set([]);
        this.inProgressRegistrationsState.set([]);
        this.pendingInvitesState.set([]);
        this.profilePhotoUrlState.set(null);
        this.loadingRanking.set(false);
        this.bootLoadingState.set(false);
        return;
      }

      if (!this.firestore) {
        this.syncError.set('Firebase nao configurado para sincronizar os dados reais do painel.');
        this.bootLoadingState.set(false);
        return;
      }

      this.loadingRanking.set(true);
      this.bootLoadingState.set(true);

      const stopBookings = watchMyBookings(
        this.firestore,
        user.uid,
        (bookings) => {
          this.bookingsState.set(bookings);
          this.bootLoadingState.set(false);
        },
        () => {
          this.syncError.set('Nao foi possivel atualizar as reservas agora.');
          this.bootLoadingState.set(false);
        },
      );

      void this.loadRanking(user.uid);

      const stopCommunity = watchCommunityFeed(
        this.firestore,
        (items) => this.communityState.set(items),
        () => this.communityState.set([]),
        8,
      );

      const stopMissions = watchDailyMissions(
        this.firestore,
        user.uid,
        (done) => this.missionsDoneState.set(done),
        () => this.missionsDoneState.set(new Set()),
      );

      void this.loadMatchHistory(user.uid);
      void this.loadRegistrationsAndTournaments(user.uid);
      void this.loadPendingInvites(user.uid);
      void this.loadProfilePhoto(user.uid);

      onCleanup(() => {
        stopBookings();
        stopCommunity();
        stopMissions();
      });
    });
  }

  /** Ranking geral: a posição não existe no doc do atleta, é derivada da coleção ordenada. */
  private async loadRanking(uid: string): Promise<void> {
    const db = this.firestore;
    const projectId = environment.firebase.projectId;
    if (!db || !projectId) {
      this.loadingRanking.set(false);
      return;
    }
    try {
      const row = await fetchAthleteRankingPosition(db, projectId, uid);
      if (this.auth.user()?.uid !== uid) return;
      this.rankingState.set(
        row == null
          ? null
          : {
              positionLabel: `#${row.position}`,
              pointsLabel: `${new Intl.NumberFormat('pt-BR').format(Math.round(row.totalPoints))} pts`,
              categoryLabel: `${row.tournamentsCount} ${row.tournamentsCount === 1 ? 'torneio' : 'torneios'}`,
            },
      );
    } catch {
      if (this.auth.user()?.uid !== uid) return;
      this.syncError.set('Nao foi possivel atualizar seu ranking agora.');
    } finally {
      if (this.auth.user()?.uid === uid) this.loadingRanking.set(false);
    }
  }

  private async loadMatchHistory(uid: string): Promise<void> {
    const db = this.firestore;
    const projectId = environment.firebase.projectId;
    if (!db || !projectId) return;
    try {
      const teams = (await fetchTeamsForAthlete(db, projectId, uid)).slice(0, MAX_TEAMS_FETCH);
      if (this.auth.user()?.uid !== uid) return;
      const lists = await Promise.all(teams.map((t) => fetchMatchesForTeam(db, projectId, t.id)));
      if (this.auth.user()?.uid !== uid) return;
      const byId = new Map<string, ArenaMatch>();
      for (const match of lists.flat()) {
        if (matchIsCompleted(match)) byId.set(match.id, match);
      }
      this.myTeamIdsState.set(new Set(teams.map((t) => t.id)));
      this.completedMatchesState.set([...byId.values()]);
    } catch {
      this.syncError.set('Nao foi possivel carregar seu historico de partidas agora.');
    }
  }

  /** Uma leitura só de `inscriptions` + torneios alimenta as duas visões: "Meus torneios"
   *  (lista completa, inclui as confirmadas) e o card de acompanhamento (só as que ainda têm
   *  próximo passo). */
  private async loadRegistrationsAndTournaments(uid: string): Promise<void> {
    const db = this.firestore;
    const projectId = environment.firebase.projectId;
    if (!db || !projectId) return;
    try {
      const registrations = await fetchMyRegistrations(db, projectId, uid);
      const ids = [...new Set(registrations.map((r) => r.tournamentId).filter(Boolean))];
      const summaries = await fetchTournamentSummariesByIds(db, ids);
      if (this.auth.user()?.uid !== uid) return;

      await this.setInProgressRegistrations(registrations, summaries, uid);
      if (this.auth.user()?.uid !== uid) return;

      const items = registrations
        .map((reg) => {
          const tournament = summaries.get(reg.tournamentId);
          // Cancelado pelo organizador some da lista: "Inscrito" num torneio que não vai
          // acontecer é informação errada. O aviso do cancelamento chega por notificação
          // (`notifyPaidTeamsOfCancellation`) e o torneio segue acessível pelo link direto.
          if (!tournament || tournament.isCancelled) return null;
          const status: Pick<MyTournamentItem, 'statusLabel' | 'statusTone'> = reg.waitlist
            ? { statusLabel: 'Lista de espera', statusTone: 'yellow' }
            : reg.partnerPending
              ? { statusLabel: 'Aguardando dupla', statusTone: 'yellow' }
              : reg.isPaid
                ? { statusLabel: 'Inscrito', statusTone: 'green' }
                : { statusLabel: 'Pagamento pendente', statusTone: 'yellow' };
          return {
            id: reg.tournamentId,
            name: tournament.name,
            meta: [tournament.dateLabel, tournament.city].filter(Boolean).join(' · ') || 'Datas a definir',
            sortAt: tournament.startAt?.getTime() ?? 0,
            ...status,
          };
        })
        .filter((item): item is MyTournamentItem & { sortAt: number } => item != null)
        .sort((a, b) => b.sortAt - a.sortAt)
        .slice(0, MY_TOURNAMENTS_LIMIT)
        .map(({ sortAt: _sortAt, ...item }) => item);

      this.myTournamentsState.set(items);
    } catch {
      // Lista vazia é estado válido; sem banner por falha pontual.
      this.myTournamentsState.set([]);
      this.inProgressRegistrationsState.set([]);
    }
  }

  /** Nomes dos parceiros vêm de `public_profiles` (o doc de `teams` só guarda uids). Falha aqui
   *  não derruba o card: sem nome, o passo Dupla cai em "Dupla formada". */
  private async setInProgressRegistrations(
    registrations: readonly AthleteTournamentRegistration[],
    summaries: ReadonlyMap<string, TournamentSummary>,
    uid: string,
  ): Promise<void> {
    const db = this.firestore;
    if (!db) return;
    const partnerNames = new Map<string, string>();
    try {
      const profiles = await fetchPublicProfilesByIds(db, partnerUidsOf(registrations, uid));
      for (const [id, profile] of profiles) partnerNames.set(id, profile.displayName);
    } catch {
      // Segue sem nomes.
    }
    if (this.auth.user()?.uid !== uid) return;
    this.inProgressRegistrationsState.set(
      buildInProgressRegistrations(registrations, summaries, uid, this.accountLabel(), partnerNames),
    );
  }

  private async loadPendingInvites(uid: string): Promise<void> {
    const db = this.firestore;
    if (!db) return;
    try {
      const invites = await fetchMyPendingPartnerInvites(db, uid);
      if (this.auth.user()?.uid !== uid) return;
      const ids = [...new Set(invites.map((i) => i.tournamentId).filter(Boolean))];
      const summaries = await fetchTournamentSummariesByIds(db, ids);
      if (this.auth.user()?.uid !== uid) return;
      this.pendingInvitesState.set(
        invites
          // Convite de torneio cancelado é botão que só entrega erro: `acceptTournamentPartnerInvite`
          // recusa com "Este torneio não aceita novas inscrições". Torneio que não resolveu (fetch
          // parcial) continua aparecendo com o nome genérico — só o cancelado sai.
          .filter((i) => summaries.get(i.tournamentId)?.isCancelled !== true)
          .map((i) => ({
            id: i.id,
            inviterName: i.inviterName,
            tournamentId: i.tournamentId,
            categoryId: i.categoryId,
            tournamentName: summaries.get(i.tournamentId)?.name ?? 'Torneio',
          })),
      );
    } catch {
      // Sem card de convites é estado válido; sem banner por falha pontual (mesmo padrão de "Meus torneios").
      this.pendingInvitesState.set([]);
    }
  }

  private async loadProfilePhoto(uid: string): Promise<void> {
    const db = this.firestore;
    if (!db) return;
    try {
      const profile = await fetchMyAthleteProfile(db, uid);
      if (this.auth.user()?.uid !== uid) return;
      this.profilePhotoUrlState.set(profile?.profilePhotoUrl ?? null);
    } catch {
      this.profilePhotoUrlState.set(null);
    }
  }

  /** Convite escolhido pro aceite rápido — abre o dialog do termo LGPD antes de
   *  confirmar (o aceite do termo é obrigatório pra formar a dupla). */
  protected readonly lgpdInviteToAccept = signal<PendingInviteItem | null>(null);

  protected acceptInviteQuick(invite: PendingInviteItem): void {
    if (this.respondingInviteId()) return;
    this.lgpdInviteToAccept.set(invite);
  }

  protected confirmLgpdAndAccept(): void {
    const invite = this.lgpdInviteToAccept();
    this.lgpdInviteToAccept.set(null);
    if (invite) void this.submitAcceptInvite(invite);
  }

  /** Aceite rápido — sem uniforme aqui (o backend aceita sem, coleta depois na inscrição;
   *  é o mesmo comportamento de "Salvar uniforme" na tela de inscrição). */
  private async submitAcceptInvite(invite: PendingInviteItem): Promise<void> {
    if (this.respondingInviteId()) return;
    this.respondingInviteId.set(invite.id);
    try {
      await acceptPartnerInvite(athleteFunctions(), invite.id, undefined, { lgpdAccepted: true });
      this.pendingInvitesState.update((list) => list.filter((i) => i.id !== invite.id));
      // Depois de aceitar, o próximo passo real é completar a inscrição (uniforme/pagamento)
      // — leva direto pra lá em vez de deixar o atleta no painel.
      void this.router.navigate(['/torneios', invite.tournamentId, 'inscricao'], {
        queryParams: { categoria: invite.categoryId },
      });
    } catch (err) {
      this.toasts.error(
        'Não foi possível aceitar o convite',
        err instanceof TournamentRegistrationError ? err.message : 'O serviço não respondeu — tente de novo.',
        // Termo já aceito no dialog — a retentativa vai direto pro envio.
        { label: 'Tentar novamente', run: () => void this.submitAcceptInvite(invite) },
      );
    } finally {
      this.respondingInviteId.set(null);
    }
  }

  protected async declineInviteQuick(invite: PendingInviteItem): Promise<void> {
    if (this.respondingInviteId()) return;
    this.respondingInviteId.set(invite.id);
    try {
      await declinePartnerInvite(athleteFunctions(), invite.id);
      this.pendingInvitesState.update((list) => list.filter((i) => i.id !== invite.id));
    } catch (err) {
      this.toasts.error(
        'Não foi possível recusar o convite',
        err instanceof TournamentRegistrationError ? err.message : 'O convite continua na sua lista — tente de novo.',
      );
    } finally {
      this.respondingInviteId.set(null);
    }
  }

  /** Cancelamento de inscrição a partir do tracker — só chega aqui item com `canCancel`
   *  (nenhum pagamento); o backend revalida e recusa paga/meio-paga. */
  protected readonly registrationToCancel = signal<RegistrationProgress | null>(null);
  protected readonly cancellingRegistration = signal(false);

  protected askCancelRegistration(item: RegistrationProgress): void {
    this.registrationToCancel.set(item);
  }

  protected closeCancelRegistration(): void {
    if (!this.cancellingRegistration()) this.registrationToCancel.set(null);
  }

  protected async confirmCancelRegistration(): Promise<void> {
    const target = this.registrationToCancel();
    if (!target || this.cancellingRegistration()) return;
    this.cancellingRegistration.set(true);
    try {
      await cancelMyRegistration(athleteFunctions(), target.registrationId);
      this.inProgressRegistrationsState.update((list) =>
        list.filter((i) => i.registrationId !== target.registrationId),
      );
      this.registrationToCancel.set(null);
      this.toasts.success('Inscrição cancelada', 'Sua vaga foi liberada para outro atleta.');
    } catch (err) {
      this.toasts.error(
        'Não foi possível cancelar',
        err instanceof TournamentRegistrationError ? err.message : 'O serviço não respondeu — tente de novo.',
      );
    } finally {
      this.cancellingRegistration.set(false);
    }
  }

  protected setChartTab(tab: ChartTab): void {
    this.activeChartTab.set(tab);
  }

  /** O painel se alimenta de watchers montados num effect sobre o usuário; não
   *  há um "carregar de novo" isolado pra chamar. Recarregar a página é o
   *  caminho honesto — e é o que o banner promete ao atleta. */
  protected reloadPanel(): void {
    location.reload();
  }
}
