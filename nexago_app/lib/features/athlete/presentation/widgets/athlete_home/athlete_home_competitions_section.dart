import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_theme_colors.dart';
import '../../../../tournaments/presentation/widgets/compete_hub/compete_hub_section_header.dart';
import '../../../domain/athlete_home_competitions_logic.dart';
import '../../../domain/athlete_home_competitions_providers.dart';
import '../../../domain/athlete_shell_providers.dart';
import '../../../../tournaments/domain/tournament_discovery_providers.dart';
import 'athlete_home_competition_carousel_tile.dart';

const _carouselHeight = 188.0;

class AthleteHomeCompetitionsSection extends ConsumerWidget {
  const AthleteHomeCompetitionsSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tournamentsAsync = ref.watch(discoveryTournamentsProvider);
    final leaguesAsync = ref.watch(discoveryLeaguesProvider);
    final preview = ref.watch(athleteHomeCompetitionsPreviewProvider);

    final isLoading = tournamentsAsync.isLoading || leaguesAsync.isLoading;
    final hasError = tournamentsAsync.hasError && leaguesAsync.hasError;

    if (isLoading) {
      return const _AthleteHomeCompetitionsSectionSkeleton();
    }

    if (hasError) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(
          'Não foi possível carregar torneios e ligas.',
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: context.themeColors.onSurfaceMuted,
              ),
        ),
      );
    }

    if (preview.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        CompeteHubSectionHeader(
          title: 'Torneios e ligas',
          actionLabel: 'VER TODOS',
          onActionTap: () {
            ref.read(athleteShellTabIndexProvider.notifier).state =
                athleteShellCompeteTabIndex;
          },
        ),
        SizedBox(height: 10),
        SizedBox(
          height: _carouselHeight,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: preview.length,
            separatorBuilder: (_, __) => SizedBox(width: 12),
            itemBuilder: (context, index) {
              final item = preview[index];
              return AthleteHomeCompetitionCarouselTile(
                title: item.title,
                subtitle: item.subtitle,
                sortDate: item.sortDate,
                imageUrl: item.imageUrl,
                onTap: () => _openItem(context, item),
              );
            },
          ),
        ),
      ],
    );
  }

  void _openItem(BuildContext context, AthleteHomeCompetitionItem item) {
    switch (item) {
      case AthleteHomeTournamentItem(:final tournament):
        context.pushNamed(
          AppRouteNames.tournamentDetail,
          pathParameters: {'tournamentId': tournament.id},
        );
      case AthleteHomeLeagueItem(:final league):
        context.pushNamed(
          AppRouteNames.leagueDetail,
          pathParameters: {'leagueId': league.id},
        );
    }
  }
}

class _AthleteHomeCompetitionsSectionSkeleton extends StatefulWidget {
  const _AthleteHomeCompetitionsSectionSkeleton();

  @override
  State<_AthleteHomeCompetitionsSectionSkeleton> createState() =>
      _AthleteHomeCompetitionsSectionSkeletonState();
}

class _AthleteHomeCompetitionsSectionSkeletonState
    extends State<_AthleteHomeCompetitionsSectionSkeleton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1100),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _pulse,
      builder: (context, _) {
        final t = Curves.easeInOut.transform(_pulse.value);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const CompeteHubSectionHeader(
              title: 'Torneios e ligas',
              actionLabel: 'VER TODOS',
            ),
            SizedBox(height: 10),
            SizedBox(
              height: _carouselHeight,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: 3,
                separatorBuilder: (_, __) => SizedBox(width: 12),
                itemBuilder: (_, __) =>
                    AthleteHomeCompetitionCarouselTileSkeleton(pulse: t),
              ),
            ),
          ],
        );
      },
    );
  }
}
