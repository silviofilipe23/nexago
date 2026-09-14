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

/// Testes do botão "Salvar" no header da aba Meus palpites (`embedded: true`):
/// fica à direita do seletor depois que os palpites carregam; o `onPressed`
/// só liga quando há mudança pendente.
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

    await tester.pump();
    await tester.pump();

    return repo;
  }

  Finder saveButton() => find.widgetWithText(FilledButton, 'Salvar');

  group('estado inicial (sem palpite pendente)', () {
    testWidgets(
      'o botão Salvar aparece desabilitado assim que os palpites carregam',
      (tester) async {
        final repo = await abrirTela(tester, cards: [card('m1')]);

        expect(saveButton(), findsOneWidget);
        final button = tester.widget<FilledButton>(saveButton());
        expect(button.onPressed, isNull);

        await tester.tap(saveButton(), warnIfMissed: false);
        await tester.pump();
        expect(repo.submitCalls, isEmpty);
      },
    );
  });

  group('palpite ainda não salvo', () {
    testWidgets(
      'escolher um lado habilita o botão Salvar',
      (tester) async {
        await abrirTela(tester, cards: [card('m1')]);

        await tester.tap(find.text('Time A'));
        await tester.pump();

        final button = tester.widget<FilledButton>(saveButton());
        expect(button.onPressed, isNotNull);
      },
    );

    testWidgets('tocar Salvar envia o palpite escolhido', (tester) async {
      final repo = await abrirTela(tester, cards: [card('m1')]);

      await tester.tap(find.text('Time A'));
      await tester.pump();

      await tester.tap(saveButton());
      await tester.pump();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

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

  group('aba Ranking', () {
    testWidgets('trocar para Ranking esconde o botão Salvar', (tester) async {
      await abrirTela(tester, cards: [card('m1')]);
      expect(saveButton(), findsOneWidget);

      await tester.tap(find.text('Ranking'));
      await tester.pump();

      expect(saveButton(), findsNothing);
    });
  });
}

/// Dublê de [TournamentPredictionsRepository]: registra as chamadas de
/// `submitPrediction` em vez de tocar numa callable de verdade.
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
