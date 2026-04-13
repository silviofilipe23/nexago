import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

class ArenaLogo extends StatelessWidget {
  const ArenaLogo({
    super.key,
    required this.logoUrl,
    this.size = 44,
  });

  final String? logoUrl;
  final double size;

  @override
  Widget build(BuildContext context) {
    final hasLogo = logoUrl != null && logoUrl!.isNotEmpty;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: Colors.white,
        border: Border.all(color: Colors.white.withValues(alpha: 0.9), width: 1.2),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.18),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: hasLogo
          ? CachedNetworkImage(
              imageUrl: logoUrl!,
              fit: BoxFit.cover,
              fadeInDuration: const Duration(milliseconds: 240),
              placeholder: (context, _) => const Center(
                child: SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
              errorWidget: (context, _, __) => const Icon(Icons.sports_volleyball_rounded),
            )
          : const Icon(Icons.sports_volleyball_rounded),
    );
  }
}
