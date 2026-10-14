import {
  addDays,
  canDeleteTraining,
  compareTrainings,
  generateOccurrences,
  MAX_SERIES_OCCURRENCES,
  isEndBeforeStart,
  localIsoDate,
  sanitizeDuration,
  splitUpcoming,
} from './training-rules';

describe('canDeleteTraining', () => {
  it('permite excluir treino sem presença', () => {
    expect(canDeleteTraining({ attendance: {} })).toBe(true);
  });

  it('bloqueia treino com presença registrada', () => {
    expect(canDeleteTraining({ attendance: { a1: 'presente' } })).toBe(false);
  });
});

describe('localIsoDate', () => {
  it('usa o dia local, não o UTC', () => {
    // 23:30 local do dia 14 — em UTC (Brasil) já seria dia 15.
    expect(localIsoDate(new Date(2026, 9, 14, 23, 30))).toBe('2026-10-14');
  });
});

describe('compareTrainings / splitUpcoming', () => {
  const t = (date: string, startTime: string) => ({ date, startTime });

  it('ordena por data e depois por horário', () => {
    const list = [t('2026-10-15', '19:00'), t('2026-10-14', '20:00'), t('2026-10-15', '08:00')];
    expect([...list].sort(compareTrainings)).toEqual([t('2026-10-14', '20:00'), t('2026-10-15', '08:00'), t('2026-10-15', '19:00')]);
  });

  it('separa próximos (crescente, hoje incluso) e anteriores (mais recente primeiro)', () => {
    const { upcoming, past } = splitUpcoming(
      [t('2026-10-10', '19:00'), t('2026-10-14', '19:00'), t('2026-10-20', '19:00'), t('2026-10-12', '19:00')],
      '2026-10-14',
    );
    expect(upcoming.map((x) => x.date)).toEqual(['2026-10-14', '2026-10-20']);
    expect(past.map((x) => x.date)).toEqual(['2026-10-12', '2026-10-10']);
  });
});

describe('isEndBeforeStart', () => {
  it('aceita fim vazio', () => expect(isEndBeforeStart('19:00', '')).toBe(false));
  it('aceita fim depois do início', () => expect(isEndBeforeStart('19:00', '20:30')).toBe(false));
  it('recusa fim igual ou antes do início', () => {
    expect(isEndBeforeStart('19:00', '19:00')).toBe(true);
    expect(isEndBeforeStart('19:00', '18:00')).toBe(true);
  });
});

describe('sanitizeDuration', () => {
  it('mantém valores válidos arredondados', () => expect(sanitizeDuration(12.4)).toBe(12));
  it('cai em 10 para zero, negativo ou NaN', () => {
    expect(sanitizeDuration(0)).toBe(10);
    expect(sanitizeDuration(-5)).toBe(10);
    expect(sanitizeDuration(NaN)).toBe(10);
  });
  it('limita a 240', () => expect(sanitizeDuration(999)).toBe(240));
});

describe('addDays', () => {
  it('soma dias dentro do mês', () => expect(addDays('2026-10-14', 7)).toBe('2026-10-21'));
  it('vira o mês e o ano', () => {
    expect(addDays('2026-10-28', 7)).toBe('2026-11-04');
    expect(addDays('2026-12-30', 7)).toBe('2027-01-06');
  });
});

describe('generateOccurrences', () => {
  // 2026-10-13 é terça-feira.
  it('gera terças e quintas no intervalo, inclusive o último dia', () => {
    expect(generateOccurrences('2026-10-13', '2026-10-22', [2, 4])).toEqual([
      '2026-10-13',
      '2026-10-15',
      '2026-10-20',
      '2026-10-22',
    ]);
  });

  it('não inclui a data inicial se o dia da semana não está marcado', () => {
    expect(generateOccurrences('2026-10-13', '2026-10-20', [4])).toEqual(['2026-10-15']);
  });

  it('atravessa a virada de mês e de ano', () => {
    expect(generateOccurrences('2026-12-29', '2027-01-12', [2])).toEqual(['2026-12-29', '2027-01-05', '2027-01-12']);
  });

  it('devolve vazio sem dias, sem datas ou com "até" antes do início', () => {
    expect(generateOccurrences('2026-10-13', '2026-10-30', [])).toEqual([]);
    expect(generateOccurrences('', '2026-10-30', [2])).toEqual([]);
    expect(generateOccurrences('2026-10-13', '2026-10-01', [2])).toEqual([]);
  });

  it('para uma além do teto, pra quem chama detectar o estouro', () => {
    const all = generateOccurrences('2026-01-05', '2027-12-31', [0, 1, 2, 3, 4, 5, 6]);
    expect(all.length).toBe(MAX_SERIES_OCCURRENCES + 1);
  });
});
