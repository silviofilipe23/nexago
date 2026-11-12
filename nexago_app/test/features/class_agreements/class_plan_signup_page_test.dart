import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/time/nexago_event_timezone.dart';
import 'package:nexago_app/features/class_agreements/infrastructure/class_agreements_repository.dart';

import 'class_agreements_test_support.dart';

const _signupPath = '/aulas/contratar/arena-sul';

Finder _key(String k) => find.byKey(Key(k));

/// Plano mensal 2x → professor Ana → seg 18h + ter 19h → contrato aberto.
Future<void> _openContractMonthly(
  WidgetTester tester,
  FakeClassAgreementsRepository repo,
) async {
  await tapKey(tester, 'class-plan-mensal-2x');
  await tapKey(tester, 'class-signup-next-plan');
  await tapKey(tester, 'class-teacher-t1');
  await tapKey(tester, 'class-signup-next-teacher');
  await tapKey(tester, 'class-slot-c1:1');
  await tapKey(tester, 'class-slot-c2:2');
  await tapKey(tester, 'class-signup-next-days');
}

Future<void> _readToEnd(WidgetTester tester) async {
  await tester.drag(_key('class-contract-scroll'), const Offset(0, -30000));
  await settle(tester);
}

void main() {
  setUpAll(() async {
    await initializeNexagoEventTimezone();
    await loadClassAgreementFonts();
  });

  group('contratar plano de aulas — caminho feliz', () {
    testWidgets(
        'plano → professor → 2 horários → lê até o fim → assina na folha → '
        'matrícula feita', (tester) async {
      final repo = FakeClassAgreementsRepository();
      await pumpClassAgreementsApp(tester, location: _signupPath, repo: repo);

      // 01 · planos: sem plano escolhido não há barra de ação.
      expect(_key('class-signup-plans'), findsOneWidget);
      expect(_key('class-signup-next-plan'), findsNothing);
      await tapKey(tester, 'class-plan-mensal-2x');
      expect(find.text('Escolher professor'), findsOneWidget);
      await tapKey(tester, 'class-signup-next-plan');

      // 02 · professor: obrigatório escolher alguém (ou "sem preferência").
      expect(_key('class-signup-teachers'), findsOneWidget);
      expect(buttonEnabled(tester, 'class-signup-next-teacher'), isFalse);
      await tapKey(tester, 'class-teacher-t1');
      expect(buttonEnabled(tester, 'class-signup-next-teacher'), isTrue);
      await tapKey(tester, 'class-signup-next-teacher');

      // 03 · dias: só os horários da Ana.
      expect(_key('class-signup-days'), findsOneWidget);
      expect(_key('class-slot-c3:1'), findsNothing);
      expect(tester.widget<Text>(_key('class-signup-count')).data, '0 de 2');
      expect(buttonEnabled(tester, 'class-signup-next-days'), isFalse);

      // Turma lotada não entra.
      await tapKey(tester, 'class-slot-c1:3');
      expect(tester.widget<Text>(_key('class-signup-count')).data, '0 de 2');

      await tapKey(tester, 'class-slot-c1:1');
      expect(tester.widget<Text>(_key('class-signup-count')).data, '1 de 2');
      expect(buttonEnabled(tester, 'class-signup-next-days'), isFalse);
      await tapKey(tester, 'class-slot-c2:2');
      expect(tester.widget<Text>(_key('class-signup-count')).data, '2 de 2');
      expect(buttonEnabled(tester, 'class-signup-next-days'), isTrue);

      // 3º horário não passa: avisa e mantém os 2.
      await tapKey(tester, 'class-slot-c2:4');
      expect(tester.widget<Text>(_key('class-signup-count')).data, '2 de 2');
      expect(
          find.textContaining('Tire um horário para trocar'), findsOneWidget);

      // 04 · contrato: prévia com os horários escolhidos.
      await tapKey(tester, 'class-signup-next-days');
      expect(repo.previewCalls.single, {
        'arenaId': 'arena-sul',
        'planId': 'mensal-2x',
        'cycle': 'monthly',
        'dueDay': null,
        'paymentForm': 'pix',
        'slots': ['c1:1', 'c2:2'],
        'cpf': null,
      });
      expect(_key('class-contract-scroll'), findsOneWidget);
      expect(find.text('Leia até o fim para assinar'), findsOneWidget);
      expect(buttonEnabled(tester, 'class-signup-sign'), isFalse);

      await _readToEnd(tester);
      expect(buttonEnabled(tester, 'class-signup-sign'), isTrue);
      expect(find.text('Leia até o fim para assinar'), findsNothing);

      // 05 · folha: o checkbox é obrigatório.
      await tapKey(tester, 'class-signup-sign');
      expect(_key('class-sign-agree'), findsOneWidget);
      expect(buttonEnabled(tester, 'class-sign-confirm'), isFalse);
      expect(repo.lastEnroll, isNull);
      await tapKey(tester, 'class-sign-agree');
      expect(buttonEnabled(tester, 'class-sign-confirm'), isTrue);
      await tapKey(tester, 'class-sign-confirm');

      // 06 · matrícula feita, com o que foi assinado.
      expect(_key('class-signup-done'), findsOneWidget);
      expect(find.text('Matrícula feita!'), findsOneWidget);
      expect(find.textContaining('Contrato de Beach Tennis 2x assinado'),
          findsOneWidget);
      expect(_key('class-signup-pay'), findsOneWidget);
      expect(repo.lastEnroll, isNotNull);
      expect(repo.lastEnroll!['planId'], 'mensal-2x');
      expect(repo.lastEnroll!['arenaId'], 'arena-sul');
      expect(repo.lastEnroll!['slots'], ['c1:1', 'c2:2']);
      expect(repo.lastEnroll!['sha256'], sha);
      expect(repo.lastEnroll!['platform'], 'ios');
      expect(repo.lastEnroll!['appVersion'], '1.0.21+119');
      expect(repo.lastEnroll!['cpf'], isNull);
      expect(repo.lastEnroll!['readSeconds'], isA<int>());
      expect(repo.calls.where((c) => c.startsWith('enroll')), hasLength(1));
      // A matrícula muda as vagas: as opções são relidas.
      expect(repo.calls.where((c) => c == 'options arena-sul'), hasLength(2));
    });
  });

  group('passo do professor', () {
    testWidgets('pacote com 1 professor pula o passo e aceita 1 horário',
        (tester) async {
      final repo = FakeClassAgreementsRepository();
      await pumpClassAgreementsApp(tester, location: _signupPath, repo: repo);

      await tapKey(tester, 'class-plan-pacote-10');
      expect(find.text('Escolher dias'), findsOneWidget);
      await tapKey(tester, 'class-signup-next-plan');

      expect(_key('class-signup-teachers'), findsNothing);
      expect(_key('class-signup-days'), findsOneWidget);
      expect(tester.widget<Text>(_key('class-signup-count')).data, '0');
      expect(buttonEnabled(tester, 'class-signup-next-days'), isFalse);
      await tapKey(tester, 'class-slot-c2:4');
      expect(tester.widget<Text>(_key('class-signup-count')).data, '1');
      expect(buttonEnabled(tester, 'class-signup-next-days'), isTrue);

      // Voltar dos dias, sem passo de professor, cai nos planos.
      await tester.tap(find.byTooltip('Voltar'));
      await settle(tester);
      expect(_key('class-signup-plans'), findsOneWidget);
    });

    testWidgets('"sem preferência" mostra os horários de todos os professores',
        (tester) async {
      final repo = FakeClassAgreementsRepository();
      await pumpClassAgreementsApp(
        tester,
        location: _signupPath,
        repo: repo,
        size: const Size(400, 2000),
      );

      await tapKey(tester, 'class-plan-mensal-2x');
      await tapKey(tester, 'class-signup-next-plan');
      await tapKey(tester, 'class-teacher-any');
      expect(buttonEnabled(tester, 'class-signup-next-teacher'), isTrue);
      await tapKey(tester, 'class-signup-next-teacher');

      for (final k in [
        'c3:1',
        'c1:1',
        'c2:2',
        'c1:3',
        'c4:3',
        'c2:4',
        'c3:5'
      ]) {
        expect(_key('class-slot-$k'), findsOneWidget, reason: k);
      }
      // Turma em que já está: aparece, mas não entra.
      await tapKey(tester, 'class-slot-c4:3');
      expect(tester.widget<Text>(_key('class-signup-count')).data, '0 de 2');
      expect(
          find.textContaining('você já está nesta turma', findRichText: true),
          findsOneWidget);

      // Pode misturar professores.
      await tapKey(tester, 'class-slot-c3:1');
      await tapKey(tester, 'class-slot-c2:2');
      expect(tester.widget<Text>(_key('class-signup-count')).data, '2 de 2');
    });

    testWidgets('trocar de professor limpa os horários escolhidos',
        (tester) async {
      final repo = FakeClassAgreementsRepository();
      await pumpClassAgreementsApp(tester, location: _signupPath, repo: repo);

      await tapKey(tester, 'class-plan-mensal-2x');
      await tapKey(tester, 'class-signup-next-plan');
      await tapKey(tester, 'class-teacher-t1');
      await tapKey(tester, 'class-signup-next-teacher');
      await tapKey(tester, 'class-slot-c1:1');
      expect(tester.widget<Text>(_key('class-signup-count')).data, '1 de 2');

      await tester.tap(find.byTooltip('Voltar'));
      await settle(tester);
      expect(_key('class-signup-teachers'), findsOneWidget);
      await tapKey(tester, 'class-teacher-t2');
      await tapKey(tester, 'class-signup-next-teacher');
      expect(tester.widget<Text>(_key('class-signup-count')).data, '0 de 2');
      expect(_key('class-slot-c1:1'), findsNothing);
    });

    testWidgets('entrada com ?plano= já vem com o plano escolhido',
        (tester) async {
      final repo = FakeClassAgreementsRepository();
      await pumpClassAgreementsApp(
        tester,
        location: '$_signupPath?plano=mensal-2x',
        repo: repo,
      );
      expect(_key('class-signup-next-plan'), findsOneWidget);
      expect(find.text('Escolher professor'), findsOneWidget);
    });
  });

  group('contrato e assinatura — bordas', () {
    testWidgets('contrato curto que cabe na tela já libera a assinatura',
        (tester) async {
      final repo = FakeClassAgreementsRepository()
        ..previewData = previewJson(body: 'Cláusula única.');
      await pumpClassAgreementsApp(
        tester,
        location: _signupPath,
        repo: repo,
        size: const Size(400, 3000),
      );
      await _openContractMonthly(tester, repo);
      expect(buttonEnabled(tester, 'class-signup-sign'), isTrue);
    });

    testWidgets('sem CPF (cobrança online): assinar só com 11 dígitos',
        (tester) async {
      final repo = FakeClassAgreementsRepository()
        ..previewData = previewJson(needsCpf: true);
      await pumpClassAgreementsApp(tester, location: _signupPath, repo: repo);
      await _openContractMonthly(tester, repo);

      // O campo fica no topo do contrato: digita antes de rolar.
      final cpf = _key('class-contract-cpf');
      await tester.ensureVisible(cpf);
      await tester.enterText(cpf, '123.456.789');
      await settle(tester);

      await _readToEnd(tester);
      expect(buttonEnabled(tester, 'class-signup-sign'), isFalse,
          reason: 'só dígitos: 9 não bastam');
      expect(find.text('Informe seu CPF para pagar pelo app'), findsOneWidget);

      await tester.drag(_key('class-contract-scroll'), const Offset(0, 30000));
      await settle(tester);
      await tester.enterText(cpf, '12345678901');
      await settle(tester);
      expect(buttonEnabled(tester, 'class-signup-sign'), isTrue,
          reason: 'leitura até o fim não se perde ao subir de volta');

      await tapKey(tester, 'class-signup-sign');
      await tapKey(tester, 'class-sign-agree');
      await tapKey(tester, 'class-sign-confirm');
      expect(repo.lastEnroll!['cpf'], '12345678901');
      expect(_key('class-signup-done'), findsOneWidget);
    });

    testWidgets('fechar a folha sem marcar não assina', (tester) async {
      final repo = FakeClassAgreementsRepository();
      await pumpClassAgreementsApp(tester, location: _signupPath, repo: repo);
      await _openContractMonthly(tester, repo);
      await _readToEnd(tester);
      await tapKey(tester, 'class-signup-sign');
      expect(_key('class-sign-agree'), findsOneWidget);

      // Toque fora da folha (barreira) fecha sem resultado.
      await tester.tapAt(const Offset(200, 20));
      await settle(tester);
      expect(_key('class-sign-agree'), findsNothing);
      expect(repo.lastEnroll, isNull);
      expect(_key('class-signup-done'), findsNothing);
      expect(buttonEnabled(tester, 'class-signup-sign'), isTrue);
    });

    testWidgets('erro do servidor: mostra a frase e continua no contrato',
        (tester) async {
      final repo = FakeClassAgreementsRepository()
        ..enrollError = ClassAgreementException(
          'Esta turma lotou enquanto você lia.',
          code: 'resource-exhausted',
        );
      await pumpClassAgreementsApp(tester, location: _signupPath, repo: repo);
      await _openContractMonthly(tester, repo);
      await _readToEnd(tester);
      await tapKey(tester, 'class-signup-sign');
      await tapKey(tester, 'class-sign-agree');
      await tapKey(tester, 'class-sign-confirm');

      expect(find.textContaining('Esta turma lotou enquanto você lia.'),
          findsOneWidget);
      expect(_key('class-signup-done'), findsNothing);
      expect(_key('class-contract-scroll'), findsOneWidget);
      expect(buttonEnabled(tester, 'class-signup-sign'), isTrue,
          reason: 'pode tentar de novo sem reler');
    });

    testWidgets('"o contrato mudou": relê a prévia e trava de novo a leitura',
        (tester) async {
      final repo = FakeClassAgreementsRepository()
        ..enrollError = ClassAgreementException(
          'O contrato mudou. Leia a nova versão.',
          code: 'failed-precondition',
        );
      await pumpClassAgreementsApp(tester, location: _signupPath, repo: repo);
      await _openContractMonthly(tester, repo);
      await _readToEnd(tester);
      await tapKey(tester, 'class-signup-sign');
      await tapKey(tester, 'class-sign-agree');
      await tapKey(tester, 'class-sign-confirm');

      expect(repo.previewCalls, hasLength(2));
      expect(find.textContaining('O contrato mudou'), findsOneWidget);
      expect(_key('class-signup-done'), findsNothing);
      expect(buttonEnabled(tester, 'class-signup-sign'), isFalse);

      await _readToEnd(tester);
      await tapKey(tester, 'class-signup-sign');
      await tapKey(tester, 'class-sign-agree');
      await tapKey(tester, 'class-sign-confirm');
      expect(_key('class-signup-done'), findsOneWidget);
      expect(repo.calls.where((c) => c.startsWith('enroll')), hasLength(2));
    });
  });

  group('estados da tela', () {
    testWidgets('arena sem plano aberto mostra o vazio', (tester) async {
      final repo = FakeClassAgreementsRepository(
        options: buildSignupOptions(plans: const []),
      );
      await pumpClassAgreementsApp(tester, location: _signupPath, repo: repo);
      expect(find.text('Nenhum plano aberto agora'), findsOneWidget);
      expect(_key('class-signup-next-plan'), findsNothing);
    });

    testWidgets('quem já tem plano vê o aviso e pode contratar outro',
        (tester) async {
      final repo = FakeClassAgreementsRepository(
        options: buildSignupOptions(activePlanCount: 2),
      );
      await pumpClassAgreementsApp(tester, location: _signupPath, repo: repo);
      expect(find.text('Você já tem 2 planos de aula aqui'), findsOneWidget);
      expect(_key('class-plan-mensal-2x'), findsOneWidget);
    });
  });
}
