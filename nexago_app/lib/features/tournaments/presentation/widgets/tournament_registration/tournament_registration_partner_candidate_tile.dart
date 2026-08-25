import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../athlete/presentation/widgets/athlete_profile_avatar.dart';
import '../../../domain/tournament_registration_logic.dart';

class TournamentRegistrationPartnerCandidateTile extends StatelessWidget {
  const TournamentRegistrationPartnerCandidateTile({
    super.key,
    required this.candidate,
    required this.selected,
    required this.onTap,
    this.sending = false,
  });

  final TournamentRegistrationPartnerCandidate candidate;
  final bool selected;
  final VoidCallback onTap;

  /// Convite em voo para ESTE atleta — trava só a linha dele, e o rótulo vira
  /// "ENVIANDO…" (na tela única o toque já envia o convite, sem passo extra).
  final bool sending;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Material(
      color: selected
          ? AppColors.brand.withValues(alpha: 0.08)
          : context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: sending ? null : onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: selected
                  ? AppColors.brand
                  : Colors.white.withValues(alpha: 0.08),
            ),
          ),
          child: Row(
            children: [
              AthleteProfileAvatar(
                size: 44,
                initials: candidate.initials,
                imageUrl: candidate.avatarUrl,
              ),
              SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      candidate.name,
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: context.themeColors.onSurface,
                      ),
                    ),
                    SizedBox(height: 2),
                    Text(
                      candidate.rankLabel,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: context.themeColors.onSurfaceMuted,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    if (candidate.tagLabel != null &&
                        candidate.tagLabel!.isNotEmpty) ...[
                      SizedBox(height: 4),
                      Text(
                        candidate.tagLabel!,
                        style: AppTypography.mono(
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                          color: AppColors.brand,
                          letterSpacing: 0.4,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              if (sending)
                const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: AppColors.brand,
                  ),
                )
              else if (selected)
                Container(
                  width: 28,
                  height: 28,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: AppColors.brand,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    Icons.check_rounded,
                    size: 18,
                    color: AppColors.black,
                  ),
                )
              else
                Text(
                  'CONVIDAR',
                  style: AppTypography.mono(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: context.themeColors.onSurfaceMuted,
                    letterSpacing: 0.8,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
