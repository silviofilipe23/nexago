import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../domain/category_ops/category_ops_logic.dart';
import '../../domain/category_ops/category_ops_models.dart';
import '../../domain/tournament_ops/tournament_ops_providers.dart';
import 'tabs/organizer_category_teams_tab.dart';
import 'widgets/organizer_category_filter_chips.dart';
import 'widgets/organizer_tournament_subpage_scaffold.dart';

class OrganizerCategoryTeamsPage extends ConsumerWidget {
  const OrganizerCategoryTeamsPage({
    super.key,
    required this.tournamentId,
    required this.categoryId,
  });

  final String tournamentId;
  final String categoryId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final key = OrganizerCategoryKey(
      tournamentId: tournamentId,
      categoryId: categoryId,
    );
    final filterState = ref.watch(organizerCategoryFilterProvider);
    final filteredTeams = ref.watch(organizerCategoryFilteredTeamsProvider(key));

    return OrganizerTournamentSubpageScaffold(
      title: 'Duplas',
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: TextField(
              style: AppTypography.soraRegular(
                fontSize: 14,
                color: context.themeColors.onSurface,
              ),
              decoration: InputDecoration(
                hintText: 'Buscar dupla ou atleta...',
                hintStyle: AppTypography.soraRegular(
                  fontSize: 14,
                  color: context.themeColors.onSurfaceMuted,
                ),
                prefixIcon: Icon(
                  Icons.search_rounded,
                  color: context.themeColors.onSurfaceMuted,
                ),
                filled: true,
                fillColor: context.themeColors.surfaceRaised,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: BorderSide.none,
                ),
                contentPadding: const EdgeInsets.symmetric(vertical: 12),
              ),
              onChanged: (v) => ref
                  .read(organizerCategoryFilterProvider.notifier)
                  .setSearch(v),
            ),
          ),
        ),
        const SliverToBoxAdapter(child: SizedBox(height: 8)),
        SliverToBoxAdapter(
          child: OrganizerCategoryFilterChips(
            tournamentId: tournamentId,
            categoryId: categoryId,
          ),
        ),
        const SliverToBoxAdapter(child: SizedBox(height: 8)),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: _TeamsMetaRow(
              total: filteredTeams.length,
              sort: filterState.sort,
              onSortChanged: (sort) => ref
                  .read(organizerCategoryFilterProvider.notifier)
                  .setSort(sort),
            ),
          ),
        ),
        const SliverToBoxAdapter(child: SizedBox(height: 4)),
        SliverFillRemaining(
          hasScrollBody: true,
          child: OrganizerCategoryTeamsTab(
            tournamentId: tournamentId,
            categoryId: categoryId,
          ),
        ),
      ],
    );
  }
}

class _TeamsMetaRow extends StatelessWidget {
  const _TeamsMetaRow({
    required this.total,
    required this.sort,
    required this.onSortChanged,
  });

  final int total;
  final OrganizerTeamSort sort;
  final ValueChanged<OrganizerTeamSort> onSortChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            '$total DUPLAS',
            style: AppTypography.mono(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: context.themeColors.onSurfaceMuted,
              letterSpacing: 0.5,
            ),
          ),
        ),
        PopupMenuButton<OrganizerTeamSort>(
          initialValue: sort,
          onSelected: onSortChanged,
          color: context.themeColors.surfaceCard,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                organizerTeamSortLabel(sort),
                style: AppTypography.soraRegular(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: AppColors.brand,
                ),
              ),
              const Icon(
                Icons.expand_more_rounded,
                size: 18,
                color: AppColors.brand,
              ),
            ],
          ),
          itemBuilder: (context) => OrganizerTeamSort.values
              .map(
                (s) => PopupMenuItem(
                  value: s,
                  child: Text(organizerTeamSortLabel(s)),
                ),
              )
              .toList(),
        ),
      ],
    );
  }
}
