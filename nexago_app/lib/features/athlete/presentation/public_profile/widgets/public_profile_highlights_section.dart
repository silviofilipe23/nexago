import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';

/// Galeria de fotos de destaque do perfil público: carrossel horizontal,
/// tocável para visualização em tela cheia. Não renderiza nada quando vazio
/// (sem placeholder para quem nunca adicionou fotos).
class PublicProfileHighlightsSection extends StatelessWidget {
  const PublicProfileHighlightsSection({super.key, required this.photoUrls});

  static const _tileSize = 108.0;

  final List<String> photoUrls;

  @override
  Widget build(BuildContext context) {
    if (photoUrls.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 20, 0, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.only(right: 20),
            child: Text(
              'Destaques',
              style: AppTypography.soraRegular(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: context.themeColors.onSurface,
              ),
            ),
          ),
          SizedBox(height: 12),
          SizedBox(
            height: _tileSize,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.only(right: 20),
              itemCount: photoUrls.length,
              separatorBuilder: (_, __) => SizedBox(width: 10),
              itemBuilder: (context, index) => _HighlightThumb(
                photoUrls: photoUrls,
                index: index,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _HighlightThumb extends StatelessWidget {
  const _HighlightThumb({required this.photoUrls, required this.index});

  final List<String> photoUrls;
  final int index;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: () => _openViewer(context),
        child: SizedBox(
          width: PublicProfileHighlightsSection._tileSize,
          height: PublicProfileHighlightsSection._tileSize,
          child: CachedNetworkImage(
            imageUrl: photoUrls[index],
            fit: BoxFit.cover,
            placeholder: (_, __) =>
                ColoredBox(color: context.themeColors.surfaceCard),
            errorWidget: (_, __, ___) =>
                ColoredBox(color: context.themeColors.surfaceCard),
          ),
        ),
      ),
    );
  }

  void _openViewer(BuildContext context) {
    Navigator.of(context).push(
      PageRouteBuilder(
        opaque: false,
        barrierColor: Colors.black,
        pageBuilder: (_, __, ___) =>
            _HighlightPhotoViewer(photoUrls: photoUrls, initialIndex: index),
      ),
    );
  }
}

/// Visualizador em tela cheia com swipe entre fotos e zoom (pan/pinch).
class _HighlightPhotoViewer extends StatefulWidget {
  const _HighlightPhotoViewer({
    required this.photoUrls,
    required this.initialIndex,
  });

  final List<String> photoUrls;
  final int initialIndex;

  @override
  State<_HighlightPhotoViewer> createState() => _HighlightPhotoViewerState();
}

class _HighlightPhotoViewerState extends State<_HighlightPhotoViewer> {
  late final _controller = PageController(initialPage: widget.initialIndex);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Stack(
          children: [
            PageView.builder(
              controller: _controller,
              itemCount: widget.photoUrls.length,
              itemBuilder: (context, index) => InteractiveViewer(
                child: Center(
                  child: CachedNetworkImage(
                    imageUrl: widget.photoUrls[index],
                    fit: BoxFit.contain,
                  ),
                ),
              ),
            ),
            Positioned(
              top: 8,
              right: 8,
              child: Material(
                color: Colors.black.withValues(alpha: 0.5),
                shape: const CircleBorder(),
                child: InkWell(
                  onTap: () => Navigator.of(context).pop(),
                  customBorder: const CircleBorder(),
                  child: const Padding(
                    padding: EdgeInsets.all(8),
                    child: Icon(Icons.close_rounded, color: Colors.white),
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
