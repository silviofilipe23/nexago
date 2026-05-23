import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/athlete_privacy_preferences.dart';

class PrivacyVisibilityOptionCard extends StatelessWidget {
  const PrivacyVisibilityOptionCard({
    super.key,
    required this.visibility,
    required this.selected,
    required this.onTap,
  });

  final AthleteProfileVisibility visibility;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final meta = _metaFor(visibility);
    final accent = selected ? AppColors.brand : AppColors.onSurface;
    final borderColor = selected
        ? AppColors.brand.withValues(alpha: 0.85)
        : AppColors.onSurfaceMuted.withValues(alpha: 0.12);

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: AppColors.surfaceRaised,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(14),
          child: DecoratedBox(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: borderColor, width: selected ? 1.5 : 1),
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
              child: Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: AppColors.surfaceSheet,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(meta.icon, color: accent, size: 22),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          meta.title,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            fontWeight: FontWeight.w800,
                            color: accent,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          meta.subtitle,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: AppColors.onSurfaceMuted,
                            fontWeight: FontWeight.w500,
                            height: 1.35,
                          ),
                        ),
                      ],
                    ),
                  ),
                  _RadioDot(selected: selected),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  static _VisibilityMeta _metaFor(AthleteProfileVisibility v) {
    return switch (v) {
      AthleteProfileVisibility.public => const _VisibilityMeta(
          icon: Icons.visibility_outlined,
          title: 'Público',
          subtitle: 'Qualquer atleta encontra você.',
        ),
      AthleteProfileVisibility.friends => const _VisibilityMeta(
          icon: Icons.person_add_alt_1_outlined,
          title: 'Apenas amigos',
          subtitle: 'Só quem joga com você.',
        ),
      AthleteProfileVisibility.private => const _VisibilityMeta(
          icon: Icons.visibility_off_outlined,
          title: 'Privado',
          subtitle: 'Não aparece em buscas.',
        ),
    };
  }
}

class _VisibilityMeta {
  const _VisibilityMeta({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  final IconData icon;
  final String title;
  final String subtitle;
}

class _RadioDot extends StatelessWidget {
  const _RadioDot({required this.selected});

  final bool selected;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 22,
      height: 22,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(
          color: selected
              ? AppColors.brand
              : AppColors.onSurfaceMuted.withValues(alpha: 0.5),
          width: 2,
        ),
      ),
      child: selected
          ? Center(
              child: Container(
                width: 10,
                height: 10,
                decoration: const BoxDecoration(
                  shape: BoxShape.circle,
                  color: AppColors.brand,
                ),
              ),
            )
          : null,
    );
  }
}
