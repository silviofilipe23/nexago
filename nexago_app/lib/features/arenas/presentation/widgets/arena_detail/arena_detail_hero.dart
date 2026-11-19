import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/ui/nexa_photo_viewer.dart';
import '../arena_header_image.dart';

/// Topo do perfil da arena: galeria (capa + fotos) com contador, toque abre a
/// tela cheia. Voltar, compartilhar e favoritar por cima da foto.
class ArenaDetailHero extends StatefulWidget {
  const ArenaDetailHero({
    super.key,
    required this.arenaId,
    required this.photos,
    required this.onBack,
    required this.isFavorite,
    required this.isFavoritePending,
    required this.onToggleFavorite,
    this.onShare,
    this.isBestPrice = false,
    this.height = 260,
  });

  final String arenaId;

  /// Capa primeiro, depois a galeria (ver `arenaGalleryUrls`). Vazia = o
  /// gradiente da arena.
  final List<String> photos;
  final VoidCallback onBack;
  final bool isFavorite;
  final bool isFavoritePending;
  final VoidCallback? onToggleFavorite;
  final VoidCallback? onShare;
  final bool isBestPrice;
  final double height;

  @override
  State<ArenaDetailHero> createState() => _ArenaDetailHeroState();
}

class _ArenaDetailHeroState extends State<ArenaDetailHero> {
  final PageController _pages = PageController();
  int _index = 0;

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  Future<void> _openFullscreen() async {
    final index = await openNexaPhotoViewer(
      context,
      urls: widget.photos,
      initialIndex: _index,
    );
    if (!mounted || index == null || index == _index) return;
    setState(() => _index = index);
    if (_pages.hasClients) _pages.jumpToPage(index);
  }

  Widget _photo(int i) {
    // Só a 1ª foto leva a tag do Hero: duas páginas com a mesma tag na tela
    // (durante o arrasto) quebram a transição vinda da busca.
    if (i == 0) {
      return ArenaHeaderImage(
        arenaId: widget.arenaId,
        coverUrl: widget.photos.first,
        height: widget.height,
      );
    }
    return _GalleryPhoto(url: widget.photos[i]);
  }

  @override
  Widget build(BuildContext context) {
    final photos = widget.photos;
    final top = MediaQuery.paddingOf(context).top + 8;
    final favoriteTooltip =
        widget.isFavorite ? 'Remover dos favoritos' : 'Favoritar arena';

    return SizedBox(
      height: widget.height,
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (photos.isEmpty)
            ArenaHeaderImage(
              arenaId: widget.arenaId,
              coverUrl: null,
              height: widget.height,
            )
          else
            Semantics(
              label: 'Fotos da arena',
              hint: 'Toque para ampliar',
              child: PageView.builder(
                controller: _pages,
                itemCount: photos.length,
                onPageChanged: (i) => setState(() => _index = i),
                itemBuilder: (_, i) => GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: _openFullscreen,
                  child: _photo(i),
                ),
              ),
            ),
          Positioned(
            top: top,
            left: 12,
            child: _CircleIconButton(
              icon: Icons.arrow_back_rounded,
              onTap: widget.onBack,
              tooltip: 'Voltar',
            ),
          ),
          Positioned(
            top: top,
            right: 12,
            child: Row(
              children: [
                if (widget.onShare != null) ...[
                  _CircleIconButton(
                    icon: Icons.ios_share_rounded,
                    onTap: widget.onShare,
                    tooltip: 'Compartilhar arena',
                  ),
                  const SizedBox(width: 8),
                ],
                _CircleIconButton(
                  onTap:
                      widget.isFavoritePending ? null : widget.onToggleFavorite,
                  tooltip: favoriteTooltip,
                  child: _FavoriteIcon(
                    isFavorite: widget.isFavorite,
                    pending: widget.isFavoritePending,
                  ),
                ),
              ],
            ),
          ),
          if (widget.isBestPrice)
            const Positioned(left: 20, bottom: 14, child: _BestPriceBadge()),
          if (photos.length > 1)
            Positioned(
              right: 14,
              bottom: 14,
              child: IgnorePointer(
                child: _PhotoCounter(index: _index, total: photos.length),
              ),
            ),
        ],
      ),
    );
  }
}

class _GalleryPhoto extends StatelessWidget {
  const _GalleryPhoto({required this.url});

  final String url;

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        CachedNetworkImage(
          imageUrl: url,
          fit: BoxFit.cover,
          fadeInDuration: const Duration(milliseconds: 200),
          placeholder: (_, _) => const ColoredBox(color: Color(0xFF1B1B1F)),
          errorWidget: (_, _, _) => const ColoredBox(color: Color(0xFF1B1B1F)),
        ),
        // Mesmo escurecido da capa: os botões brancos continuam legíveis.
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                Colors.black.withValues(alpha: 0.15),
                Colors.black.withValues(alpha: 0.55),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _PhotoCounter extends StatelessWidget {
  const _PhotoCounter({required this.index, required this.total});

  final int index;
  final int total;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Foto ${index + 1} de $total',
      excludeSemantics: true,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.55),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.photo_library_outlined,
              size: 14,
              color: AppColors.white,
            ),
            const SizedBox(width: 5),
            Text(
              '${index + 1} / $total',
              style: AppTypography.mono(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: AppColors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BestPriceBadge extends StatelessWidget {
  const _BestPriceBadge();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.brand,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.bolt_rounded, size: 16, color: AppColors.black),
          const SizedBox(width: 4),
          Text(
            'MELHOR PREÇO DA REGIÃO',
            style: AppTypography.mono(
              fontWeight: FontWeight.w700,
              color: AppColors.black,
              letterSpacing: 0.3,
            ),
          ),
        ],
      ),
    );
  }
}

class _FavoriteIcon extends StatelessWidget {
  const _FavoriteIcon({required this.isFavorite, required this.pending});

  final bool isFavorite;
  final bool pending;

  @override
  Widget build(BuildContext context) {
    if (pending) {
      return const SizedBox(
        width: 20,
        height: 20,
        child: CircularProgressIndicator(
          strokeWidth: 2,
          color: AppColors.white,
        ),
      );
    }
    return Icon(
      isFavorite ? Icons.favorite : Icons.favorite_border,
      color: isFavorite ? const Color(0xFFE53935) : AppColors.white,
      size: 22,
    );
  }
}

class _CircleIconButton extends StatelessWidget {
  const _CircleIconButton({
    this.icon,
    this.child,
    required this.onTap,
    required this.tooltip,
  });

  final IconData? icon;
  final Widget? child;
  final VoidCallback? onTap;

  /// Dica no toque longo e nome lido pelo leitor de tela — botão só com
  /// ícone não se explica.
  final String tooltip;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: Material(
        color: Colors.black.withValues(alpha: 0.45),
        shape: const CircleBorder(),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: SizedBox(
            width: 40,
            height: 40,
            child: Center(
              child: child ?? Icon(icon, color: AppColors.white, size: 22),
            ),
          ),
        ),
      ),
    );
  }
}
