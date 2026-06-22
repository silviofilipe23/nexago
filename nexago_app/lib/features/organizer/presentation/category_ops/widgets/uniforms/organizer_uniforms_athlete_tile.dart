import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../domain/tournament_uniforms/tournament_uniforms_models.dart';

class OrganizerUniformsAthleteTile extends StatelessWidget {
  const OrganizerUniformsAthleteTile({super.key, required this.row});

  final OrganizerUniformAthleteRow row;

  @override
  Widget build(BuildContext context) {
    final subtitleParts = <String>[
      row.categoryLabel,
      if (row.partnerShortName.isNotEmpty) row.partnerShortName,
    ];

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.1),
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: AppColors.brand.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: AppColors.brand.withValues(alpha: 0.25),
              ),
            ),
            child: Text(
              row.initials,
              style: AppTypography.mono(
                fontSize: 12,
                fontWeight: FontWeight.w800,
                color: AppColors.brand,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  row.athleteName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.soraRegular(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitleParts.join(' · '),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.soraRegular(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          if (row.isComplete) ...[
            _SizeBadge(label: row.sizeTop ?? '—'),
            const SizedBox(width: 10),
            _NumberBadge(number: row.jerseyNumber),
          ] else
            const _PendingBadge(),
        ],
      ),
    );
  }
}

class _SizeBadge extends StatelessWidget {
  const _SizeBadge({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 34,
      height: 34,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: AppColors.brand,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        label,
        style: AppTypography.mono(
          fontSize: 13,
          fontWeight: FontWeight.w900,
          color: AppColors.black,
        ),
      ),
    );
  }
}

class _NumberBadge extends StatelessWidget {
  const _NumberBadge({this.number});

  final int? number;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Text(
          'Nº',
          style: AppTypography.mono(
            fontSize: 9,
            fontWeight: FontWeight.w600,
            color: context.themeColors.onSurfaceMuted,
          ),
        ),
        Text(
          number?.toString() ?? '—',
          style: AppTypography.soraRegular(
            fontSize: 18,
            fontWeight: FontWeight.w900,
            color: context.themeColors.onSurface,
            height: 1,
          ),
        ),
      ],
    );
  }
}

class _PendingBadge extends StatelessWidget {
  const _PendingBadge();

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Text(
          'PENDENTE',
          style: AppTypography.mono(
            fontSize: 10,
            fontWeight: FontWeight.w800,
            color: AppColors.pending,
            letterSpacing: 0.3,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          'sem escolha',
          style: AppTypography.soraRegular(
            fontSize: 10,
            fontWeight: FontWeight.w500,
            color: context.themeColors.onSurfaceMuted,
          ),
        ),
      ],
    );
  }
}
