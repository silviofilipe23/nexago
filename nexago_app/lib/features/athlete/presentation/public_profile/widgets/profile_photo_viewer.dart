import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

/// Abre [photoUrls] em tela cheia a partir de [initialIndex].
///
/// Não abre nada quando a lista está vazia: tocar num avatar de iniciais, sem
/// foto, não deve levar a uma tela preta.
void openProfilePhotoViewer(
  BuildContext context, {
  required List<String> photoUrls,
  int initialIndex = 0,
}) {
  final urls = photoUrls.where((u) => u.trim().isNotEmpty).toList();
  if (urls.isEmpty) return;

  Navigator.of(context).push(
    PageRouteBuilder(
      opaque: false,
      barrierColor: Colors.black,
      pageBuilder: (_, __, ___) => ProfilePhotoViewer(
        photoUrls: urls,
        initialIndex: initialIndex.clamp(0, urls.length - 1),
      ),
    ),
  );
}

/// Visualizador em tela cheia com swipe entre fotos e zoom (pan/pinch).
///
/// Compartilhado entre a galeria de destaques e o avatar do perfil público —
/// era privado da galeria, e o avatar precisava do mesmo comportamento.
class ProfilePhotoViewer extends StatefulWidget {
  const ProfilePhotoViewer({
    super.key,
    required this.photoUrls,
    this.initialIndex = 0,
  });

  final List<String> photoUrls;
  final int initialIndex;

  @override
  State<ProfilePhotoViewer> createState() => _ProfilePhotoViewerState();
}

class _ProfilePhotoViewerState extends State<ProfilePhotoViewer> {
  late final _controller = PageController(initialPage: widget.initialIndex);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

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
