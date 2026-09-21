import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/features/tournaments/data/predictions/tournament_predictions_repository.dart';
import 'package:nexago_app/features/tournaments/domain/predictions/tournament_predictions_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_card_view_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';
import 'package:nexago_app/features/tournaments/presentation/tournament_predictions_page.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/predictions/prediction_match_pick_card.dart';

/// Ordem da lista "Meus palpites": as partidas em que ainda dá pra palpitar
/// vêm antes das já travadas, com um rótulo marcando a fronteira.
///
/// A regra pura está em `tournament_predictions_logic_test.dart`; aqui o alvo
/// é o que chega na tela — ordem dos cards, presença dos rótulos e, o mais
/// importante, a lista NÃO se reorganizar quando o atleta escolhe um vencedor.
void main() {
  const tournamentId = 't1';

  TournamentMatchCardViewModel card(
    String id, {
    required int matchNumber,
    String status = TournamentMatchStatus.scheduled,
  }) {
    return TournamentMatchCardViewModel(
      match: TournamentMatch(
        id: id,
        tournamentId: tournamentId,
        categoryId: 'cat-a',
        round: 1,
        matchType: 'WB',
        poolId: '',
        teamAId: '$id-time-a',
        teamBId: '$id-time-b',
        status: status,
        resultA: '',
        resultB: '',
        isGroupMatch: false,
        matchNumber: matchNumber,
      ),
      teamA: TournamentMatchCardTeamViewModel(
        displayName: '$id A',
        players: const [],
      ),
      teamB: TournamentMatchCardTeamViewModel(
        displayName: '$id B',
        players: const [],
      ),
    );
  }

  Future<void> abrirTela(
    WidgetTester tester,
    List<TournamentMatchCardViewModel> cards,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          firebaseAuthProvider.overrideWithValue(
            MockFirebaseAuth(
              signedIn: true,
              mockUser: MockUser(uid: 'atleta-1'),
            ),
          ),
          tournamentMatchCardsProvider(tournamentId)
              .overrideWith((ref) => Stream.value(cards)),
          myTournamentPredictionEntryProvider(tournamentId)
              .overrideWith((ref) => Future.value(null)),
          tournamentPredictionsRepositoryProvider
              .overrideWithValue(_FakeTournamentPredictionsRepository()),
        ],
        child: const MaterialApp(
          home: MediaQuery(
            data: MediaQueryData(disableAnimations: true),
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

    // Deixa o StreamProvider (cards) e o FutureProvider (entry) entregarem.
    await tester.pump();
    await tester.pump();
  }

  /// Ids dos cards na ordem em que a tela os desenha.
  List<String> idsNaTela(WidgetTester tester) => tester
      .widgetList<PredictionMatchPickCard>(find.byType(PredictionMatchPickCard))
      .map((w) => w.viewModel.match.id)
      .toList();

  testWidgets(
    'as ainda palpitáveis vêm primeiro, mesmo com número de jogo maior',
    (tester) async {
      await abrirTela(tester, [
        card('grupo', matchNumber: 1, status: TournamentMatchStatus.completed),
        card('quartas', matchNumber: 30),
      ]);

      expect(idsNaTela(tester), ['quartas', 'grupo']);
    },
  );

  testWidgets('os rótulos marcam a fronteira entre os dois blocos', (
    tester,
  ) async {
    await abrirTela(tester, [
      card('grupo', matchNumber: 1, status: TournamentMatchStatus.completed),
      card('quartas', matchNumber: 30),
    ]);

    final abertas = find.textContaining('ABERTAS PARA PALPITE');
    final encerrados = find.text('PALPITES ENCERRADOS');
    expect(abertas, findsOneWidget);
    expect(encerrados, findsOneWidget);
    expect(
      tester.getTopLeft(abertas).dy,
      lessThan(tester.getTopLeft(encerrados).dy),
    );
  });

  testWidgets('com um bloco só, só o rótulo de abertas aparece', (
    tester,
  ) async {
    await abrirTela(tester, [
      card('m1', matchNumber: 1),
      card('m2', matchNumber: 2),
    ]);

    // Não há fronteira a marcar, então o rótulo de travadas some; o de
    // abertas fica, porque é ele que carrega o "N sem palpite".
    expect(find.textContaining('ABERTAS PARA PALPITE'), findsOneWidget);
    expect(find.text('PALPITES ENCERRADOS'), findsNothing);
  });

  testWidgets('escolher um vencedor não reordena a lista', (tester) async {
    // O bloco depende do STATUS da partida, não do palpite: o card em que o
    // atleta acabou de tocar precisa continuar exatamente onde estava.
    await abrirTela(tester, [
      card('grupo', matchNumber: 1, status: TournamentMatchStatus.completed),
      card('quartas', matchNumber: 30),
      card('semi', matchNumber: 40),
    ]);

    final antes = idsNaTela(tester);
    expect(antes, ['semi', 'quartas', 'grupo']);
    final topoAntes = tester.getTopLeft(find.text('semi A')).dy;

    await tester.tap(find.text('semi A'));
    await tester.pump();

    expect(idsNaTela(tester), antes);
    expect(tester.getTopLeft(find.text('semi A')).dy, topoAntes);
  });
}

/// Dublê de [TournamentPredictionsRepository]: estes testes nunca salvam, mas
/// a página lê o provider ao montar.
class _FakeTournamentPredictionsRepository
    extends TournamentPredictionsRepository {
  _FakeTournamentPredictionsRepository()
      : super(_UnusedFirestore(), functions: _UnusedFunctions());

  @override
  Future<void> submitPrediction({
    required String tournamentId,
    required Map<String, String> picks,
    String? championPick,
  }) async {}
}

class _UnusedFirestore implements FirebaseFirestore {
  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError(
        'O dublê não implementa ${invocation.memberName}.',
      );
}

class _UnusedFunctions implements FirebaseFunctions {
  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError(
        'O dublê não implementa ${invocation.memberName}.',
      );
}
