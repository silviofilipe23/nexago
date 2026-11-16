import {
  BOOKING,
  BOOKING_BEATS,
  COURTS,
  TIMES,
  cellState,
  freeTimes,
  isChosen,
  reached,
  type BookingStep,
} from './booking-beats';

const STEPS = BOOKING_BEATS.map((beat) => beat.step);

describe('cena Reserva', () => {
  it('passa por cada etapa uma vez, na ordem do app, e termina reservada', () => {
    expect(STEPS).toEqual(['search', 'sport', 'slot', 'pay', 'done']);
  });

  it('não mostra agenda antes de escolher o esporte', () => {
    for (const court of COURTS) {
      for (const time of TIMES) expect(cellState('search', court, time)).toBe('unknown');
    }
  });

  it('reserva um horário que a agenda da arena tinha livre', () => {
    expect(cellState('sport', BOOKING.court, BOOKING.time)).toBe('free');
    expect(freeTimes(BOOKING.court)).toContain(BOOKING.time);
  });

  it('só a casa escolhida muda de estado depois que a agenda aparece', () => {
    const after: BookingStep[] = ['slot', 'pay', 'done'];
    for (const court of COURTS) {
      for (const time of TIMES) {
        const base = cellState('sport', court, time);
        for (const step of after) {
          if (isChosen(court, time)) expect(cellState(step, court, time)).not.toBe(base);
          else expect(cellState(step, court, time)).toBe(base);
        }
      }
    }
  });

  it('leva a casa escolhida do toque à confirmação', () => {
    const journey = (['slot', 'pay', 'done'] as const).map((step) => cellState(step, BOOKING.court, BOOKING.time));
    expect(journey).toEqual(['picked', 'holding', 'yours']);
  });

  it('lista na tela do app os mesmos horários livres do quadro', () => {
    for (const court of COURTS) {
      const fromBoard = TIMES.filter((time) => cellState('sport', court, time) === 'free');
      expect(freeTimes(court)).toEqual(fromBoard);
    }
  });

  it('sabe se uma etapa já foi alcançada', () => {
    expect(reached('search', 'sport')).toBeFalse();
    expect(reached('sport', 'sport')).toBeTrue();
    expect(reached('done', 'slot')).toBeTrue();
  });
});
