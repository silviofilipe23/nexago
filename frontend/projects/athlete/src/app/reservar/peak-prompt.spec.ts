import { peakPromptFor } from './peak-prompt';
import type { ArenaPeakRule, ArenaSlot } from '@nexago/arena-discovery';

const QUA = new Date(2026, 7, 5); // 05/08/2026, quarta
const NOW_CEDO = new Date(2026, 7, 5, 10, 0);

function rule(overrides: Partial<ArenaPeakRule> = {}): ArenaPeakRule {
  return {
    id: 'r1',
    active: true,
    label: 'Pico noturno',
    courtIds: [],
    weekdays: [],
    startTime: '20:00',
    endTime: '21:00',
    minDurationMinutes: 120,
    releaseHoursBefore: null,
    ...overrides,
  };
}

function slot(startTime: string, endTime: string, rawStatus = 'available'): ArenaSlot {
  return {
    id: `q1_${startTime}`,
    arenaId: 'a1',
    courtId: 'q1',
    date: QUA,
    startTime,
    endTime,
    rawStatus,
    priceReais: 100,
    basePriceReais: 100,
    appliedPromotionId: null,
    isVirtual: rawStatus === 'available',
  };
}

const GRADE = [slot('19:00', '20:00'), slot('20:00', '21:00'), slot('21:00', '22:00')];

function promptFor(slots: ArenaSlot[], target: ArenaSlot, rules: ArenaPeakRule[], now = NOW_CEDO) {
  return peakPromptFor({
    rules, courtId: 'q1', date: QUA, courtDaySlots: slots,
    slot: target, slotDurationMinutes: 60, now,
  });
}

describe('peakPromptFor', () => {
  it('abre no slot de pico restrito, com a cadeia que começa nele', () => {
    const prompt = promptFor(GRADE, GRADE[1]!, [rule()]);
    expect(prompt?.minSlots).toBe(2);
    expect(prompt?.rule.id).toBe('r1');
    expect(prompt?.chain.map((s: ArenaSlot) => s.startTime)).toEqual(['20:00', '21:00']);
  });

  it('recua o início quando só a cadeia anterior existe', () => {
    const grade = [slot('19:00', '20:00'), slot('20:00', '21:00'), slot('21:00', '22:00', 'booked')];
    const prompt = promptFor(grade, grade[1]!, [rule()]);
    expect(prompt?.chain.map((s: ArenaSlot) => s.startTime)).toEqual(['19:00', '20:00']);
  });

  it('não abre sem nenhuma regra', () => {
    expect(promptFor(GRADE, GRADE[1]!, [])).toBeNull();
  });

  it('não abre em slot fora da faixa de pico', () => {
    expect(promptFor(GRADE, GRADE[0]!, [rule()])).toBeNull();
  });

  it('não abre quando as vizinhas inviabilizam a cadeia (slot liberado)', () => {
    const cercado = [
      slot('19:00', '20:00', 'booked'),
      slot('20:00', '21:00'),
      slot('21:00', '22:00', 'blocked'),
    ];
    expect(promptFor(cercado, cercado[1]!, [rule()])).toBeNull();
  });

  it('não abre depois de aberta a janela de liberação', () => {
    const dentroDaJanela = new Date(2026, 7, 5, 17, 30); // 20:00 − 3h = 17:00
    expect(promptFor(GRADE, GRADE[1]!, [rule({ releaseHoursBefore: 3 })], dentroDaJanela)).toBeNull();
  });

  it('usa o maior mínimo quando duas regras casam', () => {
    const grade4 = [
      slot('18:00', '19:00'), slot('19:00', '20:00'),
      slot('20:00', '21:00'), slot('21:00', '22:00'),
    ];
    const prompt = promptFor(grade4, grade4[2]!, [rule(), rule({ id: 'r2', minDurationMinutes: 180 })]);
    expect(prompt?.minSlots).toBe(3);
    expect(prompt?.rule.id).toBe('r2');
    expect(prompt?.chain.length).toBe(3);
  });
});
