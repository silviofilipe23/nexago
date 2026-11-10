import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import 'payment_card_form_page.dart';
import 'saved_payment_card_page.dart';

/// Rotas do cartão salvo, fora do shell. O formulário devolve o
/// `SavedPaymentCard` no `pop`.
List<RouteBase> paymentCardRoutes() => [
      GoRoute(
        path: AppRoutes.savedPaymentCard,
        name: AppRouteNames.savedPaymentCard,
        builder: (context, state) => const SavedPaymentCardPage(),
      ),
      GoRoute(
        path: AppRoutes.paymentCardNew,
        name: AppRouteNames.paymentCardNew,
        builder: (context, state) => const PaymentCardFormPage(),
      ),
    ];
