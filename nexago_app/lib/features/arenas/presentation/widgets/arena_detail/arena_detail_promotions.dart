import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/arena_detail_profile_logic.dart';
import '../../../domain/arena_promotion.dart';
import '../../../domain/arena_promotion_display.dart';
import '../../../domain/slots_providers.dart';

/// Promoções ativas da arena no topo do perfil ("Ter–Qui · 14:00–17:00 ·
/// 20% off"). Antes elas só apareciam dentro da grade de horários. Tocar abre
/// a grade. Nada aparece enquanto carrega, sem promoção ou com erro.
class ArenaDetailPromotions extends ConsumerWidget {
  const ArenaDetailPromotions({
    super.key,
    required this.arenaId,
    required this.onOpenSlots,
    this.now,
  });

  /// Máximo de cartões no perfil; o resto aparece na grade.
  static const int maxVisible = 2;

  final String arenaId;
  final VoidCallback onOpenSlots;

  /// Relógio injetável para teste.
  final DateTime? now;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final all = ref.watch(arenaPromotionsProvider(arenaId)).valueOrNull;
    if (all == null) return const SizedBox.shrink();
    final promos = visibleArenaPromotions(all, now ?? DateTime.now());
    if (promos.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(top: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final (i, promo) in promos.take(maxVisible).indexed) ...[
            if (i > 0) const SizedBox(height: 8),
            _PromotionCard(promotion: promo, onTap: onOpenSlots),
          ],
        ],
      ),
    );
  }
}

class _PromotionCard extends StatelessWidget {
  const _PromotionCard({required this.promotion, required this.onTap});

  final ArenaPromotion promotion;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    final label = promotion.label.trim();

    return Material(
      color: AppColors.brand.withValues(alpha: 0.10),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: AppColors.brand.withValues(alpha: 0.35)),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
          child: Row(
            children: [
              Icon(Icons.local_offer_outlined,
                  size: 20, color: colors.brandText),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'PROMOÇÃO',
                      style: AppTypography.mono(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1.2,
                        color: colors.brandText,
                      ),
                    ),
                    if (label.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                          color: colors.onSurface,
                        ),
                      ),
                    ],
                    const SizedBox(height: 2),
                    Text(
                      arenaPromotionSummaryLabel(promotion),
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: colors.onSurfaceMuted,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(
                Icons.chevron_right_rounded,
                size: 20,
                color: colors.onSurfaceMuted,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
