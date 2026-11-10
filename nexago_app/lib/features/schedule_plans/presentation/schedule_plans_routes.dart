import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import 'arena_schedule_plans_page.dart';
import 'my_schedule_plans_page.dart';
import 'schedule_plan_payment_page.dart';
import 'schedule_plan_signup_page.dart';

/// Rotas do atleta dos Planos de horário (A1 · A2 · A3).
List<RouteBase> schedulePlansRoutes() => [
      GoRoute(
        path: AppRoutes.mySchedulePlans,
        name: AppRouteNames.mySchedulePlans,
        builder: (context, state) => const MySchedulePlansPage(),
      ),
      GoRoute(
        path: AppRoutes.schedulePlanPayment,
        name: AppRouteNames.schedulePlanPayment,
        builder: (context, state) => SchedulePlanPaymentPage(
          chargeId: state.pathParameters['chargeId']?.trim() ?? '',
        ),
      ),
      GoRoute(
        path: AppRoutes.arenaSchedulePlans,
        name: AppRouteNames.arenaSchedulePlans,
        builder: (context, state) => ArenaSchedulePlansPage(
          arenaId: state.pathParameters['arenaId']?.trim() ?? '',
        ),
      ),
      GoRoute(
        path: AppRoutes.arenaSchedulePlanSignup,
        name: AppRouteNames.arenaSchedulePlanSignup,
        builder: (context, state) {
          final query = state.uri.queryParameters;
          String? q(String key) {
            final v = query[key]?.trim() ?? '';
            return v.isEmpty ? null : v;
          }

          return SchedulePlanSignupPage(
            arenaId: state.pathParameters['arenaId']?.trim() ?? '',
            planId: state.pathParameters['planId']?.trim() ?? '',
            offerEntryId: q('oferta'),
            changeSubscriptionId: q('trocar'),
          );
        },
      ),
    ];

/// Caminho do A2 com a query certa.
String schedulePlanSignupLocation({
  required String arenaId,
  required String planId,
  String? offerEntryId,
  String? changeSubscriptionId,
}) {
  final path = AppRoutes.arenaSchedulePlanSignup
      .replaceAll(':arenaId', Uri.encodeComponent(arenaId))
      .replaceAll(':planId', Uri.encodeComponent(planId));
  final query = <String, String>{
    if (offerEntryId != null) 'oferta': offerEntryId,
    if (changeSubscriptionId != null) 'trocar': changeSubscriptionId,
  };
  if (query.isEmpty) return path;
  return '$path?${Uri(queryParameters: query).query}';
}

/// Tela de pagamento de uma mensalidade do plano.
String schedulePlanPaymentLocation(String chargeId) =>
    AppRoutes.schedulePlanPayment
        .replaceAll(':chargeId', Uri.encodeComponent(chargeId));

/// Caminho do A1 da arena.
String arenaSchedulePlansLocation(String arenaId) =>
    AppRoutes.arenaSchedulePlans
        .replaceAll(':arenaId', Uri.encodeComponent(arenaId));
