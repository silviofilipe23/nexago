import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/store_models.dart';
import '../../domain/store_rules.dart';
import '../store_copy.dart';
import 'store_filter_sheet.dart';
import 'store_style.dart';

/// "+" de produto com variação: escolhe os eixos (cor com bolinha, tamanho)
/// e devolve o SKU escolhido, ou `null` se fechar. Combinação sem saldo fica
/// desabilitada.
Future<String?> showStoreVariantSheet({
  required BuildContext context,
  required StoreProduct product,
}) {
  return showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: context.themeColors.surfaceSheet,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadii.xl)),
    ),
    constraints: BoxConstraints(
      maxHeight: MediaQuery.sizeOf(context).height * 0.9,
    ),
    builder: (_) => StoreVariantSheet(product: product),
  );
}

class StoreVariantSheet extends StatefulWidget {
  const StoreVariantSheet({super.key, required this.product});

  final StoreProduct product;

  @override
  State<StoreVariantSheet> createState() => _StoreVariantSheetState();
}

class _StoreVariantSheetState extends State<StoreVariantSheet> {
  late final Map<String, String> _selected =
      storeInitialVariantSelection(widget.product);

  void _toggle(String axisId, String valueId) {
    setState(() {
      if (_selected[axisId] == valueId) {
        _selected.remove(axisId);
      } else {
        _selected[axisId] = valueId;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final product = widget.product;
    final variant = storeVariantFor(product, _selected);
    final addable = variant != null && variant.inStock ? variant : null;
    final price = variant?.priceCents ?? displayPriceCents(product);

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const SizedBox(height: 10),
        Container(
          width: 40,
          height: 4,
          decoration: BoxDecoration(
            color: colors.onSurfaceMuted.withValues(alpha: 0.35),
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        Flexible(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  product.name,
                  style: AppTypography.titleM.copyWith(color: colors.onSurface),
                ),
                const SizedBox(height: 4),
                Text(
                  variant == null && priceVaries(product)
                      ? '${StoreCopy.fromPrefix}${StoreCopy.price(price)}'
                      : StoreCopy.price(price),
                  style: AppTypography.soraRegular(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: colors.onSurface,
                  ),
                ),
                for (final axis in product.axes) ...[
                  const SizedBox(height: 20),
                  Text(
                    axis.label.toUpperCase(),
                    style: AppTypography.eyebrow.copyWith(
                      color: StoreStyle.tertiary(colors),
                    ),
                  ),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final value in axis.values)
                        StoreChoicePill(
                          label: value.label,
                          selected: _selected[axis.id] == value.id,
                          enabled: storeVariantValueAvailable(
                            product,
                            axisId: axis.id,
                            valueId: value.id,
                            selected: _selected,
                          ),
                          leading: _swatch(value.hex),
                          onTap: () => _toggle(axis.id, value.id),
                        ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ),
        Container(
          padding: EdgeInsets.fromLTRB(
            20,
            12,
            20,
            16 + MediaQuery.paddingOf(context).bottom,
          ),
          decoration: BoxDecoration(
            border: Border(top: BorderSide(color: colors.surfaceRaised)),
          ),
          child: FilledButton(
            onPressed: addable == null
                ? null
                : () => Navigator.pop(context, addable.id),
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.brand,
              foregroundColor: StoreStyle.onBrand,
              minimumSize: const Size.fromHeight(52),
              shape: const RoundedRectangleBorder(
                borderRadius: AppRadii.pillAll,
              ),
            ),
            child: Text(
              addable != null
                  ? StoreCopy.variantAdd
                  : variant == null
                      ? StoreCopy.variantPick
                      : StoreCopy.variantUnavailable,
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
          ),
        ),
      ],
    );
  }

  Widget? _swatch(String? hex) {
    final color = _parseHex(hex);
    if (color == null) return null;
    return Container(
      width: 14,
      height: 14,
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white.withValues(alpha: 0.35)),
      ),
    );
  }
}

/// `#RRGGBB` (ou `RRGGBB`) → cor opaca; qualquer outra coisa vira `null`.
Color? _parseHex(String? hex) {
  if (hex == null) return null;
  final clean = hex.trim().replaceFirst('#', '');
  if (clean.length != 6) return null;
  final value = int.tryParse(clean, radix: 16);
  return value == null ? null : Color(0xFF000000 | value);
}
