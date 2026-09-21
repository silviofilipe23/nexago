import 'package:flutter/material.dart';

import '../../../../athlete/presentation/widgets/athlete_profile_avatar.dart';
import '../../../domain/team_discover_models.dart';

/// Avatares circulares sobrepostos (padrão `AthleteProfileAvatar` + ranking).
class TeamDiscoverDualAvatars extends StatelessWidget {
  const TeamDiscoverDualAvatars({
    super.key,
    required this.entry,
    this.size = avatarSize,
    this.overlapFactor = defaultOverlap,
  });

  final TeamDiscoverEntry entry;

  /// Diâmetro de cada avatar. O padrão é o da prévia do hub Competir; a
  /// listagem de duplas usa o mesmo 36 do card de atleta.
  final double size;

  /// Onde o segundo avatar começa, em fração do primeiro. Quanto menor, mais
  /// eles se cobrem — e em 36px a sobreposição de 0.55 comia a segunda letra
  /// das iniciais de quem está atrás.
  final double overlapFactor;

  static const avatarSize = 46.0;
  static const listAvatarSize = 36.0;
  static const defaultOverlap = 0.55;
  static const listOverlap = 0.72;

  /// Largura que o bloco ocupa na linha. O segundo avatar sobra um naco à
  /// direita de propósito — o `Clip.none` deixa ele pintar sobre a folga.
  static double footprintFor(double size) => size + 16;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: footprintFor(size),
      height: size,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Positioned(
            left: 0,
            child: AthleteProfileAvatar(
              size: size,
              initials: entry.player1Initials,
              imageUrl: entry.player1?.avatarUrl,
            ),
          ),
          if (!entry.isLookingForPartner)
            Positioned(
              left: size * overlapFactor,
              child: AthleteProfileAvatar(
                size: size,
                initials: entry.player2Initials,
                imageUrl: entry.player2?.avatarUrl,
              ),
            ),
        ],
      ),
    );
  }
}
