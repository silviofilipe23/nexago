import 'package:flutter/material.dart';

import '../../widgets/team_discover/team_follow_button.dart';
import '../../../domain/tournament_team.dart';

class TeamProfileActionRow extends StatelessWidget {
  const TeamProfileActionRow({
    super.key,
    required this.teamId,
    required this.team,
    required this.isFollowing,
    required this.isCurrentUserTeam,
    required this.onFollowStateChanged,
    required this.onChallenge,
  });

  final String teamId;
  final TournamentTeam team;
  final bool isFollowing;
  final bool isCurrentUserTeam;
  final VoidCallback onFollowStateChanged;
  final VoidCallback onChallenge;

  @override
  Widget build(BuildContext context) {
    if (isCurrentUserTeam) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
      child: Row(
        children: [
          Expanded(
            flex: 11,
            child: TeamProfileFollowButton(
              teamId: teamId,
              team: team,
              isFollowing: isFollowing,
              isCurrentUserTeam: isCurrentUserTeam,
              onFollowStateChanged: onFollowStateChanged,
            ),
          ),
        ],
      ),
    );
  }
}
