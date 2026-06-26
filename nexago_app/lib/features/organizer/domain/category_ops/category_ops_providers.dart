export 'category_ops_logic.dart';
export 'category_ops_models.dart';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'category_ops_models.dart';
import '../tournament_ops/tournament_ops_providers.dart';

final organizerCategoryDisplayTeamsProvider = Provider.autoDispose
    .family<List<OrganizerCategoryTeamRow>, OrganizerCategoryKey>((ref, key) {
  return ref.watch(organizerCategoryFilteredTeamsProvider(key));
});
