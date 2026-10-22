import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/auth/active_role_providers.dart';
import '../../../../core/auth/app_mobile_role.dart';
import '../../../../core/auth/auth_providers.dart';
import '../../../../core/router/routes.dart';
import '../../../auth/presentation/role_selection_page.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';

/// Ajustes do modo Professor: Minhas arenas, Trocar papel e Sair. Perfil,
/// conta e notificações ficam nos ajustes do atleta (a conta é a mesma).
Future<void> showProfessorSettingsSheet(BuildContext context) {
  return showProfessorLinksSheet<void>(
    context,
    builder: (_) => const _ProfessorSettingsSheet(),
  );
}

class _ProfessorSettingsSheet extends ConsumerWidget {
  const _ProfessorSettingsSheet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final canSwitchRole = ref.watch(hasMultipleMobileRolesProvider);
    return ProfessorLinksSheetBody(
      title: AppMobileRole.professor.title,
      subtitle: 'Perfil e conta ficam nos ajustes do modo Atleta.',
      children: [
        ProfessorLinksSheetRow(
          key: const Key('professor-settings-arenas'),
          icon: Icons.school_outlined,
          title: 'Minhas arenas',
          subtitle: 'Convites, pedidos e permissões em cada arena',
          onTap: () {
            Navigator.of(context).pop();
            context.pushNamed(AppRouteNames.professorArenas);
          },
        ),
        if (canSwitchRole) ...[
          ProfessorLinksSheetRow(
            key: const Key('professor-settings-switch-role'),
            icon: Icons.swap_horiz_rounded,
            title: 'Trocar papel',
            subtitle: 'Entrar como atleta, gestor de arena ou organizador',
            onTap: () async {
              Navigator.of(context).pop();
              await navigateToRoleSelection(context, ref);
            },
          ),
        ],
        ProfessorLinksSheetRow(
          key: const Key('professor-settings-sign-out'),
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

/// "Sair da conta?" do modo Professor (folha de ajustes e aba Mais).
/// [beforeSignOut] fecha quem chamou (a folha) antes de sair.
Future<void> confirmProfessorSignOut(
  BuildContext context,
  WidgetRef ref, {
  VoidCallback? beforeSignOut,
}) async {
  final theme = Theme.of(context);
  final confirm = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('Sair da conta?'),
      content: const Text('Você precisará entrar novamente.'),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx, false),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          style: FilledButton.styleFrom(
            backgroundColor: theme.colorScheme.error,
            foregroundColor: theme.colorScheme.onError,
          ),
          onPressed: () => Navigator.pop(ctx, true),
          child: const Text('Sair'),
        ),
      ],
    ),
  );
  if (confirm != true || !context.mounted) return;
  beforeSignOut?.call();
  await ref.read(appSignOutProvider)();
  if (!context.mounted) return;
  context.go(AppRoutes.login);
}
