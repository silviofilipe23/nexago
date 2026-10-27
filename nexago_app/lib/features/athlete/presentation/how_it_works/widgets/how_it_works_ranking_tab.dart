import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../../ranking/domain/ranking_constants.dart';
import '../../../../ranking/domain/ranking_providers.dart';
import '../../../../tournaments/domain/compete_hub_models.dart';
import '../../../domain/athlete_profile_providers.dart';
import '../../../domain/athlete_sports_levels_mapper.dart';
import '../../../domain/how_it_works/how_it_works_rules.dart';
import 'how_it_works_parts.dart';

/// Aba "Ranking": a posição do atleta, a tabela de pontos por resultado (no
/// peso da categoria escolhida, que abre no nível dele) e as regras que
/// mexem nos pontos.
class HowItWorksRankingTab extends ConsumerStatefulWidget {
  const HowItWorksRankingTab({super.key, this.showRankingLink = true});

  final bool showRankingLink;

  @override
  ConsumerState<HowItWorksRankingTab> createState() =>
      _HowItWorksRankingTabState();
}

class _HowItWorksRankingTabState extends ConsumerState<HowItWorksRankingTab> {
  String? _preset;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final ranking = ref.watch(competeHubUserRankingProvider);
    final profile = ref.watch(athleteProfileProvider).valueOrNull;
    final enrollments = profile == null
        ? const <AthleteSportEnrollment>[]
        : AthleteSportsLevelsMapper.fromProfile(profile);
    final preset = _preset ??
        howItWorksPresetForLevel(
          enrollments.isEmpty ? profile?.level : enrollments.first.levelLabel,
        );
    final weight = howItWorksPresetWeight(preset);
    final rows = howItWorksPointsTable(weight);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _RankingHero(ranking: ranking),
        const SizedBox(height: 20),
        HowItWorksSection(
          title: 'Pontos por resultado em torneio',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final p in howItWorksRankingPresets)
                    HowItWorksChoicePill(
                      label: p,
                      selected: p == preset,
                      onTap: () => setState(() => _preset = p),
                    ),
                ],
              ),
              const SizedBox(height: 10),
              HowItWorksCard(
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 2,
                ),
                child: Column(
                  children: [
                    for (final row in rows)
                      HowItWorksValueRow(
                        title: row.label,
                        subtitle: row.detail,
                        value: '+${row.points} pts',
                        valueColor:
                            row == rows.first ? colors.win : colors.onSurface,
                        last: row == rows.last,
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Categoria $preset (${formatRankingWeight(weight)}), chave '
                'com $fullBracketMinPaidTeams ou mais duplas pagas.',
                style: theme.textTheme.bodySmall?.copyWith(
                  fontSize: 11.5,
                  color: colors.onSurfaceMuted,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        HowItWorksSection(
          title: 'Regras',
          child: HowItWorksCard(
            child: Column(
              children: [
                const HowItWorksStep(
                  number: 1,
                  title: 'Categoria mais forte vale mais',
                  subtitle:
                      'O peso muda a tabela acima. No Livre, o peso é medido '
                      'pela força das duplas inscritas.',
                ),
                HowItWorksStep(
                  number: 2,
                  title: 'Chave pequena vale menos',
                  subtitle: howItWorksBracketSizeRule(),
                ),
                const HowItWorksStep(
                  number: 3,
                  title: 'Torneio precisa de $minPaidTeamsForGlobalRanking '
                      'duplas pagas',
                  subtitle:
                      'Abaixo disso, o torneio avulso não entra no ranking. '
                      'Etapas de liga sempre entram.',
                ),
                const HowItWorksStep(
                  number: 4,
                  title: 'Nenhum resultado é descartado',
                  subtitle:
                      'O ranking geral soma todos os seus pontos; a temporada '
                      'soma os do ano.',
                  last: true,
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),
        const HowItWorksNote(
          'Partidas casuais e reservas dão XP, não pontos de ranking. Beach '
          'tennis ainda não pontua no ranking geral, e ligas podem ter tabela '
          'própria.',
        ),
        if (widget.showRankingLink) ...[
          const SizedBox(height: 20),
          HowItWorksLinkButton(
            label: 'Ver ranking completo',
            onPressed: () => context.pushNamed(AppRouteNames.athleteRanking),
          ),
        ],
      ],
    );
  }
}

class _RankingHero extends StatelessWidget {
  const _RankingHero({required this.ranking});

  final AsyncValue<CompeteHubUserRanking?> ranking;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final value = ranking.valueOrNull;
    final ranked = value != null && !value.isUnranked && value.rank > 0;
    final points = value == null
        ? null
        : '${NumberFormat.decimalPattern('pt_BR').format(value.points)} pts';

    final String detail;
    if (ranking.isLoading && value == null) {
      detail = 'Carregando sua posição…';
    } else if (!ranked) {
      detail = 'Você ainda não pontuou. O primeiro torneio que pontua já te '
          'coloca na lista.';
    } else {
      final count = value.tournamentsCount;
      detail = count == 1 ? '1 torneio pontuado' : '$count torneios pontuados';
    }

    return HowItWorksCard(
      tint: AppColors.brand,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text(
                ranked ? value.rankLabel : '—',
                style: AppTypography.soraRegular(
                  fontSize: 34,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -1,
                  color: colors.brandText,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    HowItWorksKicker(
                      ranked ? value.seasonLabel : 'Seu ranking',
                      color: colors.brandText,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      detail,
                      style: theme.textTheme.bodySmall?.copyWith(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                        color: colors.onSurface,
                      ),
                    ),
                  ],
                ),
              ),
              if (ranked && points != null) ...[
                const SizedBox(width: 8),
                Text(
                  points,
                  style: AppTypography.mono(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 12),
          Text(
            'Seus pontos são seus: mudou de nível, eles vão junto. No ranking '
            'completo dá pra ver por esporte e filtrar por gênero e nível.',
            style: theme.textTheme.bodySmall?.copyWith(
              fontSize: 12.5,
              height: 1.45,
              color: colors.onSurfaceMuted,
            ),
          ),
        ],
      ),
    );
  }
}
