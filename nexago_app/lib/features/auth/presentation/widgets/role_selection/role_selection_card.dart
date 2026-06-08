import 'package:flutter/material.dart';

import '../../../../../core/auth/app_mobile_role.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Fundo quente do card selecionado (carvão + tint laranja do protótipo).
const _selectedCardGradient = LinearGradient(
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
  colors: [Color(0xFF2A1810), Color(0xFF1A1410), Color(0xFF12100E)],
  stops: [0.0, 0.42, 1.0],
);

class RoleSelectionCard extends StatelessWidget {
  const RoleSelectionCard({
    super.key,
    required this.role,
    required this.selected,
    required this.footer,
    required this.onTap,
  });

  final AppMobileRole role;
  final bool selected;
  final String? footer;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: selected
                  ? AppColors.brand
                  : context.themeColors.onSurfaceMuted.withValues(alpha: 0.2),
              width: 1,
            ),
            color: selected ? null : context.themeColors.surfaceCard,
            gradient: selected ? _selectedCardGradient : null,
          ),
          padding: const EdgeInsets.fromLTRB(16, 18, 16, 18),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              _RoleIcon(role: role, selected: selected),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      role.categoryLabel,
                      style: AppTypography.mono(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        color: AppColors.brand,
                        letterSpacing: 0.9,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      role.title,
                      style: theme.textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: context.themeColors.onSurface,
                        letterSpacing: -0.4,
                        fontSize: 20,
                        height: 1.1,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      role.description,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: context.themeColors.onSurfaceMuted,
                        height: 1.45,
                        fontSize: 12,
                      ),
                    ),
                    if (footer != null && footer!.trim().isNotEmpty) ...[
                      const SizedBox(height: 12),
                      Text(
                        footer!.toUpperCase(),
                        style: AppTypography.mono(
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                          color: context.themeColors.onSurfaceMuted.withValues(
                            alpha: 0.9,
                          ),
                          letterSpacing: 0.35,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 12),
              _SelectionIndicator(selected: selected),
            ],
          ),
        ),
      ),
    );
  }
}

class _RoleIcon extends StatelessWidget {
  const _RoleIcon({required this.role, required this.selected});

  final AppMobileRole role;
  final bool selected;

  IconData get _icon => switch (role) {
    AppMobileRole.athlete => Icons.sports_volleyball_outlined,
    AppMobileRole.arena => Icons.stadium_outlined,
    AppMobileRole.organizer => Icons.emoji_events_outlined,
  };

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 52,
      height: 52,
      decoration: BoxDecoration(
        color: selected ? AppColors.brand : context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(14),
        border: selected
            ? null
            : Border.all(
                color: context.themeColors.onSurfaceMuted.withValues(
                  alpha: 0.12,
                ),
              ),
      ),
      child: Icon(
        _icon,
        color: selected ? AppColors.black : AppColors.brand,
        size: 26,
      ),
    );
  }
}

class _SelectionIndicator extends StatelessWidget {
  const _SelectionIndicator({required this.selected});

  final bool selected;

  @override
  Widget build(BuildContext context) {
    if (selected) {
      return Container(
        width: 26,
        height: 26,
        decoration: const BoxDecoration(
          color: AppColors.brand,
          shape: BoxShape.circle,
        ),
        child: const Icon(
          Icons.check_rounded,
          color: AppColors.black,
          size: 17,
        ),
      );
    }
    return Container(
      width: 26,
      height: 26,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.35),
          width: 1.5,
        ),
      ),
    );
  }
}
