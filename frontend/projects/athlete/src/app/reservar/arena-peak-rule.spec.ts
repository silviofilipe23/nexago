import {
  minimumChainContaining,
  peakCheckForSelection,
  peakBadgeMinSlots,
  peakRuleMatches,
  type ArenaPeakRule,
  type ArenaSlot,
} from '@nexago/arena-discovery';

const QUA = new Date(2026, 7, 5); // 05/08/2026, quarta (ISO weekday 3)
const NOW_CEDO = new Date(2026, 7, 5, 10, 0); // 10:00 do mesmo dia

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

function day(...slots: ArenaSlot[]): ArenaSlot[] {
  return slots;
}

describe('peakRuleMatches', () => {
  it('casa pelo início do slot dentro da faixa', () => {
    expect(peakRuleMatches(rule(), 'q1', QUA, '20:00')).toBe(true);
    expect(peakRuleMatches(rule(), 'q1', QUA, '19:00')).toBe(false);
    expect(peakRuleMatches(rule(), 'q1', QUA, '21:00')).toBe(false);
  });

  it('respeita filtro de quadra e de dia da semana', () => {
    expect(peakRuleMatches(rule({ courtIds: ['q2'] }), 'q1', QUA, '20:00')).toBe(false);
    expect(peakRuleMatches(rule({ weekdays: [3] }), 'q1', QUA, '20:00')).toBe(true);
    expect(peakRuleMatches(rule({ weekdays: [6, 7] }), 'q1', QUA, '20:00')).toBe(false);
  });

  it('regra inativa nunca casa', () => {
    expect(peakRuleMatches(rule({ active: false }), 'q1', QUA, '20:00')).toBe(false);
  });

  it('suporta faixa cruzando a meia-noite', () => {
    const overnight = rule({ startTime: '22:00', endTime: '01:00' });
    expect(peakRuleMatches(overnight, 'q1', QUA, '23:00')).toBe(true);
    expect(peakRuleMatches(overnight, 'q1', QUA, '00:00')).toBe(true);
    expect(peakRuleMatches(overnight, 'q1', QUA, '21:00')).toBe(false);
  });
});

describe('peakCheckForSelection', () => {
  const daySlots = day(
    slot('19:00', '20:00'),
    slot('20:00', '21:00'),
    slot('21:00', '22:00'),
  );

  it('sem regra: seleção de 1h passa (minSlots 1)', () => {
    const r = peakCheckForSelection({
      rules: [], courtId: 'q1', date: QUA, courtDaySlots: daySlots,
      selection: [daySlots[1]!], slotDurationMinutes: 60, now: NOW_CEDO,
    });
    expect(r.minSlots).toBe(1);
    expect(r.rule).toBeNull();
  });

  it('20h avulsa com vizinhas livres: exige 2 slots', () => {
    const r = peakCheckForSelection({
      rules: [rule()], courtId: 'q1', date: QUA, courtDaySlots: daySlots,
      selection: [daySlots[1]!], slotDurationMinutes: 60, now: NOW_CEDO,
    });
    expect(r.minSlots).toBe(2);
    expect(r.rule?.id).toBe('r1');
  });

  it('seleção de 2h incluindo o pico passa (sem exigência pendente)', () => {
    const r = peakCheckForSelection({
      rules: [rule()], courtId: 'q1', date: QUA, courtDaySlots: daySlots,
      selection: [daySlots[0]!, daySlots[1]!], slotDurationMinutes: 60, now: NOW_CEDO,
    });
    expect(r.minSlots).toBe(1); // seleção já cumpre o mínimo → nada pendente
  });

  it('vizinhas ocupadas/bloqueadas: avulso liberado (sem cadeia possível)', () => {
    const cercado = day(
      slot('19:00', '20:00', 'booked'),
      slot('20:00', '21:00'),
      slot('21:00', '22:00', 'blocked'),
    );
    const r = peakCheckForSelection({
      rules: [rule()], courtId: 'q1', date: QUA, courtDaySlots: cercado,
      selection: [cercado[1]!], slotDurationMinutes: 60, now: NOW_CEDO,
    });
    expect(r.minSlots).toBe(1);
  });

  it('uma vizinha livre basta para manter a exigência', () => {
    const parcial = day(
      slot('19:00', '20:00', 'booked'),
      slot('20:00', '21:00'),
      slot('21:00', '22:00'),
    );
    const r = peakCheckForSelection({
      rules: [rule()], courtId: 'q1', date: QUA, courtDaySlots: parcial,
      selection: [parcial[1]!], slotDurationMinutes: 60, now: NOW_CEDO,
    });
    expect(r.minSlots).toBe(2);
  });

  it('vizinha no passado não conta como cadeia: às 19h30, com 21h ocupada, 20h avulsa libera', () => {
    const tarde = new Date(2026, 7, 5, 19, 30);
    const soFrente = day(
      slot('19:00', '20:00'),          // livre, mas já passou das 19h30
      slot('20:00', '21:00'),
      slot('21:00', '22:00', 'booked'),
    );
    const r = peakCheckForSelection({
      rules: [rule()], courtId: 'q1', date: QUA, courtDaySlots: soFrente,
      selection: [soFrente[1]!], slotDurationMinutes: 60, now: tarde,
    });
    expect(r.minSlots).toBe(1);
  });

  it('janela de liberação: 3h antes libera o avulso', () => {
    const r = rule({ releaseHoursBefore: 3 });
    const dentroDaJanela = new Date(2026, 7, 5, 17, 30); // 20:00 − 3h = 17:00
    const fora = new Date(2026, 7, 5, 16, 59);
    const liberado = peakCheckForSelection({
      rules: [r], courtId: 'q1', date: QUA, courtDaySlots: daySlots,
      selection: [daySlots[1]!], slotDurationMinutes: 60, now: dentroDaJanela,
    });
    const bloqueado = peakCheckForSelection({
      rules: [r], courtId: 'q1', date: QUA, courtDaySlots: daySlots,
      selection: [daySlots[1]!], slotDurationMinutes: 60, now: fora,
    });
    expect(liberado.minSlots).toBe(1);
    expect(bloqueado.minSlots).toBe(2);
  });

  it('duas regras sobrepostas: vale o maior mínimo', () => {
    const grade4 = day(
      slot('18:00', '19:00'), slot('19:00', '20:00'),
      slot('20:00', '21:00'), slot('21:00', '22:00'),
    );
    const r = peakCheckForSelection({
      rules: [rule(), rule({ id: 'r2', minDurationMinutes: 180 })],
      courtId: 'q1', date: QUA, courtDaySlots: grade4,
      selection: [grade4[2]!], slotDurationMinutes: 60, now: NOW_CEDO,
    });
    expect(r.minSlots).toBe(3);
    expect(r.rule?.id).toBe('r2');
  });

  it('quadra com slot de 30min: mínimo de 120min = 4 slots', () => {
    const meia = day(
      slot('19:00', '19:30'), slot('19:30', '20:00'),
      slot('20:00', '20:30'), slot('20:30', '21:00'),
      slot('21:00', '21:30'), slot('21:30', '22:00'),
    );
    const r = peakCheckForSelection({
      rules: [rule()], courtId: 'q1', date: QUA, courtDaySlots: meia,
      selection: [meia[2]!], slotDurationMinutes: 30, now: NOW_CEDO,
    });
    expect(r.minSlots).toBe(4);
  });
});

describe('peakBadgeMinSlots', () => {
  it('devolve o mínimo exigido para o chip (badge) e 1 quando livre', () => {
    const daySlots = day(
      slot('19:00', '20:00'), slot('20:00', '21:00'), slot('21:00', '22:00'),
    );
    expect(peakBadgeMinSlots({
      rules: [rule()], courtId: 'q1', date: QUA, courtDaySlots: daySlots,
      slot: daySlots[1]!, slotDurationMinutes: 60, now: NOW_CEDO,
    })).toBe(2);
    expect(peakBadgeMinSlots({
      rules: [rule()], courtId: 'q1', date: QUA, courtDaySlots: daySlots,
      slot: daySlots[0]!, slotDurationMinutes: 60, now: NOW_CEDO,
    })).toBe(1);
  });
});

describe('minimumChainContaining', () => {
  it('prefere a cadeia que começa no slot clicado', () => {
    const daySlots = day(
      slot('19:00', '20:00'),
      slot('20:00', '21:00'),
      slot('21:00', '22:00'),
    );
    const chain = minimumChainContaining({
      courtDaySlots: daySlots, targetStartTime: '20:00', minSlots: 2,
      date: QUA, now: NOW_CEDO,
    });
    expect(chain?.map((s: ArenaSlot) => s.startTime)).toEqual(['20:00', '21:00']);
  });

  it('recua o início quando a cadeia para frente não existe', () => {
    const daySlots = day(
      slot('19:00', '20:00'),
      slot('20:00', '21:00'),
      slot('21:00', '22:00', 'booked'),
    );
    const chain = minimumChainContaining({
      courtDaySlots: daySlots, targetStartTime: '20:00', minSlots: 2,
      date: QUA, now: NOW_CEDO,
    });
    expect(chain?.map((s: ArenaSlot) => s.startTime)).toEqual(['19:00', '20:00']);
  });

  it('devolve null quando nenhuma cadeia é possível', () => {
    const daySlots = day(
      slot('19:00', '20:00', 'booked'),
      slot('20:00', '21:00'),
      slot('21:00', '22:00', 'blocked'),
    );
    const chain = minimumChainContaining({
      courtDaySlots: daySlots, targetStartTime: '20:00', minSlots: 2,
      date: QUA, now: NOW_CEDO,
    });
    expect(chain).toBeNull();
  });

  it('não usa slot já passado para montar a cadeia', () => {
    const tarde = new Date(2026, 7, 5, 19, 30);
    const daySlots = day(
      slot('19:00', '20:00'),
      slot('20:00', '21:00'),
      slot('21:00', '22:00', 'booked'),
    );
    const chain = minimumChainContaining({
      courtDaySlots: daySlots, targetStartTime: '20:00', minSlots: 2,
      date: QUA, now: tarde,
    });
    expect(chain).toBeNull();
  });

  it('exige contiguidade entre os slots da cadeia', () => {
    const comBuraco = day(
      slot('19:00', '20:00'),
      slot('21:00', '22:00'),
    );
    const chain = minimumChainContaining({
      courtDaySlots: comBuraco, targetStartTime: '21:00', minSlots: 2,
      date: QUA, now: NOW_CEDO,
    });
    expect(chain).toBeNull();
  });

  it('monta 4 slots em quadra de 30min', () => {
    const meia = day(
      slot('19:00', '19:30'), slot('19:30', '20:00'),
      slot('20:00', '20:30'), slot('20:30', '21:00'),
      slot('21:00', '21:30'), slot('21:30', '22:00'),
    );
    const chain = minimumChainContaining({
      courtDaySlots: meia, targetStartTime: '20:00', minSlots: 4,
      date: QUA, now: NOW_CEDO,
    });
    expect(chain?.map((s: ArenaSlot) => s.startTime)).toEqual(['20:00', '20:30', '21:00', '21:30']);
  });

  it('slot inexistente na grade devolve null', () => {
    const daySlots = day(slot('19:00', '20:00'), slot('20:00', '21:00'));
    const chain = minimumChainContaining({
      courtDaySlots: daySlots, targetStartTime: '23:00', minSlots: 2,
      date: QUA, now: NOW_CEDO,
    });
    expect(chain).toBeNull();
  });
});
