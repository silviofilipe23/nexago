import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
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
  });

  final ArenaListItem arena;
  final VoidCallback onTap;

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
    final hasCover = widget.arena.coverUrl != null && widget.arena.coverUrl!.isNotEmpty;

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
                              placeholder: (context, _) => Container(color: const Color(0xFFE0E0E0)),
                              errorWidget: (context, _, __) => Container(color: const Color(0xFFE0E0E0)),
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
