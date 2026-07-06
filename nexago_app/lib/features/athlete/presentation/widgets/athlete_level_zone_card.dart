import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../domain/athlete_rating.dart';

/// Indicador de zona da escada de níveis (engine de rating): mostra se o
/// atleta está estável, em zona de acesso (promoção) ou em zona de
/// reclassificação — ou consolidando, com poucas partidas rateadas.
/// Some quando a engine ainda não tem dados para o esporte.
class AthleteLevelZoneCard extends ConsumerWidget {
  const AthleteLevelZoneCard({super.key, required this.sportCode});

  /// Código Firestore do esporte (ex.: `VOLEI_PRAIA`).
  final String sportCode;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ratingAsync = ref.watch(athleteRatingProvider(sportCode));
    final rating = ratingAsync.valueOrNull;
    if (rating == null) return const SizedBox.shrink();

    final (icon, color, text) = _zoneVisual(context, rating);
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withValues(alpha: 0.25)),
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Row(
            children: [
              Icon(icon, size: 18, color: color),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  text,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: context.themeColors.onSurface,
                    height: 1.3,
                    fontSize: 12,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  (IconData, Color, String) _zoneVisual(
    BuildContext context,
    AthleteRating rating,
  ) {
    final games = rating.ratedMatches;
    final gamesLabel = games == 1 ? '1 partida rateada' : '$games partidas rateadas';

    if (rating.isProvisional) {
      return (
        Icons.hourglass_bottom_rounded,
        context.themeColors.onSurfaceMuted,
        'Consolidando seu nível: $gamesLabel de 10. Jogue torneios para a '
            'engine calibrar seu rating.',
      );
    }
    if (rating.ladderState == 'relegation_observation') {
      return (
        Icons.warning_amber_rounded,
        const Color(0xFFE85D04),
        'Zona de reclassificação: seus resultados recentes ficaram abaixo da '
            'faixa do seu nível. Recupere nos próximos torneios para manter.',
      );
    }
    if (rating.zone == 'promotion') {
      return (
        Icons.trending_up_rounded,
        const Color(0xFF2E7D32),
        'Zona de acesso: seus resultados estão acima da faixa do seu nível. '
            'Continue assim para subir!',
      );
    }
    if (rating.zone == 'relegation') {
      return (
        Icons.trending_down_rounded,
        const Color(0xFFE85D04),
        'Atenção: seu desempenho recente está no limite inferior do seu nível.',
      );
    }
    return (
      Icons.verified_outlined,
      context.themeColors.onSurfaceMuted,
      'Nível estável para seus resultados atuais ($gamesLabel).',
    );
  }
}
