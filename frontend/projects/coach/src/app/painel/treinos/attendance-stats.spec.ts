import { absenceStreak, athletesAtRisk, attendanceRate, defaultAttendance, isPresent, sameAttendance, summarizeAttendance } from './attendance-stats';
import type { AttendanceStatus, Training } from './trainings.service';

function training(overrides: Partial<Training> = {}): Training {
  return {
    id: 't1',
    squadId: 's1',
    title: 'Treino',
    date: '2026-07-01',
    startTime: '19:00',
    endTime: '21:00',
    location: '',
    materials: '',
    exercises: [],
    status: 'realizado',
    attendance: {},
    seriesId: null,
    ...overrides,
  };
}

describe('attendanceRate', () => {
  it('returns null when the athlete has no completed training recorded', () => {
    const trainings = [training({ status: 'agendado', attendance: {} })];
    expect(attendanceRate('a1', trainings)).toBeNull();
  });

  it('returns 100 when the athlete was present in every completed training', () => {
    const trainings = [
      training({ id: 't1', attendance: { a1: 'presente' } }),
      training({ id: 't2', attendance: { a1: 'presente' } }),
    ];
    expect(attendanceRate('a1', trainings)).toBe(100);
  });

  it('counts atrasado as attendance and ausente/justificado as absence', () => {
    const trainings = [
      training({ id: 't1', attendance: { a1: 'presente' } }),
      training({ id: 't2', attendance: { a1: 'atrasado' } }),
      training({ id: 't3', attendance: { a1: 'ausente' } }),
      training({ id: 't4', attendance: { a1: 'justificado' } }),
    ];
    expect(attendanceRate('a1', trainings)).toBe(50);
  });

  it('ignores completed trainings where the athlete has no attendance entry', () => {
    const trainings = [
      training({ id: 't1', attendance: { a1: 'presente' } }),
      training({ id: 't2', attendance: { a2: 'presente' } }),
    ];
    expect(attendanceRate('a1', trainings)).toBe(100);
  });

  it('ignores trainings that are not realizado, even if attendance is present', () => {
    const trainings = [training({ status: 'agendado', attendance: { a1: 'presente' } })];
    expect(attendanceRate('a1', trainings)).toBeNull();
  });
});

describe('isPresent', () => {
  it('conta presente e atrasado', () => {
    expect(isPresent('presente')).toBe(true);
    expect(isPresent('atrasado')).toBe(true);
  });
  it('não conta ausente nem justificado', () => {
    expect(isPresent('ausente')).toBe(false);
    expect(isPresent('justificado')).toBe(false);
  });
});

describe('defaultAttendance', () => {
  it('marca todo o elenco como presente', () => {
    expect(defaultAttendance(['a1', 'a2'])).toEqual({ a1: 'presente', a2: 'presente' });
  });
  it('elenco vazio dá chamada vazia', () => expect(defaultAttendance([])).toEqual({}));
});

describe('summarizeAttendance', () => {
  it('conta por status e quem ficou sem marcação', () => {
    const summary = summarizeAttendance({ a1: 'presente', a2: 'ausente', a3: 'atrasado' }, ['a1', 'a2', 'a3', 'a4']);
    expect(summary).toEqual({ presente: 1, ausente: 1, atrasado: 1, justificado: 0, semMarcacao: 1 });
  });
  it('ignora quem não está mais no elenco', () => {
    const summary = summarizeAttendance({ a1: 'presente', velho: 'ausente' }, ['a1']);
    expect(summary).toEqual({ presente: 1, ausente: 0, atrasado: 0, justificado: 0, semMarcacao: 0 });
  });
});

describe('sameAttendance', () => {
  it('ignora a ordem das chaves', () => {
    expect(sameAttendance({ a: 'presente', b: 'ausente' }, { b: 'ausente', a: 'presente' })).toBe(true);
  });
  it('detecta diferença de status ou de chaves', () => {
    expect(sameAttendance({ a: 'presente' }, { a: 'ausente' })).toBe(false);
    expect(sameAttendance({ a: 'presente' }, {})).toBe(false);
  });
});

describe('absenceStreak', () => {
  const t = (id: string, date: string, status: AttendanceStatus | null, over: Partial<Training> = {}) =>
    training({ id, date, attendance: status ? { a1: status } : {}, ...over });

  it('conta as faltas seguidas até o treino mais recente', () => {
    const list = [t('1', '2026-10-01', 'presente'), t('2', '2026-10-08', 'ausente'), t('3', '2026-10-15', 'ausente')];
    expect(absenceStreak('a1', list)).toEqual({ streak: 2, lastPresentDate: '2026-10-01' });
  });

  it('presente, atrasado ou justificado recente zera a sequência', () => {
    const base = [t('1', '2026-10-01', 'ausente'), t('2', '2026-10-08', 'ausente')];
    expect(absenceStreak('a1', [...base, t('3', '2026-10-15', 'presente')]).streak).toBe(0);
    expect(absenceStreak('a1', [...base, t('3', '2026-10-15', 'atrasado')]).streak).toBe(0);
    expect(absenceStreak('a1', [...base, t('3', '2026-10-15', 'justificado')]).streak).toBe(0);
  });

  it('ignora treino cancelado, agendado e sem registro do atleta', () => {
    const list = [
      t('1', '2026-10-01', 'ausente'),
      t('2', '2026-10-08', 'ausente'),
      t('3', '2026-10-15', 'presente', { status: 'cancelado' }),
      t('4', '2026-10-22', 'presente', { status: 'agendado' }),
      t('5', '2026-10-29', null),
    ];
    expect(absenceStreak('a1', list).streak).toBe(2);
  });

  it('ordena por data mesmo com a lista fora de ordem e sem presença anterior', () => {
    const list = [t('2', '2026-10-08', 'ausente'), t('1', '2026-10-01', 'ausente')];
    expect(absenceStreak('a1', list)).toEqual({ streak: 2, lastPresentDate: null });
  });

  it('atleta sem treinos tem sequência zero', () => {
    expect(absenceStreak('a1', [])).toEqual({ streak: 0, lastPresentDate: null });
  });
});

describe('athletesAtRisk', () => {
  const athlete = (uid: string, over: Record<string, unknown> = {}) => ({
    athleteUid: uid,
    displayName: uid.toUpperCase(),
    squadId: 's1',
    status: 'ativo',
    ...over,
  });
  const miss = (id: string, date: string, uids: string[]) =>
    training({ id, date, attendance: Object.fromEntries(uids.map((u) => [u, 'ausente' as const])) });

  it('classifica 2 como atenção e 3+ como crítico, mais críticos primeiro', () => {
    const trainings = [
      miss('1', '2026-10-01', ['b']),
      miss('2', '2026-10-08', ['a', 'b']),
      miss('3', '2026-10-15', ['a', 'b']),
    ];
    const result = athletesAtRisk([athlete('a'), athlete('b')], trainings);
    expect(result.map((r) => [r.athleteUid, r.streak, r.level])).toEqual([
      ['b', 3, 'critico'],
      ['a', 2, 'atencao'],
    ]);
  });

  it('não alerta lesionado, afastado, férias, sem equipe ou com 1 falta só', () => {
    const trainings = [miss('1', '2026-10-01', ['a', 'b', 'c', 'd', 'e']), miss('2', '2026-10-08', ['a', 'b', 'c', 'd'])];
    const roster = [
      athlete('a', { status: 'lesionado' }),
      athlete('b', { status: 'afastado' }),
      athlete('c', { status: 'ferias' }),
      athlete('d', { squadId: null }),
      athlete('e'),
    ];
    expect(athletesAtRisk(roster, trainings)).toEqual([]);
  });

  it('só considera os treinos da equipe do atleta', () => {
    const trainings = [
      miss('1', '2026-10-01', ['a']),
      miss('2', '2026-10-08', ['a']),
      { ...miss('3', '2026-10-15', ['a']), squadId: 's2' },
    ];
    expect(athletesAtRisk([athlete('a')], trainings)[0]?.streak).toBe(2);
  });
});
