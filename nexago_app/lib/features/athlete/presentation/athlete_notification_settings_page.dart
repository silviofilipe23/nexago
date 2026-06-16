import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/formatting/br_phone_format.dart';
import '../../../core/notifications/notification_providers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../domain/athlete_notification_preferences_providers.dart';
import '../domain/athlete_profile_providers.dart';
import '../domain/profile_completion_models.dart';
import 'widgets/athlete_notifications/athlete_notification_toggle_tile.dart';
import 'widgets/athlete_notifications/quiet_hours_time_sheet.dart';
import 'widgets/athlete_settings/athlete_settings_group.dart';

/// Preferências de notificação do atleta (protótipo 14).
class AthleteNotificationSettingsPage extends ConsumerWidget {
  const AthleteNotificationSettingsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ui = ref.watch(athleteNotificationPreferencesProvider);
    final notifier = ref.read(athleteNotificationPreferencesProvider.notifier);
    final theme = Theme.of(context);
    final authEmail = ref.watch(authProvider).valueOrNull?.email?.trim();

    ref.listen(athleteNotificationPreferencesProvider, (prev, next) {
      if (next.errorMessage != null &&
          next.errorMessage != prev?.errorMessage) {
        showAppSnackBar(context, next.errorMessage!);
      }
    });

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      appBar: _appBar(context, theme),
      body: switch (ui.status) {
        AthleteNotificationPreferencesStatus.loading => Center(
            child: CircularProgressIndicator(color: AppColors.brand),
          ),
        AthleteNotificationPreferencesStatus.error => Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text(
                ui.errorMessage ?? 'Erro ao carregar preferências.',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyLarge?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
            ),
          ),
        AthleteNotificationPreferencesStatus.ready => _ReadyBody(
            ui: ui,
            authEmail: authEmail,
            onPushChanged: (v) => _onPushChanged(context, ref, v),
            onChannelChanged: notifier.setChannel,
            onTopicChanged: notifier.setTopic,
            onQuietHoursEnabled: notifier.setQuietHoursEnabled,
            onQuietHoursRange: notifier.setQuietHoursRange,
          ),
      },
    );
  }

  PreferredSizeWidget _appBar(BuildContext context, ThemeData theme) {
    return NexaAppBar(
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
              onTap: () {
                if (context.canPop()) {
                  context.pop();
                } else {
                  context.go(AppRoutes.athleteSettings);
                }
              },
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
        'Notificações',
        style: theme.textTheme.titleLarge?.copyWith(
          fontWeight: FontWeight.w800,
          color: context.themeColors.onSurface,
          letterSpacing: -0.3,
        ),
      ),
      bottom: PreferredSize(
        preferredSize: const Size.fromHeight(52),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
          child: Align(
            alignment: Alignment.centerLeft,
            child: Text(
              'Escolhe como e quando o nexaGO te encontra.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: context.themeColors.onSurfaceMuted,
                height: 1.35,
                fontSize: 13,
              ),
            ),
          ),
        ),
      ),
    );
  }

  static Future<void> _onPushChanged(
    BuildContext context,
    WidgetRef ref,
    bool enabled,
  ) async {
    final notifier = ref.read(athleteNotificationPreferencesProvider.notifier);
    final notifications = ref.read(notificationServiceProvider);

    if (enabled) {
      await notifications.initialize();
      final settings = await ref.read(firebaseMessagingProvider).requestPermission(
            alert: true,
            badge: true,
            sound: true,
            provisional: false,
          );
      final authorized = settings.authorizationStatus ==
              AuthorizationStatus.authorized ||
          settings.authorizationStatus == AuthorizationStatus.provisional;
      if (!authorized) {
        if (!context.mounted) return;
        showAppSnackBar(
          context,
          'Ative as notificações nas configurações do aparelho.',
          isError: true,
        );
        return;
      }
      notifier.setChannel(push: true);
      await notifier.saveNow();
      final uid = ref.read(authProvider).valueOrNull?.uid;
      await notifications.syncUserToken(uid);
      return;
    }

    notifier.setChannel(push: false);
    await notifier.saveNow();
    final uid = ref.read(authProvider).valueOrNull?.uid;
    await notifications.clearCurrentDeviceToken(uid);
  }
}

class _ReadyBody extends ConsumerWidget {
  const _ReadyBody({
    required this.ui,
    required this.authEmail,
    required this.onPushChanged,
    required this.onChannelChanged,
    required this.onTopicChanged,
    required this.onQuietHoursEnabled,
    required this.onQuietHoursRange,
  });

  final AthleteNotificationPreferencesUiState ui;
  final String? authEmail;
  final Future<void> Function(bool) onPushChanged;
  final void Function({bool? push, bool? whatsapp, bool? email}) onChannelChanged;
  final void Function({
    bool? bookingsAndGames,
    bool? athleteInvites,
    bool? achievementsXp,
    bool? availableSlots,
    bool? promotions,
  }) onTopicChanged;
  final void Function(bool) onQuietHoursEnabled;
  final void Function({required String start, required String end})
      onQuietHoursRange;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(athleteProfileProvider).valueOrNull;
    final phone = profile?.phoneNumber;
    final phoneDisplay = formatPhoneBrDisplay(phone) ?? 'Cadastre no perfil';
    final hasValidPhone = ProfileCompletionValidators.isValidWhatsApp(phone);
    final emailDisplay = (authEmail != null && authEmail!.isNotEmpty)
        ? authEmail!
        : 'Sem e-mail na conta';

    final prefs = ui.prefs;
    final canEdit = ui.canEdit;

    return Stack(
      children: [
        ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
          children: [
        AthleteSettingsGroup(
          sectionLabel: 'CANAIS',
          children: [
            AthleteNotificationToggleTile(
              icon: Icons.notifications_active_rounded,
              title: 'Push',
              subtitle: 'Notificações do app',
              variant: AthleteSettingsIconVariant.orange,
              value: prefs.channels.push,
              enabled: canEdit,
              onChanged: (v) => onPushChanged(v),
            ),
            AthleteNotificationToggleTile(
              icon: Icons.chat_rounded,
              title: 'WhatsApp',
              subtitle: phoneDisplay,
              variant: AthleteSettingsIconVariant.green,
              value: prefs.channels.whatsapp,
              enabled: canEdit && hasValidPhone,
              onChanged: (v) {
                if (v && !hasValidPhone) {
                  showAppSnackBar(
                    context,
                    'Cadastre seu WhatsApp no perfil.',
                    isError: true,
                  );
                  return;
                }
                onChannelChanged(whatsapp: v);
              },
            ),
            AthleteNotificationToggleTile(
              icon: Icons.mail_outline_rounded,
              title: 'E-mail',
              subtitle: emailDisplay,
              value: prefs.channels.email,
              enabled: canEdit,
              onChanged: (v) => onChannelChanged(email: v),
              showDivider: false,
            ),
          ],
        ),
        SizedBox(height: AthleteSettingsTokens.sectionGap),
        AthleteSettingsGroup(
          sectionLabel: 'O QUE VOCÊ RECEBE',
          children: [
            AthleteNotificationToggleTile(
              icon: Icons.calendar_month_outlined,
              title: 'Reservas e jogos',
              subtitle: 'Lembretes 2h antes · confirmação',
              value: prefs.topics.bookingsAndGames,
              enabled: canEdit,
              onChanged: (v) => onTopicChanged(bookingsAndGames: v),
            ),
            AthleteNotificationToggleTile(
              icon: Icons.person_add_alt_1_rounded,
              title: 'Convites de outros atletas',
              subtitle: 'Convites pra jogar e times',
              value: prefs.topics.athleteInvites,
              enabled: canEdit,
              onChanged: (v) => onTopicChanged(athleteInvites: v),
            ),
            AthleteNotificationToggleTile(
              icon: Icons.emoji_events_outlined,
              title: 'Conquistas e XP',
              subtitle: 'Quando ganhar badges ou subir nível',
              value: prefs.topics.achievementsXp,
              enabled: canEdit,
              onChanged: (v) => onTopicChanged(achievementsXp: v),
            ),
            AthleteNotificationToggleTile(
              icon: Icons.bolt_rounded,
              title: 'Slots disponíveis',
              subtitle: 'Quadras livres no horário que você joga',
              value: prefs.topics.availableSlots,
              enabled: canEdit,
              onChanged: (v) => onTopicChanged(availableSlots: v),
            ),
            AthleteNotificationToggleTile(
              icon: Icons.star_outline_rounded,
              title: 'Promoções e novidades',
              subtitle: 'Eventos, parcerias, descontos',
              value: prefs.topics.promotions,
              enabled: canEdit,
              onChanged: (v) => onTopicChanged(promotions: v),
              showDivider: false,
            ),
          ],
        ),
        SizedBox(height: AthleteSettingsTokens.sectionGap),
        AthleteSettingsGroup(
          sectionLabel: 'JANELA DE SILÊNCIO',
          children: [
            AthleteNotificationToggleTile(
              icon: Icons.bedtime_rounded,
              title: 'Não perturbe',
              subtitle: prefs.quietHours.enabled
                  ? prefs.quietHours.label
                  : 'Desativado',
              value: prefs.quietHours.enabled,
              enabled: canEdit,
              onChanged: onQuietHoursEnabled,
              onSubtitleTap: prefs.quietHours.enabled && canEdit
                  ? () => _openQuietHoursSheet(context)
                  : null,
              showDivider: false,
            ),
          ],
        ),
          ],
        ),
        if (ui.isSaving)
          Positioned(
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
    );
  }

  Future<void> _openQuietHoursSheet(BuildContext context) async {
    final result = await showQuietHoursTimeSheet(
      context: context,
      initialStart: ui.prefs.quietHours.start,
      initialEnd: ui.prefs.quietHours.end,
    );
    if (result == null) return;
    onQuietHoursRange(start: result.start, end: result.end);
  }
}
