import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/store_models.dart';
import '../../domain/store_product_rules.dart';
import '../../domain/store_rules.dart';
import '../store_copy.dart';
import 'store_style.dart';

/// Selos, nota, nome, preço e Pix do topo do painel.
class StoreProductHeadline extends StatelessWidget {
  const StoreProductHeadline({
    super.key,
    required this.product,
    required this.price,
    required this.now,
    this.collectionLabel = '',
    this.pixDiscountPct,
  });

  final StoreProduct product;
  final StoreSelectionPrice price;
  final DateTime now;
  final String collectionLabel;
  final num? pixDiscountPct;

  /// Selo do produto na página: no app o painel tem espaço para o nome
  /// inteiro ("Mais vendida"); todos em laranja, como no desenho.
  static String? badgeLabel(StoreProduct p, DateTime now) {
    final badge = p.badge;
    final expiresAt = p.badgeExpiresAt;
    if (badge == null || (expiresAt != null && !now.isBefore(expiresAt))) {
      return null;
    }
    return switch (badge) {
      StoreBadge.bestSeller => 'Mais vendida',
      StoreBadge.isNew => 'Nova',
      StoreBadge.limitedEdition => 'Edição limitada',
    };
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final badge = badgeLabel(product, now);
    final pixPct = pixDiscountPct;
    final strike = price.strikeCents;
    final custom = product.customization;
    final showRating = product.ratingCount >= 3 && product.ratingAvg != null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (badge != null ||
            product.soldOut ||
            collectionLabel.isNotEmpty ||
            showRating) ...[
          Row(
            children: [
              Expanded(
                child: Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    if (product.soldOut)
                      const _Pill(label: StoreCopy.soldOutBadge, dark: true)
                    else if (badge != null)
                      _Pill(label: badge),
                    if (collectionLabel.isNotEmpty)
                      _Pill(label: collectionLabel, dark: true),
                  ],
                ),
              ),
              if (showRating) _Rating(product: product),
            ],
          ),
          const SizedBox(height: 14),
        ],
        Text(
          product.name,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: AppTypography.soraRegular(
            fontSize: 26,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.78,
            height: 1.15,
            color: colors.onSurface,
          ),
        ),
        const SizedBox(height: 12),
        Wrap(
          crossAxisAlignment: WrapCrossAlignment.end,
          spacing: 8,
          children: [
            if (price.from)
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Text(
                  StoreCopy.fromPrefix.trim(),
                  style: AppTypography.soraRegular(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: StoreStyle.secondary(colors),
                  ),
                ),
              ),
            Text(
              StoreCopy.price(price.cents),
              style: AppTypography.soraRegular(
                fontSize: 28,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.6,
                height: 1.1,
                color: colors.onSurface,
              ),
            ),
            if (strike != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Text(
                  StoreCopy.price(strike),
                  style: AppTypography.soraRegular(
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    color: StoreStyle.tertiary(colors),
                  ).copyWith(decoration: TextDecoration.lineThrough),
                ),
              ),
          ],
        ),
        if (pixPct != null) ...[
          const SizedBox(height: 4),
          Text.rich(
            TextSpan(
              children: [
                TextSpan(
                  text: StoreCopy.price(pixPriceCents(price.cents, pixPct)),
                  style: const TextStyle(
                    color: AppColors.brand,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const TextSpan(text: StoreCopy.pixSuffix),
              ],
            ),
            style: AppTypography.soraRegular(
              fontSize: 15,
              fontWeight: FontWeight.w500,
              color: StoreStyle.secondary(colors),
            ),
          ),
        ],
        if (custom != null && custom.fromCents > 0) ...[
          const SizedBox(height: 6),
          Text(
            StoreCopy.customizeFrom(custom.fromCents),
            style: AppTypography.soraRegular(
              fontSize: 12.5,
              fontWeight: FontWeight.w500,
              color: StoreStyle.tertiary(colors),
            ),
          ),
        ],
      ],
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.label, this.dark = false});

  final String label;
  final bool dark;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      height: 26,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: dark ? StoreStyle.surface(colors) : AppColors.brand,
        borderRadius: AppRadii.pillAll,
      ),
      child: Text(
        label.toUpperCase(),
        style: AppTypography.mono(
          fontSize: 10,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.9,
          height: 1,
          color: dark ? colors.onSurface : StoreStyle.onBrand,
        ),
      ),
    );
  }
}

class _Rating extends StatelessWidget {
  const _Rating({required this.product});

  final StoreProduct product;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final avg = product.ratingAvg ?? 0;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Icon(Icons.star_rounded, size: 18, color: AppColors.brand),
        const SizedBox(width: 4),
        Text(
          avg.toStringAsFixed(1).replaceAll('.', ','),
          style: AppTypography.soraRegular(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: colors.onSurface,
          ),
        ),
        const SizedBox(width: 4),
        Text(
          StoreCopy.ratingCount(product.ratingCount),
          style: AppTypography.soraRegular(
            fontSize: 14,
            fontWeight: FontWeight.w400,
            color: StoreStyle.tertiary(colors),
          ),
        ),
      ],
    );
  }
}

/// Bloco "Personalize" do produto personalizável. O fluxo (02b/02c) ainda
/// não existe: o botão avisa "em breve".
class StoreCustomizeBlock extends StatelessWidget {
  const StoreCustomizeBlock({
    super.key,
    required this.customization,
    required this.onCustomize,
  });

  final StoreCustomization customization;
  final VoidCallback onCustomize;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: StoreStyle.surface(colors),
        borderRadius: AppRadii.lgAll,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(
                Icons.brush_outlined,
                size: 18,
                color: AppColors.brand,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  StoreCopy.customizeTitle,
                  style: AppTypography.titleS.copyWith(
                    color: colors.onSurface,
                  ),
                ),
              ),
              OutlinedButton(
                onPressed: onCustomize,
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.brand,
                  side: const BorderSide(color: AppColors.brand),
                  visualDensity: VisualDensity.compact,
                  shape: const RoundedRectangleBorder(
                    borderRadius: AppRadii.pillAll,
                  ),
                ),
                child: const Text(
                  StoreCopy.customizeButton,
                  style: TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                Icons.schedule_rounded,
                size: 15,
                color: StoreStyle.tertiary(colors),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  StoreCopy.madeToOrder(
                    customization.leadDays,
                    defectOnlyReturns: customization.defectOnlyReturns,
                  ),
                  style: AppTypography.bodyS.copyWith(
                    color: StoreStyle.secondary(colors),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// A linha-resumo do "Como receber" (abre a folha com as opções).
class StoreReceiveRow extends StatelessWidget {
  const StoreReceiveRow({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          StoreCopy.receiveTitle,
          style: AppTypography.eyebrow.copyWith(
            fontSize: 11,
            color: StoreStyle.secondary(colors),
          ),
        ),
        const SizedBox(height: 12),
        Material(
          color: StoreStyle.surface(colors),
          borderRadius: AppRadii.lgAll,
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            key: const ValueKey('store-receive-row'),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
              child: Row(
                children: [
                  Icon(icon, size: 20, color: AppColors.brand),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppTypography.titleS.copyWith(
                            color: colors.onSurface,
                          ),
                        ),
                        if (subtitle.isNotEmpty) ...[
                          const SizedBox(height: 2),
                          Text(
                            subtitle,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppTypography.bodyS.copyWith(
                              color: StoreStyle.secondary(colors),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  Icon(
                    Icons.chevron_right_rounded,
                    color: StoreStyle.tertiary(colors),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// Uma opção da folha "Como receber".
class StoreReceiveOption {
  const StoreReceiveOption({
    required this.id,
    required this.icon,
    required this.title,
    this.subtitle = '',
    required this.priceLabel,
    this.free = false,
  });

  /// `retirada` ou o id da modalidade de entrega.
  final String id;
  final IconData icon;
  final String title;
  final String subtitle;
  final String priceLabel;

  /// "Grátis" em verde.
  final bool free;
}

/// O que a folha devolve: a opção escolhida ou o pedido de trocar a arena.
class StoreReceiveResult {
  const StoreReceiveResult.option(String this.optionId) : changeArena = false;
  const StoreReceiveResult.changeArena()
      : optionId = null,
        changeArena = true;

  final String? optionId;
  final bool changeArena;
}

Future<StoreReceiveResult?> showStoreReceiveSheet({
  required BuildContext context,
  required List<StoreReceiveOption> options,
  required String? selectedId,
  required String? arenaActionLabel,
  String footnote = '',
}) {
  return showModalBottomSheet<StoreReceiveResult>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: context.themeColors.surfaceSheet,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadii.xl)),
    ),
    constraints: BoxConstraints(
      maxHeight: MediaQuery.sizeOf(context).height * 0.85,
    ),
    builder: (sheetContext) {
      final colors = sheetContext.themeColors;
      return Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 10),
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: colors.onSurfaceMuted.withValues(alpha: 0.35),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 14, 20, 8),
            child: Text(
              StoreCopy.receiveSheetTitle,
              style: AppTypography.titleL.copyWith(color: colors.onSurface),
            ),
          ),
          Flexible(
            child: ListView(
              shrinkWrap: true,
              padding: EdgeInsets.fromLTRB(
                12,
                0,
                12,
                16 + MediaQuery.paddingOf(sheetContext).bottom,
              ),
              children: [
                for (final option in options)
                  _ReceiveOptionTile(
                    option: option,
                    selected: option.id == selectedId,
                    onTap: () => Navigator.pop(
                      sheetContext,
                      StoreReceiveResult.option(option.id),
                    ),
                  ),
                if (arenaActionLabel != null)
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton.icon(
                      onPressed: () => Navigator.pop(
                        sheetContext,
                        const StoreReceiveResult.changeArena(),
                      ),
                      style: TextButton.styleFrom(
                        foregroundColor: AppColors.brand,
                      ),
                      icon: const Icon(Icons.place_outlined, size: 18),
                      label: Text(
                        arenaActionLabel,
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ),
                  ),
                if (footnote.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(8, 8, 8, 0),
                    child: Text(
                      footnote,
                      style: AppTypography.bodyS.copyWith(
                        color: StoreStyle.tertiary(colors),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      );
    },
  );
}

class _ReceiveOptionTile extends StatelessWidget {
  const _ReceiveOptionTile({
    required this.option,
    required this.selected,
    required this.onTap,
  });

  final StoreReceiveOption option;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: selected
            ? AppColors.brand.withValues(alpha: 0.10)
            : StoreStyle.surface(colors),
        shape: RoundedRectangleBorder(
          borderRadius: AppRadii.mdAll,
          side: BorderSide(
            color: selected ? AppColors.brand : Colors.transparent,
            width: 1.4,
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  selected ? Icons.check_circle_rounded : option.icon,
                  size: 20,
                  color:
                      selected ? AppColors.brand : StoreStyle.secondary(colors),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        option.title,
                        style: AppTypography.titleS.copyWith(
                          color: colors.onSurface,
                        ),
                      ),
                      if (option.subtitle.isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Text(
                          option.subtitle,
                          style: AppTypography.bodyS.copyWith(
                            color: StoreStyle.secondary(colors),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(width: 10),
                Text(
                  option.priceLabel,
                  style: AppTypography.soraRegular(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: option.free ? AppColors.win : colors.onSurface,
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

/// Detalhes (lista chave/valor com divisores) e a descrição (4 linhas +
/// "Ler mais").
class StoreProductDetails extends StatelessWidget {
  const StoreProductDetails({
    super.key,
    required this.details,
    required this.description,
  });

  final List<StoreDetail> details;
  final String description;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final divider = Divider(
      height: 1,
      thickness: 1,
      color: colors.onSurface.withValues(alpha: 0.08),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          StoreCopy.detailsTitle,
          style: AppTypography.eyebrow.copyWith(
            fontSize: 11,
            color: StoreStyle.secondary(colors),
          ),
        ),
        const SizedBox(height: 6),
        for (var i = 0; i < details.length; i++) ...[
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  flex: 2,
                  child: Text(
                    details[i].label,
                    style: AppTypography.bodyM.copyWith(
                      color: StoreStyle.secondary(colors),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  flex: 3,
                  child: Text(
                    details[i].value,
                    textAlign: TextAlign.right,
                    style: AppTypography.bodyM.copyWith(
                      color: colors.onSurface,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ),
          if (i < details.length - 1) divider,
        ],
        if (description.isNotEmpty) ...[
          SizedBox(height: details.isEmpty ? 6 : 16),
          _ExpandableText(text: description),
        ],
      ],
    );
  }
}

class _ExpandableText extends StatefulWidget {
  const _ExpandableText({required this.text});

  final String text;

  @override
  State<_ExpandableText> createState() => _ExpandableTextState();
}

class _ExpandableTextState extends State<_ExpandableText> {
  static const int _collapsedLines = 4;
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final style = AppTypography.bodyM.copyWith(
      color: StoreStyle.secondary(colors),
    );
    return LayoutBuilder(
      builder: (context, constraints) {
        final painter = TextPainter(
          text: TextSpan(text: widget.text, style: style),
          maxLines: _collapsedLines,
          textDirection: Directionality.of(context),
          textScaler: MediaQuery.textScalerOf(context),
        )..layout(maxWidth: constraints.maxWidth);
        final overflows = painter.didExceedMaxLines;
        painter.dispose();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.text,
              maxLines: _expanded ? null : _collapsedLines,
              overflow: _expanded ? null : TextOverflow.ellipsis,
              style: style,
            ),
            if (overflows)
              TextButton(
                onPressed: () => setState(() => _expanded = !_expanded),
                style: TextButton.styleFrom(
                  foregroundColor: AppColors.brand,
                  padding: EdgeInsets.zero,
                  minimumSize: const Size(0, 36),
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: Text(
                  _expanded ? StoreCopy.readLess : StoreCopy.readMore,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
          ],
        );
      },
    );
  }
}

/// "Combina com": carrossel horizontal de cards compactos.
class StoreRelatedCarousel extends StatelessWidget {
  const StoreRelatedCarousel({
    super.key,
    required this.products,
    required this.onTap,
  });

  static const double _cardWidth = 140;

  final List<StoreProduct> products;
  final ValueChanged<StoreProduct> onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final scaler = MediaQuery.textScalerOf(context);
    final height = _cardWidth +
        10 +
        scaler.scale(13) * 1.3 +
        4 +
        scaler.scale(14) * 1.3 +
        4;
    final dpr = MediaQuery.devicePixelRatioOf(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Text(
            StoreCopy.relatedTitle,
            style: AppTypography.soraRegular(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.36,
              color: colors.onSurface,
            ),
          ),
        ),
        const SizedBox(height: 14),
        SizedBox(
          height: height,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 20),
            itemCount: products.length,
            separatorBuilder: (_, _) => const SizedBox(width: 12),
            itemBuilder: (_, i) {
              final p = products[i];
              final cover = p.coverUrl;
              return SizedBox(
                width: _cardWidth,
                child: Semantics(
                  button: true,
                  label: p.name,
                  child: GestureDetector(
                    key: ValueKey('store-related-${p.id}'),
                    behavior: HitTestBehavior.opaque,
                    onTap: () => onTap(p),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        ClipRRect(
                          borderRadius: AppRadii.lgAll,
                          child: SizedBox.square(
                            dimension: _cardWidth,
                            child: cover == null
                                ? const StoreStripedBox()
                                : CachedNetworkImage(
                                    imageUrl: cover,
                                    fit: BoxFit.cover,
                                    memCacheHeight: (_cardWidth * dpr).round(),
                                    placeholder: (_, _) =>
                                        const StoreStripedBox(),
                                    errorWidget: (_, _, _) =>
                                        const StoreStripedBox(),
                                  ),
                          ),
                        ),
                        const SizedBox(height: 10),
                        Text(
                          p.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppTypography.soraRegular(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            height: 1.3,
                            color: colors.onSurface,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          priceVaries(p)
                              ? '${StoreCopy.fromPrefix}'
                                  '${StoreCopy.price(displayPriceCents(p))}'
                              : StoreCopy.price(displayPriceCents(p)),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppTypography.soraRegular(
                            fontSize: 14,
                            fontWeight: FontWeight.w800,
                            height: 1.3,
                            color: colors.onSurface,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
