import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../domain/products/arena_product.dart';
import '../../../domain/products/arena_product_logic.dart';
import '../../widgets/arena_dashboard_tokens.dart';

class ArenaProductCard extends StatelessWidget {
  const ArenaProductCard({
    super.key,
    required this.product,
    required this.onTap,
  });

  final ArenaProduct product;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final status = productStockStatus(product);
    final emoji = product.emoji?.trim();
    final imageUrl = product.imageUrl?.trim();
    final stockColor = switch (status) {
      ArenaProductStockStatus.ok => AppColors.win,
      ArenaProductStockStatus.low => AppColors.pending,
      ArenaProductStockStatus.out => AppColors.live,
    };

    return Material(
      color: context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(ArenaDashboardTokens.cardRadius),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              _ProductThumb(
                emoji: emoji,
                imageUrl: imageUrl,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      product.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: context.themeColors.onSurface,
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      formatPriceReais(product.priceCents),
                      style: const TextStyle(
                        color: AppColors.brand,
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 10),
                    _StockLevelBar(
                      fillRatio: productStockBarFillRatio(product),
                      minMarkerRatio: productStockBarMinMarkerRatio(product),
                      fillColor: stockColor,
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Text(
                          '${product.stockQuantity} un',
                          style: AppTypography.mono(
                            color: stockColor,
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const Spacer(),
                        Text(
                          'mín ${product.minStockQuantity}',
                          style: AppTypography.mono(
                            color: context.themeColors.onSurfaceMuted,
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Icon(
                Icons.chevron_right_rounded,
                color: context.themeColors.onSurfaceMuted.withValues(
                  alpha: 0.55,
                ),
                size: 22,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StockLevelBar extends StatelessWidget {
  const _StockLevelBar({
    required this.fillRatio,
    required this.minMarkerRatio,
    required this.fillColor,
  });

  final double fillRatio;
  final double minMarkerRatio;
  final Color fillColor;

  static const _barHeight = 8.0;
  static const _markerWidth = 1.5;

  @override
  Widget build(BuildContext context) {
    final trackColor =
        context.themeColors.onSurfaceMuted.withValues(alpha: 0.15);
    final markerColor = context.themeColors.onSurface.withValues(alpha: 0.72);

    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;
        final clampedMinRatio = minMarkerRatio.clamp(0.0, 1.0);
        final markerCenter = (width * clampedMinRatio).clamp(
          _markerWidth / 2,
          width - _markerWidth / 2,
        );
        final showMarker = minMarkerRatio > 0;

        return SizedBox(
          height: _barHeight,
          child: Stack(
            clipBehavior: Clip.none,
            alignment: Alignment.centerLeft,
            children: [
              Container(
                width: width,
                height: _barHeight,
                decoration: BoxDecoration(
                  color: trackColor,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
              FractionallySizedBox(
                widthFactor: fillRatio.clamp(0.0, 1.0),
                child: Container(
                  height: _barHeight,
                  decoration: BoxDecoration(
                    color: fillColor,
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
              if (showMarker)
                Positioned(
                  left: markerCenter - _markerWidth / 2,
                  top: 0,
                  bottom: 0,
                  child: Container(
                    width: _markerWidth,
                    decoration: BoxDecoration(
                      color: markerColor,
                      borderRadius: BorderRadius.circular(999),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.45),
                          blurRadius: 1,
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

class _ProductThumb extends StatelessWidget {
  const _ProductThumb({
    required this.emoji,
    required this.imageUrl,
  });

  final String? emoji;
  final String? imageUrl;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 56,
      height: 56,
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        shape: BoxShape.circle,
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        fit: StackFit.expand,
        children: [
          CustomPaint(
            painter: _ProductThumbStripesPainter(
              color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.08),
            ),
          ),
          if (imageUrl != null && imageUrl!.isNotEmpty)
            CachedNetworkImage(
              imageUrl: imageUrl!,
              fit: BoxFit.cover,
              errorWidget: (_, __, ___) => _EmojiFallback(emoji: emoji),
            )
          else
            _EmojiFallback(emoji: emoji),
        ],
      ),
    );
  }
}

class _ProductThumbStripesPainter extends CustomPainter {
  const _ProductThumbStripesPainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 1.2;

    const spacing = 10.0;
    for (var x = -size.height; x < size.width + size.height; x += spacing) {
      canvas.drawLine(
        Offset(x, size.height),
        Offset(x + size.height, 0),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _ProductThumbStripesPainter oldDelegate) {
    return oldDelegate.color != color;
  }
}

class _EmojiFallback extends StatelessWidget {
  const _EmojiFallback({required this.emoji});

  final String? emoji;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Text(
        emoji == null || emoji!.isEmpty ? '📦' : emoji!,
        style: const TextStyle(fontSize: 26),
      ),
    );
  }
}
