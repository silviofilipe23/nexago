import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';

import '../../domain/category_ops/category_ops_logic.dart';
import '../../domain/category_ops/category_ops_models.dart';
import '../../domain/tournament_ops/tournament_ops_providers.dart';
import 'widgets/organizer_team_dual_avatars.dart';

class OrganizerCategorySeedingPage extends ConsumerStatefulWidget {
  const OrganizerCategorySeedingPage({
    super.key,
    required this.tournamentId,
    required this.categoryId,
  });

  final String tournamentId;
  final String categoryId;

  @override
  ConsumerState<OrganizerCategorySeedingPage> createState() =>
      _OrganizerCategorySeedingPageState();
}

class _OrganizerCategorySeedingPageState
    extends ConsumerState<OrganizerCategorySeedingPage> {
  List<OrganizerCategoryTeamRow> _teams = [];
  bool _seedByRanking = true;
  bool _initialized = false;
  Timer? _saveTimer;

  @override
  void dispose() {
    _saveTimer?.cancel();
    super.dispose();
  }

  Future<void> _persistSeeds(List<String> seeds) async {
    final ops = await ref
        .read(organizerCategoryOpsRepositoryProvider)
        .getCategoryOps(
          tournamentId: widget.tournamentId,
          categoryId: widget.categoryId,
        );
    await ref.read(organizerCategoryOpsRepositoryProvider).saveCategoryOps(
          tournamentId: widget.tournamentId,
          categoryId: widget.categoryId,
          state: CategoryOpsState(
            seeds: seeds,
            seedByRanking: _seedByRanking,
            bracketStatus: ops.bracketStatus,
            bracketFormatOverride: ops.bracketFormatOverride,
            winnersAdvantage: ops.winnersAdvantage,
            phaseBestOf: ops.phaseBestOf,
            finalBestOf5: ops.finalBestOf5,
            thirdPlaceEnabled: ops.thirdPlaceEnabled,
            groupsPreview: ops.groupsPreview,
          ),
        );
  }

  void _scheduleSave(List<String> seeds) {
    _saveTimer?.cancel();
    _saveTimer = Timer(const Duration(milliseconds: 500), () {
      unawaited(_persistSeeds(seeds));
    });
  }

  void _bootstrapTeams(
    List<OrganizerCategoryTeamRow> teams,
    CategoryOpsState? ops,
  ) {
    if (_initialized) return;
    _initialized = true;
    _seedByRanking = ops?.seedByRanking ?? true;
    final eligible = teamsEligibleForBracketDraw(teams);
    if (ops != null && ops.seeds.isNotEmpty) {
      _teams = applySeedOrder(
        eligible,
        filterSeedTeamIdsToEligible(ops.seeds, eligible),
      );
    } else {
      _teams = eligible;
    }
  }

  OrganizerTournamentCategorySummary? _categorySummary(
    AsyncValue<OrganizerTournamentDetailState?> detail,
  ) {
    return detail.valueOrNull?.categories
        .where((c) => c.categoryId == widget.categoryId)
        .firstOrNull;
  }

  @override
  Widget build(BuildContext context) {
    final key = OrganizerCategoryKey(
      tournamentId: widget.tournamentId,
      categoryId: widget.categoryId,
    );
    final teamsAsync = ref.watch(organizerCategoryRegistrationsProvider(key));
    final opsAsync = ref.watch(organizerCategoryOpsProvider(key));
    final detail = ref.watch(organizerTournamentDetailProvider(widget.tournamentId));
    final category = _categorySummary(detail);
    final ops = opsAsync.valueOrNull;
    final primaryHeadCount = seedingPrimaryHeadCount(ops);
    final eyebrow = seedingCategoryEyebrow(
      genderLabel: category?.genderLabel ?? '',
      levelLabel: category?.levelLabel ?? 'Open',
    );

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        child: teamsAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(child: Text('$e')),
          data: (teams) {
            _bootstrapTeams(teams, ops);
            if (_teams.isEmpty) {
              _teams = teamsEligibleForBracketDraw(teams);
            }

            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _SeedingHeader(
                  eyebrow: eyebrow,
                  onBack: () => context.pop(),
                  onClose: () => context.pop(),
                ),
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                    children: [
                      _RankingToggleCard(
                        value: _seedByRanking,
                        onChanged: (v) {
                          setState(() {
                            _seedByRanking = v;
                            if (v) {
                              final order = defaultSeedOrderByRanking(_teams);
                              _teams = applySeedOrder(_teams, order);
                              _scheduleSave(order);
                            }
                          });
                        },
                      ),
                      const SizedBox(height: 12),
                      _SeedingInfoBanner(primaryHeadCount: primaryHeadCount),
                      const SizedBox(height: 20),
                      Text(
                        'CABEÇAS (${_teams.length})',
                        style: AppTypography.mono(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: context.themeColors.onSurfaceMuted,
                          letterSpacing: 0.8,
                        ),
                      ),
                      const SizedBox(height: 10),
                      ReorderableListView.builder(
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        buildDefaultDragHandles: false,
                        itemCount: _teams.length,
                        onReorder: (oldIndex, newIndex) {
                          setState(() {
                            if (newIndex > oldIndex) newIndex--;
                            final item = _teams.removeAt(oldIndex);
                            _teams.insert(newIndex, item);
                            _seedByRanking = false;
                            final seeds = _teams.map((t) => t.teamId).toList();
                            _teams = applySeedOrder(_teams, seeds);
                            _scheduleSave(seeds);
                          });
                        },
                        itemBuilder: (context, index) {
                          final team = _teams[index];
                          final rank = team.seedRank ?? index + 1;
                          return Padding(
                            key: ValueKey(team.teamId),
                            padding: const EdgeInsets.only(bottom: 8),
                            child: _SeedingTeamTile(
                              team: team,
                              rank: rank,
                              isPrimaryHead: index < primaryHeadCount,
                              index: index,
                            ),
                          );
                        },
                      ),
                    ],
                  ),
                ),
              ],
            );
          },
        ),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
          child: FilledButton.icon(
            onPressed: _teams.isEmpty
                ? null
                : () async {
                    _saveTimer?.cancel();
                    final seeds = _teams.map((t) => t.teamId).toList();
                    try {
                      await _persistSeeds(seeds);
                      if (!context.mounted) return;
                      showAppSnackBar(context, 'Cabeças de chave salvas.');
                      context.pop();
                    } catch (e) {
                      if (!context.mounted) return;
                      showAppSnackBar(context, '$e', isError: true);
                    }
                  },
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.brand,
              foregroundColor: AppColors.black,
              minimumSize: const Size.fromHeight(52),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
            ),
            icon: const Icon(Icons.check_rounded, size: 20),
            label: const Text(
              'Salvar cabeças de chave',
              style: TextStyle(fontWeight: FontWeight.w800),
            ),
          ),
        ),
      ),
    );
  }
}

class _SeedingHeader extends StatelessWidget {
  const _SeedingHeader({
    required this.eyebrow,
    required this.onBack,
    required this.onClose,
  });

  final String eyebrow;
  final VoidCallback onBack;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
      child: Row(
        children: [
          _SeedingIconButton(
            icon: Icons.arrow_back_ios_new_rounded,
            onPressed: onBack,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (eyebrow.isNotEmpty)
                  Text(
                    eyebrow,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.mono(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: AppColors.brand,
                      letterSpacing: 0.6,
                    ),
                  ),
                if (eyebrow.isNotEmpty) const SizedBox(height: 2),
                Text(
                  'Cabeças de chave',
                  style: AppTypography.soraRegular(
                    fontSize: 22,
                    fontWeight: FontWeight.w900,
                    color: context.themeColors.onSurface,
                    height: 1.1,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          _SeedingIconButton(
            icon: Icons.close_rounded,
            onPressed: onClose,
          ),
        ],
      ),
    );
  }
}

class _SeedingIconButton extends StatelessWidget {
  const _SeedingIconButton({required this.icon, required this.onPressed});

  final IconData icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(12),
        child: SizedBox(
          width: 40,
          height: 40,
          child: Icon(icon, size: 18, color: context.themeColors.onSurface),
        ),
      ),
    );
  }
}

class _RankingToggleCard extends StatelessWidget {
  const _RankingToggleCard({
    required this.value,
    required this.onChanged,
  });

  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: AppColors.brand.withValues(alpha: 0.14),
              shape: BoxShape.circle,
            ),
            child: Icon(
              Icons.emoji_events_outlined,
              size: 20,
              color: AppColors.brand,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Semear pelo ranking nexaGO',
                  style: AppTypography.soraRegular(
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Ordena automaticamente pela pontuação. Desligue para ordenar na mão.',
                  style: AppTypography.soraRegular(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: context.themeColors.onSurfaceMuted,
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
          Switch(
            value: value,
            onChanged: onChanged,
            activeThumbColor: AppColors.black,
            activeTrackColor: AppColors.brand,
          ),
        ],
      ),
    );
  }
}

class _SeedingInfoBanner extends StatelessWidget {
  const _SeedingInfoBanner({required this.primaryHeadCount});

  final int primaryHeadCount;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.28)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 22,
            height: 22,
            alignment: Alignment.center,
            decoration: const BoxDecoration(
              color: AppColors.brand,
              shape: BoxShape.circle,
            ),
            child: Text(
              '?',
              style: AppTypography.soraRegular(
                fontSize: 13,
                fontWeight: FontWeight.w800,
                color: AppColors.black,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text.rich(
              TextSpan(
                style: AppTypography.soraRegular(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  color: context.themeColors.onSurfaceMuted,
                  height: 1.4,
                ),
                children: [
                  const TextSpan(text: 'As '),
                  TextSpan(
                    text: '$primaryHeadCount primeiras',
                    style: const TextStyle(
                      color: AppColors.brand,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const TextSpan(
                    text:
                        ' cabeças são distribuídas em grupos diferentes. Arraste para ajustar a ordem.',
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SeedingTeamTile extends StatelessWidget {
  const _SeedingTeamTile({
    required this.team,
    required this.rank,
    required this.isPrimaryHead,
    required this.index,
  });

  final OrganizerCategoryTeamRow team;
  final int rank;
  final bool isPrimaryHead;
  final int index;

  @override
  Widget build(BuildContext context) {
    final rankBg = isPrimaryHead
        ? AppColors.brand
        : context.themeColors.onSurfaceMuted.withValues(alpha: 0.08);
    final rankFg = isPrimaryHead
        ? AppColors.black
        : context.themeColors.onSurfaceMuted.withValues(alpha: 0.55);
    final rankBorder = isPrimaryHead
        ? AppColors.brand
        : context.themeColors.onSurfaceMuted.withValues(alpha: 0.2);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 28,
            height: 28,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: rankBg,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: rankBorder),
            ),
            child: Text(
              '$rank',
              style: AppTypography.mono(
                fontSize: 12,
                fontWeight: FontWeight.w800,
                color: rankFg,
              ),
            ),
          ),
          const SizedBox(width: 10),
          OrganizerTeamDualAvatars(
            player1: team.player1,
            player2: team.player2,
            overlapRingColor: context.themeColors.surfaceRaised,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  team.displayName,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.soraRegular(
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  teamRankingPointsLabel(team),
                  style: AppTypography.mono(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ),
              ],
            ),
          ),
          ReorderableDragStartListener(
            index: index,
            child: Icon(
              Icons.drag_indicator_rounded,
              color: context.themeColors.onSurfaceMuted,
            ),
          ),
        ],
      ),
    );
  }
}
