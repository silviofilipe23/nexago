import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/auth/active_role_providers.dart';
import '../../../../core/auth/app_mobile_role.dart';
import '../../../../core/auth/auth_providers.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
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
        _SheetRow(
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
          const SizedBox(height: 10),
          _SheetRow(
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
        const SizedBox(height: 10),
        _SheetRow(
          key: const Key('professor-settings-sign-out'),
          icon: Icons.logout_rounded,
          title: 'Sair',
          subtitle: 'Você precisará entrar de novo',
          danger: true,
          onTap: () => _confirmSignOut(context, ref),
        ),
      ],
    );
  }
}

Future<void> _confirmSignOut(BuildContext context, WidgetRef ref) async {
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
  Navigator.of(context).pop();
  await ref.read(appSignOutProvider)();
  if (!context.mounted) return;
  context.go(AppRoutes.login);
}

class _SheetRow extends StatelessWidget {
  const _SheetRow({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.danger = false,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final accent = danger ? AppColors.live : AppColors.brand;
    return ProfessorLinksCard(
      onTap: onTap,
      borderColor: danger ? AppColors.live.withValues(alpha: 0.35) : null,
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: accent.withValues(alpha: 0.13),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: accent, size: 21),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: ProfessorLinksStyle.display(
                    15,
                    color: danger ? AppColors.live : colors.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: TextStyle(
                    fontSize: 12,
                    color: ProfessorLinksStyle.mute(colors),
                  ),
                ),
              ],
            ),
          ),
          Icon(
            Icons.chevron_right_rounded,
            color: ProfessorLinksStyle.dim(colors),
          ),
        ],
      ),
    );
  }
}
