import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/squad/presentation/squad_invite_page.dart';
import 'package:nexago_app/features/squad/presentation/squad_page.dart';
import 'package:nexago_app/features/squad/presentation/widgets/squad_entry_card.dart';

import '../squad_test_support.dart';

/// Home mínima: um texto acima e abaixo para conferir que o card não ocupa
/// espaço quando some.
const _home = Scaffold(
  body: Column(
    children: [
      Text('acima', key: Key('acima')),
      SquadEntryCard(padding: EdgeInsets.all(16)),
      Text('abaixo', key: Key('abaixo')),
    ],
  ),
);

void main() {
  setUpAll(loadSquadFonts);

  group('SquadEntryCard (home e perfil)', () {
    testWidgets('flag desligada: some, sem espaço e sem chamar a callable', (
      tester,
    ) async {
      final repo = FakeSquadRepository(mySquad: memberSquad());
      await pumpSquadApp(
        tester,
        repo: repo,
        location: AppRoutes.home,
        flag: false,
        home: _home,
      );

      expect(find.byKey(const Key('squad-entry')), findsNothing);
      expect(find.text('NexaGO Squad'), findsNothing);
      expect(repo.fetchMySquadCalls, 0);
      // Sem o card, "abaixo" encosta em "acima" (nem o padding fica).
      expect(
        tester.getTopLeft(find.byKey(const Key('abaixo'))).dy,
        tester.getBottomLeft(find.byKey(const Key('acima'))).dy,
      );
    });

    testWidgets('flag ligada e sem vínculo: some', (tester) async {
      final repo = FakeSquadRepository();
      await pumpSquadApp(
        tester,
        repo: repo,
        location: AppRoutes.home,
        home: _home,
      );

      expect(repo.fetchMySquadCalls, 1);
      expect(find.byKey(const Key('squad-entry')), findsNothing);
    });

    testWidgets('membro: ganhos e código; o toque abre o Squad', (
      tester,
    ) async {
      final repo = FakeSquadRepository(mySquad: memberSquad());
      await pumpSquadApp(
        tester,
        repo: repo,
        location: AppRoutes.home,
        home: _home,
      );

      expect(find.text('NexaGO Squad'), findsOneWidget);
      expect(
        find.text('${formatBRLFromCents(32400)} no piloto · código JOAO10'),
        findsOneWidget,
      );
      expect(find.text('AMBASSADOR'), findsOneWidget);

      await tester.tap(find.byKey(const Key('squad-entry')));
      await settleSquad(tester, 20);

      expect(find.byType(SquadPage), findsOneWidget);
      // A home busca uma vez; o Squad mostra o cache e pede dado fresco.
      expect(repo.fetchMySquadCalls, 2);
    });

    testWidgets('convite em aberto: texto do convite; o toque abre o convite', (
      tester,
    ) async {
      final repo = FakeSquadRepository(mySquad: inviteSquad(id: 'inv-1'));
      await pumpSquadApp(
        tester,
        repo: repo,
        location: AppRoutes.home,
        home: _home,
      );

      expect(find.text('Você foi convidado pro NexaGO Squad'), findsOneWidget);
      expect(
        find.text('Veja o convite de Ambassador e escolha seu código'),
        findsOneWidget,
      );

      await tester.tap(find.byKey(const Key('squad-entry')));
      await settleSquad(tester, 20);

      expect(find.byType(SquadInvitePage), findsOneWidget);
      expect(repo.viewInviteCalls, ['inv-1']);
    });

    testWidgets('erro no getMySquad: some em vez de mostrar erro na home', (
      tester,
    ) async {
      final repo = FakeSquadRepository(mySquadError: StateError('offline'));
      await pumpSquadApp(
        tester,
        repo: repo,
        location: AppRoutes.home,
        home: _home,
      );

      expect(find.byKey(const Key('squad-entry')), findsNothing);
      expect(find.text('abaixo'), findsOneWidget);
    });
  });
}
