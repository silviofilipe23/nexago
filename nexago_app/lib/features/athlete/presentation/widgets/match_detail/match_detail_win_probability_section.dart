import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../tournaments/domain/match_win_probability_providers.dart';
import '../../../domain/match_history/athlete_match_detail_models.dart';
import 'match_detail_section_header.dart';

/// Card "Probabilidade de vitória" pré-partida (rating técnico Glicko-2,
/// `athleteRatings/{uid}_{sportCode}`, cálculo 100% client-side). Só existe
/// quando a partida ainda não começou (fase `scheduled`, garantido pelo
/// chamador) e os dois lados têm rating não-provisional — regra dura: nunca
/// mostrar probabilidade com dado insuficiente, então este widget se
/// esconde silenciosamente (`SizedBox.shrink`) em qualquer outro caso.
class MatchDetailWinProbabilitySection extends ConsumerWidget {
  const MatchDetailWinProbabilitySection({super.key, required this.detail});

  final AthleteMatchDetail detail;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tournamentId = detail.tournamentId?.trim() ?? '';
    final ourTeamId = detail.ourTeam.teamId?.trim() ?? '';
    final opponentTeamId = detail.opponentTeam.teamId?.trim() ?? '';
    if (tournamentId.isEmpty || ourTeamId.isEmpty || opponentTeamId.isEmpty) {
      return const SizedBox.shrink();
    }

    final probabilityAsync = ref.watch(
      matchWinProbabilityProvider((
        tournamentId: tournamentId,
        teamAId: ourTeamId,
        teamBId: opponentTeamId,
      )),
    );
    final ourProbability = probabilityAsync.valueOrNull;
    if (ourProbability == null) return const SizedBox.shrink();

    final theme = Theme.of(context);
    final ourPercent = (ourProbability * 100).round().clamp(1, 99);
    final opponentPercent = 100 - ourPercent;

    // Padding próprio (em vez de um SizedBox externo no chamador) para que,
    // quando o widget se esconder (SizedBox.shrink), nenhum espaço vazio
    // sobre entre as seções.
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const MatchDetailSectionHeader(
            eyebrow: 'PRÉ-JOGO',
            title: 'Probabilidade de vitória',
          ),
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: context.themeColors.surfaceCard,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: context.themeColors.surfaceRaised),
            ),
            child: Column(
              children: [
                Row(
                  children: [
                    Expanded(
                      child: _ProbabilityColumn(
                        label: detail.ourTeam.label,
                        percent: ourPercent,
                        color: AppColors.win,
                        theme: theme,
                      ),
                    ),
                    Expanded(
                      child: _ProbabilityColumn(
                        label: detail.opponentTeam.label,
                        percent: opponentPercent,
                        color: AppColors.live,
                        theme: theme,
                        alignEnd: true,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: SizedBox(
                    height: 8,
                    child: Row(
                      children: [
                        Expanded(
                          flex: ourPercent,
                          child: const ColoredBox(color: AppColors.win),
                        ),
                        Expanded(
                          flex: opponentPercent,
                          child: const ColoredBox(color: AppColors.live),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  'Estimativa a partir do rating técnico atual — não considera forma recente.',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                    fontSize: 10,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ProbabilityColumn extends StatelessWidget {
  const _ProbabilityColumn({
    required this.label,
    required this.percent,
    required this.color,
    required this.theme,
    this.alignEnd = false,
  });

  final String label;
  final int percent;
  final Color color;
  final ThemeData theme;
  final bool alignEnd;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment:
          alignEnd ? CrossAxisAlignment.end : CrossAxisAlignment.start,
      children: [
        Text(
          '$percent%',
          style: theme.textTheme.headlineMedium?.copyWith(
            fontWeight: FontWeight.w900,
            color: color,
            height: 1,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          label,
          textAlign: alignEnd ? TextAlign.end : TextAlign.start,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: theme.textTheme.labelSmall?.copyWith(
            fontWeight: FontWeight.w800,
            color: context.themeColors.onSurfaceMuted,
            fontSize: 9,
            letterSpacing: 0.3,
          ),
        ),
      ],
    );
  }
}
