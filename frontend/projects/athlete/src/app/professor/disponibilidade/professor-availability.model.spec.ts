import {
  DEFAULT_SETTINGS,
  availabilityFromDoc,
  availabilityPayload,
  buildOverlay,
  cellKey,
  currentWeek,
  emptyWeekly,
  freeCancelLabel,
  hoursLabel,
  isOpen,
  lessonQueues,
  optionsWith,
  paintModeFor,
  parseOwnClass,
  parsePrivateLesson,
  sameSettings,
  setCell,
  spInstant,
  spParts,
  toggleCell,
  weekStats,
  whenLabel,
  type PrivateLesson,
} from './professor-availability.model';

/** Quinta, 22/10/2026, 10:00 em São Paulo. */
const NOW = spInstant('2026-10-22', 10);

function lesson(overrides: Partial<PrivateLesson>): PrivateLesson {
  const startAt = overrides.startAt ?? spInstant('2026-10-23', 18);
  return {
    id: 'l1',
    athleteName: 'Marina Costa',
    startAt,
    endAt: startAt + 60 * 60_000,
    durationMin: 60,
    pair: false,
    note: '',
    status: 'confirmed',
    reschedule: null,
    ...overrides,
  };
}

describe('disponibilidade do professor — modelo', () => {
  describe('doc e padrões', () => {
    it('sem doc: tudo fechado, 60 min / 4h / 12h, agenda direto, sem dupla, no perfil', () => {
      const s = availabilityFromDoc(null);
      expect(s.exists).toBeFalse();
      expect(s.published).toBeFalse();
      expect(s.settings).toEqual(DEFAULT_SETTINGS);
      expect(s.settings.weekly).toEqual(emptyWeekly());
      expect([s.settings.durationMin, s.settings.minNoticeHours, s.settings.freeCancelHours]).toEqual([60, 4, 12]);
      expect([s.settings.autoConfirm, s.settings.acceptPairs, s.settings.showOnProfile]).toEqual([true, false, true]);
    });

    it('lê o doc limpando horas fora de 6–21 e duplicadas', () => {
      const s = availabilityFromDoc({
        weekly: { '1': [9, 8, 8, 22, 5], '3': [21] },
        durationMin: 90,
        minNoticeHours: 3,
        freeCancelHours: 0,
        autoConfirm: false,
        acceptPairs: true,
        showOnProfile: false,
        published: true,
      });
      expect(s.exists).toBeTrue();
      expect(s.published).toBeTrue();
      expect(s.settings.weekly['1']).toEqual([8, 9]);
      expect(s.settings.weekly['3']).toEqual([21]);
      expect(s.settings.weekly['7']).toEqual([]);
      expect(s.settings.durationMin).toBe(90);
      expect(s.settings.minNoticeHours).toBe(3);
      expect(s.settings.freeCancelHours).toBe(0);
      expect([s.settings.autoConfirm, s.settings.acceptPairs, s.settings.showOnProfile]).toEqual([false, true, false]);
    });

    it('valor gravado fora das opções entra no select, em ordem', () => {
      expect(optionsWith([0, 2, 6], 3)).toEqual([0, 2, 3, 6]);
      expect(optionsWith([0, 2, 6], 2)).toEqual([0, 2, 6]);
      expect(freeCancelLabel(0)).toBe('Até o início');
    });
  });

  describe('pintura da grade', () => {
    it('abre e fecha uma célula; sem mudança devolve a mesma grade', () => {
      const a = setCell(emptyWeekly(), 2, 10, true);
      expect(isOpen(a, 2, 10)).toBeTrue();
      expect(setCell(a, 2, 10, true)).toBe(a);
      expect(isOpen(setCell(a, 2, 10, false), 2, 10)).toBeFalse();
      expect(setCell(a, 2, 22, true)).toBe(a);
      expect(setCell(a, 8, 10, true)).toBe(a);
    });

    it('mantém as horas do dia em ordem', () => {
      let w = setCell(emptyWeekly(), 1, 18, true);
      w = setCell(w, 1, 7, true);
      w = setCell(w, 1, 12, true);
      expect(w['1']).toEqual([7, 12, 18]);
    });

    it('o arraste usa o modo da primeira célula em todas as outras', () => {
      let w = setCell(emptyWeekly(), 1, 9, true);
      // Começa numa fechada → abre tudo, inclusive a que já estava aberta (fica aberta).
      const open = paintModeFor(w, 1, 8);
      expect(open).toBeTrue();
      for (const h of [8, 9, 10]) w = setCell(w, 1, h, open);
      expect(w['1']).toEqual([8, 9, 10]);
      // Começa numa aberta → fecha tudo.
      const close = paintModeFor(w, 1, 9);
      expect(close).toBeFalse();
      for (const h of [9, 10, 11]) w = setCell(w, 1, h, close);
      expect(w['1']).toEqual([8]);
    });

    it('teclado alterna uma célula', () => {
      const w = toggleCell(emptyWeekly(), 5, 6);
      expect(isOpen(w, 5, 6)).toBeTrue();
      expect(isOpen(toggleCell(w, 5, 6), 5, 6)).toBeFalse();
    });
  });

  describe('payload', () => {
    it('manda os sete dias, inteiros, com published: true', () => {
      const weekly = setCell(emptyWeekly(), 6, 8, true);
      const p = availabilityPayload({ ...DEFAULT_SETTINGS, weekly, acceptPairs: true });
      expect(Object.keys(p['weekly'] as object)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
      expect((p['weekly'] as Record<string, number[]>)['6']).toEqual([8]);
      expect(p).toEqual(
        jasmine.objectContaining({
          durationMin: 60,
          minNoticeHours: 4,
          freeCancelHours: 12,
          autoConfirm: true,
          acceptPairs: true,
          showOnProfile: true,
          published: true,
        }),
      );
    });

    it('compara configurações pelo payload (detecta alteração não publicada)', () => {
      const a = { ...DEFAULT_SETTINGS, weekly: setCell(emptyWeekly(), 1, 9, true) };
      expect(sameSettings(a, { ...a, weekly: { ...a.weekly } })).toBeTrue();
      expect(sameSettings(a, DEFAULT_SETTINGS)).toBeFalse();
      expect(sameSettings(a, { ...a, durationMin: 90 })).toBeFalse();
    });
  });

  describe('semana em São Paulo', () => {
    it('vai de segunda a domingo da semana atual, com o dia de hoje', () => {
      const week = currentWeek(NOW);
      expect(week.map((d) => d.dayKey)).toEqual([
        '2026-10-19',
        '2026-10-20',
        '2026-10-21',
        '2026-10-22',
        '2026-10-23',
        '2026-10-24',
        '2026-10-25',
      ]);
      expect(week.find((d) => d.today)?.short).toBe('Qui');
      expect(week[0]!.dateLabel).toBe('19/10');
    });

    it('domingo à noite ainda é a mesma semana (não vira UTC)', () => {
      const week = currentWeek(spInstant('2026-10-25', 23, 30));
      expect(week[0]!.dayKey).toBe('2026-10-19');
      expect(week[6]!.today).toBeTrue();
    });

    it('converte instante ↔ parede de SP', () => {
      const ms = spInstant('2026-10-22', 18, 30);
      expect(new Date(ms).toISOString()).toBe('2026-10-22T21:30:00.000Z');
      expect(spParts(ms)).toEqual({ dayKey: '2026-10-22', hour: 18, minute: 30, isoDay: 4 });
      expect(whenLabel(ms)).toBe('Qui 22/10 · 18:30');
    });
  });

  describe('ocupações', () => {
    const week = currentWeek(NOW);

    it('turma própria marca as horas dos dias dela, com o nome', () => {
      const cls = parseOwnClass('c1', { name: 'Iniciantes', weekdays: [2, 4], startTime: '18:00', endTime: '19:30' })!;
      const ov = buildOverlay(week, { ownClasses: [cls], lessons: [], blocks: [] });
      expect(ov.get(cellKey(2, 18))?.kind).toBe('class');
      expect(ov.get(cellKey(2, 18))?.label).toBe('Iniciantes');
      expect(ov.get(cellKey(4, 19))?.kind).toBe('class');
      expect(ov.has(cellKey(4, 20))).toBeFalse();
      expect(ov.has(cellKey(3, 18))).toBeFalse();
    });

    it('particular ativa marca com o primeiro nome; cancelada e de outra semana não', () => {
      const ov = buildOverlay(week, {
        ownClasses: [],
        blocks: [],
        lessons: [
          lesson({ id: 'a', startAt: spInstant('2026-10-23', 9), endAt: spInstant('2026-10-23', 10, 30) }),
          lesson({ id: 'b', status: 'pending', startAt: spInstant('2026-10-24', 7), endAt: spInstant('2026-10-24', 8) }),
          lesson({ id: 'c', status: 'canceled', startAt: spInstant('2026-10-20', 7), endAt: spInstant('2026-10-20', 8) }),
          lesson({ id: 'd', startAt: spInstant('2026-10-27', 7), endAt: spInstant('2026-10-27', 8) }),
        ],
      });
      expect(ov.get(cellKey(5, 9))).toEqual(jasmine.objectContaining({ kind: 'lesson', label: 'Marina' }));
      expect(ov.get(cellKey(5, 10))?.kind).toBe('lesson');
      expect(ov.has(cellKey(5, 11))).toBeFalse();
      expect(ov.get(cellKey(6, 7))?.pending).toBeTrue();
      expect(ov.has(cellKey(2, 7))).toBeFalse();
      expect(ov.has(cellKey(1, 7))).toBeFalse();
    });

    it('bloqueio cobre as horas que encosta, inclusive atravessando dias; particular ganha', () => {
      const ov = buildOverlay(week, {
        ownClasses: [],
        lessons: [lesson({ startAt: spInstant('2026-10-21', 21), endAt: spInstant('2026-10-21', 22) })],
        blocks: [
          { id: 'b1', reasonLabel: 'Viagem', startAt: spInstant('2026-10-21', 20), endAt: spInstant('2026-10-22', 7, 30) },
        ],
      });
      expect(ov.get(cellKey(3, 20))?.kind).toBe('block');
      expect(ov.get(cellKey(3, 21))?.kind).toBe('lesson');
      expect(ov.get(cellKey(4, 6))?.kind).toBe('block');
      expect(ov.get(cellKey(4, 7))?.kind).toBe('block');
      expect(ov.has(cellKey(4, 8))).toBeFalse();
      expect(ov.has(cellKey(3, 19))).toBeFalse();
    });

    it('lê a particular do Firestore (Timestamp-like) e a remarcação', () => {
      const ts = (ms: number) => ({ toMillis: () => ms });
      const l = parsePrivateLesson('x', {
        athleteName: 'Ana',
        startAt: ts(1000),
        endAt: ts(3_601_000),
        durationMin: 60,
        status: 'pending',
        reschedule: { requestedBy: 'aluno', startAt: ts(9000), endAt: ts(19000), status: 'pending' },
      });
      expect(l?.reschedule?.startAt).toBe(9000);
      expect(parsePrivateLesson('y', { status: 'confirmed' })).toBeNull();
      expect(parsePrivateLesson('z', { status: 'weird', startAt: 1, endAt: 2 })).toBeNull();
    });
  });

  describe('esta semana', () => {
    it('livres = abertas sem ocupação; agendadas = horas das particulares ativas da semana', () => {
      const week = currentWeek(NOW);
      let weekly = emptyWeekly();
      for (const h of [8, 9, 10]) weekly = setCell(weekly, 5, h, true);
      weekly = setCell(weekly, 1, 7, true);
      const lessons = [
        lesson({ startAt: spInstant('2026-10-23', 9), endAt: spInstant('2026-10-23', 10, 30) }),
        lesson({ id: 'p', status: 'pending', startAt: spInstant('2026-10-24', 12), endAt: spInstant('2026-10-24', 13) }),
        lesson({ id: 'x', status: 'declined', startAt: spInstant('2026-10-24', 14), endAt: spInstant('2026-10-24', 15) }),
        lesson({ id: 'n', startAt: spInstant('2026-10-28', 9), endAt: spInstant('2026-10-28', 10) }),
      ];
      const overlay = buildOverlay(week, { ownClasses: [], blocks: [], lessons });
      const s = weekStats(weekly, week, overlay, lessons);
      // Sex 8h livre; 9h e 10h tomadas pela particular de 90 min; Seg 7h livre.
      expect(s.freeHours).toBe(2);
      expect(s.bookedHours).toBe(2.5);
      expect(hoursLabel(s.bookedHours)).toBe('2,5h');
      expect(hoursLabel(0)).toBe('0h');
    });
  });

  describe('pedidos e próximas', () => {
    it('separa pedidos, remarcações do aluno e confirmadas futuras, em ordem', () => {
      const q = lessonQueues(
        [
          lesson({ id: 'c2', startAt: spInstant('2026-10-25', 9) }),
          lesson({ id: 'c1', startAt: spInstant('2026-10-23', 9) }),
          lesson({ id: 'p1', status: 'pending', startAt: spInstant('2026-10-24', 9) }),
          lesson({ id: 'past', status: 'pending', startAt: spInstant('2026-10-22', 8) }),
          lesson({
            id: 'r1',
            startAt: spInstant('2026-10-24', 15),
            reschedule: { requestedBy: 'aluno', startAt: spInstant('2026-10-24', 17), endAt: spInstant('2026-10-24', 18), status: 'pending' },
          }),
          lesson({
            id: 'mine',
            startAt: spInstant('2026-10-24', 16),
            reschedule: { requestedBy: 'prof', startAt: spInstant('2026-10-24', 19), endAt: spInstant('2026-10-24', 20), status: 'pending' },
          }),
          lesson({ id: 'x', status: 'canceled', startAt: spInstant('2026-10-24', 10) }),
        ],
        'prof',
        NOW,
      );
      expect(q.requests.map((l) => l.id)).toEqual(['p1']);
      expect(q.reschedules.map((l) => l.id)).toEqual(['r1']);
      expect(q.upcoming.map((l) => l.id)).toEqual(['c1', 'r1', 'mine', 'c2']);
    });
  });
});
