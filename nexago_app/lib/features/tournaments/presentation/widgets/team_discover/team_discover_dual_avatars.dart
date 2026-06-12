import 'package:flutter/material.dart';

import '../../../../athlete/presentation/widgets/athlete_profile_avatar.dart';
import '../../../domain/team_discover_models.dart';

/// Avatares circulares sobrepostos (padrão `AthleteProfileAvatar` + ranking).
class TeamDiscoverDualAvatars extends StatelessWidget {
  const TeamDiscoverDualAvatars({super.key, required this.entry});

  final TeamDiscoverEntry entry;

  static const avatarSize = 46.0;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: avatarSize + 16,
      height: avatarSize,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Positioned(
            left: 0,
            child: AthleteProfileAvatar(
              size: avatarSize,
              initials: entry.player1Initials,
              imageUrl: entry.player1?.avatarUrl,
            ),
          ),
          if (!entry.isLookingForPartner)
            Positioned(
              left: avatarSize * 0.55,
              child: AthleteProfileAvatar(
                size: avatarSize,
                initials: entry.player2Initials,
                imageUrl: entry.player2?.avatarUrl,
              ),
            ),
        ],
      ),
    );
  }
}
