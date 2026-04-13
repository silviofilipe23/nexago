import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/auth/auth_providers.dart';
import '../../../../core/router/routes.dart';

/// Encerra a sessão e volta para a tela de login.
class ArenaLogoutButton extends ConsumerWidget {
  const ArenaLogoutButton({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return IconButton(
      tooltip: 'Sair',
      onPressed: () async {
        await ref.read(authServiceProvider).signOut();
        if (!context.mounted) return;
        context.go(AppRoutes.login);
      },
      icon: const Icon(Icons.logout_rounded),
    );
  }
}
