import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../tournaments/domain/tournament_match.dart';
import '../../../../tournaments/domain/tournament_match_card_view_model.dart';
import '../../../domain/tournament_ops/tournament_ops_models.dart';
import '../../../domain/match_ops/match_ops_logic.dart';
import '../../../domain/match_ops/schedule_grid_logic.dart';
import '../../../domain/match_ops/schedule_pick_logic.dart';
import '../../category_ops/widgets/organizer_team_dual_avatars.dart';
import 'organizer_match_live_table_widgets.dart';

class SchedulePickHeader extends StatelessWidget {
  const SchedulePickHeader({
    super.key,
    required this.programLabel,
    required this.onBack,
    this.onMore,
  });

  final String programLabel;
  final VoidCallback onBack;
  final VoidCallback? onMore;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _SchedulePickIconButton(
            icon: Icons.arrow_back_ios_new_rounded,
            onPressed: onBack,
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  programLabel,
                  style: AppTypography.mono(
                    fontSize: 9,
                    fontWeight: FontWeight.w800,
                    color: AppColors.brand,
                    letterSpacing: 0.8,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Agendar partida',
                  style: AppTypography.soraRegular(
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                    height: 1.15,
                  ),
                ),
              ],
            ),
          ),
          if (onMore != null)
            _SchedulePickIconButton(
              icon: Icons.more_horiz_rounded,
              onPressed: onMore!,
            )
          else
            const SizedBox(width: 40),
        ],
      ),
    );
  }
}

class SchedulePickTabRow extends StatelessWidget {
  const SchedulePickTabRow({
    super.key,
    required this.activeTab,
    required this.counts,
    required this.onTabChanged,
  });

  final SchedulePickTab activeTab;
  final SchedulePickTabCounts counts;
  final ValueChanged<SchedulePickTab> onTabChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          for (final tab in SchedulePickTab.values) ...[
            if (tab != SchedulePickTab.unscheduled) const SizedBox(width: 8),
            Expanded(
              child: _SchedulePickTabButton(
                tab: tab,
                label: tab.label,
                count: counts.forTab(tab),
                selected: activeTab == tab,
                onTap: () => onTabChanged(tab),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _SchedulePickTabButton extends StatelessWidget {
  const _SchedulePickTabButton({
    required this.tab,
    required this.label,
    required this.count,
    required this.selected,
    required this.onTap,
  });

  final SchedulePickTab tab;
  final String label;
  final int count;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected
          ? AppColors.brand
          : context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: selected
                  ? AppColors.brand
                  : context.themeColors.onSurfaceMuted.withValues(alpha: 0.16),
            ),
          ),
          child: Column(
            children: [
              Text(
                label,
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.soraRegular(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: selected
                      ? Colors.white
                      : context.themeColors.onSurface,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                '$count',
                style: AppTypography.mono(
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  color: selected
                      ? Colors.white
                      : (tab == SchedulePickTab.ready && count > 0
                          ? AppColors.pending
                          : context.themeColors.onSurfaceMuted),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class SchedulePickCategoryChips extends StatelessWidget {
  const SchedulePickCategoryChips({
    super.key,
    required this.categories,
    required this.selectedCategoryId,
    required this.onSelected,
  });

  final List<OrganizerTournamentCategorySummary> categories;
  final String selectedCategoryId;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 36,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          _SchedulePickChip(
            label: 'Todas',
            selected: selectedCategoryId.isEmpty,
            onTap: () => onSelected(''),
          ),
          for (final category in categories) ...[
            const SizedBox(width: 8),
            _SchedulePickChip(
              label: MatchOpsLogic.categoryDisplayLabel(
                categoryId: category.categoryId,
                categories: categories,
              ),
              selected: selectedCategoryId == category.categoryId,
              onTap: () => onSelected(category.categoryId),
            ),
          ],
        ],
      ),
    );
  }
}

class _SchedulePickChip extends StatelessWidget {
  const _SchedulePickChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
              color: selected
                  ? AppColors.brand
                  : context.themeColors.onSurfaceMuted.withValues(alpha: 0.2),
            ),
          ),
          child: Text(
            label,
            style: AppTypography.soraRegular(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: selected ? AppColors.brand : context.themeColors.onSurfaceMuted,
            ),
          ),
        ),
      ),
    );
  }
}

class SchedulePickSectionHeader extends StatelessWidget {
  const SchedulePickSectionHeader({
    super.key,
    required this.activeTab,
  });

  final SchedulePickTab activeTab;

  @override
  Widget build(BuildContext context) {
    final title = switch (activeTab) {
      SchedulePickTab.ready => 'PRONTAS PARA AGENDAR',
      SchedulePickTab.blocked => 'BLOQUEADAS',
      SchedulePickTab.unscheduled => 'TODAS',
    };

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: Row(
        children: [
          Expanded(
            child: Text(
              title,
              style: AppTypography.mono(
                fontSize: 9,
                fontWeight: FontWeight.w800,
                color: context.themeColors.onSurfaceMuted,
                letterSpacing: 0.6,
              ),
            ),
          ),
          if (activeTab == SchedulePickTab.ready)
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 5,
                  height: 5,
                  decoration: const BoxDecoration(
                    color: AppColors.win,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 4),
                Text(
                  'toque para escolher',
                  style: AppTypography.soraRegular(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: AppColors.win,
                  ),
                ),
              ],
            ),
        ],
      ),
    );
  }
}

class SchedulePickMatchCard extends StatelessWidget {
  const SchedulePickMatchCard({
    super.key,
    required this.match,
    required this.categoryLabel,
    required this.teamA,
    required this.teamB,
    required this.suggestionLabel,
    required this.selected,
    required this.selectable,
    required this.onTap,
  });

  final TournamentMatch match;
  final String categoryLabel;
  final LiveTableTeamData teamA;
  final LiveTableTeamData teamB;
  final String? suggestionLabel;
  final bool selected;
  final bool selectable;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final (statusLabel, statusColor) = _statusBadge(context);
    final meta = ScheduleGridLogic.matchMetaLabel(
      match: match,
      categoryLabel: categoryLabel,
    ).toUpperCase();
    final seedA = liveTableTeamSeed(match, sideA: true);
    final seedB = liveTableTeamSeed(match, sideA: false);

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
      child: Material(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          onTap: selectable ? onTap : null,
          borderRadius: BorderRadius.circular(16),
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: selected
                    ? AppColors.brand
                    : context.themeColors.onSurfaceMuted.withValues(
                        alpha: 0.14,
                      ),
                width: selected ? 1.5 : 1,
              ),
            ),
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        meta,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.mono(
                          fontSize: 9,
                          fontWeight: FontWeight.w700,
                          color: context.themeColors.onSurfaceMuted,
                          letterSpacing: 0.4,
                        ),
                      ),
                    ),
                    Text(
                      statusLabel,
                      style: AppTypography.mono(
                        fontSize: 9,
                        fontWeight: FontWeight.w800,
                        color: statusColor,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                _SchedulePickTeamRow(
                  team: teamA,
                  seed: seedA,
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Row(
                    children: [
                      Expanded(
                        child: Divider(
                          color: context.themeColors.onSurfaceMuted.withValues(
                            alpha: 0.12,
                          ),
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 8),
                        child: Text(
                          'vs',
                          style: AppTypography.mono(
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            color: context.themeColors.onSurfaceMuted,
                          ),
                        ),
                      ),
                      Expanded(
                        child: Divider(
                          color: context.themeColors.onSurfaceMuted.withValues(
                            alpha: 0.12,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Expanded(
                      child: _SchedulePickTeamRow(
                        team: teamB,
                        seed: seedB,
                      ),
                    ),
                    if (selectable) ...[
                      const SizedBox(width: 8),
                      _SchedulePickSelectIndicator(selected: selected),
                    ],
                  ],
                ),
                if (suggestionLabel != null && suggestionLabel!.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Icon(
                        Icons.sports_rounded,
                        size: 14,
                        color: AppColors.brand.withValues(alpha: 0.9),
                      ),
                      const SizedBox(width: 6),
                      Text(
                        'sugestão $suggestionLabel',
                        style: AppTypography.soraRegular(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: context.themeColors.onSurfaceMuted,
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  (String, Color) _statusBadge(BuildContext context) {
    if (!SchedulePickLogic.isReady(match)) {
      return (
        SchedulePickLogic.blockedReason.toUpperCase(),
        context.themeColors.onSurfaceMuted,
      );
    }
    if (SchedulePickLogic.isPartiallyScheduled(match)) {
      return (SchedulePickLogic.partialReason.toUpperCase(), AppColors.pending);
    }
    if (SchedulePickLogic.isTentative(match)) {
      return (SchedulePickLogic.tentativeReason.toUpperCase(), AppColors.pending);
    }
    return ('PRONTA', AppColors.win);
  }
}

class _SchedulePickTeamRow extends StatelessWidget {
  const _SchedulePickTeamRow({
    required this.team,
    this.seed,
  });

  final LiveTableTeamData team;
  final int? seed;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        OrganizerTeamDualAvatars(
          player1: team.player1,
          player2: team.player2,
          avatarSize: 28,
          overlapRingColor: context.themeColors.surfaceRaised,
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Row(
            children: [
              Flexible(
                child: Text(
                  team.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.soraRegular(
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                  ),
                ),
              ),
              if (seed != null) ...[
                const SizedBox(width: 8),
                Text(
                  '#$seed',
                  style: AppTypography.mono(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: AppColors.brand,
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _SchedulePickSelectIndicator extends StatelessWidget {
  const _SchedulePickSelectIndicator({required this.selected});

  final bool selected;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 28,
      height: 28,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: selected ? AppColors.brand : Colors.transparent,
        border: Border.all(
          color: selected
              ? AppColors.brand
              : context.themeColors.onSurfaceMuted.withValues(alpha: 0.28),
          width: 2,
        ),
      ),
      child: selected
          ? const Icon(Icons.check_rounded, size: 16, color: Colors.white)
          : null,
    );
  }
}

class SchedulePickActionBar extends StatelessWidget {
  const SchedulePickActionBar({
    super.key,
    required this.onAuto,
    required this.onSchedule,
    required this.scheduleLabel,
    this.scheduleEnabled = false,
    this.scheduling = false,
  });

  final VoidCallback onAuto;
  final VoidCallback onSchedule;
  final String scheduleLabel;
  final bool scheduleEnabled;
  final bool scheduling;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
      decoration: BoxDecoration(
        color: context.themeColors.canvas,
        border: Border(
          top: BorderSide(
            color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
          ),
        ),
      ),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            OutlinedButton.icon(
              onPressed: scheduling ? null : onAuto,
              icon: const Icon(Icons.auto_fix_high_rounded, size: 18),
              label: const Text('Auto'),
              style: OutlinedButton.styleFrom(
                foregroundColor: context.themeColors.onSurface,
                side: BorderSide(
                  color: context.themeColors.onSurfaceMuted.withValues(
                    alpha: 0.28,
                  ),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: FilledButton.icon(
                onPressed: scheduleEnabled && !scheduling ? onSchedule : null,
                icon: scheduling
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(Icons.arrow_forward_rounded, size: 18),
                label: Text(scheduling ? 'Agendando…' : scheduleLabel),
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.brand,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  textStyle: AppTypography.soraRegular(
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SchedulePickIconButton extends StatelessWidget {
  const _SchedulePickIconButton({required this.icon, required this.onPressed});

  final IconData icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.themeColors.surfaceRaised,
      shape: const CircleBorder(),
      child: InkWell(
        onTap: onPressed,
        customBorder: const CircleBorder(),
        child: SizedBox(
          width: 40,
          height: 40,
          child: Icon(icon, size: 20, color: context.themeColors.onSurface),
        ),
      ),
    );
  }
}

LiveTableTeamData schedulePickTeamData({
  required TournamentMatch match,
  required bool sideA,
  TournamentMatchCardViewModel? enriched,
}) {
  return liveTableTeamData(
    match: match,
    sideA: sideA,
    enrichedTeam: sideA ? enriched?.teamA : enriched?.teamB,
  );
}
