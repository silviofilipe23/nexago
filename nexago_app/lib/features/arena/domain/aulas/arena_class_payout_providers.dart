import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexago_app/core/firebase/firebase_providers.dart';
import '../../data/arena_class_payout_repository.dart';
import '../arena_access_providers.dart';
import '../arena_schedule_providers.dart';
import '../arena_staff_role.dart';
import 'arena_class_enrollment_providers.dart';
import 'arena_class_payout.dart';
import 'arena_class_payout_logic.dart';
import 'arena_class_teacher.dart';

final arenaClassPayoutRepositoryProvider =
    Provider<ArenaClassPayoutRepository>((ref) {
  return ArenaClassPayoutRepository(ref.watch(firestoreProvider));
});

/// Ver o repasse (modelo, valores, fechamentos): quem lê o financeiro — mesma
/// regra da rule de `arenaClassPayouts`. Recepção e manutenção leem a agenda,
/// não o que o professor ganha.
final arenaClassCanSeePayoutProvider = Provider<bool>((ref) {
  return ref.watch(arenaCanReadProvider(ArenaArea.financeiro));
});

/// Mexer no repasse (modelo, fechar, pagar, desfazer): escreve a agenda E lê
/// o financeiro — dono e gestor (`requireClassPayoutManager`).
final arenaClassCanManagePayoutProvider = Provider<bool>((ref) {
  return ref.watch(arenaCanWriteProvider(ArenaArea.agenda)) &&
      ref.watch(arenaCanReadProvider(ArenaArea.financeiro));
});

/// Stream da arena gerida: vazio sem arena, espera enquanto o acesso carrega.
Stream<T> _forManagedArena<T>(
  Ref ref,
  T empty,
  Stream<T> Function(ArenaClassPayoutRepository repo, String arenaId) build,
) {
  return ref.watch(managedArenaIdProvider).when(
        data: (arenaId) => arenaId == null || arenaId.isEmpty
            ? Stream<T>.value(empty)
            : build(ref.watch(arenaClassPayoutRepositoryProvider), arenaId),
        loading: () => Stream<T>.empty(),
        error: (_, __) => Stream<T>.value(empty),
      );
}

/// Professores da arena gerida (ativos e arquivados).
final arenaClassTeachersProvider =
    StreamProvider.autoDispose<List<ArenaClassTeacher>>((ref) {
  return _forManagedArena(ref, const <ArenaClassTeacher>[],
      (repo, arenaId) => repo.watchTeachers(arenaId));
});

/// Prévia do mês `YYYY-MM` (callable). Invalidar depois de fechar/pagar.
final arenaClassPayoutPreviewProvider = FutureProvider.autoDispose
    .family<ArenaClassPayoutPreview, String>((ref, month) async {
  final arenaAsync = ref.watch(managedArenaIdProvider);
  // Acesso ainda carregando: fica em loading (o watch refaz quando chegar).
  if (arenaAsync.isLoading) return Completer<ArenaClassPayoutPreview>().future;
  final arenaId = arenaAsync.valueOrNull;
  if (arenaId == null || arenaId.isEmpty) {
    return ArenaClassPayoutPreview(month: month);
  }
  return ref
      .watch(arenaClassPayoutRepositoryProvider)
      .previewPayouts(arenaId: arenaId, month: month);
});

/// Fechamentos gravados no mês.
final arenaClassMonthPayoutsProvider = StreamProvider.autoDispose
    .family<List<ArenaClassPayout>, String>((ref, month) {
  return _forManagedArena(ref, const <ArenaClassPayout>[],
      (repo, arenaId) => repo.watchMonthPayouts(arenaId, month));
});

/// Chave professor + mês. Record de Strings: igualdade por valor, seguro como
/// family.
typedef ArenaClassTeacherMonthKey = ({String teacherId, String month});

/// Fechamento do professor no mês (null = ainda não fechado).
final arenaClassTeacherPayoutProvider = StreamProvider.autoDispose
    .family<ArenaClassPayout?, ArenaClassTeacherMonthKey>((ref, key) {
  return _forManagedArena<ArenaClassPayout?>(
    ref,
    null,
    (repo, arenaId) => repo.watchTeacherPayout(
      arenaId: arenaId,
      teacherId: key.teacherId,
      month: key.month,
    ),
  );
});

/// Últimos fechamentos do professor.
final arenaClassTeacherPayoutHistoryProvider = StreamProvider.autoDispose
    .family<List<ArenaClassPayout>, String>((ref, teacherId) {
  return _forManagedArena(
    ref,
    const <ArenaClassPayout>[],
    (repo, arenaId) =>
        repo.watchTeacherPayoutHistory(arenaId: arenaId, teacherId: teacherId),
  );
});

/// Tela "Repasse do mês": linhas por professor + totais.
class ArenaClassPayoutMonthView {
  const ArenaClassPayoutMonthView({
    required this.preview,
    required this.rows,
    required this.totals,
  });

  final ArenaClassPayoutPreview preview;
  final List<ArenaClassPayoutRow> rows;
  final ArenaClassPayoutTotals totals;
}

/// Junta a prévia (servidor) com os fechamentos do mês. Erro na leitura dos
/// fechamentos vira lista vazia (a prévia ainda mostra o mês); erro na
/// prévia é erro da tela.
final arenaClassPayoutMonthViewProvider = Provider.autoDispose
    .family<AsyncValue<ArenaClassPayoutMonthView>, String>((ref, month) {
  final preview = ref.watch(arenaClassPayoutPreviewProvider(month));
  final closed = ref.watch(arenaClassMonthPayoutsProvider(month));
  final todayKey = ref.watch(arenaClassTodayKeyProvider);
  if (preview.hasError) {
    return AsyncValue.error(preview.error!, preview.stackTrace!);
  }
  final p = preview.valueOrNull;
  final c = closed.hasError ? const <ArenaClassPayout>[] : closed.valueOrNull;
  if (p == null || c == null) return const AsyncValue.loading();
  final rows = buildArenaClassPayoutRows(
    preview: p.teachers,
    closed: c,
    month: month,
    todayKey: todayKey,
  );
  return AsyncValue.data(ArenaClassPayoutMonthView(
    preview: p,
    rows: rows,
    totals: arenaClassPayoutTotals(rows),
  ));
});
