import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/features/arena/data/arena_class_enrollment_repository.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class_enrollment.dart';
import 'package:nexago_app/features/arena/presentation/aulas/arena_class_enroll_page.dart';

import 'arena_class_fixtures.dart';
import 'aulas_pump.dart';
import 'fake_arena_class_enrollment_repository.dart';
import 'fake_arena_class_repository.dart';

Future<void> _settle(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 400));
}

const _onlineRules = ArenaClassRules(onlineBillingEnabled: true);

const _preview = ArenaClassEnrollmentPreview(
  charges: [
    (
      description: 'Mensal 2x/semana · out/2026 (4 de 8 aulas)',
      amountReais: 160,
      dueDate: '2026-10-19',
    ),
  ],
  totalReais: 160,
  enrollmentFeeReais: 0,
);

FakeArenaClassRepository _classes() => FakeArenaClassRepository(
      classes: [
        arenaClass(
          id: 'c2',
          name: 'Intermediário B',
          weekdays: const [2, 4],
          start: '19:00',
          capacity: 6,
        ),
      ],
    );

/// Aluno → Mensal 2x → Ter e Qui → passo de pagamento.
Future<void> _toPayment(WidgetTester tester) async {
  await tester.tap(find.text('Continuar'));
  await _settle(tester);
  await tester.tap(find.text('Mensal 2x/semana'));
  await tester.pump();
  await tester.tap(find.text('Continuar'));
  await _settle(tester);
  await tester.tap(find.textContaining('Ter · 19:00'));
  await tester.tap(find.textContaining('Qui · 19:00'));
  await tester.pump();
  await tester.tap(find.text('Continuar'));
  await _settle(tester);
}

VoidCallback? _matricular(WidgetTester tester) => tester
    .widget<FilledButton>(find.widgetWithText(FilledButton, 'Matricular'))
    .onPressed;

void main() {
  group('Matrícula · cobrança online', () {
    testWidgets(
        'regra ligada: Online é o padrão, CPF obrigatório sem conta, a '
        'confirmação espera o link', (tester) async {
      final enrollmentRepo = FakeArenaClassEnrollmentRepository(
        plans: [plan()],
        rules: _onlineRules,
        preview: _preview,
      )..liveStudentCharges = StreamController.broadcast();
      addTearDown(enrollmentRepo.liveStudentCharges!.close);
      final copied = <String>[];
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform,
        (call) async {
          if (call.method == 'Clipboard.setData') {
            copied.add((call.arguments as Map)['text'] as String);
          }
          return null;
        },
      );
      addTearDown(() => tester.binding.defaultBinaryMessenger
          .setMockMethodCallHandler(SystemChannels.platform, null));

      await pumpAulas(
        tester,
        repo: _classes(),
        enrollmentRepo: enrollmentRepo,
        initial: '/arena/classes/enroll',
        extra: const ArenaClassEnrollSeed(
          studentId: 'st1',
          name: 'Marina Teles',
          phone: '62988887777',
        ),
      );
      await _toPayment(tester);

      expect(find.text('COMO COBRAR'), findsOneWidget);
      expect(find.text('Online'), findsOneWidget);
      expect(find.text('Manual'), findsOneWidget);
      // Online: a forma de pagamento é do aluno, na fatura.
      expect(find.text('Maquininha'), findsNothing);
      expect(find.text('CPF DE QUEM PAGA'), findsOneWidget);
      expect(enrollmentRepo.previews.single.billingMode,
          ArenaClassBillingMode.asaas);

      // Aluno sem conta: sem CPF não matricula.
      expect(_matricular(tester), isNull);
      await tester.enterText(find.byType(TextField), '52998224724');
      await tester.pump();
      expect(find.text('CPF inválido'), findsOneWidget);
      expect(_matricular(tester), isNull);

      await tester.enterText(find.byType(TextField), '52998224725');
      await tester.pump();
      expect(find.text('529.982.247-25'), findsOneWidget);
      expect(find.text('CPF inválido'), findsNothing);
      await tester.tap(find.text('Matricular'));
      await _settle(tester);

      final payload = enrollmentRepo.created.single.toPayload();
      expect(payload['billingMode'], 'asaas');
      expect(payload['cpfCnpj'], '52998224725');
      // Valor novo nunca entra em paymentMethod (build antigo leria PIX).
      expect(payload['paymentMethod'], 'pix');

      expect(find.text('Matrícula feita'), findsOneWidget);
      expect(find.text('Online · ${formatBRL(160)}'), findsOneWidget);
      expect(find.text('Gerando o link de pagamento…'), findsOneWidget);
      expect(find.text('Cobrar no WhatsApp'), findsNothing);
      expect(find.text('Copiar link'), findsNothing);

      // O worker grava a fatura pendente e depois o link.
      enrollmentRepo.liveStudentCharges!.add([
        charge(
          id: 'e-new_2026-10',
          studentId: 'st1',
          asaas: invoice(
            groupId: 'e-new_first',
            state: ArenaClassAsaasState.pending,
            url: null,
          ),
        ),
      ]);
      await _settle(tester);
      expect(find.text('Gerando o link de pagamento…'), findsOneWidget);

      enrollmentRepo.liveStudentCharges!.add([
        charge(
          id: 'e-new_2026-10',
          studentId: 'st1',
          asaas: invoice(groupId: 'e-new_first', url: 'https://asaas.test/i/7'),
        ),
      ]);
      await _settle(tester);
      expect(find.text('Gerando o link de pagamento…'), findsNothing);
      expect(find.text('Cobrar no WhatsApp'), findsOneWidget);
      await tester.ensureVisible(find.text('Copiar link'));
      await tester.tap(find.text('Copiar link'));
      await _settle(tester);
      expect(copied, ['https://asaas.test/i/7']);
      expect(find.text('Link de pagamento copiado.'), findsOneWidget);
    });

    testWidgets('atleta com conta: CPF opcional (o servidor usa o cadastro)',
        (tester) async {
      final enrollmentRepo = FakeArenaClassEnrollmentRepository(
        plans: [plan()],
        rules: _onlineRules,
        preview: _preview,
      );
      await pumpAulas(
        tester,
        repo: _classes(),
        enrollmentRepo: enrollmentRepo,
        initial: '/arena/classes/enroll',
        extra: const ArenaClassEnrollSeed(
          athleteId: 'u7',
          name: 'Paula Reis',
          phone: '62988887777',
        ),
      );
      await _toPayment(tester);

      expect(find.text('CPF DE QUEM PAGA · OPCIONAL'), findsOneWidget);
      expect(_matricular(tester), isNotNull);
      await tester.tap(find.text('Matricular'));
      await _settle(tester);

      final payload = enrollmentRepo.created.single.toPayload();
      expect(payload['billingMode'], 'asaas');
      expect(payload.containsKey('cpfCnpj'), isFalse);
      expect(payload['athleteId'], 'u7');
    });

    testWidgets('escolher Manual volta às formas e refaz a prévia',
        (tester) async {
      final enrollmentRepo = FakeArenaClassEnrollmentRepository(
        plans: [plan()],
        rules: _onlineRules,
        preview: _preview,
      );
      await pumpAulas(
        tester,
        repo: _classes(),
        enrollmentRepo: enrollmentRepo,
        initial: '/arena/classes/enroll',
        extra: const ArenaClassEnrollSeed(
          studentId: 'st1',
          name: 'Marina Teles',
          phone: '62988887777',
        ),
      );
      await _toPayment(tester);

      await tester.tap(find.text('Manual'));
      await _settle(tester);
      expect(find.text('CPF DE QUEM PAGA'), findsNothing);
      expect(find.text('Maquininha'), findsOneWidget);
      expect(enrollmentRepo.previews.map((r) => r.billingMode), [
        ArenaClassBillingMode.asaas,
        ArenaClassBillingMode.manual,
      ]);
      // Manual não pede CPF.
      expect(_matricular(tester), isNotNull);
      await tester.tap(find.text('Dinheiro'));
      await tester.pump();
      await tester.tap(find.text('Matricular'));
      await _settle(tester);

      final payload = enrollmentRepo.created.single.toPayload();
      expect(payload['billingMode'], 'manual');
      expect(payload['paymentMethod'], 'cash');
      expect(payload.containsKey('cpfCnpj'), isFalse);
      expect(find.text('Em aberto · ${formatBRL(160)}'), findsOneWidget);
      expect(find.text('Cobrar no WhatsApp'), findsOneWidget);
      expect(find.text('Copiar link'), findsNothing);
    });

    testWidgets('regra desligada: sem escolha, sempre manual', (tester) async {
      final enrollmentRepo = FakeArenaClassEnrollmentRepository(
        plans: [plan()],
        preview: _preview,
      );
      await pumpAulas(
        tester,
        repo: _classes(),
        enrollmentRepo: enrollmentRepo,
        initial: '/arena/classes/enroll',
        extra: const ArenaClassEnrollSeed(
          studentId: 'st1',
          name: 'Marina Teles',
          phone: '62988887777',
        ),
      );
      await _toPayment(tester);

      expect(find.text('COMO COBRAR'), findsNothing);
      expect(find.text('CPF DE QUEM PAGA'), findsNothing);
      expect(find.text('COMO O ALUNO PAGA'), findsOneWidget);
      expect(enrollmentRepo.previews.single.billingMode,
          ArenaClassBillingMode.manual);
    });
  });

  group('Aluno · fatura online', () {
    testWidgets('plano online com CPF mascarado; fatura, link e pago online',
        (tester) async {
      await pumpAulas(
        tester,
        repo: FakeArenaClassRepository(
          classes: [
            arenaClass(id: 'c1', name: 'Iniciante A', weekdays: const [1, 3]),
          ],
        ),
        enrollmentRepo: FakeArenaClassEnrollmentRepository(
          enrollments: [
            enrollment(
              billingMode: ArenaClassBillingMode.asaas,
              cpfMasked: '***.982.247-**',
            ),
          ],
          charges: [
            charge(id: 'open', dueDate: '2026-11-05', asaas: invoice()),
            charge(
              id: 'paid',
              description: 'Mensal 2x/semana · set/2026',
              status: 'paid',
              paidOn: '2026-10-12',
              method: ArenaClassPaymentMethod.cash,
              asaas: invoice(state: ArenaClassAsaasState.paid),
              paidVia: 'asaas',
              onlineBillingType: 'CREDIT_CARD',
            ),
          ],
        ),
        initial: '/arena/classes/student/u1',
      );
      await _settle(tester);

      expect(find.text('Online (PIX ou cartão)'), findsOneWidget);
      expect(find.text('***.982.247-**'), findsOneWidget);
      expect(find.text('dia 5'), findsOneWidget); // sem "· PIX"

      await tester.scrollUntilVisible(find.text('Fatura enviada'), 200);
      expect(find.text('Copiar link'), findsOneWidget);
      expect(find.text('Cobrar'), findsOneWidget);
      expect(find.text('Registrar'), findsOneWidget);
      await tester.scrollUntilVisible(find.text('Pago online · cartão'), 200);
      // Pago online não mostra a forma da matrícula (Dinheiro).
      expect(find.text('${formatBRL(320)} · pago 12 out'), findsOneWidget);
      expect(find.textContaining('Dinheiro'), findsNothing);
      // Nada de "Desfazer": o app não desfaz baixa (pago online é estorno).
      expect(find.text('Desfazer'), findsNothing);
    });
  });

  group('Mensalidades · fatura online', () {
    testWidgets('fatura vencida com link e aviso ao registrar à mão',
        (tester) async {
      await pumpAulas(
        tester,
        repo: FakeArenaClassRepository(),
        enrollmentRepo: FakeArenaClassEnrollmentRepository(
          rules: _onlineRules,
          charges: [
            charge(
              id: 'late',
              name: 'Diego Nunes',
              dueDate: '2026-10-12',
              asaas: invoice(status: 'OVERDUE'),
            ),
          ],
        ),
        initial: '/arena/classes/charges',
      );

      expect(find.text('Fatura vencida'), findsOneWidget);
      expect(find.text('Copiar link'), findsOneWidget);
      expect(find.text('Cobrar'), findsOneWidget);
      expect(find.textContaining('o aluno paga pelo link'), findsOneWidget);

      await tester.tap(find.text('Registrar pagamento'));
      await _settle(tester);
      expect(
        find.textContaining('registrar o pagamento aqui cancela o link'),
        findsOneWidget,
      );
    });

    testWidgets('cancelar a mensalidade presa em "Gerando link…"',
        (tester) async {
      // O Asaas recusou (R$ 4,44 < mínimo de R$ 5): o grupo ficou sem link.
      final enrollmentRepo = FakeArenaClassEnrollmentRepository(
        rules: _onlineRules,
        charges: [
          charge(
            id: 'stuck',
            name: 'Diego Nunes',
            dueDate: '2026-10-12',
            asaas: invoice(state: ArenaClassAsaasState.pending, url: null),
          ),
        ],
      );
      await pumpAulas(
        tester,
        repo: FakeArenaClassRepository(),
        enrollmentRepo: enrollmentRepo,
        initial: '/arena/classes/charges',
      );
      expect(find.text('Gerando link…'), findsOneWidget);

      await tester.tap(find.text('Registrar pagamento'));
      await _settle(tester);
      await tester.ensureVisible(find.text('Cancelar mensalidade'));
      await tester.tap(find.text('Cancelar mensalidade'));
      await _settle(tester);
      expect(find.text('Cancelar a mensalidade?'), findsOneWidget);
      expect(
        find.textContaining('fatura online também é cancelada no Asaas'),
        findsOneWidget,
      );

      await tester.tap(find.text('Sim, cancelar'));
      await _settle(tester);
      expect(enrollmentRepo.canceled, ['stuck']);
      expect(enrollmentRepo.paid, isEmpty);
      expect(find.text('Mensalidade de Diego Nunes cancelada.'), findsOneWidget);
    });

    testWidgets('voltar no aviso não cancela; manual não fala de fatura',
        (tester) async {
      final enrollmentRepo = FakeArenaClassEnrollmentRepository(
        charges: [
          charge(id: 'late', name: 'Diego Nunes', dueDate: '2026-10-12'),
        ],
      );
      await pumpAulas(
        tester,
        repo: FakeArenaClassRepository(),
        enrollmentRepo: enrollmentRepo,
        initial: '/arena/classes/charges',
      );

      await tester.tap(find.text('Registrar pagamento'));
      await _settle(tester);
      await tester.ensureVisible(find.text('Cancelar mensalidade'));
      await tester.tap(find.text('Cancelar mensalidade'));
      await _settle(tester);
      expect(find.textContaining('Asaas'), findsNothing);

      await tester.tap(find.text('Voltar'));
      await _settle(tester);
      expect(enrollmentRepo.canceled, isEmpty);
    });

    testWidgets('manual: sem rótulo de fatura, sem link e sem aviso',
        (tester) async {
      await pumpAulas(
        tester,
        repo: FakeArenaClassRepository(),
        enrollmentRepo: FakeArenaClassEnrollmentRepository(
          charges: [
            charge(id: 'late', name: 'Diego Nunes', dueDate: '2026-10-12'),
          ],
        ),
        initial: '/arena/classes/charges',
      );

      expect(find.text('Fatura enviada'), findsNothing);
      expect(find.text('Copiar link'), findsNothing);
      expect(find.textContaining('Nada passa pela plataforma'), findsOneWidget);

      await tester.tap(find.text('Registrar pagamento'));
      await _settle(tester);
      expect(
        find.textContaining('cancela o link'),
        findsNothing,
      );
    });
  });
}
