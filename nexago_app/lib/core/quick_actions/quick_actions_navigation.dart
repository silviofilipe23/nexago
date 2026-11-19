import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:nexago_app/core/auth/settled_session.dart';
import 'package:nexago_app/core/deep_link/deep_link_providers.dart';
import 'package:nexago_app/core/quick_actions/athlete_quick_actions_logic.dart';
import 'package:nexago_app/core/quick_actions/quick_actions_channel.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/athlete/domain/athlete_shell_providers.dart';
import 'package:nexago_app/features/auth/domain/post_login_bootstrap.dart';

/// Leva o atleta ao destino da Quick Action tocada.
///
/// Mesmo cuidado do toque em push: espera a sessão assentar e, sem sessão,
/// guarda o destino em [pendingDeepLinkPathProvider] (consumido depois do
/// login) em vez de deixar o redirect engolir.
Future<void> navigateFromQuickAction(
  QuickActionTap tap,
  GoRouter router, {
  required WidgetRef ref,
  DateTime Function() clock = DateTime.now,
}) async {
  final destination = resolveAthleteQuickAction(
    type: tap.type,
    payload: tap.payload,
    now: clock(),
  );
  if (destination == null) return;

  final hasSession = await awaitSettledSession(ref);
  if (!hasSession) {
    ref.read(pendingDeepLinkPathProvider.notifier).state = destination.path;
    router.go(AppRoutes.login);
    return;
  }

  // Login feito agora, com a tela de carregamento à vista: navegar direto
  // seria desviado para ela e o destino se perderia. Fica pendente e o
  // pós-login consome (mesmo caminho do link externo).
  if (ref.read(sessionBootstrapProvider) == SessionBootstrapState.pending) {
    ref.read(pendingDeepLinkPathProvider.notifier).state = destination.path;
    router.go(AppRoutes.authLoading);
    return;
  }

  // Com a casca do atleta já montada, o `?tab=` não troca a aba sozinho.
  final tabIndex = destination.shellTabIndex;
  if (tabIndex != null) {
    ref.read(athleteShellTabIndexProvider.notifier).state = tabIndex;
  }

  WidgetsBinding.instance.addPostFrameCallback((_) {
    router.go(destination.path);
  });
}
