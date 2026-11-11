import { virtualSlot, type ArenaSlot, type ArenaSlotStatus } from './arena-slot.model';
import { consecutiveBlockableSlots, consecutiveUnblockableSlots } from './block-range';

function slot(start: string, end: string, status: ArenaSlotStatus = 'available', courtId = 'q1', dateKey = '2026-11-11'): ArenaSlot {
  return { ...virtualSlot('a1', courtId, dateKey, start, end), status };
}

describe('bloquear vários horários seguidos', () => {
  it('vai do horário clicado até o último livre colado nele', () => {
    const s8 = slot('08:00', '09:00');
    const pool = [slot('07:00', '08:00'), s8, slot('09:00', '10:00'), slot('10:00', '11:00')];
    expect(consecutiveBlockableSlots(pool, s8).map((s) => s.startTime)).toEqual(['08:00', '09:00', '10:00']);
  });

  it('para no primeiro reservado ou bloqueado, sem pular por cima dele', () => {
    const s8 = slot('08:00', '09:00');
    const pool = [s8, slot('09:00', '10:00'), slot('10:00', '11:00', 'booked'), slot('11:00', '12:00')];
    expect(consecutiveBlockableSlots(pool, s8).map((s) => s.startTime)).toEqual(['08:00', '09:00']);

    const blocked = [s8, slot('09:00', '10:00', 'blocked'), slot('10:00', '11:00')];
    expect(consecutiveBlockableSlots(blocked, s8).map((s) => s.startTime)).toEqual(['08:00']);
  });

  it('para num buraco da grade (quadra fechada no meio do dia)', () => {
    const s8 = slot('08:00', '09:00');
    const pool = [s8, slot('09:00', '10:00'), slot('14:00', '15:00')];
    expect(consecutiveBlockableSlots(pool, s8).map((s) => s.startTime)).toEqual(['08:00', '09:00']);
  });

  it('só olha a mesma quadra e o mesmo dia, em qualquer ordem de entrada', () => {
    const s8 = slot('08:00', '09:00');
    const pool = [
      slot('10:00', '11:00'),
      slot('09:00', '10:00', 'available', 'q2'),
      slot('09:00', '10:00', 'available', 'q1', '2026-11-12'),
      slot('09:00', '10:00'),
      s8,
    ];
    expect(consecutiveBlockableSlots(pool, s8).map((s) => s.startTime)).toEqual(['08:00', '09:00', '10:00']);
  });

  it('horário que não está livre não abre sequência', () => {
    const booked = slot('08:00', '09:00', 'booked');
    expect(consecutiveBlockableSlots([booked, slot('09:00', '10:00')], booked)).toEqual([]);
  });

  it('slot clicado fora da lista ainda vale como o 1º', () => {
    const s8 = slot('08:00', '09:00');
    expect(consecutiveBlockableSlots([slot('09:00', '10:00')], s8).map((s) => s.startTime)).toEqual(['08:00', '09:00']);
  });
});

describe('desbloquear vários horários seguidos', () => {
  it('vai do bloqueado clicado até o último bloqueado colado nele', () => {
    const s8 = slot('08:00', '09:00', 'blocked');
    const pool = [slot('07:00', '08:00', 'blocked'), s8, slot('09:00', '10:00', 'blocked'), slot('10:00', '11:00', 'blocked')];
    expect(consecutiveUnblockableSlots(pool, s8).map((s) => s.startTime)).toEqual(['08:00', '09:00', '10:00']);
  });

  it('para no primeiro livre ou reservado, e num buraco da grade', () => {
    const s8 = slot('08:00', '09:00', 'blocked');
    const free = [s8, slot('09:00', '10:00', 'blocked'), slot('10:00', '11:00'), slot('11:00', '12:00', 'blocked')];
    expect(consecutiveUnblockableSlots(free, s8).map((s) => s.startTime)).toEqual(['08:00', '09:00']);

    const booked = [s8, slot('09:00', '10:00', 'booked'), slot('10:00', '11:00', 'blocked')];
    expect(consecutiveUnblockableSlots(booked, s8).map((s) => s.startTime)).toEqual(['08:00']);

    const gap = [s8, slot('14:00', '15:00', 'blocked')];
    expect(consecutiveUnblockableSlots(gap, s8).map((s) => s.startTime)).toEqual(['08:00']);
  });

  it('horário que não está bloqueado não abre sequência', () => {
    const free = slot('08:00', '09:00');
    expect(consecutiveUnblockableSlots([free, slot('09:00', '10:00', 'blocked')], free)).toEqual([]);
  });
});
