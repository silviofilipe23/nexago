import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/layout/nexa_bottom_nav_bar.dart';
import '../../../core/layout/nexa_floating_header.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../ranking/domain/ranking_providers.dart';
import '../../tournaments/presentation/widgets/compete_hub/compete_hub_ranking_card.dart';
import '../../tournaments/presentation/widgets/compete_hub/compete_hub_ranking_row.dart';
import '../../tournaments/presentation/widgets/compete_hub/compete_hub_section_header.dart';
import '../../friendly_match/presentation/widgets/friendly_match_summary_card.dart';
import '../domain/athlete_shell_providers.dart';
import 'widgets/community/community_feed_section.dart';

/// Aba Comunidade — v1: ranking em destaque (top 10 + posição do atleta).
class AthleteCommunityPage extends ConsumerWidget {
  const AthleteCommunityPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final userRankingAsync = ref.watch(competeHubUserRankingProvider);
    final entriesAsync = ref.watch(communityRankingEntriesProvider);
    final snapshotAsync = ref.watch(hubAthleteRankingSnapshotProvider);
    final bottomClearance =
        nexaBottomNavBarHeight() +
        MediaQuery.viewPaddingOf(context).bottom +
        16;

    final seasonLabel = snapshotAsync.valueOrNull?.isSeasonMode == true
        ? 'TOP 10 · TEMPORADA ${snapshotAsync.valueOrNull?.seasonYear}'
        : 'TOP 10 · RANKING GERAL';

    return CustomScrollView(
      controller: ref
          .watch(athleteShellScrollRegistryProvider)
          .controllerFor(athleteShellCommunityTabIndex),
      slivers: [
        NexaFloatingHeaderSliver(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'NEXAGO',
                style: AppTypography.mono(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  color: AppColors.brand,
                  letterSpacing: 0.8,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Comunidade',
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.5,
                  color: context.themeColors.onSurface,
                ),
              ),
            ],
          ),
        ),
        SliverPadding(
          padding: EdgeInsets.fromLTRB(20, 8, 20, bottomClearance),
          sliver: SliverList.list(
            children: [
              // Bora Jogar — some sozinho quando o recurso está desligado.
              // const FriendlyMatchSummaryCard(
              //   margin: EdgeInsets.only(bottom: 20),
              // ),
              userRankingAsync.maybeWhen(
                data: (ranking) => ranking == null
                    ? const SizedBox.shrink()
                    : Padding(
                        padding: const EdgeInsets.only(bottom: 20),
                        child: CompeteHubRankingCard(ranking: ranking),
                      ),
                orElse: () => const SizedBox.shrink(),
              ),
              CompeteHubSectionHeader(
                title: 'Ranking em destaque',
                actionLabel: 'VER COMPLETO',
                onActionTap: () =>
                    context.pushNamed(AppRouteNames.athleteRanking),
              ),
              const SizedBox(height: 4),
              Text(
                seasonLabel,
                style: AppTypography.mono(
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  color: context.themeColors.onSurfaceMuted,
                  letterSpacing: 1,
                ),
              ),
              const SizedBox(height: 10),
              entriesAsync.when(
                loading: () => const _CommunityRankingLoading(),
                error: (_, _) => const _CommunityRankingMessage(
                  'Não foi possível carregar o ranking.',
                ),
                data: (entries) {
                  if (entries.isEmpty) {
                    return const _CommunityRankingMessage(
                      'O ranking aparece aqui após os primeiros resultados '
                      'oficiais da temporada.',
                    );
                  }
                  return Container(
                    padding: const EdgeInsets.symmetric(
                      vertical: 6,
                      horizontal: 12,
                    ),
                    decoration: BoxDecoration(
                      color: context.themeColors.surfaceCard,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: context.themeColors.surfaceRaised,
                      ),
                    ),
                    child: Column(
                      children: [
                        for (final entry in entries)
                          CompeteHubRankingRow(entry: entry),
                      ],
                    ),
                  );
                },
              ),
              const SizedBox(height: 16),
              OutlinedButton.icon(
                onPressed: () =>
                    context.pushNamed(AppRouteNames.athleteRanking),
                icon: const Icon(Icons.leaderboard_rounded, size: 18),
                label: const Text('Ver ranking completo'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.brand,
                  side: BorderSide(
                    color: AppColors.brand.withValues(alpha: 0.55),
                  ),
                  minimumSize: const Size.fromHeight(46),
                ),
              ),
              const CommunityFeedSection(),
            ],
          ),
        ),
      ],
    );
  }
}

class _CommunityRankingLoading extends StatelessWidget {
  const _CommunityRankingLoading();

  @override
  Widget build(BuildContext context) {
    return const SizedBox(
      height: 220,
      child: Center(child: CircularProgressIndicator(color: AppColors.brand)),
    );
  }
}

class _CommunityRankingMessage extends StatelessWidget {
  const _CommunityRankingMessage(this.message);

  final String message;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: Text(
        message,
        style: TextStyle(color: context.themeColors.onSurfaceMuted),
      ),
    );
  }
}
