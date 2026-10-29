import 'dart:typed_data';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/store_customize_rules.dart';
import '../../domain/store_models.dart';
import '../store_copy.dart';
import 'store_product_options.dart' show storeHexColor;
import 'store_style.dart';

/// Estilo do nome em cada fonte — os mesmos cards do backoffice: Bloco
/// (display 800), Clássica (serifada itálica 700), Mono (mono 700).
TextStyle storeCustomFontStyle(
  StoreCustomFont font, {
  required double fontSize,
  Color? color,
}) {
  switch (font) {
    case StoreCustomFont.bloco:
      return AppTypography.soraRegular(
        fontSize: fontSize,
        fontWeight: FontWeight.w800,
        letterSpacing: fontSize * 0.02,
        height: 1.1,
        color: color,
      );
    case StoreCustomFont.classica:
      return TextStyle(
        fontFamily: 'Georgia',
        fontFamilyFallback: const ['Times New Roman', 'serif', 'Noto Serif'],
        fontStyle: FontStyle.italic,
        fontWeight: FontWeight.w700,
        fontSize: fontSize,
        height: 1.1,
        color: color,
      );
    case StoreCustomFont.mono:
      return AppTypography.mono(
        fontSize: fontSize,
        fontWeight: FontWeight.w700,
        height: 1.1,
        color: color,
      );
  }
}

/// A imagem que a prévia desenha na área.
class StorePreviewImage {
  const StorePreviewImage({
    required this.aspect,
    required this.transform,
    this.bytes,
  });

  /// `null` = vetor (SVG): a prévia mostra um bloco "SVG" no lugar.
  final Uint8List? bytes;

  /// Largura ÷ altura.
  final double aspect;
  final StoreImageTransform transform;
}

/// O que a prévia desenha nas costas, abaixo (ou acima) do nome: o número
/// na fonte e na cor do nome, ou a imagem centralizada e inteira na caixa.
class StorePreviewBack {
  const StorePreviewBack({
    required this.box,
    required this.type,
    this.number = '',
    this.font = StoreCustomFont.bloco,
    this.color = Colors.white,
    this.hasImage = false,
    this.imageBytes,
    this.active = false,
  });

  /// Caixa das costas em frações do quadro ([storeBackBox]).
  final StoreBackBox box;
  final StoreBackType type;
  final String number;
  final StoreCustomFont font;
  final Color color;

  /// Imagem escolhida, centralizada e inteira na caixa ("contain").
  final bool hasImage;

  /// `null` com [hasImage] = vetor (SVG): um bloco "SVG" no lugar.
  final Uint8List? imageBytes;

  /// Aba Costas aberta: caixa tracejada e o espaço reservado.
  final bool active;
}

/// Prévia ilustrativa (300 de altura no desenho): foto do lado e da cor, ou
/// listrado "MOCKUP · FRENTE/COSTAS"; o nome na faixa do placement (uma
/// linha, fonte reduzida até caber), a imagem na área, com arrastar e
/// pinça presos dentro dela, e as costas (número ou imagem) na caixa das
/// costas.
///
/// O quadro é a peça de referência de 60 × 70 cm centrada na prévia: as
/// áreas mantêm a proporção em cm.
class StoreCustomizePreview extends StatefulWidget {
  const StoreCustomizePreview({
    super.key,
    required this.height,
    required this.side,
    required this.onSide,
    this.photo,
    this.garmentHex,
    this.namePlacement,
    this.nameText = '',
    this.nameFont = StoreCustomFont.bloco,
    this.nameColor = Colors.white,
    this.nameActive = false,
    this.area,
    this.image,
    this.imageActive = false,
    this.onTransform,
    this.back,
  });

  final double height;
  final StorePhotoView side;
  final ValueChanged<StorePhotoView> onSide;
  final StorePhoto? photo;

  /// Cor da peça (`hex` do valor de cor escolhido): o fundo do mockup sem
  /// foto, para o nome na cor padrão (a de maior contraste) não sumir.
  final String? garmentHex;

  /// `null` = produto sem nome.
  final StoreNamePlacement? namePlacement;
  final String nameText;
  final StoreCustomFont nameFont;
  final Color nameColor;

  /// Aba Nome aberta: caixa tracejada (e "SEU NOME" com o campo vazio).
  final bool nameActive;

  /// `null` = produto sem imagem.
  final StoreCustomArea? area;
  final StorePreviewImage? image;

  /// Aba Imagem aberta: contorno com alças e o ajuste fino ligado.
  final bool imageActive;
  final ValueChanged<StoreImageTransform>? onTransform;

  /// `null` = produto sem costas.
  final StorePreviewBack? back;

  @override
  State<StoreCustomizePreview> createState() => _StoreCustomizePreviewState();
}

class _StoreCustomizePreviewState extends State<StoreCustomizePreview> {
  StoreImageTransform? _start;
  Offset _startFocal = Offset.zero;

  bool get _showName {
    final placement = widget.namePlacement;
    if (placement == null || storeNameSide(placement) != widget.side) {
      return false;
    }
    return widget.nameText.isNotEmpty || widget.nameActive;
  }

  bool get _showArea =>
      widget.area != null &&
      widget.side == StorePhotoView.front &&
      (widget.image != null || widget.imageActive);

  bool get _showBack {
    final back = widget.back;
    if (back == null || widget.side != StorePhotoView.back) return false;
    if (back.active) return true;
    return back.type == StoreBackType.number
        ? back.number.isNotEmpty
        : back.hasImage;
  }

  bool get _canAdjust =>
      widget.imageActive &&
      widget.image != null &&
      widget.onTransform != null &&
      widget.side == StorePhotoView.front;

  @override
  Widget build(BuildContext context) {
    final back = widget.side == StorePhotoView.back;
    final dpr = MediaQuery.devicePixelRatioOf(context);
    final photo = widget.photo;
    // Mockup na cor da peça; rótulo escuro sobre peça clara.
    final garment =
        storeHexColor(widget.garmentHex) ?? storeHexColor(kStoreMockupBaseHex)!;
    final lightGarment = storePrefersDarkText(widget.garmentHex);
    final mockup = StoreStripedBox(
      key: const ValueKey('store-customize-mockup'),
      color: garment,
      stripeColor: lightGarment
          ? AppColors.black.withValues(alpha: 0.06)
          : const Color(0x08FFFFFF),
    );
    return ClipRRect(
      borderRadius: BorderRadius.circular(28),
      child: SizedBox(
        height: widget.height,
        child: LayoutBuilder(
          builder: (context, constraints) {
            final size = Size(constraints.maxWidth, widget.height);
            final frame = _frameRect(size);
            return Stack(
              fit: StackFit.expand,
              children: [
                if (photo == null)
                  mockup
                else
                  CachedNetworkImage(
                    imageUrl: photo.url,
                    fit: BoxFit.cover,
                    memCacheHeight: (widget.height * dpr).round(),
                    placeholder: (_, _) => mockup,
                    errorWidget: (_, _, _) => mockup,
                  ),
                if (photo == null)
                  Positioned(
                    left: 0,
                    right: 0,
                    bottom: 18,
                    child: IgnorePointer(
                      child: Text(
                        StoreCopy.customizeMockup(back: back),
                        textAlign: TextAlign.center,
                        style: AppTypography.mono(
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                          letterSpacing: 2.2,
                          color: lightGarment
                              ? AppColors.black.withValues(alpha: 0.4)
                              : AppColors.white.withValues(alpha: 0.32),
                        ),
                      ),
                    ),
                  ),
                if (_showName) _name(frame),
                if (_showBack) _back(frame),
                if (_showArea) ..._area(frame),
                if (_canAdjust)
                  Positioned.fill(
                    child: GestureDetector(
                      key: const ValueKey('store-customize-preview-gesture'),
                      behavior: HitTestBehavior.translucent,
                      onScaleStart: (d) {
                        _start = widget.image!.transform;
                        _startFocal = d.focalPoint;
                      },
                      onScaleUpdate: (d) => _adjust(d, frame),
                      onScaleEnd: (_) => _start = null,
                    ),
                  ),
                Positioned(
                  top: 12,
                  left: 12,
                  child: _SidePills(side: widget.side, onSide: widget.onSide),
                ),
                if (_canAdjust)
                  Positioned(
                    left: 16,
                    right: 16,
                    bottom: photo == null ? 40 : 16,
                    child: IgnorePointer(
                      child: Text(
                        StoreCopy.customizeDragHint,
                        textAlign: TextAlign.center,
                        style: AppTypography.soraRegular(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w500,
                          color: AppColors.white.withValues(alpha: 0.78),
                        ).copyWith(
                          shadows: const [
                            Shadow(color: Colors.black54, blurRadius: 6),
                          ],
                        ),
                      ),
                    ),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }

  /// Peça de 60 × 70 cm centrada (proporção 6:7).
  Rect _frameRect(Size size) {
    var height = size.height;
    var width = height * kStoreGarmentWidthCm / kStoreGarmentHeightCm;
    if (width > size.width) {
      width = size.width;
      height = width * kStoreGarmentHeightCm / kStoreGarmentWidthCm;
    }
    return Rect.fromLTWH(
      (size.width - width) / 2,
      (size.height - height) / 2,
      width,
      height,
    );
  }

  Widget _name(Rect frame) {
    final placement = widget.namePlacement!;
    final center = storeNameCenter(placement);
    final bandWidth = frame.width * storeNameBandWidth(placement);
    final boxHeight = frame.height * kStoreNameBandHeight;
    final empty = widget.nameText.isEmpty;
    final text = Text(
      empty ? StoreCopy.customizeYourName : widget.nameText,
      key: const ValueKey('store-customize-preview-name'),
      maxLines: 1,
      softWrap: false,
      style: storeCustomFontStyle(
        widget.nameFont,
        fontSize: boxHeight * 0.62,
        color: widget.nameColor.withValues(alpha: empty ? 0.35 : 1),
      ),
    );
    return Positioned(
      left: frame.left + center.x * frame.width - bandWidth / 2,
      top: frame.top + center.y * frame.height - boxHeight / 2,
      width: bandWidth,
      height: boxHeight,
      child: IgnorePointer(
        child: CustomPaint(
          foregroundPainter: widget.nameActive
              ? const _DashedBorderPainter(color: AppColors.brand)
              : null,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            child: Center(
              child: FittedBox(fit: BoxFit.scaleDown, child: text),
            ),
          ),
        ),
      ),
    );
  }

  /// Número (uma linha, fonte reduzida até caber) ou imagem inteira na
  /// caixa das costas.
  Widget _back(Rect frame) {
    final back = widget.back!;
    final rect = Rect.fromCenter(
      center: Offset(
        frame.left + back.box.x * frame.width,
        frame.top + back.box.y * frame.height,
      ),
      width: frame.width * back.box.width,
      height: frame.height * back.box.height,
    );
    final Widget content;
    if (back.type == StoreBackType.number) {
      final empty = back.number.isEmpty;
      content = Padding(
        padding: const EdgeInsets.all(4),
        child: Center(
          child: FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(
              empty ? StoreCopy.customizeYourNumber : back.number,
              key: const ValueKey('store-customize-preview-back-number'),
              maxLines: 1,
              softWrap: false,
              style: storeCustomFontStyle(
                back.font,
                fontSize: rect.height * 0.8,
                color: back.color.withValues(alpha: empty ? 0.35 : 1),
              ),
            ),
          ),
        ),
      );
    } else {
      final bytes = back.imageBytes;
      content = !back.hasImage
          ? const _ImagePlaceholder(label: StoreCopy.customizeYourImage)
          : bytes == null
              ? const _ImagePlaceholder(label: 'SVG')
              : Image.memory(
                  bytes,
                  key: const ValueKey('store-customize-preview-back-image'),
                  fit: BoxFit.contain,
                  gaplessPlayback: true,
                  errorBuilder: (_, _, _) => const _ImagePlaceholder(label: ''),
                );
    }
    return Positioned.fromRect(
      rect: rect,
      child: IgnorePointer(
        child: CustomPaint(
          key: const ValueKey('store-customize-preview-back'),
          foregroundPainter: back.active
              ? const _DashedBorderPainter(color: AppColors.brand)
              : null,
          child: content,
        ),
      ),
    );
  }

  Rect _areaRect(Rect frame) {
    final area = widget.area!;
    final box = storeCustomAreaBox(area);
    final center = storeCustomAreaCenter(area.id);
    final width = frame.width * box.width;
    final height = frame.height * box.height;
    return Rect.fromCenter(
      center: Offset(
        frame.left + center.x * frame.width,
        frame.top + center.y * frame.height,
      ),
      width: width,
      height: height,
    );
  }

  List<Widget> _area(Rect frame) {
    final rect = _areaRect(frame);
    final image = widget.image;
    final active = widget.imageActive;
    if (image == null) {
      return [
        Positioned.fromRect(
          rect: rect,
          child: IgnorePointer(
            child: _Handles(
              active: active,
              child: const _ImagePlaceholder(
                label: StoreCopy.customizeYourImage,
              ),
            ),
          ),
        ),
      ];
    }
    final t = image.transform;
    final imageWidth = rect.width * t.scale;
    final imageHeight = imageWidth / (image.aspect > 0 ? image.aspect : 1);
    final imageRect = Rect.fromCenter(
      center: Offset(
        rect.left + t.x * rect.width,
        rect.top + t.y * rect.height,
      ),
      width: imageWidth,
      height: imageHeight,
    );
    final bytes = image.bytes;
    return [
      if (active)
        Positioned.fromRect(
          rect: rect,
          child: const IgnorePointer(
            child: CustomPaint(
              painter: _DashedBorderPainter(color: Color(0x66FFFFFF)),
            ),
          ),
        ),
      Positioned.fromRect(
        rect: imageRect,
        child: IgnorePointer(
          child: _Handles(
            active: active,
            child: bytes == null
                ? const _ImagePlaceholder(label: 'SVG')
                : Image.memory(
                    bytes,
                    key: const ValueKey('store-customize-preview-image'),
                    fit: BoxFit.contain,
                    gaplessPlayback: true,
                    errorBuilder: (_, _, _) =>
                        const _ImagePlaceholder(label: ''),
                  ),
          ),
        ),
      ),
    ];
  }

  void _adjust(ScaleUpdateDetails d, Rect frame) {
    final start = _start;
    final image = widget.image;
    final area = widget.area;
    if (start == null || image == null || area == null) return;
    final rect = _areaRect(frame);
    if (rect.width <= 0 || rect.height <= 0) return;
    final delta = d.focalPoint - _startFocal;
    final next = clampStoreImageTransform(
      StoreImageTransform(
        x: start.x + delta.dx / rect.width,
        y: start.y + delta.dy / rect.height,
        scale: start.scale * d.scale,
      ),
      imageAspect: image.aspect,
      areaAspect: area.widthCm / area.heightCm,
    );
    if (next != image.transform) widget.onTransform?.call(next);
  }
}

/// Frente · Costas em pílulas (a ativa clara).
class _SidePills extends StatelessWidget {
  const _SidePills({required this.side, required this.onSide});

  final StorePhotoView side;
  final ValueChanged<StorePhotoView> onSide;

  @override
  Widget build(BuildContext context) {
    Widget pill(StorePhotoView value, String label) {
      final active = value == side;
      return Semantics(
        button: true,
        selected: active,
        child: GestureDetector(
          key: ValueKey('store-customize-side-${value.id}'),
          behavior: HitTestBehavior.opaque,
          onTap: () => onSide(value),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 160),
            height: 38,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            decoration: BoxDecoration(
              color: active ? AppColors.onSurface : Colors.transparent,
              borderRadius: AppRadii.pillAll,
            ),
            child: Center(
              widthFactor: 1,
              child: Text(
                label,
                style: AppTypography.soraRegular(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: active
                      ? StoreStyle.onBrand
                      : AppColors.white.withValues(alpha: 0.72),
                ),
              ),
            ),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: AppColors.black.withValues(alpha: 0.45),
        borderRadius: AppRadii.pillAll,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          pill(StorePhotoView.front, StoreCopy.customizeFront),
          pill(StorePhotoView.back, StoreCopy.customizeBack),
        ],
      ),
    );
  }
}

/// Contorno laranja com as quatro alças nos cantos (aba Imagem aberta).
class _Handles extends StatelessWidget {
  const _Handles({required this.active, required this.child});

  final bool active;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (!active) return child;
    const handle = 9.0;
    Widget dot() => Container(
          width: handle,
          height: handle,
          decoration: BoxDecoration(
            color: AppColors.brand,
            borderRadius: BorderRadius.circular(2),
          ),
        );
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Positioned.fill(
          child: DecoratedBox(
            position: DecorationPosition.foreground,
            decoration: BoxDecoration(
              border: Border.all(color: AppColors.brand, width: 1.5),
            ),
            child: child,
          ),
        ),
        Positioned(left: -handle / 2, top: -handle / 2, child: dot()),
        Positioned(right: -handle / 2, top: -handle / 2, child: dot()),
        Positioned(left: -handle / 2, bottom: -handle / 2, child: dot()),
        Positioned(right: -handle / 2, bottom: -handle / 2, child: dot()),
      ],
    );
  }
}

/// Listrado quente com um rótulo curto ("SUA IMAGEM", "SVG").
class _ImagePlaceholder extends StatelessWidget {
  const _ImagePlaceholder({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        const StoreStripedBox(color: Color(0xFF2A1A12)),
        if (label.isNotEmpty)
          Center(
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: Padding(
                padding: const EdgeInsets.all(4),
                child: Text(
                  label,
                  style: AppTypography.mono(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.2,
                    color: AppColors.brand.withValues(alpha: 0.8),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

/// Contorno tracejado (a caixa do nome e a área na aba Imagem).
class _DashedBorderPainter extends CustomPainter {
  const _DashedBorderPainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.6;
    final path = Path()
      ..addRRect(
        RRect.fromRectAndRadius(
          Offset.zero & size,
          const Radius.circular(8),
        ),
      );
    const dash = 7.0;
    const gap = 5.0;
    for (final metric in path.computeMetrics()) {
      var distance = 0.0;
      while (distance < metric.length) {
        canvas.drawPath(
          metric.extractPath(distance, distance + dash),
          paint,
        );
        distance += dash + gap;
      }
    }
  }

  @override
  bool shouldRepaint(_DashedBorderPainter oldDelegate) =>
      oldDelegate.color != color;
}
