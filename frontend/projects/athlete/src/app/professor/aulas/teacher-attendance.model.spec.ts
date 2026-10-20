import {
  attendanceCounts,
  attendanceCountsLine,
  attendancePayload,
  attendancePrimaryLabel,
  closeAttendanceNotice,
  draftDiffers,
  draftFromRoster,
  markRemainingPresent,
  teacherClassCta,
  teacherRosterFromRaw,
  teacherSessionSubtitle,
  toggleMark,
  type TeacherRosterStudent,
} from './teacher-attendance.model';
import { teacherAttendanceError } from './teacher-attendance.repository';

const RAW = {
  session: {
    sessionId: 'class_c1_2026-10-21',
    arenaId: 'a1',
    arenaName: 'Arena Sol',
    classId: 'c1',
    className: 'Intermediário B',
    date: '2026-10-21',
    startTime: '18:00',
    endTime: '19:00',
    courtName: 'Quadra 2',
    status: 'scheduled',
    teacherNote: '  ',
    attendanceOpen: true,
  },
  students: [
    { studentId: 's1', name: 'Ana Lima', photoUrl: 'https://x/a.jpg', kind: 'regular', mark: 'present' },
    { studentId: 's2', name: 'Bruno', photoUrl: null, kind: 'regular', mark: null },
    { studentId: 'x1', name: 'Caio', photoUrl: '', kind: 'makeup', mark: 'excused' },
    { studentId: 'x2', name: 'Duda', kind: 'trial' },
    { studentId: '', name: 'sem id' },
  ],
};

function students(): TeacherRosterStudent[] {
  return teacherRosterFromRaw(RAW)!.students;
}

describe('teacherRosterFromRaw (getMyClassSessionRoster)', () => {
  it('mapeia aula e alunos; descarta aluno sem id', () => {
    const roster = teacherRosterFromRaw(RAW)!;
    expect(roster.session.className).toBe('Intermediário B');
    expect(roster.session.attendanceOpen).toBeTrue();
    expect(roster.session.teacherNote).toBeNull();
    expect(roster.students.map((s) => s.studentId)).toEqual(['s1', 's2', 'x1', 'x2']);
    expect(roster.students[0]).toEqual({ studentId: 's1', name: 'Ana Lima', photoUrl: 'https://x/a.jpg', kind: 'regular', mark: 'present' });
    expect(roster.students[2]!.photoUrl).toBeNull();
    expect(roster.students[2]!.kind).toBe('makeup');
    expect(roster.students[3]!.kind).toBe('trial');
    expect(roster.students[3]!.mark).toBeNull();
  });

  it('valores desconhecidos caem no padrão seguro; sem aula = null', () => {
    const roster = teacherRosterFromRaw({ session: { ...RAW.session, status: 'weird', attendanceOpen: 'yes' }, students: 'x' })!;
    expect(roster.session.status).toBe('scheduled');
    expect(roster.session.attendanceOpen).toBeFalse();
    expect(roster.students).toEqual([]);
    expect(teacherRosterFromRaw(null)).toBeNull();
    expect(teacherRosterFromRaw({ session: { className: 'x' } })).toBeNull();
  });
});

describe('rascunho da chamada', () => {
  it('nasce das marcas gravadas e conta por tipo', () => {
    const draft = draftFromRoster(students());
    expect(draft).toEqual({ s1: 'present', s2: null, x1: 'excused', x2: null });
    expect(attendanceCounts(draft)).toEqual({ present: 1, absent: 0, excused: 1, unmarked: 2 });
    expect(attendanceCountsLine(attendanceCounts(draft))).toBe('1 presente · 0 faltas · 1 justificada · 2 sem marcação');
  });

  it('tocar de novo a mesma marca limpa; outra marca troca', () => {
    const draft = draftFromRoster(students());
    expect(toggleMark(draft, 's1', 'present')['s1']).toBeNull();
    expect(toggleMark(draft, 's1', 'absent')['s1']).toBe('absent');
    expect(toggleMark(draft, 's2', 'present')['s2']).toBe('present');
  });

  it('"restantes presentes" não apaga falta nem justificada', () => {
    const draft = markRemainingPresent(toggleMark(draftFromRoster(students()), 's2', 'absent'));
    expect(draft).toEqual({ s1: 'present', s2: 'absent', x1: 'excused', x2: 'present' });
  });

  it('diferença e payload: toda a lista, null apaga', () => {
    const list = students();
    const draft = draftFromRoster(list);
    expect(draftDiffers(draft, list)).toBeFalse();
    const edited = toggleMark(draft, 's1', 'present');
    expect(draftDiffers(edited, list)).toBeTrue();
    expect(attendancePayload(edited, list)).toEqual({ s1: null, s2: null, x1: 'excused', x2: null });
  });
});

describe('textos da chamada', () => {
  it('botão principal: fechar com contagem ou corrigir', () => {
    expect(attendancePrimaryLabel('scheduled', 1)).toBe('Fechar chamada · 1 presente');
    expect(attendancePrimaryLabel('scheduled', 4)).toBe('Fechar chamada · 4 presentes');
    expect(attendancePrimaryLabel('completed', 4)).toBe('Salvar correções');
  });

  it('aviso ao fechar, com crédito e pacote', () => {
    expect(closeAttendanceNotice(0, 0)).toBe('Chamada fechada.');
    expect(closeAttendanceNotice(1, 2)).toBe(
      'Chamada fechada · 1 crédito de reposição gerado · 2 aulas descontadas de pacote.',
    );
  });

  it('subtítulo da aula com dia da semana', () => {
    expect(teacherSessionSubtitle(RAW.session)).toBe('qua, 21/10 · 18:00–19:00 · Quadra 2 · Arena Sol');
  });
});

describe('teacherClassCta (agenda)', () => {
  const item = { role: 'teacher' as const, canManageLessons: true, status: 'scheduled', date: '2026-10-20' };

  it('mostra só para o professor com a permissão, fora de aula cancelada', () => {
    expect(teacherClassCta(item, '2026-10-20')).toEqual({ label: 'Fazer chamada', primary: true });
    expect(teacherClassCta({ ...item, canManageLessons: false }, '2026-10-20')).toBeNull();
    expect(teacherClassCta({ ...item, canManageLessons: null }, '2026-10-20')).toBeNull();
    expect(teacherClassCta({ ...item, role: 'student' }, '2026-10-20')).toBeNull();
    expect(teacherClassCta({ ...item, status: 'canceled' }, '2026-10-20')).toBeNull();
  });

  it('futura vira "Ver lista"; fechada vira "Ver chamada"', () => {
    expect(teacherClassCta(item, '2026-10-19')).toEqual({ label: 'Ver lista', primary: false });
    expect(teacherClassCta({ ...item, status: 'completed' }, '2026-10-25')).toEqual({ label: 'Ver chamada', primary: false });
  });
});

describe('teacherAttendanceError', () => {
  it('permission-denied leva a mensagem do servidor (motivo do vínculo)', () => {
    const err = teacherAttendanceError(
      { code: 'functions/permission-denied', message: 'A Arena Sol não liberou fazer a chamada das suas aulas no seu vínculo.' },
      'fallback',
    );
    expect(err.isPermissionDenied).toBeTrue();
    expect(err.message).toBe('A Arena Sol não liberou fazer a chamada das suas aulas no seu vínculo.');
  });

  it('erro técnico ou sem código vira o texto da tela', () => {
    expect(teacherAttendanceError({ code: 'functions/internal', message: 'internal' }, 'Tente de novo.').message).toBe('Tente de novo.');
    expect(teacherAttendanceError(new Error('boom'), 'Tente de novo.').message).toBe('Tente de novo.');
    expect(teacherAttendanceError({ code: 'functions/failed-precondition', message: 'A chamada abre no dia da aula.' }, 'x').message).toBe(
      'A chamada abre no dia da aula.',
    );
  });
});
