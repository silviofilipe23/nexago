// Navegação do card de inscrição confirmada. `_ConfirmedRegistrationCard` é
// privado, então o harness monta a aba inteira
// (`TournamentDetailMyRegistrationTab`) com overrides mínimos dos providers
// que ela consome. Desde a tela de Detalhe (Task 4), o card NÃO decide mais
// nada sobre substituição/histórico — só navega; a cobertura de
// visibilidade do gate e do histórico mudou para
// `tournament_registration_detail_page_test.dart`.
import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete/domain/athlete_home_registration_progress_providers.dart';
import 'package:nexago_app/features/tournaments/data/my_tournament_registrations_repository.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_detail/tournament_detail_my_registration_tab.dart';

void main() {
  const meuUid = 'me';
  const tournamentId = 't1';

  MyTournamentRegistration inscricao({
    String registrationId = 'reg-1',
    bool bracketPublished = false,
  }) =>
      MyTournamentRegistration(
        registrationId: registrationId,
        tournamentId: tournamentId,
        tournamentName: 'Copa de Teste',
        dateLabel: '20 ago',
        statusLabel: 'Confirmada e paga',
        isPaid: true,
        categoryId: 'masc',
        participantUids: const [meuUid, 'parceiro'],
        category: TournamentCategoryOffer(
          id: 'masc',
          name: 'Dupla Masculina',
          entryFee: 100,
          genderType: 'male',
          bracketPublished: bracketPublished,
        ),
      );

  late List<Map<String, String>> openedDetailParams;

  Future<void> abrirAba(
    WidgetTester tester, {
    required List<MyTournamentRegistration> confirmadas,
  }) async {
    openedDetailParams = <Map<String, String>>[];
    final router = GoRouter(
      routes: [
        GoRoute(
          path: '/',
          builder: (_, __) => Scaffold(
            body: TournamentDetailMyRegistrationTab(
              tournamentId: tournamentId,
            ),
          ),
        ),
        GoRoute(
          path: '/torneios/:tournamentId/inscricao/:registrationId/detalhe',
          name: 'tournamentRegistrationDetail',
          builder: (_, state) {
            openedDetailParams.add(state.pathParameters);
            return const Scaffold(body: Text('tela de detalhe'));
          },
        ),
      ],
    );
    addTearDown(router.dispose);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authProvider.overrideWith(
            (ref) => Stream.value(MockUser(uid: meuUid)),
          ),
          myTournamentRegistrationsProvider.overrideWith(
            (ref) => Stream.value(confirmadas),
          ),
          athleteHomeInProgressRegistrationsProvider.overrideWith(
            (ref) async => const [],
          ),
        ],
        child: MaterialApp.router(
          theme: AppTheme.dark,
          routerConfig: router,
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets(
      'toque no card confirmado (chave publicada) navega para o detalhe',
      (tester) async {
    await abrirAba(
      tester,
      confirmadas: [inscricao(bracketPublished: true)],
    );

    await tester.tap(find.text('Dupla Masculina'));
    await tester.pumpAndSettle();

    expect(openedDetailParams, [
      {'tournamentId': tournamentId, 'registrationId': 'reg-1'},
    ]);
  });

  testWidgets(
      'toque no card confirmado (chave ainda não publicada) navega para o detalhe',
      (tester) async {
    await abrirAba(
      tester,
      confirmadas: [inscricao(bracketPublished: false)],
    );

    await tester.tap(find.text('Dupla Masculina'));
    await tester.pumpAndSettle();

    expect(openedDetailParams, [
      {'tournamentId': tournamentId, 'registrationId': 'reg-1'},
    ]);
  });

  testWidgets(
      'duas inscrições confirmadas: cada card navega para o próprio registrationId',
      (tester) async {
    await abrirAba(
      tester,
      confirmadas: [
        inscricao(registrationId: 'reg-1'),
        inscricao(registrationId: 'reg-2'),
      ],
    );

    await tester.tap(find.text('Confirmada e paga').last);
    await tester.pumpAndSettle();

    expect(openedDetailParams, [
      {'tournamentId': tournamentId, 'registrationId': 'reg-2'},
    ]);
  });

  testWidgets(
      'card não mostra mais o botão de substituir nem o histórico (moveram para o detalhe)',
      (tester) async {
    await abrirAba(
      tester,
      confirmadas: [inscricao(bracketPublished: false)],
    );

    expect(find.text('Substituir atleta'), findsNothing);
    expect(find.textContaining('entrou no lugar de'), findsNothing);
  });
}
