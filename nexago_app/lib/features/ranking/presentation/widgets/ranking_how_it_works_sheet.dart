import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../domain/ranking_constants.dart';

/// Folha "Como funciona o ranking" — explica como se ganha ponto e os dois
/// modos (Geral · soma total / Por ano · soma do ano). Conteúdo derivado das
/// constantes reais de pontuação para não divergir das regras.
Future<void> showRankingHowItWorksSheet(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: context.themeColors.surfaceSheet,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => const _RankingHowItWorksSheet(),
  );
}

class _RankingHowItWorksSheet extends StatelessWidget {
  const _RankingHowItWorksSheet();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: colors.onSurfaceMuted.withValues(alpha: 0.3),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 18),
            Text(
              'Como funciona o ranking',
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w800,
                color: colors.onSurface,
              ),
            ),
            const SizedBox(height: 18),
            _SectionLabel('PONTOS POR COLOCAÇÃO'),
            const SizedBox(height: 10),
            _PointsRow(place: '🥇 Campeão', points: getPointsForPlace(1)),
            _PointsRow(place: '🥈 Vice', points: getPointsForPlace(2)),
            _PointsRow(place: '🥉 3º lugar', points: getPointsForPlace(3)),
            _PointsRow(place: '4º lugar', points: getPointsForPlace(4)),
            for (final faixa in pointsLadderRanges.entries)
              _PointsRow(place: faixa.key, points: getPointsForPlace(faixa.value)),
            const SizedBox(height: 22),
            _SectionLabel('PESOS POR CATEGORIA'),
            const SizedBox(height: 10),
            for (final entry in categoryPresetWeights.entries)
              _WeightRow(category: entry.key, weight: entry.value),
            const _WeightRow(category: 'Outras categorias', weight: 1.0),
            const SizedBox(height: 8),
            Text(
              'No Livre, só pontua quem chega ao mata-mata. Chaves com menos '
              'de 8 duplas pagas pontuam reduzido.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: colors.onSurfaceMuted,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 22),
            _SectionLabel('MODOS DE CLASSIFICAÇÃO'),
            const SizedBox(height: 10),
            _ModeCard(
              title: 'Geral · soma total',
              description:
                  'Soma de todos os pontos que você conquistou no NexaGO.',
            ),
            const SizedBox(height: 10),
            _ModeCard(
              title: 'Por ano · soma do ano',
              description:
                  'Soma todos os pontos que você conquistou naquele ano.',
            ),
            const SizedBox(height: 22),
            Text(
              'Pontos vêm da sua colocação em torneios e etapas de liga. '
              'Ligas podem ajustar a tabela de pontos.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: colors.onSurfaceMuted,
                height: 1.4,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.label);
  final String label;

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: AppTypography.mono(
        fontSize: 11,
        fontWeight: FontWeight.w800,
        letterSpacing: 0.8,
        color: context.themeColors.onSurfaceMuted,
      ),
    );
  }
}

class _PointsRow extends StatelessWidget {
  const _PointsRow({required this.place, required this.points});
  final String place;
  final int points;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        children: [
          Expanded(
            child: Text(
              place,
              style: theme.textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w600,
                color: context.themeColors.onSurface,
              ),
            ),
          ),
          Text(
            '$points pts',
            style: AppTypography.mono(
              fontSize: 13,
              fontWeight: FontWeight.w800,
              color: AppColors.brand,
            ),
          ),
        ],
      ),
    );
  }
}

class _WeightRow extends StatelessWidget {
  const _WeightRow({required this.category, required this.weight});
  final String category;
  final double weight;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        children: [
          Expanded(
            child: Text(
              category,
              style: theme.textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w600,
                color: context.themeColors.onSurface,
              ),
            ),
          ),
          Text(
            '×$weight',
            style: AppTypography.mono(
              fontSize: 13,
              fontWeight: FontWeight.w800,
              color: AppColors.brand,
            ),
          ),
        ],
      ),
    );
  }
}

class _ModeCard extends StatelessWidget {
  const _ModeCard({required this.title, required this.description});
  final String title;
  final String description;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: colors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: theme.textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w800,
              color: colors.onSurface,
            ),
          ),
          const SizedBox(height: 3),
          Text(
            description,
            style: theme.textTheme.bodySmall?.copyWith(
              color: colors.onSurfaceMuted,
              height: 1.35,
            ),
          ),
        ],
      ),
    );
  }
}
