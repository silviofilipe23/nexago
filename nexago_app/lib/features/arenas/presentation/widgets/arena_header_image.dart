import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../arena_hero_tag.dart';

class ArenaHeaderImage extends StatelessWidget {
  const ArenaHeaderImage({
    super.key,
    required this.arenaId,
    required this.coverUrl,
    this.height = 300,
  });

  final String arenaId;
  final String? coverUrl;
  final double height;

  @override
  Widget build(BuildContext context) {
    final hasCover = coverUrl != null && coverUrl!.isNotEmpty;
    final fallback = Container(
      height: height,
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFFE7E7E7), Color(0xFFDADADA)],
        ),
      ),
    );

    return SizedBox(
      height: height,
      width: double.infinity,
      child: Hero(
        tag: ArenaHeroTags.coverImage(arenaId),
        transitionOnUserGestures: true,
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (hasCover)
              CachedNetworkImage(
                imageUrl: coverUrl!,
                fit: BoxFit.cover,
                fadeInDuration: const Duration(milliseconds: 260),
                placeholder: (context, _) => fallback,
                errorWidget: (context, _, __) => fallback,
              )
            else
              fallback,
            Positioned.fill(
              child: DecoratedBox(
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
            ),
          ],
        ),
      ),
    );
  }
}
