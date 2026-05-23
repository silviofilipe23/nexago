import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../domain/athlete_active_sessions_providers.dart';
import '../domain/athlete_privacy_preferences.dart';
import '../domain/athlete_privacy_preferences_providers.dart';
import '../domain/athlete_profile_providers.dart';
import 'utils/athlete_biometric_settings.dart';
import 'widgets/athlete_notifications/athlete_notification_toggle_tile.dart';
import 'widgets/athlete_privacy/privacy_visibility_option_card.dart';
import 'widgets/athlete_settings/athlete_settings_group.dart';

/// Privacidade e segurança do atleta (protótipo 15).
class AthletePrivacySecurityPage extends ConsumerStatefulWidget {
  const AthletePrivacySecurityPage({super.key});

  @override
  ConsumerState<AthletePrivacySecurityPage> createState() =>
      _AthletePrivacySecurityPageState();
}

class _AthletePrivacySecurityPageState
    extends ConsumerState<AthletePrivacySecurityPage> {
  bool? _biometricOverride;
  bool _savingBiometric = false;

  @override
  Widget build(BuildContext context) {
    final ui = ref.watch(athletePrivacyPreferencesProvider);
    final notifier = ref.read(athletePrivacyPreferencesProvider.notifier);
    final theme = Theme.of(context);
    final profile = ref.watch(athleteProfileProvider).valueOrNull;
    final sessionsAsync = ref.watch(athleteActiveSessionsProvider);
    final useBiometric = _biometricOverride ?? profile?.useBiometric ?? false;

    ref.listen(athletePrivacyPreferencesProvider, (prev, next) {
      if (next.errorMessage != null &&
          next.errorMessage != prev?.errorMessage) {
        showAppSnackBar(context, next.errorMessage!);
      }
    });

    final sessionsSubtitle = sessionsAsync.when(
      data: (s) => s.sessionsSubtitle,
      loading: () => 'Carregando...',
      error: (_, _) => 'Sessões ativas',
    );

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: _appBar(context, theme),
      body: switch (ui.status) {
        AthletePrivacyPreferencesStatus.loading => const Center(
            child: CircularProgressIndicator(color: AppColors.brand),
          ),
        AthletePrivacyPreferencesStatus.error => Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text(
                ui.errorMessage ?? 'Erro ao carregar preferências.',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyLarge?.copyWith(
                  color: AppColors.onSurfaceMuted,
                ),
              ),
            ),
          ),
        AthletePrivacyPreferencesStatus.ready => Stack(
            children: [
              ListView(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
                children: [
                  Text(
                    'VISIBILIDADE DO PERFIL',
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: AppColors.onSurfaceMuted,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.8,
                      fontSize: 10,
                    ),
                  ),
                  const SizedBox(height: 10),
                  ...AthleteProfileVisibility.values.map(
                    (v) => PrivacyVisibilityOptionCard(
                      visibility: v,
                      selected: ui.prefs.profileVisibility == v,
                      onTap: ui.canEdit
                          ? () => notifier.setProfileVisibility(v)
                          : () {},
                    ),
                  ),
                  const SizedBox(height: AthleteSettingsTokens.sectionGap),
                  AthleteSettingsGroup(
                    sectionLabel: 'O QUE OUTROS VEEM',
                    children: [
                      AthleteNotificationToggleTile(
                        icon: Icons.emoji_events_outlined,
                        title: 'Conquistas e nível',
                        subtitle: 'Badges e progresso de XP',
                        value: ui.prefs.showOthers.achievementsAndLevel,
                        enabled: ui.canEdit,
                        onChanged: (v) =>
                            notifier.setShowOthers(achievementsAndLevel: v),
                      ),
                      AthleteNotificationToggleTile(
                        icon: Icons.calendar_month_outlined,
                        title: 'Próximas reservas',
                        subtitle: 'Agenda de jogos futuros',
                        value: ui.prefs.showOthers.upcomingBookings,
                        enabled: ui.canEdit,
                        onChanged: (v) =>
                            notifier.setShowOthers(upcomingBookings: v),
                      ),
                      AthleteNotificationToggleTile(
                        icon: Icons.person_add_alt_1_rounded,
                        title: 'Parceiros frequentes',
                        subtitle: 'Quem você mais joga',
                        value: ui.prefs.showOthers.frequentPartners,
                        enabled: ui.canEdit,
                        onChanged: (v) =>
                            notifier.setShowOthers(frequentPartners: v),
                        showDivider: false,
                      ),
                    ],
                  ),
                  const SizedBox(height: AthleteSettingsTokens.sectionGap),
                  AthleteSettingsGroup(
                    sectionLabel: 'SEGURANÇA',
                    children: [
                      AthleteNotificationToggleTile(
                        icon: Icons.face_rounded,
                        title: 'Face ID',
                        subtitle: 'Pedir biometria ao abrir',
                        variant: AthleteSettingsIconVariant.green,
                        value: useBiometric,
                        enabled: ui.canEdit && !_savingBiometric,
                        onChanged: _onBiometricChanged,
                      ),
                      AthleteSettingsTile(
                        icon: Icons.lock_outline_rounded,
                        title: 'Alterar senha',
                        subtitle: 'Atualize sua senha de acesso',
                        variant: AthleteSettingsIconVariant.neutral,
                        onTap: () => context.pushNamed(
                          AppRouteNames.athleteChangePassword,
                        ),
                        showDivider: true,
                      ),
                      AthleteSettingsTile(
                        icon: Icons.devices_rounded,
                        title: 'Sessões ativas',
                        subtitle: sessionsSubtitle,
                        variant: AthleteSettingsIconVariant.neutral,
                        onTap: () => context.pushNamed(
                          AppRouteNames.athleteActiveSessions,
                        ),
                        showDivider: false,
                      ),
                    ],
                  ),
                ],
              ),
              if (ui.isSaving)
                const Positioned(
                  top: 0,
                  left: 0,
                  right: 0,
                  child: LinearProgressIndicator(
                    minHeight: 2,
                    color: AppColors.brand,
                    backgroundColor: Colors.transparent,
                  ),
                ),
            ],
          ),
      },
    );
  }

  Future<void> _onBiometricChanged(bool value) async {
    setState(() {
      _biometricOverride = value;
      _savingBiometric = true;
    });

    final ok = await setAthleteBiometricEnabled(
      context: context,
      ref: ref,
      value: value,
    );

    if (!mounted) return;
    setState(() {
      _savingBiometric = false;
      if (!ok) _biometricOverride = null;
    });
  }

  PreferredSizeWidget _appBar(BuildContext context, ThemeData theme) {
    return AppBar(
      backgroundColor: AppColors.canvas,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      centerTitle: true,
      leading: Padding(
        padding: const EdgeInsets.only(left: 12),
        child: Center(
          child: Material(
            color: AppColors.surfaceRaised,
            borderRadius: BorderRadius.circular(12),
            child: InkWell(
              onTap: () {
                if (context.canPop()) {
                  context.pop();
                } else {
                  context.go(AppRoutes.athleteSettings);
                }
              },
              borderRadius: BorderRadius.circular(12),
              child: const SizedBox(
                width: 40,
                height: 40,
                child: Icon(
                  Icons.chevron_left_rounded,
                  color: AppColors.onSurface,
                ),
              ),
            ),
          ),
        ),
      ),
      title: Text(
        'Privacidade e segurança',
        style: theme.textTheme.titleLarge?.copyWith(
          fontWeight: FontWeight.w800,
          color: AppColors.onSurface,
          letterSpacing: -0.3,
        ),
      ),
    );
  }
}
