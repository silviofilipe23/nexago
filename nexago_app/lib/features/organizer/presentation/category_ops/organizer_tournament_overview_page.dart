import 'package:nexago_app/core/ui/app_status_views.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../domain/tournament_ops/tournament_ops_providers.dart';
import 'tabs/organizer_tournament_overview_tab.dart';
import 'widgets/organizer_tournament_subpage_scaffold.dart';

class OrganizerTournamentOverviewPage extends ConsumerWidget {
  const OrganizerTournamentOverviewPage({
    super.key,
    required this.tournamentId,
  });

  final String tournamentId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detailAsync = ref.watch(organizerTournamentDetailProvider(tournamentId));

    return detailAsync.when(
      loading: () => const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      ),
      error: (e, _) => Scaffold(body: AppInlineErrorView(error: e)),
      data: (state) {
        if (state.summary == null || state.tournament == null) {
          return const Scaffold(
            body: Center(child: Text('Torneio não encontrado')),
          );
        }
        return OrganizerTournamentSubpageScaffold(
          title: 'Visão geral',
          slivers: [
            SliverFillRemaining(
              hasScrollBody: true,
              child: OrganizerTournamentOverviewTab(
                summary: state.summary!,
                tournament: state.tournament!,
              ),
            ),
          ],
        );
      },
    );
  }
}
