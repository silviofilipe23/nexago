import 'dart:async';

import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_evaluations.dart';
import 'package:nexago_app/features/professor_mode/infrastructure/professor_evaluations_repository.dart';
import 'package:nexago_app/features/professor_mode/infrastructure/professor_students_repository.dart';
import 'package:nexago_app/features/professor_mode/presentation/evaluations/athlete_evaluations_pages.dart';
import 'package:nexago_app/features/professor_mode/presentation/evaluations/professor_evaluations_page.dart';

/// Apoio dos testes de Avaliação (fase 8). Hoje = 20/10/2026 (outubro).

ProfessorEvaluation evaluation({
  String athleteId = 'ath-1',
  String period = '2026-10',
  String status = 'sent',
  double overall = 7.2,
  double? previousOverall = 6.4,
  Map<String, double>? scores,
  Map<String, double>? previousScores,
  String sport = 'beachTennis',
  String professorUid = 'prof-1',
}) =>
    ProfessorEvaluation.fromMap('${professorUid}_${athleteId}_$period', {
      'professorUid': professorUid,
      'professorName': 'Carlos Professor',
      'athleteId': athleteId,
      'athleteName': 'João Silva',
      'period': period,
      'sport': sport,
      'scores': scores ??
          {
            'saque': 7.5,
            'forehand': 7,
            'backhand': 8,
            'voleio': 6.5,
            'smash': 7,
            'posicionamento': 7,
          },
      'previousScores': previousScores,
      'overall': overall,
      'previousOverall': previousOverall,
      'comment': 'Evolução clara no backhand.',
      'focus': ['Smash', 'Saque'],
      'suggestedLevel': 'intermediario',
      'status': status,
      'updatedAt': DateTime(2026, 10, 19),
    });

class FakeProfessorEvaluationsRepository
    implements ProfessorEvaluationsRepository {
  FakeProfessorEvaluationsRepository({
    List<ProfessorEvaluation>? mine,
    List<ProfessorEvaluation>? received,
  })  : mine = mine ?? [],
        received = received ?? [];

  List<ProfessorEvaluation> mine;
  List<ProfessorEvaluation> received;
  String? error;
  final saved = <Map<String, Object?>>[];
  final deleted = <String>[];
  final _changes = StreamController<void>.broadcast();

  Stream<T> _watch<T>(T Function() read) async* {
    yield read();
    await for (final _ in _changes.stream) {
      yield read();
    }
  }

  @override
  Stream<List<ProfessorEvaluation>> watchMine(String professorUid) =>
      _watch(() => List.of(mine));

  @override
  Stream<List<ProfessorEvaluation>> watchReceived(String athleteUid) =>
      _watch(() => List.of(received));

  @override
  Future<ProfessorEvaluationSaved> save(ProfessorEvaluationInput input) async {
    final e = error;
    if (e != null) throw ProfessorStudentsException(e);
    final payload = input.toPayload();
    saved.add(payload);
    return (
      evaluationId: 'prof-1_${input.athleteId}_${input.period}',
      status: input.send
          ? ProfessorEvaluationStatus.sent
          : ProfessorEvaluationStatus.draft,
      overall: evaluationOverall(input.sport, input.scores),
      previousOverall: null,
    );
  }

  @override
  Future<void> delete(String evaluationId) async {
    deleted.add(evaluationId);
    mine = [
      for (final e in mine)
        if (e.id != evaluationId) e,
    ];
    _changes.add(null);
  }
}

List<RouteBase> get professorEvaluationRoutes => [
      GoRoute(
        path: AppRoutes.professorEvaluations,
        name: AppRouteNames.professorEvaluations,
        builder: (_, __) => const ProfessorEvaluationsPage(),
      ),
      GoRoute(
        path: AppRoutes.professorEvaluate,
        name: AppRouteNames.professorEvaluate,
        builder: (_, state) => ProfessorEvaluatePage(
          athleteId: state.pathParameters['athleteId'] ?? '',
          period: state.uri.queryParameters['period'],
        ),
      ),
      GoRoute(
        path: AppRoutes.athleteEvaluations,
        name: AppRouteNames.athleteEvaluations,
        builder: (_, __) => const AthleteEvaluationsPage(),
      ),
      GoRoute(
        path: AppRoutes.athleteEvaluation,
        name: AppRouteNames.athleteEvaluation,
        builder: (_, state) => AthleteEvaluationPage(
          evaluationId: state.pathParameters['evaluationId'] ?? '',
        ),
      ),
    ];
