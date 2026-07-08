import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { interval } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';

export type AgendaEventKind = 'tournament' | 'challenge' | 'rental' | 'class' | 'league';
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
}

export interface AgendaMonthStat {
  label: string;
  value: string;
}

const KIND_LABEL: Record<AgendaEventKind, string> = {
  tournament: 'TORNEIO',
  challenge: 'DESAFIO',
  rental: 'ALUGUEL',
  class: 'AULA',
  league: 'LIGA',
};

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

function atTime(day: Date, hh: number, mm: number): Date {
  const d = new Date(day);
  d.setHours(hh, mm, 0, 0);
  return d;
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

  protected readonly now = signal(Date.now());
  protected readonly selectedDayKey = signal(isoDate(new Date()));

  protected readonly events = signal<AgendaEvent[]>(this.buildMockEvents());
  protected readonly pendingRequests = signal<AgendaPendingRequest[]>(this.buildMockPendingRequests());
  protected readonly monthStats = signal<AgendaMonthStat[]>([
    { label: 'Jogos agendados', value: '9' },
    { label: 'Taxa de vitória', value: '68%' },
    { label: 'Sequência atual', value: '3 dias' },
    { label: 'Gasto em reservas', value: 'R$ 340' },
  ]);

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
    if (events.length === 0) return 'Nenhum jogo hoje';
    const nowMs = this.now();
    const next = events.find((e) => e.startsAt.getTime() > nowMs);
    const countdown = next ? ` · ${formatCountdown(next.startsAt.getTime() - nowMs)}` : '';
    return `${events.length} jogo${events.length === 1 ? '' : 's'} hoje${countdown}`;
  });

  protected readonly pendingActionCount = computed(
    () =>
      this.pendingRequests().length +
      this.events().filter((e) => e.statusTone === 'warning').length,
  );

  constructor() {
    interval(30_000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.now.set(Date.now()));

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
      typeof globalThis.matchMedia === 'function' &&
      globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
    this.showNotice(`"${ev.ctaLabel}" chega em breve por aqui.`);
  }

  protected acceptRequest(id: string): void {
    this.pendingRequests.update((list) => list.filter((r) => r.id !== id));
    this.showNotice('Desafio aceito! Combine os detalhes com seu adversário.');
  }

  protected declineRequest(id: string): void {
    this.pendingRequests.update((list) => list.filter((r) => r.id !== id));
    this.showNotice('Desafio recusado.');
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

  private buildMockEvents(): AgendaEvent[] {
    const today = dateOnly(new Date());
    const tomorrow = addDays(today, 1);
    const inFourDays = addDays(today, 4);

    return [
      {
        id: 'ev-1',
        startsAt: atTime(today, 19, 0),
        durationMin: 90,
        kind: 'tournament',
        title: 'Etapa Garden · Oitavas',
        subtitle: 'Arena CFC · Quadra 2 · Sub-19 Masc',
        location: 'Arena CFC',
        statusLabel: 'Ao vivo',
        statusTone: 'live',
        ctaLabel: 'Anotar set',
        ctaPrimary: true,
      },
      {
        id: 'ev-2',
        startsAt: atTime(today, 20, 30),
        durationMin: 60,
        kind: 'challenge',
        title: 'Desafio de ranking · Rafa & Tonho',
        subtitle: 'Arena ErreJota · Quadra 2 · melhor de 3',
        location: 'Arena ErreJota',
        statusLabel: 'Confirmado',
        statusTone: 'confirmed',
        ctaLabel: 'Combinar',
        ctaPrimary: false,
      },
      {
        id: 'ev-3',
        startsAt: atTime(today, 21, 0),
        durationMin: 60,
        kind: 'rental',
        title: 'Arena ErreJota · Quadra 1',
        subtitle: 'Vôlei de praia · com Bruno V.',
        location: 'Arena ErreJota',
        statusLabel: 'Confirmado',
        statusTone: 'confirmed',
        ctaLabel: 'Convidar +1',
        ctaPrimary: true,
      },
      {
        id: 'ev-4',
        startsAt: atTime(today, 22, 0),
        durationMin: 60,
        kind: 'rental',
        title: 'Arena CFC · Quadra 4',
        subtitle: 'Vôlei de praia · recorrente toda seg',
        location: 'Arena CFC',
        statusLabel: 'Falta 1',
        statusTone: 'warning',
        ctaLabel: 'Confirmar dupla',
        ctaPrimary: true,
      },
      {
        id: 'ev-5',
        startsAt: atTime(tomorrow, 7, 0),
        durationMin: 90,
        kind: 'class',
        title: 'Treino técnico · Coach Júnior',
        subtitle: 'Praia BT · Quadra central · 6 alunos',
        location: 'Praia BT',
        statusLabel: 'Confirmado',
        statusTone: 'confirmed',
        ctaLabel: 'Check-in',
        ctaPrimary: false,
      },
      {
        id: 'ev-6',
        startsAt: atTime(tomorrow, 19, 30),
        durationMin: 150,
        kind: 'league',
        title: 'Liga Universitária · Etapa 3',
        subtitle: 'UFG Câmpus 2 · Sub-23 misto · 4ª rodada',
        location: 'UFG Câmpus 2',
        statusLabel: 'Confirmado',
        statusTone: 'confirmed',
        ctaLabel: 'Ver chave',
        ctaPrimary: false,
      },
      {
        id: 'ev-7',
        startsAt: atTime(inFourDays, 11, 0),
        durationMin: 60,
        kind: 'rental',
        title: 'Arena CFC · Quadra 2',
        subtitle: 'Vôlei de praia · 3 amigos disponíveis',
        location: 'Arena CFC',
        statusLabel: 'Procurando dupla',
        statusTone: 'neutral',
        ctaLabel: 'Convidar',
        ctaPrimary: true,
      },
    ];
  }

  private buildMockPendingRequests(): AgendaPendingRequest[] {
    const today = dateOnly(new Date());
    const day = addDays(today, 4);
    const dm = `${pad2(day.getDate())}/${pad2(day.getMonth() + 1)}`;
    const weekday = shortWeekday(day).toLowerCase();
    const weekdayCap = weekday.charAt(0).toUpperCase() + weekday.slice(1);
    return [
      {
        id: 'req-1',
        initials: 'LM',
        title: 'Desafio de Lucas M.',
        subtitle: 'H2H 2–1 · vale a #4 do ranking',
        scheduleLine: `${weekdayCap} ${dm} · 09:00 · Arena CFC · Quadra 3`,
      },
    ];
  }
}
