import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../tournaments/domain/tournament_detail_logic.dart';
import '../../../tournaments/presentation/double_elimination_bracket_page.dart';
import '../../domain/tournament_ops/tournament_ops_providers.dart';
import '../match_ops/organizer_match_center_page.dart';
import 'organizer_category_bracket_list_page.dart';

class OrganizerCategoryBracketPage extends ConsumerWidget {
  const OrganizerCategoryBracketPage({
    super.key,
    required this.tournamentId,
    required this.categoryId,
    this.initialTab = 'winners',
  });

  final String tournamentId;
  final String categoryId;
  final String initialTab;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (initialTab == 'matches') {
      return OrganizerMatchCenterPage(
        tournamentId: tournamentId,
        initialCategoryId: categoryId,
      );
    }

    final detail = ref.watch(organizerTournamentDetailProvider(tournamentId));
    final category = detail.valueOrNull?.categories
        .where((c) => c.categoryId == categoryId)
        .firstOrNull;
    final format = category?.bracketFormat ?? '';

    if (isDoubleEliminationBracketFormat(format)) {
      return DoubleEliminationBracketPage(
        tournamentId: tournamentId,
        categoryId: categoryId,
      );
    }

    return OrganizerCategoryBracketListPage(
      tournamentId: tournamentId,
      categoryId: categoryId,
      categoryName: category?.name ?? '',
    );
  }
}
