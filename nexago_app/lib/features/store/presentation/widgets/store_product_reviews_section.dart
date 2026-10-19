import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../application/store_review_providers.dart';
import '../../domain/store_models.dart';
import '../../domain/store_review_rules.dart';
import '../store_review_copy.dart';
import 'store_review_parts.dart';

/// Seção "Avaliações" da página do produto (`LjAppReviews`): sem nenhuma, o
/// bloco "Ainda sem avaliações"; com 1–2, só o card; com 3 ou mais, a nota
/// média e a distribuição por cima. Carregando ou sem permissão de leitura
/// (rule ainda não publicada), a seção não aparece — nem o espaço dela.
class StoreProductReviewsSection extends ConsumerWidget {
  const StoreProductReviewsSection({
    super.key,
    required this.product,
    required this.now,
    required this.onSeeAll,
    this.topGap = 28,
  });

  final StoreProduct product;
  final DateTime now;
  final VoidCallback onSeeAll;

  /// Espaço acima da seção (só quando ela aparece).
  final double topGap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reviews = ref
        .watch(storeProductReviewsProvider(product.id))
        .valueOrNull;
    if (reviews == null) return const SizedBox.shrink();
    final colors = context.themeColors;
    final summary = storeReviewSummary(product);
    return Column(
      key: const ValueKey('store-product-reviews'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(height: topGap),
        Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Expanded(
              child: Text(
                StoreReviewCopy.sectionTitle,
                style: AppTypography.soraRegular(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  letterSpacing: -0.36,
                  color: colors.onSurface,
                ),
              ),
            ),
            if (reviews.length > 1)
              TextButton(
                key: const ValueKey('store-reviews-see-all'),
                onPressed: onSeeAll,
                style: TextButton.styleFrom(
                  foregroundColor: AppColors.brand,
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  minimumSize: const Size(0, 36),
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: Text(
                  StoreReviewCopy.seeAll(reviews.length),
                  style: AppTypography.soraRegular(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 14),
        if (reviews.isEmpty)
          const StoreReviewsEmpty()
        else ...[
          if (summary != null) ...[
            StoreReviewSummaryBlock(summary: summary),
            const SizedBox(height: 16),
          ],
          StoreReviewCard(review: reviews.first, now: now, compact: true),
        ],
      ],
    );
  }
}
