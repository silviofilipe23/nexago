import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/organizer_public_profile/data/organizer_event_mapper.dart';
import 'package:nexago_app/features/organizer_public_profile/domain/organizer_event.dart';
import 'package:nexago_app/features/organizer_public_profile/domain/organizer_public_profile_providers.dart';
import 'package:nexago_app/features/tournaments/data/tournament_match_enrichment_service.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_providers.dart';

class _CountingEnrichment implements TournamentMatchEnrichmentService {
  final calls = <Set<String>>[];

  @override
  Future<Map<String, String>> resolveTeamDisplayNames(
    Set<String> teamIds, {
    Map<String, String> descriptionsByTeamId = const {},
  }) async {
    calls.add(teamIds);
    return {for (final id in teamIds) id: 'Dupla $id'};
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

OrganizerEvent _completed(String id, {String? champion, int score = 0}) {
  return organizerEventFromMap(id, {
    'name': 'Evento $id',
    'listingStatus': 'completed',
    'startAt': Timestamp.fromDate(DateTime(2026, 5, 2)),
    // Muda a cada "regravação" do torneio, como placar/categoryOps fazem.
    'liveMatchesNow': score,
    'categories': [
      {'id': 'c1', 'categoryName': 'Masculino B'},
    ],
    if (champion != null)
      'categoryOps': {
        'c1': {'championTeamId': champion},
      },
  })!;
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  test(
    'regravar o torneio sem mudar os campeões não refaz a busca de nomes',
    () async {
      final events = StreamController<List<OrganizerEvent>>();
      final enrichment = _CountingEnrichment();
      final container = ProviderContainer(
        overrides: [
          organizerEventsProvider('org').overrideWith((ref) => events.stream),
          tournamentMatchEnrichmentServiceProvider.overrideWithValue(
            enrichment,
          ),
        ],
      );
      addTearDown(container.dispose);
      addTearDown(events.close);
      final sub = container.listen(
        organizerChampionNamesProvider('org'),
        (previous, next) {},
      );
      addTearDown(sub.close);

      events.add([_completed('t1', champion: 'team-a')]);
      await container.pump();
      await Future<void>.delayed(Duration.zero);
      expect(
        await container.read(organizerChampionNamesProvider('org').future),
        {'team-a': 'Dupla team-a'},
      );

      events.add([_completed('t1', champion: 'team-a', score: 3)]);
      await container.pump();
      await Future<void>.delayed(Duration.zero);
      expect(enrichment.calls, hasLength(1));

      events.add([
        _completed('t1', champion: 'team-a'),
        _completed('t2', champion: 'team-b'),
      ]);
      await container.pump();
      await Future<void>.delayed(Duration.zero);
      expect(
        await container.read(organizerChampionNamesProvider('org').future),
        {'team-a': 'Dupla team-a', 'team-b': 'Dupla team-b'},
      );
      expect(enrichment.calls, hasLength(2));
    },
  );
}
