import 'package:flutter/material.dart';

import '../../../../athlete/presentation/widgets/athlete_profile_avatar.dart';
import '../../../domain/category_ops/category_ops_models.dart';

/// Avatares sobrepostos da dupla (foto do perfil + fallback em iniciais).
class OrganizerTeamDualAvatars extends StatelessWidget {
  const OrganizerTeamDualAvatars({
    super.key,
    required this.player1,
    required this.player2,
    this.avatarSize = 32,
    this.overlapRingColor,
  });

  final OrganizerCategoryPlayerInfo player1;
  final OrganizerCategoryPlayerInfo player2;
  final double avatarSize;

  /// Anel do avatar da frente (ex.: cor do card/sheet por trás).
  final Color? overlapRingColor;

  @override
  Widget build(BuildContext context) {
    final width = avatarSize + (avatarSize * 0.55);
    return SizedBox(
      width: width,
      height: avatarSize,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Positioned(
            left: 0,
            top: 1,
            child: AthleteProfileAvatar(
              size: avatarSize,
              initials: player1.initials,
              imageUrl: _photoUrl(player1.profilePhotoUrl),
            ),
          ),
          Positioned(
            left: avatarSize * 0.55,
            top: 0,
            child: _OverlappedAvatar(
              ringColor: overlapRingColor,
              size: avatarSize,
              initials: player2.initials,
              imageUrl: _photoUrl(player2.profilePhotoUrl),
            ),
          ),
        ],
      ),
    );
  }

  String? _photoUrl(String raw) {
    final url = raw.trim();
    return url.isEmpty ? null : url;
  }
}

class _OverlappedAvatar extends StatelessWidget {
  const _OverlappedAvatar({
    required this.size,
    required this.initials,
    required this.imageUrl,
    this.ringColor,
  });

  final double size;
  final String initials;
  final String? imageUrl;
  final Color? ringColor;

  @override
  Widget build(BuildContext context) {
    final avatar = AthleteProfileAvatar(
      size: size,
      initials: initials,
      imageUrl: imageUrl,
    );
    final ring = ringColor;
    if (ring == null) return avatar;

    return Container(
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: ring, width: 2.5),
      ),
      child: avatar,
    );
  }
}
