import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../domain/athlete_billing.dart';
import 'athlete_billing_page.dart';

/// Rota das Cobranças do atleta, fora do shell (sem a barra).
List<RouteBase> athleteBillingRoutes() => [
      GoRoute(
        path: AppRoutes.athleteBilling,
        name: AppRouteNames.athleteBilling,
        builder: (context, state) {
          final q = state.uri.queryParameters;
          return AthleteBillingPage(
            initialTab: athleteBillingTabFromKey(q['aba']),
            initialKind: athleteChargeKindFromKey(q['tipo']),
          );
        },
      ),
    ];
