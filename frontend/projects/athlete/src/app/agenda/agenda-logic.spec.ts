import { buildBookingEvent, dayGroupLabel, groupEventsByDay, type BookingRaw } from './agenda-logic';
import type { AgendaEvent } from './athlete-agenda.models';

describe('buildBookingEvent', () => {
  const base: BookingRaw = {
    id: 'b1',
    arenaName: 'Arena CFC',
    courtName: 'Quadra 2',
    dateKey: '2026-07-20',
    startTime: '19:00',
    endTime: '20:30',
    status: 'active',
    paymentStatus: 'paid',
    amountReais: 98,
  };

  it('builds an event with the right start time and duration', () => {
    const ev = buildBookingEvent(base, new Date('2026-07-01T00:00:00'));
    expect(ev).not.toBeNull();
    expect(ev!.startsAt).toEqual(new Date(2026, 6, 20, 19, 0));
    expect(ev!.durationMin).toBe(90);
    expect(ev!.title).toBe('Arena CFC · Quadra 2');
  });

  it('returns null for canceled bookings', () => {
    expect(buildBookingEvent({ ...base, status: 'canceled' })).toBeNull();
    expect(buildBookingEvent({ ...base, status: 'cancelled' })).toBeNull();
  });

  it('flags a pending-payment booking as a warning', () => {
    const ev = buildBookingEvent({ ...base, paymentStatus: 'pending' }, new Date('2026-07-01T00:00:00'));
    expect(ev!.statusTone).toBe('warning');
    expect(ev!.statusLabel).toBe('Pagamento pendente');
  });

  it('flags a booking as "live" when now falls inside its time window', () => {
    const now = new Date(2026, 6, 20, 19, 30);
    const ev = buildBookingEvent(base, now);
    expect(ev!.statusTone).toBe('live');
    expect(ev!.statusLabel).toBe('Agora');
  });

  it('falls back to generic labels when arena/court name is missing', () => {
    const ev = buildBookingEvent({ ...base, arenaName: null, courtName: null }, new Date('2026-07-01T00:00:00'));
    expect(ev!.title).toBe('Arena · Quadra');
  });
});

describe('dayGroupLabel / groupEventsByDay', () => {
  const today = new Date(2026, 6, 14);

  it('labels today and tomorrow specially, otherwise weekday + date', () => {
    expect(dayGroupLabel(today, today)).toMatch(/^Hoje ·/);
    expect(dayGroupLabel(new Date(2026, 6, 15), today)).toMatch(/^Amanhã ·/);
    expect(dayGroupLabel(new Date(2026, 6, 20), today)).toMatch(/^[A-Z].* · 20\/07$/);
  });

  it('groups and sorts events by day', () => {
    const events: AgendaEvent[] = [
      { id: 'a', startsAt: new Date(2026, 6, 15, 10, 0), durationMin: 60, title: '', subtitle: '', location: '', statusLabel: '', statusTone: 'confirmed' },
      { id: 'b', startsAt: new Date(2026, 6, 14, 9, 0), durationMin: 60, title: '', subtitle: '', location: '', statusLabel: '', statusTone: 'confirmed' },
      { id: 'c', startsAt: new Date(2026, 6, 14, 20, 0), durationMin: 60, title: '', subtitle: '', location: '', statusLabel: '', statusTone: 'confirmed' },
    ];
    const groups = groupEventsByDay(events, today);
    expect(groups.map((g) => g.key)).toEqual(['2026-07-14', '2026-07-15']);
    expect(groups[0]!.events.map((e) => e.id)).toEqual(['b', 'c']);
  });
});
