import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/ui/nexa_photo_viewer.dart';
import '../../domain/store_models.dart';
import '../store_copy.dart';
import 'store_style.dart';

/// Galeria da página do produto (app): arrastar troca a foto (bolinhas),
/// toque abre a tela cheia com pinça. Trocar a cor leva de volta à 1ª foto
/// (as fotos mudam junto). Sem foto: listrado com o nome da categoria.
class StoreProductGallery extends StatefulWidget {
  const StoreProductGallery({
    super.key,
    required this.photos,
    required this.placeholderLabel,
    required this.height,
    required this.bottomInset,
    this.dimmed = false,
    this.onSwipe,
  });

  final List<StorePhoto> photos;

  /// Texto do listrado sem foto (o nome da categoria).
  final String placeholderLabel;
  final double height;

  /// O painel sobe sobre a foto: as bolinhas ficam acima dele.
  final double bottomInset;

  /// Produto esgotado: foto a 55%, como no card.
  final bool dimmed;

  /// Arrastou para outra foto (`loja_foto_swipe`).
  final VoidCallback? onSwipe;

  @override
  State<StoreProductGallery> createState() => _StoreProductGalleryState();
}

class _StoreProductGalleryState extends State<StoreProductGallery> {
  final PageController _controller = PageController();
  int _index = 0;

  /// Troca de página pelo código (cor nova, volta da tela cheia): não é o
  /// atleta arrastando, então não vira `loja_foto_swipe`.
  bool _silent = false;

  static String _keyOf(List<StorePhoto> photos) =>
      [for (final p in photos) p.url].join('|');

  @override
  void didUpdateWidget(StoreProductGallery oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (_keyOf(oldWidget.photos) == _keyOf(widget.photos)) return;
    _index = 0;
    // Fora do build: pular de página dispara notificação de rolagem.
    WidgetsBinding.instance.addPostFrameCallback((_) => _jumpTo(0));
  }

  void _jumpTo(int page) {
    if (!mounted || !_controller.hasClients) return;
    _silent = true;
    _controller.jumpToPage(page);
    _silent = false;
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _openFullscreen() async {
    final photos = widget.photos;
    if (photos.isEmpty) return;
    final index = await Navigator.of(context).push<int>(
      PageRouteBuilder<int>(
        // Transparente: arrastar pra baixo esmaece e revela a página.
        opaque: false,
        transitionDuration: const Duration(milliseconds: 200),
        reverseTransitionDuration: const Duration(milliseconds: 160),
        pageBuilder: (_, _, _) => StorePhotoViewer(
          photos: photos,
          initialIndex: _index,
        ),
        transitionsBuilder: (_, animation, _, child) =>
            FadeTransition(opacity: animation, child: child),
      ),
    );
    if (!mounted || index == null || index == _index) return;
    setState(() => _index = index);
    _jumpTo(index);
  }

  @override
  Widget build(BuildContext context) {
    final photos = widget.photos;
    final dpr = MediaQuery.devicePixelRatioOf(context);
    final Widget content;
    if (photos.isEmpty) {
      content = _StripedLabel(label: widget.placeholderLabel);
    } else {
      content = PageView.builder(
        controller: _controller,
        itemCount: photos.length,
        onPageChanged: (i) {
          setState(() => _index = i);
          if (!_silent) widget.onSwipe?.call();
        },
        itemBuilder: (_, i) => GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: _openFullscreen,
          child: CachedNetworkImage(
            imageUrl: photos[i].url,
            fit: BoxFit.cover,
            memCacheHeight: (widget.height * dpr).round(),
            placeholder: (_, _) => const StoreStripedBox(),
            errorWidget: (_, _, _) =>
                _StripedLabel(label: widget.placeholderLabel),
          ),
        ),
      );
    }
    return SizedBox(
      height: widget.height,
      child: Stack(
        fit: StackFit.expand,
        children: [
          Opacity(opacity: widget.dimmed ? 0.55 : 1, child: content),
          if (photos.length > 1)
            Positioned(
              left: 0,
              right: 0,
              bottom: widget.bottomInset + 16,
              child: IgnorePointer(
                child: StorePageDots(count: photos.length, index: _index),
              ),
            ),
        ],
      ),
    );
  }
}

class _StripedLabel extends StatelessWidget {
  const _StripedLabel({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        const StoreStripedBox(),
        if (label.isNotEmpty)
          Center(
            child: Text(
              label.toUpperCase(),
              style: AppTypography.mono(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                letterSpacing: 2.4,
                color: AppColors.white.withValues(alpha: 0.32),
              ),
            ),
          ),
      ],
    );
  }
}

/// Bolinhas da galeria: a ativa vira um traço laranja.
class StorePageDots extends StatelessWidget {
  const StorePageDots({super.key, required this.count, required this.index});

  final int count;
  final int index;

  @override
  Widget build(BuildContext context) =>
      NexaPageDots(count: count, index: index);
}

/// Tela cheia: arrastar troca a foto, pinça amplia, arrastar pra baixo (sem
/// zoom) fecha. Devolve o índice em que parou.
class StorePhotoViewer extends StatelessWidget {
  const StorePhotoViewer({
    super.key,
    required this.photos,
    this.initialIndex = 0,
  });

  final List<StorePhoto> photos;
  final int initialIndex;

  @override
  Widget build(BuildContext context) {
    return NexaPhotoViewer(
      urls: [for (final photo in photos) photo.url],
      initialIndex: initialIndex,
      closeTooltip: StoreCopy.back,
    );
  }
}
