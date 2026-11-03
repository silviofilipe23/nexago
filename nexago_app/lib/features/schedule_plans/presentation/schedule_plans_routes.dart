import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import 'arena_schedule_plans_page.dart';
import 'my_schedule_plans_page.dart';
import 'schedule_plan_signup_page.dart';

/// Rotas do atleta dos Planos de horário (A1 · A2 · A3).
List<RouteBase> schedulePlansRoutes() => [
      GoRoute(
        path: AppRoutes.mySchedulePlans,
        name: AppRouteNames.mySchedulePlans,
        builder: (context, state) {
          final pay = state.uri.queryParameters['pagar']?.trim() ?? '';
          return MySchedulePlansPage(payChargeId: pay.isEmpty ? null : pay);
        },
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

/// Caminho de Meu plano; com [payChargeId] abre o pagamento dessa mensalidade.
String mySchedulePlansLocation({String? payChargeId}) =>
    payChargeId == null || payChargeId.isEmpty
        ? AppRoutes.mySchedulePlans
        : '${AppRoutes.mySchedulePlans}?'
            '${Uri(queryParameters: {'pagar': payChargeId}).query}';

/// Caminho do A1 da arena.
String arenaSchedulePlansLocation(String arenaId) => AppRoutes
    .arenaSchedulePlans
    .replaceAll(':arenaId', Uri.encodeComponent(arenaId));
