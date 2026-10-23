import { rsvpLabel, attendanceRoster, effectLabel } from './attendance-roster';
import { rosterAfter } from '../../domain/enrollment';

describe('attendanceRoster', () => {
  it('turma + reposição + quem saiu mas tem marcação, sem repetir', () => {
    const rows = attendanceRoster(['a', 'b'], { a: 'present', x: 'absent' }, ['r', 'a']);
    expect(rows.map((r) => [r.studentId, r.makeup, r.former])).toEqual([
      ['a', false, false],
      ['b', false, false],
      ['r', true, false],
      ['x', false, true],
    ]);
  });

  it('descreve os créditos aplicados', () => {
    expect(effectLabel({ credit: -1, makeup: 0 })).toBe('−1 crédito do pacote');
    expect(effectLabel({ credit: 0, makeup: 1 })).toBe('+1 reposição');
    expect(effectLabel(undefined)).toBe('');
  });
});

describe('rosterAfter', () => {
  it('entra e sai junto com a vaga', () => {
    expect(rosterAfter(['a'], 'b', 1)).toEqual(['a', 'b']);
    expect(rosterAfter(['a', 'b'], 'a', -1)).toEqual(['b']);
    expect(rosterAfter(['a'], 'a', 1)).toEqual(['a']);
    expect(rosterAfter(undefined, 'a', 0)).toEqual([]);
  });
});

describe('rsvpLabel', () => {
  it('mostra a resposta do aluno pelo app', () => {
    expect(rsvpLabel('going', false)).toEqual({ text: 'Vai · app', tone: 'green' });
    expect(rsvpLabel('not_going', true)).toEqual({ text: 'Avisou no prazo · app', tone: 'yellow' });
    expect(rsvpLabel('not_going', false)).toEqual({ text: 'Não vai · app', tone: 'yellow' });
    expect(rsvpLabel(undefined, false)).toBeNull();
  });
});
