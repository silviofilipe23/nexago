import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../athlete/presentation/widgets/athlete_settings/athlete_settings_group.dart';
import '../../application/weather_providers.dart';
import '../weather_ui.dart';

/// Tile "Créditos de chuva" nos ajustes, ao lado do cashback. Só aparece
/// quando o atleta já teve algum crédito; a tela segue alcançável pelo push.
class WeatherCreditsSettingsTile extends ConsumerWidget {
  const WeatherCreditsSettingsTile({super.key, this.onTap});

  /// Injetável para teste; em produção abre `/weather-credits`.
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(hasWeatherCreditsProvider)) return const SizedBox.shrink();
    final balances = ref.watch(weatherCreditBalancesProvider);
    final cents = balances.fold<int>(
      0,
      (sum, b) => sum + (b.balanceReais * 100).round(),
    );
    return AthleteSettingsTile(
      key: const Key('athlete-settings-weather-credits'),
      icon: Icons.umbrella_outlined,
      title: 'Créditos de chuva',
      subtitle: cents > 0
          ? '${WeatherCopy.money(cents / 100)} para usar nas arenas'
          : 'Usados ou vencidos',
      variant: AthleteSettingsIconVariant.neutral,
      onTap:
          onTap ?? () => context.pushNamed(AppRouteNames.athleteWeatherCredits),
      showDivider: true,
    );
  }
}
