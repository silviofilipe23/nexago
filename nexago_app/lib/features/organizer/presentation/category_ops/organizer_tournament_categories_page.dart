import 'package:nexago_app/core/ui/app_status_views.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../domain/tournament_ops/tournament_ops_providers.dart';
import 'tabs/organizer_tournament_categories_tab.dart';
import 'widgets/organizer_tournament_subpage_scaffold.dart';

class OrganizerTournamentCategoriesPage extends ConsumerWidget {
  const OrganizerTournamentCategoriesPage({
    super.key,
    required this.tournamentId,
  });

  final String tournamentId;

  static DateTime? _toDate(dynamic value) {
    if (value is Timestamp) return value.toDate();
    if (value is DateTime) return value;
    return null;
  }

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
        final tournamentStartAt = _toDate(state.tournament!['startAt']);
        return OrganizerTournamentSubpageScaffold(
          title: 'Categorias',
          slivers: [
            SliverFillRemaining(
              hasScrollBody: true,
              child: OrganizerTournamentCategoriesTab(
                categories: state.categories,
                tournamentId: tournamentId,
                tournamentStartAt: tournamentStartAt,
              ),
            ),
          ],
        );
      },
    );
  }
}
