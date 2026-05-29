import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/compete_hub_logic.dart';
import '../../../domain/tournament_discovery_models.dart';

/// Card compacto de torneio no carrossel do hub Competir.
class TournamentDiscoveryHubTile extends StatelessWidget {
  const TournamentDiscoveryHubTile({
    super.key,
    required this.tournament,
    required this.onTap,
  });

  static const double tileMinWidth = 168;
  static const double tileMaxWidth = 280;
  static const double tileHeight = 100;
  static const double _horizontalPadding = 28;

  final DiscoveryTournament tournament;
  final VoidCallback onTap;

  static TextStyle get _titleStyle => AppTypography.soraRegular(
        fontSize: 16,
        fontWeight: FontWeight.w800,
        color: AppColors.onSurface,
        height: 1.15,
        letterSpacing: -0.3,
      );

  static TextStyle _monoStyle({
    required double fontSize,
    required FontWeight fontWeight,
    required Color color,
    double letterSpacing = 0,
  }) =>
      AppTypography.mono(
        fontSize: fontSize,
        fontWeight: fontWeight,
        color: color,
        letterSpacing: letterSpacing,
      );

  static double tileWidthFor(
    BuildContext context, {
    required String title,
    required String dateLabel,
    required String statusLabel,
    required Color accentColor,
    required bool isOpenStatus,
  }) {
    final textDirection = Directionality.of(context);
    final innerMax = tileMaxWidth - _horizontalPadding;

    final titlePainter = TextPainter(
      text: TextSpan(text: title, style: _titleStyle),
      maxLines: 1,
      textDirection: textDirection,
    )..layout();

    var innerWidth = titlePainter.width;
    if (innerWidth > innerMax) {
      innerWidth = innerMax;
    }

    final datePainter = TextPainter(
      text: TextSpan(
        text: dateLabel,
        style: _monoStyle(
          fontSize: 13,
          fontWeight: FontWeight.w500,
          color: accentColor,
          letterSpacing: 0.2,
        ),
      ),
      textDirection: textDirection,
    )..layout();

    final statusPainter = TextPainter(
      text: TextSpan(
        text: statusLabel,
        style: _monoStyle(
          fontSize: 11,
          fontWeight: FontWeight.w500,
          color: isOpenStatus ? AppColors.win : AppColors.onSurfaceMuted,
          letterSpacing: 0.5,
        ),
      ),
      textDirection: textDirection,
    )..layout();

    final footerWidth = datePainter.width + statusPainter.width + 12;
    innerWidth = innerWidth > footerWidth ? innerWidth : footerWidth;

    return (innerWidth + _horizontalPadding).clamp(tileMinWidth, tileMaxWidth);
  }

  @override
  Widget build(BuildContext context) {
    final accentColor = hubTournamentAccentColor(tournament);
    final statusBadge = hubTournamentStatusBadge(tournament);
    final isOpenStatus =
        tournament.status == TournamentListingStatus.open ||
        tournament.status == TournamentListingStatus.almostFull;
    final dateLabel = hubTournamentDateLabel(tournament);
    final tileWidth = tileWidthFor(
      context,
      title: tournament.name,
      dateLabel: dateLabel,
      statusLabel: statusBadge,
      accentColor: accentColor,
      isOpenStatus: isOpenStatus,
    );

    return SizedBox(
      width: tileWidth,
      height: tileHeight,
      child: Material(
        color: AppColors.surfaceCard,
        borderRadius: BorderRadius.circular(12),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(height: 3, color: accentColor),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        tournament.name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: _titleStyle,
                      ),
                      const SizedBox(height: 6),
                      Text(
                        hubTournamentCategoryCountLabel(tournament),
                        style: AppTypography.soraRegular(
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                          color: AppColors.onSurfaceMuted,
                          height: 1.2,
                        ),
                      ),
                      const Spacer(),
                      Row(
                        children: [
                          Text(
                            dateLabel,
                            style: _monoStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w500,
                              color: accentColor,
                              letterSpacing: 0.2,
                            ),
                          ),
                          const Spacer(),
                          Text(
                            statusBadge,
                            style: _monoStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w500,
                              color: isOpenStatus
                                  ? AppColors.win
                                  : AppColors.onSurfaceMuted,
                              letterSpacing: 0.5,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
