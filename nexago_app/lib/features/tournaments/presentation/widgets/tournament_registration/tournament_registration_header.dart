import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_typography.dart';

class TournamentRegistrationHeader extends StatelessWidget {
  const TournamentRegistrationHeader({
    super.key,
    required this.onBack,
    this.title = 'Inscrição',
  });

  final VoidCallback onBack;
  final String title;

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
                color: AppColors.surfaceRaised,
                borderRadius: BorderRadius.circular(12),
                child: InkWell(
                  onTap: onBack,
                  borderRadius: BorderRadius.circular(12),
                  child: const SizedBox(
                    width: 44,
                    height: 44,
                    child: Icon(
                      Icons.arrow_back_rounded,
                      color: AppColors.onSurface,
                      size: 22,
                    ),
                  ),
                ),
              ),
            ),
            Text(
              title,
              style: AppTypography.soraRegular(
                fontSize: 17,
                fontWeight: FontWeight.w800,
                color: AppColors.onSurface,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
