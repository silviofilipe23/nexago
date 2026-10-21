import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/time/nexago_event_timezone.dart';
import 'package:nexago_app/features/athlete/domain/agenda/class_agenda_entry.dart';
import 'package:nexago_app/features/athlete_training/domain/athlete_training.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_availability.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_lesson_plans.dart';

ClassAgendaEntry _class(
  String id,
  String date, {
  String start = '19:00',
  String end = '20:00',
  String? mark,
  String status = 'scheduled',
  String role = 'student',
  String kind = 'regular',
  String teacher = 'Thiago Mendes',
}) =>
    ClassAgendaEntry(
      sessionId: id,
      arenaId: 'a1',
      arenaName: 'Arena CFC',
      classId: 'c1',
      className: 'Intermediário B',
      teacherName: teacher,
      courtName: 'Quadra 2',
      date: date,
      startTime: start,
      endTime: end,
      startAt: null,
      status: status,
      role: role,
      kind: kind,
      myMark: mark,
    );

PrivateLesson _private(
  String id,
  DateTime startUtc, {
  PrivateLessonStatus status = PrivateLessonStatus.confirmed,
}) =>
    PrivateLesson(
      id: id,
      professorUid: 'p1',
      professorName: 'Paula Viana',
      athleteId: 'me',
      athleteName: 'Eu',
      startAt: startUtc,
      endAt: startUtc.add(const Duration(hours: 1)),
      durationMin: 60,
      status: status,
    );

LessonPlanView _view(
  String id, {
  String? text,
  DateTime? sentAt,
  int? stars,
  LessonHomework? homework,
}) =>
    LessonPlanView(
      id: id,
      planId: 'p1_session_$id',
      professorName: 'Thiago',
      lessonTitle: 'Aula',
      date: '2026-10-20',
      feedback: text == null
          ? null
          : LessonViewFeedback(text: text, sentAt: sentAt, homework: homework),
      ratingStars: stars,
    );

void main() {
  setUpAll(() async {
    await initializeNexagoEventTimezone();
  });

  // Qua 21/10/2026 12:00 em São Paulo (15:00 UTC).
  final now = DateTime.utc(2026, 10, 21, 15);

  group('mapeamento', () {
    test('aula em que o atleta dá aula fica de fora', () {
      expect(trainingFromClass(_class('s', '2026-10-22', role: 'teacher'), now),
          isNull);
    });

    test('aula futura sem chamada = agendada; passada = realizada', () {
      expect(trainingFromClass(_class('s', '2026-10-22'), now)!.state,
          TrainingState.scheduled);
      expect(trainingFromClass(_class('s', '2026-10-20'), now)!.state,
          TrainingState.done);
    });

    test('chamada vira presença, falta e falta avisada', () {
      expect(
          trainingFromClass(_class('s', '2026-10-20', mark: 'present'), now)!
              .state,
          TrainingState.present);
      expect(
          trainingFromClass(_class('s', '2026-10-20', mark: 'absent'), now)!
              .state,
          TrainingState.absent);
      expect(
          trainingFromClass(_class('s', '2026-10-20', mark: 'excused'), now)!
              .state,
          TrainingState.excused);
    });

    test('hora da aula é parede de São Paulo', () {
      final t = trainingFromClass(_class('s', '2026-10-22'), now)!;
      expect(t.startAt, DateTime.utc(2026, 10, 22, 22));
      expect(t.endAt, DateTime.utc(2026, 10, 22, 23));
    });

    test('reposição e cancelada', () {
      final makeup =
          trainingFromClass(_class('s', '2026-10-22', kind: 'makeup'), now)!;
      expect(makeup.isMakeup, isTrue);
      expect(trainingTypeLabel(makeup), 'Reposição');
      expect(
          trainingFromClass(_class('s', '2026-10-22', status: 'canceled'), now)!
              .state,
          TrainingState.canceled);
    });

    test('particular: pendente aguarda; recusada cancela; passada realizada',
        () {
      final future = DateTime.utc(2026, 10, 24, 12);
      expect(
        trainingFromPrivateLesson(
                _private('l', future, status: PrivateLessonStatus.pending), now)
            .state,
        TrainingState.awaitingProfessor,
      );
      expect(
        trainingFromPrivateLesson(
                _private('l', future, status: PrivateLessonStatus.declined),
                now)
            .state,
        TrainingState.canceled,
      );
      final past = trainingFromPrivateLesson(
          _private('l', DateTime.utc(2026, 10, 17, 12)), now);
      expect(past.state, TrainingState.done);
      // 12:00 UTC = 09:00 em São Paulo.
      expect(past.startTime, '09:00');
      expect(past.dateKey, '2026-10-17');
    });
  });

  group('recortes', () {
    final all = buildTrainings(
      classes: [
        _class('a', '2026-10-22'),
        _class('a', '2026-10-22'), // mesma aula vinda de outra janela
        _class('b', '2026-10-20', mark: 'present'),
        _class('c', '2026-10-23', status: 'canceled'),
      ],
      privateLessons: [_private('l', DateTime.utc(2026, 10, 24, 12))],
      now: now,
    );

    test('sem repetir e em ordem', () {
      expect(all.map((t) => t.id), ['b', 'a', 'c', 'l']);
    });

    test('próximo ignora cancelado', () {
      expect(upcomingTrainings(all, now).map((t) => t.id), ['a', 'l']);
      expect(nextTraining(all, now)!.id, 'a');
      expect(pastTrainings(all, now).map((t) => t.id), ['b']);
    });

    test('filtro por professor', () {
      expect(trainingProfessorFirstNames(all), ['Thiago', 'Paula']);
      expect(all.where((t) => trainingMatchesProfessor(t, 'Paula')).length, 1);
      expect(all.where((t) => trainingMatchesProfessor(t, null)).length, 4);
    });
  });

  group('números', () {
    final all = buildTrainings(
      classes: [
        _class('1', '2026-09-29', mark: 'present'),
        _class('2', '2026-10-01', mark: 'absent'),
        _class('3', '2026-10-06', mark: 'present'),
        _class('4', '2026-10-08', mark: 'excused'),
        _class('5', '2026-10-13', mark: 'present'),
        _class('6', '2026-10-15'), // sem chamada
        _class('7', '2026-10-20', mark: 'present'),
        _class('8', '2026-10-22'), // futura
      ],
      privateLessons: const [],
      now: now,
    );

    test('mês corrente', () {
      final s = trainingMonthStats(all, now);
      expect(s.present, 3);
      expect(s.absent, 1);
      expect(s.excused, 1);
      expect(s.attended, 4);
      expect(s.presencePercent, 60);
    });

    test('sem chamada no mês, sem porcentagem', () {
      expect(trainingMonthStats(const [], now).presencePercent, isNull);
    });

    test('sequência atual e recorde', () {
      expect(trainingCurrentStreak(all, now), 3);
      expect(trainingBestStreak(all, now), 3);
    });

    test('frequência mensal', () {
      final bars = trainingMonthlyFrequency(all, now, months: 3);
      expect(bars.map((b) => b.label), ['AGO', 'SET', 'OUT']);
      expect(bars.map((b) => b.attended), [0, 1, 4]);
      expect(bars.map((b) => b.planned), [0, 1, 7]);
    });

    test('frequência vira o ano', () {
      final jan = DateTime.utc(2027, 1, 10, 15);
      expect(
          trainingMonthlyFrequency(const [], jan, months: 2)
              .map((b) => b.monthKey),
          ['2026-12', '2027-01']);
    });
  });

  group('feedbacks', () {
    final views = [
      _view('old', text: 'Ok', sentAt: DateTime.utc(2026, 10, 1)),
      _view('none'),
      _view('rated', text: 'Bom', sentAt: DateTime.utc(2026, 10, 20), stars: 5),
      _view('new',
          text: 'Joelho melhor',
          sentAt: DateTime.utc(2026, 10, 21, 10),
          homework: const LessonHomework(name: 'Lançamento')),
    ];

    test('só com texto, mais recente primeiro', () {
      expect(
          trainingFeedbacks(views).map((v) => v.id), ['new', 'rated', 'old']);
    });

    test('novo = recente e sem estrelas', () {
      expect(trainingNewFeedbackCount(views, now), 1);
      expect(latestTrainingHomework(views)!.id, 'new');
    });
  });

  group('rótulos', () {
    test('dia relativo', () {
      expect(trainingRelativeDay('2026-10-21', '2026-10-21'), 'Hoje');
      expect(trainingRelativeDay('2026-10-22', '2026-10-21'), 'Amanhã');
      expect(trainingRelativeDay('2026-10-24', '2026-10-21'), 'SÁB 24');
    });
  });
}
