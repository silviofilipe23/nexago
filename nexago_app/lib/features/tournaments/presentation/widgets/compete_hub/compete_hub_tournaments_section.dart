import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/compete_hub_providers.dart';
import '../../../domain/tournament_discovery_providers.dart';
import '../competition_carousel/competition_carousel_strip.dart';
import '../competition_carousel/competition_carousel_tile.dart';
import 'compete_hub_section_header.dart';

class CompeteHubTournamentsSection extends ConsumerWidget {
  const CompeteHubTournamentsSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final preview = ref.watch(competeHubTournamentPreviewProvider);
    final tournamentsAsync = ref.watch(discoveryTournamentsProvider);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: competitionCarouselHorizontalPadding,
          ),
          child: CompeteHubSectionHeader(
            title: 'Torneios',
            actionLabel: 'VER TODOS',
            onActionTap: () => context.pushNamed(
              AppRouteNames.tournamentDiscoveryList,
            ),
          ),
        ),
        SizedBox(height: 10),
        tournamentsAsync.when(
          loading: () => const _CompeteHubTournamentsSectionSkeleton(),
          error: (_, __) => Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: competitionCarouselHorizontalPadding,
            ),
            child: SizedBox(
              height: 80,
              child: Center(
                child: Text(
                  'Não foi possível carregar torneios.',
                  style: TextStyle(color: context.themeColors.onSurfaceMuted),
                ),
              ),
            ),
          ),
          data: (_) {
            if (preview.isEmpty) {
              return Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: competitionCarouselHorizontalPadding,
                  vertical: 16,
                ),
                child: Text(
                  'Nenhum torneio disponível no momento.',
                  style: TextStyle(color: context.themeColors.onSurfaceMuted),
                ),
              );
            }
            return CompetitionCarouselStrip(
              itemCount: preview.length,
              itemBuilder: (context, index) {
                final tournament = preview[index];
                final imageUrl = tournament.imageUrl?.trim();
                return CompetitionCarouselTile(
                  title: tournament.name,
                  subtitle: tournament.city,
                  sortDate: tournament.startDate,
                  imageUrl: imageUrl != null && imageUrl.isNotEmpty
                      ? imageUrl
                      : null,
                  onTap: () => context.pushNamed(
                    AppRouteNames.tournamentDetail,
                    pathParameters: {'tournamentId': tournament.id},
                  ),
                );
              },
            );
          },
        ),
      ],
    );
  }
}

class _CompeteHubTournamentsSectionSkeleton extends StatefulWidget {
  const _CompeteHubTournamentsSectionSkeleton();

  @override
  State<_CompeteHubTournamentsSectionSkeleton> createState() =>
      _CompeteHubTournamentsSectionSkeletonState();
}

class _CompeteHubTournamentsSectionSkeletonState
    extends State<_CompeteHubTournamentsSectionSkeleton>
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
        return CompetitionCarouselStrip(
          physics: const NeverScrollableScrollPhysics(),
          itemCount: 3,
          itemBuilder: (_, __) => CompetitionCarouselTileSkeleton(pulse: t),
        );
      },
    );
  }
}
