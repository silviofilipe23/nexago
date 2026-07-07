import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import {
  collection,
  doc,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { environment } from '../environments/environment';
import { AuthService } from './auth/auth.service';
import { AtPanelShellComponent } from './painel/at-panel-shell.component';

type DashboardTone = 'accent' | 'success' | 'warning' | 'neutral';
type ChartTab = 'Jogos' | 'Vitórias' | 'XP';
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

interface DashboardNotification {
  id: string;
  title: string;
  body: string;
  timeLabel: string;
  unread: boolean;
  tone: DashboardTone;
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
  tone: KpiTone;
  icon?: 'flame';
}

interface NetworkActivityItem {
  id: string;
  initials: string;
  hue: number;
  name: string;
  message: string;
  time: string;
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
  {
    id: 'preview-booking-2',
    sortKey: '2026-04-18T08:00',
    arenaName: 'Nexa Beach Club',
    courtName: 'Quadra Principal',
    dateLabel: '18 abr',
    timeLabel: '08:00 - 09:30',
    statusLabel: 'Pagar na arena',
    statusTone: 'warning',
    amountLabel: 'R$ 55',
    caption: 'Leve documento para check-in rapido.',
  },
  {
    id: 'preview-booking-3',
    sortKey: '2026-04-22T20:00',
    arenaName: 'Sunset Volley',
    courtName: 'Quadra 1',
    dateLabel: '22 abr',
    timeLabel: '20:00 - 21:30',
    statusLabel: 'Em processamento',
    statusTone: 'accent',
    amountLabel: null,
    caption: 'Acompanhe aqui quando a confirmacao chegar.',
  },
];

const PREVIEW_NOTIFICATIONS: readonly DashboardNotification[] = [
  {
    id: 'preview-notification-1',
    title: 'Reserva confirmada',
    body: 'Sua agenda na Arena Central foi confirmada e ja esta pronta para compartilhar.',
    timeLabel: 'agora',
    unread: true,
    tone: 'success',
  },
  {
    id: 'preview-notification-2',
    title: 'Inscricoes abertas',
    body: 'A categoria Intermediario misto abriu novas vagas para o fim de semana.',
    timeLabel: 'ha 2 h',
    unread: true,
    tone: 'accent',
  },
  {
    id: 'preview-notification-3',
    title: 'Perfil em destaque',
    body: 'Complete seu perfil publico para aparecer melhor no hub de atletas.',
    timeLabel: 'ontem',
    unread: false,
    tone: 'neutral',
  },
];

const PREVIEW_RANKING: DashboardRanking = {
  positionLabel: '#27',
  pointsLabel: '1.240 pts',
  categoryLabel: 'Misto C',
  trendLabel: 'Subiu 3 posicoes nas ultimas semanas.',
  highlightLabel: 'Seu volume de jogos esta ajudando a ganhar ritmo.',
};

const CHART_MONTHS: readonly string[] = [
  'Ago', 'Set', 'Out', 'Nov', 'Dez', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul',
];

const CHART_DATASETS: Record<ChartTab, readonly number[]> = {
  Jogos: [2, 3, 4, 3, 5, 6, 5, 7, 8, 10, 11, 14],
  Vitórias: [40, 45, 42, 50, 55, 52, 58, 60, 63, 65, 66, 68],
  XP: [120, 180, 150, 220, 260, 240, 300, 340, 380, 420, 460, 540],
};

const CHART_TABS: readonly ChartTab[] = ['Jogos', 'Vitórias', 'XP'];
const CHART_W = 802;
const CHART_H = 120;

const NETWORK_ACTIVITY: readonly NetworkActivityItem[] = [
  {
    id: 'activity-1',
    initials: 'EN',
    hue: 130,
    name: 'Enzo R.',
    message: 'está procurando dupla pra hoje 22h em Arena CFC.',
    time: '14:32',
  },
  {
    id: 'activity-2',
    initials: 'BR',
    hue: 280,
    name: 'Bruno V.',
    message: 'venceu o desafio e subiu pro Nível 4.',
    time: '13:05',
  },
  {
    id: 'activity-3',
    initials: 'CA',
    hue: 320,
    name: 'Camila S.',
    message: 'se inscreveu na Etapa garden.',
    time: '11:48',
  },
  {
    id: 'activity-4',
    initials: 'JU',
    hue: 200,
    name: 'Júlia P.',
    message: 'te chamou pro jogo de sábado.',
    time: '10:22',
  },
];

const MISSIONS: readonly MissionItem[] = [
  { id: 'play', label: 'Jogue 1x hoje', xp: 40, done: false },
  { id: 'invite', label: 'Convide 1 jogador', xp: 30, done: false },
];

const MEUS_TORNEIOS: readonly MyTournamentItem[] = [
  {
    id: 'my-tournament-1',
    name: 'Etapa garden',
    meta: '21/07 · Beach Tennis',
    statusLabel: 'Inscrito',
    statusTone: 'yellow',
  },
  {
    id: 'my-tournament-2',
    name: 'Copa Goiás Beach',
    meta: '2/6 etapas · Liga',
    statusLabel: 'Ativo',
    statusTone: 'green',
  },
];

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

function notificationTone(type: string | null): DashboardTone {
  const normalized = type?.trim().toLowerCase() ?? '';
  if (normalized.includes('booking') || normalized.includes('reserva')) {
    return 'success';
  }
  if (normalized.includes('payment') || normalized.includes('pag')) {
    return 'warning';
  }
  if (normalized.includes('tournament') || normalized.includes('torneio')) {
    return 'accent';
  }
  return 'neutral';
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

function mapNotificationDoc(docSnap: QueryDocumentSnapshot<DocumentData>): DashboardNotification {
  const data = docSnap.data();
  const title = readString(data, ['title']) ?? 'Atualizacao da conta';
  return {
    id: docSnap.id,
    title,
    body: readString(data, ['body', 'message']) ?? 'Sua central de notificacoes vai reunir novidades da agenda e do ranking.',
    timeLabel: formatRelativeTime(data['createdAt']),
    unread: data['read'] !== true,
    tone: notificationTone(readString(data, ['type'])),
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
  return { max: Math.max(...data) * 1.15, min: Math.min(...data) * 0.75 };
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

@Component({
  selector: 'app-athlete-painel',
  standalone: true,
  imports: [RouterLink, AtPanelShellComponent],
  templateUrl: './athlete-painel.component.html',
  styleUrl: './athlete-painel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AthletePainelComponent {
  protected readonly auth = inject(AuthService);
  private readonly firestore = createFirestore();

  private readonly liveReservationsState = signal<DashboardReservation[]>([]);
  private readonly liveNotificationsState = signal<DashboardNotification[]>([]);
  private readonly liveRankingState = signal<DashboardRanking | null>(null);

  protected readonly loadingRanking = signal(false);
  protected readonly syncError = signal<string | null>(null);

  protected readonly networkActivity = NETWORK_ACTIVITY;
  protected readonly missions = MISSIONS;
  protected readonly myTournaments = MEUS_TORNEIOS;
  protected readonly chartTabs = CHART_TABS;
  protected readonly chartMonths = CHART_MONTHS;
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
  protected readonly notifications = computed(() =>
    this.hasLiveSession() ? this.liveNotificationsState() : [...PREVIEW_NOTIFICATIONS],
  );
  protected readonly ranking = computed(() =>
    this.hasLiveSession() ? this.liveRankingState() : PREVIEW_RANKING,
  );
  protected readonly nextReservation = computed(() => this.reservations()[0] ?? null);
  protected readonly nextReservationMapsUrl = computed(() => {
    const reservation = this.nextReservation();
    return reservation ? mapsSearchUrl(reservation.arenaName) : null;
  });
  protected readonly unreadNotifications = computed(
    () => this.notifications().filter((notification) => notification.unread).length,
  );

  protected readonly kpis = computed<DashboardKpi[]>(() => {
    const ranking = this.ranking();
    return [
      { label: 'Jogos no mês', value: '14', delta: '12%', tone: 'green' },
      { label: 'Vitórias', value: '68%', delta: '4%', tone: 'green' },
      { label: 'Sequência', value: '3 dias', delta: 'em jogo', tone: 'orange', icon: 'flame' },
      {
        label: 'Ranking municipal',
        value: ranking?.positionLabel ?? '#412',
        delta: '18 posições',
        tone: 'green',
      },
    ];
  });

  protected readonly missionsDone = computed(() => this.missions.filter((mission) => mission.done).length);

  protected readonly chartData = computed(() => CHART_DATASETS[this.activeChartTab()]);
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
        this.liveNotificationsState.set([]);
        this.liveRankingState.set(null);
        this.loadingRanking.set(false);
        return;
      }

      if (!this.firestore) {
        this.syncError.set('Firebase nao configurado para sincronizar os dados reais do painel.');
        return;
      }

      this.loadingRanking.set(true);

      const bookingsQuery = query(
        collection(this.firestore, 'arenaBookings'),
        where('athleteId', '==', user.uid),
        limit(8),
      );

      const notificationsQuery = query(
        collection(this.firestore, 'users', user.uid, 'notifications'),
        orderBy('createdAt', 'desc'),
        limit(6),
      );

      const stopBookings = onSnapshot(
        bookingsQuery,
        (snapshot) => {
          const next = snapshot.docs
            .map(mapBookingDoc)
            .sort((a, b) => bookingSortValue(a).localeCompare(bookingSortValue(b), 'pt-BR'));
          this.liveReservationsState.set(next);
        },
        () => {
          this.syncError.set('Nao foi possivel atualizar as reservas agora.');
        },
      );

      const stopNotifications = onSnapshot(
        notificationsQuery,
        (snapshot) => {
          this.liveNotificationsState.set(snapshot.docs.map(mapNotificationDoc));
        },
        () => {
          this.syncError.set('Nao foi possivel carregar as notificacoes agora.');
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

      onCleanup(() => {
        stopBookings();
        stopNotifications();
        stopRankingDoc();
      });
    });
  }

  protected setChartTab(tab: ChartTab): void {
    this.activeChartTab.set(tab);
  }

  protected jumpTo(sectionId: string): void {
    const target = globalThis.document?.getElementById(sectionId);
    if (!target) {
      return;
    }
    const prefersReducedMotion =
      typeof globalThis.matchMedia === 'function' &&
      globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;

    target.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'start',
    });
  }
}
