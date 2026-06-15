export 'category_ops_logic.dart';
export 'category_ops_models.dart';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'category_ops_models.dart';
import '../tournament_ops/tournament_ops_providers.dart';

final organizerCategoryShellTabProvider =
    NotifierProvider.autoDispose<_CategoryShellTabNotifier,
        OrganizerCategoryShellTab>(_CategoryShellTabNotifier.new);

class _CategoryShellTabNotifier extends AutoDisposeNotifier<OrganizerCategoryShellTab> {
  @override
  OrganizerCategoryShellTab build() => OrganizerCategoryShellTab.teams;

  void select(OrganizerCategoryShellTab tab) => state = tab;
}

final organizerCategoryDisplayTeamsProvider = Provider.autoDispose
    .family<List<OrganizerCategoryTeamRow>, OrganizerCategoryKey>((ref, key) {
  return ref.watch(organizerCategoryFilteredTeamsProvider(key));
});
