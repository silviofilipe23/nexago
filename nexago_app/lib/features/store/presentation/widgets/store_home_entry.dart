import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../application/store_providers.dart';
import '../store_copy.dart';
import 'store_style.dart';

/// Atalho "Loja" na home do atleta. Só aparece com `appConfig/store.enabled`
/// confirmado (carregando ou com erro = escondido). Já traz o respiro de
/// baixo da seção, então desligado não deixa vão.
class StoreHomeEntry extends ConsumerWidget {
  const StoreHomeEntry({super.key, this.onTap});

  /// Na home do shell a Loja é uma aba: o atalho troca de aba em vez de
  /// empilhar outra vitrine. Sem callback, abre a rota `/loja`.
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(storeEnabledProvider)) return const SizedBox.shrink();
    final colors = context.themeColors;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        0,
        AppSpacing.screenH,
        AppSpacing.sectionGap,
      ),
      child: Material(
        color: colors.surfaceCard,
        borderRadius: AppRadii.lgAll,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap ?? () => context.pushNamed(AppRouteNames.store),
          child: Container(
            padding: const EdgeInsets.all(AppSpacing.lg),
            decoration: BoxDecoration(
              borderRadius: AppRadii.lgAll,
              border: Border.all(color: StoreStyle.surface(colors)),
            ),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: AppColors.brand.withValues(alpha: 0.12),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.shopping_bag_outlined,
                    color: AppColors.brand,
                    size: 22,
                  ),
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        StoreCopy.homeEntryTitle,
                        style: AppTypography.titleS.copyWith(
                          color: colors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        StoreCopy.homeEntrySubtitle,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.bodyS.copyWith(
                          color: StoreStyle.secondary(colors),
                        ),
                      ),
                    ],
                  ),
                ),
                Icon(
                  Icons.chevron_right_rounded,
                  color: StoreStyle.tertiary(colors),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
