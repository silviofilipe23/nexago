import 'package:flutter/material.dart';
import 'package:nexago_app/core/time/nexago_event_timezone.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../domain/match_ops/match_ops_models.dart';
import '../../../domain/match_ops/schedule_grid_logic.dart';
import '../../category_ops/widgets/organizer_team_dual_avatars.dart';
import 'organizer_match_live_table_widgets.dart';

class ScheduleTimeHeader extends StatelessWidget {
  const ScheduleTimeHeader({
    super.key,
    required this.metaLabel,
    required this.onBack,
  });

  final String metaLabel;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _ScheduleTimeIconButton(
            icon: Icons.arrow_back_ios_new_rounded,
            onPressed: onBack,
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  metaLabel.toUpperCase(),
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
          const SizedBox(width: 40),
        ],
      ),
    );
  }
}

class _ScheduleTimeIconButton extends StatelessWidget {
  const _ScheduleTimeIconButton({required this.icon, required this.onPressed});

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

class ScheduleTimeMatchSummary extends StatelessWidget {
  const ScheduleTimeMatchSummary({
    super.key,
    required this.teamA,
    required this.teamB,
    this.seedA,
    this.seedB,
  });

  final LiveTableTeamData teamA;
  final LiveTableTeamData teamB;
  final int? seedA;
  final int? seedB;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
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
          children: [
            _ScheduleTimeTeamRow(team: teamA, seed: seedA),
            const SizedBox(height: 10),
            _ScheduleTimeTeamRow(team: teamB, seed: seedB),
          ],
        ),
      ),
    );
  }
}

class _ScheduleTimeTeamRow extends StatelessWidget {
  const _ScheduleTimeTeamRow({required this.team, this.seed});

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

class ScheduleTimeCourtPicker extends StatelessWidget {
  const ScheduleTimeCourtPicker({
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
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
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
          Row(
            children: [
              for (final court in courts) ...[
                if (court != courts.first) const SizedBox(width: 8),
                Expanded(
                  child: _ScheduleCourtChip(
                    court: court,
                    selected: selectedCourtId == court.id,
                    onTap: () => onCourtSelected(court.id),
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class _ScheduleCourtChip extends StatelessWidget {
  const _ScheduleCourtChip({
    required this.court,
    required this.selected,
    required this.onTap,
  });

  final TournamentCourt court;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected
          ? AppColors.brand.withValues(alpha: 0.12)
          : context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: selected
                  ? AppColors.brand
                  : context.themeColors.onSurfaceMuted.withValues(alpha: 0.16),
            ),
          ),
          child: Text(
            court.id,
            textAlign: TextAlign.center,
            style: AppTypography.mono(
              fontSize: 13,
              fontWeight: FontWeight.w800,
              color: selected
                  ? AppColors.brand
                  : context.themeColors.onSurface,
            ),
          ),
        ),
      ),
    );
  }
}

class ScheduleTimeSlotPicker extends StatelessWidget {
  const ScheduleTimeSlotPicker({
    super.key,
    required this.slots,
    required this.selectedSlot,
    required this.onSlotSelected,
    this.sectionTitle = 'HORÁRIO',
  });

  final List<DateTime> slots;
  final DateTime? selectedSlot;
  final ValueChanged<DateTime> onSlotSelected;
  final String sectionTitle;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                sectionTitle,
                style: AppTypography.mono(
                  fontSize: 9,
                  fontWeight: FontWeight.w800,
                  color: context.themeColors.onSurfaceMuted,
                  letterSpacing: 0.6,
                ),
              ),
              const Spacer(),
              Text(
                '30 min',
                style: AppTypography.mono(
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (var i = 0; i < slots.length; i++) ...[
                  if (i > 0) const SizedBox(width: 8),
                  _ScheduleTimeChip(
                    label: ScheduleGridLogic.timeLabel(slots[i]),
                    selected: _isSameEventSlot(selectedSlot, slots[i]),
                    onTap: () => onSlotSelected(slots[i]),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

bool _isSameEventSlot(DateTime? a, DateTime b) {
  if (a == null) return false;
  final localA = toNexagoEventLocal(a);
  final localB = toNexagoEventLocal(b);
  return localA.hour == localB.hour && localA.minute == localB.minute;
}

class _ScheduleTimeChip extends StatelessWidget {
  const _ScheduleTimeChip({
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
      color: selected
          ? AppColors.brand
          : context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: selected
                  ? AppColors.brand
                  : context.themeColors.onSurfaceMuted.withValues(alpha: 0.16),
            ),
          ),
          child: Text(
            label,
            style: AppTypography.mono(
              fontSize: 13,
              fontWeight: FontWeight.w800,
              height: 1.1,
              color: selected
                  ? Colors.black
                  : context.themeColors.onSurface,
            ),
          ),
        ),
      ),
    );
  }
}

class ScheduleTimeConflictCard extends StatelessWidget {
  const ScheduleTimeConflictCard({
    super.key,
    required this.title,
    required this.message,
  });

  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.pending.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: AppColors.pending.withValues(alpha: 0.35),
          ),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(
              Icons.notifications_none_rounded,
              size: 18,
              color: AppColors.pending,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: AppTypography.soraRegular(
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                      color: AppColors.pending,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    message,
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
          ],
        ),
      ),
    );
  }
}

class ScheduleTimeActionBar extends StatelessWidget {
  const ScheduleTimeActionBar({
    super.key,
    required this.onCancel,
    required this.onConfirm,
    required this.confirmLabel,
    this.confirmEnabled = true,
    this.saving = false,
  });

  final VoidCallback onCancel;
  final VoidCallback onConfirm;
  final String confirmLabel;
  final bool confirmEnabled;
  final bool saving;

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
            OutlinedButton(
              onPressed: saving ? null : onCancel,
              style: OutlinedButton.styleFrom(
                foregroundColor: context.themeColors.onSurface,
                side: BorderSide(
                  color: context.themeColors.onSurfaceMuted.withValues(
                    alpha: 0.28,
                  ),
                ),
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 14,
                ),
              ),
              child: const Text('Cancelar'),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: FilledButton.icon(
                onPressed: confirmEnabled && !saving ? onConfirm : null,
                icon: saving
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.black,
                        ),
                      )
                    : const Icon(Icons.check_rounded, size: 18, color: Colors.black),
                label: Text(
                  confirmLabel,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.brand,
                  foregroundColor: Colors.black,
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
