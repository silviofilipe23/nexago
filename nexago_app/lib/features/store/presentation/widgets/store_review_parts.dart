import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/store_review_models.dart';
import '../../domain/store_review_rules.dart';
import '../store_review_copy.dart';
import 'store_checkout_parts.dart';
import 'store_style.dart';

/// Peças das avaliações (`loja-avaliacao.jsx`): estrelas, chips, distribuição,
/// caimento e o card da avaliação, no traço da Loja.

/// Estrelas de leitura (`LjStars`): cheias em laranja, vazias só no contorno.
class StoreReviewStars extends StatelessWidget {
  const StoreReviewStars({
    super.key,
    required this.value,
    this.size = 16,
    this.gap = 3,
  });

  final int value;
  final double size;
  final double gap;

  @override
  Widget build(BuildContext context) {
    final off = StoreCheckoutStyle.line2(context.themeColors);
    return Semantics(
      label: StoreReviewCopy.starsLabel(value),
      child: ExcludeSemantics(
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (var i = 1; i <= 5; i++) ...[
              if (i > 1) SizedBox(width: gap),
              Icon(
                i <= value ? Icons.star_rounded : Icons.star_border_rounded,
                size: size,
                color: i <= value ? AppColors.brand : off,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Estrelas de escolha (o "O que achou do produto?"): tocar escolhe a nota.
class StoreReviewStarInput extends StatelessWidget {
  const StoreReviewStarInput({
    super.key,
    required this.value,
    required this.onChanged,
    this.size = 40,
    this.gap = 8,
    this.keyPrefix = 'store-review-star',
  });

  final int? value;
  final ValueChanged<int> onChanged;
  final double size;
  final double gap;

  /// Chave de cada estrela: `$keyPrefix-1` … `$keyPrefix-5`.
  final String keyPrefix;

  @override
  Widget build(BuildContext context) {
    final off = StoreCheckoutStyle.line2(context.themeColors);
    final v = value ?? 0;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 1; i <= 5; i++) ...[
          if (i > 1) SizedBox(width: gap),
          Semantics(
            button: true,
            selected: v == i,
            label:
                '${StoreReviewCopy.starsLabel(i)} · '
                '${storeReviewRatingLabel(i)}',
            child: InkResponse(
              key: ValueKey('$keyPrefix-$i'),
              radius: size * 0.65,
              onTap: () => onChanged(i),
              child: Icon(
                i <= v ? Icons.star_rounded : Icons.star_border_rounded,
                size: size,
                color: i <= v ? AppColors.brand : off,
              ),
            ),
          ),
        ],
      ],
    );
  }
}

/// Chip de escolha (`LjRvChip`): laranja com fundo tingido e ✓ quando ligado.
class StoreReviewChip extends StatelessWidget {
  const StoreReviewChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
    this.height = 40,
    this.expand = false,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;
  final double height;

  /// Ocupa a largura toda e centraliza (as três opções do caimento).
  final bool expand;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final text = Text(
      label,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: AppTypography.soraRegular(
        fontSize: 12.5,
        fontWeight: FontWeight.w600,
        color: selected ? colors.onSurface : StoreStyle.secondary(colors),
      ),
    );
    return Semantics(
      selected: selected,
      button: true,
      child: Material(
        color: selected ? StoreCheckoutStyle.tint : Colors.transparent,
        shape: StadiumBorder(
          side: BorderSide(
            color: selected ? AppColors.brand : StoreCheckoutStyle.line(colors),
            width: 1.5,
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Container(
            height: height,
            padding: const EdgeInsets.symmetric(horizontal: 13),
            // `alignment` faria o chip esticar na largura do Wrap; sem
            // `expand`, o chip tem a largura do texto.
            alignment: expand ? Alignment.center : null,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              mainAxisSize: expand ? MainAxisSize.max : MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (selected) ...[
                  const Icon(
                    Icons.check_rounded,
                    size: 14,
                    color: AppColors.brand,
                  ),
                  const SizedBox(width: 6),
                ],
                Flexible(child: text),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Etiqueta do card ("Conforto", "Veste pequeno").
class StoreReviewTagChip extends StatelessWidget {
  const StoreReviewTagChip(this.label, {super.key});

  final String label;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      height: 24,
      padding: const EdgeInsets.symmetric(horizontal: 9),
      decoration: BoxDecoration(
        color: StoreStyle.surface(colors),
        borderRadius: AppRadii.pillAll,
      ),
      child: Center(
        widthFactor: 1,
        child: Text(
          label,
          style: AppTypography.soraRegular(
            fontSize: 12,
            fontWeight: FontWeight.w400,
            color: StoreStyle.secondary(colors),
          ),
        ),
      ),
    );
  }
}

/// Distribuição por estrela (`LjRvDist`), de 5 a 1.
class StoreReviewDistribution extends StatelessWidget {
  const StoreReviewDistribution({super.key, required this.starsPct});

  final List<({int stars, int pct})> starsPct;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final mono = AppTypography.mono(
      fontSize: 11,
      fontWeight: FontWeight.w500,
      color: StoreStyle.tertiary(colors),
    );
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 0; i < starsPct.length; i++) ...[
          if (i > 0) const SizedBox(height: 7),
          Row(
            children: [
              SizedBox(
                width: 10,
                child: Text(
                  '${starsPct[i].stars}',
                  style: mono.copyWith(color: StoreStyle.secondary(colors)),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: ClipRRect(
                  borderRadius: AppRadii.pillAll,
                  child: SizedBox(
                    height: 6,
                    child: Stack(
                      children: [
                        Positioned.fill(
                          child: ColoredBox(
                            color: StoreCheckoutStyle.line(colors),
                          ),
                        ),
                        FractionallySizedBox(
                          widthFactor: (starsPct[i].pct / 100).clamp(0.0, 1.0),
                          heightFactor: 1,
                          child: const DecoratedBox(
                            decoration: BoxDecoration(
                              color: AppColors.brand,
                              borderRadius: AppRadii.pillAll,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              SizedBox(
                width: 34,
                child: Text(
                  '${starsPct[i].pct}%',
                  textAlign: TextAlign.right,
                  style: mono,
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }
}

/// Nota média + estrelas + distribuição (e a linha "N avaliações · X%
/// recomendam").
class StoreReviewSummaryBlock extends StatelessWidget {
  const StoreReviewSummaryBlock({super.key, required this.summary});

  final StoreReviewSummary summary;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  summary.averageLabel,
                  key: const ValueKey('store-reviews-average'),
                  style: AppTypography.soraRegular(
                    fontSize: 40,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -1.6,
                    height: 1,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 6),
                StoreReviewStars(value: summary.stars, size: 13, gap: 2),
              ],
            ),
            const SizedBox(width: 18),
            Expanded(
              child: StoreReviewDistribution(starsPct: summary.starsPct),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Text(
          StoreReviewCopy.countAndRecommend(
            storeReviewCountLabel(summary.count),
            summary.recommendPct,
          ),
          style: AppTypography.soraRegular(
            fontSize: 12.5,
            fontWeight: FontWeight.w400,
            color: StoreStyle.tertiary(colors),
          ),
        ),
      ],
    );
  }
}

/// Barra do caimento ("Pequeno · Veste bem · Grande").
class StoreReviewFitBarView extends StatelessWidget {
  const StoreReviewFitBarView({super.key, required this.bar});

  final StoreReviewFitBar bar;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final side = AppTypography.soraRegular(
      fontSize: 11.5,
      fontWeight: FontWeight.w400,
      color: StoreStyle.tertiary(colors),
    );
    const dot = 14.0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        const StoreSectionLabel(StoreReviewCopy.fitTitleLabel),
        const SizedBox(height: 12),
        SizedBox(
          height: dot,
          child: LayoutBuilder(
            builder: (context, constraints) {
              final width = constraints.maxWidth;
              final left = ((bar.positionPct / 100) * width - dot / 2).clamp(
                0.0,
                width - dot,
              );
              return Stack(
                children: [
                  Positioned(
                    left: 0,
                    right: 0,
                    top: (dot - 6) / 2,
                    height: 6,
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        color: StoreCheckoutStyle.line(colors),
                        borderRadius: AppRadii.pillAll,
                      ),
                    ),
                  ),
                  Positioned(
                    left: left,
                    top: 0,
                    width: dot,
                    height: dot,
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        color: AppColors.brand,
                        shape: BoxShape.circle,
                        border: Border.all(color: colors.canvas, width: 3),
                      ),
                    ),
                  ),
                ],
              );
            },
          ),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Text(StoreReviewCopy.fitSmall, style: side),
            Expanded(
              child: Text(
                bar.label,
                key: const ValueKey('store-reviews-fit-label'),
                textAlign: TextAlign.center,
                style: AppTypography.soraRegular(
                  fontSize: 11.5,
                  fontWeight: FontWeight.w600,
                  color: colors.onSurface,
                ),
              ),
            ),
            Text(StoreReviewCopy.fitLarge, style: side),
          ],
        ),
      ],
    );
  }
}

/// Iniciais do autor no círculo.
class StoreReviewAvatar extends StatelessWidget {
  const StoreReviewAvatar({super.key, required this.initials});

  final String initials;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      width: 34,
      height: 34,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: colors.surfaceSheet,
        shape: BoxShape.circle,
      ),
      child: Text(
        initials,
        style: AppTypography.soraRegular(
          fontSize: 12,
          fontWeight: FontWeight.w700,
          color: StoreStyle.secondary(colors),
        ),
      ),
    );
  }
}

/// Foto quadrada de uma avaliação (link público); tocar amplia.
class StoreReviewPhotoThumb extends StatelessWidget {
  const StoreReviewPhotoThumb({super.key, required this.url, this.size = 64});

  final String url;
  final double size;

  @override
  Widget build(BuildContext context) {
    final dpr = MediaQuery.devicePixelRatioOf(context);
    const striped = StoreStripedBox();
    return GestureDetector(
      onTap: () => showStoreReviewPhoto(context, url),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: SizedBox.square(
          dimension: size,
          child: CachedNetworkImage(
            imageUrl: url,
            fit: BoxFit.cover,
            memCacheHeight: (size * dpr).round(),
            placeholder: (_, _) => striped,
            errorWidget: (_, _, _) => striped,
          ),
        ),
      ),
    );
  }
}

/// Foto em tela cheia (pinça para ampliar).
Future<void> showStoreReviewPhoto(BuildContext context, String url) {
  return showDialog<void>(
    context: context,
    barrierColor: Colors.black.withValues(alpha: 0.9),
    builder: (dialogContext) => Stack(
      children: [
        Positioned.fill(
          child: InteractiveViewer(
            child: Center(
              child: CachedNetworkImage(imageUrl: url, fit: BoxFit.contain),
            ),
          ),
        ),
        Positioned(
          top: MediaQuery.paddingOf(dialogContext).top + 8,
          right: 12,
          child: IconButton(
            tooltip: StoreReviewCopy.closePhoto,
            icon: const Icon(Icons.close_rounded, color: AppColors.white),
            onPressed: () => Navigator.pop(dialogContext),
          ),
        ),
      ],
    ),
  );
}

/// Card de uma avaliação (`LjRvCard`). [compact] = o da página do produto
/// (cartão com borda); senão, a linha da lista com divisor embaixo.
class StoreReviewCard extends StatelessWidget {
  const StoreReviewCard({
    super.key,
    required this.review,
    required this.now,
    this.compact = false,
  });

  final StorePublicReview review;
  final DateTime now;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final r = review;
    final meta = storeReviewMetaLine(r, now);
    final chips = storeReviewChips(r);
    final photoSize = compact ? 64.0 : 84.0;
    final content = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            StoreReviewAvatar(initials: r.authorInitials),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Wrap(
                    spacing: 8,
                    runSpacing: 2,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Text(
                        r.authorName,
                        style: AppTypography.soraRegular(
                          fontSize: 13.5,
                          fontWeight: FontWeight.w700,
                          color: colors.onSurface,
                        ),
                      ),
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.verified_user_outlined,
                            size: 13,
                            color: colors.win,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            StoreReviewCopy.verified,
                            style: AppTypography.soraRegular(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: colors.win,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                  if (meta.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      meta,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.soraRegular(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w400,
                        color: StoreStyle.tertiary(colors),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 8),
            StoreReviewStars(value: r.rating, size: 14, gap: 2),
          ],
        ),
        if (r.comment.isNotEmpty) ...[
          const SizedBox(height: 10),
          Text(
            r.comment,
            style: AppTypography.soraRegular(
              fontSize: 13.5,
              fontWeight: FontWeight.w400,
              height: 1.55,
              color: colors.onSurface,
            ),
          ),
        ],
        if (r.photos.isNotEmpty) ...[
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final url in r.photos)
                StoreReviewPhotoThumb(url: url, size: photoSize),
            ],
          ),
        ],
        if (chips.isNotEmpty) ...[
          const SizedBox(height: 10),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [for (final c in chips) StoreReviewTagChip(c)],
          ),
        ],
      ],
    );
    if (compact) {
      return Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: StoreCheckoutStyle.card(colors),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: StoreCheckoutStyle.line(colors)),
        ),
        child: content,
      );
    }
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 20),
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(color: StoreCheckoutStyle.line(colors)),
        ),
      ),
      child: content,
    );
  }
}

/// "Ainda sem avaliações" (produto sem nenhuma).
class StoreReviewsEmpty extends StatelessWidget {
  const StoreReviewsEmpty({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      key: const ValueKey('store-reviews-empty'),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: StoreStyle.surface(colors),
        borderRadius: AppRadii.lgAll,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            Icons.star_border_rounded,
            size: 20,
            color: StoreStyle.tertiary(colors),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  StoreReviewCopy.emptyTitle,
                  style: AppTypography.soraRegular(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  StoreReviewCopy.emptyBody,
                  style: AppTypography.soraRegular(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w400,
                    height: 1.5,
                    color: StoreStyle.secondary(colors),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Selo "Avaliar" do card do pedido (`LjAppMeusPedidos`): pílula laranja
/// tingida com a estrela.
class StoreReviewPillButton extends StatelessWidget {
  const StoreReviewPillButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.height = 44,
  });

  final String label;
  final VoidCallback? onPressed;
  final double height;

  @override
  Widget build(BuildContext context) {
    return FilledButton(
      onPressed: onPressed,
      style: FilledButton.styleFrom(
        backgroundColor: StoreCheckoutStyle.tint,
        foregroundColor: AppColors.brandHover,
        minimumSize: Size(0, height),
        padding: const EdgeInsets.symmetric(horizontal: 14),
        shape: const StadiumBorder(),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.star_rounded, size: 15, color: AppColors.brand),
          const SizedBox(width: 5),
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.soraRegular(
                fontSize: 13,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
