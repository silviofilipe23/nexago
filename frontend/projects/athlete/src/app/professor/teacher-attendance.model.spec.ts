import {
  attendanceCounts,
  attendancePayload,
  draftDiffers,
  draftFromRoster,
  shortDayLabel,
  teacherAttendanceCta,
  teacherRosterFromRaw,
  withUnmarkedPresent,
} from './teacher-attendance.model';

const RAW = {
  session: {
    sessionId: 'class_c1_2026-10-20',
    arenaId: 'arena1',
    arenaName: 'Arena CFC',
    classId: 'c1',
    className: 'Intermediário B',
    date: '2026-10-20',
    startTime: '19:00',
    endTime: '20:00',
    courtName: 'Quadra 2',
    status: 'scheduled',
    teacherNote: null,
    attendanceOpen: true,
  },
  students: [
    { studentId: 's1', name: 'Ana Lima', photoUrl: null, kind: 'regular', mark: null },
    { studentId: 's2', name: 'Bruno Reis', photoUrl: null, kind: 'regular', mark: 'absent' },
    { studentId: 'x1', name: 'Caio Prado', photoUrl: null, kind: 'trial', mark: null },
  ],
};

describe('teacher-attendance.model', () => {
  it('lê a resposta de getMyClassSessionRoster', () => {
    const roster = teacherRosterFromRaw(RAW);
    expect(roster.session.className).toBe('Intermediário B');
    expect(roster.session.attendanceOpen).toBeTrue();
    expect(roster.students.map((s) => s.kind)).toEqual(['regular', 'regular', 'trial']);
    expect(roster.students[1]!.mark).toBe('absent');
    expect(teacherRosterFromRaw(null).students).toEqual([]);
  });

  it('rascunho: contagem, "Demais presentes" sem apagar falta e payload completo', () => {
    const roster = teacherRosterFromRaw(RAW);
    const draft = draftFromRoster(roster);
    expect(attendanceCounts(draft)).toEqual({ present: 0, absent: 1, excused: 0, unmarked: 2, total: 3 });
    expect(draftDiffers(draft, roster)).toBeFalse();

    const all = withUnmarkedPresent(draft);
    expect(all).toEqual({ s1: 'present', s2: 'absent', x1: 'present' });
    expect(draftDiffers(all, roster)).toBeTrue();
    expect(attendancePayload({ ...all, s2: null })).toEqual({ s1: 'present', s2: null, x1: 'present' });
  });

  it('botão da agenda por estado da aula', () => {
    const now = new Date(2026, 9, 20, 12);
    const base = { role: 'teacher', canManageLessons: true, status: 'scheduled', date: '2026-10-20' };
    expect(teacherAttendanceCta(base, now)).toBe('Fazer chamada');
    expect(teacherAttendanceCta({ ...base, date: '2026-10-18' }, now)).toBe('Fazer chamada');
    expect(teacherAttendanceCta({ ...base, date: '2026-10-22' }, now)).toBe('Ver lista');
    expect(teacherAttendanceCta({ ...base, status: 'completed' }, now)).toBe('Ver chamada');
    expect(teacherAttendanceCta({ ...base, status: 'canceled' }, now)).toBeNull();
    expect(teacherAttendanceCta({ ...base, canManageLessons: false }, now)).toBeNull();
    expect(teacherAttendanceCta({ ...base, role: 'student' }, now)).toBeNull();
  });

  it('dia curto', () => {
    expect(shortDayLabel('2026-10-27')).toBe('27/10');
  });
});
