import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../arenas/domain/arenas_providers.dart';
import '../data/arena_wallet_repository.dart';
import 'arena_schedule_providers.dart';

final arenaWalletRepositoryProvider = Provider<ArenaWalletRepository>((ref) {
  return ArenaWalletRepository(ref.watch(firestoreProvider));
});

final arenaWalletSummaryProvider =
    StreamProvider.autoDispose.family<ArenaWalletSummary, String>((ref, arenaId) {
  return ref.watch(arenaWalletRepositoryProvider).watchWallet(arenaId);
});

final arenaWalletLedgerProvider =
    StreamProvider.autoDispose.family<List<ArenaLedgerEntry>, String>((ref, arenaId) {
  return ref.watch(arenaWalletRepositoryProvider).watchLedger(arenaId);
});

final arenaWithdrawalsProvider =
    StreamProvider.autoDispose.family<List<ArenaWithdrawalItem>, String>((ref, arenaId) {
  return ref.watch(arenaWalletRepositoryProvider).watchWithdrawals(arenaId);
});

final managedArenaWalletProvider = StreamProvider.autoDispose<ArenaWalletSummary>((ref) {
  final arenaId = ref.watch(managedArenaIdProvider).valueOrNull;
  if (arenaId == null || arenaId.isEmpty) {
    return Stream.value(const ArenaWalletSummary(
      availableReais: 0,
      pendingReais: 0,
    ));
  }
  return ref.watch(arenaWalletRepositoryProvider).watchWallet(arenaId);
});
