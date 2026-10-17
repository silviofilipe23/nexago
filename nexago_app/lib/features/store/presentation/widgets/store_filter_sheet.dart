import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/store_rules.dart';
import '../store_copy.dart';
import 'store_style.dart';

/// Folha "Filtrar": ordenação, faixa de preço, retirada na minha arena e
/// promoção. Devolve os filtros aplicados ou `null` se fechar sem aplicar.
///
/// [countFor] diz quantos produtos sobram com o rascunho — o botão mostra
/// "Ver N produtos" antes de aplicar.
Future<StoreFilters?> showStoreFilterSheet({
  required BuildContext context,
  required StoreFilters initial,
  required bool hasPickupArena,
  required int Function(StoreFilters draft) countFor,
}) {
  return showModalBottomSheet<StoreFilters>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: context.themeColors.surfaceSheet,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadii.xl)),
    ),
    // Sem isScrollControlled a folha trava em 9/16 da tela sem rolagem.
    constraints: BoxConstraints(
      maxHeight: MediaQuery.sizeOf(context).height * 0.9,
    ),
    builder: (_) => StoreFilterSheet(
      initial: initial,
      hasPickupArena: hasPickupArena,
      countFor: countFor,
    ),
  );
}

class StoreFilterSheet extends StatefulWidget {
  const StoreFilterSheet({
    super.key,
    required this.initial,
    required this.hasPickupArena,
    required this.countFor,
  });

  final StoreFilters initial;
  final bool hasPickupArena;
  final int Function(StoreFilters draft) countFor;

  @override
  State<StoreFilterSheet> createState() => _StoreFilterSheetState();
}

class _StoreFilterSheetState extends State<StoreFilterSheet> {
  late StoreFilters _draft = widget.initial;

  void _set(StoreFilters next) => setState(() => _draft = next);

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final count = widget.countFor(_draft);
    final canClear = _draft != StoreFilters.none;

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
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 12, 0),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  StoreCopy.filterSheetTitle,
                  style: AppTypography.titleL.copyWith(color: colors.onSurface),
                ),
              ),
              TextButton(
                onPressed: canClear ? () => _set(StoreFilters.none) : null,
                child: Text(
                  StoreCopy.filterClear,
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    color: canClear ? AppColors.brand : colors.onSurfaceMuted,
                  ),
                ),
              ),
            ],
          ),
        ),
        Flexible(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                const _SectionLabel(StoreCopy.filterSort),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final sort in StoreSort.values)
                      StoreChoicePill(
                        label: sort.label,
                        selected: _draft.sort == sort,
                        onTap: () => _set(_draft.copyWith(sort: sort)),
                      ),
                  ],
                ),
                const SizedBox(height: 20),
                const _SectionLabel(StoreCopy.filterPrice),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final band in StorePriceBand.values)
                      StoreChoicePill(
                        label: band.label,
                        selected: _draft.priceBand == band,
                        // Tocar de novo na faixa escolhida tira a faixa.
                        onTap: () => _set(
                          _draft.copyWith(
                            priceBand: _draft.priceBand == band ? null : band,
                          ),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 20),
                const _SectionLabel(StoreCopy.filterMore),
                SwitchListTile.adaptive(
                  contentPadding: EdgeInsets.zero,
                  activeTrackColor: AppColors.brand,
                  title: Text(
                    StoreCopy.filterMyArena,
                    style: AppTypography.bodyM.copyWith(color: colors.onSurface),
                  ),
                  subtitle: widget.hasPickupArena
                      ? null
                      : Text(
                          StoreCopy.filterMyArenaNoArena,
                          style: AppTypography.bodyS.copyWith(
                            color: StoreStyle.tertiary(colors),
                          ),
                        ),
                  value: _draft.onlyMyArenaPickup,
                  onChanged: widget.hasPickupArena || _draft.onlyMyArenaPickup
                      ? (on) => _set(_draft.copyWith(onlyMyArenaPickup: on))
                      : null,
                ),
                SwitchListTile.adaptive(
                  contentPadding: EdgeInsets.zero,
                  activeTrackColor: AppColors.brand,
                  title: Text(
                    StoreCopy.filterOnSale,
                    style: AppTypography.bodyM.copyWith(color: colors.onSurface),
                  ),
                  value: _draft.onlyOnSale,
                  onChanged: (on) => _set(_draft.copyWith(onlyOnSale: on)),
                ),
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
            onPressed: () => Navigator.pop(context, _draft),
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.brand,
              foregroundColor: StoreStyle.onBrand,
              minimumSize: const Size.fromHeight(52),
              shape: const RoundedRectangleBorder(
                borderRadius: AppRadii.pillAll,
              ),
            ),
            child: Text(
              StoreCopy.filterApply(count),
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
          ),
        ),
      ],
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Text(
        label,
        style: AppTypography.eyebrow.copyWith(
          color: StoreStyle.tertiary(context.themeColors),
        ),
      ),
    );
  }
}

/// Pílula de escolha da vitrine (chip ativo: fundo claro, texto escuro).
class StoreChoicePill extends StatelessWidget {
  const StoreChoicePill({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
    this.enabled = true,
    this.leading,
    this.height = 40,
  });

  final String label;
  final bool selected;
  final bool enabled;
  final VoidCallback onTap;
  final Widget? leading;
  final double height;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final foreground = selected
        ? colors.canvas
        : enabled
            ? StoreStyle.secondary(colors)
            : StoreStyle.tertiary(colors).withValues(alpha: 0.25);
    return Semantics(
      selected: selected,
      button: true,
      enabled: enabled,
      child: Material(
        color: selected ? colors.onSurface : StoreStyle.surface(colors),
        borderRadius: AppRadii.pillAll,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: enabled ? onTap : null,
          child: Container(
            height: height,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            alignment: Alignment.center,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (leading != null) ...[leading!, const SizedBox(width: 8)],
                Text(
                  label,
                  style: AppTypography.soraRegular(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w600,
                    color: foreground,
                  ).copyWith(
                    decoration: enabled ? null : TextDecoration.lineThrough,
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
