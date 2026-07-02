import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/auth/active_role_providers.dart';
import 'package:nexago_app/core/auth/app_mobile_role.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../auth/presentation/role_selection_page.dart';

Future<void> showOrganizerSettingsSheet(
  BuildContext context,
  WidgetRef ref,
) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: context.themeColors.surfaceCard,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (context) => const _OrganizerSettingsSheet(),
  );
}

class _OrganizerSettingsSheet extends ConsumerWidget {
  const _OrganizerSettingsSheet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final canSwitchRole = ref.watch(hasMultipleMobileRolesProvider);
    final activeRole = ref.watch(activeMobileRoleProvider);

    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: context.themeColors.onSurfaceMuted.withValues(
                    alpha: 0.35,
                  ),
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              'Organizador',
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
            ),
            const SizedBox(height: 4),
            Text(
              activeRole == AppMobileRole.organizer
                  ? 'Você está no modo organizador de torneios.'
                  : 'Gerencie ligas, torneios, inscrições e chaves.',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                    height: 1.4,
                  ),
            ),
            const SizedBox(height: 20),
            Text(
              'FINANCEIRO',
              style: AppTypography.mono(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: context.themeColors.onSurfaceMuted,
                letterSpacing: 0.6,
              ),
            ),
            const SizedBox(height: 10),
            _OrganizerSettingsRow(
              icon: Icons.account_balance_wallet_rounded,
              title: 'Carteira e saques',
              subtitle: 'Saldo de inscrições, chave PIX e saque',
              onTap: () {
                Navigator.of(context).pop();
                context.pushNamed(AppRouteNames.organizerWallet);
              },
            ),
            if (canSwitchRole) ...[
              const SizedBox(height: 20),
              Text(
                'ACESSO',
                style: AppTypography.mono(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  color: context.themeColors.onSurfaceMuted,
                  letterSpacing: 0.6,
                ),
              ),
              const SizedBox(height: 10),
              Material(
                color: context.themeColors.surfaceRaised,
                borderRadius: BorderRadius.circular(14),
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  onTap: () async {
                    Navigator.of(context).pop();
                    await navigateToRoleSelection(context, ref);
                  },
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 14,
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 40,
                          height: 40,
                          decoration: BoxDecoration(
                            color: AppColors.brand.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Icon(
                            Icons.swap_horiz_rounded,
                            color: AppColors.brand,
                            size: 22,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Trocar papel',
                                style: Theme.of(context)
                                    .textTheme
                                    .titleSmall
                                    ?.copyWith(fontWeight: FontWeight.w800),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                'Entrar como atleta, gestor de arena ou organizador',
                                style: Theme.of(context)
                                    .textTheme
                                    .bodySmall
                                    ?.copyWith(
                                      color: context.themeColors.onSurfaceMuted,
                                      height: 1.35,
                                    ),
                              ),
                            ],
                          ),
                        ),
                        Icon(
                          Icons.chevron_right_rounded,
                          color: context.themeColors.onSurfaceMuted,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
            const SizedBox(height: 20),
            Text(
              'CONTA',
              style: AppTypography.mono(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: context.themeColors.onSurfaceMuted,
                letterSpacing: 0.6,
              ),
            ),
            const SizedBox(height: 10),
            _OrganizerSettingsLogoutRow(
              onTap: () => _confirmSignOut(context, ref),
            ),
          ],
        ),
      ),
    );
  }
}

Future<void> _confirmSignOut(BuildContext context, WidgetRef ref) async {
  final theme = Theme.of(context);
  final confirm = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('Sair da conta?'),
      content: const Text(
        'Você precisará entrar novamente para acessar o organizador.',
      ),
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

class _OrganizerSettingsLogoutRow extends StatelessWidget {
  const _OrganizerSettingsLogoutRow({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(14),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: AppColors.live.withValues(alpha: 0.35),
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: AppColors.live.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(
                  Icons.logout_rounded,
                  color: AppColors.live,
                  size: 22,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Sair da conta',
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w800,
                            color: AppColors.live,
                          ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Encerrar sessão neste aparelho',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: context.themeColors.onSurfaceMuted,
                            height: 1.35,
                          ),
                    ),
                  ],
                ),
              ),
              Icon(
                Icons.chevron_right_rounded,
                color: context.themeColors.onSurfaceMuted,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _OrganizerSettingsRow extends StatelessWidget {
  const _OrganizerSettingsRow({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(14),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: AppColors.brand.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: AppColors.brand, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: Theme.of(context)
                          .textTheme
                          .titleSmall
                          ?.copyWith(fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: context.themeColors.onSurfaceMuted,
                            height: 1.35,
                          ),
                    ),
                  ],
                ),
              ),
              Icon(
                Icons.chevron_right_rounded,
                color: context.themeColors.onSurfaceMuted,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
