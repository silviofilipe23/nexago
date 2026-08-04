'use client';

import { useEffect, useState } from 'react';
import { WEEKDAYS, type WeekSchedule, type Weekday } from '@/lib/firestore/arena-site-data';
import styles from './arena-site.module.css';

export const WEEKDAY_LABEL: Record<Weekday, string> = {
  monday: 'Segunda',
  tuesday: 'Terça',
  wednesday: 'Quarta',
  thursday: 'Quinta',
  friday: 'Sexta',
  saturday: 'Sábado',
  sunday: 'Domingo',
};

interface OpenState {
  day: Weekday;
  open: boolean;
  /** Fechamento quando aberto, abertura quando fechado. */
  at: string;
}

/** Status "aberto agora" em horário de Brasília, recalculado a cada minuto.
 *  A página é ISR (pode ficar 5 min em cache), então isso só pode rodar no
 *  cliente — retorna `null` até montar, e quem chama mostra um fallback
 *  estático do mesmo tamanho para não causar salto de layout. */
function useOpenNow(schedule: WeekSchedule): OpenState | null {
  const [state, setState] = useState<OpenState | null>(null);

  useEffect(() => {
    const compute = () => {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Sao_Paulo',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(new Date());
      const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
      const day = SHORT_TO_WEEKDAY[get('weekday')];
      if (!day) return setState(null);

      const today = schedule[day];
      if (!today || today.closed) return setState({ day, open: false, at: '' });

      const nowMin = minutes(`${get('hour')}:${get('minute')}`);
      const openMin = minutes(today.open);
      // Fechamento "00:00" (ou <= abertura) significa virada do dia: trata como 24h.
      const closeMin = minutes(today.close) <= openMin ? 24 * 60 : minutes(today.close);
      const isOpen = nowMin >= openMin && nowMin < closeMin;
      setState({ day, open: isOpen, at: isOpen ? today.close : today.open });
    };

    compute();
    const timer = setInterval(compute, 60_000);
    return () => clearInterval(timer);
  }, [schedule]);

  return state;
}

/** Item "Aberto agora · até 00:00" da faixa do hero. */
export function HeroOpenNow({ schedule, today }: { schedule: WeekSchedule; today: Weekday }) {
  const state = useOpenNow(schedule);
  const fallback = schedule[today];

  if (!state) {
    return (
      <div>
        <span className={styles.dotOff} aria-hidden />
        <span>
          <b>Hoje</b>
          {fallback.closed ? ' · fechado' : ` · ${fallback.open} – ${fallback.close}`}
        </span>
      </div>
    );
  }

  return (
    <div>
      <span className={state.open ? styles.dotLive : styles.dotOff} aria-hidden />
      <span>
        <b>{state.open ? 'Aberto agora' : 'Fechado'}</b>
        {state.at ? (state.open ? ` · até ${state.at}` : ` · abre às ${state.at}`) : ''}
      </span>
    </div>
  );
}

/** Pílula "ABERTO AGORA · FECHA 00:00" ao lado do quadro de horários. */
export function OpenNowPill({ schedule, today }: { schedule: WeekSchedule; today: Weekday }) {
  const state = useOpenNow(schedule);
  const fallback = schedule[today];

  if (!state) {
    return (
      <div className={styles.openPillClosed}>
        <span className={styles.dotOff} aria-hidden />
        {fallback.closed ? 'FECHADO HOJE' : `HOJE · ${fallback.open} – ${fallback.close}`}
      </div>
    );
  }

  return (
    <div className={state.open ? styles.openPill : styles.openPillClosed}>
      <span className={state.open ? styles.dotLive : styles.dotOff} aria-hidden />
      {state.open
        ? `ABERTO AGORA${state.at ? ` · FECHA ${state.at}` : ''}`
        : `FECHADO${state.at ? ` · ABRE ÀS ${state.at}` : ''}`}
    </div>
  );
}

/** Quadro dos 7 dias. O dia destacado vem pronto do servidor (evita salto de
 *  layout) e é corrigido no cliente logo após montar, caso o ISR esteja velho. */
export function HoursCard({ schedule, today }: { schedule: WeekSchedule; today: Weekday }) {
  const state = useOpenNow(schedule);
  const current = state?.day ?? today;

  return (
    <dl className={styles.hoursCard}>
      {WEEKDAYS.map((day) => (
        <div key={day} className={day === current ? styles.hoursRowToday : styles.hoursRow}>
          <dt className={styles.hoursDay}>
            {WEEKDAY_LABEL[day]}
            {day === current && <span className={styles.hoursTag}>HOJE</span>}
          </dt>
          <dd className={schedule[day].closed ? styles.hoursClosed : styles.hoursTime}>
            {schedule[day].closed ? 'Fechado' : `${schedule[day].open} – ${schedule[day].close}`}
          </dd>
        </div>
      ))}
    </dl>
  );
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

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
