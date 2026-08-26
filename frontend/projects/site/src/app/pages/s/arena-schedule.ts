import { ChangeDetectionStrategy, Component, DestroyRef, type Signal, computed, inject, input, signal } from '@angular/core';
import { WEEKDAYS, type Weekday, type WeekSchedule } from '../../../lib/firestore/arena-schedule';

/**
 * Porta de `ArenaSchedule.tsx` — o status "aberto agora" e o quadro de horários do mini-site.
 * A fonte expõe um hook `useOpenNow` que fica `null` até montar (a página lá é ISR, então o
 * primeiro paint pode vir de um cache de até 5 min — o cliente corrige na hora). Este app é
 * CSR puro: não existe paint "desatualizado" a corrigir, então `injectOpenNowState` já
 * devolve o estado certo na primeira leitura — sem o branch de fallback.
 */

export const WEEKDAY_LABEL: Record<Weekday, string> = {
  monday: 'Segunda',
  tuesday: 'Terça',
  wednesday: 'Quarta',
  thursday: 'Quinta',
  friday: 'Sexta',
  saturday: 'Sábado',
  sunday: 'Domingo',
};

export interface OpenState {
  day: Weekday;
  open: boolean;
  /** Fechamento quando aberto, abertura quando fechado. */
  at: string;
}

const SHORT_TO_WEEKDAY: Record<string, Weekday> = {
  Mon: 'monday',
  Tue: 'tuesday',
  Wed: 'wednesday',
  Thu: 'thursday',
  Fri: 'friday',
  Sat: 'saturday',
  Sun: 'sunday',
};

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * Status "aberto agora" em horário de Brasília, recalculado a cada minuto. Precisa ser chamada
 * de dentro de um contexto de injeção (construtor de componente) — usa `inject(DestroyRef)`
 * para limpar o `setInterval`. `schedule` pode começar `null` (carregamento em andamento): o
 * signal resultante só passa a emitir um estado quando o horário chegar.
 */
export function injectOpenNowState(schedule: Signal<WeekSchedule | null>): Signal<OpenState | null> {
  const tick = signal(0);
  const timer = setInterval(() => tick.update((v) => v + 1), 60_000);
  inject(DestroyRef).onDestroy(() => clearInterval(timer));

  return computed(() => {
    tick();
    const week = schedule();
    if (!week) return null;

    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    const day = SHORT_TO_WEEKDAY[get('weekday')] ?? 'monday';

    const today = week[day];
    if (today.closed) return { day, open: false, at: '' };

    const nowMin = minutesOf(`${get('hour')}:${get('minute')}`);
    const openMin = minutesOf(today.open);
    // Fechamento "00:00" (ou <= abertura) significa virada do dia: trata como 24h.
    const closeMin = minutesOf(today.close) <= openMin ? 24 * 60 : minutesOf(today.close);
    const isOpen = nowMin >= openMin && nowMin < closeMin;
    return { day, open: isOpen, at: isOpen ? today.close : today.open };
  });
}

/** Item "Aberto agora · até 00:00" da faixa do hero. */
@Component({
  selector: 'app-arena-hero-open-now',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <div class="strip-item">
      <span class="dot" [class.live]="state().open" aria-hidden="true"></span>
      <span>
        <b>{{ state().open ? 'Aberto agora' : 'Fechado' }}</b>
        @if (state().at) {
          {{ state().open ? ' · até ' + state().at : ' · abre às ' + state().at }}
        }
      </span>
    </div>
  `,
  styleUrl: './arena-schedule.scss',
})
export class ArenaHeroOpenNow {
  readonly state = input.required<OpenState>();
}

/** Pílula "ABERTO AGORA · FECHA 00:00" ao lado do título de Horários. */
@Component({
  selector: 'app-arena-open-now-pill',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <div class="pill" [class.pill-open]="state().open">
      <span class="dot" [class.live]="state().open" aria-hidden="true"></span>
      @if (state().open) {
        ABERTO AGORA{{ state().at ? ' · FECHA ' + state().at : '' }}
      } @else {
        FECHADO{{ state().at ? ' · ABRE ÀS ' + state().at : '' }}
      }
    </div>
  `,
  styleUrl: './arena-schedule.scss',
})
export class ArenaOpenNowPill {
  readonly state = input.required<OpenState>();
}

/** Quadro dos 7 dias, com o dia atual destacado. */
@Component({
  selector: 'app-arena-hours-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <dl class="hours-card">
      @for (day of weekdays; track day) {
        <div class="hours-row" [class.today]="day === current()">
          <dt class="hours-day">
            {{ weekdayLabel[day] }}
            @if (day === current()) {
              <span class="hours-tag">HOJE</span>
            }
          </dt>
          <dd class="hours-time" [class.closed]="schedule()[day].closed">
            {{ schedule()[day].closed ? 'Fechado' : schedule()[day].open + ' – ' + schedule()[day].close }}
          </dd>
        </div>
      }
    </dl>
  `,
  styleUrl: './arena-schedule.scss',
})
export class ArenaHoursCard {
  readonly schedule = input.required<WeekSchedule>();
  readonly current = input.required<Weekday>();

  protected readonly weekdays = WEEKDAYS;
  protected readonly weekdayLabel = WEEKDAY_LABEL;
}
