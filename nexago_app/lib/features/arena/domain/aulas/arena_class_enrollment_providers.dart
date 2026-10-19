import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexago_app/core/firebase/firebase_providers.dart';
import '../../data/arena_class_enrollment_repository.dart';
import '../arena_date_utils.dart';
import '../arena_schedule_providers.dart';
import 'arena_class_billing_logic.dart';
import 'arena_class_enrollment.dart';
import 'arena_class_session.dart';

final arenaClassEnrollmentRepositoryProvider =
    Provider<ArenaClassEnrollmentRepository>((ref) {
  return ArenaClassEnrollmentRepository(ref.watch(firestoreProvider));
});

/// Hoje (`YYYY-MM-DD`, dia civil do aparelho — mesmo corte da fase 1).
/// Provider para os testes fixarem a data.
final arenaClassTodayKeyProvider = Provider.autoDispose<String>(
  (ref) => arenaDateKey(arenaTodayDateOnly()),
);

/// Stream da arena gerida: vazio sem arena, espera enquanto o acesso carrega.
Stream<T> _forManagedArena<T>(
  Ref ref,
  T empty,
  Stream<T> Function(ArenaClassEnrollmentRepository repo, String arenaId) build,
) {
  return ref.watch(managedArenaIdProvider).when(
        data: (arenaId) => arenaId == null || arenaId.isEmpty
            ? Stream<T>.value(empty)
            : build(ref.watch(arenaClassEnrollmentRepositoryProvider), arenaId),
        loading: () => Stream<T>.empty(),
        error: (_, __) => Stream<T>.value(empty),
      );
}

/// Planos da arena gerida (todas as situações).
final arenaClassPlansProvider =
    StreamProvider.autoDispose<List<ArenaClassPlan>>((ref) {
  return _forManagedArena(ref, const <ArenaClassPlan>[],
      (repo, arenaId) => repo.watchPlans(arenaId));
});

/// Regras de aulas da arena gerida (padrão enquanto não há doc).
final arenaClassRulesProvider =
    StreamProvider.autoDispose<ArenaClassRules>((ref) {
  return _forManagedArena(ref, ArenaClassRules.defaults,
      (repo, arenaId) => repo.watchRules(arenaId));
});

/// Matrículas da arena gerida (todas as situações).
final arenaClassEnrollmentsProvider =
    StreamProvider.autoDispose<List<ArenaClassEnrollment>>((ref) {
  return _forManagedArena(ref, const <ArenaClassEnrollment>[],
      (repo, arenaId) => repo.watchEnrollments(arenaId));
});

/// Créditos de reposição disponíveis da arena gerida.
final arenaClassAvailableCreditsProvider =
    StreamProvider.autoDispose<List<ArenaClassCredit>>((ref) {
  return _forManagedArena(ref, const <ArenaClassCredit>[],
      (repo, arenaId) => repo.watchAvailableCredits(arenaId));
});

/// Cobranças em aberto da arena gerida.
final arenaClassOpenChargesProvider =
    StreamProvider.autoDispose<List<ArenaClassCharge>>((ref) {
  return _forManagedArena(ref, const <ArenaClassCharge>[],
      (repo, arenaId) => repo.watchOpenCharges(arenaId));
});

/// Cobranças pagas no mês corrente da arena gerida.
final arenaClassPaidThisMonthProvider =
    StreamProvider.autoDispose<List<ArenaClassCharge>>((ref) {
  final from = arenaClassMonthStart(ref.watch(arenaClassTodayKeyProvider));
  return _forManagedArena(ref, const <ArenaClassCharge>[],
      (repo, arenaId) => repo.watchPaidChargesSince(arenaId, from));
});

/// Tela de Mensalidades: abas + totais do mês. Carrega quando as duas
/// fontes emitiram.
final arenaClassChargesViewProvider =
    Provider.autoDispose<AsyncValue<ArenaClassChargesView>>((ref) {
  final open = ref.watch(arenaClassOpenChargesProvider);
  final paid = ref.watch(arenaClassPaidThisMonthProvider);
  final todayKey = ref.watch(arenaClassTodayKeyProvider);
  if (open.hasError) return AsyncValue.error(open.error!, open.stackTrace!);
  if (paid.hasError) return AsyncValue.error(paid.error!, paid.stackTrace!);
  final o = open.valueOrNull, p = paid.valueOrNull;
  if (o == null || p == null) return const AsyncValue.loading();
  return AsyncValue.data(
    buildArenaClassChargesView(open: o, paid: p, todayKey: todayKey),
  );
});

/// Aba escolhida em Mensalidades (abre em "Em atraso").
final arenaClassChargesTabProvider =
    StateProvider.autoDispose<ArenaClassChargesTab>(
  (ref) => ArenaClassChargesTab.overdue,
);

/// Matrículas de um aluno (studentId = id do doc em `classStudents`).
final arenaClassStudentEnrollmentsProvider = StreamProvider.autoDispose
    .family<List<ArenaClassEnrollment>, String>((ref, studentId) {
  return _forManagedArena(
    ref,
    const <ArenaClassEnrollment>[],
    (repo, arenaId) =>
        repo.watchStudentEnrollments(arenaId: arenaId, studentId: studentId),
  );
});

/// Cobranças de um aluno.
final arenaClassStudentChargesProvider = StreamProvider.autoDispose
    .family<List<ArenaClassCharge>, String>((ref, studentId) {
  return _forManagedArena(
    ref,
    const <ArenaClassCharge>[],
    (repo, arenaId) =>
        repo.watchStudentCharges(arenaId: arenaId, studentId: studentId),
  );
});

/// Créditos de reposição de um aluno (todas as situações).
final arenaClassStudentCreditsProvider = StreamProvider.autoDispose
    .family<List<ArenaClassCredit>, String>((ref, studentId) {
  return _forManagedArena(
    ref,
    const <ArenaClassCredit>[],
    (repo, arenaId) =>
        repo.watchStudentCredits(arenaId: arenaId, studentId: studentId),
  );
});

/// Chave das aulas de uma turma desde uma data. Record de Strings: igualdade
/// por valor, seguro como family.
typedef ArenaClassSessionsSinceKey = ({String classId, String fromKey});

/// Aulas de uma turma desde `fromKey` (frequência do aluno).
final arenaClassSessionsSinceProvider = StreamProvider.autoDispose
    .family<List<ArenaClassSession>, ArenaClassSessionsSinceKey>((ref, key) {
  return _forManagedArena(
    ref,
    const <ArenaClassSession>[],
    (repo, arenaId) => repo.watchClassSessionsSince(
      arenaId: arenaId,
      classId: key.classId,
      fromKey: key.fromKey,
    ),
  );
});
