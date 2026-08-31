// Visibilidade da ação "Substituir atleta" e do histórico de trocas no card
// de inscrição confirmada. `_ConfirmedRegistrationCard` é privado, então o
// harness monta a aba inteira (`TournamentDetailMyRegistrationTab`) com
// overrides mínimos dos providers que ela consome — o gate em si
// (`substitutionReplaceableUids`) já é coberto por
// `tournament_substitution_logic_test.dart`; aqui o alvo é a fiação: o botão
// aparece/some conforme `replaceableUids` e o histórico renderiza as linhas.
import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
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
    bool bracketPublished = false,
    List<RegistrationSubstitutionEntry> historico = const [],
  }) =>
      MyTournamentRegistration(
        registrationId: 'reg-1',
        tournamentId: tournamentId,
        tournamentName: 'Copa de Teste',
        dateLabel: '20 ago',
        statusLabel: 'Confirmada e paga',
        isPaid: true,
        categoryId: 'masc',
        participantUids: const [meuUid, 'parceiro'],
        substitutionHistory: historico,
        category: TournamentCategoryOffer(
          id: 'masc',
          name: 'Dupla Masculina',
          entryFee: 100,
          genderType: 'male',
          bracketPublished: bracketPublished,
        ),
      );

  Future<void> abrirAba(
    WidgetTester tester, {
    required List<MyTournamentRegistration> confirmadas,
  }) async {
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
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const Scaffold(
            body: TournamentDetailMyRegistrationTab(
              tournamentId: tournamentId,
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('replaceableUids vazio (chave publicada): botão não aparece',
      (tester) async {
    await abrirAba(
      tester,
      confirmadas: [inscricao(bracketPublished: true)],
    );

    expect(find.text('Substituir atleta'), findsNothing);
  });

  testWidgets(
      'replaceableUids não-vazio (chave ainda não publicada): botão aparece',
      (tester) async {
    await abrirAba(
      tester,
      confirmadas: [inscricao(bracketPublished: false)],
    );

    expect(find.text('Substituir atleta'), findsOneWidget);
    expect(find.byIcon(Icons.swap_horiz_rounded), findsOneWidget);
  });

  testWidgets('histórico de trocas renderiza uma linha por substituição',
      (tester) async {
    await abrirAba(
      tester,
      confirmadas: [
        inscricao(
          historico: const [
            RegistrationSubstitutionEntry(outName: 'Bia', inName: 'Ana'),
            RegistrationSubstitutionEntry(outName: 'Caio', inName: 'Léo'),
          ],
        ),
      ],
    );

    expect(find.text('Ana entrou no lugar de Bia.'), findsOneWidget);
    expect(find.text('Léo entrou no lugar de Caio.'), findsOneWidget);
  });

  testWidgets('sem histórico não renderiza nenhuma linha de troca',
      (tester) async {
    await abrirAba(
      tester,
      confirmadas: [inscricao()],
    );

    expect(find.textContaining('entrou no lugar de'), findsNothing);
  });
}
