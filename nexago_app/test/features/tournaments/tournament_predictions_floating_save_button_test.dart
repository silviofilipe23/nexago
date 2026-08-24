import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/features/tournaments/data/predictions/tournament_predictions_repository.dart';
import 'package:nexago_app/features/tournaments/domain/predictions/tournament_prediction_entry.dart';
import 'package:nexago_app/features/tournaments/domain/predictions/tournament_predictions_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_card_view_model.dart';
import 'package:nexago_app/features/tournaments/presentation/tournament_predictions_page.dart';

/// Testes do botão flutuante "Salvar palpites" do Modo Focus (rota
/// `embedded: true`): ele só existe visível/tocável quando os palpites já
/// carregaram E (o atleta rolou a lista para baixo OU já tem um palpite
/// ainda não salvo).
///
/// O botão fixo no fim da lista (dentro de `_buildPicksSlivers()`) não muda
/// nesta feature e já é exercitado indiretamente aqui (mesmo `canSave`); a
/// regra pura por trás de `canSave`/picks é coberta em
/// `tournament_predictions_logic_test.dart`. O alvo deste arquivo é só a
/// fiação nova: visibilidade, toque e disparo do save pelo botão flutuante.
void main() {
  const tournamentId = 't1';
  const uid = 'atleta-1';

  TournamentMatchCardViewModel card(
    String id, {
    int matchNumber = 1,
    String teamAId = 'time-a',
    String teamBId = 'time-b',
    String matchType = 'WB',
  }) {
    return TournamentMatchCardViewModel(
      match: TournamentMatch(
        id: id,
        tournamentId: tournamentId,
        categoryId: 'cat-a',
        round: 1,
        matchType: matchType,
        poolId: '',
        teamAId: teamAId,
        teamBId: teamBId,
        status: 'Scheduled',
        resultA: '',
        resultB: '',
        isGroupMatch: false,
        matchNumber: matchNumber,
      ),
      teamA: const TournamentMatchCardTeamViewModel(
        displayName: 'Time A',
        players: [],
      ),
      teamB: const TournamentMatchCardTeamViewModel(
        displayName: 'Time B',
        players: [],
      ),
    );
  }

  Future<_FakeTournamentPredictionsRepository> abrirTela(
    WidgetTester tester, {
    required List<TournamentMatchCardViewModel> cards,
    TournamentPredictionEntry? entry,
  }) async {
    final repo = _FakeTournamentPredictionsRepository();
    final auth = MockFirebaseAuth(
      signedIn: true,
      mockUser: MockUser(uid: uid, displayName: 'Atleta Teste'),
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          firebaseAuthProvider.overrideWithValue(auth),
          tournamentMatchCardsProvider(tournamentId)
              .overrideWith((ref) => Stream.value(cards)),
          myTournamentPredictionEntryProvider(tournamentId)
              .overrideWith((ref) => Future.value(entry)),
          tournamentPredictionsRepositoryProvider.overrideWithValue(repo),
        ],
        child: MaterialApp(
          home: MediaQuery(
            // A varredura/respiro da casca premium (Final/3º lugar) não entra
            // com `matchType: 'WB'`, mas desligar animações aqui evita
            // qualquer susto se algum card do teste mudar de tipo depois.
            data: const MediaQueryData(disableAnimations: true),
            child: Scaffold(
              body: TournamentPredictionsPage(
                tournamentId: tournamentId,
                embedded: true,
              ),
            ),
          ),
        ),
      ),
    );

    // Deixa o StreamProvider (cards) e o FutureProvider (entry) entregarem o
    // primeiro valor antes de qualquer asserção.
    await tester.pump();
    await tester.pump();

    return repo;
  }

  // O botão flutuante é o único `AnimatedOpacity` da árvore nestes cenários:
  // a varredura premium do card (que usa `IgnorePointer`, não
  // `AnimatedOpacity`) só liga na Final/3º lugar, e nossos cards de teste
  // usam `matchType: 'WB'`.
  Finder floatingWrapper() => find.byType(AnimatedOpacity);
  Finder floatingButton() => find.descendant(
        of: floatingWrapper(),
        matching: find.byType(FilledButton),
      );

  // `IgnorePointer` sozinho NÃO é exclusivo do botão flutuante — o
  // `MaterialApp` usa outro para desligar a rota que sai de cena na
  // transição, e ele também é ancestral do nosso `AnimatedOpacity` (é a raiz
  // da árvore). Por isso o pegamos pela ÁRVORE DE ELEMENTOS, subindo até o
  // ancestral MAIS PRÓXIMO — que é exatamente o `IgnorePointer(ignoring:
  // !showFloatingSave)` que a página desenha, e não o da rota.
  IgnorePointer floatingIgnorePointer(WidgetTester tester) {
    final element = tester.element(floatingWrapper());
    final ignore = element.findAncestorWidgetOfExactType<IgnorePointer>();
    if (ignore == null) {
      fail('O AnimatedOpacity do botão flutuante não está sob um IgnorePointer.');
    }
    return ignore;
  }

  group('estado inicial (sem palpite pendente, sem rolar)', () {
    testWidgets(
      'o botão flutuante existe na árvore mas fica invisível e intocável',
      (tester) async {
        final repo = await abrirTela(tester, cards: [card('m1')]);

        final opacity = tester.widget<AnimatedOpacity>(floatingWrapper());
        expect(opacity.opacity, 0);

        final ignore = floatingIgnorePointer(tester);
        expect(ignore.ignoring, isTrue);

        final button = tester.widget<FilledButton>(floatingButton());
        expect(button.onPressed, isNull);

        // Mesmo tentando tocar por cima do `IgnorePointer`, nada dispara —
        // dupla proteção: o toque não alcança o botão E o botão está
        // desabilitado (`onPressed: null`).
        await tester.tap(floatingButton(), warnIfMissed: false);
        await tester.pump();
        expect(repo.submitCalls, isEmpty);
      },
    );
  });

  group('palpite ainda não salvo', () {
    testWidgets(
      'escolher um lado torna o botão flutuante visível e tocável mesmo sem rolar',
      (tester) async {
        await abrirTela(tester, cards: [card('m1')]);

        await tester.tap(find.text('Time A'));
        await tester.pump();

        final opacity = tester.widget<AnimatedOpacity>(floatingWrapper());
        expect(opacity.opacity, 1);

        final ignore = floatingIgnorePointer(tester);
        expect(ignore.ignoring, isFalse);

        final button = tester.widget<FilledButton>(floatingButton());
        expect(button.onPressed, isNotNull);
      },
    );

    testWidgets('tocar o botão flutuante salva o palpite escolhido', (
      tester,
    ) async {
      final repo = await abrirTela(tester, cards: [card('m1')]);

      await tester.tap(find.text('Time A'));
      await tester.pump();

      await tester.tap(floatingButton());
      await tester.pump(); // processa o setState(_submitting = true)
      await tester.pump(); // resolve o await do repositório
      await tester.pump(const Duration(milliseconds: 300)); // snackbar entra

      expect(repo.submitCalls, hasLength(1));
      expect(repo.submitCalls.single.tournamentId, tournamentId);
      expect(repo.submitCalls.single.picks, {'m1': 'time-a'});
      expect(
        repo.submitCalls.single.championPick,
        isNull,
        reason: 'nenhuma das partidas é Final — sem palpite de campeão',
      );
      expect(find.text('Palpites salvos!'), findsOneWidget);
    });
  });

  group('rolagem', () {
    testWidgets(
      'rolar além de 16px mostra o botão flutuante mesmo sem palpite pendente — mas desabilitado',
      (tester) async {
        final cards = List.generate(
          20,
          (i) => card('m${i + 1}', matchNumber: i + 1),
        );
        await abrirTela(tester, cards: cards);

        // Ainda no topo: escondido, como no cenário sem rolagem.
        expect(tester.widget<AnimatedOpacity>(floatingWrapper()).opacity, 0);

        await tester.drag(
          find.byType(CustomScrollView),
          const Offset(0, -200),
        );
        await tester.pump();
        await tester.pump();

        final opacity = tester.widget<AnimatedOpacity>(floatingWrapper());
        expect(opacity.opacity, 1);

        final ignore = floatingIgnorePointer(tester);
        expect(ignore.ignoring, isFalse);

        // Visível porque rolou, mas sem nenhum palpite pendente o botão
        // continua desabilitado — não há o que salvar.
        final button = tester.widget<FilledButton>(floatingButton());
        expect(button.onPressed, isNull);
      },
    );
  });
}

/// Dublê de [TournamentPredictionsRepository]: registra as chamadas de
/// `submitPrediction` em vez de tocar numa callable de verdade.
///
/// Os outros dois métodos herdados (`getMyEntry`/`loadLeaderboard`) tocariam
/// o Firestore de verdade, mas nunca são chamados pelo botão flutuante — a
/// tela lê o palpite salvo via `myTournamentPredictionEntryProvider`, que o
/// teste sobrescreve, e nunca visita a aba de ranking aqui.
class _FakeTournamentPredictionsRepository
    extends TournamentPredictionsRepository {
  _FakeTournamentPredictionsRepository()
      : super(_UnusedFirestore(), functions: _UnusedFunctions());

  final submitCalls = <({
    String tournamentId,
    Map<String, String> picks,
    String? championPick,
  })>[];

  @override
  Future<void> submitPrediction({
    required String tournamentId,
    required Map<String, String> picks,
    String? championPick,
  }) async {
    submitCalls.add((
      tournamentId: tournamentId,
      picks: picks,
      championPick: championPick,
    ));
  }
}

/// Só existem para satisfazer o construtor de
/// [TournamentPredictionsRepository] — nunca deveriam ser tocados neste
/// arquivo (ver comentário do dublê acima). Passar `functions:` explicitamente
/// também evita que o construtor real caia em `FirebaseFunctions.instance`,
/// que exige `Firebase.initializeApp()` e não está disponível em testes puros
/// de widget.
class _UnusedFirestore implements FirebaseFirestore {
  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError(
        'O dublê não implementa ${invocation.memberName}. '
        'Se o teste passou a exercitar Firestore de verdade, cubra-o aqui.',
      );
}

class _UnusedFunctions implements FirebaseFunctions {
  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError(
        'O dublê não implementa ${invocation.memberName}. '
        'Se o teste passou a exercitar Cloud Functions de verdade, cubra-o '
        'aqui.',
      );
}
