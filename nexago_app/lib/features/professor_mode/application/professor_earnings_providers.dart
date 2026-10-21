import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../professor_links/application/professor_links_providers.dart';
import '../../professor_links/domain/arena_professor_link.dart';
import '../domain/professor_earnings.dart';
import '../infrastructure/professor_earnings_repository.dart';

export '../infrastructure/professor_earnings_repository.dart'
    show professorEarningsRepositoryProvider;

/// Ganhos do repasse (fase 6), em tempo real.

final professorEarningsWalletProvider =
    StreamProvider.autoDispose<ProfessorEarningsWallet>((ref) {
  final uid = ref.watch(professorLinksUidProvider);
  if (uid.isEmpty) return Stream.value(const ProfessorEarningsWallet());
  return ref.watch(professorEarningsRepositoryProvider).watchWallet(uid);
});

/// Extrato do saldo, do mais novo.
final professorEarningsLedgerProvider =
    StreamProvider.autoDispose<List<ProfessorEarningsEntry>>((ref) {
  final uid = ref.watch(professorLinksUidProvider);
  if (uid.isEmpty) return Stream.value(const []);
  return ref
      .watch(professorEarningsRepositoryProvider)
      .watchLedger(uid)
      .map((list) => [...list]..sort(_newestFirst(
          (e) => e.createdAt,
        )));
});

/// Saques, do mais novo.
final professorWithdrawalsProvider =
    StreamProvider.autoDispose<List<ProfessorWithdrawal>>((ref) {
  final uid = ref.watch(professorLinksUidProvider);
  if (uid.isEmpty) return Stream.value(const []);
  return ref
      .watch(professorEarningsRepositoryProvider)
      .watchWithdrawals(uid)
      .map((list) => [...list]..sort(_newestFirst((w) => w.createdAt)));
});

final professorPayoutPixKeyProvider =
    StreamProvider.autoDispose<ProfessorPayoutPixKey?>((ref) {
  final uid = ref.watch(professorLinksUidProvider);
  if (uid.isEmpty) return Stream.value(null);
  return ref.watch(professorEarningsRepositoryProvider).watchPixKey(uid);
});

/// "Em liberação": repasses fechados que a arena ainda não pagou.
final professorPendingPayoutsProvider =
    FutureProvider.autoDispose<List<ProfessorPendingPayout>>((ref) {
  if (ref.watch(professorLinksUidProvider).isEmpty) {
    return Future.value(const []);
  }
  return ref.watch(professorEarningsRepositoryProvider).fetchPendingPayouts();
});

/// Algum vínculo de equipe da arena (qualquer status) — quem recebe repasse.
final professorHasStaffLinkProvider = Provider.autoDispose<bool>((ref) {
  final links = ref.watch(myProfessorLinksProvider).valueOrNull ?? const [];
  return links.any((l) => l.type == ArenaProfessorLinkType.arenaStaff);
});

/// Mostra "Ganhos": equipe da arena, ou já tem saldo/histórico.
final professorEarningsVisibleProvider = Provider.autoDispose<bool>((ref) {
  if (ref.watch(professorHasStaffLinkProvider)) return true;
  final wallet = ref.watch(professorEarningsWalletProvider).valueOrNull;
  if (wallet != null &&
      (wallet.availableReais > 0 || wallet.pendingReais > 0)) {
    return true;
  }
  return (ref.watch(professorWithdrawalsProvider).valueOrNull ?? const [])
      .isNotEmpty;
});

int Function(T, T) _newestFirst<T>(DateTime? Function(T) at) => (a, b) {
      final x = at(a), y = at(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return y.compareTo(x);
    };
