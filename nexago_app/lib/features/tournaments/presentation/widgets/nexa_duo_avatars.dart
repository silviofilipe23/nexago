import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../domain/tournament_match_card_view_model.dart';

/// Os dois rostos de uma dupla, sobrepostos.
///
/// Extraído do `TournamentMatchCard` (onde era privado e fixo em 28px) quando o
/// Modo Focus precisou dos mesmos avatares em 44px no herói do "Agora". Uma
/// implementação só: a regra de foto-ou-iniciais e os gradientes de fallback
/// não podem divergir entre o card e o Focus.
class NexaDuoAvatars extends StatelessWidget {
  const NexaDuoAvatars({
    super.key,
    required this.players,
    this.size = 28,
  });

  final List<TournamentMatchCardPlayerViewModel> players;
  final double size;

  @override
  Widget build(BuildContext context) {
    final overlap = size * 0.3;
    final count = players.isEmpty ? 1 : players.length;

    return SizedBox(
      width: count > 1 ? size * 2 - overlap : size,
      height: size,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Positioned(
            left: 0,
            child: _Avatar(player: players.firstOrNull, index: 0, size: size),
          ),
          if (players.length > 1)
            Positioned(
              left: size - overlap,
              child: _Avatar(player: players[1], index: 1, size: size),
            ),
        ],
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({
    required this.player,
    required this.index,
    required this.size,
  });

  final TournamentMatchCardPlayerViewModel? player;
  final int index;
  final double size;

  static const _gradients = [
    [Color(0xFFFF6A1A), Color(0xFFC2185B)],
    [Color(0xFF2BD17E), Color(0xFF1E7A4D)],
  ];

  @override
  Widget build(BuildContext context) {
    final url = player?.avatarUrl?.trim();
    final hasPhoto = url != null && url.isNotEmpty;

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: _gradients[index % _gradients.length],
        ),
        shape: BoxShape.circle,
        border: Border.all(color: context.themeColors.canvas, width: 1.5),
      ),
      child: ClipOval(
        child: hasPhoto
            ? CachedNetworkImage(
                imageUrl: url,
                width: size,
                height: size,
                fit: BoxFit.cover,
                placeholder: (_, _) => _initials(),
                errorWidget: (_, _, _) => _initials(),
              )
            : _initials(),
      ),
    );
  }

  Widget _initials() {
    return Center(
      child: Text(
        player?.initials ?? '?',
        style: AppTypography.soraRegular(
          // A tipografia acompanha o círculo: 11px num avatar de 44px ficaria
          // perdido no meio.
          fontSize: size * 0.39,
          fontWeight: FontWeight.w700,
          color: AppColors.white,
          letterSpacing: 0.2,
        ),
      ),
    );
  }
}
