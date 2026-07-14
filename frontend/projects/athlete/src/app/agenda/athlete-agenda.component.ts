import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { interval } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { fetchMyBookings } from './agenda-repository';
import {
  addDays,
  buildBookingEvent,
  buildIcsCalendar,
  dateOnly,
  eventCountLabel,
  formatCountdown,
  groupEventsByDay,
  isoDate,
  pad2,
  shortWeekday,
} from './agenda-logic';
import type { AgendaEvent, AgendaMonthStat, AgendaWeekDay } from './athlete-agenda.models';

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

function formatBRL(n: number): string {
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

/** Tela Agenda do portal do atleta: só reservas de quadra reais (`arenaBookings`) nesta rodada
 *  — torneio/desafio na agenda ficam fora do escopo (ver `athlete-agenda.models.ts`). Espelha
 *  a tira de dias + lista por dia do protótipo, com dados reais no lugar do mock. */
@Component({
  selector: 'app-athlete-agenda',
  standalone: true,
  imports: [RouterLink, AtPanelShellComponent],
  templateUrl: './athlete-agenda.component.html',
  styleUrl: './athlete-agenda.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AthleteAgendaComponent {
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly dotSlots: readonly [1, 2, 3] = [1, 2, 3];

  protected readonly accountLabel = computed(() => {
    const liveUser = this.auth.user();
    if (liveUser?.displayName?.trim()) return liveUser.displayName.trim();
    if (liveUser?.email?.trim()) return nameFromEmail(liveUser.email);
    const devEmail = this.auth.devEmail();
    return devEmail?.trim() ? nameFromEmail(devEmail) : 'Atleta';
  });
  protected readonly headerInitials = computed(() => initialsOf(this.accountLabel()));
  protected readonly currentUid = computed(() => this.auth.user()?.uid ?? null);

  protected readonly now = signal(Date.now());
  protected readonly selectedDayKey = signal(isoDate(new Date()));

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly events = signal<AgendaEvent[]>([]);

  protected readonly eventNotice = signal<string | null>(null);
  private noticeTimeout: ReturnType<typeof setTimeout> | undefined;

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
    if (events.length === 0) return 'Nenhuma reserva hoje';
    const nowMs = this.now();
    const next = events.find((e) => e.startsAt.getTime() > nowMs);
    const countdown = next ? ` · ${formatCountdown(next.startsAt.getTime() - nowMs)}` : '';
    return `${events.length} reserva${events.length === 1 ? '' : 's'} hoje${countdown}`;
  });

  protected readonly pendingActionCount = computed(() => this.events().filter((e) => e.statusTone === 'warning').length);

  protected readonly monthStats = computed<AgendaMonthStat[]>(() => {
    const now = new Date(this.now());
    const monthEvents = this.events().filter((e) => e.startsAt.getFullYear() === now.getFullYear() && e.startsAt.getMonth() === now.getMonth());
    return [
      { label: 'Reservas este mês', value: String(monthEvents.length) },
      { label: 'Gasto em reservas', value: formatBRL(this.monthSpend()) },
    ];
  });

  private readonly bookingsRaw = signal<{ amountReais: number; startsAtMonth: string }[]>([]);
  private readonly monthSpend = computed(() => {
    const now = new Date(this.now());
    const key = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
    return this.bookingsRaw()
      .filter((b) => b.startsAtMonth === key)
      .reduce((sum, b) => sum + b.amountReais, 0);
  });

  constructor() {
    interval(30_000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.now.set(Date.now()));

    effect(() => {
      const uid = this.currentUid();
      void this.load(uid);
    });

    this.destroyRef.onDestroy(() => clearTimeout(this.noticeTimeout));
  }

  protected isSelectedDay(key: string): boolean {
    return this.selectedDayKey() === key;
  }

  protected selectDay(key: string): void {
    this.selectedDayKey.set(key);
    const target = document.getElementById(`ag-day-${key}`);
    if (!target) return;
    const reducedMotion =
      typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  }

  protected readonly eventCountLabel = eventCountLabel;

  protected startTimeLabel(ev: AgendaEvent): string {
    return `${pad2(ev.startsAt.getHours())}:${pad2(ev.startsAt.getMinutes())}`;
  }

  protected retry(): void {
    void this.load(this.currentUid());
  }

  protected exportIcs(): void {
    const all = this.events();
    if (all.length === 0) {
      this.showNotice('Nenhuma reserva para exportar ainda.');
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

  private async load(uid: string | null): Promise<void> {
    if (!uid) {
      this.events.set([]);
      this.bookingsRaw.set([]);
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const db = createFirestore();
      if (!db) throw new Error('Firebase não configurado');

      const bookings = await fetchMyBookings(db, uid);
      const now = new Date();
      const paired = bookings
        .map((b) => ({ event: buildBookingEvent(b, now), amountReais: b.amountReais }))
        .filter((p): p is { event: AgendaEvent; amountReais: number } => p.event != null);

      this.events.set(paired.map((p) => p.event));
      this.bookingsRaw.set(
        paired.map((p) => ({
          amountReais: p.amountReais,
          startsAtMonth: `${p.event.startsAt.getFullYear()}-${pad2(p.event.startsAt.getMonth() + 1)}`,
        })),
      );
    } catch {
      this.errorMessage.set('Não foi possível carregar sua agenda.');
    } finally {
      this.loading.set(false);
    }
  }
}
