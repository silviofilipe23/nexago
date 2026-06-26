import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'tabs/organizer_tournament_matches_tab.dart';
import 'widgets/organizer_tournament_subpage_scaffold.dart';

class OrganizerTournamentOperationsPage extends ConsumerWidget {
  const OrganizerTournamentOperationsPage({
    super.key,
    required this.tournamentId,
  });

  final String tournamentId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return OrganizerTournamentSubpageScaffold(
      title: 'Partidas',
      slivers: [
        SliverFillRemaining(
          hasScrollBody: true,
          child: OrganizerTournamentMatchesTab(tournamentId: tournamentId),
        ),
      ],
    );
  }
}
