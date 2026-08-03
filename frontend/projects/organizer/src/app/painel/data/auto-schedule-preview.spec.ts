import {
  formatHHMM,
  minutesFromDayStart,
  parseHHMM,
  previewBlocksByCourt,
  spWallToDate,
  startTimeOptions,
} from './auto-schedule-preview';

const DAY = '2026-10-24';

describe('parseHHMM / formatHHMM', () => {
  it('converte ida e volta', () => {
    expect(parseHHMM('07:00')).toBe(420);
    expect(parseHHMM('24:00')).toBe(1440);
    expect(formatHHMM(420)).toBe('07:00');
    expect(formatHHMM(1470)).toBe('24:30');
  });
});

describe('minutesFromDayStart', () => {
  it('conta a partir da meia-noite na parede SP', () => {
    expect(minutesFromDayStart(spWallToDate(DAY, 480), DAY)).toBe(480);
  });

  it('não reinicia na virada do dia', () => {
    // 00:30 do dia seguinte = 1470 min do dia selecionado, não 30.
    const pastMidnight = new Date(`${DAY}T00:30:00-03:00`);
    pastMidnight.setDate(pastMidnight.getDate() + 1);
    expect(minutesFromDayStart(pastMidnight, DAY)).toBe(1470);
  });
});

describe('startTimeOptions', () => {
  it('vai da abertura até o último slot que cabe', () => {
    expect(startTimeOptions(420, 540, 30)).toEqual([420, 450, 480, 510]);
  });

  it('devolve ao menos a abertura em janela degenerada', () => {
    expect(startTimeOptions(420, 420, 30)).toEqual([420]);
    expect(startTimeOptions(420, 300, 30)).toEqual([420]);
  });
});

describe('previewBlocksByCourt', () => {
  const slot = (matchId: string, courtId: string, startMin: number, durMin = 30) => ({
    matchId,
    courtId,
    start: spWallToDate(DAY, startMin).toISOString(),
    end: spWallToDate(DAY, startMin + durMin).toISOString(),
  });

  it('agrupa por quadra e ordena por horário', () => {
    const blocks = previewBlocksByCourt(
      [slot('m2', 'Q1', 510), slot('m1', 'Q1', 480), slot('m3', 'Q2', 480)],
      { dayKey: DAY, fallbackDurMin: 30 },
    );

    expect(blocks['Q1'].map((b) => b.matchId)).toEqual(['m1', 'm2']);
    expect(blocks['Q1'][0]).toEqual({ matchId: 'm1', courtId: 'Q1', startMin: 480, durMin: 30 });
    expect(blocks['Q2'].map((b) => b.matchId)).toEqual(['m3']);
  });

  it('deriva a duração do próprio slot', () => {
    const blocks = previewBlocksByCourt([slot('m1', 'Q1', 480, 50)], { dayKey: DAY, fallbackDurMin: 30 });
    expect(blocks['Q1'][0].durMin).toBe(50);
  });

  it('cai na duração padrão quando o fim é inválido', () => {
    const blocks = previewBlocksByCourt(
      [{ matchId: 'm1', courtId: 'Q1', start: spWallToDate(DAY, 480).toISOString(), end: '' }],
      { dayKey: DAY, fallbackDurMin: 45 },
    );
    expect(blocks['Q1'][0].durMin).toBe(45);
  });

  it('descarta slot sem quadra ou com início inválido', () => {
    const blocks = previewBlocksByCourt(
      [
        { matchId: 'm1', courtId: '  ', start: spWallToDate(DAY, 480).toISOString(), end: '' },
        { matchId: 'm2', courtId: 'Q1', start: 'nao-e-data', end: '' },
      ],
      { dayKey: DAY, fallbackDurMin: 30 },
    );
    expect(blocks).toEqual({});
  });

  it('mantém depois da meia-noite o que transborda a jornada', () => {
    const blocks = previewBlocksByCourt([slot('m1', 'Q1', 1440)], { dayKey: DAY, fallbackDurMin: 30 });
    expect(blocks['Q1'][0].startMin).toBe(1440);
  });
});
