import 'package:flutter/material.dart';

import '../../../domain/match_history/athlete_match_detail_models.dart';
import '../athlete_profile_avatar.dart';

class MatchDetailTeamAvatarStack extends StatelessWidget {
  const MatchDetailTeamAvatarStack({
    super.key,
    required this.players,
    this.size = 44,
    this.stackWidth = 72,
    this.stackHeight = 52,
  });

  final List<MatchTeamPlayer> players;
  final double size;
  final double stackWidth;
  final double stackHeight;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: stackHeight,
      width: stackWidth,
      child: Stack(
        alignment: Alignment.center,
        children: [
          if (players.isNotEmpty)
            Positioned(
              left: 0,
              child: AthleteProfileAvatar(
                size: size,
                initials: players.first.initials,
                imageUrl: players.first.avatarUrl,
              ),
            ),
          if (players.length > 1)
            Positioned(
              right: 0,
              child: AthleteProfileAvatar(
                size: size,
                initials: players[1].initials,
                imageUrl: players[1].avatarUrl,
              ),
            ),
        ],
      ),
    );
  }
}
