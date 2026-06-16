import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../domain/tournament_ops/tournament_ops_providers.dart';
import '../sheets/organizer_team_actions_sheet.dart';
import '../widgets/organizer_team_list_tile.dart';

class OrganizerCategoryTeamsTab extends ConsumerWidget {
  const OrganizerCategoryTeamsTab({
    super.key,
    required this.tournamentId,
    required this.categoryId,
  });

  final String tournamentId;
  final String categoryId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final key = OrganizerCategoryKey(
      tournamentId: tournamentId,
      categoryId: categoryId,
    );
    final teams = ref.watch(organizerCategoryFilteredTeamsProvider(key));

    if (teams.isEmpty) {
      return const Center(child: Text('Nenhuma dupla encontrada'));
    }

    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
      itemCount: teams.length,
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (context, index) {
        final team = teams[index];
        return OrganizerTeamListTile(
          team: team,
          rank: index + 1,
          onTap: () => showOrganizerTeamActionsSheet(
            context,
            tournamentId: tournamentId,
            categoryId: categoryId,
            team: team,
            rank: index + 1,
          ),
        );
      },
    );
  }
}
