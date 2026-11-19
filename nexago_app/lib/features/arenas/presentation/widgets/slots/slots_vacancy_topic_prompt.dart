import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../../athlete/domain/athlete_notification_preferences_providers.dart';
import '../../../../athlete/domain/athlete_profile_providers.dart';

/// Antes de criar um alerta de vaga: se o atleta desligou o tópico
/// "Horários disponíveis", pergunta se quer ligar (sem ele o aviso não chega).
/// Recusar não impede o alerta; só não liga o tópico.
Future<void> promptAvailableSlotsTopicIfOff(
  BuildContext context,
  WidgetRef ref,
) async {
  final profile = ref.read(athleteProfileProvider).valueOrNull;
  if (profile == null ||
      profile.notificationPreferences.topics.availableSlots) {
    return;
  }
  final enable = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      backgroundColor: context.themeColors.surfaceSheet,
      title: const Text('Ativar notificações de vagas?'),
      content: const Text(
        'Para avisar quando liberar, ative o tópico '
        '"Horários disponíveis" nas suas preferências.',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx, false),
          child: const Text('Agora não'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(ctx, true),
          child: const Text('Ativar'),
        ),
      ],
    ),
  );
  if (enable != true) return;
  final notifier = ref.read(athleteNotificationPreferencesProvider.notifier);
  notifier.setTopic(availableSlots: true);
  await notifier.saveNow();
}
