import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'tournament_registration_dashed_border.dart';

/// Saída para quem não achou o parceiro na busca: o parceiro ainda não tem
/// conta. O convite sai por link (WhatsApp/copiar) e o convite de verdade nasce
/// quando ele termina o cadastro.
class TournamentRegistrationPartnerPhoneCard extends StatelessWidget {
  const TournamentRegistrationPartnerPhoneCard({super.key, required this.onTap});

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
        child: TournamentRegistrationDashedBorder(
          radius: 12,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            child: Center(
              child: Text.rich(
                TextSpan(
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                    fontWeight: FontWeight.w500,
                  ),
                  children: [
                    const TextSpan(text: 'Não achou? '),
                    TextSpan(
                      text: 'Convidar por link',
                      style: AppTypography.soraRegular(
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                        color: AppColors.brand,
                      ),
                    ),
                  ],
                ),
                textAlign: TextAlign.center,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
