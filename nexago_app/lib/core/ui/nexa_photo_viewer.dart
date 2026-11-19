import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

/// Abre as fotos em tela cheia por cima da página e devolve o índice em que o
/// atleta parou (`null` se a rota fechou de outro jeito).
Future<int?> openNexaPhotoViewer(
  BuildContext context, {
  required List<String> urls,
  int initialIndex = 0,
  String closeTooltip = 'Fechar',
}) {
  return Navigator.of(context).push<int>(
    PageRouteBuilder<int>(
      // Transparente: arrastar pra baixo esmaece e revela a página.
      opaque: false,
      transitionDuration: const Duration(milliseconds: 200),
      reverseTransitionDuration: const Duration(milliseconds: 160),
      pageBuilder: (_, _, _) => NexaPhotoViewer(
        urls: urls,
        initialIndex: initialIndex,
        closeTooltip: closeTooltip,
      ),
      transitionsBuilder: (_, animation, _, child) =>
          FadeTransition(opacity: animation, child: child),
    ),
  );
}

/// Bolinhas de galeria: a ativa vira um traço laranja.
class NexaPageDots extends StatelessWidget {
  const NexaPageDots({super.key, required this.count, required this.index});

  final int count;
  final int index;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        for (var i = 0; i < count; i++)
          AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            margin: const EdgeInsets.symmetric(horizontal: 3),
            width: i == index ? 18 : 6,
            height: 6,
            decoration: BoxDecoration(
              color: i == index
                  ? AppColors.brand
                  : AppColors.white.withValues(alpha: 0.45),
              borderRadius: BorderRadius.circular(3),
            ),
          ),
      ],
    );
  }
}

/// Tela cheia: arrastar troca a foto, pinça amplia, arrastar pra baixo (sem
/// zoom) fecha. Devolve o índice em que parou.
class NexaPhotoViewer extends StatefulWidget {
  const NexaPhotoViewer({
    super.key,
    required this.urls,
    this.initialIndex = 0,
    this.closeTooltip = 'Fechar',
  });

  final List<String> urls;
  final int initialIndex;

  /// Dica do botão de fechar (lida pelo leitor de tela).
  final String closeTooltip;

  @override
  State<NexaPhotoViewer> createState() => _NexaPhotoViewerState();
}

class _NexaPhotoViewerState extends State<NexaPhotoViewer> {
  static const double _dismissDistance = 120;
  static const double _closeButtonSize = 44;

  late final PageController _pages =
      PageController(initialPage: widget.initialIndex);
  late int _index = widget.initialIndex;
  final Map<int, TransformationController> _zoom = {};
  bool _zoomed = false;
  double _drag = 0;

  TransformationController _zoomFor(int i) => _zoom.putIfAbsent(i, () {
        final c = TransformationController();
        c.addListener(() {
          final zoomed = c.value.getMaxScaleOnAxis() > 1.01;
          if (i == _index && zoomed != _zoomed) {
            setState(() => _zoomed = zoomed);
          }
        });
        return c;
      });

  @override
  void dispose() {
    _pages.dispose();
    for (final c in _zoom.values) {
      c.dispose();
    }
    super.dispose();
  }

  void _close() => Navigator.of(context).pop(_index);

  @override
  Widget build(BuildContext context) {
    final progress = (_drag.abs() / (_dismissDistance * 2)).clamp(0.0, 1.0);
    final padding = MediaQuery.paddingOf(context);
    return PopScope<int>(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _close();
      },
      child: Material(
        color: Colors.black.withValues(alpha: 1 - progress),
        child: Stack(
          fit: StackFit.expand,
          children: [
            GestureDetector(
              onVerticalDragUpdate:
                  _zoomed ? null : (d) => setState(() => _drag += d.delta.dy),
              onVerticalDragEnd: _zoomed
                  ? null
                  : (_) {
                      if (_drag > _dismissDistance) {
                        _close();
                      } else {
                        setState(() => _drag = 0);
                      }
                    },
              child: Transform.translate(
                offset: Offset(0, _drag),
                child: PageView.builder(
                  controller: _pages,
                  physics:
                      _zoomed ? const NeverScrollableScrollPhysics() : null,
                  itemCount: widget.urls.length,
                  onPageChanged: (i) => setState(() {
                    _index = i;
                    _zoomed = false;
                  }),
                  itemBuilder: (_, i) => InteractiveViewer(
                    transformationController: _zoomFor(i),
                    minScale: 1,
                    maxScale: 4,
                    child: Center(
                      child: CachedNetworkImage(
                        imageUrl: widget.urls[i],
                        fit: BoxFit.contain,
                        placeholder: (_, _) => const SizedBox.shrink(),
                        errorWidget: (_, _, _) => const Icon(
                          Icons.broken_image_outlined,
                          color: Colors.white54,
                          size: 40,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
            Positioned(
              top: padding.top + 12,
              left: 16,
              child: Opacity(
                opacity: 1 - progress,
                child: IconButton(
                  tooltip: widget.closeTooltip,
                  onPressed: _close,
                  style: IconButton.styleFrom(
                    backgroundColor: Colors.white.withValues(alpha: 0.12),
                    foregroundColor: Colors.white,
                    fixedSize: const Size.square(_closeButtonSize),
                  ),
                  icon: const Icon(Icons.close_rounded),
                ),
              ),
            ),
            if (widget.urls.length > 1)
              Positioned(
                left: 0,
                right: 0,
                bottom: padding.bottom + 24,
                child: IgnorePointer(
                  child: Opacity(
                    opacity: 1 - progress,
                    child: NexaPageDots(
                      count: widget.urls.length,
                      index: _index,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
