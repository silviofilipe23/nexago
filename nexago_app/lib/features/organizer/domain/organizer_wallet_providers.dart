import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import 'package:nexago_app/core/firebase/firebase_providers.dart';
import '../data/organizer_wallet_repository.dart';

final organizerWalletRepositoryProvider =
    Provider<OrganizerWalletRepository>((ref) {
  return OrganizerWalletRepository(ref.watch(firestoreProvider));
});

/// UID do organizador logado.
final currentOrganizerIdProvider = Provider<String?>((ref) {
  return ref.watch(authProvider).valueOrNull?.uid;
});

final organizerWalletProvider =
    StreamProvider.autoDispose<OrganizerWalletSummary>((ref) {
  final id = ref.watch(currentOrganizerIdProvider);
  if (id == null || id.isEmpty) {
    return Stream.value(OrganizerWalletSummary.empty);
  }
  return ref.watch(organizerWalletRepositoryProvider).watchWallet(id);
});

final organizerWalletLedgerProvider =
    StreamProvider.autoDispose<List<OrganizerLedgerEntry>>((ref) {
  final id = ref.watch(currentOrganizerIdProvider);
  if (id == null || id.isEmpty) return Stream.value(const []);
  return ref.watch(organizerWalletRepositoryProvider).watchLedger(id);
});

final organizerWithdrawalsProvider =
    StreamProvider.autoDispose<List<OrganizerWithdrawalItem>>((ref) {
  final id = ref.watch(currentOrganizerIdProvider);
  if (id == null || id.isEmpty) return Stream.value(const []);
  return ref.watch(organizerWalletRepositoryProvider).watchWithdrawals(id);
});
