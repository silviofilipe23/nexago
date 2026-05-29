import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/athlete_public_profile_models.dart';
import '../../../domain/athlete_public_profile_providers.dart';
import '../../../domain/match_history/athlete_match_history_logic.dart';
import '../../widgets/athlete_profile_avatar.dart';
import '../../widgets/match_history/match_history_match_card.dart';

enum PublicProfileTab { overview, matches, achievements }

class PublicProfileTabBar extends StatelessWidget {
  const PublicProfileTabBar({
    super.key,
    required this.selected,
    required this.onChanged,
  });

  final PublicProfileTab selected;
  final ValueChanged<PublicProfileTab> onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
      child: Row(
        children: [
          _TabChip(
            label: 'Visão geral',
            selected: selected == PublicProfileTab.overview,
            onTap: () => onChanged(PublicProfileTab.overview),
          ),
          const SizedBox(width: 8),
          _TabChip(
            label: 'Partidas',
            selected: selected == PublicProfileTab.matches,
            onTap: () => onChanged(PublicProfileTab.matches),
          ),
          const SizedBox(width: 8),
          _TabChip(
            label: 'Conquistas',
            selected: selected == PublicProfileTab.achievements,
            onTap: () => onChanged(PublicProfileTab.achievements),
          ),
        ],
      ),
    );
  }
}

class _TabChip extends StatelessWidget {
  const _TabChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AppColors.onSurface : AppColors.surfaceCard,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          child: Text(
            label,
            style: AppTypography.soraRegular(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: selected ? AppColors.canvas : AppColors.onSurfaceMuted,
            ),
          ),
        ),
      ),
    );
  }
}

class PublicProfileOverviewTab extends StatelessWidget {
  const PublicProfileOverviewTab({
    super.key,
    required this.ranking,
    required this.partners,
    this.onPartnerTap,
  });

  final AthletePublicRankingSnapshot ranking;
  final List<AthletePublicPartnerEntry> partners;
  final ValueChanged<String>? onPartnerTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Temporada ${ranking.seasonYear ?? DateTime.now().year}',
            style: AppTypography.soraRegular(
              fontSize: 16,
              fontWeight: FontWeight.w800,
              color: AppColors.onSurface,
            ),
          ),
          const SizedBox(height: 12),
          _RankingSeasonCard(ranking: ranking),
          if (partners.isNotEmpty) ...[
            const SizedBox(height: 24),
            Text(
              'Dupla',
              style: AppTypography.soraRegular(
                fontSize: 16,
                fontWeight: FontWeight.w800,
                color: AppColors.onSurface,
              ),
            ),
            const SizedBox(height: 12),
            for (final partner in partners.take(3))
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _PartnerCard(
                  partner: partner,
                  onTap: onPartnerTap == null
                      ? null
                      : () => onPartnerTap!(partner.userId),
                ),
              ),
          ],
        ],
      ),
    );
  }
}

class _RankingSeasonCard extends StatelessWidget {
  const _RankingSeasonCard({required this.ranking});

  final AthletePublicRankingSnapshot ranking;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.surfaceRaised),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'EVOLUÇÃO RANKING',
                      style: AppTypography.mono(
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                        color: AppColors.onSurfaceMuted,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text.rich(
                      TextSpan(
                        children: [
                          if (ranking.hasRank)
                            TextSpan(
                              text: '#${ranking.rank}',
                              style: AppTypography.soraRegular(
                                fontSize: 22,
                                fontWeight: FontWeight.w800,
                                color: AppColors.brand,
                              ),
                            )
                          else
                            TextSpan(
                              text: 'Sem posição',
                              style: AppTypography.soraRegular(
                                fontSize: 16,
                                fontWeight: FontWeight.w700,
                                color: AppColors.onSurfaceMuted,
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    'PONTOS',
                    style: AppTypography.mono(
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                      color: AppColors.onSurfaceMuted,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    '${ranking.points}',
                    style: AppTypography.soraRegular(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                      color: AppColors.onSurface,
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              _MiniStat(value: '${ranking.tournamentsCount}', label: 'TORNEIOS'),
              const SizedBox(width: 12),
              if (ranking.hasRank)
                _MiniStat(value: '#${ranking.rank}', label: 'POSIÇÃO'),
            ],
          ),
        ],
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  const _MiniStat({required this.value, required this.label});

  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
        decoration: BoxDecoration(
          color: AppColors.surfaceRaised.withValues(alpha: 0.35),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              value,
              style: AppTypography.soraRegular(
                fontSize: 16,
                fontWeight: FontWeight.w800,
                color: AppColors.onSurface,
              ),
            ),
            Text(
              label,
              style: AppTypography.mono(
                fontSize: 9,
                fontWeight: FontWeight.w600,
                color: AppColors.onSurfaceMuted,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PartnerCard extends StatelessWidget {
  const _PartnerCard({required this.partner, this.onTap});

  final AthletePublicPartnerEntry partner;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surfaceCard,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.surfaceRaised),
          ),
          child: Row(
            children: [
              AthleteProfileAvatar(
                size: 48,
                initials: partner.initials,
                imageUrl: partner.avatarUrl,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      partner.name,
                      style: AppTypography.soraRegular(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: AppColors.onSurface,
                      ),
                    ),
                    if (partner.subtitle.isNotEmpty)
                      Text(
                        partner.subtitle,
                        style: AppTypography.soraRegular(
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                          color: AppColors.onSurfaceMuted,
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class PublicProfilePlaceholderTab extends StatelessWidget {
  const PublicProfilePlaceholderTab({super.key, required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(32),
      child: Text(
        message,
        textAlign: TextAlign.center,
        style: AppTypography.soraRegular(
          fontSize: 14,
          fontWeight: FontWeight.w500,
          color: AppColors.onSurfaceMuted,
        ),
      ),
    );
  }
}

class PublicProfileMatchesTab extends ConsumerWidget {
  const PublicProfileMatchesTab({
    super.key,
    required this.userId,
    this.onMatchTap,
  });

  final String userId;
  final ValueChanged<String>? onMatchTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final historyAsync = ref.watch(athletePublicMatchHistoryProvider(userId));

    return historyAsync.when(
      loading: () => const Padding(
        padding: EdgeInsets.symmetric(vertical: 32),
        child: Center(
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
      ),
      error: (_, __) => const PublicProfilePlaceholderTab(
        message: 'Não foi possível carregar as partidas.',
      ),
      data: (bundle) {
        if (bundle.matches.isEmpty) {
          return const PublicProfilePlaceholderTab(
            message: 'Nenhuma partida de torneio registrada.',
          );
        }

        final monthGroups = groupMatchesByMonth(bundle.matches);
        return Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final group in monthGroups) ...[
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text(
                    group.title,
                    style: AppTypography.soraRegular(
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                      color: AppColors.onSurface,
                    ),
                  ),
                ),
                for (final match in group.matches)
                  MatchHistoryMatchCard(
                    match: match,
                    compact: true,
                    onTap: onMatchTap == null
                        ? null
                        : () => onMatchTap!(match.id),
                  ),
              ],
            ],
          ),
        );
      },
    );
  }
}
