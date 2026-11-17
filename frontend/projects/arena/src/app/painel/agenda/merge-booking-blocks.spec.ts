import { mergeConsecutiveBookingBlocks, type MergeableAgendaBlock } from './merge-booking-blocks';

interface TestBlock extends MergeableAgendaBlock {
  id: string;
  bookingId: string | null;
}

function block(id: string, startHour: number, bookingId: string | null, extra: Partial<TestBlock> = {}): TestBlock {
  return { id, courtId: 'q1', start: startHour * 60, dur: 60, status: bookingId ? 'confirmada' : 'available', bookingId, ...extra };
}

const byBooking = (b: TestBlock) => b.bookingId;
const sortByStart = (blocks: TestBlock[]) => [...blocks].sort((a, b) => a.courtId.localeCompare(b.courtId) || a.start - b.start);

describe('mergeConsecutiveBookingBlocks', () => {
  it('funde as horas seguidas da mesma reserva num bloco só, com o id do primeiro horário', () => {
    const merged = mergeConsecutiveBookingBlocks([block('s20', 20, 'bk1'), block('s21', 21, 'bk1')], byBooking);

    expect(merged).toEqual([jasmine.objectContaining({ id: 's20', start: 20 * 60, dur: 120 })]);
  });

  it('funde três ou mais horas em qualquer ordem de entrada', () => {
    const merged = mergeConsecutiveBookingBlocks([block('s21', 21, 'bk1'), block('s19', 19, 'bk1'), block('s20', 20, 'bk1')], byBooking);

    expect(merged).toEqual([jasmine.objectContaining({ id: 's19', start: 19 * 60, dur: 180 })]);
  });

  it('mantém separadas reservas diferentes mesmo coladas', () => {
    const merged = mergeConsecutiveBookingBlocks([block('s20', 20, 'bk1'), block('s21', 21, 'bk2')], byBooking);

    expect(sortByStart(merged).map((b) => [b.id, b.dur])).toEqual([['s20', 60], ['s21', 60]]);
  });

  it('não funde horários da mesma reserva com buraco no meio', () => {
    const merged = mergeConsecutiveBookingBlocks([block('s18', 18, 'bk1'), block('s20', 20, 'bk1')], byBooking);

    expect(sortByStart(merged).map((b) => [b.id, b.dur])).toEqual([['s18', 60], ['s20', 60]]);
  });

  it('não funde entre quadras nem entre dias', () => {
    const merged = mergeConsecutiveBookingBlocks(
      [
        block('a', 20, 'bk1', { dateKey: '2026-11-17' }),
        block('b', 21, 'bk1', { dateKey: '2026-11-18' }),
        block('c', 21, 'bk1', { dateKey: '2026-11-17', courtId: 'q2' }),
      ],
      byBooking,
    );

    expect(merged.length).toBe(3);
    expect(merged.every((b) => b.dur === 60)).toBeTrue();
  });

  it('deixa intactos os horários sem reserva (livre/bloqueado)', () => {
    const merged = mergeConsecutiveBookingBlocks([block('s20', 20, null), block('s21', 21, null)], byBooking);

    expect(sortByStart(merged).map((b) => [b.id, b.dur])).toEqual([['s20', 60], ['s21', 60]]);
  });

  it('não muta os blocos de entrada', () => {
    const first = block('s20', 20, 'bk1');
    mergeConsecutiveBookingBlocks([first, block('s21', 21, 'bk1')], byBooking);

    expect(first.dur).toBe(60);
  });
});
