import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/weather_booking_rules.dart';
import '../../domain/weather_models.dart';
import '../weather_ui.dart';

/// Previsão de 2h antes a 2h depois do jogo, com as horas do jogo em destaque
/// (sem a janela do jogo, a pior hora).
class WeatherForecastStrip extends StatelessWidget {
  const WeatherForecastStrip({super.key, required this.hours, this.game});

  static const Key stripKey = ValueKey('weather-forecast-strip');

  final List<WeatherHour> hours;
  final ({DateTime start, DateTime end})? game;

  @override
  Widget build(BuildContext context) {
    final strip = weatherForecastStrip(hours, game: game);
    final anyInGame = strip.any((s) => s.inGame);
    final worst = anyInGame ? null : weatherWorstHourIndex(hours);
    return Row(
      key: stripKey,
      children: [
        for (var i = 0; i < strip.length; i++) ...[
          if (i > 0) const SizedBox(width: 6),
          Expanded(
            child: _ForecastCell(
              hour: strip[i].hour,
              highlighted: anyInGame ? strip[i].inGame : i == worst,
            ),
          ),
        ],
      ],
    );
  }
}

class _ForecastCell extends StatelessWidget {
  const _ForecastCell({required this.hour, required this.highlighted});

  final WeatherHour hour;
  final bool highlighted;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final p = hour.probability;
    final mm = hour.precipitationMm;
    final value = p != null
        ? WeatherCopy.percent(p)
        : mm != null
            ? WeatherCopy.millimeters(mm)
            : '—';
    // Jogo longo dá até 7 casas: o texto encolhe em vez de estourar.
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 2),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(10),
        color: highlighted
            ? WeatherTone.rain.withValues(alpha: 0.16)
            : colors.onSurface.withValues(alpha: 0.04),
      ),
      child: Column(
        children: [
          FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(
              value,
              style: AppTypography.mono(
                fontSize: 13,
                fontWeight: FontWeight.w800,
                color: WeatherTone.rainText(context),
              ),
            ),
          ),
          const SizedBox(height: 2),
          FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(
              hour.hourLabel,
              style: TextStyle(fontSize: 11, color: colors.onSurfaceMuted),
            ),
          ),
        ],
      ),
    );
  }
}
