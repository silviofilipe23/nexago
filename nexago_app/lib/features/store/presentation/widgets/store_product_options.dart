import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/store_models.dart';
import '../../domain/store_product_rules.dart';
import 'store_style.dart';

/// Eixos da página do produto: cor em bolinhas, estampa em miniaturas da foto
/// ligada ao valor (sem foto, botão), o resto em botões de 50px.
///
/// Disponibilidade em cascata (`storeAxisValueAvailable`). Cor ou estampa
/// riscada continua clicável (mostra as fotos); botão indisponível chama
/// [onUnavailable] (o "Avise-me", que ainda não existe). O eixo que falta no
/// "Adicionar" treme a cada [shakeTick] e mostra "Escolha um tamanho".
class StoreProductOptions extends StatelessWidget {
  const StoreProductOptions({
    super.key,
    required this.product,
    required this.selected,
    required this.onSelect,
    required this.onUnavailable,
    this.missingAxisId,
    this.shakeTick = 0,
    this.lowStockCaption,
    this.axisKeys = const {},
  });

  final StoreProduct product;
  final Map<String, String> selected;
  final void Function(StoreAxis axis, StoreAxisValue value) onSelect;
  final void Function(StoreAxis axis, StoreAxisValue value) onUnavailable;

  /// Eixo que faltou no "Adicionar"; some quando o atleta escolhe.
  final String? missingAxisId;
  final int shakeTick;

  /// "Só 2 no tamanho M", abaixo do último eixo.
  final String? lowStockCaption;

  /// Âncoras para rolar até o eixo que falta.
  final Map<String, GlobalKey> axisKeys;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final axes = product.axes;
    final caption = lowStockCaption;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < axes.length; i++) ...[
          if (i > 0) const SizedBox(height: 22),
          KeyedSubtree(
            key: axisKeys[axes[i].id],
            child: _AxisBlock(
              product: product,
              axisIndex: i,
              selected: selected,
              missing: missingAxisId == axes[i].id,
              shakeTick: shakeTick,
              onSelect: onSelect,
              onUnavailable: onUnavailable,
            ),
          ),
        ],
        if (caption != null) ...[
          const SizedBox(height: 12),
          Row(
            children: [
              const Icon(
                Icons.local_fire_department_outlined,
                size: 15,
                color: AppColors.brand,
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  caption,
                  style: AppTypography.soraRegular(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                    color: colors.onSurface,
                  ),
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }
}

class _AxisBlock extends StatelessWidget {
  const _AxisBlock({
    required this.product,
    required this.axisIndex,
    required this.selected,
    required this.missing,
    required this.shakeTick,
    required this.onSelect,
    required this.onUnavailable,
  });

  final StoreProduct product;
  final int axisIndex;
  final Map<String, String> selected;
  final bool missing;
  final int shakeTick;
  final void Function(StoreAxis axis, StoreAxisValue value) onSelect;
  final void Function(StoreAxis axis, StoreAxisValue value) onUnavailable;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final axis = product.axes[axisIndex];
    final kind = storeAxisKind(axis);
    final color = kind == StoreAxisKind.color;
    final look = isStoreLookAxis(axis);
    final chosen = storeSelectedValueLabel(axis, selected);
    final title =
        look && chosen.isNotEmpty ? '${axis.label} · $chosen' : axis.label;

    bool available(StoreAxisValue v) =>
        storeAxisValueAvailable(product, axisIndex, v.id, selected);
    // Cor/estampa riscada continua clicável: mostra as fotos dela.
    void tap(StoreAxisValue v) =>
        look || available(v) ? onSelect(axis, v) : onUnavailable(axis, v);
    String? photoOf(StoreAxisValue v) => kind == StoreAxisKind.pattern
        ? storeAxisValuePhotoUrl(product, axis, v.id)
        : null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title.toUpperCase(),
          style: AppTypography.eyebrow.copyWith(
            fontSize: 11,
            color: StoreStyle.secondary(colors),
          ),
        ),
        const SizedBox(height: 12),
        StoreShake(
          tick: missing ? shakeTick : 0,
          child: Wrap(
            spacing: color ? 10 : 8,
            runSpacing: color ? 10 : 8,
            children: [
              for (final value in axis.values)
                if (color)
                  _ColorSwatch(
                    key: ValueKey('store-axis-${axis.id}-${value.id}'),
                    value: value,
                    selected: selected[axis.id] == value.id,
                    available: available(value),
                    onTap: () => tap(value),
                  )
                else if (photoOf(value) case final photo?)
                  _PatternSwatch(
                    key: ValueKey('store-axis-${axis.id}-${value.id}'),
                    label: value.label,
                    photoUrl: photo,
                    selected: selected[axis.id] == value.id,
                    available: available(value),
                    onTap: () => tap(value),
                  )
                else
                  _AxisButton(
                    key: ValueKey('store-axis-${axis.id}-${value.id}'),
                    label: value.label,
                    selected: selected[axis.id] == value.id,
                    available: available(value),
                    onTap: () => tap(value),
                  ),
            ],
          ),
        ),
        if (missing) ...[
          const SizedBox(height: 10),
          Text(
            storeChooseAxisMessage(axis),
            style: AppTypography.soraRegular(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: AppColors.brand,
            ),
          ),
        ],
      ],
    );
  }
}

/// `#RRGGBB` (ou `RRGGBB`) → cor opaca; qualquer outra coisa vira `null`.
Color? storeHexColor(String? hex) {
  if (hex == null) return null;
  final clean = hex.trim().replaceFirst('#', '');
  if (clean.length != 6) return null;
  final value = int.tryParse(clean, radix: 16);
  return value == null ? null : Color(0xFF000000 | value);
}

class _ColorSwatch extends StatelessWidget {
  const _ColorSwatch({
    super.key,
    required this.value,
    required this.selected,
    required this.available,
    required this.onTap,
  });

  static const double _dot = 34;

  final StoreAxisValue value;
  final bool selected;
  final bool available;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final fill = storeHexColor(value.hex) ?? StoreStyle.surface(colors);
    return Semantics(
      button: true,
      selected: selected,
      label: value.label,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: Container(
          width: _dot + 10,
          height: _dot + 10,
          padding: const EdgeInsets.all(3),
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(
              color: selected ? AppColors.brand : Colors.transparent,
              width: 2,
            ),
          ),
          child: Opacity(
            opacity: available ? 1 : 0.45,
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: fill,
                shape: BoxShape.circle,
                border: Border.all(
                  color: colors.onSurface.withValues(alpha: 0.16),
                ),
              ),
              child: available
                  ? const SizedBox.expand()
                  : CustomPaint(
                      painter: _DiagonalStrike(colors.onSurface),
                      child: const SizedBox.expand(),
                    ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Estampa: miniatura da 1ª foto ligada ao valor, com o nome embaixo. Mesma
/// borda de destaque e mesmo esmaecido/risco da bolinha de cor.
class _PatternSwatch extends StatelessWidget {
  const _PatternSwatch({
    super.key,
    required this.label,
    required this.photoUrl,
    required this.selected,
    required this.available,
    required this.onTap,
  });

  static const double _thumb = 64;

  final String label;
  final String photoUrl;
  final bool selected;
  final bool available;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final dpr = MediaQuery.devicePixelRatioOf(context);
    return Semantics(
      button: true,
      selected: selected,
      label: label,
      excludeSemantics: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: SizedBox(
          width: _thumb + 10,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: _thumb + 10,
                height: _thumb + 10,
                padding: const EdgeInsets.all(3),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: selected ? AppColors.brand : Colors.transparent,
                    width: 2,
                  ),
                ),
                child: Opacity(
                  opacity: available ? 1 : 0.45,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        CachedNetworkImage(
                          imageUrl: photoUrl,
                          fit: BoxFit.cover,
                          memCacheHeight: (_thumb * dpr).round(),
                          placeholder: (_, _) => const StoreStripedBox(),
                          errorWidget: (_, _, _) => const StoreStripedBox(),
                        ),
                        DecoratedBox(
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: colors.onSurface.withValues(alpha: 0.16),
                            ),
                          ),
                        ),
                        if (!available)
                          CustomPaint(
                            painter: _DiagonalStrike(colors.onSurface),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 4),
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: AppTypography.soraRegular(
                  fontSize: 12,
                  fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
                  color: available
                      ? colors.onSurface
                      : StoreStyle.tertiary(colors).withValues(alpha: 0.6),
                ).copyWith(
                  decoration: available ? null : TextDecoration.lineThrough,
                  decorationColor: StoreStyle.tertiary(colors),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Risco diagonal da cor (ou estampa) sem saldo em tamanho nenhum.
class _DiagonalStrike extends CustomPainter {
  const _DiagonalStrike(this.color);

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final inset = size.width * 0.15;
    canvas.drawLine(
      Offset(size.width - inset, inset),
      Offset(inset, size.height - inset),
      Paint()
        ..color = color.withValues(alpha: 0.8)
        ..strokeWidth = 1.6
        ..strokeCap = StrokeCap.round,
    );
  }

  @override
  bool shouldRepaint(_DiagonalStrike oldDelegate) => oldDelegate.color != color;
}

class _AxisButton extends StatelessWidget {
  const _AxisButton({
    super.key,
    required this.label,
    required this.selected,
    required this.available,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final bool available;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final radius = BorderRadius.circular(14);
    return Semantics(
      button: true,
      selected: selected,
      enabled: available,
      child: Material(
        color: selected
            ? AppColors.brand.withValues(alpha: 0.14)
            : StoreStyle.surface(colors),
        shape: RoundedRectangleBorder(
          borderRadius: radius,
          side: BorderSide(
            color: selected
                ? AppColors.brand
                : colors.onSurface.withValues(alpha: 0.10),
            width: selected ? 1.6 : 1,
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          // Sem `alignment` no Container: dentro do Wrap ele viraria um Align
          // e ocuparia a largura toda. O Center com widthFactor encolhe na
          // largura do texto e centraliza na altura de 50.
          child: Container(
            height: 50,
            constraints: const BoxConstraints(minWidth: 62),
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Center(
              widthFactor: 1,
              child: Text(
                label,
                style: AppTypography.soraRegular(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: available
                      ? colors.onSurface
                      : StoreStyle.tertiary(colors).withValues(alpha: 0.3),
                ).copyWith(
                  decoration: available ? null : TextDecoration.lineThrough,
                  decorationColor: StoreStyle.tertiary(colors),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Treme o filho cada vez que [tick] muda (e não é 0) — o eixo que falta no
/// "Adicionar" e o nome com caractere inválido.
class StoreShake extends StatefulWidget {
  const StoreShake({super.key, required this.tick, required this.child});

  final int tick;
  final Widget child;

  @override
  State<StoreShake> createState() => _StoreShakeState();
}

class _StoreShakeState extends State<StoreShake>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 420),
  );

  @override
  void didUpdateWidget(StoreShake oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.tick != 0 && widget.tick != oldWidget.tick) {
      _controller.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      child: widget.child,
      builder: (_, child) {
        final t = _controller.value;
        final dx = math.sin(t * math.pi * 6) * 8 * (1 - t);
        return Transform.translate(offset: Offset(dx, 0), child: child);
      },
    );
  }
}
