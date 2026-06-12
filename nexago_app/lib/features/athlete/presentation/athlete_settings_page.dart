import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/auth/active_role_providers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/theme_mode_provider.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../auth/auth_legal_urls.dart';
import '../../auth/presentation/role_selection_page.dart';
import '../../arenas/domain/my_bookings_providers.dart';
import '../domain/achievements/achievement_providers.dart';
import '../domain/athlete_profile.dart';
import '../domain/athlete_display_name.dart';
import '../domain/athlete_profile_providers.dart';
import '../domain/gamification_models.dart';
import '../domain/gamification_providers.dart';
import '../domain/match_history/athlete_match_history_providers.dart';
import 'widgets/athlete_settings/athlete_appearance_sheet.dart';
import 'widgets/athlete_settings/athlete_settings_group.dart';
import 'widgets/athlete_settings/athlete_settings_helpers.dart';
import 'widgets/athlete_settings/athlete_settings_profile_card.dart';

/// Configurações do atleta (protótipo 13).
class AthleteSettingsPage extends ConsumerStatefulWidget {
  const AthleteSettingsPage({super.key});

  @override
  ConsumerState<AthleteSettingsPage> createState() =>
      _AthleteSettingsPageState();
}

class _AthleteSettingsPageState extends ConsumerState<AthleteSettingsPage> {
  void _popOrDiscover() {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go(AppRoutes.discover);
    }
  }

  Future<void> _signOut() async {
    await ref.read(appSignOutProvider)();
  }

  Future<void> _openLegalSheet() async {
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: context.themeColors.surfaceSheet,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                title: Text('Termos de uso'),
                onTap: () {
                  Navigator.pop(ctx);
                  _launchUrl(AuthLegalUrls.termsUrl);
                },
              ),
              ListTile(
                title: Text('Política de privacidade'),
                onTap: () {
                  Navigator.pop(ctx);
                  _launchUrl(AuthLegalUrls.privacyUrl);
                },
              ),
              SizedBox(height: 8),
            ],
          ),
        );
      },
    );
  }

  Future<void> _launchUrl(String url) async {
    final uri = Uri.parse(url);
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && mounted) {
      showAppSnackBar(context, 'Não foi possível abrir o link.', isError: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final user = ref.watch(authProvider).valueOrNull;
    final profileAsync = ref.watch(athleteProfileProvider);
    final summary =
        ref.watch(gamificationSummaryProvider).valueOrNull ??
        GamificationSummary.initial();
    final achievements = ref.watch(achievementsScreenStateProvider);
    final bookings =
        ref.watch(myBookingsStreamProvider).valueOrNull ?? const [];

    if (user == null) {
      return Scaffold(
        backgroundColor: context.themeColors.canvas,
        appBar: _settingsAppBar(theme, onBack: _popOrDiscover),
        body: Center(
          child: Text(
            'Faça login para ver as configurações.',
            style: TextStyle(color: context.themeColors.onSurfaceMuted),
          ),
        ),
      );
    }

    final profile = profileAsync.valueOrNull ?? AthleteProfile.draft(user);
    final matchHistorySubtitle = ref.watch(
      athleteMatchHistorySettingsSubtitleProvider,
    );
    final themePreference = ref.watch(appThemeModePreferenceProvider);
    final canSwitchRole = ref.watch(hasMultipleMobileRolesProvider);
    final viewData = buildAthleteSettingsViewData(
      profile: profile,
      email: user.email,
      summary: summary,
      achievements: achievements,
      bookings: bookings,
    );

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      appBar: _settingsAppBar(theme, onBack: _popOrDiscover),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(
            AthleteSettingsTokens.horizontalPadding,
            8,
            AthleteSettingsTokens.horizontalPadding,
            32,
          ),
          children: [
            AthleteSettingsProfileCard(
              name: athleteDisplayName(profile),
              secondaryName: athleteSecondaryLine(profile),
              email: user.email,
              avatarUrl: profile.avatarUrl,
              displayLevel: viewData.displayLevel,
              isLoading: profileAsync.isLoading && profileAsync.value == null,
              onEdit: () => context.pushNamed(AppRouteNames.athleteProfileEdit),
            ),
            SizedBox(height: AthleteSettingsTokens.sectionGap),
            AthleteSettingsGroup(
              sectionLabel: 'CONTA',
              children: [
                AthleteSettingsTile(
                  icon: Icons.person_outline_rounded,
                  title: 'Editar perfil',
                  subtitle: viewData.profileSubtitle,
                  onTap: () =>
                      context.pushNamed(AppRouteNames.athleteProfileEdit),
                  showDivider: true,
                ),
                AthleteSettingsTile(
                  icon: Icons.sports_volleyball_rounded,
                  title: 'Esportes e níveis',
                  subtitle: viewData.sportsLevelSubtitle,
                  onTap: () =>
                      context.pushNamed(AppRouteNames.athleteSportsLevels),
                  showDivider: true,
                ),
                AthleteSettingsTile(
                  icon: Icons.emoji_events_outlined,
                  title: 'Conquistas',
                  subtitle: viewData.achievementsSubtitle,
                  variant: AthleteSettingsIconVariant.yellow,
                  trailingBadge: AthleteSettingsOrangeBadge(
                    label: viewData.achievementsTrailing,
                  ),
                  onTap: () =>
                      context.pushNamed(AppRouteNames.athleteAchievements),
                  showDivider: true,
                ),
                AthleteSettingsTile(
                  icon: Icons.calendar_month_outlined,
                  title: 'Minhas reservas',
                  subtitle: viewData.bookingsSubtitle,
                  variant: AthleteSettingsIconVariant.neutral,
                  onTap: () => context.pushNamed(AppRouteNames.myBookings),
                  showDivider: true,
                ),
                AthleteSettingsTile(
                  icon: Icons.emoji_events_rounded,
                  title: 'Histórico de partidas',
                  subtitle: matchHistorySubtitle,
                  onTap: () =>
                      context.pushNamed(AppRouteNames.athleteMatchHistory),
                  showDivider: false,
                ),
              ],
            ),
            SizedBox(height: AthleteSettingsTokens.sectionGap),
            if (canSwitchRole) ...[
              AthleteSettingsGroup(
                sectionLabel: 'ACESSO',
                children: [
                  AthleteSettingsTile(
                    icon: Icons.swap_horiz_rounded,
                    title: 'Trocar papel',
                    subtitle: 'Entrar como gestor, organizador ou atleta',
                    variant: AthleteSettingsIconVariant.orange,
                    onTap: () => navigateToRoleSelection(context, ref),
                    showDivider: false,
                  ),
                ],
              ),
              SizedBox(height: AthleteSettingsTokens.sectionGap),
            ],
            AthleteSettingsGroup(
              sectionLabel: 'PREFERÊNCIAS',
              children: [
                AthleteSettingsTile(
                  icon: Icons.notifications_outlined,
                  title: 'Notificações',
                  subtitle: viewData.notificationsSubtitle,
                  variant: AthleteSettingsIconVariant.neutral,
                  onTap: () => context.pushNamed(
                    AppRouteNames.athleteNotificationSettings,
                  ),
                  showDivider: true,
                ),
                AthleteSettingsTile(
                  icon: Icons.visibility_outlined,
                  title: 'Privacidade e segurança',
                  subtitle: viewData.privacySubtitle,
                  variant: AthleteSettingsIconVariant.neutral,
                  onTap: () =>
                      context.pushNamed(AppRouteNames.athletePrivacySecurity),
                  showDivider: true,
                ),
                AthleteSettingsTile(
                  icon: Icons.brightness_6_outlined,
                  title: 'Aparência',
                  subtitle: themePreference.label,
                  variant: AthleteSettingsIconVariant.neutral,
                  onTap: () => showAthleteAppearanceSheet(context),
                  showDivider: true,
                ),
                AthleteSettingsTile(
                  icon: Icons.language_rounded,
                  title: 'Idioma',
                  subtitle: 'Idioma do app',
                  variant: AthleteSettingsIconVariant.neutral,
                  trailing: AthleteSettingsMutedTrailing(label: 'Português'),
                  showChevron: false,
                  onTap: () => showAthleteSettingsComingSoon(context),
                  showDivider: true,
                ),
                AthleteSettingsTile(
                  icon: Icons.account_balance_wallet_outlined,
                  title: 'Pagamentos',
                  subtitle: 'Nenhum método salvo',
                  variant: AthleteSettingsIconVariant.neutral,
                  onTap: () => showAthleteSettingsComingSoon(context),
                  showDivider: false,
                ),
              ],
            ),
            SizedBox(height: AthleteSettingsTokens.sectionGap),
            AthleteSettingsGroup(
              sectionLabel: 'SOBRE',
              children: [
                AthleteSettingsTile(
                  icon: Icons.help_outline_rounded,
                  title: 'Ajuda e suporte',
                  subtitle: 'Central de ajuda',
                  variant: AthleteSettingsIconVariant.neutral,
                  onTap: () => showAthleteSettingsComingSoon(context),
                  showDivider: true,
                ),
                AthleteSettingsTile(
                  icon: Icons.ios_share_rounded,
                  title: 'Convidar amigos',
                  subtitle: 'Compartilhe o NexaGO',
                  variant: AthleteSettingsIconVariant.neutral,
                  trailingBadge: const AthleteSettingsOrangeBadge(
                    label: '+50 XP',
                  ),
                  onTap: () => showAthleteSettingsComingSoon(context),
                  showDivider: true,
                ),
                AthleteSettingsTile(
                  icon: Icons.shield_outlined,
                  title: 'Termos e privacidade',
                  subtitle: 'Documentos legais',
                  variant: AthleteSettingsIconVariant.neutral,
                  onTap: _openLegalSheet,
                  showDivider: false,
                ),
              ],
            ),
            SizedBox(height: AthleteSettingsTokens.sectionGap),
            AthleteSettingsDangerGroup(
              children: [
                AthleteSettingsTile(
                  icon: Icons.logout_rounded,
                  title: 'Sair da conta',
                  subtitle: 'Encerrar sessão neste aparelho',
                  titleColor: AppColors.live,
                  iconColor: AppColors.live,
                  variant: AthleteSettingsIconVariant.neutral,
                  onTap: _signOut,
                  showDivider: true,
                ),
                AthleteSettingsTile(
                  icon: Icons.delete_outline_rounded,
                  title: 'Excluir conta',
                  subtitle: 'Solicitar exclusão dos seus dados',
                  variant: AthleteSettingsIconVariant.neutral,
                  onTap: () => _launchUrl(AuthLegalUrls.accountDeletionUrl),
                  showDivider: false,
                ),
              ],
            ),
            SizedBox(height: 28),
            Center(
              child: Text(
                AthleteSettingsAppInfo.footerLabel,
                style: AppTypography.mono(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: context.themeColors.onSurfaceMuted.withValues(
                    alpha: 0.75,
                  ),
                  letterSpacing: 0.3,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  PreferredSizeWidget _settingsAppBar(
    ThemeData theme, {
    required VoidCallback onBack,
  }) {
    return AppBar(
      backgroundColor: context.themeColors.canvas,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      centerTitle: true,
      leading: Padding(
        padding: const EdgeInsets.only(left: 12),
        child: Center(
          child: Material(
            color: context.themeColors.surfaceRaised,
            borderRadius: BorderRadius.circular(12),
            child: InkWell(
              onTap: onBack,
              borderRadius: BorderRadius.circular(12),
              child: SizedBox(
                width: 40,
                height: 40,
                child: Icon(
                  Icons.chevron_left_rounded,
                  color: context.themeColors.onSurface,
                ),
              ),
            ),
          ),
        ),
      ),
      title: Text(
        'Configurações',
        style: theme.textTheme.titleLarge?.copyWith(
          fontWeight: FontWeight.w800,
          color: context.themeColors.onSurface,
          letterSpacing: -0.3,
        ),
      ),
    );
  }
}
