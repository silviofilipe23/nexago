import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import {
  collection,
  doc,
  getFirestore,
  limit,
  onSnapshot,
  query,
  where,
  type DocumentData,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { environment } from '../environments/environment';
import { AuthService } from './auth/auth.service';
import { AtBellComponent } from './painel/at-bell.component';
import { AtPanelShellComponent } from './painel/at-panel-shell.component';
import { NxSkeletonComponent } from './shared/loading/nx-skeleton.component';
import { watchCommunityFeed, type CommunityFeedItem } from './data/community-feed-repository';
import { DAILY_MISSION_CATALOG, watchDailyMissions } from './data/daily-missions-repository';
import { fetchMatchesForTeam, fetchTeamsForAthlete, matchIsCompleted, type ArenaMatch } from './data/teams-repository';
import { fetchMyRegistrations } from './data/tournament-registrations-repository';
import { fetchTournamentSummariesByIds } from './data/tournaments-repository';
import { AthleteGamificationService } from './profile/athlete-gamification.service';

type DashboardTone = 'accent' | 'success' | 'warning' | 'neutral';
type ChartTab = 'Jogos' | 'Vitórias';
type KpiTone = 'green' | 'orange';

interface DashboardReservation {
  id: string;
  sortKey: string;
  arenaName: string;
  courtName: string;
  dateLabel: string;
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
  trendLabel: string;
  highlightLabel: string;
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

interface MyTournamentItem {
  id: string;
  name: string;
  meta: string;
  statusLabel: string;
  statusTone: 'yellow' | 'green';
}

const PREVIEW_RESERVATIONS: readonly DashboardReservation[] = [
  {
    id: 'preview-booking-1',
    sortKey: '2026-04-15T19:00',
    arenaName: 'Arena Central',
    courtName: 'Quadra 2',
    dateLabel: '15 abr',
    timeLabel: '19:00 - 20:30',
    statusLabel: 'Confirmada',
    statusTone: 'success',
    amountLabel: 'R$ 68',
    caption: 'Sua dupla ja confirmou presenca.',
  },
];

const PREVIEW_RANKING: DashboardRanking = {
  positionLabel: '#27',
  pointsLabel: '1.240 pts',
  categoryLabel: 'Misto C',
  trendLabel: 'Subiu 3 posicoes nas ultimas semanas.',
  highlightLabel: 'Seu volume de jogos esta ajudando a ganhar ritmo.',
};

const CHART_TABS: readonly ChartTab[] = ['Jogos', 'Vitórias'];
const CHART_W = 802;
const CHART_H = 120;
const CHART_MONTH_COUNT = 12;
/** Teto de times consultados pro histórico — evita N+1 sem limite em contas antigas. */
const MAX_TEAMS_FETCH = 12;
const MY_TOURNAMENTS_LIMIT = 4;

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

function readString(data: DocumentData | null | undefined, keys: readonly string[]): string | null {
  if (!data) {
    return null;
  }
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function readNumber(data: DocumentData | null | undefined, keys: readonly string[]): number | null {
  if (!data) {
    return null;
  }
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        return numeric;
      }
    }
  }
  return null;
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

function formatBookingDate(value: string | null): string {
  if (!value) {
    return 'Data a confirmar';
  }
  const parsed = new Date(`${value}T00:00:00`);
  if (!Number.isFinite(parsed.getTime())) {
    return value;
  }
  return formatCompactDate(parsed);
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

function bookingStatus(status: string | null): Pick<DashboardReservation, 'statusLabel' | 'statusTone'> {
  const normalized = status?.trim().toUpperCase() ?? '';
  switch (normalized) {
    case 'CONFIRMED':
    case 'BOOKED':
      return { statusLabel: 'Confirmada', statusTone: 'success' };
    case 'PAY_AT_ARENA':
      return { statusLabel: 'Pagar na arena', statusTone: 'warning' };
    case 'CHECKIN_OPEN':
      return { statusLabel: 'Check-in aberto', statusTone: 'accent' };
    case 'CANCELED':
    case 'CANCELLED':
      return { statusLabel: 'Cancelada', statusTone: 'neutral' };
    case 'PENDING':
      return { statusLabel: 'Em processamento', statusTone: 'accent' };
    default:
      return {
        statusLabel: normalized ? titleCase(normalized) : 'Em atualizacao',
        statusTone: 'neutral',
      };
  }
}

function bookingSortValue(item: DashboardReservation): string {
  return item.sortKey;
}

function mapBookingDoc(docSnap: QueryDocumentSnapshot<DocumentData>): DashboardReservation {
  const data = docSnap.data();
  const statusInfo = bookingStatus(readString(data, ['status']));
  const startTime = readString(data, ['startTime']) ?? '--:--';
  const endTime = readString(data, ['endTime']) ?? '--:--';

  return {
    id: docSnap.id,
    sortKey: `${readString(data, ['date']) ?? '9999-12-31'}T${startTime}`,
    arenaName: readString(data, ['arenaName', 'arena']) ?? 'Arena NexaGO',
    courtName: readString(data, ['courtName', 'court']) ?? 'Quadra',
    dateLabel: formatBookingDate(readString(data, ['date'])),
    timeLabel: `${startTime} - ${endTime}`,
    statusLabel: statusInfo.statusLabel,
    statusTone: statusInfo.statusTone,
    amountLabel: formatCurrency(readNumber(data, ['amountReais', 'amount', 'price'])),
    caption:
      readString(data, ['notes', 'note']) ??
      (statusInfo.statusLabel === 'Pagar na arena'
        ? 'Leve um documento e chegue alguns minutos antes.'
        : 'Acompanhe detalhes e combinados por aqui.'),
  };
}

function mapRankingDoc(data: DocumentData | null): DashboardRanking | null {
  if (!data) {
    return null;
  }

  const position = readNumber(data, ['position', 'rank', 'placement']);
  const points = readNumber(data, ['points', 'score', 'rankingPoints']);
  const category =
    readString(data, ['categoryLabel', 'category', 'categoryId', 'division']) ??
    'Categoria em atualizacao';

  if (position == null && points == null && category === 'Categoria em atualizacao') {
    return null;
  }

  return {
    positionLabel: position != null ? `#${Math.round(position)}` : 'Sem ranking',
    pointsLabel:
      points != null
        ? `${new Intl.NumberFormat('pt-BR').format(Math.round(points))} pts`
        : 'Sem pontuacao',
    categoryLabel: category,
    trendLabel:
      readString(data, ['trendLabel', 'trend', 'movement']) ??
      'Sua posicao aparece aqui assim que os resultados entrarem.',
    highlightLabel:
      readString(data, ['highlightLabel', 'highlight', 'summary']) ??
      'Resultados novos alimentam este bloco automaticamente.',
  };
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
  imports: [RouterLink, AtPanelShellComponent, AtBellComponent, NxSkeletonComponent],
  templateUrl: './athlete-painel.component.html',
  styleUrl: './athlete-painel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AthletePainelComponent {
  protected readonly auth = inject(AuthService);
  private readonly gamification = inject(AthleteGamificationService);
  private readonly firestore = createFirestore();

  private readonly liveReservationsState = signal<DashboardReservation[]>([]);
  private readonly liveRankingState = signal<DashboardRanking | null>(null);
  /** Partidas de torneio CONCLUÍDAS dos times do atleta (fonte real de jogos/vitórias). */
  private readonly completedMatchesState = signal<ArenaMatch[]>([]);
  private readonly myTeamIdsState = signal<ReadonlySet<string>>(new Set());
  private readonly communityState = signal<CommunityFeedItem[]>([]);
  private readonly missionsDoneState = signal<ReadonlySet<string>>(new Set());
  private readonly myTournamentsState = signal<MyTournamentItem[]>([]);

  protected readonly loadingRanking = signal(false);
  protected readonly syncError = signal<string | null>(null);
  /** Primeira carga do painel logado — desliga na primeira emissão do snapshot de reservas
   *  (dispara rápido mesmo vazio). Sem sessão (preview), nem chega a ligar. */
  protected readonly bootLoading = signal(true);

  protected readonly chartTabs = CHART_TABS;
  protected readonly chartW = CHART_W;
  protected readonly chartH = CHART_H;

  protected readonly activeChartTab = signal<ChartTab>('Jogos');

  protected readonly hasLiveSession = computed(() => this.auth.user() != null);
  protected readonly greeting = computed(() => greetingByHour());
  protected readonly todayLabel = computed(() => formatTodayLabel());
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
  protected readonly accountSubline = computed(() => {
    if (this.hasLiveSession()) {
      return 'Conta conectada com dados reais de reservas, ranking e notificacoes.';
    }
    return 'Modo preview ativo. O layout ja esta pronto para receber os dados reais assim que houver login Firebase.';
  });
  protected readonly reservations = computed(() =>
    this.hasLiveSession() ? this.liveReservationsState() : [...PREVIEW_RESERVATIONS],
  );
  protected readonly ranking = computed(() =>
    this.hasLiveSession() ? this.liveRankingState() : PREVIEW_RANKING,
  );
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
    const currentKey = monthKeyOf(new Date());

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
    const current = monthKeyOf(new Date());
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
    effect((onCleanup) => {
      const user = this.auth.user();
      this.syncError.set(null);

      if (!user) {
        this.liveReservationsState.set([]);
        this.liveRankingState.set(null);
        this.completedMatchesState.set([]);
        this.myTeamIdsState.set(new Set());
        this.communityState.set([]);
        this.missionsDoneState.set(new Set());
        this.myTournamentsState.set([]);
        this.loadingRanking.set(false);
        this.bootLoading.set(false);
        return;
      }

      if (!this.firestore) {
        this.syncError.set('Firebase nao configurado para sincronizar os dados reais do painel.');
        this.bootLoading.set(false);
        return;
      }

      this.loadingRanking.set(true);
      this.bootLoading.set(true);

      const bookingsQuery = query(
        collection(this.firestore, 'arenaBookings'),
        where('athleteId', '==', user.uid),
        limit(8),
      );

      const stopBookings = onSnapshot(
        bookingsQuery,
        (snapshot) => {
          const next = snapshot.docs
            .map(mapBookingDoc)
            .sort((a, b) => bookingSortValue(a).localeCompare(bookingSortValue(b), 'pt-BR'));
          this.liveReservationsState.set(next);
          this.bootLoading.set(false);
        },
        () => {
          this.syncError.set('Nao foi possivel atualizar as reservas agora.');
          this.bootLoading.set(false);
        },
      );

      const stopRankingDoc = onSnapshot(
        doc(this.firestore, 'artifacts', environment.firebase.projectId!, 'public', 'data', 'athleteRankings', user.uid),
        (snapshot) => {
          this.liveRankingState.set(mapRankingDoc(snapshot.exists() ? snapshot.data() : null));
          this.loadingRanking.set(false);
        },
        () => {
          this.syncError.set('Nao foi possivel atualizar seu ranking agora.');
          this.loadingRanking.set(false);
        },
      );

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
      void this.loadMyTournaments(user.uid);

      onCleanup(() => {
        stopBookings();
        stopRankingDoc();
        stopCommunity();
        stopMissions();
      });
    });
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

  private async loadMyTournaments(uid: string): Promise<void> {
    const db = this.firestore;
    const projectId = environment.firebase.projectId;
    if (!db || !projectId) return;
    try {
      const registrations = await fetchMyRegistrations(db, projectId, uid);
      const ids = [...new Set(registrations.map((r) => r.tournamentId).filter(Boolean))];
      const summaries = await fetchTournamentSummariesByIds(db, ids);
      if (this.auth.user()?.uid !== uid) return;

      const items = registrations
        .map((reg) => {
          const tournament = summaries.get(reg.tournamentId);
          if (!tournament) return null;
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
      // "Meus torneios" vazio é estado válido; sem banner por falha pontual.
      this.myTournamentsState.set([]);
    }
  }

  protected setChartTab(tab: ChartTab): void {
    this.activeChartTab.set(tab);
  }
}
