import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../application/weather_providers.dart';
import '../../domain/weather_booking_rules.dart';
import '../weather_ui.dart';
import 'weather_forecast_strip.dart';

/// Previsão do tempo em toda reserva de pé, chovendo ou não: de 2h antes a
/// 2h depois do jogo, para o atleta acompanhar. Mais de 14 dias antes do jogo
/// só diz quando a previsão chega (sem chamar o servidor). Sem previsão
/// (arena sem coordenadas, provedor fora), não aparece.
class BookingForecastCard extends ConsumerWidget {
  const BookingForecastCard({
    super.key,
    required this.bookingId,
    required this.game,
    required this.now,
  });

  static const Key cardKey = ValueKey('booking-forecast');

  final String bookingId;
  final ({DateTime start, DateTime end}) game;
  final DateTime now;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final availableFrom = weatherForecastAvailableFrom(game.start);
    if (now.isBefore(availableFrom)) return _TooEarly(availableFrom);

    final forecast =
        ref.watch(bookingWeatherForecastProvider(bookingId)).valueOrNull;
    if (forecast == null) return const SizedBox.shrink();
    if (forecast.availableFrom case final from?) return _TooEarly(from);
    if (forecast.hours.isEmpty) return const SizedBox.shrink();

    final colors = context.themeColors;
    final theme = Theme.of(context);
    final hours = forecast.hours;
    final outlook = weatherForecastOutlook(hours, game: game)?.outlook;
    final subtitle = weatherForecastSubtitle(hours, game: game);
    final fetchedAt = forecast.fetchedAt;
    final rainy = outlook != null && outlook != WeatherOutlook.dry;

    return _Shell(
      icon: rainy
          ? WeatherRainIcon(
              size: 22,
              strokeWidth: 2,
              color: WeatherTone.rainText(context),
            )
          : Icon(Icons.wb_sunny_outlined, size: 22, color: colors.pending),
      iconBackground: rainy
          ? WeatherTone.rain.withValues(alpha: 0.16)
          : AppColors.pending.withValues(alpha: 0.16),
      children: [
        Text(
          weatherForecastHeadline(hours, game: game),
          style: AppTypography.soraRegular(
            fontSize: 16,
            fontWeight: FontWeight.w700,
            color: colors.onSurface,
          ),
        ),
        if (subtitle != null) ...[
          const SizedBox(height: 2),
          Text(
            subtitle,
            style: theme.textTheme.bodySmall
                ?.copyWith(color: colors.onSurfaceMuted),
          ),
        ],
      ],
      footer: [
        const SizedBox(height: 14),
        WeatherForecastStrip(hours: hours, game: game),
        const SizedBox(height: 10),
        Text(
          fetchedAt == null
              ? 'Previsão da ${forecast.sourceLabel}'
              : 'Previsão da ${forecast.sourceLabel} · atualizada às '
                  '${WeatherCopy.time(fetchedAt)}',
          style: theme.textTheme.bodySmall?.copyWith(
            color: colors.onSurfaceMuted,
            fontSize: 11,
          ),
        ),
      ],
    );
  }
}

class _TooEarly extends StatelessWidget {
  const _TooEarly(this.availableFrom);

  final DateTime availableFrom;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return _Shell(
      icon:
          Icon(Icons.schedule_rounded, size: 22, color: colors.onSurfaceMuted),
      iconBackground: colors.onSurface.withValues(alpha: 0.06),
      children: [
        Text(
          'A previsão aparece a partir de '
          '${WeatherCopy.dayLongMonth(availableFrom)}, 14 dias antes do jogo.',
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: colors.onSurfaceMuted,
                height: 1.4,
              ),
        ),
      ],
    );
  }
}

class _Shell extends StatelessWidget {
  const _Shell({
    required this.icon,
    required this.iconBackground,
    required this.children,
    this.footer = const [],
  });

  final Widget icon;
  final Color iconBackground;
  final List<Widget> children;
  final List<Widget> footer;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Padding(
      key: BookingForecastCard.cardKey,
      padding: const EdgeInsets.only(top: 14),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: colors.surfaceCard,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: colors.onSurface.withValues(alpha: 0.08)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                WeatherIconTile(background: iconBackground, child: icon),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const WeatherKicker('Previsão do tempo'),
                      const SizedBox(height: 4),
                      ...children,
                    ],
                  ),
                ),
              ],
            ),
            ...footer,
          ],
        ),
      ),
    );
  }
}
