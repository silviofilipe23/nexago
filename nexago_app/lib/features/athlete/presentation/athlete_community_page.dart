import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/layout/nexa_bottom_nav_bar.dart';
import '../../../core/layout/nexa_floating_header.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/nexa_card.dart';
import '../../../core/ui/nexa_skeleton.dart';
import '../../ranking/domain/ranking_providers.dart';
import '../../tournaments/presentation/widgets/compete_hub/compete_hub_ranking_row.dart';
import '../domain/athlete_shell_providers.dart';
import 'widgets/community/community_feed_section.dart';

/// Aba Comunidade no padrão do painel do portal web: feed automático primeiro
/// (aberturas de inscrição e campeões), "Ranking em destaque" como card
/// depois — a posição do atleta vive destacada dentro do próprio card.
class AthleteCommunityPage extends ConsumerWidget {
  const AthleteCommunityPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bottomClearance =
        nexaBottomNavBarHeight() +
        MediaQuery.viewPaddingOf(context).bottom +
        16;

    return CustomScrollView(
      controller: ref
          .watch(athleteShellScrollRegistryProvider)
          .controllerFor(athleteShellCommunityTabIndex),
      slivers: [
        NexaFloatingHeaderSliver(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenH),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Comunidade',
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.5,
                  color: context.themeColors.onSurface,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                'O QUE ESTÁ ROLANDO NOS ESPORTES DE AREIA',
                style: AppTypography.eyebrow.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
            ],
          ),
        ),
        SliverPadding(
          padding: EdgeInsets.fromLTRB(
            AppSpacing.screenH,
            AppSpacing.sm,
            AppSpacing.screenH,
            bottomClearance,
          ),
          sliver: SliverList.list(
            children: const [
              CommunityFeedSection(),
              SizedBox(height: AppSpacing.sectionGap),
              _CommunityRankingCard(),
            ],
          ),
        ),
      ],
    );
  }
}

/// Card "Ranking em destaque" (paridade com o portal): kicker de temporada,
/// top 10 com a linha do atleta destacada — e apensada quando fora do top.
class _CommunityRankingCard extends ConsumerWidget {
  const _CommunityRankingCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final entriesAsync = ref.watch(communityRankingEntriesProvider);
    final snapshotAsync = ref.watch(hubAthleteRankingSnapshotProvider);
    final colors = context.themeColors;

    final kicker = snapshotAsync.valueOrNull?.isSeasonMode == true
        ? 'TEMPORADA ${snapshotAsync.valueOrNull?.seasonYear}'
        : 'RANKING GERAL';

    return NexaCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      kicker,
                      style: AppTypography.eyebrow
                          .copyWith(color: colors.onSurfaceMuted),
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      'Ranking em destaque',
                      style: AppTypography.titleM
                          .copyWith(color: colors.onSurface),
                    ),
                  ],
                ),
              ),
              TextButton(
                onPressed: () =>
                    context.pushNamed(AppRouteNames.athleteRanking),
                style: TextButton.styleFrom(
                  foregroundColor: AppColors.brand,
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.sm,
                    vertical: AppSpacing.xs,
                  ),
                  minimumSize: Size.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: const Text('Ver ranking'),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          entriesAsync.when(
            loading: () => const Padding(
              padding: EdgeInsets.symmetric(vertical: AppSpacing.sm),
              child: Column(
                children: [
                  NexaSkeleton(height: 44, radius: AppRadii.smAll),
                  SizedBox(height: AppSpacing.sm),
                  NexaSkeleton(height: 44, radius: AppRadii.smAll),
                  SizedBox(height: AppSpacing.sm),
                  NexaSkeleton(height: 44, radius: AppRadii.smAll),
                ],
              ),
            ),
            error: (_, _) => Padding(
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
              child: Text(
                'Não foi possível carregar o ranking.',
                style: AppTypography.bodyS
                    .copyWith(color: colors.onSurfaceMuted),
              ),
            ),
            data: (entries) {
              if (entries.isEmpty) {
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
                  child: Text(
                    'Ranking ainda sem pontuações — ele aparece aqui após os '
                    'primeiros resultados oficiais.',
                    style: AppTypography.bodyS
                        .copyWith(color: colors.onSurfaceMuted),
                  ),
                );
              }
              return Column(
                children: [
                  for (final entry in entries)
                    CompeteHubRankingRow(entry: entry),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}
