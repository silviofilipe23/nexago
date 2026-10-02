import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
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

void main() {
  test('busca os nomes da chave; a mesma chave não refaz a leitura', () async {
    final enrichment = _CountingEnrichment();
    final container = ProviderContainer(
      overrides: [
        tournamentMatchEnrichmentServiceProvider.overrideWithValue(enrichment),
      ],
    );
    addTearDown(container.dispose);
    final sub = container.listen(
      championTeamNamesByKeyProvider('t-a,t-b'),
      (previous, next) {},
    );
    addTearDown(sub.close);

    expect(
      await container.read(championTeamNamesByKeyProvider('t-a,t-b').future),
      {'t-a': 'Dupla t-a', 't-b': 'Dupla t-b'},
    );
    // Regravação do torneio sem campeão novo gera a mesma chave (mesma String).
    await container.read(championTeamNamesByKeyProvider('t-a,t-b').future);
    expect(enrichment.calls, [
      {'t-a', 't-b'},
    ]);

    await container.read(championTeamNamesByKeyProvider('t-c').future);
    expect(enrichment.calls, hasLength(2));
  });

  test('chave vazia não lê nada', () async {
    final enrichment = _CountingEnrichment();
    final container = ProviderContainer(
      overrides: [
        tournamentMatchEnrichmentServiceProvider.overrideWithValue(enrichment),
      ],
    );
    addTearDown(container.dispose);
    expect(
      await container.read(championTeamNamesByKeyProvider('').future),
      isEmpty,
    );
    expect(enrichment.calls, isEmpty);
  });
}
