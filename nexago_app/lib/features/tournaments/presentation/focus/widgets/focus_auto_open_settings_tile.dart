import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../athlete/presentation/widgets/athlete_settings/athlete_settings_group.dart';
import '../../../data/focus_auto_open_preference.dart';

/// Chave das Configurações: entrar sozinho no Modo Focus no dia do torneio.
class FocusAutoOpenSettingsTile extends ConsumerWidget {
  const FocusAutoOpenSettingsTile({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final enabled = ref.watch(focusAutoOpenPreferenceProvider).valueOrNull;
    return AthleteSettingsToggleTile(
      key: const Key('athlete-settings-focus-auto-open'),
      icon: Icons.local_fire_department_rounded,
      title: 'Abrir o Modo Focus sozinho',
      subtitle: 'No dia do torneio, o app já abre no Focus. Desligado, você '
          'entra pelo card na Início.',
      value: enabled ?? false,
      // Antes de carregar, a chave não mexe: evita gravar por cima do valor
      // salvo que ainda está chegando.
      onChanged: enabled == null
          ? null
          : (value) =>
              ref.read(focusAutoOpenPreferenceProvider.notifier).set(value),
    );
  }
}
