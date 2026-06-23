import 'package:flutter/material.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../domain/match_ops/match_ops_models.dart';
import '../../domain/match_ops/match_ops_providers.dart';
import '../../../tournaments/domain/tournament_discovery_models.dart';
import '../../../tournaments/domain/tournament_discovery_providers.dart';
import '../../../tournaments/domain/tournament_matches_logic.dart';
import '../match_ops/organizer_match_navigation.dart';
import '../match_ops/widgets/organizer_match_card.dart';
import 'widgets/organizer_category_podium_card.dart';

class OrganizerCategoryBracketListPage extends ConsumerWidget {
  const OrganizerCategoryBracketListPage({
    super.key,
    required this.tournamentId,
    required this.categoryId,
    this.categoryName = '',
  });

  final String tournamentId;
  final String categoryId;
  final String categoryName;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final matchesAsync =
        ref.watch(organizerTournamentMatchesProvider(tournamentId));
    final prizes = ref
            .watch(tournamentDetailProvider(tournamentId))
            .valueOrNull
            ?.categoryOffers
            .where((o) => o.id == categoryId)
            .firstOrNull
            ?.prizes ??
        const <TournamentCategoryPrize>[];

    final title =
        categoryName.isNotEmpty ? 'Chave · $categoryName' : 'Chave';
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      appBar: NexaAppBar(
        forceMaterial: true,
        backgroundColor: context.themeColors.canvas,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleSpacing: 8,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => context.pop(),
        ),
        title: Text(
          title,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: theme.textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.w800,
            color: context.themeColors.onSurface,
            letterSpacing: -0.3,
            height: 1.1,
          ),
        ),
      ),
      body: matchesAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (all) {
          final pools = groupMatchesByPool(
            poolMatchesForCategory(all, categoryId),
          );
          final bracketMatches = bracketMatchesForCategory(all, categoryId);
          final bracket = groupBracketMatchesByRound(bracketMatches);

          if (pools.isEmpty && bracket.isEmpty) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Text(
                  'Chave ainda não publicada para esta categoria.',
                  textAlign: TextAlign.center,
                ),
              ),
            );
          }

          return ListView(
            clipBehavior: Clip.hardEdge,
            padding: const EdgeInsets.only(top: 8, bottom: 32),
            children: [
              OrganizerCategoryPodiumCard(
                categoryMatches: bracketMatches,
                prizes: prizes,
              ),
              for (final pool in pools) ...[
                _SectionHeader(pool.poolLabel),
                for (final match in pool.matches)
                  OrganizerMatchCard(
                    row: OrganizerMatchRow(match: match),
                    onTap: () => context.push(
                      organizerMatchSummaryPath(tournamentId, match.id),
                    ),
                  ),
              ],
              for (final group in bracket) ...[
                _SectionHeader(group.roundLabel),
                for (final match in group.matches)
                  OrganizerMatchCard(
                    row: OrganizerMatchRow(match: match),
                    onTap: () => context.push(
                      organizerMatchSummaryPath(tournamentId, match.id),
                    ),
                  ),
              ],
            ],
          );
        },
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
      child: Text(
        label.toUpperCase(),
        style: AppTypography.mono(
          fontSize: 11,
          color: context.themeColors.onSurfaceMuted,
          letterSpacing: 0.8,
        ),
      ),
    );
  }
}
