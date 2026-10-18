import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../domain/squad_models.dart';
import '../infrastructure/firebase_squad_repository.dart';

export '../infrastructure/firebase_squad_repository.dart'
    show squadRepositoryProvider;

/// Uid da sessão; vazio deslogado (nenhuma callable é chamada). Sem
/// `autoDispose` porque [mySquadProvider], que vive a sessão toda, depende dele.
final squadUidProvider = Provider<String>((ref) {
  return ref.watch(authProvider).valueOrNull?.uid.trim() ?? '';
});

/// `appConfig/squad.enabled` (a rule de `appConfig` exige sessão).
final squadFlagProvider = StreamProvider.autoDispose<bool>((ref) {
  if (ref.watch(squadUidProvider).isEmpty) return Stream.value(false);
  return ref.watch(squadRepositoryProvider).watchEnabled();
});

/// Entradas do Squad ligadas? Carregando ou com erro conta como desligado.
final squadEnabledProvider = Provider.autoDispose<bool>((ref) {
  return ref.watch(squadFlagProvider).valueOrNull ?? false;
});

/// `getMySquad` da sessão. Sem `autoDispose`: home, perfil e as telas do Squad
/// leem a mesma resposta — uma chamada por sessão, refeita no puxar-para-
/// atualizar e depois de aceitar convite/aditivo (`ref.invalidate`).
///
/// Erro não fica em cache para sempre: o card da home é a única entrada manual
/// do Squad, então uma falha de rede tenta de novo sozinha a cada minuto.
final mySquadProvider = FutureProvider<MySquad>((ref) async {
  final uid = ref.watch(squadUidProvider);
  if (uid.isEmpty) return MySquad.none;
  try {
    return await ref.watch(squadRepositoryProvider).fetchMySquad();
  } catch (_) {
    final retry = Timer(const Duration(minutes: 1), ref.invalidateSelf);
    ref.onDispose(retry.cancel);
    rethrow;
  }
});

/// O que a home e o perfil mostram. Flag desligada, carregando, erro ou sem
/// vínculo = nada (a callable nem é chamada com a flag desligada).
final squadEntryProvider = Provider.autoDispose<MySquad>((ref) {
  if (!ref.watch(squadEnabledProvider)) return MySquad.none;
  final squad = ref.watch(mySquadProvider);
  // Recarga por troca de conta ainda carrega o valor da conta anterior.
  if (squad.isReloading) return MySquad.none;
  return squad.valueOrNull ?? MySquad.none;
});

final squadRankingProvider = FutureProvider.autoDispose<SquadRanking>((ref) {
  return ref.watch(squadRepositoryProvider).fetchRanking();
});

/// Ver o convite também o marca como aberto (o card vai para Contrato enviado).
final squadInviteProvider = FutureProvider.autoDispose
    .family<SquadInvite, String>((ref, inviteId) {
      return ref.watch(squadRepositoryProvider).viewInvite(inviteId);
    });

/// Telas do Squad pedem dado fresco ao abrir: o push de aditivo ou de repasse
/// chega com o app vivo e o `getMySquad` da sessão já velho. Mostra o que tem
/// em cache enquanto busca (as telas usam `skipLoadingOnRefresh`).
class SquadFreshData extends ConsumerStatefulWidget {
  const SquadFreshData({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<SquadFreshData> createState() => _SquadFreshDataState();
}

class _SquadFreshDataState extends ConsumerState<SquadFreshData> {
  @override
  void initState() {
    super.initState();
    // Primeira abertura (sem cache) já busca; não precisa de outra chamada.
    if (!ref.read(mySquadProvider).hasValue) return;
    Future.microtask(() {
      if (mounted) ref.invalidate(mySquadProvider);
    });
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
