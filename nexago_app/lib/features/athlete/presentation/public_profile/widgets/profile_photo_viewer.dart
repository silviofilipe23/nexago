import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

/// Abre [photoUrls] em tela cheia a partir de [initialIndex].
///
/// Não abre nada quando a lista está vazia: tocar num avatar de iniciais, sem
/// foto, não deve levar a uma tela preta.
///
/// Com [name], a foto ganha a identificação embaixo ([role] em destaque e
/// [meta] sob o nome) — para quem abre a foto conferir quem é a pessoa.
void openProfilePhotoViewer(
  BuildContext context, {
  required List<String> photoUrls,
  int initialIndex = 0,
  String? name,
  String? role,
  String? meta,
}) {
  final urls = photoUrls.where((u) => u.trim().isNotEmpty).toList();
  if (urls.isEmpty) return;

  Navigator.of(context).push(
    PageRouteBuilder<void>(
      opaque: false,
      barrierColor: Colors.black,
      transitionDuration: const Duration(milliseconds: 320),
      reverseTransitionDuration: const Duration(milliseconds: 240),
      pageBuilder: (_, __, ___) => ProfilePhotoViewer(
        photoUrls: urls,
        initialIndex: initialIndex.clamp(0, urls.length - 1),
        name: name,
        role: role,
        meta: meta,
      ),
      transitionsBuilder: (context, animation, secondaryAnimation, child) {
        final curved = CurvedAnimation(
          parent: animation,
          curve: Curves.easeOutCubic,
          reverseCurve: Curves.easeInCubic,
        );
        return FadeTransition(
          opacity: curved,
          child: ScaleTransition(
            scale: Tween<double>(begin: 0.92, end: 1).animate(curved),
            child: child,
          ),
        );
      },
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
    this.name,
    this.role,
    this.meta,
  });

  final List<String> photoUrls;
  final int initialIndex;

  /// Identificação sob a foto; `null` = só a foto.
  final String? name;
  final String? role;
  final String? meta;

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
    final name = widget.name?.trim() ?? '';
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Stack(
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  child: PageView.builder(
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
                ),
                if (name.isNotEmpty)
                  _PhotoCaption(
                    name: name,
                    role: widget.role,
                    meta: widget.meta,
                  ),
              ],
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

/// Papel, nome e contexto sob a foto (aluno da arena, por exemplo).
class _PhotoCaption extends StatelessWidget {
  const _PhotoCaption({required this.name, this.role, this.meta});

  final String name;
  final String? role;
  final String? meta;

  @override
  Widget build(BuildContext context) {
    final role = this.role?.trim() ?? '';
    final meta = this.meta?.trim() ?? '';
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 14, 24, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (role.isNotEmpty) ...[
            Text(
              role.toUpperCase(),
              style: AppTypography.mono(
                fontSize: 10,
                fontWeight: FontWeight.w600,
                letterSpacing: 2,
                color: AppColors.brand,
              ),
            ),
            const SizedBox(height: 6),
          ],
          Text(
            name,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: AppTypography.soraRegular(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.2,
              color: Colors.white,
            ),
          ),
          if (meta.isNotEmpty) ...[
            const SizedBox(height: 5),
            Text(
              meta,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 12.5,
                height: 1.45,
                color: Colors.white.withValues(alpha: 0.65),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
