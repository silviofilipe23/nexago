'use client';

import { useEffect, useState } from 'react';
import { WEEKDAYS, type WeekSchedule, type Weekday } from '@/lib/firestore/arena-site-data';
import styles from './arena-site.module.css';

/** "Aberto agora · fecha 22:00" calculado no cliente em horário de Brasília —
 *  a página é ISR (pode ficar 5min em cache), então o status não pode vir do
 *  servidor. Antes de montar não renderiza nada (evita flash errado). */
export function OpenNowBadge({ schedule }: { schedule: WeekSchedule }) {
  const [state, setState] = useState<{ open: boolean; until: string } | null>(null);

  useEffect(() => {
    const compute = () => {
      const now = new Date();
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Sao_Paulo',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(now);
      const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
      const dayMap: Record<string, Weekday> = {
        Mon: 'monday', Tue: 'tuesday', Wed: 'wednesday', Thu: 'thursday',
        Fri: 'friday', Sat: 'saturday', Sun: 'sunday',
      };
      const day = dayMap[get('weekday')];
      if (!day) return setState(null);
      const today = schedule[day];
      if (!today || today.closed) return setState({ open: false, until: '' });

      const minutes = (hhmm: string) => {
        const [h, m] = hhmm.split(':').map(Number);
        return (h ?? 0) * 60 + (m ?? 0);
      };
      const nowMin = minutes(`${get('hour')}:${get('minute')}`);
      const openMin = minutes(today.open);
      // Fechamento "00:00" (ou <= abertura) significa virada do dia: trata como 24h.
      const closeMin = minutes(today.close) <= openMin ? 24 * 60 : minutes(today.close);
      const isOpen = nowMin >= openMin && nowMin < closeMin;
      setState({ open: isOpen, until: isOpen ? today.close : today.open });
    };

    compute();
    const timer = setInterval(compute, 60_000);
    return () => clearInterval(timer);
  }, [schedule]);

  if (!state) return null;
  return (
    <span className={state.open ? styles.openBadge : styles.closedBadge}>
      <span className={styles.openDot} aria-hidden />
      {state.open ? `Aberto agora${state.until ? ` · fecha ${state.until}` : ''}` : `Fechado${state.until ? ` · abre ${state.until}` : ''}`}
    </span>
  );
}
