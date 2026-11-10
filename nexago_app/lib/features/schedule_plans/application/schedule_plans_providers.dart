import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/firebase/firebase_providers.dart';
import '../../tournaments/domain/tournament_service_fee.dart';
import '../domain/schedule_plan_models.dart';
import '../infrastructure/schedule_plans_repository.dart';

final schedulePlansRepositoryProvider =
    Provider<SchedulePlansRepository>((ref) {
  return SchedulePlansRepository(firestore: ref.watch(firestoreProvider));
});

/// Taxas do cartão para a prévia da tela de pagamento.
final scheduleCardFeeTermsProvider =
    FutureProvider.autoDispose<CardFeeTerms>((ref) {
  return ref.watch(schedulePlansRepositoryProvider).cardFeeTerms();
});

/// Uid da sessão; vazio deslogado (nenhuma leitura bate nas rules).
final schedulePlansUidProvider = Provider.autoDispose<String>((ref) {
  return ref.watch(authProvider).valueOrNull?.uid.trim() ?? '';
});

/// Planos publicados da arena (A1 e a seção do detalhe da arena).
final arenaActiveSchedulePlansProvider = StreamProvider.autoDispose
    .family<List<SchedulePlan>, String>((ref, arenaId) {
  final id = arenaId.trim();
  if (id.isEmpty || ref.watch(schedulePlansUidProvider).isEmpty) {
    return Stream.value(const <SchedulePlan>[]);
  }
  return ref.watch(schedulePlansRepositoryProvider).watchActivePlans(id);
});

/// Disponibilidade de um plano (A2). Chave: `arenaId|planId`.
final schedulePlanAvailabilityProvider = FutureProvider.autoDispose
    .family<SchedulePlanAvailability, ({String arenaId, String planId})>(
        (ref, key) {
  return ref
      .watch(schedulePlansRepositoryProvider)
      .availability(arenaId: key.arenaId, planId: key.planId);
});

/// Minhas assinaturas + vagas oferecidas (A3).
final myScheduleSubscriptionsProvider =
    FutureProvider.autoDispose<MyScheduleSubscriptions>((ref) {
  if (ref.watch(schedulePlansUidProvider).isEmpty) {
    return const MyScheduleSubscriptions();
  }
  return ref.watch(schedulePlansRepositoryProvider).mySubscriptions();
});

/// Taxas e próxima mensalidade do débito automático (chave: assinatura).
final scheduleAutopayPreviewProvider = FutureProvider.autoDispose
    .family<ScheduleAutopayPreview, String>((ref, subscriptionId) {
  return ref
      .watch(schedulePlansRepositoryProvider)
      .autopayPreview(subscriptionId);
});

/// Para a entrada da agenda: assinaturas vivas (titular ou membro). Erro
/// (rules, Firebase ausente) vira zero — a entrada só some.
final myLiveScheduleSubscriptionsCountProvider =
    StreamProvider.autoDispose<int>((ref) {
  final uid = ref.watch(schedulePlansUidProvider);
  if (uid.isEmpty) return Stream.value(0);
  return ref
      .watch(schedulePlansRepositoryProvider)
      .watchMyLiveSubscriptionsCount(uid)
      .handleError((Object _) {});
});

/// Vagas da lista de espera oferecidas ao atleta (entrada da agenda).
final myScheduleOffersCountProvider = StreamProvider.autoDispose<int>((ref) {
  final uid = ref.watch(schedulePlansUidProvider);
  if (uid.isEmpty) return Stream.value(0);
  return ref
      .watch(schedulePlansRepositoryProvider)
      .watchMyOffersCount(uid)
      .handleError((Object _) {});
});

/// Mensalidade ao vivo na tela de pagamento.
final scheduleChargeProvider =
    StreamProvider.autoDispose.family<ScheduleCharge?, String>((ref, chargeId) {
  if (chargeId.isEmpty || ref.watch(schedulePlansUidProvider).isEmpty) {
    return Stream.value(null);
  }
  return ref.watch(schedulePlansRepositoryProvider).watchCharge(chargeId);
});

/// Assinatura ao vivo na tela de pagamento (prazo de 30 min do pagamento).
final scheduleSubscriptionDocProvider = StreamProvider.autoDispose
    .family<ScheduleSubscription?, String>((ref, subscriptionId) {
  if (subscriptionId.isEmpty || ref.watch(schedulePlansUidProvider).isEmpty) {
    return Stream.value(null);
  }
  return ref
      .watch(schedulePlansRepositoryProvider)
      .watchSubscription(subscriptionId);
});
