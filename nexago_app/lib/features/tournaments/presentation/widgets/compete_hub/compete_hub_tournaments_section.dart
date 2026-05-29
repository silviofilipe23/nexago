import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../domain/compete_hub_providers.dart';
import '../../../domain/tournament_discovery_providers.dart';
import 'compete_hub_section_header.dart';
import 'tournament_discovery_hub_tile.dart';

class CompeteHubTournamentsSection extends ConsumerWidget {
  const CompeteHubTournamentsSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final preview = ref.watch(competeHubTournamentPreviewProvider);
    final tournamentsAsync = ref.watch(discoveryTournamentsProvider);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        CompeteHubSectionHeader(
          title: 'Torneios',
          actionLabel: 'VER TODOS',
          onActionTap: () => context.pushNamed(
            AppRouteNames.tournamentDiscoveryList,
          ),
        ),
        const SizedBox(height: 10),
        tournamentsAsync.when(
          loading: () => const SizedBox(
            height: TournamentDiscoveryHubTile.tileHeight,
            child: Center(
              child: CircularProgressIndicator(color: AppColors.brand),
            ),
          ),
          error: (_, __) => const SizedBox(
            height: 80,
            child: Center(
              child: Text(
                'Não foi possível carregar torneios.',
                style: TextStyle(color: AppColors.onSurfaceMuted),
              ),
            ),
          ),
          data: (_) {
            if (preview.isEmpty) {
              return const Padding(
                padding: EdgeInsets.symmetric(vertical: 16),
                child: Text(
                  'Nenhum torneio disponível no momento.',
                  style: TextStyle(color: AppColors.onSurfaceMuted),
                ),
              );
            }
            return SizedBox(
              height: TournamentDiscoveryHubTile.tileHeight,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: preview.length,
                separatorBuilder: (_, __) => const SizedBox(width: 10),
                itemBuilder: (context, index) {
                  final tournament = preview[index];
                  return TournamentDiscoveryHubTile(
                    tournament: tournament,
                    onTap: () => context.pushNamed(
                      AppRouteNames.tournamentDetail,
                      pathParameters: {'tournamentId': tournament.id},
                    ),
                  );
                },
              ),
            );
          },
        ),
      ],
    );
  }
}
