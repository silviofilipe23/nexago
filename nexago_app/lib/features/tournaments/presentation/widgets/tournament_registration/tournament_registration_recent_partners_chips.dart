import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/app_user_profile.dart';

class TournamentRegistrationRecentPartnersChips extends StatelessWidget {
  const TournamentRegistrationRecentPartnersChips({
    super.key,
    required this.partners,
    required this.selectedUserId,
    required this.onSelected,
  });

  final List<AppUserProfile> partners;
  final String? selectedUserId;
  final ValueChanged<AppUserProfile> onSelected;

  @override
  Widget build(BuildContext context) {
    if (partners.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'JOGOU COM VOCÊ',
          style: AppTypography.mono(
            color: AppColors.onSurfaceMuted,
            fontWeight: FontWeight.w600,
            fontSize: 10,
            letterSpacing: 1.4,
          ),
        ),
        const SizedBox(height: 10),
        SizedBox(
          height: 40,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: partners.length,
            separatorBuilder: (_, __) => const SizedBox(width: 8),
            itemBuilder: (context, index) {
              final profile = partners[index];
              final selected = selectedUserId == profile.uid;
              final label = appUserDisplayName(profile);

              return FilterChip(
                selected: selected,
                showCheckmark: false,
                label: Text(label),
                labelStyle: AppTypography.soraRegular(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: selected ? AppColors.black : AppColors.onSurface,
                ),
                selectedColor: AppColors.brand,
                backgroundColor: AppColors.surfaceRaised,
                side: BorderSide(
                  color: selected
                      ? AppColors.brand
                      : AppColors.onSurfaceMuted.withValues(alpha: 0.2),
                ),
                onSelected: (_) => onSelected(profile),
              );
            },
          ),
        ),
      ],
    );
  }
}
