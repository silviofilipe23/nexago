import 'dart:async';

import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_availability.dart';
import 'package:nexago_app/features/professor_mode/infrastructure/professor_availability_repository.dart';
import 'package:nexago_app/features/professor_mode/infrastructure/professor_students_repository.dart';
import 'package:nexago_app/features/professor_mode/presentation/availability/athlete_private_lessons_pages.dart';
import 'package:nexago_app/features/professor_mode/presentation/availability/professor_availability_page.dart';

/// Apoio dos testes da Disponibilidade e das particulares (fase 10).
/// Agora = Ter 20/10/2026 12:00 em SP (15:00 UTC).
final availabilityNow = DateTime.utc(2026, 10, 20, 15);

/// [hourSp] na parede de São Paulo (UTC−3) do dia [day] de outubro/2026.
DateTime spInstant(int day, int hourSp, [int minute = 0]) =>
    DateTime.utc(2026, 10, day, hourSp + 3, minute);

PrivateLesson privateLesson({
  String id = 'pl1',
  String athleteName = 'Sofia Ramos',
  String professorName = 'Carlos Professor',
  DateTime? startAt,
  int durationMin = 60,
  String status = 'confirmed',
  bool pair = false,
  String note = '',
  bool lateCancel = false,
  String professorUid = 'prof-1',
}) {
  final start = startAt ?? spInstant(21, 10);
  return PrivateLesson.fromMap(id, {
    'professorUid': professorUid,
    'professorName': professorName,
    'athleteId': 'ath-1',
    'athleteName': athleteName,
    'startAt': start,
    'endAt': start.add(Duration(minutes: durationMin)),
    'durationMin': durationMin,
    'status': status,
    'pair': pair,
    'note': note,
    'lateCancel': lateCancel,
  })!;
}

/// Repositório em memória: grava o que a tela mandaria às callables.
class FakeProfessorAvailabilityRepository
    implements ProfessorAvailabilityRepository {
  FakeProfessorAvailabilityRepository({
    Map<String, ProfessorAvailability>? availability,
    List<PrivateLesson>? lessons,
    ProfessorOpenSlots? slots,
  })  : availability = availability ?? {},
        lessons = lessons ?? [],
        slots = slots ?? const ProfessorOpenSlots();

  Map<String, ProfessorAvailability> availability;
  List<PrivateLesson> lessons;
  ProfessorOpenSlots slots;
  String? requestError;
  PrivateLessonStatus requestStatus = PrivateLessonStatus.confirmed;
  bool lateCancel = false;
  int slotFetches = 0;
  final saved = <Map<String, Object?>>[];
  final requests = <Map<String, Object?>>[];
  final responses = <({String lessonId, bool accept})>[];
  final canceled = <String>[];
  final _changes = StreamController<void>.broadcast();

  Stream<T> _watch<T>(T Function() read) async* {
    yield read();
    await for (final _ in _changes.stream) {
      yield read();
    }
  }

  void _replace(String id, String status) {
    lessons = [
      for (final l in lessons)
        if (l.id == id)
          PrivateLesson(
            id: l.id,
            professorUid: l.professorUid,
            professorName: l.professorName,
            athleteId: l.athleteId,
            athleteName: l.athleteName,
            startAt: l.startAt,
            endAt: l.endAt,
            durationMin: l.durationMin,
            status: PrivateLessonStatus.values.byName(status),
            pair: l.pair,
            note: l.note,
          )
        else
          l,
    ];
    _changes.add(null);
  }

  @override
  Stream<ProfessorAvailability?> watchAvailability(String professorUid) =>
      _watch(() => availability[professorUid]);

  @override
  Future<void> saveAvailability(Map<String, Object?> payload) async {
    saved.add(payload);
  }

  @override
  Stream<List<PrivateLesson>> watchProfessorLessons(
    String professorUid, {
    required DateTime since,
  }) =>
      _watch(() => [
            for (final l in lessons)
              if (!l.startAt.isBefore(since)) l,
          ]..sort((a, b) => a.startAt.compareTo(b.startAt)));

  @override
  Stream<List<PrivateLesson>> watchAthleteLessons(String athleteUid) =>
      _watch(() => List.of(lessons));

  @override
  Future<ProfessorOpenSlots> fetchOpenSlots(
    String professorUid, {
    int days = kPrivateLessonWindowDays,
  }) async {
    slotFetches++;
    return slots;
  }

  @override
  Future<PrivateLessonRequestResult> requestLesson(
    PrivateLessonRequest r,
  ) async {
    requests.add(r.toPayload());
    final e = requestError;
    if (e != null) throw ProfessorStudentsException(e);
    return (lessonId: 'new-1', status: requestStatus);
  }

  @override
  Future<void> respond(String lessonId, {required bool accept}) async {
    responses.add((lessonId: lessonId, accept: accept));
    _replace(lessonId, accept ? 'confirmed' : 'declined');
  }

  @override
  Future<bool> cancel(String lessonId, {String? reason}) async {
    canceled.add(lessonId);
    _replace(lessonId, 'canceled');
    return lateCancel;
  }
}

List<RouteBase> get professorAvailabilityRoutes => [
      GoRoute(
        path: AppRoutes.professorAvailability,
        name: AppRouteNames.professorAvailability,
        builder: (_, __) => const ProfessorAvailabilityPage(),
      ),
      GoRoute(
        path: AppRoutes.athletePrivateLessons,
        name: AppRouteNames.athletePrivateLessons,
        builder: (_, __) => const AthletePrivateLessonsPage(),
        routes: [
          GoRoute(
            path: 'agendar/:professorUid',
            name: AppRouteNames.athletePrivateLessonBook,
            builder: (_, state) => AthletePrivateLessonBookPage(
              professorUid: state.pathParameters['professorUid'] ?? '',
              professorName:
                  state.extra is String ? state.extra! as String : null,
            ),
          ),
        ],
      ),
    ];
