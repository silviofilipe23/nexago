import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../store_copy.dart';
import 'store_style.dart';

/// Header próprio da vitrine (voltar · "Loja" · pedidos · busca · favoritos ·
/// sacola) e dos favoritos (voltar · "Favoritos" + "{n} produtos" · busca ·
/// sacola). Como aba da barra inferior não há para onde voltar: sem [onBack],
/// sem o botão; sem [onFavorites], sem o coração; "Meus pedidos" só com sessão
/// ([onOrders]).
///
/// Não usa `NexaAppBar` de propósito: o contador da sacola é um `Stack` sobre
/// a ação, e badge em `Stack` derruba a barra nativa Liquid Glass do iOS
/// (cai no fallback). O desenho pede botões redondos de 44 com o contador
/// laranja — um header próprio, fixo FORA da lista (ver `NexaPageHeader`).
class StoreHeader extends StatelessWidget {
  const StoreHeader({
    super.key,
    this.title = StoreCopy.pageTitle,
    this.subtitle,
    required this.cartUnits,
    required this.pulseTick,
    this.onBack,
    this.leading,
    this.onOrders,
    required this.onSearch,
    this.onFavorites,
    required this.onCart,
  });

  final String title;

  /// Linha menor embaixo do título ("6 produtos"); `null` = sem linha.
  final String? subtitle;
  final int cartUnits;

  /// Muda a cada "+" que adicionou: a sacola pulsa.
  final int pulseTick;
  final VoidCallback? onBack;

  /// À esquerda do título quando não há [onBack] (Loja como aba): o botão da
  /// conta do atleta.
  final Widget? leading;

  /// "Meus pedidos"; `null` = sem o botão (deslogado).
  final VoidCallback? onOrders;
  final VoidCallback onSearch;
  final VoidCallback? onFavorites;
  final VoidCallback onCart;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final subtitle = this.subtitle;
    final titleText = Text(
      title,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: AppTypography.soraRegular(
        fontSize: 24,
        fontWeight: FontWeight.w800,
        letterSpacing: -0.72,
        height: 1.1,
        color: colors.onSurface,
      ),
    );
    return ConstrainedBox(
      constraints: const BoxConstraints(minHeight: StoreStyle.headerButton),
      child: Row(
        children: [
          if (onBack case final back?) ...[
            StoreRoundButton(
              icon: Icons.chevron_left_rounded,
              iconSize: 26,
              tooltip: StoreCopy.back,
              onTap: back,
            ),
            const SizedBox(width: 12),
          ] else if (leading case final leading?) ...[
            leading,
            const SizedBox(width: 10),
          ],
          Expanded(
            child: subtitle == null
                ? titleText
                : Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      titleText,
                      const SizedBox(height: 2),
                      Text(
                        subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.soraRegular(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w400,
                          color: StoreStyle.tertiary(colors),
                        ),
                      ),
                    ],
                  ),
          ),
          if (onOrders case final orders?) ...[
            StoreRoundButton(
              key: const ValueKey('store-header-orders'),
              icon: Icons.receipt_long_outlined,
              tooltip: StoreCopy.orders,
              onTap: orders,
            ),
            const SizedBox(width: 8),
          ],
          StoreRoundButton(
            icon: Icons.search_rounded,
            tooltip: StoreCopy.search,
            onTap: onSearch,
          ),
          const SizedBox(width: 8),
          if (onFavorites case final favorites?) ...[
            StoreRoundButton(
              key: const ValueKey('store-header-favorites'),
              icon: Icons.favorite_border_rounded,
              tooltip: StoreCopy.favoritesTitle,
              onTap: favorites,
            ),
            const SizedBox(width: 8),
          ],
          StoreBagButton(
            units: cartUnits,
            pulseTick: pulseTick,
            onTap: onCart,
          ),
        ],
      ),
    );
  }
}

/// Botão redondo de 44 com fundo de superfície translúcida. [glass]: escuro
/// translúcido com desfoque, para flutuar sobre a foto (página do produto).
class StoreRoundButton extends StatelessWidget {
  const StoreRoundButton({
    super.key,
    required this.icon,
    required this.tooltip,
    required this.onTap,
    this.iconSize = 20,
    this.glass = false,
    this.iconColor,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;
  final double iconSize;
  final bool glass;
  final Color? iconColor;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final button = Material(
      color: glass
          ? AppColors.black.withValues(alpha: 0.38)
          : StoreStyle.surface(colors),
      shape: const CircleBorder(),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: SizedBox.square(
          dimension: StoreStyle.headerButton,
          child: Icon(
            icon,
            size: iconSize,
            color: iconColor ?? (glass ? AppColors.white : colors.onSurface),
          ),
        ),
      ),
    );
    return Tooltip(
      message: tooltip,
      child: glass
          ? ClipOval(
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
                child: button,
              ),
            )
          : button,
    );
  }
}

/// Sacola com o contador (some em 0) e o pulso ao adicionar.
class StoreBagButton extends StatefulWidget {
  const StoreBagButton({
    super.key,
    required this.units,
    required this.pulseTick,
    required this.onTap,
    this.glass = false,
  });

  final int units;
  final int pulseTick;
  final VoidCallback onTap;

  /// Sobre a foto (ver [StoreRoundButton.glass]).
  final bool glass;

  @override
  State<StoreBagButton> createState() => _StoreBagButtonState();
}

class _StoreBagButtonState extends State<StoreBagButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 420),
  );

  late final Animation<double> _scale = TweenSequence<double>([
    TweenSequenceItem(
      tween: Tween<double>(begin: 1, end: 1.18)
          .chain(CurveTween(curve: Curves.easeOut)),
      weight: 40,
    ),
    TweenSequenceItem(
      tween: Tween<double>(begin: 1.18, end: 1)
          .chain(CurveTween(curve: Curves.easeInOut)),
      weight: 60,
    ),
  ]).animate(_pulse);

  @override
  void didUpdateWidget(StoreBagButton oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.pulseTick != oldWidget.pulseTick) _pulse.forward(from: 0);
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final units = widget.units;
    return ScaleTransition(
      scale: _scale,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          StoreRoundButton(
            icon: Icons.shopping_bag_outlined,
            tooltip: StoreCopy.cartTooltip(units),
            onTap: widget.onTap,
            glass: widget.glass,
          ),
          if (units > 0)
            Positioned(
              top: -3,
              right: -3,
              child: IgnorePointer(
                child: Container(
                  key: const ValueKey('store-cart-badge'),
                  constraints: const BoxConstraints(minWidth: 19),
                  height: 19,
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  alignment: Alignment.center,
                  decoration: const BoxDecoration(
                    color: AppColors.brand,
                    borderRadius: BorderRadius.all(Radius.circular(10)),
                  ),
                  child: Text(
                    units > 99 ? '99+' : '$units',
                    style: AppTypography.mono(
                      fontSize: 9.5,
                      fontWeight: FontWeight.w700,
                      color: StoreStyle.onBrand,
                      height: 1,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
