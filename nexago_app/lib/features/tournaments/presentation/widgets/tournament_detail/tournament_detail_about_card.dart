import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/tournament_detail_logic.dart';
import '../../../domain/tournament_detail_model.dart';

class TournamentDetailAboutCard extends StatelessWidget {
  const TournamentDetailAboutCard({
    super.key,
    required this.tournament,
    required this.organizerName,
  });

  final TournamentDetail tournament;
  final String organizerName;

  @override
  Widget build(BuildContext context) {
    return _SectionCard(
      title: 'SOBRE O EVENTO',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            tournamentDetailAboutText(tournament),
            style: AppTypography.soraRegular(
              fontSize: 14,
              color: context.themeColors.onSurface,
              fontWeight: FontWeight.w500,
              height: 1.55,
            ),
          ),
          SizedBox(height: 16),
          Divider(
            height: 1,
            color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
          ),
          SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: _DetailCell(label: 'ORGANIZADOR', value: organizerName),
              ),
              SizedBox(width: 16),
              Expanded(
                child: _DetailCell(
                  label: 'FORMATO',
                  value: tournamentDetailFormatSummary(tournament),
                ),
              ),
            ],
          ),
          SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: _DetailCell(
                  label: 'LOCAL',
                  value: tournamentDetailLocationSummary(tournament),
                ),
              ),
              SizedBox(width: 16),
              Expanded(
                child: _DetailCell(
                  label: 'INSCRIÇÃO',
                  value: tournamentDetailEntrySummary(tournament),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _DetailCell extends StatelessWidget {
  const _DetailCell({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: AppTypography.mono(
            fontSize: 10,
            color: context.themeColors.onSurfaceMuted,
            fontWeight: FontWeight.w500,
            letterSpacing: 0.6,
          ),
        ),
        SizedBox(height: 4),
        Text(
          value,
          style: AppTypography.soraRegular(
            fontSize: 14,
            fontWeight: FontWeight.w700,
            color: context.themeColors.onSurface,
            height: 1.25,
          ),
        ),
      ],
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(20, 0, 20, 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            title,
            style: AppTypography.mono(
              fontSize: 11,
              color: context.themeColors.onSurfaceMuted,
              fontWeight: FontWeight.w500,
              letterSpacing: 0.8,
            ),
          ),
          SizedBox(height: 12),
          child,
        ],
      ),
    );
  }
}
