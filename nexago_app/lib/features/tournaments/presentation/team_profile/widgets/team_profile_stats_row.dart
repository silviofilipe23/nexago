import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/team_profile/team_public_profile_models.dart';

class TeamProfileStatsRow extends StatelessWidget {
  const TeamProfileStatsRow({super.key, required this.stats});

  final TeamProfileStats stats;

  @override
  Widget build(BuildContext context) {
    final points = NumberFormat.decimalPattern('pt_BR').format(stats.points);

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 18),
        decoration: BoxDecoration(
          border: Border(
            top: BorderSide(color: context.themeColors.surfaceRaised),
            bottom: BorderSide(color: context.themeColors.surfaceRaised),
          ),
        ),
        child: Row(
          children: [
            Expanded(
              child: _StatColumn(
                value: '${stats.games}',
                label: 'JOGOS',
              ),
            ),
            _Divider(),
            Expanded(
              child: _StatColumn(
                value: '${stats.winRatePercent}%',
                label: 'VITÓRIA',
              ),
            ),
            _Divider(),
            Expanded(
              child: _StatColumn(
                value: '${stats.titles}',
                label: 'TÍTULOS',
              ),
            ),
            _Divider(),
            Expanded(
              child: _StatColumn(
                value: points,
                label: 'PTS',
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatColumn extends StatelessWidget {
  const _StatColumn({required this.value, required this.label});

  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          value,
          style: AppTypography.mono(
            fontSize: 18,
            fontWeight: FontWeight.w800,
            color: context.themeColors.onSurface,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          label,
          style: AppTypography.mono(
            fontSize: 9,
            fontWeight: FontWeight.w700,
            color: context.themeColors.onSurfaceMuted,
            letterSpacing: 0.5,
          ),
        ),
      ],
    );
  }
}

class _Divider extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 1,
      height: 32,
      color: context.themeColors.surfaceRaised,
    );
  }
}
