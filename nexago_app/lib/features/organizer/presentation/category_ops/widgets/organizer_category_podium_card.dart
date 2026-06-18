import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../tournaments/domain/tournament_discovery_models.dart';
import '../../../../tournaments/domain/tournament_match.dart';
import '../../../domain/category_ops/podium_logic.dart';

/// Pódio da categoria (campeão · vice · 3º) derivado do resultado das finais,
/// com o prêmio configurado ao lado quando houver. Renderiza nada enquanto a
/// final não estiver decidida.
class OrganizerCategoryPodiumCard extends StatelessWidget {
  const OrganizerCategoryPodiumCard({
    super.key,
    required this.categoryMatches,
    this.prizes = const [],
  });

  final List<TournamentMatch> categoryMatches;
  final List<TournamentCategoryPrize> prizes;

  String _nameFor(String? teamId) {
    final id = teamId?.trim() ?? '';
    if (id.isEmpty) return 'Dupla';
    for (final m in categoryMatches) {
      if (m.teamAId == id) {
        final d = m.teamADescription?.trim() ?? '';
        if (d.isNotEmpty) return d;
      }
      if (m.teamBId == id) {
        final d = m.teamBDescription?.trim() ?? '';
        if (d.isNotEmpty) return d;
      }
    }
    return id;
  }

  String? _prizeFor(String position) {
    for (final p in prizes) {
      if (p.position.trim() == position && p.value > 0) {
        return _formatReais(p.value);
      }
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final podium = computeCategoryPodiumFromMatches(categoryMatches);
    if (!podium.isDecided) return const SizedBox.shrink();

    return Container(
      margin: const EdgeInsets.fromLTRB(20, 16, 20, 4),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            AppColors.brand.withValues(alpha: 0.12),
            AppColors.brand.withValues(alpha: 0.02),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.25)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(Icons.emoji_events_rounded,
                  size: 18, color: AppColors.brand),
              const SizedBox(width: 8),
              Text(
                'PÓDIO DA CATEGORIA',
                style: AppTypography.mono(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  color: AppColors.brand,
                  letterSpacing: 0.8,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          _PodiumRow(
            medal: '🥇',
            place: 'Campeão',
            teamName: _nameFor(podium.championTeamId),
            prize: _prizeFor('1'),
            highlight: true,
          ),
          const SizedBox(height: 8),
          _PodiumRow(
            medal: '🥈',
            place: 'Vice',
            teamName: _nameFor(podium.runnerUpTeamId),
            prize: _prizeFor('2'),
          ),
          if (podium.thirdPlaceTeamId != null) ...[
            const SizedBox(height: 8),
            _PodiumRow(
              medal: '🥉',
              place: '3º lugar',
              teamName: _nameFor(podium.thirdPlaceTeamId),
              prize: _prizeFor('3'),
            ),
          ],
        ],
      ),
    );
  }
}

class _PodiumRow extends StatelessWidget {
  const _PodiumRow({
    required this.medal,
    required this.place,
    required this.teamName,
    this.prize,
    this.highlight = false,
  });

  final String medal;
  final String place;
  final String teamName;
  final String? prize;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(medal, style: const TextStyle(fontSize: 22)),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                place.toUpperCase(),
                style: AppTypography.mono(
                  fontSize: 9,
                  fontWeight: FontWeight.w700,
                  color: context.themeColors.onSurfaceMuted,
                  letterSpacing: 0.5,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                teamName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.soraRegular(
                  fontSize: highlight ? 15 : 14,
                  fontWeight: highlight ? FontWeight.w800 : FontWeight.w700,
                  color: context.themeColors.onSurface,
                ),
              ),
            ],
          ),
        ),
        if (prize != null) ...[
          const SizedBox(width: 10),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: AppColors.win.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              prize!,
              style: AppTypography.mono(
                fontSize: 12,
                fontWeight: FontWeight.w800,
                color: AppColors.win,
              ),
            ),
          ),
        ],
      ],
    );
  }
}

String _formatReais(double value) {
  if (value == value.roundToDouble()) {
    return 'R\$ ${value.toStringAsFixed(0)}';
  }
  return 'R\$ ${value.toStringAsFixed(2).replaceAll('.', ',')}';
}
