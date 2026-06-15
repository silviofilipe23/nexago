import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:share_plus/share_plus.dart';

import '../../domain/category_ops/category_ops_providers.dart';
import '../../domain/tournament_ops/tournament_ops_logic.dart';
import '../../domain/tournament_ops/tournament_ops_providers.dart';
import 'organizer_tournament_navigation.dart';
import 'sheets/organizer_tournament_actions_sheet.dart';
import 'tabs/organizer_category_payments_tab.dart';
import 'tabs/organizer_category_teams_tab.dart';
import 'widgets/organizer_category_filter_chips.dart';
import 'widgets/organizer_category_shell_header.dart';
import 'widgets/organizer_category_shell_tabs.dart';

class OrganizerCategoryShellPage extends ConsumerWidget {
  const OrganizerCategoryShellPage({
    super.key,
    required this.tournamentId,
    required this.categoryId,
  });

  final String tournamentId;
  final String categoryId;

  void _generateBracket(BuildContext context, String? bracketFormat) {
    final format = bracketFormat ?? '';
    final routeFormat = generateBracketRouteFormat(format);
    if (routeFormat == 'double_elimination') {
      pushOrganizerCategoryFormat(
        GoRouter.of(context),
        tournamentId: tournamentId,
        categoryId: categoryId,
      );
    } else {
      pushOrganizerCategoryGenerateBracket(
        GoRouter.of(context),
        tournamentId: tournamentId,
        categoryId: categoryId,
        format: routeFormat,
      );
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final key = OrganizerCategoryKey(
      tournamentId: tournamentId,
      categoryId: categoryId,
    );
    final detail = ref.watch(organizerTournamentDetailProvider(tournamentId));
    final teamsAsync = ref.watch(organizerCategoryRegistrationsProvider(key));
    final selectedTab = ref.watch(organizerCategoryShellTabProvider);
    final filterState = ref.watch(organizerCategoryFilterProvider);
    final filteredTeams = ref.watch(organizerCategoryFilteredTeamsProvider(key));

    final category = detail.valueOrNull?.categories
        .where((c) => c.categoryId == categoryId)
        .firstOrNull;
    final summary = detail.valueOrNull?.summary;
    final teams = teamsAsync.valueOrNull ?? const [];
    final teamCount = teams.length;
    final waitlistCount = countTeamsByStatus(
      teams,
      OrganizerTeamRegistrationStatus.waitlist,
    );
    final confirmedCount = countTeamsByStatus(
      teams,
      OrganizerTeamRegistrationStatus.confirmed,
    );
    final pendingCount = category?.pendingCount ??
        countTeamsByStatus(teams, OrganizerTeamRegistrationStatus.pending);

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (category != null && summary != null)
              OrganizerCategoryShellHeader(
                tournamentName: summary.name,
                category: category,
                onBack: () => context.pop(),
                onMore: detail.valueOrNull?.tournament == null
                    ? null
                    : () => showOrganizerTournamentActionsSheet(
                          context,
                          tournamentId: tournamentId,
                          tournament: detail.value!.tournament!,
                          summary: summary,
                          categories: detail.value!.categories,
                        ),
              ),
            if (category != null) ...[
              OrganizerCategoryKpiRow(
                confirmedCount: confirmedCount,
                pendingCount: pendingCount,
                waitlistCount: waitlistCount,
                collectedCents: category.collectedCents,
              ),
              const SizedBox(height: 12),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () =>
                            _generateBracket(context, category.bracketFormat),
                        icon: const Icon(Icons.account_tree_outlined, size: 18),
                        label: const Text('Gerar chave'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppColors.brand,
                          side: BorderSide(
                            color: AppColors.brand.withValues(alpha: 0.55),
                          ),
                          minimumSize: const Size.fromHeight(44),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: () => pushOrganizerCategorySeeding(
                          GoRouter.of(context),
                          tournamentId: tournamentId,
                          categoryId: categoryId,
                        ),
                        icon: const Icon(Icons.emoji_events_outlined, size: 18),
                        label: const Text('Cabeças de chave'),
                        style: FilledButton.styleFrom(
                          backgroundColor: context.themeColors.surfaceCard,
                          foregroundColor: context.themeColors.onSurface,
                          minimumSize: const Size.fromHeight(44),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    SizedBox(
                      width: 44,
                      height: 44,
                      child: OutlinedButton(
                        onPressed: () => Share.shareUri(
                          Uri.parse(
                            organizerTournamentRegistrationShareLink(
                              tournamentId,
                            ),
                          ),
                        ),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: context.themeColors.onSurface,
                          side: BorderSide(
                            color: context.themeColors.onSurfaceMuted
                                .withValues(alpha: 0.25),
                          ),
                          padding: EdgeInsets.zero,
                        ),
                        child: const Icon(Icons.share_rounded, size: 18),
                      ),
                    ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 12),
            OrganizerCategoryShellTabs(
              selected: selectedTab,
              onSelected:
                  ref.read(organizerCategoryShellTabProvider.notifier).select,
              teamCount: teamCount,
              pendingPaymentsCount: pendingCount,
            ),
            if (selectedTab == OrganizerCategoryShellTab.teams) ...[
              const SizedBox(height: 12),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
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
              const SizedBox(height: 8),
              const OrganizerCategoryFilterChips(),
              const SizedBox(height: 8),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: _TeamsMetaRow(
                  total: filteredTeams.length,
                  sort: filterState.sort,
                  onSortChanged: (sort) => ref
                      .read(organizerCategoryFilterProvider.notifier)
                      .setSort(sort),
                ),
              ),
              const SizedBox(height: 4),
            ],
            Expanded(
              child: IndexedStack(
                index: selectedTab.index,
                children: [
                  OrganizerCategoryTeamsTab(
                    tournamentId: tournamentId,
                    categoryId: categoryId,
                  ),
                  OrganizerCategoryPaymentsTab(
                    tournamentId: tournamentId,
                    categoryId: categoryId,
                  ),
                  Center(
                    child: FilledButton(
                      onPressed: () => pushOrganizerCategoryBracket(
                        GoRouter.of(context),
                        tournamentId: tournamentId,
                        categoryId: categoryId,
                      ),
                      child: const Text('Ver chave'),
                    ),
                  ),
                  Center(
                    child: FilledButton(
                      onPressed: () => pushOrganizerCategoryBracket(
                        GoRouter.of(context),
                        tournamentId: tournamentId,
                        categoryId: categoryId,
                        tab: 'matches',
                      ),
                      child: const Text('Ver jogos'),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: category == null
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                child: FilledButton.icon(
                  onPressed: () =>
                      _generateBracket(context, category.bracketFormat),
                  icon: const Icon(Icons.account_tree_outlined, size: 20),
                  label: const Text('Gerar chave da categoria'),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brand,
                    foregroundColor: AppColors.black,
                    minimumSize: const Size.fromHeight(52),
                    textStyle: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                ),
              ),
            ),
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
