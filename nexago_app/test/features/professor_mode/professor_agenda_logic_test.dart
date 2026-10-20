import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class.dart';
import 'package:nexago_app/features/athlete/domain/agenda/class_agenda_entry.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_lessons.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_agenda.dart';
import 'package:nexago_app/features/professor_mode/infrastructure/professor_agenda_repository.dart';
import 'package:nexago_app/features/professor_mode/presentation/professor_shell_page.dart';

import 'professor_agenda_test_support.dart';
import 'professor_wallet_test_support.dart';

List<ProfessorAgendaItem> build({
  List<ClassAgendaEntry> sessions = const [],
  List<ProfessorLesson> lessons = const [],
  Map<String, String> status = const {},
  List<ProfessorBlock> blocks = const [],
}) =>
    buildProfessorAgendaItems(
      sessions: sessions,
      lessons: lessons,
      bookingStatus: status,
      blocks: blocks,
      classTypes: const {'c-part': ArenaClassType.particular},
    );

void main() {
  group('montagem dos itens', () {
    test('turma, particular da carteira e bloqueio, em ordem', () {
      final items = build(
        sessions: [
          agendaSession(id: 'a', start: '19:00'),
          agendaSession(id: 'b', classId: 'c-part', start: '07:00'),
          agendaSession(id: 'c', kind: 'makeup', start: '09:00'),
          // Aula em que é aluno: fica fora.
          agendaSession(id: 'x', role: 'student'),
        ],
        lessons: [
          walletLesson(bookingId: 'l1', date: '2026-10-20', startTime: '10:00')
        ],
        status: const {'l1': 'canceled'},
      );
      expect(items.map((i) => i.id), [
        'session:b',
        'session:c',
        'lesson:l1',
        'session:a',
      ]);
      expect(items[0].typeLabel, 'Particular');
      expect(items[1].typeLabel, 'Reposição');
      expect(items[2].typeLabel, 'Particular');
      expect(items[2].canceled, isTrue);
      expect(items[3].typeLabel, 'Turma');
      expect(items[3].place, 'Quadra 2 · 4 alunos');
      expect(items[3].letter, 'T');
    });

    test('bloqueio de vários dias vira um pedaço por dia (parede de SP)', () {
      final segs = professorBlockSegments(agendaBlock(
        // 22/10 20:00 → 24/10 10:00 em SP.
        start: DateTime.utc(2026, 10, 22, 23),
        end: DateTime.utc(2026, 10, 24, 13),
      ));
      expect(
        segs.map((s) => '${s.date} ${s.startLabel}-${s.endLabel}'),
        [
          '2026-10-22 20:00-24:00',
          '2026-10-23 00:00-24:00',
          '2026-10-24 00:00-10:00',
        ],
      );
      expect(segs.every((s) => s.isBlock && s.arenaId == null), isTrue);
    });
  });

  group('paleta por arena', () {
    test('estável e sem colisão entre as arenas do professor', () {
      final a = professorArenaPalette(['arena-b', 'arena-a', 'arena-c']);
      final b = professorArenaPalette(['arena-c', 'arena-a', 'arena-b', '']);
      expect(a, b);
      expect(a.values.toSet().length, 3);
      expect(a.values.every((i) => i >= 0 && i < kProfessorArenaPaletteSize),
          isTrue);
    });

    test('mais arenas que cores: reaproveita sem quebrar', () {
      final p = professorArenaPalette([for (var i = 0; i < 12; i++) 'a$i']);
      expect(p.length, 12);
    });
  });

  group('Dia', () {
    test('concluída, AGORA, próxima e deslocamento entre arenas', () {
      final items = build(sessions: [
        agendaSession(id: 'manha', start: '07:00', end: '08:00'),
        agendaSession(
            id: 'agora',
            arenaId: 'arena-norte',
            arenaName: 'Arena Norte',
            start: '11:30',
            end: '12:30'),
        agendaSession(
            id: 'cancel',
            arenaId: 'arena-sul',
            start: '13:00',
            end: '14:00',
            status: 'canceled'),
        agendaSession(id: 'noite', start: '19:00'),
      ]);
      final entries = professorDayEntries(items,
          dateKey: '2026-10-20', todayKey: '2026-10-20', nowMin: 12 * 60);
      expect(entries.map((e) => e.isTravel ? 'travel' : e.item!.id), [
        'session:manha',
        'travel',
        'session:agora',
        'session:cancel',
        'travel',
        'session:noite',
      ]);
      expect(entries[0].phase, ProfessorAgendaPhase.done);
      expect(entries[2].phase, ProfessorAgendaPhase.live);
      expect(entries[5].phase, ProfessorAgendaPhase.next);
      expect(entries[1].fromArena, 'Arena CFC');
      expect(entries[1].toArena, 'Arena Norte');
      expect(professorLessonCountOn(items, '2026-10-20'), 3);
    });
  });

  group('conflitos (E6)', () {
    test('arenas diferentes no mesmo horário e aula dentro do bloqueio', () {
      final items = build(
        sessions: [
          agendaSession(
              id: 'cfc', date: '2026-10-22', start: '07:00', end: '08:00'),
          agendaSession(
              id: 'norte',
              arenaId: 'arena-norte',
              date: '2026-10-22',
              start: '07:30',
              end: '08:30'),
          // Mesma arena, mesmo horário: não é conflito entre arenas.
          agendaSession(
              id: 'cfc2', date: '2026-10-22', start: '07:00', end: '08:00'),
          agendaSession(
              id: 'torneio', date: '2026-10-23', start: '15:00', end: '16:00'),
          agendaSession(
              id: 'cancelada',
              arenaId: 'arena-norte',
              date: '2026-10-23',
              start: '15:00',
              status: 'canceled'),
        ],
        blocks: [agendaBlock()],
      );
      final c = professorAgendaConflicts(items);
      expect(
        c.map((x) => '${x.first.id}|${x.second.id}').toSet(),
        {
          'session:cfc|session:norte',
          'session:cfc2|session:norte',
          'block:b1:2026-10-23|session:torneio',
        },
      );
      final first = c.firstWhere((x) => x.second.id == 'session:norte');
      expect(professorMinutesLabel(first.startMin), '07:30');
      expect(professorMinutesLabel(first.endMin), '08:00');
    });

    test('aulas afetadas pelo período (só informativo)', () {
      final items = build(sessions: [
        agendaSession(id: 'dentro', date: '2026-10-23', start: '15:00'),
        agendaSession(id: 'fora', date: '2026-10-23', start: '19:00'),
        agendaSession(
            id: 'cancelada',
            date: '2026-10-23',
            start: '16:00',
            status: 'canceled'),
      ]);
      final affected = professorItemsAffectedBy(
        items,
        startAt: DateTime.utc(2026, 10, 23, 17),
        endAt: DateTime.utc(2026, 10, 23, 21),
      );
      expect(affected.map((i) => i.id), ['session:dentro']);
    });
  });

  group('Mês e intervalos', () {
    test('resumo: aulas, horas em quadra e dias bloqueados', () {
      final items = build(
        sessions: [
          agendaSession(id: 'a', date: '2026-10-05'),
          agendaSession(
              id: 'b', date: '2026-10-06', start: '07:00', end: '08:30'),
          agendaSession(id: 'c', date: '2026-10-07', status: 'canceled'),
          agendaSession(id: 'd', date: '2026-11-02'),
        ],
        blocks: [
          agendaBlock(),
          agendaBlock(
            id: 'b2',
            start: DateTime.utc(2026, 10, 30, 3),
            end: DateTime.utc(2026, 10, 31, 3),
          ),
        ],
      );
      final s = professorMonthSummary(items, '2026-10');
      expect(s.lessons, 2);
      expect(s.courtMinutes, 150);
      expect(s.hoursLabel, '2h30');
      expect(s.blockedDays, 2);
    });

    test('Dia e Semana carregam a semana; Mês o mês — bem abaixo de 100 dias',
        () {
      expect(professorAgendaRange(ProfessorAgendaView.day, '2026-10-22'),
          (fromKey: '2026-10-19', toKey: '2026-10-25'));
      expect(professorAgendaRange(ProfessorAgendaView.week, '2026-10-25'),
          (fromKey: '2026-10-19', toKey: '2026-10-25'));
      expect(professorAgendaRange(ProfessorAgendaView.month, '2026-02-10'),
          (fromKey: '2026-02-01', toKey: '2026-02-28'));
      expect(professorShiftMonth('2026-01-31', 1), '2026-02-28');
      expect(professorShiftDay('2026-10-30', 7), '2026-11-06');
      final grid = professorMonthGrid('2026-10-20');
      expect(grid.days.length, 31);
      expect(grid.leading, 3); // 1/10/2026 é quinta.
    });
  });

  group('bloqueio (E7)', () {
    test('validação com as regras da rule', () {
      final s = DateTime.utc(2026, 10, 23, 17);
      expect(validateProfessorBlock(startAt: null, endAt: s),
          'Escolha o início e o fim.');
      expect(validateProfessorBlock(startAt: s, endAt: s),
          'O fim precisa ser depois do início.');
      expect(
        validateProfessorBlock(
            startAt: s, endAt: s.add(const Duration(days: 62))),
        'Bloqueie no máximo 61 dias por vez.',
      );
      expect(
        validateProfessorBlock(
            startAt: s,
            endAt: s.add(const Duration(hours: 4)),
            note: 'x' * 301),
        'A observação vai até 300 caracteres.',
      );
      expect(
        validateProfessorBlock(
            startAt: s, endAt: s.add(const Duration(days: 61))),
        isNull,
      );
    });

    test('documento só com os campos da rule', () {
      final doc = professorBlockDocument(ProfessorBlockInput(
        reason: ProfessorBlockReason.saude,
        startAt: DateTime.utc(2026, 10, 23, 17),
        endAt: DateTime.utc(2026, 10, 23, 21),
        note: '  ',
      ));
      expect(doc.keys.toSet(), {
        'reason',
        'reasonLabel',
        'startAt',
        'endAt',
        'createdAt',
        'updatedAt'
      });
      expect(doc['reason'], 'saude');
      expect(doc['reasonLabel'], 'Saúde');
      expect(
          doc['startAt'], Timestamp.fromDate(DateTime.utc(2026, 10, 23, 17)));
      expect(doc['updatedAt'], isA<FieldValue>());
      expect(doc['createdAt'], isA<FieldValue>());

      final edit = professorBlockDocument(
        ProfessorBlockInput(
          reason: ProfessorBlockReason.viagem,
          startAt: DateTime.utc(2026, 10, 23, 17),
          endAt: DateTime.utc(2026, 10, 23, 21),
          note: 'Campeonato',
        ),
        createdAt: DateTime.utc(2026, 10, 1),
      );
      expect(edit['note'], 'Campeonato');
      expect(edit['createdAt'], Timestamp.fromDate(DateTime.utc(2026, 10, 1)));
    });

    test('leitura do documento', () {
      final b = ProfessorBlock.fromMap('b9', {
        'reason': 'torneio',
        'reasonLabel': 'Torneio',
        'startAt': Timestamp.fromDate(DateTime.utc(2026, 10, 23, 17)),
        'endAt': Timestamp.fromDate(DateTime.utc(2026, 10, 23, 21)),
      });
      expect(b!.reason, ProfessorBlockReason.torneio);
      expect(
        ProfessorBlock.fromMap('x', {
          'startAt': Timestamp.fromDate(DateTime.utc(2026, 10, 23, 21)),
          'endAt': Timestamp.fromDate(DateTime.utc(2026, 10, 23, 17)),
        }),
        isNull,
      );
    });
  });

  group('feed (E8)', () {
    const url = 'https://southamerica-east1-p.cloudfunctions.net/'
        'professorCalendarFeed?u=prof-1&t=abc';

    test('Apple por webcal, Google e Outlook com a URL codificada', () {
      expect(professorWebcalUrl(url),
          'webcal://southamerica-east1-p.cloudfunctions.net/professorCalendarFeed?u=prof-1&t=abc');
      expect(professorGoogleCalendarUrl(url),
          'https://calendar.google.com/calendar/r?cid=${Uri.encodeComponent(url)}');
      expect(professorOutlookCalendarUrl(url),
          contains('addfromweb?url=${Uri.encodeComponent(url)}'));
    });

    test('resposta da callable', () {
      final f = ProfessorCalendarFeed.fromMap({
        'url': url,
        'showStudentNames': true,
        'excludedArenaIds': ['a', 1, 'b'],
      });
      expect(f.showStudentNames, isTrue);
      expect(f.excludedArenaIds, ['a', 'b']);
    });
  });

  test('barra some nas telas internas da Agenda', () {
    expect(shouldHideProfessorTabBar('/professor/agenda'), isFalse);
    expect(shouldHideProfessorTabBar('/professor/agenda/bloqueio'), isTrue);
    expect(shouldHideProfessorTabBar('/professor/agenda/aula/s1'), isTrue);
  });
}
