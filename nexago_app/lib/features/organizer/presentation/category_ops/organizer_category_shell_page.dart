import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';

import '../../domain/category_ops/category_ops_logic.dart';
import '../../domain/category_ops/category_ops_models.dart';
import '../../domain/tournament_create/tournament_create_logic.dart';
import '../../domain/tournament_ops/tournament_ops_logic.dart';
import '../../domain/tournament_ops/tournament_ops_providers.dart';
import 'organizer_tournament_navigation.dart';
import 'widgets/organizer_category_explore_section.dart';
import 'widgets/organizer_category_shell_header.dart';

class OrganizerCategoryShellPage extends ConsumerWidget {
  const OrganizerCategoryShellPage({
    super.key,
    required this.tournamentId,
    required this.categoryId,
  });

  final String tournamentId;
  final String categoryId;

  Future<void> _onGenerateBracket(
    BuildContext context,
    OrganizerTournamentCategorySummary category, {
    required int confirmedCount,
  }) async {
    final unsupportedHint = unsupportedBracketFormatHint(
      category.bracketFormat,
    );
    if (unsupportedHint != null && unsupportedHint.isNotEmpty) {
      showAppSnackBar(context, unsupportedHint, isError: true);
      return;
    }
    if (!canGenerateCategoryBracket(confirmedCount: confirmedCount)) {
      showAppSnackBar(
        context,
        generateBracketBlockedHint(
          confirmedCount: confirmedCount,
          bracketFormat: category.bracketFormat,
        ),
        isError: true,
      );
      return;
    }
    _generateBracket(context, category.bracketFormat);
  }

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
    final visibleTeamsAsync = ref.watch(
      organizerCategoryVisibleTeamsProvider(key),
    );

    final category = detail.valueOrNull?.categories
        .where((c) => c.categoryId == categoryId)
        .firstOrNull;
    final summary = detail.valueOrNull?.summary;
    final allTeams = teamsAsync.valueOrNull ?? const [];
    final visibleTeams = visibleTeamsAsync.valueOrNull ?? allTeams;
    final eligibleCount = teamsEligibleForBracketDraw(allTeams).length;
    final waitlistCount = countTeamsByStatus(
      visibleTeams,
      OrganizerTeamRegistrationStatus.waitlist,
    );
    final confirmedCount = countTeamsByStatus(
      visibleTeams,
      OrganizerTeamRegistrationStatus.confirmed,
    );
    final pendingCount = countTeamsByStatus(
      visibleTeams,
      OrganizerTeamRegistrationStatus.pending,
    );
    final showGenerateBracket = category == null
        ? false
        : showGenerateBracketQuickAction(
            category: category,
            eligibleConfirmedCount: eligibleCount,
          );

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        child: CustomScrollView(
          slivers: [
            if (category != null && summary != null)
              SliverToBoxAdapter(
                child: OrganizerCategoryShellHeader(
                  tournamentName: summary.name,
                  category: category,
                  onBack: () => context.pop(),
                ),
              ),
            if (category != null) ...[
              SliverToBoxAdapter(
                child: OrganizerCategoryKpiRow(
                  confirmedCount: confirmedCount,
                  pendingCount: pendingCount,
                  waitlistCount: waitlistCount,
                  collectedCents: category.collectedCents,
                ),
              ),
              if (showGenerateBracketCta(category)) ...[
                const SliverToBoxAdapter(child: SizedBox(height: 12)),
                SliverToBoxAdapter(
                  child: _CategoryQuickActions(
                    showGenerateBracket: showGenerateBracket,
                    onGenerateBracket: () => _onGenerateBracket(
                      context,
                      category,
                      confirmedCount: eligibleCount,
                    ),
                    onSeeding: () => pushOrganizerCategorySeeding(
                      GoRouter.of(context),
                      tournamentId: tournamentId,
                      categoryId: categoryId,
                    ),
                  ),
                ),
              ],
              SliverToBoxAdapter(
                child: OrganizerCategoryExploreSection(
                  tournamentId: tournamentId,
                  categoryId: categoryId,
                  category: category,
                  teamCount: visibleTeams.length,
                  pendingCount: pendingCount,
                ),
              ),
            ],
            const SliverToBoxAdapter(child: SizedBox(height: 24)),
          ],
        ),
      ),
    );
  }
}

class _CategoryQuickActions extends StatelessWidget {
  const _CategoryQuickActions({
    required this.showGenerateBracket,
    required this.onGenerateBracket,
    required this.onSeeding,
  });

  final bool showGenerateBracket;
  final VoidCallback onGenerateBracket;
  final VoidCallback onSeeding;

  static const _height = 44.0;
  static const _gap = 8.0;
  static final _pillShape = RoundedRectangleBorder(
    borderRadius: BorderRadius.circular(22),
  );

  @override
  Widget build(BuildContext context) {
    final mutedBorder = context.themeColors.onSurfaceMuted.withValues(
      alpha: 0.18,
    );
    final labelStyle = AppTypography.soraRegular(
      fontSize: 13,
      fontWeight: FontWeight.w700,
    );

    return SizedBox(
      height: _height,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          if (showGenerateBracket) ...[
            OutlinedButton.icon(
              onPressed: onGenerateBracket,
              icon: const Icon(Icons.account_tree_outlined, size: 17),
              label: const Text('Gerar chave'),
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.brand,
                backgroundColor: AppColors.brand.withValues(alpha: 0.08),
                side: BorderSide(
                  color: AppColors.brand.withValues(alpha: 0.55),
                ),
                shape: _pillShape,
                minimumSize: const Size(0, _height),
                padding: const EdgeInsets.symmetric(horizontal: 14),
                textStyle: labelStyle,
              ),
            ),
            const SizedBox(width: _gap),
          ],
          OutlinedButton.icon(
            onPressed: onSeeding,
            icon: const Icon(Icons.emoji_events_outlined, size: 17),
            label: const Text('Cabeças de chave'),
            style: OutlinedButton.styleFrom(
              foregroundColor: context.themeColors.onSurface,
              backgroundColor: context.themeColors.surfaceRaised,
              side: BorderSide(color: mutedBorder),
              shape: _pillShape,
              minimumSize: const Size(0, _height),
              padding: const EdgeInsets.symmetric(horizontal: 14),
              textStyle: labelStyle,
            ),
          ),
        ],
      ),
    );
  }
}
