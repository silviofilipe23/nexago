import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/active_role_providers.dart';
import '../../../core/auth/auth_providers.dart';
import '../../../core/layout/nexa_floating_header.dart';
import '../../../core/router/routes.dart';
import '../../auth/presentation/role_selection_page.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/fade_slide_in.dart';
import '../../athlete/domain/favorites_providers.dart';
import '../domain/arena_providers.dart';
import '../domain/products/arena_product_logic.dart';
import '../domain/products/arena_product_providers.dart';
import '../domain/arena_shell_providers.dart';
import 'widgets/arena_async_state.dart';
import 'widgets/arena_dashboard_tokens.dart';
import 'widgets/arena_settings_group.dart';
import 'widgets/arena_settings_header.dart';

/// Hub de ajustes da arena: atalhos para perfil, disponibilidade, etc.
class ArenaSettingsPage extends ConsumerWidget {
  const ArenaSettingsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final config = ref.watch(arenaModuleConfigProvider);
    final managed = ref.watch(managedArenaIdProvider);

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        bottom: false,
        child: FadeSlideIn(
          child: managed.when(
            skipLoadingOnReload: true,
            data: (arenaId) {
              if (arenaId == null || arenaId.isEmpty) {
                return ArenaEmptyState(
                  title: 'Arena não encontrada',
                  message:
                      'Nenhuma arena vinculada ao seu usuário como gestor de ${config.title}.',
                  icon: Icons.storefront_outlined,
                );
              }
              return _SettingsBody(arenaId: arenaId);
            },
            loading: () =>
                const ArenaLoadingState(label: 'Carregando arena...'),
            error: (e, _) => ArenaErrorState(message: '$e'),
          ),
        ),
      ),
    );
  }
}

class _SettingsBody extends ConsumerWidget {
  const _SettingsBody({required this.arenaId});

  final String arenaId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final arenaAsync = ref.watch(managedArenaDetailProvider);
    final followersAsync = ref.watch(arenaFollowersCountProvider(arenaId));
    final scheduleAsync = ref.watch(arenaSettingsTemplateProvider);
    final courtsAsync = ref.watch(arenaManagedCourtsProvider);
    final canSwitchRole = ref.watch(hasMultipleMobileRolesProvider);

    final arena = arenaAsync.valueOrNull;
    final followers = followersAsync.valueOrNull ?? 0;
    final schedule = scheduleAsync.valueOrNull;
    final courts = courtsAsync.valueOrNull ?? const [];

    final productSummary = ref.watch(managedArenaProductSummaryProvider);
    final productsSubtitle = formatProductSummarySubtitle(productSummary);

    final profileSubtitle = arena != null
        ? '${arena.locationLabel} • ${formatFollowersCount(followers)}'
        : 'Carregando perfil...';

    final availabilitySubtitle = schedule != null
        ? formatAvailabilitySummary(schedule)
        : scheduleAsync.isLoading
            ? 'Carregando disponibilidade...'
            : 'Horário padrão não configurado';

    final courtsSubtitle = formatCourtsSummary(courts.length);

    final paymentsSubtitle = arena != null
        ? _paymentsSettingsSubtitle(
            onlinePaymentEnabled: arena.onlinePaymentEnabled,
            onsitePaymentEnabled: arena.onsitePaymentEnabled,
            payoutPixKey: arena.payoutPixKey,
          )
        : 'Pix • pagamento direto';

    return LayoutBuilder(
      builder: (context, constraints) {
        final maxW = constraints.maxWidth > 560 ? 480.0 : double.infinity;
        final minContentHeight = MediaQuery.sizeOf(context).height -
            MediaQuery.paddingOf(context).top -
            ArenaDashboardTokens.shellScrollBottomPadding(context) -
            88;
        return CustomScrollView(
          controller:
              ref.watch(arenaShellScrollRegistryProvider).controllerFor(4),
          physics: ArenaDashboardTokens.shellScrollPhysics,
          slivers: [
            NexaFloatingHeaderSliver(
              topGap: 12,
              padding: const EdgeInsets.symmetric(
                horizontal: ArenaDashboardTokens.horizontalPadding,
              ),
              child: Center(
                child: ConstrainedBox(
                  constraints: BoxConstraints(maxWidth: maxW),
                  child: const ArenaSettingsHeader(),
                ),
              ),
            ),
            SliverPadding(
              padding: EdgeInsets.fromLTRB(
                ArenaDashboardTokens.horizontalPadding,
                0,
                ArenaDashboardTokens.horizontalPadding,
                ArenaDashboardTokens.shellScrollBottomPadding(context),
              ),
              sliver: SliverToBoxAdapter(
                child: Center(
                  child: ConstrainedBox(
                    constraints: BoxConstraints(
                      maxWidth: maxW,
                      minHeight:
                          minContentHeight.clamp(0.0, double.infinity),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        SizedBox(height: 28),
                        ArenaSettingsGroup(
                          sectionLabel: 'ARENA',
                          children: [
                            ArenaSettingsTile(
                              leading: ArenaSettingsArenaLogo(
                                logoUrl: arena?.logoUrl,
                              ),
                              title: arena?.name ?? 'Arena',
                              subtitle: profileSubtitle,
                              icon: Icons.stadium_rounded,
                              onTap: arena == null
                                  ? null
                                  : () => context.pushNamed(
                                        AppRouteNames.arenaProfile,
                                      ),
                              trailingBadge: const ArenaSettingsProfileBadge(),
                              showDivider: true,
                            ),
                            ArenaSettingsTile(
                              icon: Icons.calendar_month_outlined,
                              title: 'Disponibilidade na agenda',
                              subtitle: availabilitySubtitle,
                              onTap: () => context.pushNamed(
                                AppRouteNames.arenaAvailabilitySettings,
                              ),
                            ),
                            ArenaSettingsTile(
                              icon: Icons.grid_view_rounded,
                              title: 'Quadras',
                              subtitle: courtsSubtitle,
                              onTap: () =>
                                  context.pushNamed(AppRouteNames.arenaCourts),
                              showDivider: true,
                            ),
                            ArenaSettingsTile(
                              icon: Icons.inventory_2_outlined,
                              title: 'Produtos e estoque',
                              subtitle: productsSubtitle,
                              variant: ArenaSettingsIconVariant.neutral,
                              onTap: () => context
                                  .pushNamed(AppRouteNames.arenaProducts),
                              trailingBadge: productSummary.alertCount > 0
                                  ? _ProductsAlertBadge(
                                      count: productSummary.alertCount)
                                  : null,
                              showDivider: false,
                            ),
                          ],
                        ),
                        SizedBox(height: 24),
                        ArenaSettingsGroup(
                          sectionLabel: 'PREFERÊNCIAS',
                          children: [
                            ArenaSettingsTile(
                              icon: Icons.notifications_outlined,
                              title: 'Notificações',
                              subtitle: 'Push, e-mail, WhatsApp',
                              variant: ArenaSettingsIconVariant.neutral,
                              onTap: () => showAppSnackBar(
                                context,
                                'Notificações em breve.',
                              ),
                            ),
                            ArenaSettingsTile(
                              icon: Icons.account_balance_wallet_outlined,
                              title: 'Pagamentos',
                              subtitle: paymentsSubtitle,
                              variant: ArenaSettingsIconVariant.neutral,
                              onTap: () => context
                                  .pushNamed(AppRouteNames.arenaPayments),
                            ),
                            ArenaSettingsTile(
                              icon: Icons.person_add_outlined,
                              title: 'Equipe',
                              subtitle: '1 owner • convidar staff',
                              variant: ArenaSettingsIconVariant.neutral,
                              onTap: () => showAppSnackBar(
                                context,
                                'Equipe em breve.',
                              ),
                              showDivider: false,
                            ),
                          ],
                        ),
                        SizedBox(height: 24),
                        if (canSwitchRole)
                          ArenaSettingsGroup(
                            sectionLabel: 'ACESSO',
                            children: [
                              ArenaSettingsTile(
                                icon: Icons.swap_horiz_rounded,
                                title: 'Trocar papel',
                                subtitle: 'Entrar como atleta ou organizador',
                                variant: ArenaSettingsIconVariant.orange,
                                onTap: () =>
                                    navigateToRoleSelection(context, ref),
                                showDivider: false,
                              ),
                            ],
                          ),
                        if (canSwitchRole) SizedBox(height: 24),
                        const _ArenaSettingsLogoutSection(),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _ArenaSettingsLogoutSection extends ConsumerWidget {
  const _ArenaSettingsLogoutSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Material(
      color: context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(14),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => _confirmLogout(context, ref),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(vertical: 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: AppColors.live.withValues(alpha: 0.4),
            ),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.logout_rounded, color: AppColors.live, size: 20),
              SizedBox(width: 8),
              Text(
                'Sair',
                style: TextStyle(
                  color: AppColors.live,
                  fontWeight: FontWeight.w800,
                  fontSize: 16,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _confirmLogout(BuildContext context, WidgetRef ref) async {
    final theme = Theme.of(context);
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          content: Text('Tem certeza que deseja sair?'),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: Text('Cancelar'),
            ),
            FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: theme.colorScheme.error,
                foregroundColor: theme.colorScheme.onError,
              ),
              onPressed: () => Navigator.pop(ctx, true),
              child: Text('Sair'),
            ),
          ],
        );
      },
    );
    if (confirm != true || !context.mounted) return;
    await ref.read(appSignOutProvider)();
    if (!context.mounted) return;
    context.go(AppRoutes.login);
  }
}

class _ProductsAlertBadge extends StatelessWidget {
  const _ProductsAlertBadge({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: AppColors.brand.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.45)),
      ),
      child: Text(
        '$count',
        style: const TextStyle(
          color: AppColors.brand,
          fontSize: 11,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

String _paymentsSettingsSubtitle({
  required bool onlinePaymentEnabled,
  required bool onsitePaymentEnabled,
  required String payoutPixKey,
}) {
  final base = formatPaymentsSummary(
    onlinePaymentEnabled: onlinePaymentEnabled,
    onsitePaymentEnabled: onsitePaymentEnabled,
  );
  if (!onlinePaymentEnabled) return base;
  if (payoutPixKey.trim().length >= 5) return '$base • PIX via NexaGO';
  return '$base • cadastrar chave PIX';
}
