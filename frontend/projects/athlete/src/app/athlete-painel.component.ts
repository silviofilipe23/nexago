import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
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

type DashboardTone = 'accent' | 'success' | 'warning' | 'neutral';

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

interface DashboardTournament {
  id: string;
  name: string;
  dateLabel: string;
  cityLabel: string;
  levelLabel: string;
  note: string;
  tone: DashboardTone;
}

interface DashboardRanking {
  positionLabel: string;
  pointsLabel: string;
  categoryLabel: string;
  trendLabel: string;
  highlightLabel: string;
}

interface DashboardProfile {
  fullName: string | null;
  city: string | null;
  level: string | null;
  partnerName: string | null;
  publicProfileEnabled: boolean;
  isPro: boolean;
  emailVerified: boolean;
}

interface DashboardChecklistItem {
  id: string;
  label: string;
  detail: string;
  done: boolean;
}

interface DashboardMetric {
  label: string;
  value: string;
  note: string;
  tone: DashboardTone;
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

const RECOMMENDED_TOURNAMENTS: readonly DashboardTournament[] = [
  {
    id: 'recommended-tournament-1',
    name: 'Open NexaGO Verao',
    dateLabel: '12 maio',
    cityLabel: 'Curitiba, PR',
    levelLabel: 'Intermediario',
    note: 'Ultimas vagas para duplas consistentes.',
    tone: 'warning',
  },
  {
    id: 'recommended-tournament-2',
    name: 'Circuito Duplas 2x2',
    dateLabel: '24 maio',
    cityLabel: 'Sao Paulo, SP',
    levelLabel: 'Avancado',
    note: 'Janela boa para quem quer somar pontos.',
    tone: 'accent',
  },
  {
    id: 'recommended-tournament-3',
    name: 'Copa Iniciantes Praia',
    dateLabel: '08 jun',
    cityLabel: 'Goiania, GO',
    levelLabel: 'Iniciante',
    note: 'Ideal para entrar no circuito sem pressao.',
    tone: 'success',
  },
];

const PREVIEW_RANKING: DashboardRanking = {
  positionLabel: '#27',
  pointsLabel: '1.240 pts',
  categoryLabel: 'Misto C',
  trendLabel: 'Subiu 3 posicoes nas ultimas semanas.',
  highlightLabel: 'Seu volume de jogos esta ajudando a ganhar ritmo.',
};

const PREVIEW_PROFILE: DashboardProfile = {
  fullName: null,
  city: 'Goiania',
  level: 'Intermediario',
  partnerName: null,
  publicProfileEnabled: true,
  isPro: false,
  emailVerified: true,
};

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

function readBoolean(data: DocumentData | null | undefined, keys: readonly string[]): boolean {
  if (!data) {
    return false;
  }
  for (const key of keys) {
    if (data[key] === true) {
      return true;
    }
  }
  return false;
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

function buildProfile(
  userEmailVerified: boolean,
  authDisplayName: string | null,
  userDoc: DocumentData | null,
  profileDoc: DocumentData | null,
): DashboardProfile {
  return {
    fullName:
      readString(userDoc, ['fullName', 'displayName', 'name']) ??
      readString(profileDoc, ['fullName', 'displayName', 'name']) ??
      authDisplayName,
    city: readString(profileDoc, ['city', 'cidade']) ?? readString(userDoc, ['city', 'cidade']),
    level:
      readString(profileDoc, ['level', 'nivel', 'category', 'categoria']) ??
      readString(userDoc, ['level', 'nivel', 'category', 'categoria']),
    partnerName:
      readString(profileDoc, ['favoritePartnerName', 'partnerName', 'duoPartnerName']) ??
      readString(userDoc, ['favoritePartnerName', 'partnerName']),
    publicProfileEnabled: readBoolean(profileDoc, ['publicProfileEnabled']),
    isPro: readBoolean(profileDoc, ['isPro']),
    emailVerified: userEmailVerified,
  };
}

@Component({
  selector: 'app-athlete-painel',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './athlete-painel.component.html',
  styleUrl: './athlete-painel.component.scss',
})
export class AthletePainelComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly firestore = createFirestore();

  private readonly liveReservationsState = signal<DashboardReservation[]>([]);
  private readonly liveNotificationsState = signal<DashboardNotification[]>([]);
  private readonly liveRankingState = signal<DashboardRanking | null>(null);
  private readonly liveUserDoc = signal<DocumentData | null>(null);
  private readonly liveProfileDoc = signal<DocumentData | null>(null);

  protected readonly loadingReservations = signal(false);
  protected readonly loadingNotifications = signal(false);
  protected readonly loadingProfile = signal(false);
  protected readonly loadingRanking = signal(false);
  protected readonly syncError = signal<string | null>(null);

  protected readonly recommendedTournaments = RECOMMENDED_TOURNAMENTS;

  protected readonly hasLiveSession = computed(() => this.auth.user() != null);
  protected readonly greeting = computed(() => greetingByHour());
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
  protected readonly profile = computed(() => {
    if (!this.hasLiveSession()) {
      return {
        ...PREVIEW_PROFILE,
        fullName: PREVIEW_PROFILE.fullName ?? this.accountLabel(),
      };
    }

    const liveUser = this.auth.user();
    return buildProfile(
      liveUser?.emailVerified ?? false,
      liveUser?.displayName?.trim() ?? null,
      this.liveUserDoc(),
      this.liveProfileDoc(),
    );
  });
  protected readonly nextReservation = computed(() => this.reservations()[0] ?? null);
  protected readonly unreadNotifications = computed(
    () => this.notifications().filter((notification) => notification.unread).length,
  );
  protected readonly checklist = computed<DashboardChecklistItem[]>(() => {
    const profile = this.profile();
    return [
      {
        id: 'identity',
        label: 'Nome esportivo pronto',
        detail: profile.fullName ? profile.fullName : 'Adicione como voce quer aparecer para outras duplas.',
        done: !!profile.fullName,
      },
      {
        id: 'verification',
        label: 'Conta validada',
        detail: profile.emailVerified ? 'Seu e-mail ja foi confirmado.' : 'Confirme o e-mail para reduzir atrito no check-in.',
        done: profile.emailVerified,
      },
      {
        id: 'level',
        label: 'Nivel e cidade informados',
        detail:
          profile.city && profile.level
            ? `${profile.city} · ${profile.level}`
            : 'Preencha cidade e nivel para receber indicacoes melhores.',
        done: !!profile.city && !!profile.level,
      },
      {
        id: 'visibility',
        label: 'Perfil publico configurado',
        detail:
          profile.publicProfileEnabled || (!!profile.fullName && !!profile.city && !!profile.level)
            ? 'Sua vitrine publica ja tem base para aparecer no hub.'
            : 'Complete seus dados para o perfil publico ficar atraente.',
        done: profile.publicProfileEnabled || (!!profile.fullName && !!profile.city && !!profile.level),
      },
      {
        id: 'pro',
        label: 'Conta PRO',
        detail: profile.isPro ? 'Beneficios PRO ativos no momento.' : 'Opcional para liberar recursos premium depois.',
        done: profile.isPro,
      },
    ];
  });
  protected readonly checklistProgress = computed(() => {
    const items = this.checklist();
    if (items.length === 0) {
      return 0;
    }
    const done = items.filter((item) => item.done).length;
    return Math.round((done / items.length) * 100);
  });
  protected readonly profileHeadline = computed(() => {
    const profile = this.profile();
    if (profile.isPro) {
      return 'Conta PRO ativa';
    }
    if (this.checklistProgress() >= 80) {
      return 'Perfil pronto para convites';
    }
    return 'Complete o perfil do atleta';
  });
  protected readonly metrics = computed<DashboardMetric[]>(() => {
    const nextReservation = this.nextReservation();
    const ranking = this.ranking();
    const profile = this.profile();
    return [
      {
        label: 'Proximo jogo',
        value: nextReservation?.dateLabel ?? 'Sem agenda',
        note: nextReservation ? `${nextReservation.arenaName} · ${nextReservation.timeLabel}` : 'Sua proxima reserva aparece aqui.',
        tone: nextReservation?.statusTone ?? 'neutral',
      },
      {
        label: 'Ranking',
        value: ranking?.positionLabel ?? 'Novo',
        note: ranking ? `${ranking.categoryLabel} · ${ranking.pointsLabel}` : 'Pontuacao entra depois das partidas.',
        tone: ranking ? 'accent' : 'neutral',
      },
      {
        label: 'Notificacoes',
        value: `${this.unreadNotifications()}`,
        note:
          this.unreadNotifications() > 0
            ? 'Itens novos aguardando sua atencao.'
            : 'Sem alertas novos no momento.',
        tone: this.unreadNotifications() > 0 ? 'warning' : 'success',
      },
      {
        label: 'Perfil',
        value: `${this.checklistProgress()}%`,
        note:
          profile.city && profile.level
            ? `${profile.city} · ${profile.level}`
            : 'Finalize seus dados para receber combinacoes melhores.',
        tone: this.checklistProgress() >= 80 ? 'success' : 'accent',
      },
    ];
  });

  constructor() {
    effect((onCleanup) => {
      const user = this.auth.user();
      this.syncError.set(null);

      if (!user) {
        this.liveReservationsState.set([]);
        this.liveNotificationsState.set([]);
        this.liveRankingState.set(null);
        this.liveUserDoc.set(null);
        this.liveProfileDoc.set(null);
        this.loadingReservations.set(false);
        this.loadingNotifications.set(false);
        this.loadingProfile.set(false);
        this.loadingRanking.set(false);
        return;
      }

      if (!this.firestore) {
        this.syncError.set('Firebase nao configurado para sincronizar os dados reais do painel.');
        return;
      }

      this.loadingReservations.set(true);
      this.loadingNotifications.set(true);
      this.loadingProfile.set(true);
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
          this.loadingReservations.set(false);
        },
        () => {
          this.syncError.set('Nao foi possivel atualizar as reservas agora.');
          this.loadingReservations.set(false);
        },
      );

      const stopNotifications = onSnapshot(
        notificationsQuery,
        (snapshot) => {
          this.liveNotificationsState.set(snapshot.docs.map(mapNotificationDoc));
          this.loadingNotifications.set(false);
        },
        () => {
          this.syncError.set('Nao foi possivel carregar as notificacoes agora.');
          this.loadingNotifications.set(false);
        },
      );

      const stopUserDoc = onSnapshot(
        doc(this.firestore, 'users', user.uid),
        (snapshot) => {
          this.liveUserDoc.set(snapshot.exists() ? snapshot.data() : null);
          this.loadingProfile.set(false);
        },
        () => {
          this.syncError.set('Nao foi possivel ler seu perfil basico agora.');
          this.loadingProfile.set(false);
        },
      );

      const stopProfileDoc = onSnapshot(
        doc(this.firestore, 'athlete_profiles', user.uid),
        (snapshot) => {
          this.liveProfileDoc.set(snapshot.exists() ? snapshot.data() : null);
          this.loadingProfile.set(false);
        },
        () => {
          this.syncError.set('Nao foi possivel ler o perfil completo do atleta agora.');
          this.loadingProfile.set(false);
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
        stopUserDoc();
        stopProfileDoc();
        stopRankingDoc();
      });
    });
  }

  protected async logout(): Promise<void> {
    await this.auth.signOutUser();
    await this.router.navigateByUrl('/');
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
