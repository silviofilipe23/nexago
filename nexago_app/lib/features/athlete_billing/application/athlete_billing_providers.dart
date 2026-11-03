import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/time/nexago_event_timezone.dart';
import '../../arenas/domain/my_bookings_providers.dart';
import '../../athlete/domain/agenda/athlete_agenda_providers.dart';
import '../../athlete_training/application/athlete_training_providers.dart';
import '../../schedule_plans/application/schedule_plans_providers.dart';
import '../../schedule_plans/domain/schedule_plan_models.dart';
import '../../tournaments/data/my_tournament_registrations_repository.dart';
import '../../tournaments/domain/my_tournaments_providers.dart';
import '../domain/athlete_billing.dart';

/// Relógio das Cobranças (vencida × a vencer) — trocado nos testes.
final athleteBillingClockProvider =
    Provider<DateTime Function()>((ref) => DateTime.now);

/// Quem está vendo (sobrescrito nos testes).
final athleteBillingUidProvider = Provider.autoDispose<String>(
  (ref) => ref.watch(authProvider).valueOrNull?.uid ?? '',
);

/// Assinaturas de horário fixo. Só chama a callable quando há assinatura
/// viva (a Início e o menu da conta leem isto para todo atleta); erro vira
/// lista vazia — as Cobranças seguem com as outras origens.
final athleteBillingSubscriptionsProvider =
    FutureProvider.autoDispose<List<ScheduleSubscription>>((ref) async {
  final live = ref.watch(myLiveScheduleSubscriptionsCountProvider);
  if ((live.valueOrNull ?? 0) == 0) return const [];
  try {
    return (await ref.watch(myScheduleSubscriptionsProvider.future))
        .subscriptions;
  } catch (_) {
    return const [];
  }
});

/// Cobranças em aberto de todas as origens; `null` enquanto alguma origem
/// ainda carrega pela primeira vez. Origem com erro conta como vazia.
final athleteOpenChargesProvider =
    Provider.autoDispose<List<AthleteCharge>?>((ref) {
  final uid = ref.watch(athleteBillingUidProvider);
  if (uid.isEmpty) return const [];
  final classes = ref.watch(myClassChargesProvider);
  final centers = ref.watch(athleteTrainingCentersProvider);
  final subs = ref.watch(athleteBillingSubscriptionsProvider);
  final bookings = ref.watch(myBookingsStreamProvider);
  final tournaments = ref.watch(myTournamentsPageStateProvider);
  final loading = [classes, centers, subs, bookings, tournaments]
      .any((a) => a.isLoading && !a.hasValue);
  if (loading) return null;
  final now = ref.watch(athleteBillingClockProvider)();
  return buildOpenCharges(
    uid: uid,
    todayKey: nexagoEventDayKey(now),
    now: now,
    classCharges: classes.valueOrNull ?? const [],
    centers: centers.valueOrNull ?? const [],
    subscriptions: subs.valueOrNull ?? const [],
    bookings: bookings.valueOrNull ?? const [],
    enrollments: tournaments.valueOrNull?.enrollments ?? const [],
  );
});

/// Resumo das abertas (Início e menu da conta); `null` carregando.
final athleteChargesSummaryProvider =
    Provider.autoDispose<AthleteChargesSummary?>((ref) {
  final open = ref.watch(athleteOpenChargesProvider);
  return open == null ? null : AthleteChargesSummary.of(open);
});

/// Planos e assinaturas que cobram todo ciclo; `null` carregando.
final athleteRecurringChargesProvider =
    Provider.autoDispose<List<AthleteRecurringCharge>?>((ref) {
  final plans = ref.watch(athleteTrainingPlansProvider);
  final centers = ref.watch(athleteTrainingCentersProvider);
  final subs = ref.watch(athleteBillingSubscriptionsProvider);
  if ([plans, centers, subs].any((a) => a.isLoading && !a.hasValue)) {
    return null;
  }
  return buildRecurringCharges(
    uid: ref.watch(athleteBillingUidProvider),
    plans: plans.valueOrNull,
    centers: centers.valueOrNull ?? const [],
    subscriptions: subs.valueOrNull ?? const [],
  );
});

/// Pagamentos feitos, por mês; `null` carregando.
final athletePaidHistoryProvider =
    Provider.autoDispose<List<PaidMonth>?>((ref) {
  final plans = ref.watch(athleteTrainingPlansProvider);
  final centers = ref.watch(athleteTrainingCentersProvider);
  final subs = ref.watch(athleteBillingSubscriptionsProvider);
  if ([plans, centers, subs].any((a) => a.isLoading && !a.hasValue)) {
    return null;
  }
  return buildPaidHistory(
    uid: ref.watch(athleteBillingUidProvider),
    plans: plans.valueOrNull,
    centers: centers.valueOrNull ?? const [],
    subscriptions: subs.valueOrNull ?? const [],
  );
});

/// Relê todas as origens (puxar para atualizar, volta do pagamento).
void refreshAthleteBilling(WidgetRef ref) {
  ref.invalidate(myClassChargesProvider);
  ref.invalidate(athleteTrainingCentersDataProvider);
  ref.invalidate(athleteTrainingPlansProvider);
  ref.invalidate(myScheduleSubscriptionsProvider);
  ref.invalidate(myTournamentRegistrationsProvider);
}
