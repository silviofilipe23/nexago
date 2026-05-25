import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import '../arena_header_image.dart';

class ArenaDetailHero extends StatelessWidget {
  const ArenaDetailHero({
    super.key,
    required this.arenaId,
    required this.coverUrl,
    required this.onBack,
    required this.isFavorite,
    required this.isFavoritePending,
    required this.onToggleFavorite,
    this.isBestPrice = false,
    this.height = 228,
  });

  final String arenaId;
  final String? coverUrl;
  final VoidCallback onBack;
  final bool isFavorite;
  final bool isFavoritePending;
  final VoidCallback? onToggleFavorite;
  final bool isBestPrice;
  final double height;

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        ArenaHeaderImage(arenaId: arenaId, coverUrl: coverUrl, height: height),
        Positioned(
          top: MediaQuery.paddingOf(context).top + 8,
          left: 12,
          child: _CircleIconButton(
            icon: Icons.arrow_back_rounded,
            onTap: onBack,
          ),
        ),
        Positioned(
          top: MediaQuery.paddingOf(context).top + 8,
          right: 12,
          child: _CircleIconButton(
            onTap: isFavoritePending ? null : onToggleFavorite,
            child: isFavoritePending
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: AppColors.white,
                    ),
                  )
                : Icon(
                    isFavorite ? Icons.favorite : Icons.favorite_border,
                    color: isFavorite
                        ? const Color(0xFFE53935)
                        : AppColors.white,
                    size: 22,
                  ),
          ),
        ),
        if (isBestPrice)
          Positioned(
            left: 20,
            bottom: 14,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: AppColors.brand,
                borderRadius: BorderRadius.circular(999),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.bolt_rounded, size: 16, color: AppColors.black),
                  const SizedBox(width: 4),
                  Text(
                    'MELHOR PREÇO DA REGIÃO',
                    style: AppTypography.mono(
                      fontWeight: FontWeight.w700,
                      color: AppColors.black,
                      letterSpacing: 0.3,
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

class _CircleIconButton extends StatelessWidget {
  const _CircleIconButton({this.icon, this.child, required this.onTap});

  final IconData? icon;
  final Widget? child;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.black.withValues(alpha: 0.45),
      shape: const CircleBorder(),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: SizedBox(
          width: 40,
          height: 40,
          child: Center(
            child: child ?? Icon(icon, color: AppColors.white, size: 22),
          ),
        ),
      ),
    );
  }
}
