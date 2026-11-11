import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/firebase/firebase_providers.dart';
import '../domain/arena_contract.dart';
import '../infrastructure/arena_contract_repository.dart';

final arenaContractRepositoryProvider = Provider<ArenaContractRepository>(
  (ref) => ArenaContractRepository(firestore: ref.watch(firestoreProvider)),
);

/// Uid da sessão; vazio deslogado (nenhuma leitura bate nas rules).
final arenaContractUidProvider = Provider.autoDispose<String>(
  (ref) => ref.watch(authProvider).valueOrNull?.uid.trim() ?? '',
);

/// Tem contrato de mensalista? Uma leitura do espelho; erro conta como não.
final hasArenaContractProvider = StreamProvider.autoDispose<bool>((ref) {
  final uid = ref.watch(arenaContractUidProvider);
  if (uid.isEmpty) return Stream.value(false);
  return ref
      .watch(arenaContractRepositoryProvider)
      .watchHasContract(uid)
      .handleError((Object _) {});
});

/// Contratos do atleta (Meu contrato). Chama a callable sempre que a tela pede.
final myArenaContractsProvider =
    FutureProvider.autoDispose<MyArenaContracts>((ref) {
  if (ref.watch(arenaContractUidProvider).isEmpty) {
    return const MyArenaContracts();
  }
  return ref.watch(arenaContractRepositoryProvider).myContracts();
});

/// Para as Cobranças e o menu da conta, que todo atleta abre: só chama a
/// callable com contrato no espelho; erro vira lista vazia — as outras
/// origens seguem.
final athleteArenaContractsProvider =
    FutureProvider.autoDispose<List<ArenaContract>>((ref) async {
  final has = ref.watch(hasArenaContractProvider);
  if (has.valueOrNull != true) return const [];
  try {
    return (await ref.watch(myArenaContractsProvider.future)).contracts;
  } catch (_) {
    return const [];
  }
});
