// Testes do notifier [AthleteDiscoverNotifier].
//
// Não há `fake_cloud_firestore` neste projeto (e este arquivo não deve
// adicionar um). [AthleteDiscoverRepository] é uma classe concreta que
// grava uma `CollectionReference` já no construtor
// (`firestore.collection('public_profiles')`), então qualquer subclasse
// de teste precisa de um `FirebaseFirestore` que não lance exceção nessa
// chamada — daí o `noSuchMethod` abaixo: um "fake" mínimo, específico
// deste teste, e não uma reimplementação de Firestore.
import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/features/athlete/data/athlete_discover_repository.dart';
import 'package:nexago_app/features/athlete/domain/athlete_discover_logic.dart';
import 'package:nexago_app/features/athlete/domain/athlete_discover_models.dart';
import 'package:nexago_app/features/athlete/domain/athlete_discover_providers.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';
import 'package:nexago_app/features/athlete/data/athlete_follow_service.dart';
import 'package:nexago_app/features/ranking/data/ranking_repository.dart';

/// Nunca é chamado de fato: só existe para satisfazer a assinatura de
/// `FirebaseFirestore.collection`, cujo retorno é descartado (o campo
/// privado `_users` do repositório real não é usado pelos métodos que o
/// fake abaixo sobrescreve).
class _NoopCollectionRef implements CollectionReference<Map<String, dynamic>> {
  @override
  dynamic noSuchMethod(Invocation invocation) =>
      super.noSuchMethod(invocation);
}

class _NoopFirestore implements FirebaseFirestore {
  @override
  CollectionReference<Map<String, dynamic>> collection(String path) =>
      _NoopCollectionRef();

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      super.noSuchMethod(invocation);
}

AthleteProfile _profile({
  required String id,
  required String state,
  required String city,
}) {
  return AthleteProfile(
    id: id,
    name: 'Atleta $id',
    sport: 'Vôlei de praia',
    level: 'Open',
    city: city,
    state: state,
  );
}

/// Repositório de teste: sobrescreve todo método do notifier que faria
/// I/O real, mantendo controle explícito de quando cada Future resolve.
class _FakeAthleteDiscoverRepository extends AthleteDiscoverRepository {
  _FakeAthleteDiscoverRepository()
      : super(
          firestore: _NoopFirestore(),
          rankingRepository: RankingRepository(_NoopFirestore()),
          followService: AthleteFollowService(_NoopFirestore()),
        );

  /// Página inicial devolvida por [fetchPage] — por padrão simula o caso
  /// comum descrito na review: `hasMore: true` (catálogo incompleto).
  List<AthleteProfile> initialPageProfiles = const [];
  bool initialPageHasMore = true;

  /// Controla quando [fetchProfilesForDiscover] resolve — permite ao teste
  /// inspecionar o estado exatamente durante a janela do fetch.
  Completer<List<AthleteProfile>>? catalogGate;
  List<AthleteProfile> catalogResult = const [];

  @override
  void clearRankingCache() {}

  @override
  Future<AthleteDiscoverPageResult> fetchPage({
    String? startAfterDocumentId,
    int limit = AthleteDiscoverRepository.pageSize,
  }) async {
    return AthleteDiscoverPageResult(
      profiles: initialPageProfiles,
      lastDocumentId: 'cursor-1',
      hasMore: initialPageHasMore,
    );
  }

  @override
  Future<List<AthleteProfile>> fetchProfilesForDiscover(
    AthleteDiscoverFilters filters, {
    int maxProfiles = AthleteDiscoverRepository.maxDiscoverProfiles,
  }) async {
    final gate = catalogGate;
    if (gate != null) {
      return gate.future;
    }
    return catalogResult;
  }

  @override
  Future<List<AthleteProfile>> searchProfiles(String term) async {
    throw UnimplementedError('não usado neste teste');
  }

  @override
  Future<List<AthleteDiscoverEntry>> enrichEntries({
    required List<AthleteProfile> profiles,
    required String? currentUserId,
    Set<String> followingIds = const {},
  }) async {
    return profiles.map((p) => buildDiscoverEntry(profile: p)).toList();
  }
}

void main() {
  late _FakeAthleteDiscoverRepository repo;
  late ProviderContainer container;

  setUp(() {
    repo = _FakeAthleteDiscoverRepository();
    container = ProviderContainer(
      overrides: [
        athleteDiscoverRepositoryProvider.overrideWithValue(repo),
        authProvider.overrideWith((ref) => Stream.value(null)),
        athleteProfileProvider.overrideWith((ref) => Stream.value(null)),
      ],
    );
    addTearDown(container.dispose);
  });

  test(
    'applyFilters republica com os filtros novos ANTES do catálogo completo '
    'chegar, para nunca exibir atleta que viola o filtro ativo',
    () async {
      // Catálogo paginado inicial (loadInitial): um atleta de GO e um de SP,
      // hasMore=true → catalogIsComplete fica false, o caso comum apontado
      // pela review.
      repo.initialPageProfiles = [
        _profile(id: 'go1', state: 'GO', city: 'Goiânia'),
        _profile(id: 'sp1', state: 'SP', city: 'Santos'),
      ];
      repo.initialPageHasMore = true;

      final notifier = container.read(athleteDiscoverProvider.notifier);
      await notifier.loadInitial();

      final afterInitial = container.read(athleteDiscoverProvider);
      expect(afterInitial.catalogIsComplete, isFalse);
      expect(afterInitial.displayEntries.map((e) => e.userId).toSet(), {
        'go1',
        'sp1',
      });

      // applyFilters(UF=GO) dispara _loadFullCatalog (catálogo incompleto).
      // Segura o fetch completo num Completer para inspecionar o estado
      // durante a janela em que ele ainda não resolveu.
      final gate = Completer<List<AthleteProfile>>();
      repo.catalogGate = gate;

      final pending = notifier.applyFilters(
        const AthleteDiscoverFilters(stateUf: 'GO'),
      );

      // Ainda dentro da janela do fetch (gate não resolvido): a tela precisa
      // estar carregando E já sem o atleta de SP — nunca um resultado que
      // viola o filtro recém-aplicado.
      final duringFetch = container.read(athleteDiscoverProvider);
      expect(
        duringFetch.isLoading,
        isTrue,
        reason: 'barra de progresso deve estar visível durante o fetch',
      );
      expect(
        duringFetch.displayEntries.map((e) => e.userId),
        ['go1'],
        reason:
            'republicação imediata com os filtros novos: SP não pode '
            'aparecer com UF=GO só porque o catálogo completo não chegou',
      );

      // Resolve o fetch com o catálogo completo (mais um atleta de GO).
      repo.catalogResult = [
        _profile(id: 'go1', state: 'GO', city: 'Goiânia'),
        _profile(id: 'go2', state: 'GO', city: 'Anápolis'),
        _profile(id: 'sp1', state: 'SP', city: 'Santos'),
      ];
      gate.complete(repo.catalogResult);
      await pending;

      final afterFetch = container.read(athleteDiscoverProvider);
      expect(afterFetch.catalogIsComplete, isTrue);
      expect(afterFetch.isLoading, isFalse);
      expect(afterFetch.displayEntries.map((e) => e.userId).toSet(), {
        'go1',
        'go2',
      });
    },
  );
}
