import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../auth/auth_providers.dart';
import '../router/routes.dart';
import '../../features/arena/domain/mercado_pago_providers.dart';
import 'app_deep_link_logic.dart';
import 'deep_link_providers.dart';

/// Navega a partir de um deep link (Universal Link, App Link ou `nexago://`).
void navigateFromDeepLink({
  required Uri uri,
  required WidgetRef ref,
  required GoRouter router,
}) {
  if (isMercadoPagoOAuthDeepLink(uri)) {
    _handleMercadoPagoOAuthReturn(uri, ref, router);
    return;
  }

  final appPath = resolveAppDeepLinkPath(uri);
  if (appPath == null) return;

  final user = ref.read(authProvider).valueOrNull;
  if (user != null) {
    router.go(appPath);
    return;
  }

  ref.read(pendingDeepLinkPathProvider.notifier).state = appPath;
  router.go(AppRoutes.login);
}

void _handleMercadoPagoOAuthReturn(
  Uri uri,
  WidgetRef ref,
  GoRouter router,
) {
  final mp = uri.queryParameters['mp'];
  final user = ref.read(authProvider).valueOrNull;
  if (user == null) {
    router.go(AppRoutes.login);
    return;
  }
  ref.read(mercadoPagoOAuthFeedbackProvider.notifier).state = mp;
  router.go(AppRoutes.arenaPayments);
}

/// Consome deep link pendente após autenticação (login / bootstrap).
String? consumePendingDeepLinkPath(Ref ref) {
  final pending = ref.read(pendingDeepLinkPathProvider);
  if (pending == null || pending.isEmpty) return null;
  ref.read(pendingDeepLinkPathProvider.notifier).state = null;
  return pending;
}
