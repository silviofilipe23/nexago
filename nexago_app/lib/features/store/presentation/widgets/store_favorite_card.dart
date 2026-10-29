import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/store_favorites_rules.dart';
import '../../domain/store_models.dart';
import '../../domain/store_rules.dart';
import '../store_copy.dart';
import 'store_product_card.dart';
import 'store_style.dart';

const double _heartSize = 36;
const double _actionSize = 40;
const double _edge = 8;

/// Card dos favoritos (app 09): o card da vitrine com o coração cheio em
/// cima, à direita (tira dos favoritos), o selo do contrato à esquerda e a
/// ação redonda embaixo (laranja com "+"; escura com sino quando esgotado).
///
/// Mesma altura do card da vitrine: a grade usa [StoreProductCard.extent].
class StoreFavoriteCard extends StatelessWidget {
  const StoreFavoriteCard({
    super.key,
    required this.product,
    required this.onTap,
    required this.onAction,
    required this.onUnfavorite,
    this.pixDiscountPct,
  });

  final StoreProduct product;
  final num? pixDiscountPct;
  final VoidCallback onTap;

  /// A ação do card ([storeFavoriteAction]).
  final VoidCallback onAction;
  final VoidCallback onUnfavorite;

  @override
  Widget build(BuildContext context) {
    final badge = storeFavoriteBadge(product);
    final customizable = storeFavoriteCustomizable(product);
    final action = storeFavoriteAction(product).kind;
    final pixPct = pixDiscountPct;
    final foot = storeFavoriteFoot(product, hasPix: pixPct != null);
    final id = product.id;

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
                      child: StoreCardPhoto(url: product.coverUrl),
                    ),
                  ),
                  if (badge != null || customizable)
                    Positioned(
                      top: 10,
                      left: 10,
                      // Nunca por baixo do coração.
                      right: _edge + _heartSize + 6,
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (badge != null)
                            _Chip(
                              key: ValueKey('store-favorite-badge-$id'),
                              label: badge.label,
                              color: _badgeColor(badge.kind),
                            ),
                          if (badge != null && customizable)
                            const SizedBox(height: 6),
                          if (customizable)
                            const _Chip(
                              label: StoreCopy.favoritesCustomizableTag,
                              color: AppColors.onSurface,
                            ),
                        ],
                      ),
                    ),
                  Positioned(
                    top: _edge,
                    right: _edge,
                    child: _RoundButton(
                      key: ValueKey('store-favorite-heart-$id'),
                      size: _heartSize,
                      color: AppColors.black.withValues(alpha: 0.6),
                      tooltip: StoreCopy.favoritesRemove(product.name),
                      onTap: onUnfavorite,
                      child: const Icon(
                        Icons.favorite_rounded,
                        size: 17,
                        color: AppColors.brand,
                      ),
                    ),
                  ),
                  Positioned(
                    right: _edge,
                    bottom: _edge,
                    child: _RoundButton(
                      key: ValueKey('store-favorite-action-$id'),
                      size: _actionSize,
                      color: action == StoreFavoriteActionKind.notifyMe
                          ? AppColors.black.withValues(alpha: 0.7)
                          : AppColors.brand,
                      tooltip: _actionLabel(action),
                      onTap: onAction,
                      child: action == StoreFavoriteActionKind.notifyMe
                          ? const Icon(
                              Icons.notifications_none_rounded,
                              size: 18,
                              color: AppColors.onSurface,
                            )
                          : const Icon(
                              Icons.add_rounded,
                              size: 22,
                              color: StoreStyle.onBrand,
                            ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 10),
            StoreCardName(name: product.name),
            const SizedBox(height: 4),
            StoreCardPrice(product: product),
            if (foot != StoreFavoriteFoot.none) ...[
              const SizedBox(height: 2),
              switch (foot) {
                StoreFavoriteFoot.soldOut => const StoreCardFootnote(
                    text: TextSpan(text: StoreCopy.favoritesSoldOutFoot),
                  ),
                StoreFavoriteFoot.customize => StoreCardFootnote(
                    text: TextSpan(
                      text: product.customization?.name.enabled ?? false
                          ? StoreCopy.favoritesCustomizeFoot
                          : StoreCopy.favoritesCustomizeImageFoot,
                    ),
                  ),
                _ => StoreCardFootnote.pix(
                    priceCents: displayPriceCents(product),
                    discountPct: pixPct ?? 0,
                  ),
              },
            ],
          ],
        ),
      ),
    );
  }

  static Color _badgeColor(StoreFavoriteBadgeKind kind) => switch (kind) {
        StoreFavoriteBadgeKind.soldOut =>
          AppColors.onSurface.withValues(alpha: 0.62),
        StoreFavoriteBadgeKind.discount => AppColors.win,
        StoreFavoriteBadgeKind.lastUnits => AppColors.brandHover,
      };

  static String _actionLabel(StoreFavoriteActionKind kind) => switch (kind) {
        StoreFavoriteActionKind.notifyMe => StoreCopy.notifyMeCta,
        StoreFavoriteActionKind.customize => StoreCopy.customizeButton,
        StoreFavoriteActionKind.addDirect => StoreCopy.favoritesAdd,
        StoreFavoriteActionKind.viewOptions => StoreCopy.favoritesViewOptions,
      };
}

/// Pílula escura sobre a foto ("−R$ 20", "Esgotado", "Personalizável"): o
/// fundo é fixo porque a foto é sempre escura, nos dois temas. Encolhe em vez
/// de passar por baixo do coração.
class _Chip extends StatelessWidget {
  const _Chip({super.key, required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return FittedBox(
      fit: BoxFit.scaleDown,
      alignment: Alignment.centerLeft,
      child: Container(
        height: 22,
        padding: const EdgeInsets.symmetric(horizontal: 9),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: AppColors.black.withValues(alpha: 0.72),
          borderRadius: AppRadii.pillAll,
        ),
        child: Text(
          label.toUpperCase(),
          maxLines: 1,
          style: AppTypography.mono(
            fontSize: 10,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.76,
            height: 1,
            color: color,
          ),
        ),
      ),
    );
  }
}

class _RoundButton extends StatelessWidget {
  const _RoundButton({
    super.key,
    required this.size,
    required this.color,
    required this.tooltip,
    required this.onTap,
    required this.child,
  });

  final double size;
  final Color color;
  final String tooltip;
  final VoidCallback onTap;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: Material(
        color: color,
        shape: const CircleBorder(),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: SizedBox.square(dimension: size, child: Center(child: child)),
        ),
      ),
    );
  }
}
