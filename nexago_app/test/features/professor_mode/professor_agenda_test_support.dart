import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/arenas/data/booking_service.dart';
import 'package:nexago_app/features/arenas/domain/arenas_providers.dart';
import 'package:nexago_app/features/arenas/domain/booking_providers.dart';
import 'package:nexago_app/features/athlete/domain/agenda/class_agenda_entry.dart';
import 'package:nexago_app/features/athlete/domain/agenda/teacher_class_roster.dart';
import 'package:nexago_app/features/professor_links/application/professor_links_providers.dart';
import 'package:nexago_app/features/professor_links/domain/arena_professor_link.dart';
import 'package:nexago_app/features/professor_mode/application/professor_students_providers.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_agenda.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_students.dart';
import 'package:nexago_app/features/professor_mode/infrastructure/professor_agenda_repository.dart';
import 'package:nexago_app/features/professor_mode/infrastructure/professor_lesson_plans_repository.dart';
import 'package:nexago_app/features/professor_mode/infrastructure/professor_own_classes_repository.dart';
import 'package:nexago_app/features/professor_mode/infrastructure/professor_students_repository.dart';
import 'package:nexago_app/features/professor_mode/presentation/agenda/professor_agenda_lesson_page.dart';
import 'package:nexago_app/features/professor_mode/presentation/agenda/professor_agenda_page.dart';
import 'package:nexago_app/features/professor_mode/presentation/agenda/professor_agenda_session_page.dart';
import 'package:nexago_app/features/professor_mode/presentation/agenda/professor_block_page.dart';
import 'package:nexago_app/features/professor_mode/presentation/agenda/professor_calendar_sync_page.dart';

import 'professor_actions_test_support.dart';
import 'professor_students_test_support.dart';
import 'professor_wallet_test_support.dart';

/// Apoio dos testes da Agenda (fase 5). Agora = Ter 20/10/2026 12:00 em SP
/// (15:00 UTC — não depende do fuso da máquina).
final agendaNow = DateTime.utc(2026, 10, 20, 15);

ClassAgendaEntry agendaSession({
  String id = 's1',
  String arenaId = 'arena-cfc',
  String arenaName = 'Arena CFC',
  String classId = 'c1',
  String className = 'Iniciante A',
  String date = '2026-10-20',
  String start = '19:00',
  String end = '20:00',
  String status = 'scheduled',
  String kind = 'regular',
  bool canManage = true,
  int? students = 4,
  String role = 'teacher',
}) =>
    ClassAgendaEntry(
      sessionId: id,
      arenaId: arenaId,
      arenaName: arenaName,
      classId: classId,
      className: className,
      teacherName: 'Prof',
      courtName: 'Quadra 2',
      date: date,
      startTime: start,
      endTime: end,
      startAt: null,
      status: status,
      role: role,
      kind: kind,
      studentCount: students,
      canManageLessons: canManage,
    );

ProfessorBlock agendaBlock({
  String id = 'b1',
  DateTime? start,
  DateTime? end,
  ProfessorBlockReason reason = ProfessorBlockReason.torneio,
}) =>
    ProfessorBlock(
      id: id,
      reason: reason,
      reasonLabel: reason.label,
      // 23/10 14:00–18:00 SP.
      startAt: start ?? DateTime.utc(2026, 10, 23, 17),
      endAt: end ?? DateTime.utc(2026, 10, 23, 21),
    );

typedef SavedBlock = ({
  String uid,
  ProfessorBlockInput input,
  String? blockId,
  Map<String, Object?> doc,
});

typedef FeedCall = ({bool rotate, bool? names, List<String>? excluded});

/// Repositório da Agenda em memória.
class FakeProfessorAgendaRepository implements ProfessorAgendaRepository {
  FakeProfessorAgendaRepository({
    List<ClassAgendaEntry>? sessions,
    List<ProfessorBlock>? blocks,
    Map<String, TeacherClassRoster>? rosters,
  })  : sessions = sessions ?? [],
        blocks = blocks ?? [],
        rosters = rosters ?? {};

  List<ClassAgendaEntry> sessions;
  List<ProfessorBlock> blocks;
  Map<String, TeacherClassRoster> rosters;
  Object? sessionsError;
  final ranges = <ProfessorAgendaRange>[];
  final saved = <SavedBlock>[];
  final deleted = <String>[];
  final feedCalls = <FeedCall>[];
  ProfessorCalendarFeed feed = const ProfessorCalendarFeed(
    url: 'https://feed.test/professorCalendarFeed?u=prof-1&t=tok1',
  );
  final _changes = StreamController<void>.broadcast();

  @override
  Future<List<ClassAgendaEntry>> fetchTeacherSessions(
    ProfessorAgendaRange r,
  ) async {
    ranges.add(r);
    final e = sessionsError;
    if (e != null) throw e;
    return [
      for (final s in sessions)
        if (s.date.compareTo(r.fromKey) >= 0 && s.date.compareTo(r.toKey) <= 0)
          s,
    ];
  }

  @override
  Future<TeacherClassRoster> fetchSessionRoster(String sessionId) async {
    final r = rosters[sessionId];
    if (r == null) {
      throw const ProfessorStudentsException('Chamada não liberada.');
    }
    return r;
  }

  @override
  Stream<List<ProfessorBlock>> watchBlocks(String uid) async* {
    yield List.of(blocks);
    await for (final _ in _changes.stream) {
      yield List.of(blocks);
    }
  }

  @override
  Future<void> saveBlock(
    String uid,
    ProfessorBlockInput input, {
    String? blockId,
    DateTime? createdAt,
  }) async {
    saved.add((
      uid: uid,
      input: input,
      blockId: blockId,
      doc: professorBlockDocument(input, createdAt: createdAt),
    ));
    final id = blockId ?? 'new-${saved.length}';
    blocks = [
      for (final b in blocks)
        if (b.id != id) b,
      ProfessorBlock(
        id: id,
        reason: input.reason,
        reasonLabel: input.reason.label,
        startAt: input.startAt,
        endAt: input.endAt,
      ),
    ];
    _changes.add(null);
  }

  @override
  Future<void> deleteBlock(String uid, String blockId) async {
    deleted.add(blockId);
    blocks = [
      for (final b in blocks)
        if (b.id != blockId) b,
    ];
    _changes.add(null);
  }

  @override
  Future<ProfessorCalendarFeed> configureFeed({
    bool rotate = false,
    bool? showStudentNames,
    List<String>? excludedArenaIds,
  }) async {
    feedCalls.add(
        (rotate: rotate, names: showStudentNames, excluded: excludedArenaIds));
    feed = ProfessorCalendarFeed(
      url: rotate
          ? 'https://feed.test/professorCalendarFeed?u=prof-1&t=tok${feedCalls.length}'
          : feed.url,
      showStudentNames: showStudentNames ?? feed.showStudentNames,
      excludedArenaIds: excludedArenaIds ?? feed.excludedArenaIds,
    );
    return feed;
  }
}

/// Cancelamento de reserva sem Firestore.
class FakeBookingService extends BookingService {
  FakeBookingService() : super(_NoFirestore(), functions: _NoFunctions());

  final canceled = <({String bookingId, String athleteId})>[];

  @override
  Future<void> cancelBooking({
    required String bookingId,
    required String athleteId,
  }) async {
    canceled.add((bookingId: bookingId, athleteId: athleteId));
  }
}

class _NoFirestore implements FirebaseFirestore {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _NoFunctions implements FirebaseFunctions {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

Widget _stub(String label) => Scaffold(body: Center(child: Text(label)));

List<RouteBase> get professorAgendaRoutes => [
      GoRoute(
        path: AppRoutes.professorAgenda,
        name: AppRouteNames.professorAgenda,
        builder: (_, __) => const ProfessorAgendaPage(),
      ),
      GoRoute(
        path: AppRoutes.professorAgendaSession,
        name: AppRouteNames.professorAgendaSession,
        builder: (_, state) => ProfessorAgendaSessionPage(
          sessionId: state.pathParameters['sessionId'] ?? '',
          entry: state.extra is ClassAgendaEntry
              ? state.extra! as ClassAgendaEntry
              : null,
        ),
      ),
      GoRoute(
        path: AppRoutes.professorAgendaLesson,
        name: AppRouteNames.professorAgendaLesson,
        builder: (_, state) => ProfessorAgendaLessonPage(
          bookingId: state.pathParameters['bookingId'] ?? '',
        ),
      ),
      GoRoute(
        path: AppRoutes.professorBlockNew,
        name: AppRouteNames.professorBlockNew,
        builder: (_, __) => const ProfessorBlockPage(),
      ),
      GoRoute(
        path: AppRoutes.professorBlockEdit,
        name: AppRouteNames.professorBlockEdit,
        builder: (_, state) =>
            ProfessorBlockPage(blockId: state.pathParameters['blockId']),
      ),
      GoRoute(
        path: AppRoutes.professorCalendarSync,
        name: AppRouteNames.professorCalendarSync,
        builder: (_, __) => const ProfessorCalendarSyncPage(),
      ),
      GoRoute(
        path: AppRoutes.professorClassAttendance,
        name: AppRouteNames.professorClassAttendance,
        builder: (_, state) =>
            _stub('chamada ${state.pathParameters['sessionId']}'),
      ),
      GoRoute(
        path: AppRoutes.professorClassClosed,
        name: AppRouteNames.professorClassClosed,
        builder: (_, state) =>
            _stub('encerrado ${state.pathParameters['sessionId']}'),
      ),
    ];

/// URIs abertas pelo "Assinar" (no lugar do url_launcher).
final openedCalendarUris = <Uri>[];

Future<GoRouter> pumpProfessorAgendaApp(
  WidgetTester tester, {
  required FakeProfessorAgendaRepository agenda,
  required String location,
  FakeProfessorWalletRepository? wallet,
  ProfessorStudentsSnapshot? snapshot,
  List<ArenaProfessorLink> links = const [],
  FakeProfessorActionsRepository? actions,
  BookingService? bookings,
  DateTime? now,
  Size size = const Size(390, 1800),
  ProfessorLessonPlansRepository? lessonPlans,
  ProfessorOwnClassesRepository? ownClasses,
  List<RouteBase> extraRoutes = const [],
  String uid = professorStudentsTestUid,
  List<Override> extraOverrides = const [],
}) {
  openedCalendarUris.clear();
  return pumpProfessorStudentsApp(
    tester,
    repo: FakeProfessorStudentsRepository(
        [snapshot ?? professorStudentsSnapshot()]),
    walletRepo: wallet ?? FakeProfessorWalletRepository(),
    lessonPlansRepo: lessonPlans,
    ownClassesRepo: ownClasses,
    location: location,
    size: size,
    uid: uid,
    extraRoutes: [
      ...professorAgendaRoutes,
      ...professorWalletRoutes,
      ...extraRoutes,
    ],
    overrides: [
      professorAgendaRepositoryProvider.overrideWithValue(agenda),
      professorLinksClockProvider.overrideWithValue(() => now ?? agendaNow),
      myProfessorLinksProvider.overrideWith((ref) => Stream.value(links)),
      professorActionsRepositoryProvider
          .overrideWithValue(actions ?? FakeProfessorActionsRepository()),
      bookingServiceProvider
          .overrideWithValue(bookings ?? FakeBookingService()),
      arenaByIdProvider.overrideWith((ref, id) => Stream.value(null)),
      professorCalendarOpenerProvider.overrideWithValue((uri) async {
        openedCalendarUris.add(uri);
        return true;
      }),
      ...extraOverrides,
    ],
  );
}
