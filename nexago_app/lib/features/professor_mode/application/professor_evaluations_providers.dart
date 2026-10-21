import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../professor_links/application/professor_links_providers.dart';
import '../domain/professor_evaluations.dart';
import '../infrastructure/professor_evaluations_repository.dart';
import 'professor_students_providers.dart';
import 'professor_wallet_providers.dart';

export '../infrastructure/professor_evaluations_repository.dart'
    show professorEvaluationsRepositoryProvider;

/// Avaliações do professor (mais recentes primeiro).
final professorEvaluationsProvider =
    StreamProvider.autoDispose<List<ProfessorEvaluation>>((ref) {
  final uid = ref.watch(professorLinksUidProvider);
  if (uid.isEmpty) return Stream.value(const []);
  return ref
      .watch(professorEvaluationsRepositoryProvider)
      .watchMine(uid)
      .map(sortEvaluations);
});

/// Mês corrente (`YYYY-MM`, São Paulo).
final professorEvaluationPeriodProvider = Provider.autoDispose<String>((ref) {
  return evaluationCurrentPeriod(ref.watch(professorWalletTodayKeyProvider));
});

/// Alunos que o professor pode avaliar: turmas liberadas (com conta) +
/// carteira ativa, sem repetir.
final evaluableStudentsProvider =
    Provider.autoDispose<List<EvaluableStudent>>((ref) {
  final out = <String, EvaluableStudent>{};
  for (final s in ref.watch(professorStudentsProvider).valueOrNull?.students ??
      const []) {
    final id = s.athleteId;
    if (id == null || id.isEmpty || out.containsKey(id)) continue;
    out[id] = (athleteId: id, name: s.name, photoUrl: s.photoUrl);
  }
  for (final s
      in ref.watch(professorWalletStudentsProvider).valueOrNull ?? const []) {
    if (!s.active) continue;
    out.putIfAbsent(
      s.athleteId,
      () => (athleteId: s.athleteId, name: s.name, photoUrl: s.photoUrl),
    );
  }
  return out.values.toList();
});

/// Pendentes do mês (sem avaliação enviada).
final evaluationPendingProvider =
    Provider.autoDispose<List<EvaluableStudent>>((ref) {
  final mine = ref.watch(professorEvaluationsProvider).valueOrNull ?? const [];
  return evaluationPending(
    ref.watch(evaluableStudentsProvider),
    mine,
    ref.watch(professorEvaluationPeriodProvider),
  );
});

// ── lado do aluno ──

/// Avaliações enviadas para o aluno logado (mais recentes primeiro).
final receivedEvaluationsProvider =
    StreamProvider.autoDispose<List<ProfessorEvaluation>>((ref) {
  final uid = ref.watch(professorLinksUidProvider);
  if (uid.isEmpty) return Stream.value(const []);
  return ref
      .watch(professorEvaluationsRepositoryProvider)
      .watchReceived(uid)
      .map(sortEvaluations);
});
