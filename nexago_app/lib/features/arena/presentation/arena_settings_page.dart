import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/fade_slide_in.dart';
import '../../athlete/domain/favorites_providers.dart';
import '../domain/arena_providers.dart';
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
      backgroundColor: AppColors.canvas,
      body: SafeArea(
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

    final arena = arenaAsync.valueOrNull;
    final followers = followersAsync.valueOrNull ?? 0;
    final schedule = scheduleAsync.valueOrNull;
    final courts = courtsAsync.valueOrNull ?? const [];

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
        return SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(
            ArenaDashboardTokens.horizontalPadding,
            12,
            ArenaDashboardTokens.horizontalPadding,
            32,
          ),
          child: Center(
            child: ConstrainedBox(
              constraints: BoxConstraints(maxWidth: maxW),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const ArenaSettingsHeader(),
                  const SizedBox(height: 28),
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
                        onTap: () => context.pushNamed(AppRouteNames.arenaCourts),
                        showDivider: false,
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),
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
                        onTap: () => context.pushNamed(AppRouteNames.arenaPayments),
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
                  const SizedBox(height: 28),
                  const _ArenaSettingsLogoutSection(),
                ],
              ),
            ),
          ),
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
      color: AppColors.surfaceRaised,
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
          child: const Row(
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
          content: const Text('Tem certeza que deseja sair?'),
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
        );
      },
    );
    if (confirm != true || !context.mounted) return;
    await ref.read(authServiceProvider).signOut();
    if (!context.mounted) return;
    context.go(AppRoutes.login);
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
