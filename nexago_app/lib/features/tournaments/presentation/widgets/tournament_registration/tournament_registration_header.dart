import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';

class TournamentRegistrationHeader extends StatelessWidget {
  const TournamentRegistrationHeader({
    super.key,
    required this.onBack,
    this.title = 'Inscrição',
    this.tournamentName,
    this.tournamentDateLabel,
    this.categoryLabel,
    this.showTournamentInfo = false,
  });

  final VoidCallback onBack;
  final String title;
  final String? tournamentName;
  final String? tournamentDateLabel;
  final String? categoryLabel;
  final bool showTournamentInfo;

  String _normalizeTournamentDateLabel(String raw) {
    final value = raw.trim();
    if (value.isEmpty) return value;

    // Ex.: "21/04 - 21/04" => "21/04"
    final slashRange = RegExp(r'^(\d{1,2}/\d{1,2})\s*[–-]\s*(\d{1,2}/\d{1,2})$');
    final slashMatch = slashRange.firstMatch(value);
    if (slashMatch != null) {
      final start = slashMatch.group(1)?.trim();
      final end = slashMatch.group(2)?.trim();
      if (start != null && end != null && start == end) {
        return start;
      }
      return value;
    }

    // Ex.: "21–21 Abr" / "21-21 Abr" => "21 Abr"
    final sameDayRange = RegExp(r'^(\d{1,2})\s*[–-]\s*(\d{1,2})(\s+\S.*)$');
    final match = sameDayRange.firstMatch(value);
    if (match != null) {
      final startDay = match.group(1)?.trim();
      final endDay = match.group(2)?.trim();
      final suffix = (match.group(3) ?? '').trimLeft();
      if (startDay != null &&
          endDay != null &&
          startDay == endDay &&
          suffix.isNotEmpty) {
        return '$startDay $suffix'.trim();
      }
    }

    return value;
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      bottom: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
        child: Stack(
          alignment: Alignment.center,
          children: [
            Align(
              alignment: Alignment.centerLeft,
              child: Material(
                color: context.themeColors.surfaceRaised,
                borderRadius: BorderRadius.circular(12),
                child: InkWell(
                  onTap: onBack,
                  borderRadius: BorderRadius.circular(12),
                  child: SizedBox(
                    width: 44,
                    height: 44,
                    child: Icon(
                      Icons.arrow_back_rounded,
                      color: context.themeColors.onSurface,
                      size: 22,
                    ),
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(left: 56),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                if (showTournamentInfo &&
                    tournamentName != null &&
                    tournamentName!.trim().isNotEmpty)
                  Text(
                    [
                      tournamentName!.trim().toUpperCase(),
                      if (tournamentDateLabel != null &&
                          tournamentDateLabel!.trim().isNotEmpty)
                        _normalizeTournamentDateLabel(
                          tournamentDateLabel!,
                        ).toUpperCase(),
                    ].join(' · '),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.mono(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: AppColors.brand,
                      letterSpacing: 1.0,
                    ),
                  ),
                if (showTournamentInfo &&
                    categoryLabel != null &&
                    categoryLabel!.trim().isNotEmpty) ...[
                  SizedBox(height: 2),
                  Text(
                    categoryLabel!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.soraRegular(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                      color: context.themeColors.onSurface,
                      height: 1.0,
                    ),
                  ),
                ] else
                  Text(
                    title,
                    style: AppTypography.soraRegular(
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                      color: context.themeColors.onSurface,
                    ),
                  ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
