import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

import '../../domain/arena_list_item.dart';
import '../arena_hero_tag.dart';
import 'arena_logo.dart';

/// Card estilo listagem (Airbnb-like): imagem grande, sombra leve, cantos arredondados.
class ArenaCard extends StatefulWidget {
  const ArenaCard({
    super.key,
    required this.arena,
    required this.onTap,
    this.isFavorite = false,
    this.isFavoriteBusy = false,
    this.onToggleFavorite,
  });

  final ArenaListItem arena;
  final VoidCallback onTap;
  final bool isFavorite;
  final bool isFavoriteBusy;
  final VoidCallback? onToggleFavorite;

  static final _currency = NumberFormat.currency(
    locale: 'pt_BR',
    symbol: r'R$',
    decimalDigits: 0,
  );

  @override
  State<ArenaCard> createState() => _ArenaCardState();
}

class _ArenaCardState extends State<ArenaCard> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final hasCover =
        widget.arena.coverUrl != null && widget.arena.coverUrl!.isNotEmpty;

    return AnimatedScale(
      scale: _pressed ? 0.985 : 1,
      duration: const Duration(milliseconds: 120),
      curve: Curves.easeOut,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: widget.onTap,
          onHighlightChanged: (v) => setState(() => _pressed = v),
          borderRadius: BorderRadius.circular(16),
          child: Ink(
            height: 204,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.16),
                  blurRadius: 18,
                  offset: const Offset(0, 8),
                ),
              ],
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Hero(
                    tag: ArenaHeroTags.coverImage(widget.arena.id),
                    transitionOnUserGestures: true,
                    child: Material(
                      type: MaterialType.transparency,
                      child: hasCover
                          ? CachedNetworkImage(
                              imageUrl: widget.arena.coverUrl!,
                              fit: BoxFit.cover,
                              fadeInDuration: const Duration(milliseconds: 260),
                              placeholder: (context, _) =>
                                  Container(color: const Color(0xFFE0E0E0)),
                              errorWidget: (context, error, stackTrace) =>
                                  Container(color: const Color(0xFFE0E0E0)),
                            )
                          : Container(color: const Color(0xFFE0E0E0)),
                    ),
                  ),
                  Positioned.fill(
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [
                            Colors.black.withValues(alpha: 0.32),
                            Colors.black.withValues(alpha: 0.46),
                          ],
                        ),
                      ),
                    ),
                  ),
                  Positioned(
                    top: 12,
                    left: 12,
                    child: ArenaLogo(logoUrl: widget.arena.logoUrl, size: 44),
                  ),
                  Positioned(
                    top: 12,
                    right: 12,
                    child: _FavoriteButton(
                      isFavorite: widget.isFavorite,
                      isBusy: widget.isFavoriteBusy,
                      onTap: widget.onToggleFavorite,
                    ),
                  ),
                  Positioned(
                    left: 14,
                    right: 14,
                    bottom: 14,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.arena.name,
                          style: theme.textTheme.titleLarge?.copyWith(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                            letterSpacing: -0.25,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 4),
                        Text(
                          widget.arena.locationLabel,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: Colors.white.withValues(alpha: 0.9),
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          '${ArenaCard._currency.format(widget.arena.pricePerHourReais)} / hora',
                          style: theme.textTheme.titleSmall?.copyWith(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _FavoriteButton extends StatelessWidget {
  const _FavoriteButton({
    required this.isFavorite,
    required this.isBusy,
    required this.onTap,
  });

  final bool isFavorite;
  final bool isBusy;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final iconColor = isFavorite ? const Color(0xFFE53935) : Colors.white;
    final bgColor = isFavorite
        ? const Color(0xFFB71C1C).withValues(alpha: 0.32)
        : Colors.black.withValues(alpha: 0.35);

    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        onTap: isBusy
            ? null
            : () {
                HapticFeedback.selectionClick();
                onTap?.call();
              },
        borderRadius: BorderRadius.circular(999),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOutCubic,
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: bgColor,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
              color: Colors.white.withValues(alpha: isFavorite ? 0.42 : 0.22),
            ),
            boxShadow: isFavorite
                ? [
                    BoxShadow(
                      color: const Color(0xFFE53935).withValues(alpha: 0.25),
                      blurRadius: 12,
                      offset: const Offset(0, 3),
                    ),
                  ]
                : null,
          ),
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 200),
            transitionBuilder: (child, animation) => FadeTransition(
              opacity: animation,
              child: ScaleTransition(
                scale: Tween<double>(begin: 0.82, end: 1.0).animate(animation),
                child: child,
              ),
            ),
            child: isBusy
                ? const SizedBox(
                    key: ValueKey<String>('favorite_busy'),
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.2,
                      color: Colors.white,
                    ),
                  )
                : Icon(
                    isFavorite ? Icons.favorite : Icons.favorite_border,
                    key: ValueKey<bool>(isFavorite),
                    color: iconColor,
                    size: 22,
                  ),
          ),
        ),
      ),
    );
  }
}
