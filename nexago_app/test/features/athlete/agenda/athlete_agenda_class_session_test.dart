import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/athlete/domain/agenda/athlete_agenda_logic.dart';
import 'package:nexago_app/features/athlete/domain/agenda/athlete_agenda_models.dart';
import 'package:nexago_app/features/athlete/domain/agenda/class_agenda_entry.dart';

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  ClassAgendaEntry entry(Map<String, Object?> over) =>
      ClassAgendaEntry.fromMap({
        'sessionId': 'class_c1_2026-10-20',
        'arenaId': 'arena1',
        'arenaName': 'Arena CFC',
        'classId': 'c1',
        'className': 'Intermediário B',
        'teacherName': 'Carla Dias',
        'courtName': 'Quadra 2',
        'date': '2026-10-20',
        'startTime': '19:00',
        'endTime': '20:00',
        'startAt': '2026-10-20T22:00:00.000Z',
        'status': 'scheduled',
        'role': 'student',
        'kind': 'regular',
        'myMark': null,
        'studentCount': null,
        ...over,
      });

  group('mapClassEntryToAgendaItem', () {
    test('aula do aluno vira item classSession com hora de parede da arena',
        () {
      final item = mapClassEntryToAgendaItem(entry({}))!;

      expect(item.kind, AthleteAgendaItemKind.classSession);
      expect(item.id, 'class-class_c1_2026-10-20');
      expect(item.title, 'Intermediário B');
      expect(item.subtitle, 'Arena CFC · Quadra 2 · Prof. Carla');
      expect(item.statusLabel, 'AULA');
      expect(item.startsAt, DateTime(2026, 10, 20, 19));
      expect(item.endsAt, DateTime(2026, 10, 20, 20));
      expect(item.accentColor, athleteAgendaClassSessionAccent);
      expect(item.isCanceled, isFalse);
      expect(item.classSession!.isTeacher, isFalse);
    });

    test('rótulos: chamada, encaixe, cancelada e professor', () {
      expect(
          mapClassEntryToAgendaItem(entry({'myMark': 'present'}))!.statusLabel,
          'PRESENTE');
      expect(
          mapClassEntryToAgendaItem(entry({'myMark': 'excused'}))!.statusLabel,
          'JUSTIFICADA');
      expect(mapClassEntryToAgendaItem(entry({'kind': 'makeup'}))!.statusLabel,
          'REPOSIÇÃO');
      expect(mapClassEntryToAgendaItem(entry({'kind': 'trial'}))!.statusLabel,
          'EXPERIMENTAL');

      final canceled =
          mapClassEntryToAgendaItem(entry({'status': 'canceled'}))!;
      expect(canceled.statusLabel, 'CANCELADA');
      expect(canceled.isCanceled, isTrue);

      final teacher = mapClassEntryToAgendaItem(
          entry({'role': 'teacher', 'studentCount': 1}))!;
      expect(teacher.statusLabel, 'VOCÊ DÁ AULA');
      expect(teacher.subtitle, 'Arena CFC · Quadra 2 · 1 aluno');
    });

    test('sem horário utilizável não vira item', () {
      expect(mapClassEntryToAgendaItem(entry({'date': '', 'startTime': ''})),
          isNull);
    });

    test('aula conta e filtra junto com aluguel e clubinho', () {
      final item = mapClassEntryToAgendaItem(entry({}))!;
      final merged = mergeAgendaItems(
          bookings: const [],
          tournaments: const [],
          challenges: const [],
          classSessions: [item]);
      expect(merged.single.kind, AthleteAgendaItemKind.classSession);
      expect(countAgendaFilters(merged).rentals, 1);
      expect(
        filterAgendaItems(
          items: merged,
          filter: AthleteAgendaFilter.rentals,
          viewMode: AthleteAgendaViewMode.day,
          selectedDay: DateTime(2026, 10, 20),
          visibleMonth: DateTime(2026, 10),
          timeTab: AthleteAgendaTimeTab.upcoming,
          now: DateTime(2026, 10, 19, 12),
        ).length,
        1,
      );
    });
  });
}
