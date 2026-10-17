import 'package:flutter/material.dart';

import '../../../core/layout/nexa_page_header.dart';
import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import 'store_copy.dart';
import 'widgets/store_header.dart';
import 'widgets/store_style.dart';

/// Destinos da Loja que ainda não existem (página do produto, carrinho):
/// avisa que chegam na próxima etapa e volta pra vitrine.
class StoreComingSoonPage extends StatelessWidget {
  const StoreComingSoonPage({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    void back() => popOrGo(context, AppRoutes.store);
    return Scaffold(
      backgroundColor: colors.canvas,
      body: NexaPageHeader(
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenH),
        header: Row(
          children: [
            StoreRoundButton(
              icon: Icons.chevron_left_rounded,
              iconSize: 26,
              tooltip: StoreCopy.back,
              onTap: back,
            ),
          ],
        ),
        child: Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 64,
                  height: 64,
                  decoration: BoxDecoration(
                    color: AppColors.brand.withValues(alpha: 0.12),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.shopping_bag_outlined,
                    color: AppColors.brand,
                    size: 28,
                  ),
                ),
                const SizedBox(height: AppSpacing.xl),
                Text(
                  StoreCopy.comingSoonTitle,
                  textAlign: TextAlign.center,
                  style: AppTypography.titleL.copyWith(color: colors.onSurface),
                ),
                const SizedBox(height: AppSpacing.sm),
                Text(
                  StoreCopy.comingSoonBody,
                  textAlign: TextAlign.center,
                  style: AppTypography.bodyM.copyWith(
                    color: StoreStyle.secondary(colors),
                  ),
                ),
                const SizedBox(height: AppSpacing.xxl),
                FilledButton(
                  onPressed: back,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brand,
                    foregroundColor: StoreStyle.onBrand,
                    minimumSize: const Size(0, 48),
                    shape: const RoundedRectangleBorder(
                      borderRadius: AppRadii.pillAll,
                    ),
                  ),
                  child: const Text(
                    StoreCopy.comingSoonBack,
                    style: TextStyle(fontWeight: FontWeight.w800),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
