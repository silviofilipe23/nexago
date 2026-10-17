import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../store_copy.dart';
import 'store_style.dart';

/// Estado do botão principal da barra fixa.
enum StoreProductCta {
  /// "Adicionar · R$ total".
  add,

  /// "✓ Adicionado" por 1,5 s depois de adicionar.
  added,

  /// Produto esgotado: "Avise-me quando chegar" (secundário).
  notifyMe,

  /// Catálogo do cache: "Sem conexão", desabilitado.
  offline,
}

/// Barra fixa no rodapé: quantidade (− n +) e o botão principal, com
/// gradiente pro fundo por cima do conteúdo.
class StoreProductBottomBar extends StatelessWidget {
  const StoreProductBottomBar({
    super.key,
    required this.cta,
    required this.qty,
    required this.maxQty,
    required this.totalCents,
    required this.onQtyChanged,
    required this.onPrimary,
    this.busy = false,
  });

  final StoreProductCta cta;
  final int qty;
  final int maxQty;
  final int totalCents;
  final ValueChanged<int> onQtyChanged;
  final VoidCallback onPrimary;

  /// Adicionando: o toque repetido não vira duas escritas.
  final bool busy;

  /// Altura sem a safe area (o conteúdo reserva esse espaço no fim).
  static const double height = 28 + 56 + 12;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final bottom = MediaQuery.paddingOf(context).bottom;
    return Container(
      padding: EdgeInsets.fromLTRB(20, 28, 20, 12 + bottom),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          stops: const [0, 0.38],
          colors: [colors.canvas.withValues(alpha: 0), colors.canvas],
        ),
      ),
      child: Row(
        children: [
          if (cta != StoreProductCta.notifyMe) ...[
            _QtyStepper(
              qty: qty,
              max: maxQty,
              enabled: cta == StoreProductCta.add && !busy,
              onChanged: onQtyChanged,
            ),
            const SizedBox(width: 12),
          ],
          Expanded(child: _primary(colors)),
        ],
      ),
    );
  }

  Widget _primary(AppThemeColors colors) {
    const shape = RoundedRectangleBorder(borderRadius: AppRadii.pillAll);
    const size = Size.fromHeight(56);
    final label = AppTypography.soraRegular(
      fontSize: 16,
      fontWeight: FontWeight.w800,
      letterSpacing: -0.2,
    );
    switch (cta) {
      case StoreProductCta.notifyMe:
        return OutlinedButton.icon(
          key: const ValueKey('store-product-cta'),
          onPressed: onPrimary,
          style: OutlinedButton.styleFrom(
            foregroundColor: colors.onSurface,
            side: BorderSide(color: StoreStyle.tertiary(colors)),
            minimumSize: size,
            shape: shape,
          ),
          icon: const Icon(Icons.notifications_none_rounded, size: 20),
          label: Text(StoreCopy.notifyMeCta, style: label),
        );
      case StoreProductCta.offline:
        return FilledButton.icon(
          key: const ValueKey('store-product-cta'),
          onPressed: null,
          style: FilledButton.styleFrom(minimumSize: size, shape: shape),
          icon: const Icon(Icons.cloud_off_rounded, size: 18),
          label: Text(StoreCopy.offlineCta, style: label),
        );
      case StoreProductCta.added:
      case StoreProductCta.add:
        final added = cta == StoreProductCta.added;
        return FilledButton(
          key: const ValueKey('store-product-cta'),
          onPressed: busy || added ? () {} : onPrimary,
          style: FilledButton.styleFrom(
            backgroundColor: added ? AppColors.win : AppColors.brand,
            foregroundColor: StoreStyle.onBrand,
            minimumSize: size,
            shape: shape,
            padding: const EdgeInsets.symmetric(horizontal: 16),
          ),
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 180),
            child: added
                ? Row(
                    key: const ValueKey('added'),
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.check_rounded, size: 20),
                      const SizedBox(width: 6),
                      Text(StoreCopy.addedCta, style: label),
                    ],
                  )
                : FittedBox(
                    key: const ValueKey('add'),
                    fit: BoxFit.scaleDown,
                    child: Text(StoreCopy.addCta(totalCents), style: label),
                  ),
          ),
        );
    }
  }
}

class _QtyStepper extends StatelessWidget {
  const _QtyStepper({
    required this.qty,
    required this.max,
    required this.enabled,
    required this.onChanged,
  });

  final int qty;
  final int max;
  final bool enabled;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      height: 56,
      decoration: BoxDecoration(
        color: StoreStyle.surface(colors),
        borderRadius: AppRadii.lgAll,
        border: Border.all(color: colors.onSurface.withValues(alpha: 0.10)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton(
            key: const ValueKey('store-qty-less'),
            tooltip: StoreCopy.qtyLess,
            onPressed: enabled && qty > 1 ? () => onChanged(qty - 1) : null,
            color: colors.onSurface,
            icon: const Icon(Icons.remove_rounded, size: 20),
          ),
          SizedBox(
            width: 22,
            child: Text(
              '$qty',
              key: const ValueKey('store-qty-value'),
              textAlign: TextAlign.center,
              style: AppTypography.soraRegular(
                fontSize: 16,
                fontWeight: FontWeight.w800,
                color: colors.onSurface,
              ),
            ),
          ),
          IconButton(
            key: const ValueKey('store-qty-more'),
            tooltip: StoreCopy.qtyMore,
            onPressed: enabled && qty < max ? () => onChanged(qty + 1) : null,
            color: colors.onSurface,
            icon: const Icon(Icons.add_rounded, size: 20),
          ),
        ],
      ),
    );
  }
}
