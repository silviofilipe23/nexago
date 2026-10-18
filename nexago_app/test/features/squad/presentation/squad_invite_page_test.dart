import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/squad/domain/squad_repository.dart';
import 'package:nexago_app/features/squad/presentation/squad_page.dart';

import '../squad_test_support.dart';

const _inviteRoute = '/athlete/squad/convite/inv-1';

FilledButton _acceptButton(WidgetTester tester) => tester.widget<FilledButton>(
  find.descendant(
    of: find.byKey(const Key('squad-invite-accept')),
    matching: find.byType(FilledButton),
  ),
);

Future<void> _checkContract(WidgetTester tester) async {
  await tester.tap(find.byKey(const Key('squad-invite-contract-check')));
  await tester.pump();
}

Future<void> _editCode(WidgetTester tester, String text) async {
  await tester.tap(find.text('Editar'));
  await tester.pump();
  await tester.enterText(
    find.byKey(const Key('squad-invite-code-field')),
    text,
  );
  await tester.pump();
}

void main() {
  setUpAll(loadSquadFonts);

  group('Convite (tela 06) — aberto', () {
    testWidgets('abrir a tela consulta o convite pelo id da rota', (
      tester,
    ) async {
      final repo = FakeSquadRepository();
      await pumpSquadApp(tester, repo: repo, location: _inviteRoute);

      expect(repo.viewInviteCalls, ['inv-1']);
      expect(
        squadTextOf(tester, const Key('squad-invite-title')),
        'João, você foi convidado pro NexaGO Squad.',
      );
      expect(
        find.text(
          'Seus 12 torneios chamaram atenção. Ciclo até 06 dez, sem '
          'mensalidade e sem meta de posts.',
        ),
        findsOneWidget,
      );
      expect(find.text('O que você recebe'), findsOneWidget);
      expect(find.text('10% de comissão'), findsOneWidget);
      expect(squadTextOf(tester, const Key('squad-invite-code')), 'JOAO10');
    });

    testWidgets('"Entrar no Squad" fica desabilitado até marcar o contrato', (
      tester,
    ) async {
      final repo = FakeSquadRepository();
      await pumpSquadApp(tester, repo: repo, location: _inviteRoute);

      expect(_acceptButton(tester).onPressed, isNull);

      await _checkContract(tester);
      expect(_acceptButton(tester).onPressed, isNotNull);

      // Desmarcar volta a travar.
      await _checkContract(tester);
      expect(_acceptButton(tester).onPressed, isNull);
      expect(repo.acceptCalls, isEmpty);
    });

    testWidgets(
      'aceitar com o código sugerido cria o contrato e abre o Squad',
      (tester) async {
        final repo = FakeSquadRepository();
        await pumpSquadApp(tester, repo: repo, location: _inviteRoute);

        await _checkContract(tester);
        // Depois do aceite, o Squad relê o contrato já com o membro.
        repo.mySquad = memberSquad();
        await tester.tap(find.byKey(const Key('squad-invite-accept')));
        await settleSquad(tester, 20);

        expect(repo.acceptCalls.single, (inviteId: 'inv-1', code: 'JOAO10'));
        expect(find.text('Bem-vindo ao NexaGO Squad!'), findsOneWidget);
        expect(find.byType(SquadPage), findsOneWidget);
        expect(squadTextOf(tester, const Key('squad-code')), 'JOAO10');
      },
    );

    testWidgets('editar o código: minúsculas viram maiúsculas e o aceite leva '
        'o código normalizado', (tester) async {
      final repo = FakeSquadRepository();
      await pumpSquadApp(tester, repo: repo, location: _inviteRoute);

      await _editCode(tester, 'joaov7');
      expect(find.text('JOAOV7'), findsOneWidget);
      await _checkContract(tester);
      await tester.tap(find.byKey(const Key('squad-invite-accept')));
      await settleSquad(tester, 20);

      expect(repo.acceptCalls.single.code, 'JOAOV7');
    });

    testWidgets(
      'editar o código: acento vira letra sem acento (joão10 → JOAO10)',
      (tester) async {
        final repo = FakeSquadRepository();
        await pumpSquadApp(tester, repo: repo, location: _inviteRoute);

        await _editCode(tester, 'joão10');
        await _checkContract(tester);
        await tester.tap(find.byKey(const Key('squad-invite-accept')));
        await settleSquad(tester, 20);

        expect(find.text('JOAO10'), findsOneWidget);
        expect(repo.acceptCalls.single.code, 'JOAO10');
      },
    );

    testWidgets('código curto demais mantém o botão desabilitado', (
      tester,
    ) async {
      final repo = FakeSquadRepository();
      await pumpSquadApp(tester, repo: repo, location: _inviteRoute);

      await _editCode(tester, 'abc');
      await _checkContract(tester);

      expect(_acceptButton(tester).onPressed, isNull);
      expect(
        find.text('4 a 12 letras ou números. É o que seus seguidores digitam.'),
        findsOneWidget,
      );
    });

    testWidgets('o campo limita o código a 12 caracteres', (tester) async {
      final repo = FakeSquadRepository();
      await pumpSquadApp(tester, repo: repo, location: _inviteRoute);

      await _editCode(tester, 'abcdefghijklmnop');

      expect(find.text('ABCDEFGHIJKL'), findsOneWidget);
    });

    testWidgets('SquadException(field: code) mostra o erro no campo do código', (
      tester,
    ) async {
      final repo = FakeSquadRepository(
        acceptError: const SquadException(
          'Esse código já está em uso. Escolha outro.',
          field: 'code',
        ),
      );
      await pumpSquadApp(tester, repo: repo, location: _inviteRoute);

      await _checkContract(tester);
      await tester.tap(find.byKey(const Key('squad-invite-accept')));
      await settleSquad(tester);

      expect(repo.acceptCalls, hasLength(1));
      // O campo abre para edição com a mensagem do servidor, sem sair da tela.
      expect(find.byKey(const Key('squad-invite-code-field')), findsOneWidget);
      expect(
        find.text('Esse código já está em uso. Escolha outro.'),
        findsOneWidget,
      );
      expect(find.byType(SnackBar), findsNothing);
      expect(find.byType(SquadPage), findsNothing);

      // Digitar de novo limpa o erro.
      await tester.enterText(
        find.byKey(const Key('squad-invite-code-field')),
        'JOAOV7',
      );
      await tester.pump();
      expect(
        find.text('Esse código já está em uso. Escolha outro.'),
        findsNothing,
      );
      expect(_acceptButton(tester).onPressed, isNotNull);
    });

    testWidgets('erro sem campo vira aviso (snackbar) e o botão volta', (
      tester,
    ) async {
      final repo = FakeSquadRepository(
        acceptError: const SquadException('Este convite não vale mais.'),
      );
      await pumpSquadApp(tester, repo: repo, location: _inviteRoute);

      await _checkContract(tester);
      await tester.tap(find.byKey(const Key('squad-invite-accept')));
      await settleSquad(tester);

      expect(find.text('Este convite não vale mais.'), findsOneWidget);
      expect(find.byType(SnackBar), findsOneWidget);
      expect(find.byKey(const Key('squad-invite-code-field')), findsNothing);
      expect(_acceptButton(tester).onPressed, isNotNull);
    });

    testWidgets('"contrato do Squad" abre o resumo com o fim do período', (
      tester,
    ) async {
      await pumpSquadApp(
        tester,
        repo: FakeSquadRepository(),
        location: _inviteRoute,
      );

      await tester.tap(find.byKey(const Key('squad-invite-contract-link')));
      await settleSheet(tester);

      expect(find.text('Contrato do NexaSquad'), findsOneWidget);
      expect(find.text('Nível Ambassador · até 06 dez.'), findsOneWidget);
    });
  });

  group('Convite (tela 06) — fechado e erro', () {
    testWidgets('status expired mostra "Este convite expirou", sem aceite', (
      tester,
    ) async {
      await pumpSquadApp(
        tester,
        repo: FakeSquadRepository(invite: squadInvite(status: 'expired')),
        location: _inviteRoute,
      );

      expect(find.text('Este convite expirou'), findsOneWidget);
      expect(find.byKey(const Key('squad-invite-accept')), findsNothing);
    });

    testWidgets('já aceito: "Abrir o Squad" leva ao painel', (tester) async {
      await pumpSquadApp(
        tester,
        repo: FakeSquadRepository(
          mySquad: memberSquad(),
          invite: squadInvite(status: 'accepted'),
        ),
        location: _inviteRoute,
      );

      expect(find.text('Você já está no Squad'), findsOneWidget);
      await tester.tap(find.text('Abrir o Squad'));
      await settleSquad(tester, 20);

      expect(find.byType(SquadPage), findsOneWidget);
    });

    testWidgets('cancelado ou agendado: "não está mais disponível"', (
      tester,
    ) async {
      for (final status in ['canceled', 'scheduled']) {
        await pumpSquadApp(
          tester,
          repo: FakeSquadRepository(invite: squadInvite(status: status)),
          location: _inviteRoute,
        );

        expect(
          find.text('Este convite não está mais disponível'),
          findsOneWidget,
          reason: status,
        );
      }
    });

    testWidgets('erro ao abrir: "Tentar de novo" consulta de novo', (
      tester,
    ) async {
      final repo = FakeSquadRepository(
        inviteError: const SquadException('Convite não encontrado.'),
      );
      await pumpSquadApp(tester, repo: repo, location: _inviteRoute);

      expect(find.text('Não foi possível abrir o convite'), findsOneWidget);
      expect(find.text('Convite não encontrado.'), findsOneWidget);

      repo.inviteError = null;
      await tester.tap(find.text('Tentar de novo'));
      await settleSquad(tester);

      expect(repo.viewInviteCalls, ['inv-1', 'inv-1']);
      expect(find.byKey(const Key('squad-invite-accept')), findsOneWidget);
    });

    testWidgets('fechar sem pilha (aberto pelo push) cai na home', (
      tester,
    ) async {
      await pumpSquadApp(
        tester,
        repo: FakeSquadRepository(),
        location: _inviteRoute,
      );

      await tester.tap(find.bySemanticsLabel('Fechar'));
      await settleSquad(tester, 20);

      expect(find.text('home'), findsOneWidget);
    });
  });

  test('rota do convite casa com a do push', () {
    expect(
      AppRoutes.squadInvite.replaceAll(':inviteId', 'inv-1'),
      _inviteRoute,
    );
  });
}
