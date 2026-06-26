import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'tabs/organizer_category_payments_tab.dart';
import 'widgets/organizer_tournament_subpage_scaffold.dart';

class OrganizerCategoryPaymentsPage extends ConsumerWidget {
  const OrganizerCategoryPaymentsPage({
    super.key,
    required this.tournamentId,
    required this.categoryId,
  });

  final String tournamentId;
  final String categoryId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return OrganizerTournamentSubpageScaffold(
      title: 'Pagamentos',
      slivers: [
        SliverFillRemaining(
          hasScrollBody: true,
          child: OrganizerCategoryPaymentsTab(
            tournamentId: tournamentId,
            categoryId: categoryId,
          ),
        ),
      ],
    );
  }
}
