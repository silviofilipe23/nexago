import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/observability/analytics_service.dart';
import '../../../core/router/routes.dart';
import '../../../core/ui/app_snackbar.dart';
import '../application/store_checkout_providers.dart';
import '../domain/store_checkout_models.dart';
import 'store_checkout_copy.dart';

/// Ações dos pedidos compartilhadas por "Meus pedidos" e pelo detalhe.

/// Abre o Maps/rastreio fora do app; falha vira aviso.
Future<void> openStoreOrderLink(
  BuildContext context,
  WidgetRef ref,
  Uri uri,
) async {
  var ok = false;
  try {
    ok = await ref.read(storeOpenUrlProvider)(uri);
  } catch (_) {
    ok = false;
  }
  if (!ok && context.mounted) {
    showAppSnackBar(context, StoreCheckoutCopy.openLinkError, isError: true);
  }
}

/// "Comprar de novo": repõe as peças comuns ainda à venda e abre o carrinho;
/// avisa se algo ficou de fora.
Future<void> rebuyStoreOrder(
  BuildContext context,
  WidgetRef ref,
  StoreOrderView order,
) async {
  ref.read(analyticsServiceProvider).logStoreRebuy(orderId: order.id);
  try {
    final result = await ref.read(storeCheckoutActionsProvider).rebuy(order);
    if (!context.mounted) return;
    if (result.added == 0) {
      showAppSnackBar(context, StoreCheckoutCopy.rebuyNothing);
      return;
    }
    if (result.skipped > 0) {
      showAppSnackBar(context, StoreCheckoutCopy.rebuyPartial);
    }
    context.pushNamed(AppRouteNames.storeCart);
  } catch (_) {
    if (context.mounted) {
      showAppSnackBar(context, StoreCheckoutCopy.rebuyError, isError: true);
    }
  }
}
