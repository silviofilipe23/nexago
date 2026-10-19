import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/features/arena/data/arena_class_enrollment_repository.dart';
import 'package:nexago_app/features/arena/domain/arena_staff_role.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class_enrollment.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class_session.dart';
import 'package:nexago_app/features/arena/presentation/aulas/arena_class_enroll_page.dart';

import 'arena_class_fixtures.dart';
import 'aulas_pump.dart';
import 'fake_arena_class_enrollment_repository.dart';
import 'fake_arena_class_repository.dart';

Future<void> _settle(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 400));
}

/// Vôlei Avançado de segunda 19/10 com um aluno de Ter/Qui, um pausado e
/// uma reposição encaixada.
FakeArenaClassRepository _chamadaRepo() => FakeArenaClassRepository(
      classes: [arenaClass(id: 'c5', capacity: 4)],
      sessionsById: {
        's5': session(
          id: 's5',
          classId: 'c5',
          capacity: 4,
          extras: {'z': extra('z', 'Igor Martins')},
        ),
      },
      students: [
        student('u1', 'Felipe Rocha',
            classId: 'c5',
            weekdays: const [1, 3, 5],
            enrollmentId: 'e1',
            planName: 'Mensal 3x/semana'),
        student('u2', 'Bruno Alves', classId: 'c5', weekdays: const [2, 4]),
        student('u3', 'Davi Lopes', classId: 'c5', status: 'paused'),
      ],
    );

void main() {
  group('A2/A3 · chamada com encaixe', () {
    testWidgets('roster do dia: sem o aluno de Ter/Qui e sem o pausado',
        (tester) async {
      await pumpAulas(
        tester,
        repo: _chamadaRepo(),
        initial: '/arena/classes/session/s5',
      );

      expect(find.text('Felipe Rocha'), findsOneWidget);
      expect(find.text('Mensal 3x/semana'), findsOneWidget);
      expect(find.text('Bruno Alves'), findsNothing);
      expect(find.text('Davi Lopes'), findsNothing);
      // O encaixe entra no fim, com a etiqueta.
      expect(find.text('Igor Martins'), findsOneWidget);
      expect(find.text('REPOSIÇÃO'), findsOneWidget);
      expect(find.text('0/2', findRichText: true),
          findsOneWidget); // Felipe + Igor
    });

    testWidgets('encaixar reposição usa o crédito escolhido', (tester) async {
      final repo = _chamadaRepo();
      await pumpAulas(
        tester,
        repo: repo,
        initial: '/arena/classes/session/s5',
        enrollmentRepo: FakeArenaClassEnrollmentRepository(
          credits: [
            credit(id: 'cr-ana', studentId: 'u9', name: 'Ana Lima'),
            // Já está na aula hoje: não aparece.
            credit(id: 'cr-fe', studentId: 'u1', name: 'Felipe Rocha'),
          ],
        ),
      );

      await tester.tap(find.text('Encaixar aluno'));
      await _settle(tester);

      expect(find.text('Encaixar na aula'), findsOneWidget);
      expect(find.textContaining('2 vagas livres'), findsOneWidget);
      expect(find.text('Felipe Rocha'), findsOneWidget); // só na chamada
      final button = find.widgetWithText(FilledButton, 'Escolha o aluno');
      expect(tester.widget<FilledButton>(button).onPressed, isNull);

      await tester.tap(find.text('Ana Lima'));
      await tester.pump();
      await tester.tap(find.text('Encaixar Ana Lima'));
      await _settle(tester);

      expect(repo.addedExtras.single, {
        'sessionId': 's5',
        'kind': 'makeup',
        'creditId': 'cr-ana',
        'athleteId': null,
        'name': null,
        'phone': null,
      });
      expect(
          find.text('Ana Lima entrou na aula como reposição.'), findsOneWidget);
    });

    testWidgets('experimental sem conta vai pelo nome', (tester) async {
      final repo = _chamadaRepo();
      await pumpAulas(
        tester,
        repo: repo,
        initial: '/arena/classes/session/s5',
      );

      await tester.tap(find.text('Encaixar aluno'));
      await _settle(tester);
      await tester.tap(find.text('Experimental'));
      await tester.pump();
      await tester.tap(find.text('Não tem conta? Encaixar só pelo nome'));
      await tester.pump();
      await tester.enterText(
        find.widgetWithText(TextField, 'Nome de quem vai fazer a aula'),
        'João Silva',
      );
      await tester.pump();
      await tester.tap(find.text('Encaixar João Silva'));
      await _settle(tester);

      expect(repo.addedExtras.single['kind'], 'trial');
      expect(repo.addedExtras.single['name'], 'João Silva');
      expect(repo.addedExtras.single['creditId'], isNull);
    });

    testWidgets('tirar o encaixe devolve o crédito', (tester) async {
      final repo = _chamadaRepo();
      await pumpAulas(
        tester,
        repo: repo,
        initial: '/arena/classes/session/s5',
      );

      await tester.tap(find.byTooltip('Tirar Igor Martins da aula'));
      await _settle(tester);
      expect(
          find.textContaining('O crédito de reposição volta'), findsOneWidget);
      await tester.tap(find.text('Tirar da aula'));
      await _settle(tester);

      expect(repo.removedExtras.single, ('s5', 'z'));
    });

    testWidgets('sem escrita na agenda: nem encaixar nem tirar',
        (tester) async {
      await pumpAulas(
        tester,
        repo: _chamadaRepo(),
        role: ArenaStaffRole.manutencao,
        initial: '/arena/classes/session/s5',
      );

      expect(find.text('Encaixar aluno'), findsNothing);
      expect(find.byTooltip('Tirar Igor Martins da aula'), findsNothing);
    });
  });

  group('A7 · Mensalidades', () {
    FakeArenaClassEnrollmentRepository chargesRepo() =>
        FakeArenaClassEnrollmentRepository(
          charges: [
            charge(
              id: 'late',
              studentId: 'u4',
              name: 'Diego Nunes',
              description: 'Pacote 4 particulares',
              amount: 440,
              dueDate: '2026-10-12',
            ),
            charge(
              id: 'today',
              studentId: 'u5',
              name: 'Elisa Prado',
              description: 'Mensal 1x/semana · out/2026',
              amount: 180,
              dueDate: '2026-10-19',
            ),
            charge(
              id: 'paid',
              status: 'paid',
              paidOn: '2026-10-02',
              amount: 320,
            ),
          ],
        );

    testWidgets('totais, abas e registrar pagamento', (tester) async {
      final enrollmentRepo = chargesRepo();
      await pumpAulas(
        tester,
        repo: FakeArenaClassRepository(),
        enrollmentRepo: enrollmentRepo,
        initial: '/arena/classes/charges',
      );

      expect(find.text('RECEBIDO EM OUTUBRO'), findsOneWidget);
      expect(find.text(formatBRL(320)), findsOneWidget);
      expect(find.text('Em atraso · 1'), findsOneWidget);
      expect(find.text('Vencendo · 1'), findsOneWidget);
      expect(find.text('Pagos · 1'), findsOneWidget);
      expect(find.text('Diego Nunes'), findsOneWidget);
      expect(find.text('7 dias em atraso'), findsOneWidget);
      // Toda leitura filtra a arena.
      expect(enrollmentRepo.arenaIdsRead.toSet(), {'a1'});

      await tester.tap(find.text('Vencendo · 1'));
      await tester.pump();
      expect(find.text('Elisa Prado'), findsOneWidget);
      expect(find.text('vence hoje'), findsOneWidget);

      await tester.tap(find.text('Registrar pagamento'));
      await _settle(tester);
      await tester.tap(find.text('Dinheiro'));
      await tester.pump();
      await tester.tap(find.text('Confirmar recebimento'));
      await _settle(tester);

      expect(
          enrollmentRepo.paid.single, ('today', ArenaClassPaymentMethod.cash));
      expect(find.text('Pagamento de Elisa Prado registrado.'), findsOneWidget);
    });

    testWidgets('financeiro lê e cobra, mas não registra', (tester) async {
      await pumpAulas(
        tester,
        repo: FakeArenaClassRepository(),
        enrollmentRepo: chargesRepo(),
        role: ArenaStaffRole.financeiro,
        initial: '/arena/classes/charges',
      );

      expect(find.text('Diego Nunes'), findsOneWidget);
      expect(find.text('Cobrar'), findsOneWidget);
      expect(find.text('Registrar pagamento'), findsNothing);
    });
  });

  group('A6 · Aluno', () {
    testWidgets('plano, créditos, frequência e pausar', (tester) async {
      final enrollmentRepo = FakeArenaClassEnrollmentRepository(
        enrollments: [enrollment()],
        charges: [charge(dueDate: '2026-11-05')],
        credits: [
          credit(id: 'cr1', studentId: 'u1', name: 'Carla Dias'),
        ],
        sessionsByClass: {
          'c1': [
            session(id: 'a', date: '2026-10-12', attendance: const {
              'u1': AttendanceMark.present,
            }),
            session(id: 'b', date: '2026-10-14', attendance: const {
              'u1': AttendanceMark.excused,
            }),
          ],
        },
      );
      await pumpAulas(
        tester,
        repo: FakeArenaClassRepository(
          classes: [
            arenaClass(id: 'c1', name: 'Iniciante A', weekdays: const [1, 3]),
          ],
          students: [
            student('u1', 'Carla Dias',
                weekdays: const [1, 3], enrollmentId: 'e1'),
          ],
        ),
        enrollmentRepo: enrollmentRepo,
        initial: '/arena/classes/student/u1',
      );

      expect(find.text('Carla Dias'), findsOneWidget);
      expect(find.text('EM DIA'), findsOneWidget);
      expect(find.text('Mensal 2x/semana'), findsOneWidget);
      expect(find.text('Seg e Qua · 07:00'), findsOneWidget);
      expect(find.text('1 · expira 13 nov'), findsOneWidget);
      // Matrícula → turmas → aulas: três ondas de stream até a frequência.
      await _settle(tester);
      expect(find.text('50%'), findsOneWidget);
      expect(find.text('Qua 14 out'), findsOneWidget);
      expect(find.text('Avisou falta · Vôlei Avançado'), findsOneWidget);

      await tester.scrollUntilVisible(find.text('Pausar plano'), 200);
      await tester.tap(find.text('Pausar plano'));
      await _settle(tester);
      await tester.tap(find.widgetWithText(FilledButton, 'Pausar plano'));
      await _settle(tester);

      expect(enrollmentRepo.statusChanges.single, ('e1', 'paused'));
    });
  });

  group('A8–A12 · Nova matrícula', () {
    testWidgets('aluno → plano → 2 horários com vaga → prévia → matricular',
        (tester) async {
      final enrollmentRepo = FakeArenaClassEnrollmentRepository(
        plans: [
          plan(id: 'm2', name: 'Mensal 2x/semana', perWeek: 2),
          plan(id: 'av', name: 'Avulsa', kind: ArenaClassPlanKind.single),
        ],
        preview: const ArenaClassEnrollmentPreview(
          charges: [
            (
              description: 'Mensal 2x/semana · out/2026 (4 de 8 aulas)',
              amountReais: 160,
              dueDate: '2026-10-19',
            ),
          ],
          totalReais: 160,
          enrollmentFeeReais: 0,
        ),
      );
      await pumpAulas(
        tester,
        repo: FakeArenaClassRepository(
          classes: [
            arenaClass(
              id: 'c2',
              name: 'Intermediário B',
              weekdays: const [2, 4],
              start: '19:00',
              capacity: 1,
            ),
          ],
          // Terça lotada (1 vaga, 1 aluno); quinta livre.
          students: [
            student('x', 'Xavier', classId: 'c2', weekdays: const [2]),
          ],
        ),
        enrollmentRepo: enrollmentRepo,
        initial: '/arena/classes/enroll',
        extra: const ArenaClassEnrollSeed(
          studentId: 'st1',
          name: 'Marina Teles',
          phone: '62988887777',
        ),
      );

      expect(find.text('Quem é o aluno?'), findsOneWidget);
      expect(find.text('Marina Teles'), findsOneWidget);
      await tester.tap(find.text('Continuar'));
      await _settle(tester);

      expect(find.text('Qual plano?'), findsOneWidget);
      expect(find.text('Avulsa'), findsNothing); // avulsa não vira matrícula
      await tester.tap(find.text('Mensal 2x/semana'));
      await tester.pump();
      await tester.tap(find.text('Continuar'));
      await _settle(tester);

      expect(find.text('Escolha 2 horários'), findsOneWidget);
      expect(find.text('Lotada'), findsOneWidget);
      // Tocar na terça lotada não escolhe nada.
      await tester.tap(find.textContaining('Ter · 19:00'));
      await tester.tap(find.textContaining('Qui · 19:00'));
      await tester.pump();
      final next = find.widgetWithText(FilledButton, 'Continuar');
      // Mensal 2x exige 2 horários: com 1 não segue.
      expect(tester.widget<FilledButton>(next).onPressed, isNull);
    });

    testWidgets('pacote com 1 horário chega na prévia e matricula',
        (tester) async {
      final enrollmentRepo = FakeArenaClassEnrollmentRepository(
        plans: [
          plan(
            id: 'p8',
            name: 'Pacote 8 aulas',
            kind: ArenaClassPlanKind.package,
            price: 360,
            credits: 8,
            validityDays: 60,
          ),
        ],
        preview: const ArenaClassEnrollmentPreview(
          charges: [
            (
              description: 'Pacote 8 aulas · 8 aulas',
              amountReais: 360,
              dueDate: '2026-10-19',
            ),
          ],
          totalReais: 360,
          enrollmentFeeReais: 0,
        ),
      );
      await pumpAulas(
        tester,
        repo: FakeArenaClassRepository(
          classes: [
            arenaClass(
              id: 'c2',
              name: 'Intermediário B',
              weekdays: const [2, 4],
              start: '19:00',
              capacity: 6,
            ),
          ],
        ),
        enrollmentRepo: enrollmentRepo,
        initial: '/arena/classes/enroll',
        extra: const ArenaClassEnrollSeed(
          studentId: 'st1',
          name: 'Marina Teles',
          phone: '62988887777',
        ),
      );

      await tester.tap(find.text('Continuar'));
      await _settle(tester);
      await tester.tap(find.text('Pacote 8 aulas'));
      await tester.pump();
      await tester.tap(find.text('Continuar'));
      await _settle(tester);
      await tester.tap(find.textContaining('Qui · 19:00'));
      await tester.pump();
      await tester.tap(find.text('Continuar'));
      await _settle(tester);

      expect(find.text('Pagamento'), findsOneWidget);
      expect(find.text('Cobrar hoje'), findsOneWidget);
      // Pacote não tem dia de vencimento recorrente.
      expect(
          find.text('Vencimento da mensalidade'.toUpperCase()), findsNothing);
      expect(enrollmentRepo.previews.single.planId, 'p8');

      await tester.tap(find.text('Transferência'));
      await tester.pump();
      await tester.tap(find.text('Matricular'));
      await _settle(tester);

      final req = enrollmentRepo.created.single;
      expect(req.toPayload(), {
        'arenaId': 'a1',
        'planId': 'p8',
        'slots': [
          {'classId': 'c2', 'weekday': 4},
        ],
        'dueDay': 5,
        'paymentMethod': 'transfer',
        'waiveFee': false,
        'studentId': 'st1',
        'name': 'Marina Teles',
        'phone': '62988887777',
      });
      expect(find.text('Matrícula feita'), findsOneWidget);
      expect(find.text('Cobrar no WhatsApp'), findsOneWidget);
      expect(find.text('Em aberto · ${formatBRL(360)}'), findsOneWidget);
      expect(find.text('Ter 20 out'), findsNothing);
      expect(find.text('Qui 22 out · 19:00'), findsOneWidget);
    });
  });

  group('Aulas · aba Alunos', () {
    testWidgets('lista as matrículas atuais com a situação', (tester) async {
      await pumpAulas(
        tester,
        repo: FakeArenaClassRepository(
          classes: [
            arenaClass(id: 'c1', name: 'Iniciante A', weekdays: const [1, 3]),
          ],
        ),
        enrollmentRepo: FakeArenaClassEnrollmentRepository(
          enrollments: [
            enrollment(),
            enrollment(
              id: 'e2',
              studentId: 'u2',
              name: 'Bruno Alves',
              status: 'paused',
            ),
            enrollment(
              id: 'e3',
              studentId: 'u3',
              name: 'Ex-aluno',
              status: 'canceled',
            ),
          ],
          charges: [charge(dueDate: '2026-10-05')],
        ),
      );

      await tester.tap(find.text('Alunos'));
      await _settle(tester);

      expect(find.text('Carla Dias'), findsOneWidget);
      expect(find.text('ATRASADO'), findsOneWidget);
      expect(find.text('Bruno Alves'), findsOneWidget);
      expect(find.text('PAUSADO'), findsOneWidget);
      expect(find.text('Ex-aluno'), findsNothing);
      expect(find.bySemanticsLabel('Nova matrícula'), findsOneWidget);
      expect(find.bySemanticsLabel('Mensalidades'), findsOneWidget);
    });
  });
}
