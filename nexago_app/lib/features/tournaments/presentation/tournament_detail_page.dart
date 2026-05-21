import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../domain/tournament_discovery_helpers.dart';
import '../domain/tournament_discovery_models.dart';
import '../domain/tournament_discovery_providers.dart';
import '../domain/tournament_listing_status.dart';
import 'widgets/tournament_discovery_card.dart';

class TournamentDetailPage extends ConsumerWidget {
  const TournamentDetailPage({super.key, required this.tournamentId});

  final String tournamentId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final tournamentAsync = ref.watch(tournamentDetailProvider(tournamentId));
    final leaguesAsync = ref.watch(discoveryLeaguesProvider);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        backgroundColor: AppColors.canvas,
        title: const Text('Torneio'),
      ),
      body: tournamentAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
        error: (e, _) => Center(
          child: Text(
            'Não foi possível carregar o torneio.\n$e',
            style: theme.textTheme.bodyLarge?.copyWith(color: AppColors.live),
          ),
        ),
        data: (tournament) {
          if (tournament == null) {
            return const Center(child: Text('Torneio não encontrado.'));
          }

          final leagues = leaguesAsync.valueOrNull ?? [];
          final leagueCtx = resolveLeagueContext(leagues, tournament.id);
          final categories = tournament.categoryOffers;

          return ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
            children: [
              if (leagueCtx != null) ...[
                Text(
                  leagueContextLabel(leagueCtx),
                  style: theme.textTheme.labelMedium?.copyWith(
                    color: AppColors.brand,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 12),
              ],
              TournamentDiscoveryCard(
                tournament: tournament,
                onTap: () {},
              ),
              const SizedBox(height: 20),
              Text(
                'Categorias',
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: AppColors.onSurface,
                ),
              ),
              const SizedBox(height: 10),
              if (categories.isEmpty)
                Text(
                  'Categorias serão publicadas em breve pelo organizador.',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: AppColors.onSurfaceMuted,
                  ),
                )
              else
                for (final cat in categories) ...[
                  _CategoryTile(category: cat),
                  const SizedBox(height: 8),
                ],
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                height: 52,
                child: FilledButton(
                  onPressed: canRegisterForTournament(tournament.status)
                      ? () => context.pushNamed(
                            AppRouteNames.tournamentRegistration,
                            pathParameters: {'tournamentId': tournament.id},
                          )
                      : null,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brand,
                    foregroundColor: AppColors.black,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                  child: Text(
                    'Inscrever-se',
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: AppColors.black,
                    ),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _CategoryTile extends StatelessWidget {
  const _CategoryTile({required this.category});

  final TournamentCategoryOffer category;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.surfaceRaised,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: AppColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    category.name,
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: AppColors.onSurface,
                    ),
                  ),
                  if (category.level.isNotEmpty)
                    Text(
                      category.level,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: AppColors.onSurfaceMuted,
                      ),
                    ),
                ],
              ),
            ),
            Text(
              'R\$ ${category.entryFee.toStringAsFixed(0)}',
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w800,
                color: AppColors.brand,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
