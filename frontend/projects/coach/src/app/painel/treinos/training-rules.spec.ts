import {
  addDays,
  canDeleteTraining,
  compareTrainings,
  conflictMessage,
  findConflicts,
  followingInSeries,
  generateOccurrences,
  MAX_SERIES_OCCURRENCES,
  isEndBeforeStart,
  localIsoDate,
  pastCount,
  pastDatesMessage,
  sanitizeDuration,
  splitUpcoming,
  timeRangesOverlap,
} from './training-rules';
import type { Training } from './trainings.service';

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

describe('followingInSeries', () => {
  const t = (id: string, over: Partial<Training> = {}): Training => ({
    id,
    squadId: 's1',
    title: 'Aula',
    date: '2026-10-13',
    startTime: '19:00',
    endTime: '',
    location: '',
    materials: '',
    exercises: [],
    status: 'agendado',
    attendance: {},
    seriesId: 'A',
    ...over,
  });

  it('inclui o próprio treino e os posteriores da mesma série, em ordem', () => {
    const a = t('a', { date: '2026-10-13' });
    const b = t('b', { date: '2026-10-20' });
    const c = t('c', { date: '2026-10-15' });
    expect(followingInSeries([b, c, a], a).map((x) => x.id)).toEqual(['a', 'c', 'b']);
  });

  it('ignora anteriores, outra série, outra equipe, realizados e cancelados', () => {
    const from = t('from', { date: '2026-10-15' });
    const all = [
      from,
      t('antes', { date: '2026-10-13' }),
      t('outra-serie', { date: '2026-10-22', seriesId: 'B' }),
      t('outra-equipe', { date: '2026-10-22', squadId: 's2' }),
      t('feito', { date: '2026-10-22', status: 'realizado' }),
      t('cancelado', { date: '2026-10-29', status: 'cancelado' }),
      t('ok', { date: '2026-11-05' }),
    ];
    expect(followingInSeries(all, from).map((x) => x.id)).toEqual(['from', 'ok']);
  });

  it('treino avulso não tem seguintes', () => {
    const solo = t('solo', { seriesId: null });
    expect(followingInSeries([solo], solo)).toEqual([]);
  });
});

describe('timeRangesOverlap', () => {
  it('sobreposição parcial e total conflita', () => {
    expect(timeRangesOverlap('19:00', '20:00', '19:30', '20:30')).toBe(true);
    expect(timeRangesOverlap('19:00', '21:00', '19:30', '20:00')).toBe(true);
  });

  it('encostar sem sobrepor não conflita (acaba às 20h, começa às 20h)', () => {
    expect(timeRangesOverlap('19:00', '20:00', '20:00', '21:00')).toBe(false);
  });

  it('sem horário de fim, assume 1 hora a partir do início', () => {
    expect(timeRangesOverlap('19:00', '', '19:30', '')).toBe(true);
    expect(timeRangesOverlap('19:00', '', '20:00', '')).toBe(false);
  });

  it('fim inválido (antes do início) também cai em 1 hora', () => {
    expect(timeRangesOverlap('19:00', '18:00', '19:30', '')).toBe(true);
  });
});

describe('findConflicts', () => {
  const tr = (id: string, over: Partial<Training> = {}): Training => ({
    id,
    squadId: 's1',
    title: 'Aula ' + id,
    date: '2026-10-21',
    startTime: '19:00',
    endTime: '20:00',
    location: '',
    materials: '',
    exercises: [],
    status: 'agendado',
    attendance: {},
    seriesId: null,
    ...over,
  });

  it('acha o treino do mesmo dia com horário sobreposto', () => {
    const result = findConflicts(['2026-10-21'], '19:30', '20:30', [tr('a')]);
    expect(result.map((c) => [c.date, c.with.id])).toEqual([['2026-10-21', 'a']]);
  });

  it('ignora outro dia, horário livre, cancelado e o próprio treino em edição', () => {
    const existing = [
      tr('outro-dia', { date: '2026-10-22' }),
      tr('livre', { startTime: '21:00', endTime: '22:00' }),
      tr('cancelado', { status: 'cancelado' }),
      tr('eu'),
    ];
    expect(findConflicts(['2026-10-21'], '19:30', '20:30', existing, 'eu')).toEqual([]);
  });

  it('vale para qualquer equipe do professor', () => {
    expect(findConflicts(['2026-10-21'], '19:00', '20:00', [tr('a', { squadId: 's2' })])).toHaveSize(1);
  });

  it('numa série, devolve um conflito por data afetada', () => {
    const existing = [tr('a', { date: '2026-10-21' }), tr('b', { date: '2026-10-28' })];
    const result = findConflicts(['2026-10-14', '2026-10-21', '2026-10-28'], '19:00', '20:00', existing);
    expect(result.map((c) => c.date)).toEqual(['2026-10-21', '2026-10-28']);
  });

  it('sem horário de início não há o que comparar', () => {
    expect(findConflicts(['2026-10-21'], '', '', [tr('a')])).toEqual([]);
  });
});

describe('pastCount / pastDatesMessage', () => {
  it('conta datas anteriores a hoje (hoje não é passado)', () => {
    expect(pastCount(['2026-10-13', '2026-10-14', '2026-10-15'], '2026-10-14')).toBe(1);
  });

  it('mensagem de treino único', () => {
    expect(pastDatesMessage(1, 1)).toBe('Essa data já passou.');
  });

  it('mensagem de série informa quantos já passaram', () => {
    expect(pastDatesMessage(3, 8)).toBe('3 dos 8 treinos já passaram.');
  });

  it('sem datas passadas, nenhuma mensagem', () => {
    expect(pastDatesMessage(0, 8)).toBeNull();
  });
});

describe('conflictMessage', () => {
  const t = (over: Partial<Training> = {}): Training => ({
    id: 'a',
    squadId: 's1',
    title: 'Treino técnico',
    date: '2026-10-21',
    startTime: '19:00',
    endTime: '20:30',
    location: '',
    materials: '',
    exercises: [],
    status: 'agendado',
    attendance: {},
    seriesId: null,
    ...over,
  });
  const name = (id: string) => (id === 's2' ? 'Sub-17' : 'Sub-15');

  it('treino único: nome e horário do conflito', () => {
    expect(conflictMessage([{ date: '2026-10-21', with: t() }], 1, name, 's1')).toBe('Conflita com «Treino técnico» (19:00–20:30).');
  });

  it('sem horário de fim, mostra só o início', () => {
    expect(conflictMessage([{ date: '2026-10-21', with: t({ endTime: '' }) }], 1, name, 's1')).toBe('Conflita com «Treino técnico» (19:00).');
  });

  it('conflito com outra equipe diz qual', () => {
    expect(conflictMessage([{ date: '2026-10-21', with: t({ squadId: 's2' }) }], 1, name, 's1')).toBe(
      'Conflita com «Treino técnico» da equipe Sub-17 (19:00–20:30).',
    );
  });

  it('série: quantos conflitam e o primeiro', () => {
    const c = [
      { date: '2026-10-21', with: t() },
      { date: '2026-10-28', with: t({ id: 'b', date: '2026-10-28' }) },
    ];
    expect(conflictMessage(c, 8, name, 's1')).toBe('2 dos 8 treinos conflitam com treinos existentes. O primeiro é em 21/10, com «Treino técnico».');
  });

  it('sem conflitos, nenhuma mensagem', () => {
    expect(conflictMessage([], 1, name, 's1')).toBeNull();
  });
});
