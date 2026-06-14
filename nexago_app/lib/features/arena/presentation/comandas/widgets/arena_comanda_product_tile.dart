import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../domain/products/arena_product.dart';
import '../../../domain/products/arena_product_logic.dart';
import '../../widgets/arena_dashboard_tokens.dart';

class ArenaComandaProductTile extends StatelessWidget {
  const ArenaComandaProductTile({
    super.key,
    required this.product,
    required this.quantity,
    required this.onIncrement,
    this.onDecrement,
  });

  final ArenaProduct product;
  final int quantity;
  final VoidCallback onIncrement;
  final VoidCallback? onDecrement;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final status = productStockStatus(product);
    final isOut = status == ArenaProductStockStatus.out;
    final isSelected = quantity > 0;
    final emoji = product.emoji?.trim();
    final imageUrl = product.imageUrl?.trim();

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: isOut || isSelected ? null : onIncrement,
        borderRadius: BorderRadius.circular(ArenaDashboardTokens.cardRadius),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: context.themeColors.surfaceCard,
            borderRadius: BorderRadius.circular(ArenaDashboardTokens.cardRadius),
            border: Border.all(
              color: isSelected
                  ? AppColors.brand
                  : context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
              width: isSelected ? 2 : 1,
            ),
          ),
          child: Opacity(
            opacity: isOut ? 0.45 : 1,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _ProductTileImage(
                      emoji: emoji,
                      imageUrl: imageUrl,
                    ),
                    const SizedBox(height: 10),
                    Text(
                      product.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: context.themeColors.onSurface,
                        height: 1.2,
                      ),
                    ),
                    const Spacer(),
                    if (isSelected)
                      _QuantityStepper(
                        quantity: quantity,
                        onDecrement: onDecrement,
                        onIncrement: isOut ? null : onIncrement,
                      )
                    else ...[
                      Text(
                        formatPriceReais(product.priceCents),
                        style: const TextStyle(
                          color: AppColors.brand,
                          fontWeight: FontWeight.w800,
                          fontSize: 15,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        isOut
                            ? 'ESGOTADO'
                            : '${product.stockQuantity} em estoque',
                        style: AppTypography.mono(
                          color: isOut
                              ? AppColors.live
                              : context.themeColors.onSurfaceMuted,
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ],
                ),
                if (isSelected)
                  Positioned(
                    top: -6,
                    right: -6,
                    child: Container(
                      width: 24,
                      height: 24,
                      alignment: Alignment.center,
                      decoration: const BoxDecoration(
                        color: AppColors.brand,
                        shape: BoxShape.circle,
                      ),
                      child: Text(
                        '$quantity',
                        style: const TextStyle(
                          color: AppColors.black,
                          fontWeight: FontWeight.w900,
                          fontSize: 12,
                        ),
                      ),
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

class _QuantityStepper extends StatelessWidget {
  const _QuantityStepper({
    required this.quantity,
    required this.onDecrement,
    required this.onIncrement,
  });

  final int quantity;
  final VoidCallback? onDecrement;
  final VoidCallback? onIncrement;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        _StepperButton(
          icon: Icons.remove_rounded,
          onTap: onDecrement,
        ),
        Expanded(
          child: Text(
            '$quantity',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: context.themeColors.onSurface,
              fontWeight: FontWeight.w800,
              fontSize: 15,
            ),
          ),
        ),
        _StepperButton(
          icon: Icons.add_rounded,
          onTap: onIncrement,
          filled: true,
        ),
      ],
    );
  }
}

class _StepperButton extends StatelessWidget {
  const _StepperButton({
    required this.icon,
    required this.onTap,
    this.filled = false,
  });

  final IconData icon;
  final VoidCallback? onTap;
  final bool filled;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: filled
          ? AppColors.brand
          : context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(10),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: SizedBox(
          width: 36,
          height: 36,
          child: Icon(
            icon,
            size: 18,
            color: filled
                ? AppColors.black
                : (onTap == null
                    ? context.themeColors.onSurfaceMuted
                    : context.themeColors.onSurface),
          ),
        ),
      ),
    );
  }
}

class _ProductTileImage extends StatelessWidget {
  const _ProductTileImage({
    required this.emoji,
    required this.imageUrl,
  });

  final String? emoji;
  final String? imageUrl;

  @override
  Widget build(BuildContext context) {
    return AspectRatio(
      aspectRatio: 1.35,
      child: Container(
        decoration: BoxDecoration(
          color: context.themeColors.surfaceRaised,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: Stack(
          fit: StackFit.expand,
          children: [
            CustomPaint(
              painter: _ProductTileStripesPainter(
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
      ),
    );
  }
}

class _ProductTileStripesPainter extends CustomPainter {
  const _ProductTileStripesPainter({required this.color});

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
  bool shouldRepaint(covariant _ProductTileStripesPainter oldDelegate) {
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
        style: const TextStyle(fontSize: 32),
      ),
    );
  }
}
