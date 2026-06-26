import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../tournaments/domain/tournament_match.dart';
import '../../../../tournaments/domain/tournament_match_display.dart';
import '../../../domain/match_ops/match_ops_logic.dart';
import '../../../domain/match_ops/match_ops_models.dart';
import '../../../domain/match_ops/schedule_grid_logic.dart';
import '../../category_ops/widgets/organizer_team_dual_avatars.dart';
import 'organizer_match_live_table_widgets.dart';

class ScheduleMatchSheetChrome extends StatelessWidget {
  const ScheduleMatchSheetChrome({
    super.key,
    required this.programLabel,
    required this.onClose,
  });

  final String programLabel;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 12, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: context.themeColors.onSurfaceMuted.withValues(
                  alpha: 0.3,
                ),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 16),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      programLabel.toUpperCase(),
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
              _ScheduleMatchSheetIconButton(
                icon: Icons.close_rounded,
                onPressed: onClose,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class ScheduleMatchSheetMatchCard extends StatelessWidget {
  const ScheduleMatchSheetMatchCard({
    super.key,
    required this.match,
    required this.categoryLabel,
    required this.teamA,
    required this.teamB,
    this.seedA,
    this.seedB,
  });

  final TournamentMatch match;
  final String categoryLabel;
  final LiveTableTeamData teamA;
  final LiveTableTeamData teamB;
  final int? seedA;
  final int? seedB;

  @override
  Widget build(BuildContext context) {
    final genderShort = MatchOpsLogic.categoryGenderShortLabel(categoryLabel);
    final genderPill = genderShort.isNotEmpty
        ? genderShort
        : MatchOpsLogic.categoryGenderShortLabel(
            match.categoryId,
          );
    final roundLabel = matchRoundLabel(match);
    final roundTag = ScheduleGridLogic.roundShortLabel(match);

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: context.themeColors.surfaceRaised,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                if (genderPill.isNotEmpty) ...[
                  _GenderPill(label: genderPill),
                  const SizedBox(width: 8),
                ],
                Expanded(
                  child: Text(
                    roundLabel,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.soraRegular(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: context.themeColors.onSurfaceMuted,
                    ),
                  ),
                ),
                if (roundTag.isNotEmpty)
                  Text(
                    roundTag,
                    style: AppTypography.mono(
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      color: AppColors.brand,
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            _ScheduleMatchSheetTeamRow(team: teamA, seed: seedA),
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
            _ScheduleMatchSheetTeamRow(team: teamB, seed: seedB),
          ],
        ),
      ),
    );
  }
}

class _GenderPill extends StatelessWidget {
  const _GenderPill({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.brand.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          color: AppColors.brand.withValues(alpha: 0.35),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 5,
            height: 5,
            decoration: const BoxDecoration(
              color: AppColors.brand,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 4),
          Text(
            label,
            style: AppTypography.mono(
              fontSize: 9,
              fontWeight: FontWeight.w800,
              color: AppColors.brand,
            ),
          ),
        ],
      ),
    );
  }
}

class _ScheduleMatchSheetTeamRow extends StatelessWidget {
  const _ScheduleMatchSheetTeamRow({required this.team, this.seed});

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
        if (seed != null)
          Text(
            '#$seed',
            style: AppTypography.mono(
              fontSize: 11,
              fontWeight: FontWeight.w800,
              color: AppColors.brand,
            ),
          ),
      ],
    );
  }
}

class ScheduleMatchSheetCourtPicker extends StatelessWidget {
  const ScheduleMatchSheetCourtPicker({
    super.key,
    required this.courts,
    required this.selectedCourtId,
    required this.onCourtSelected,
  });

  final List<TournamentCourt> courts;
  final String selectedCourtId;
  final ValueChanged<String> onCourtSelected;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 20, 0, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'QUADRA',
            style: AppTypography.mono(
              fontSize: 9,
              fontWeight: FontWeight.w800,
              color: context.themeColors.onSurfaceMuted,
              letterSpacing: 0.6,
            ),
          ),
          const SizedBox(height: 10),
          SizedBox(
            height: 72,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.only(right: 20),
              itemCount: courts.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (context, index) {
                final court = courts[index];
                return _ScheduleMatchSheetCourtChip(
                  court: court,
                  selected: selectedCourtId == court.id,
                  onTap: () => onCourtSelected(court.id),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _ScheduleMatchSheetCourtChip extends StatelessWidget {
  const _ScheduleMatchSheetCourtChip({
    required this.court,
    required this.selected,
    required this.onTap,
  });

  final TournamentCourt court;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final fg = selected ? Colors.black : context.themeColors.onSurface;
    final muted = selected
        ? Colors.black.withValues(alpha: 0.65)
        : context.themeColors.onSurfaceMuted;

    return Material(
      color: selected ? AppColors.brand : context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          width: 88,
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: selected
                  ? AppColors.brand
                  : context.themeColors.onSurfaceMuted.withValues(alpha: 0.16),
            ),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                court.id,
                style: AppTypography.mono(
                  fontSize: 14,
                  fontWeight: FontWeight.w800,
                  color: fg,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                court.name,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: AppTypography.soraRegular(
                  fontSize: 9,
                  fontWeight: FontWeight.w500,
                  color: muted,
                  height: 1.15,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class ScheduleMatchSheetTimeCompare extends StatelessWidget {
  const ScheduleMatchSheetTimeCompare({
    super.key,
    required this.before,
    required this.after,
    required this.afterLabel,
    required this.slotsExpanded,
    required this.onTap,
  });

  final DateTime? before;
  final DateTime after;
  final String afterLabel;
  final bool slotsExpanded;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final beforeLabel = before != null
        ? ScheduleGridLogic.timeLabel(before!)
        : '—';
    final hasBefore = before != null;

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'HORÁRIO',
            style: AppTypography.mono(
              fontSize: 9,
              fontWeight: FontWeight.w800,
              color: context.themeColors.onSurfaceMuted,
              letterSpacing: 0.6,
            ),
          ),
          const SizedBox(height: 10),
          Material(
            color: context.themeColors.surfaceRaised,
            borderRadius: BorderRadius.circular(14),
            child: InkWell(
              onTap: onTap,
              borderRadius: BorderRadius.circular(14),
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 18,
                ),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: slotsExpanded
                        ? AppColors.brand.withValues(alpha: 0.45)
                        : context.themeColors.onSurfaceMuted.withValues(
                            alpha: 0.12,
                          ),
                  ),
                ),
                child: Row(
                  children: [
                    if (hasBefore) ...[
                      Expanded(
                        child: Column(
                          children: [
                            Text(
                              'ANTES',
                              style: AppTypography.mono(
                                fontSize: 9,
                                fontWeight: FontWeight.w700,
                                color: context.themeColors.onSurfaceMuted,
                                letterSpacing: 0.5,
                              ),
                            ),
                            const SizedBox(height: 6),
                            Text(
                              beforeLabel,
                              style: AppTypography.soraRegular(
                                fontSize: 28,
                                fontWeight: FontWeight.w800,
                                color: context.themeColors.onSurfaceMuted,
                                height: 1,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          color: AppColors.brand.withValues(alpha: 0.14),
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: AppColors.brand.withValues(alpha: 0.35),
                          ),
                        ),
                        child: const Icon(
                          Icons.arrow_forward_rounded,
                          size: 18,
                          color: AppColors.brand,
                        ),
                      ),
                    ],
                    Expanded(
                      child: Column(
                        children: [
                          Text(
                            hasBefore ? 'NOVO' : 'HORÁRIO',
                            style: AppTypography.mono(
                              fontSize: 9,
                              fontWeight: FontWeight.w800,
                              color: hasBefore
                                  ? AppColors.brand
                                  : context.themeColors.onSurfaceMuted,
                              letterSpacing: 0.5,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            afterLabel,
                            style: AppTypography.soraRegular(
                              fontSize: 28,
                              fontWeight: FontWeight.w800,
                              color: context.themeColors.onSurface,
                              height: 1,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Icon(
                      slotsExpanded
                          ? Icons.expand_less_rounded
                          : Icons.expand_more_rounded,
                      color: context.themeColors.onSurfaceMuted,
                      size: 22,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class ScheduleMatchSheetConfirmBar extends StatelessWidget {
  const ScheduleMatchSheetConfirmBar({
    super.key,
    required this.onConfirm,
    this.enabled = true,
    this.saving = false,
  });

  final VoidCallback onConfirm;
  final bool enabled;
  final bool saving;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
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
        child: FilledButton.icon(
          onPressed: enabled && !saving ? onConfirm : null,
          icon: saving
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.black,
                  ),
                )
              : const Icon(Icons.schedule_rounded, size: 18, color: Colors.black),
          label: const Text('Confirmar agendamento'),
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.brand,
            foregroundColor: Colors.black,
            minimumSize: const Size.fromHeight(52),
            textStyle: AppTypography.soraRegular(
              fontSize: 14,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
      ),
    );
  }
}

class _ScheduleMatchSheetIconButton extends StatelessWidget {
  const _ScheduleMatchSheetIconButton({
    required this.icon,
    required this.onPressed,
  });

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
