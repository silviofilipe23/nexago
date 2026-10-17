import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/store_models.dart';
import '../../domain/store_rules.dart';
import '../store_copy.dart';
import 'store_style.dart';

const double _nameFontSize = 13.5;
const double _nameLineHeight = 1.25;
const double _priceFontSize = 16;
const double _pixFontSize = 11.5;

/// Card da grade (app): foto, selo, "+", nome em até 2 linhas, preço e Pix.
/// Sem categoria, nota nem coração — o card do app é mais enxuto que o web.
class StoreProductCard extends StatelessWidget {
  const StoreProductCard({
    super.key,
    required this.product,
    required this.now,
    required this.onTap,
    required this.onQuickAdd,
    this.pixDiscountPct,
  });

  final StoreProduct product;

  /// Relógio da tela (o selo "nova" vence).
  final DateTime now;
  final num? pixDiscountPct;
  final VoidCallback onTap;
  final VoidCallback onQuickAdd;

  /// Altura fixa do card na grade, acompanhando a fonte do sistema.
  static double extent(TextScaler scaler) {
    final name = scaler.scale(_nameFontSize) * _nameLineHeight * 2;
    final price = scaler.scale(_priceFontSize) * 1.35;
    final pix = scaler.scale(_pixFontSize) * 1.4;
    return StoreStyle.photoHeight + 10 + name + 4 + price + 2 + pix + 4;
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final scaler = MediaQuery.textScalerOf(context);
    final badge = storeCardBadge(product, now);
    final price = displayPriceCents(product);
    final strike = strikePriceCents(product);
    final pixPct = pixDiscountPct;

    return Semantics(
      button: true,
      label: product.name,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SizedBox(
              height: StoreStyle.photoHeight,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  ClipRRect(
                    borderRadius: const BorderRadius.all(
                      Radius.circular(StoreStyle.photoRadius),
                    ),
                    child: Opacity(
                      opacity: product.soldOut ? 0.55 : 1,
                      child: _Photo(url: product.coverUrl),
                    ),
                  ),
                  if (badge != null)
                    Positioned(
                      top: 10,
                      left: 10,
                      child: StoreCardBadgeChip(badge: badge),
                    ),
                  Positioned(
                    right: 10,
                    bottom: 10,
                    child: _QuickAddButton(
                      soldOut: product.soldOut,
                      onTap: onQuickAdd,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 10),
            SizedBox(
              height: scaler.scale(_nameFontSize) * _nameLineHeight * 2 + 1,
              child: Text(
                product.name,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.soraRegular(
                  fontSize: _nameFontSize,
                  fontWeight: FontWeight.w600,
                  height: _nameLineHeight,
                  color: colors.onSurface,
                ),
              ),
            ),
            const SizedBox(height: 4),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text.rich(
                TextSpan(
                  children: [
                    if (priceVaries(product))
                      TextSpan(
                        text: StoreCopy.fromPrefix,
                        style: AppTypography.soraRegular(
                          fontSize: _pixFontSize,
                          fontWeight: FontWeight.w500,
                          color: StoreStyle.secondary(colors),
                        ),
                      ),
                    TextSpan(text: StoreCopy.price(price)),
                    if (strike != null) ...[
                      const TextSpan(text: '  '),
                      TextSpan(
                        text: StoreCopy.price(strike),
                        style: AppTypography.soraRegular(
                          fontSize: _pixFontSize,
                          fontWeight: FontWeight.w500,
                          color: StoreStyle.tertiary(colors),
                        ).copyWith(decoration: TextDecoration.lineThrough),
                      ),
                    ],
                  ],
                ),
                maxLines: 1,
                style: AppTypography.soraRegular(
                  fontSize: _priceFontSize,
                  fontWeight: FontWeight.w800,
                  height: 1.3,
                  color: colors.onSurface,
                ),
              ),
            ),
            if (pixPct != null) ...[
              const SizedBox(height: 2),
              Text.rich(
                TextSpan(
                  children: [
                    TextSpan(
                      text: StoreCopy.price(pixPriceCents(price, pixPct)),
                      style: const TextStyle(color: AppColors.brand),
                    ),
                    const TextSpan(text: StoreCopy.pixSuffix),
                  ],
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.soraRegular(
                  fontSize: _pixFontSize,
                  fontWeight: FontWeight.w500,
                  height: 1.3,
                  color: StoreStyle.tertiary(colors),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _Photo extends StatelessWidget {
  const _Photo({required this.url});

  final String? url;

  @override
  Widget build(BuildContext context) {
    final url = this.url;
    const striped = StoreStripedBox();
    if (url == null) return striped;
    final dpr = MediaQuery.devicePixelRatioOf(context);
    return CachedNetworkImage(
      imageUrl: url,
      fit: BoxFit.cover,
      // Decodifica na altura do card: a grade pode ter centenas de fotos.
      memCacheHeight: (StoreStyle.photoHeight * dpr).round(),
      placeholder: (_, _) => striped,
      errorWidget: (_, _, _) => striped,
    );
  }
}

/// Selo do card ("Top", "Nova", "-X%", "Esgotado").
class StoreCardBadgeChip extends StatelessWidget {
  const StoreCardBadgeChip({super.key, required this.badge});

  final StoreCardBadge badge;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final orange = badge.tone == StoreBadgeTone.orange;
    return Container(
      height: 22,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: orange ? AppColors.brand : colors.canvas.withValues(alpha: 0.7),
        borderRadius: AppRadii.pillAll,
      ),
      child: Text(
        badge.label.toUpperCase(),
        style: AppTypography.mono(
          fontSize: 9.5,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.76,
          height: 1,
          color: orange ? StoreStyle.onBrand : colors.onSurface,
        ),
      ),
    );
  }
}

class _QuickAddButton extends StatelessWidget {
  const _QuickAddButton({required this.soldOut, required this.onTap});

  final bool soldOut;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Tooltip(
      message: soldOut ? StoreCopy.notifyMe : StoreCopy.addTooltip,
      child: Material(
        color: soldOut ? colors.canvas.withValues(alpha: 0.7) : AppColors.brand,
        shape: const CircleBorder(),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: SizedBox.square(
            dimension: 36,
            child: Icon(
              soldOut
                  ? Icons.notifications_none_rounded
                  : Icons.add_rounded,
              size: soldOut ? 18 : 22,
              color: soldOut ? colors.onSurface : StoreStyle.onBrand,
            ),
          ),
        ),
      ),
    );
  }
}
