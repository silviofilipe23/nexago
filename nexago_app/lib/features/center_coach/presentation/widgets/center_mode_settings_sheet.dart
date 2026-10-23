import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/auth/active_role_providers.dart';
import '../../../../core/auth/app_mobile_role.dart';
import '../../../auth/presentation/role_selection_page.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../../professor_mode/presentation/widgets/professor_settings_sheet.dart'
    show confirmProfessorSignOut;

/// Ajustes do modo Centro de treinamento: Trocar papel e Sair. Perfil, conta
/// e notificações ficam nos ajustes do atleta (a conta é a mesma); a gestão
/// do centro (matrícula, cobrança, equipe) fica no portal.
Future<void> showCenterModeSettingsSheet(BuildContext context) {
  return showProfessorLinksSheet<void>(
    context,
    builder: (_) => const _CenterModeSettingsSheet(),
  );
}

class _CenterModeSettingsSheet extends ConsumerWidget {
  const _CenterModeSettingsSheet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final canSwitchRole = ref.watch(hasMultipleMobileRolesProvider);
    return ProfessorLinksSheetBody(
      key: const Key('center-mode-settings-sheet'),
      title: AppMobileRole.center.title,
      subtitle: 'Matrícula, cobrança e equipe ficam no portal do centro.',
      children: [
        if (canSwitchRole)
          ProfessorLinksSheetRow(
            key: const Key('center-mode-settings-switch-role'),
            icon: Icons.swap_horiz_rounded,
            title: 'Trocar papel',
            subtitle: 'Entrar como atleta, professor ou outro papel',
            onTap: () async {
              Navigator.of(context).pop();
              await navigateToRoleSelection(context, ref);
            },
          ),
        ProfessorLinksSheetRow(
          key: const Key('center-mode-settings-sign-out'),
          icon: Icons.logout_rounded,
          title: 'Sair',
          subtitle: 'Você precisará entrar de novo',
          danger: true,
          onTap: () => confirmProfessorSignOut(
            context,
            ref,
            beforeSignOut: () => Navigator.of(context).pop(),
          ),
        ),
      ],
    );
  }
}
