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

/// `build()` dispara `loadInitial` num microtask. O teste espera esse boot
/// assentar antes de dirigir o notifier — senão a publicação tardia dele
/// atropela o resultado da busca.
Future<void> _settle() => Future<void>.delayed(Duration.zero);

AthleteProfile _profile({
  required String id,
  required String state,
  required String city,
  String? name,
}) {
  return AthleteProfile(
    id: id,
    name: name ?? 'Atleta $id',
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

  /// Resultado de [searchProfiles]. Representa o que o repositório REAL
  /// devolve: os perfis que o servidor já casou pela âncora em `keywords` e
  /// que o ranqueador compartilhado já ordenou por relevância (multi-token,
  /// sem acento). O notifier não pode refiltrar esta lista por texto.
  List<AthleteProfile> searchResult = const [];
  String? lastSearchTerm;

  /// Quando não nulo, [searchProfiles] lança — simula falha de regra/índice.
  Object? searchError;

  @override
  Future<List<AthleteProfile>> searchProfiles(String term) async {
    lastSearchTerm = term;
    final error = searchError;
    if (error != null) throw error;
    return searchResult;
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
    // Mantém o notifier vivo durante o teste: é AutoDispose, e sem nenhum
    // ouvinte ele é descartado entre os `await`s — cada `read` seguinte
    // recomeçaria de um estado zerado.
    container.listen(athleteDiscoverProvider, (_, __) {});
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
      await _settle();
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
      expect(
        afterFetch.catalogIsComplete,
        isFalse,
        reason: 'UF=GO foi para o servidor: o catálogo carregado é um recorte '
            'de goianos, não o catálogo completo',
      );
      expect(afterFetch.isLoading, isFalse);
      expect(afterFetch.displayEntries.map((e) => e.userId).toSet(), {
        'go1',
        'go2',
      });
    },
  );

  group('busca (caminho real do notifier)', () {
    test(
      'busca de duas palavras SEM acento devolve o perfil acentuado que o '
      'servidor casou — o pipeline do cliente não pode refiltrar por texto',
      () async {
        repo.initialPageProfiles = const [];
        repo.searchResult = [
          _profile(
            id: 'joao',
            state: 'GO',
            city: 'Goiânia',
            name: 'João Silva',
          ),
          _profile(
            id: 'joaop',
            state: 'GO',
            city: 'Goiânia',
            name: 'João Pedro Silva',
          ),
        ];

        final notifier = container.read(athleteDiscoverProvider.notifier);
        await _settle();
        await notifier.loadInitial();
        await notifier.search('joao silva');

        final state = container.read(athleteDiscoverProvider);
        expect(repo.lastSearchTerm, 'joao silva');
        expect(state.isSearchMode, isTrue);
        expect(
          state.displayEntries.map((e) => e.profile.name),
          containsAll(<String>['João Silva', 'João Pedro Silva']),
          reason: 'o termo já foi casado e ranqueado no servidor; refiltrar '
              'por `contains` da frase inteira derrubaria os dois',
        );
        expect(state.errorMessage, isNull);
      },
    );

    test('demais filtros continuam valendo sobre o resultado da busca',
        () async {
      repo.initialPageProfiles = const [];
      repo.catalogResult = const [];
      final notifier = container.read(athleteDiscoverProvider.notifier);
      await _settle();
      await notifier.loadInitial();
      await notifier.applyFilters(const AthleteDiscoverFilters(stateUf: 'SP'));

      repo.searchResult = [
        _profile(id: 'go1', state: 'GO', city: 'Goiânia', name: 'João Silva'),
        _profile(id: 'sp1', state: 'SP', city: 'Santos', name: 'João Silva'),
      ];
      await notifier.search('joao silva');

      final state = container.read(athleteDiscoverProvider);
      expect(state.displayEntries.map((e) => e.userId), ['sp1']);
    });

    test('teto de 25 é aplicado DEPOIS dos filtros', () async {
      repo.initialPageProfiles = const [];
      repo.catalogResult = const [];
      final notifier = container.read(athleteDiscoverProvider.notifier);
      await _settle();
      await notifier.loadInitial();
      await notifier.applyFilters(const AthleteDiscoverFilters(stateUf: 'SP'));

      // 30 homônimos ranqueados: os 26 primeiros de GO, os 4 últimos de SP.
      // Cortar em 25 ANTES do filtro deixaria a tela vazia.
      repo.searchResult = [
        for (var i = 0; i < 26; i++)
          _profile(id: 'go$i', state: 'GO', city: 'Goiânia', name: 'Silva $i'),
        for (var i = 0; i < 4; i++)
          _profile(id: 'sp$i', state: 'SP', city: 'Santos', name: 'Silva $i'),
      ];
      await notifier.search('silva');

      expect(
        container.read(athleteDiscoverProvider).displayEntries.length,
        4,
      );
    });

    test('teto de 25 continua valendo na exibição', () async {
      repo.initialPageProfiles = const [];
      repo.searchResult = [
        for (var i = 0; i < 40; i++)
          _profile(id: 'a$i', state: 'GO', city: 'Goiânia', name: 'Silva $i'),
      ];

      final notifier = container.read(athleteDiscoverProvider.notifier);
      await _settle();
      await notifier.loadInitial();
      await notifier.search('silva');

      expect(
        container.read(athleteDiscoverProvider).displayEntries.length,
        25,
      );
    });

    test('falha da busca vira errorMessage, não "ninguém encontrado"',
        () async {
      repo.initialPageProfiles = const [];
      repo.searchError = StateError('permission-denied');

      final notifier = container.read(athleteDiscoverProvider.notifier);
      await _settle();
      await notifier.loadInitial();
      await notifier.search('silva');

      final state = container.read(athleteDiscoverProvider);
      expect(state.errorMessage, isNotNull);
      expect(state.isLoading, isFalse);
      // A tela só exibe o erro com a lista vazia: resultado velho na tela
      // esconderia a falha exatamente como o `return const []` escondia.
      expect(state.displayEntries, isEmpty);
    });

    test(
      'busca que falha com catálogo JÁ completo não trava o próximo filtro '
      'numa lista vazia e silenciosa',
      () async {
        // loadInitial sem hasMore: catalogIsComplete fica true ANTES da busca.
        repo.initialPageProfiles = [
          _profile(id: 'go1', state: 'GO', city: 'Goiânia'),
        ];
        repo.initialPageHasMore = false;

        final notifier = container.read(athleteDiscoverProvider.notifier);
        await _settle();
        await notifier.loadInitial();
        expect(
          container.read(athleteDiscoverProvider).catalogIsComplete,
          isTrue,
        );

        repo.searchError = StateError('permission-denied');
        await notifier.search('silva');

        final afterSearchError = container.read(athleteDiscoverProvider);
        expect(afterSearchError.errorMessage, isNotNull);
        expect(afterSearchError.displayEntries, isEmpty);

        // Usuário troca o filtro depois do erro. Se `catalogIsComplete`
        // continuar `true` (valor de ANTES da busca falhar), applyFilters
        // confia no catálogo vazio deixado pelo erro e nunca refaz o fetch.
        // Nome bate com o termo de busca que ficou pendurado em `searchQuery`
        // (`_applyPipeline` reaplica o match de texto fora do modo busca).
        repo.catalogResult = [
          _profile(id: 'go2', state: 'GO', city: 'Anápolis', name: 'Silva 2'),
        ];
        await notifier.applyFilters(
          const AthleteDiscoverFilters(stateUf: 'GO'),
        );

        final afterFilter = container.read(athleteDiscoverProvider);
        expect(
          afterFilter.displayEntries.isNotEmpty ||
              afterFilter.errorMessage != null,
          isTrue,
          reason:
              'nem a lista voltou a ter atletas, nem o erro segue visível: '
              'o usuário fica preso numa lista vazia sem explicação',
        );
      },
    );

    test(
      'limpar a busca abaixo de 2 caracteres republica com os filtros ativos '
      'antes do catálogo chegar',
      () async {
        repo.initialPageProfiles = const [];
        repo.catalogResult = const [];
        final notifier = container.read(athleteDiscoverProvider.notifier);
        await _settle();
        await notifier.loadInitial();
        await notifier.applyFilters(const AthleteDiscoverFilters(stateUf: 'SP'));

        repo.searchResult = [
          for (var i = 0; i < 30; i++)
            _profile(id: 'sp$i', state: 'SP', city: 'Santos', name: 'Silva $i'),
        ];
        await notifier.search('silva');
        expect(
          container.read(athleteDiscoverProvider).displayEntries.length,
          25,
          reason: 'teto da busca',
        );

        // Catálogo filtrado preso: durante a janela do fetch a lista já tem de
        // refletir "sem busca, só filtros" — não o resultado da busca anterior.
        final gate = Completer<List<AthleteProfile>>();
        repo.catalogGate = gate;
        final pending = notifier.search('');

        final duringFetch = container.read(athleteDiscoverProvider);
        expect(duringFetch.isSearchMode, isFalse);
        expect(
          duringFetch.displayEntries.length,
          30,
          reason: 'republicação imediata: sem termo de busca o teto de 25 não '
              'vale mais, e a lista não pode ficar congelada sob a barra de '
              'progresso',
        );

        gate.complete(const []);
        await pending;
      },
    );
  });

  group('catálogo completo', () {
    test(
      'catálogo carregado COM constraint de servidor não se declara completo, '
      'senão trocar de UF refiltra o recorte antigo e a lista fica vazia',
      () async {
        repo.initialPageProfiles = [
          _profile(id: 'go1', state: 'GO', city: 'Goiânia'),
        ];
        repo.initialPageHasMore = true;

        final notifier = container.read(athleteDiscoverProvider.notifier);
        await _settle();
        await notifier.loadInitial();

        // UF=SP vai para o servidor: o que volta são só paulistas.
        repo.catalogResult = [
          _profile(id: 'sp1', state: 'SP', city: 'Santos'),
        ];
        await notifier.applyFilters(const AthleteDiscoverFilters(stateUf: 'SP'));

        var state = container.read(athleteDiscoverProvider);
        expect(state.displayEntries.map((e) => e.userId), ['sp1']);
        expect(
          state.catalogIsComplete,
          isFalse,
          reason: 'o fetch teve constraint de UF; o catálogo é um recorte',
        );

        // Trocar para RJ tem de REFAZER o fetch, não refiltrar os paulistas.
        repo.catalogResult = [
          _profile(id: 'rj1', state: 'RJ', city: 'Niterói'),
        ];
        await notifier.applyFilters(const AthleteDiscoverFilters(stateUf: 'RJ'));

        state = container.read(athleteDiscoverProvider);
        expect(state.displayEntries.map((e) => e.userId), ['rj1']);
      },
    );

    test('catálogo carregado SEM constraint de servidor é completo', () async {
      repo.initialPageProfiles = const [];
      repo.initialPageHasMore = true;
      repo.catalogResult = [
        _profile(id: 'go1', state: 'GO', city: 'Goiânia'),
      ];

      final notifier = container.read(athleteDiscoverProvider.notifier);
      await _settle();
      await notifier.loadInitial();
      // `completeProfileOnly` é filtro só de cliente — não vira constraint.
      await notifier.applyFilters(
        const AthleteDiscoverFilters(completeProfileOnly: true),
      );

      expect(
        container.read(athleteDiscoverProvider).catalogIsComplete,
        isTrue,
      );
    });
  });

  test(
    'o repositório do Descobrir não depende mais do RankingRepository — '
    'ranking mora na tela de Ranking, e a listagem parava de baixar a '
    'coleção inteira só para descartá-la',
    () {
      final repo = AthleteDiscoverRepository(
        firestore: _NoopFirestore(),
        followService: AthleteFollowService(_NoopFirestore()),
      );

      expect(repo, isNotNull);
    },
  );
}
