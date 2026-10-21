import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/messages/domain/messages.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_availability.dart';
import 'package:nexago_app/features/professor_mode/presentation/wallet/professor_wallet_charge_page.dart';

import '../professor_links/professor_links_test_support.dart'
    show loadProfessorLinksFonts;
import '../professor_mode/professor_availability_test_support.dart';
import '../professor_mode/professor_students_test_support.dart';
import '../professor_mode/professor_wallet_test_support.dart';
import 'messages_test_support.dart';

/// Remarcação pelo chat (D3): o cartão na conversa, a folha de horários e
/// os atalhos (Remarcar, Cobrar, Enviar avaliação). Agora = Ter 20/10 12:00.

Future<void> tap(WidgetTester tester, Finder f) async {
  await tester.ensureVisible(f);
  await tester.tap(f);
  await settleProfessorStudents(tester);
}

String convPath(String id) =>
    AppRoutes.professorConversation.replaceAll(':conversationId', id);

String athleteConvPath(String id) =>
    AppRoutes.athleteConversation.replaceAll(':conversationId', id);

const conversationId = 'd_prof-1_ath-1';

RescheduleCard rescheduleCard({
  String status = 'pending',
  String requestedBy = 'ath-1',
}) =>
    RescheduleCard.fromMap({
      'type': 'reschedule',
      'lessonId': 'pl1',
      'status': status,
      'requestedBy': requestedBy,
      'fromStartAt': spInstant(22, 6),
      'toStartAt': spInstant(22, 7),
      'toEndAt': spInstant(22, 8),
    })!;

ChatMessage cardMessage({
  String status = 'pending',
  String requestedBy = 'ath-1',
}) =>
    msg(
      'm-card',
      requestedBy,
      'Pedido de remarcação: Qui 22/10 · 07:00',
      card: rescheduleCard(status: status, requestedBy: requestedBy),
    );

FakeMessagesRepository messagesWith(List<ChatMessage> list) =>
    FakeMessagesRepository(
      conversations: [directConv()],
      messages: {conversationId: list},
    );

ProfessorOpenSlots openSlots(List<DateTime> starts) => ProfessorOpenSlots(
      slots: [
        for (final s in starts)
          OpenSlot(startAt: s, endAt: s.add(const Duration(hours: 1))),
      ],
    );

String slotKey(DateTime t) => 'reschedule-slot-${t.toIso8601String()}';

List<RouteBase> get evaluateStub => [
      GoRoute(
        path: AppRoutes.professorEvaluate,
        name: AppRouteNames.professorEvaluate,
        builder: (_, state) =>
            Text('avaliar ${state.pathParameters['athleteId']}'),
      ),
    ];

void main() {
  setUpAll(loadProfessorLinksFonts);

  group('modelo', () {
    test('lê o cartão de remarcação da mensagem', () {
      final m = ChatMessage.fromMap('m1', {
        'senderUid': 'ath-1',
        'text': 'Pedido de remarcação: Qui 22/10 · 07:00',
        'createdAt': Timestamp.fromDate(DateTime.utc(2026, 10, 20, 14)),
        'card': {
          'type': 'reschedule',
          'lessonId': 'pl1',
          'status': 'replaced',
          'requestedBy': 'ath-1',
          'fromStartAt': Timestamp.fromDate(spInstant(22, 6)),
          'toStartAt': Timestamp.fromDate(spInstant(22, 7)),
          'toEndAt': Timestamp.fromDate(spInstant(22, 8)),
          'respondedBy': 'prof-1',
        },
      });
      final card = m.card;
      expect(card, isA<RescheduleCard>());
      card as RescheduleCard;
      expect(card.lessonId, 'pl1');
      expect(card.status, LessonRescheduleStatus.replaced);
      expect(card.fromStartAt, spInstant(22, 6));
      expect(card.toStartAt, spInstant(22, 7));
      expect(card.toEndAt, spInstant(22, 8));
      expect(card.respondedBy, 'prof-1');
      expect(card.isPending, isFalse);
    });

    test('sem cartão, tipo desconhecido ou incompleto: bolha de texto', () {
      expect(ChatMessage.fromMap('m', {'text': 'oi'}).card, isNull);
      expect(ChatMessageCard.parse({'type': 'charge'}), isNull);
      expect(
        ChatMessageCard.parse({
          'type': 'reschedule',
          'fromStartAt': spInstant(22, 6),
          'toStartAt': spInstant(22, 7),
        }),
        isNull,
      );
      expect(ChatMessageCard.parse('reschedule'), isNull);
    });

    test('só o lado que não pediu responde, e só pendente', () {
      final c = rescheduleCard();
      expect(c.canRespond('prof-1'), isTrue);
      expect(c.canRespond('ath-1'), isFalse);
      expect(rescheduleCard(status: 'accepted').canRespond('prof-1'), isFalse);
    });

    test('rótulo na parede de SP, sem "Hoje"', () {
      expect(rescheduleSlotLabel(spInstant(22, 7)), 'Qui 22 · 07:00');
      // 22:00 em SP já é dia 23 em UTC.
      expect(rescheduleSlotLabel(spInstant(22, 22)), 'Qui 22 · 22:00');
      expect(rescheduleSlotLabel(spInstant(20, 18)), 'Ter 20 · 18:00');
    });

    test('a particular lê o pedido de remarcação', () {
      final l = privateLesson(reschedule: {
        'requestedBy': 'ath-1',
        'startAt': Timestamp.fromDate(spInstant(22, 7)),
        'endAt': Timestamp.fromDate(spInstant(22, 8)),
        'status': 'pending',
        'messageId': 'm-card',
        'conversationId': conversationId,
      });
      expect(l.pendingReschedule?.startAt, spInstant(22, 7));
      expect(l.pendingReschedule?.requestedBy, 'ath-1');
      expect(l.reschedule?.conversationId, conversationId);
      expect(privateLesson().reschedule, isNull);
      final done = privateLesson(reschedule: {
        'requestedBy': 'ath-1',
        'startAt': spInstant(22, 7),
        'status': 'accepted',
      });
      expect(done.pendingReschedule, isNull);
      expect(done.canRescheduleAt(availabilityNow), isTrue);
      expect(
        privateLesson(status: 'canceled').canRescheduleAt(availabilityNow),
        isFalse,
      );
    });
  });

  group('cartão', () {
    testWidgets('pendente para quem não pediu: horários e as três ações',
        (tester) async {
      await pumpMessagesApp(
        tester,
        messages: messagesWith([cardMessage()]),
        location: convPath(conversationId),
      );
      expect(find.byKey(const Key('reschedule-card-m-card')), findsOneWidget);
      expect(find.text('PEDIDO DE REMARCAÇÃO'), findsOneWidget);
      expect(find.text('QUI 22 · 06:00'), findsOneWidget);
      expect(find.text('Qui 22 · 07:00'), findsOneWidget);
      expect(find.text('LIVRE'), findsOneWidget);
      expect(
        find.text('A particular muda de horário; nada mais é alterado.'),
        findsOneWidget,
      );
      expect(find.byKey(const Key('reschedule-accept-m-card')), findsOneWidget);
      expect(
          find.byKey(const Key('reschedule-suggest-m-card')), findsOneWidget);
      expect(
          find.byKey(const Key('reschedule-decline-m-card')), findsOneWidget);
      // O texto da mensagem não vira bolha.
      expect(
          find.text('Pedido de remarcação: Qui 22/10 · 07:00'), findsNothing);
    });

    testWidgets('quem pediu vê "Aguardando resposta", sem botões',
        (tester) async {
      await pumpMessagesApp(
        tester,
        messages: messagesWith([cardMessage(requestedBy: me)]),
        location: convPath(conversationId),
      );
      expect(find.text('Aguardando resposta'), findsOneWidget);
      expect(find.byKey(const Key('reschedule-accept-m-card')), findsNothing);
      expect(find.byKey(const Key('reschedule-suggest-m-card')), findsNothing);
    });

    for (final (status, label) in [
      ('accepted', 'Remarcada ✓'),
      ('declined', 'Recusada'),
      ('replaced', 'Substituído por outra proposta'),
    ]) {
      testWidgets('$status: "$label", sem botões', (tester) async {
        await pumpMessagesApp(
          tester,
          messages: messagesWith([cardMessage(status: status)]),
          location: convPath(conversationId),
        );
        expect(find.text(label), findsOneWidget);
        expect(find.text('LIVRE'), findsNothing);
        expect(find.byKey(const Key('reschedule-accept-m-card')), findsNothing);
        final opacity = tester.widget<Opacity>(find
            .descendant(
              of: find.byKey(const Key('reschedule-card-m-card')),
              matching: find.byType(Opacity),
            )
            .first);
        expect(opacity.opacity, status == 'replaced' ? lessThan(1) : 1);
      });
    }

    testWidgets('Aceitar e Recusar chamam a resposta', (tester) async {
      final availability = FakeProfessorAvailabilityRepository();
      await pumpMessagesApp(
        tester,
        messages: messagesWith([cardMessage()]),
        availability: availability,
        location: convPath(conversationId),
      );
      await tap(tester, find.byKey(const Key('reschedule-accept-m-card')));
      expect(availability.rescheduleResponses.single,
          (lessonId: 'pl1', accept: true));
      expect(find.text('Particular remarcada.'), findsOneWidget);

      await tap(tester, find.byKey(const Key('reschedule-decline-m-card')));
      expect(availability.rescheduleResponses.last,
          (lessonId: 'pl1', accept: false));
    });

    testWidgets('erro do servidor vai para o aviso', (tester) async {
      final availability = FakeProfessorAvailabilityRepository()
        ..rescheduleError =
            'O horário pedido não está mais livre. Sugira outro.';
      await pumpMessagesApp(
        tester,
        messages: messagesWith([cardMessage()]),
        availability: availability,
        location: convPath(conversationId),
      );
      await tap(tester, find.byKey(const Key('reschedule-accept-m-card')));
      expect(
        find.text('O horário pedido não está mais livre. Sugira outro.'),
        findsOneWidget,
      );
    });

    testWidgets('Sugerir outro: folha sem o horário atual e pede o escolhido',
        (tester) async {
      final availability = FakeProfessorAvailabilityRepository(
        slots:
            openSlots([spInstant(22, 6), spInstant(22, 9), spInstant(23, 8)]),
      );
      await pumpMessagesApp(
        tester,
        messages: messagesWith([cardMessage()]),
        availability: availability,
        location: convPath(conversationId),
      );
      await tap(tester, find.byKey(const Key('reschedule-suggest-m-card')));
      expect(find.byKey(const Key('reschedule-sheet')), findsOneWidget);
      expect(find.text('Atual: Qui 22 · 06:00'), findsOneWidget);
      expect(find.byKey(Key(slotKey(spInstant(22, 6)))), findsNothing);
      expect(find.byKey(Key(slotKey(spInstant(22, 9)))), findsOneWidget);

      await tap(tester, find.byKey(const Key('reschedule-day-2026-10-23')));
      await tap(tester, find.byKey(Key(slotKey(spInstant(23, 8)))));
      await tap(tester, find.byKey(const Key('reschedule-submit')));
      expect(availability.rescheduleRequests.single,
          (lessonId: 'pl1', startAt: spInstant(23, 8)));
      expect(find.byKey(const Key('reschedule-sheet')), findsNothing);
      expect(find.text('Pedido enviado ao aluno'), findsOneWidget);
    });
  });

  group('atalhos da conversa', () {
    testWidgets('professor: Remarcar, Cobrar e Enviar avaliação',
        (tester) async {
      final availability = FakeProfessorAvailabilityRepository(
        lessons: [privateLesson(startAt: spInstant(22, 6))],
        slots: openSlots([spInstant(22, 9)]),
      );
      final router = await pumpMessagesApp(
        tester,
        messages: messagesWith(const []),
        availability: availability,
        wallet: FakeProfessorWalletRepository(
          students: [walletStudent(athleteId: 'ath-1', name: 'João Silva')],
        ),
        extraRoutes: evaluateStub,
        location: convPath(conversationId),
      );
      expect(find.byKey(const Key('chat-action-reschedule')), findsOneWidget);
      expect(find.byKey(const Key('chat-action-charge')), findsOneWidget);
      expect(find.byKey(const Key('chat-action-evaluate')), findsOneWidget);

      // Uma particular só: vai direto aos horários.
      await tap(tester, find.byKey(const Key('chat-action-reschedule')));
      await tap(tester, find.byKey(Key(slotKey(spInstant(22, 9)))));
      await tap(tester, find.byKey(const Key('reschedule-submit')));
      expect(availability.rescheduleRequests.single,
          (lessonId: 'pl1', startAt: spInstant(22, 9)));

      await tap(tester, find.byKey(const Key('chat-action-charge')));
      expect(find.byType(ProfessorWalletChargePage), findsOneWidget);
      router.pop();
      await settleProfessorStudents(tester);

      await tap(tester, find.byKey(const Key('chat-action-evaluate')));
      expect(find.text('avaliar ath-1'), findsOneWidget);
    });

    testWidgets('com duas particulares, escolhe qual antes', (tester) async {
      final availability = FakeProfessorAvailabilityRepository(
        lessons: [
          privateLesson(id: 'pl1', startAt: spInstant(22, 6)),
          privateLesson(id: 'pl2', startAt: spInstant(24, 10)),
        ],
        slots: openSlots([spInstant(23, 9)]),
      );
      await pumpMessagesApp(
        tester,
        messages: messagesWith(const []),
        availability: availability,
        location: convPath(conversationId),
      );
      await tap(tester, find.byKey(const Key('chat-action-reschedule')));
      expect(find.byKey(const Key('reschedule-pick-lesson')), findsOneWidget);
      await tap(tester, find.byKey(const Key('reschedule-pick-pl2')));
      expect(find.text('Atual: Sáb 24 · 10:00'), findsOneWidget);
      await tap(tester, find.byKey(Key(slotKey(spInstant(23, 9)))));
      await tap(tester, find.byKey(const Key('reschedule-submit')));
      expect(availability.rescheduleRequests.single.lessonId, 'pl2');
    });

    testWidgets('esconde o que não se aplica', (tester) async {
      // Particular de outro aluno, cancelada ou passada; sem carteira.
      final availability = FakeProfessorAvailabilityRepository(lessons: [
        privateLesson(id: 'other', athleteId: 'ath-2'),
        privateLesson(id: 'canceled', status: 'canceled'),
        privateLesson(id: 'past', startAt: spInstant(20, 8)),
      ]);
      await pumpMessagesApp(
        tester,
        messages: messagesWith(const []),
        availability: availability,
        location: convPath(conversationId),
      );
      expect(find.byKey(const Key('chat-action-reschedule')), findsNothing);
      expect(find.byKey(const Key('chat-action-charge')), findsNothing);
      // João é aluno de turma: dá para avaliar.
      expect(find.byKey(const Key('chat-action-evaluate')), findsOneWidget);
    });

    testWidgets('quem não é aluno não tem atalho', (tester) async {
      await pumpMessagesApp(
        tester,
        messages: FakeMessagesRepository(conversations: [
          directConv(id: 'd_prof-1_ath-9', athleteUid: 'ath-9', name: 'Zé'),
        ]),
        location: convPath('d_prof-1_ath-9'),
      );
      expect(find.byKey(const Key('chat-actions')), findsNothing);
    });

    testWidgets('grupo da turma não tem atalho', (tester) async {
      await pumpMessagesApp(
        tester,
        messages: FakeMessagesRepository(conversations: [classConv()]),
        location: convPath('c_c1'),
      );
      expect(find.byKey(const Key('chat-actions')), findsNothing);
    });

    testWidgets('aluno: Remarcar só com particular com este professor',
        (tester) async {
      final availability = FakeProfessorAvailabilityRepository(
        lessons: [privateLesson(startAt: spInstant(22, 6))],
        slots: openSlots([spInstant(22, 9)]),
      );
      await pumpMessagesApp(
        tester,
        messages: messagesWith(const []),
        availability: availability,
        uid: 'ath-1',
        location: athleteConvPath(conversationId),
      );
      expect(find.byKey(const Key('chat-action-reschedule')), findsOneWidget);
      expect(find.byKey(const Key('chat-action-charge')), findsNothing);
      expect(find.byKey(const Key('chat-action-evaluate')), findsNothing);
      await tap(tester, find.byKey(const Key('chat-action-reschedule')));
      await tap(tester, find.byKey(Key(slotKey(spInstant(22, 9)))));
      await tap(tester, find.byKey(const Key('reschedule-submit')));
      expect(availability.rescheduleRequests.single.lessonId, 'pl1');
      expect(find.text('Pedido enviado ao professor'), findsOneWidget);
    });

    testWidgets('aluno sem particular com o professor: sem atalho',
        (tester) async {
      await pumpMessagesApp(
        tester,
        messages: messagesWith(const []),
        availability: FakeProfessorAvailabilityRepository(lessons: [
          privateLesson(professorUid: 'prof-2'),
        ]),
        uid: 'ath-1',
        location: athleteConvPath(conversationId),
      );
      expect(find.byKey(const Key('chat-actions')), findsNothing);
    });
  });
}
