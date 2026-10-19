import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/features/arena/data/arena_class_repository.dart';
import 'package:nexago_app/features/arena/domain/arena_access_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_staff_role.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class_session.dart';

/// Repositório em memória: registra com que `arenaId` cada leitura foi feita
/// (a rule nega query sem o filtro) e o que as callables receberam.
class FakeArenaClassRepository implements ArenaClassRepository {
  FakeArenaClassRepository({
    this.classes = const [],
    this.sessionsByDate = const {},
    Map<String, ArenaClassSession> sessionsById = const {},
    this.students = const [],
  }) : sessionsById = {...sessionsById};

  final List<ArenaClass> classes;
  final Map<String, List<ArenaClassSession>> sessionsByDate;
  final Map<String, ArenaClassSession> sessionsById;
  final List<ArenaClassStudent> students;

  final List<String> classQueries = [];
  final List<(String, String)> sessionQueries = [];
  final List<(String, String)> studentQueries = [];

  final List<Map<String, Object?>> savedAttendance = [];
  final List<Map<String, Object?>> canceled = [];
  Object? saveError;
  int notifiedOnCancel = 0;

  @override
  Stream<List<ArenaClass>> watchClasses(String arenaId) {
    classQueries.add(arenaId);
    return Stream.value(classes);
  }

  @override
  Stream<List<ArenaClassSession>> watchSessionsOn(
    String arenaId,
    String dateKey,
  ) {
    sessionQueries.add((arenaId, dateKey));
    return Stream.value(sessionsByDate[dateKey] ?? const []);
  }

  @override
  Stream<ArenaClassSession?> watchSession(String sessionId) =>
      Stream.value(sessionsById[sessionId]);

  @override
  Stream<List<ArenaClassStudent>> watchStudents({
    required String arenaId,
    required String classId,
  }) {
    studentQueries.add((arenaId, classId));
    return Stream.value(students);
  }

  @override
  Future<ArenaClassAttendanceResult> saveAttendance({
    required String sessionId,
    required Map<String, String?> marks,
    bool close = false,
  }) async {
    final error = saveError;
    if (error != null) throw error;
    savedAttendance
        .add({'sessionId': sessionId, 'marks': marks, 'close': close});
    return ArenaClassAttendanceResult(
      status: close ? 'completed' : 'scheduled',
      marked: marks.values.where((m) => m != null).length,
    );
  }

  @override
  Future<ArenaClassCancelResult> cancelSession({
    required String sessionId,
    required ArenaClassCancelReason reason,
    String? note,
  }) async {
    canceled.add({'sessionId': sessionId, 'reason': reason.id, 'note': note});
    return ArenaClassCancelResult(
      sessionId: sessionId,
      notified: notifiedOnCancel,
    );
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// Acesso à arena `a1` sem Firestore (mesmo padrão dos testes de RBAC).
List<Override> arenaAccessOverrides(ArenaStaffRole? role,
    {bool owner = false}) {
  final membership = ArenaMembership(
    arenaId: 'a1',
    name: 'Vegeton',
    isOwner: owner,
    role: role,
  );
  return [
    ownedArenaMembershipsProvider.overrideWith(
      (ref) => Stream.value(owner ? [membership] : const <ArenaMembership>[]),
    ),
    staffArenaMembershipsProvider.overrideWith(
      (ref) => Stream.value(owner ? const <ArenaMembership>[] : [membership]),
    ),
  ];
}
