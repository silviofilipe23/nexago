import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import gsap from 'gsap';
import { interval } from 'rxjs';
import { AuthService } from '../auth/auth.service';

export type AgendaEventKind = 'match' | 'training' | 'tournament' | 'reminder';
export type AgendaEventStatus = 'confirmed' | 'pending' | 'paid' | 'live';

export interface AgendaFeaturedMatch {
  opponent: string;
  arena: string;
  addressHint: string;
  category: string;
  timeLabel: string;
  startsAt: Date;
  isToday: boolean;
  ctaPrimary: string;
  ctaSecondary: string;
}

export interface AgendaTimelineItem {
  id: string;
  timeLabel: string;
  kind: AgendaEventKind;
  title: string;
  subtitle: string | null;
  status: AgendaEventStatus;
}

export interface AgendaCalendarDay {
  key: string;
  dayNum: number;
  weekdayShort: string;
  isToday: boolean;
  /** 0–3 dots for density preview */
  intensity: 0 | 1 | 2 | 3;
}

export interface AgendaTournamentCard {
  id: string;
  name: string;
  phase: string;
  positionLabel: string;
  tone: 'teal' | 'violet';
}

export interface AgendaAthletePulse {
  levelLabel: string;
  rankSnippet: string;
  streakLabel: string;
  weeklyWins: number;
}

export interface AgendaSmartNote {
  id: string;
  icon: string;
  title: string;
  body: string;
  tone: 'accent' | 'warning' | 'success' | 'neutral';
}

function firstWord(value: string | null | undefined): string {
  const t = value?.trim();
  if (!t) return 'Atleta';
  return t.split(/\s+/)[0] ?? 'Atleta';
}

function greetingByHour(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(base: Date, delta: number): Date {
  const x = new Date(base);
  x.setDate(x.getDate() + delta);
  return x;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Começou — boa sorte!';
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `Começa em ${m} min`;
  return `Começa em ${h}h ${m.toString().padStart(2, '0')}min`;
}

function nameFromEmail(email: string): string {
  const local = email.split('@')[0]?.replace(/[._-]+/g, ' ').trim();
  if (!local) return 'Atleta';
  return local.charAt(0).toUpperCase() + local.slice(1);
}

@Component({
  selector: 'app-athlete-agenda',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './athlete-agenda.component.html',
  styleUrl: './athlete-agenda.component.scss',
})
export class AthleteAgendaComponent {
  /** Slots 1–3 para bolinhas de densidade no mini calendário */
  protected readonly calDotSlots: readonly [1, 2, 3] = [1, 2, 3];

  private readonly auth = inject(AuthService);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);

  private introPlayed = false;
  private skipFirstTimelineAnim = true;

  protected readonly now = signal(Date.now());

  protected readonly accountLabel = computed(() => {
    const u = this.auth.user();
    if (u?.displayName?.trim()) return u.displayName.trim();
    if (u?.email?.trim()) return nameFromEmail(u.email);
    const dev = this.auth.devEmail();
    if (dev?.trim()) return nameFromEmail(dev);
    return 'Atleta NexaGO';
  });

  protected readonly firstName = computed(() => firstWord(this.accountLabel()));
  protected readonly greeting = computed(() => greetingByHour(new Date(this.now())));
  protected readonly heroSubline = computed(() => {
    const f = this.featured();
    if (f?.isToday) return 'Hoje é dia de jogo — corpo ligado, mente fria.';
    if (f) return 'Próximo compromisso já está no radar. Respira e segue o plano.';
    return 'Sua semana esportiva começa aqui. Um passo de cada vez.';
  });

  /** Dia selecionado no calendário (ISO yyyy-mm-dd) */
  protected readonly selectedDayKey = signal(isoDate(new Date()));

  protected readonly calendarStrip = signal<AgendaCalendarDay[]>(this.buildCalendarStrip());

  protected readonly featured = signal<AgendaFeaturedMatch | null>(this.buildFeaturedMock());

  protected readonly timelineForDay = computed(() => {
    const key = this.selectedDayKey();
    const today = isoDate(new Date());
    if (key === today) {
      return TODAY_TIMELINE;
    }
    return OTHER_DAY_TIMELINES[key] ?? MOCK_TIMELINE_DEFAULT;
  });

  protected readonly countdownLabel = computed(() => {
    const f = this.featured();
    if (!f) return '';
    return formatCountdown(f.startsAt.getTime() - this.now());
  });

  protected readonly tournaments = signal<AgendaTournamentCard[]>([...MOCK_TOURNAMENTS]);
  protected readonly athletePulse = signal<AgendaAthletePulse>({ ...MOCK_PULSE });
  protected readonly smartNotes = signal<AgendaSmartNote[]>([...MOCK_NOTES]);

  constructor() {
    interval(30_000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.now.set(Date.now()));

    effect(() => {
      this.selectedDayKey();
      if (this.prefersReducedMotion()) return;
      untracked(() =>
        afterNextRender(() => {
          if (this.skipFirstTimelineAnim) {
            this.skipFirstTimelineAnim = false;
            return;
          }
          this.animateTimelineRefresh();
        }, { injector: this.injector }),
      );
    });

    afterNextRender(
      () => {
        if (!this.prefersReducedMotion()) {
          this.playIntro();
        }
      },
      { injector: this.injector },
    );
  }

  protected selectDay(key: string, event?: Event): void {
    this.selectedDayKey.set(key);
    if (this.prefersReducedMotion()) {
      return;
    }
    const el = event?.currentTarget;
    if (el instanceof HTMLElement) {
      gsap.fromTo(
        el,
        { scale: 0.94 },
        { scale: 1, duration: 0.38, ease: 'back.out(1.8)' },
      );
    }
  }

  protected isSelectedDay(key: string): boolean {
    return this.selectedDayKey() === key;
  }

  protected eventKindLabel(kind: AgendaEventKind): string {
    switch (kind) {
      case 'match':
        return 'Jogo';
      case 'training':
        return 'Treino';
      case 'tournament':
        return 'Torneio';
      case 'reminder':
        return 'Lembrete';
    }
  }

  protected statusLabel(s: AgendaEventStatus): string {
    switch (s) {
      case 'confirmed':
        return 'Confirmado';
      case 'pending':
        return 'Pendente';
      case 'paid':
        return 'Pago';
      case 'live':
        return 'Ao vivo';
    }
  }

  private buildCalendarStrip(): AgendaCalendarDay[] {
    const today = new Date();
    const todayKey = isoDate(today);
    const days: AgendaCalendarDay[] = [];
    for (let i = 0; i < 14; i++) {
      const d = addDays(today, i);
      const key = isoDate(d);
      const intensity = MOCK_DAY_INTENSITY[key] ?? (i % 4 === 0 ? 2 : i % 3) as 0 | 1 | 2 | 3;
      days.push({
        key,
        dayNum: d.getDate(),
        weekdayShort: new Intl.DateTimeFormat('pt-BR', { weekday: 'short' })
          .format(d)
          .replace('.', ''),
        isToday: key === todayKey,
        intensity: Math.min(3, Math.max(0, intensity)) as 0 | 1 | 2 | 3,
      });
    }
    return days;
  }

  private buildFeaturedMock(): AgendaFeaturedMatch | null {
    const today = new Date();
    const start = new Date(today);
    start.setHours(19, 30, 0, 0);
    if (start.getTime() < today.getTime()) {
      start.setDate(start.getDate() + 1);
    }
    return {
      opponent: 'Dupla Silva / Costa',
      arena: 'Arena NexaGO Sul',
      addressHint: 'Praia do Forte · quadra central',
      category: 'Open misto B',
      timeLabel: new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(
        start,
      ),
      startsAt: start,
      isToday: isoDate(start) === isoDate(today),
      ctaPrimary: 'Ver detalhes',
      ctaSecondary: 'Iniciar navegação',
    };
  }

  private prefersReducedMotion(): boolean {
    return (
      typeof globalThis.matchMedia === 'function' &&
      globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  private playIntro(): void {
    if (this.introPlayed) return;
    this.introPlayed = true;
    const root = this.host.nativeElement;
    const blocks = root.querySelectorAll('[data-agenda-intro]');
    if (!blocks.length) return;
    gsap.fromTo(
      blocks,
      { opacity: 0, y: 28 },
      {
        opacity: 1,
        y: 0,
        duration: 0.55,
        stagger: 0.08,
        ease: 'power3.out',
        clearProps: 'transform',
      },
    );
  }

  private animateTimelineRefresh(): void {
    const root = this.host.nativeElement;
    const items = root.querySelectorAll('.agenda-timeline__item');
    if (!items.length) return;
    gsap.fromTo(
      items,
      { opacity: 0, x: -12 },
      { opacity: 1, x: 0, duration: 0.4, stagger: 0.06, ease: 'power2.out', clearProps: 'transform' },
    );
  }
}

const TODAY_TIMELINE: AgendaTimelineItem[] = [
  {
    id: 't1',
    timeLabel: '08:30',
    kind: 'training',
    title: 'Pré-ativacao + mobilidade',
    subtitle: 'Fisiologia · 25 min',
    status: 'confirmed',
  },
  {
    id: 't2',
    timeLabel: '14:00',
    kind: 'reminder',
    title: 'Confirmar presenca na arena',
    subtitle: 'Evita bloqueio de horario',
    status: 'pending',
  },
  {
    id: 't3',
    timeLabel: '19:30',
    kind: 'match',
    title: 'Jogo — vs Silva / Costa',
    subtitle: 'Arena NexaGO Sul · Open misto B',
    status: 'confirmed',
  },
];

const OTHER_DAY_TIMELINES: Record<string, AgendaTimelineItem[]> = {};

const MOCK_TIMELINE_DEFAULT: AgendaTimelineItem[] = [
  {
    id: 'd1',
    timeLabel: '07:00',
    kind: 'reminder',
    title: 'Hidratação + alongamento leve',
    subtitle: 'Check-in mental do dia',
    status: 'confirmed',
  },
  {
    id: 'd2',
    timeLabel: '18:00',
    kind: 'training',
    title: 'Treino técnico — saque e defesa',
    subtitle: 'Com parceiro de treino',
    status: 'paid',
  },
];

/** Bolinhas no mini calendário (mock por dia ISO) */
const MOCK_DAY_INTENSITY: Record<string, 0 | 1 | 2 | 3> = {};

const MOCK_TOURNAMENTS: AgendaTournamentCard[] = [
  {
    id: 'tr1',
    name: 'Circuito Praia Verão',
    phase: 'Quartas de final',
    positionLabel: '3º do grupo A',
    tone: 'teal',
  },
  {
    id: 'tr2',
    name: 'NexaGO Night Open',
    phase: 'Fase de grupos',
    positionLabel: '2 vitórias · 1 jogo restante',
    tone: 'violet',
  },
];

const MOCK_PULSE: AgendaAthletePulse = {
  levelLabel: 'Atleta Performance II',
  rankSnippet: 'Top 12 da categoria Open B',
  streakLabel: '5 jogos seguidos esta semana',
  weeklyWins: 5,
};

const MOCK_NOTES: AgendaSmartNote[] = [
  {
    id: 'n1',
    icon: '⏱',
    title: 'Seu jogo começa em 1 hora',
    body: 'Saia com antecedência — tráfego costuma aumentar perto da arena.',
    tone: 'accent',
  },
  {
    id: 'n2',
    icon: '💳',
    title: 'Pagamento pendente',
    body: 'Inscrição do torneio Night Open aguardando confirmação do PIX.',
    tone: 'warning',
  },
  {
    id: 'n3',
    icon: '🏐',
    title: 'Novo torneio disponível',
    body: 'Beach Pro Series — inscrições abrem amanhã às 10h.',
    tone: 'success',
  },
];
