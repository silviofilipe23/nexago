import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/ui/app_snackbar.dart';
import '../../../domain/match_history/athlete_match_detail_models.dart';
import 'match_detail_info_section.dart';
import 'match_detail_section_header.dart';

class MatchDetailWhereWhenSection extends StatelessWidget {
  const MatchDetailWhereWhenSection({
    super.key,
    required this.detail,
    this.onViewBracket,
    this.showActions = true,
  });

  final AthleteMatchDetail detail;
  final VoidCallback? onViewBracket;
  final bool showActions;

  @override
  Widget build(BuildContext context) {
    final rows = <MatchDetailInfoRow>[
      MatchDetailInfoRow(
        icon: Icons.emoji_events_outlined,
        label: 'TORNEIO',
        value: detail.tournamentName,
      ),
      MatchDetailInfoRow(
        icon: Icons.calendar_today_outlined,
        label: 'DATA',
        value: detail.dateTimeLabel,
      ),
      MatchDetailInfoRow(
        icon: Icons.location_on_outlined,
        label: 'LOCAL',
        value: detail.venueLabel.isNotEmpty ? detail.venueLabel : '—',
      ),
      MatchDetailInfoRow(
        icon: Icons.sports_volleyball_outlined,
        label: 'CATEGORIA',
        value: detail.categoryLabel.isNotEmpty ? detail.categoryLabel : '—',
      ),
    ];

    if (detail.durationLabel != '—' && detail.phase == MatchDetailPhase.completed) {
      rows.add(
        MatchDetailInfoRow(
          icon: Icons.timer_outlined,
          label: 'DURAÇÃO',
          value: detail.durationLabel,
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const MatchDetailSectionHeader(
          eyebrow: 'ONDE & QUANDO',
          title: 'Detalhes',
        ),
        SizedBox(height: 14),
        MatchDetailInfoSection(rows: rows),
        if (showActions) ...[
          SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: _PrimaryActionButton(
                  icon: Icons.notifications_active_rounded,
                  label: 'Lembrar-me',
                  onTap: () => showAppSnackBar(context, 'Em breve.'),
                ),
              ),
              SizedBox(width: 12),
              Expanded(
                child: _SecondaryActionButton(
                  icon: Icons.account_tree_outlined,
                  label: 'Ver chave',
                  onTap: onViewBracket ??
                      () => showAppSnackBar(context, 'Em breve.'),
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }
}

class _PrimaryActionButton extends StatelessWidget {
  const _PrimaryActionButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Material(
      color: AppColors.brand,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 14),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 18, color: AppColors.black),
              SizedBox(width: 8),
              Text(
                label,
                style: theme.textTheme.labelLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: AppColors.black,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SecondaryActionButton extends StatelessWidget {
  const _SecondaryActionButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Material(
      color: context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: context.themeColors.surfaceRaised),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 18, color: context.themeColors.onSurface),
              SizedBox(width: 8),
              Text(
                label,
                style: theme.textTheme.labelLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: context.themeColors.onSurface,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
