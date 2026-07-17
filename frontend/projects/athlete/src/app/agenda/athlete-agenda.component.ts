import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { interval } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { athleteFunctions } from '../data/functions';
import { bookingIsActive, bookingNeedsPayment, fetchMyBookings, type MyBooking } from '../data/my-bookings-repository';
import {
  acceptPartnerInvite,
  declinePartnerInvite,
  fetchMyPendingPartnerInvites,
  fetchMyRegistrations,
  type AthleteTournamentRegistration,
  type TournamentPartnerInvite,
  type UniformInput,
} from '../data/tournament-registrations-repository';
import { fetchTournamentSummariesByIds, tournamentIsCompleted, tournamentIsLive, type TournamentCategoryOffer, type TournamentSummary } from '../data/tournaments-repository';
import { NxPageLoadingComponent } from '../shared/loading/nx-page-loading.component';
import { NxSpinnerComponent } from '../shared/loading/nx-spinner.component';
import { UniformFormComponent } from '../tournaments/registration/uniform-form.component';
import {
  categoryRequiresUniform,
  defaultUniformSelectionForCategory,
  toUniformInput,
  validateUniformSelection,
  type UniformSelection,
} from '../tournaments/tournament-uniform';

export type AgendaEventKind = 'tournament' | 'rental';
export type AgendaStatusTone = 'live' | 'confirmed' | 'warning' | 'neutral';

export interface AgendaEvent {
  id: string;
  startsAt: Date;
  durationMin: number;
  kind: AgendaEventKind;
  title: string;
  subtitle: string;
  location: string;
  statusLabel: string;
  statusTone: AgendaStatusTone;
  ctaLabel: string;
  ctaPrimary: boolean;
  /** Destino real do CTA (rota) — nulo quando não há tela correspondente. */
  link: string[] | null;
}

export interface AgendaDayGroup {
  key: string;
  label: string;
  events: AgendaEvent[];
}

export interface AgendaWeekDay {
  key: string;
  weekdayShort: string;
  dayNum: number;
  isToday: boolean;
  dotCount: 0 | 1 | 2 | 3;
}

export interface AgendaPendingRequest {
  id: string;
  initials: string;
  title: string;
  subtitle: string;
  scheduleLine: string;
  /** Categoria do convite (com flags de uniforme) — null quando o torneio não carregou. */
  category: TournamentCategoryOffer | null;
}

export interface AgendaMonthStat {
  label: string;
  value: string;
}

const KIND_LABEL: Record<AgendaEventKind, string> = {
  tournament: 'TORNEIO',
  rental: 'ALUGUEL',
};

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addDays(base: Date, delta: number): Date {
  const x = new Date(base);
  x.setDate(x.getDate() + delta);
  x.setHours(0, 0, 0, 0);
  return x;
}

function shortWeekday(d: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(d).replace('.', '');
}

function dateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dayGroupLabel(day: Date, today: Date): string {
  const key = isoDate(day);
  const dm = `${pad2(day.getDate())}/${pad2(day.getMonth() + 1)}`;
  const weekdayLower = shortWeekday(day).toLowerCase();
  if (key === isoDate(today)) return `Hoje · ${weekdayLower} ${dm}`;
  if (key === isoDate(addDays(today, 1))) return `Amanhã · ${weekdayLower} ${dm}`;
  const weekdayCap = weekdayLower.charAt(0).toUpperCase() + weekdayLower.slice(1);
  return `${weekdayCap} · ${dm}`;
}

function eventCountLabel(n: number): string {
  return `${n} evento${n === 1 ? '' : 's'}`;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'agora';
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `próximo em ${m} min`;
  return `próximo em ${h}h ${pad2(m)}min`;
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
  return local ? titleCase(local) : 'Atleta';
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'AT';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || 'AT';
}

function groupEventsByDay(events: readonly AgendaEvent[], today: Date): AgendaDayGroup[] {
  const byKey = new Map<string, AgendaEvent[]>();
  for (const ev of [...events].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())) {
    const key = isoDate(ev.startsAt);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(ev);
    else byKey.set(key, [ev]);
  }
  return [...byKey.entries()].map(([key, dayEvents]) => ({
    key,
    label: dayGroupLabel(dayEvents[0]!.startsAt, today),
    events: dayEvents,
  }));
}

function icsDate(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}` +
    `T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`
  );
}

function icsEscape(text: string): string {
  return text.replace(/[\\,;]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');
}

function buildIcsCalendar(events: readonly AgendaEvent[]): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//nexaGO//Agenda//PT-BR'];
  const stamp = icsDate(new Date());
  for (const ev of events) {
    const end = new Date(ev.startsAt.getTime() + ev.durationMin * 60000);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${ev.id}@nexago.app`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(ev.startsAt)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:${icsEscape(ev.title)}`,
      `DESCRIPTION:${icsEscape(ev.subtitle)}`,
      `LOCATION:${icsEscape(ev.location)}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function bookingToEvent(booking: MyBooking): AgendaEvent | null {
  if (booking.dateKey.length < 10) return null;
  const [y, m, d] = booking.dateKey.split('-').map(Number);
  const [sh, sm] = booking.startTime.split(':').map(Number);
  const [eh, em] = booking.endTime.split(':').map(Number);
  if (!y || !m || !d) return null;
  const start = new Date(y, m - 1, d, sh || 0, sm || 0);
  let end = new Date(y, m - 1, d, eh || 0, em || 0);
  if (end.getTime() <= start.getTime()) end = new Date(end.getTime() + 24 * 60 * 60_000);
  const active = bookingIsActive(booking);
  const needsPayment = bookingNeedsPayment(booking);

  return {
    id: booking.id,
    startsAt: start,
    durationMin: Math.round((end.getTime() - start.getTime()) / 60000),
    kind: 'rental',
    title: `${booking.arenaName} · ${booking.courtName}`,
    subtitle: active ? 'Reserva de quadra' : 'Reserva cancelada',
    location: booking.arenaName,
    statusLabel: !active ? 'Cancelada' : needsPayment ? 'Pagamento pendente' : booking.attendanceConfirmed ? 'Confirmado' : 'Aguardando confirmação',
    statusTone: !active ? 'neutral' : needsPayment ? 'warning' : booking.attendanceConfirmed ? 'confirmed' : 'warning',
    ctaLabel: 'Ver arena',
    ctaPrimary: needsPayment,
    link: booking.arenaId ? ['/reservar', booking.arenaId] : null,
  };
}

function registrationToEvent(reg: AthleteTournamentRegistration, tournament: TournamentSummary | undefined): AgendaEvent | null {
  if (!tournament?.startAt) return null;
  const durationMin = tournament.endAt ? Math.max(60, Math.round((tournament.endAt.getTime() - tournament.startAt.getTime()) / 60000)) : 24 * 60;
  const live = tournamentIsLive(tournament);
  const completed = tournamentIsCompleted(tournament);
  return {
    id: reg.id,
    startsAt: tournament.startAt,
    durationMin,
    kind: 'tournament',
    title: tournament.name,
    subtitle: [tournament.location, tournament.city].filter((v) => v).join(' · ') || 'Torneio',
    location: tournament.location ?? tournament.city ?? '',
    statusLabel: completed ? 'Concluído' : live ? 'Ao vivo' : reg.partnerPending ? 'Falta parceiro' : reg.isPaid ? 'Inscrito' : 'Aguardando pagamento',
    statusTone: completed ? 'neutral' : live ? 'live' : reg.partnerPending || !reg.isPaid ? 'warning' : 'confirmed',
    ctaLabel: live ? 'Ver chave' : 'Ver torneio',
    ctaPrimary: live,
    link: live ? ['/torneios', tournament.id, 'chaves'] : ['/torneios', tournament.id],
  };
}

/** Agenda real: mescla reservas (`arenaBookings`) e inscrições em torneio
 *  (`inscriptions` + `tournaments`) — espelha `AthleteAgendaLogic` (Flutter). Sem "desafio"/
 *  "aula"/"liga" como tipos à parte: liga é só um torneio (etapa) por baixo, e não achei
 *  nenhuma coleção real de desafio casual ou aula agendável pro atleta. */
@Component({
  selector: 'app-athlete-agenda',
  standalone: true,
  imports: [RouterLink, AtPanelShellComponent, UniformFormComponent, NxPageLoadingComponent, NxSpinnerComponent],
  templateUrl: './athlete-agenda.component.html',
  styleUrl: './athlete-agenda.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AthleteAgendaComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly firestore = createFirestore();

  protected readonly dotSlots: readonly [1, 2, 3] = [1, 2, 3];

  protected readonly accountLabel = computed(() => {
    const liveUser = this.auth.user();
    if (liveUser?.displayName?.trim()) return liveUser.displayName.trim();
    if (liveUser?.email?.trim()) return nameFromEmail(liveUser.email);
    const devEmail = this.auth.devEmail();
    return devEmail?.trim() ? nameFromEmail(devEmail) : 'Atleta';
  });
  protected readonly headerInitials = computed(() => initialsOf(this.accountLabel()));

  protected readonly now = signal(Date.now());
  protected readonly selectedDayKey = signal(isoDate(new Date()));

  protected readonly loading = signal(true);
  protected readonly events = signal<AgendaEvent[]>([]);
  protected readonly pendingRequests = signal<AgendaPendingRequest[]>([]);
  protected readonly monthStats = signal<AgendaMonthStat[]>([]);

  protected readonly eventNotice = signal<string | null>(null);
  private noticeTimeout: ReturnType<typeof setTimeout> | undefined;

  /** Convite com o formulário de uniforme aberto (aceite em duas etapas). */
  protected readonly expandedInviteId = signal<string | null>(null);
  protected readonly inviteUniform = signal<UniformSelection | null>(null);
  protected readonly acceptingId = signal<string | null>(null);
  protected readonly decliningId = signal<string | null>(null);

  /** Alguma operação em andamento neste convite (trava aceitar E recusar juntos). */
  protected inviteBusy(id: string): boolean {
    return this.acceptingId() === id || this.decliningId() === id;
  }

  protected readonly dayGroups = computed(() => groupEventsByDay(this.events(), dateOnly(new Date())));

  protected readonly dayStrip = computed<AgendaWeekDay[]>(() => {
    const today = dateOnly(new Date());
    const groups = this.dayGroups();
    const countByKey = new Map(groups.map((g) => [g.key, g.events.length]));
    const days: AgendaWeekDay[] = [];
    for (let i = -2; i <= 4; i++) {
      const d = addDays(today, i);
      const key = isoDate(d);
      days.push({
        key,
        weekdayShort: shortWeekday(d).toUpperCase(),
        dayNum: d.getDate(),
        isToday: key === isoDate(today),
        dotCount: Math.min(3, countByKey.get(key) ?? 0) as 0 | 1 | 2 | 3,
      });
    }
    return days;
  });

  protected readonly todayEvents = computed(() => {
    const todayKey = isoDate(dateOnly(new Date()));
    return this.dayGroups().find((g) => g.key === todayKey)?.events ?? [];
  });

  protected readonly headerSubtitle = computed(() => {
    const events = this.todayEvents();
    if (events.length === 0) return 'Nenhum jogo hoje';
    const nowMs = this.now();
    const next = events.find((e) => e.startsAt.getTime() > nowMs);
    const countdown = next ? ` · ${formatCountdown(next.startsAt.getTime() - nowMs)}` : '';
    return `${events.length} jogo${events.length === 1 ? '' : 's'} hoje${countdown}`;
  });

  protected readonly pendingActionCount = computed(
    () => this.pendingRequests().length + this.events().filter((e) => e.statusTone === 'warning').length,
  );

  constructor() {
    interval(30_000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.now.set(Date.now()));

    this.destroyRef.onDestroy(() => clearTimeout(this.noticeTimeout));

    effect(() => {
      const uid = this.auth.user()?.uid ?? null;
      void this.loadAgenda(uid);
    });
  }

  private async loadAgenda(uid: string | null): Promise<void> {
    const db = this.firestore;
    const projectId = environment.firebase.projectId;
    if (!db || !projectId || !uid) {
      this.events.set([]);
      this.pendingRequests.set([]);
      this.monthStats.set([]);
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    try {
      const [bookings, registrations, invites] = await Promise.all([
        fetchMyBookings(db, uid),
        fetchMyRegistrations(db, projectId, uid),
        fetchMyPendingPartnerInvites(db, uid),
      ]);

      const tournamentIds = [...new Set([...registrations.map((r) => r.tournamentId), ...invites.map((i) => i.tournamentId)])];
      const tournaments = await fetchTournamentSummariesByIds(db, tournamentIds);

      const bookingEvents = bookings.filter(bookingIsActive).map(bookingToEvent).filter((e): e is AgendaEvent => e != null);
      const registrationEvents = registrations
        .map((r) => registrationToEvent(r, tournaments.get(r.tournamentId)))
        .filter((e): e is AgendaEvent => e != null);
      this.events.set([...bookingEvents, ...registrationEvents]);

      this.pendingRequests.set(
        invites.map((invite) => {
          const tournament = tournaments.get(invite.tournamentId);
          // Casa por id resolvido (mesma ordem do app) com fallback no nome — convites antigos
          // podem carregar o nome da categoria como id.
          const category =
            tournament?.categories.find((c) => c.id === invite.categoryId) ??
            tournament?.categories.find((c) => c.categoryName === invite.categoryId) ??
            null;
          return {
            id: invite.id,
            initials: initialsOf(invite.inviterName),
            title: `Convite de parceiro de ${invite.inviterName}`,
            subtitle: tournament?.name ?? 'Torneio',
            scheduleLine: tournament?.startAt
              ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(tournament.startAt)
              : 'Data a confirmar',
            category,
          };
        }),
      );

      this.monthStats.set(this.computeMonthStats(bookings, registrationEvents));
    } catch {
      this.events.set([]);
      this.pendingRequests.set([]);
      this.monthStats.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  private computeMonthStats(bookings: readonly MyBooking[], tournamentEvents: readonly AgendaEvent[]): AgendaMonthStat[] {
    const now = new Date();
    const isThisMonth = (d: Date) => d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();

    const gamesThisMonth = tournamentEvents.filter((e) => isThisMonth(e.startsAt)).length;
    const spendThisMonth = bookings
      .filter((b) => bookingIsActive(b) && b.createdAt && isThisMonth(b.createdAt))
      .reduce((sum, b) => sum + (b.amountReais ?? 0), 0);

    return [
      { label: 'Jogos de torneio', value: `${gamesThisMonth}` },
      { label: 'Gasto em reservas', value: spendThisMonth.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) },
    ];
  }

  protected isSelectedDay(key: string): boolean {
    return this.selectedDayKey() === key;
  }

  protected selectDay(key: string): void {
    this.selectedDayKey.set(key);
    const target = document.getElementById(`ag-day-${key}`);
    if (!target) return;
    const reducedMotion = typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  }

  protected scrollToPending(): void {
    document.getElementById('ag-pending-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected kindLabel(kind: AgendaEventKind): string {
    return KIND_LABEL[kind];
  }

  protected readonly eventCountLabel = eventCountLabel;

  protected startTimeLabel(ev: AgendaEvent): string {
    return `${pad2(ev.startsAt.getHours())}:${pad2(ev.startsAt.getMinutes())}`;
  }

  protected onEventCta(ev: AgendaEvent): void {
    if (ev.link) {
      void this.router.navigate(ev.link);
      return;
    }
    this.showNotice('Esta reserva ainda não tem página de detalhe por aqui.');
  }

  /** Categoria exige uniforme → expande o formulário inline no card (o aceite real sai no
   *  "Confirmar aceite", com `inviteeUniform` — espelho da página do convidado no app).
   *  Sem exigência (ou torneio não carregado): aceita direto, como antes. */
  protected acceptRequest(request: AgendaPendingRequest): void {
    if (this.acceptingId()) return;
    const category = request.category;
    if (category && categoryRequiresUniform(category)) {
      this.expandedInviteId.set(request.id);
      // Defaults sem nome pré-preenchido — o convidado digita o próprio (paridade com o app).
      this.inviteUniform.set(defaultUniformSelectionForCategory(category));
      return;
    }
    void this.submitAccept(request.id, undefined);
  }

  protected async confirmAccept(request: AgendaPendingRequest): Promise<void> {
    const category = request.category;
    const selection = this.inviteUniform();
    if (!category || !selection || this.acceptingId()) return;
    const error = validateUniformSelection(category, selection);
    if (error) {
      this.showNotice(error);
      return;
    }
    await this.submitAccept(request.id, toUniformInput(selection));
  }

  protected cancelAcceptExpansion(): void {
    if (this.acceptingId()) return;
    this.expandedInviteId.set(null);
    this.inviteUniform.set(null);
  }

  protected onInviteUniformChange(next: UniformSelection): void {
    this.inviteUniform.set(next);
  }

  private async submitAccept(id: string, inviteeUniform: UniformInput | undefined): Promise<void> {
    this.acceptingId.set(id);
    try {
      await acceptPartnerInvite(athleteFunctions(), id, inviteeUniform);
      this.pendingRequests.update((list) => list.filter((r) => r.id !== id));
      this.expandedInviteId.set(null);
      this.inviteUniform.set(null);
      this.showNotice('Convite aceito! Vocês já formam dupla nessa categoria.');
      const uid = this.auth.user()?.uid ?? null;
      void this.loadAgenda(uid);
    } catch (err) {
      this.showNotice(err instanceof Error ? err.message : 'Não foi possível aceitar o convite.');
    } finally {
      this.acceptingId.set(null);
    }
  }

  protected async declineRequest(id: string): Promise<void> {
    if (this.inviteBusy(id)) return;
    this.decliningId.set(id);
    try {
      await declinePartnerInvite(athleteFunctions(), id);
      this.pendingRequests.update((list) => list.filter((r) => r.id !== id));
      this.showNotice('Convite recusado.');
    } catch (err) {
      this.showNotice(err instanceof Error ? err.message : 'Não foi possível recusar o convite.');
    } finally {
      this.decliningId.set(null);
    }
  }

  protected exportIcs(): void {
    const all = this.events();
    if (all.length === 0) {
      this.showNotice('Nenhum evento para exportar ainda.');
      return;
    }
    const ics = buildIcsCalendar(all);
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'agenda-nexago.ics';
    a.click();
    URL.revokeObjectURL(url);
  }

  private showNotice(message: string): void {
    this.eventNotice.set(message);
    clearTimeout(this.noticeTimeout);
    this.noticeTimeout = setTimeout(() => this.eventNotice.set(null), 4000);
  }
}
