import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/auth/auth_providers.dart';
import '../../../../../core/router/routes.dart';

/// Saída de emergência do onboarding: encerra a sessão e volta pro login.
///
/// Sem isso, um atleta que trava no onboarding (erro de rede, upload de
/// foto falhando, etc.) fica sem volta — o GoRouter empurra de volta pro
/// onboarding enquanto o perfil não estiver completo, e não há como sair
/// pra tentar de novo com outra conta.
class OnboardingLogoutButton extends ConsumerWidget {
  const OnboardingLogoutButton({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Material(
      color: context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(10),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () async {
          await ref.read(appSignOutProvider)();
          if (!context.mounted) return;
          context.go(AppRoutes.login);
        },
        child: Tooltip(
          message: 'Sair',
          child: SizedBox(
            width: 40,
            height: 40,
            child: Icon(
              Icons.logout_rounded,
              color: context.themeColors.onSurface,
              size: 22,
            ),
          ),
        ),
      ),
    );
  }
}
