import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/professor_links/domain/arena_professor_link.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_own_classes.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_wallet.dart';

import '../professor_links/professor_links_test_support.dart'
    show loadProfessorLinksFonts, professorLink;
import 'professor_own_classes_test_support.dart';
import 'professor_students_test_support.dart';
import 'professor_wallet_test_support.dart';

String detailPath(String id) =>
    AppRoutes.professorOwnClass.replaceAll(':classId', id);

Finder field(String key) => find.descendant(
      of: find.byKey(Key(key)),
      matching: find.byType(TextField),
    );

Future<void> tap(WidgetTester tester, Finder f) async {
  await tester.ensureVisible(f);
  await tester.tap(f);
  await settleProfessorStudents(tester);
}

Future<void> tapKey(WidgetTester tester, String key) =>
    tap(tester, find.byKey(Key(key)));

Future<void> type(WidgetTester tester, String key, String text) async {
  await tester.ensureVisible(field(key));
  await tester.enterText(field(key), text);
  await settleProfessorStudents(tester, 2);
}

bool submitEnabled(WidgetTester tester) =>
    tester
        .widget<FilledButton>(find.descendant(
          of: find.byKey(const Key('professor-own-class-submit')),
          matching: find.byType(FilledButton),
        ))
        .onPressed !=
    null;

/// Preenche o B10 como no protótipo: Ter e Qui, 07:00–08:00, 4 vagas,
/// Quadra 1, R$ 260 — e espera a prévia (debounce).
Future<void> fillForm(WidgetTester tester) async {
  await type(tester, 'professor-own-class-name', 'Manhã Intermediário');
  await tapKey(tester, 'professor-own-class-day-2');
  await tapKey(tester, 'professor-own-class-day-4');
  await tapKey(tester, 'professor-own-class-start-07:00');
  await tapKey(tester, 'professor-own-class-court-q1');
  await type(tester, 'professor-own-class-price', '260');
  await settleProfessorStudents(tester);
}

void main() {
  setUpAll(loadProfessorLinksFonts);

  group('domínio', () {
    test('lê a turma do Firestore com defesa', () {
      final c = ProfessorOwnClass.fromMap('oc-1', {
        'name': ' Manhã ',
        'arenaId': 'arena-norte',
        'arenaName': 'Arena Norte',
        'courtId': 'q1',
        'courtName': 'Quadra 1',
        'weekdays': [4, 2, 2, 9, 'x'],
        'startTime': '07:00',
        'endTime': '08:00',
        'capacity': 4,
        'monthlyPriceReais': 260,
        'pricePerOccurrenceReais': 60.5,
        'startDate': '2026-10-20',
        'studentIds': ['a', '', 3, 'b'],
        'status': 'ended',
        'endedReason': 'link_or_permission',
        'createdAt': Timestamp.fromDate(DateTime(2026, 10, 20)),
      });
      expect(c.name, 'Manhã');
      expect(c.weekdays, [2, 4]);
      expect(c.studentIds, ['a', 'b']);
      expect(c.studentCount, 2);
      expect(c.isActive, isFalse);
      expect(c.endedReason, 'link_or_permission');
      expect(c.pricePerOccurrenceReais, 60.5);
      expect(c.createdAt, DateTime(2026, 10, 20));

      final empty = ProfessorOwnClass.fromMap('x', const {});
      expect(empty.name, 'Turma');
      expect(empty.isActive, isTrue);
      expect(empty.weekdays, isEmpty);
      expect(empty.capacity, 0);
    });

    test('payload: dias em ordem, nome sem espaço, início opcional', () {
      const input = ProfessorOwnClassInput(
        arenaId: 'arena-norte',
        courtId: 'q1',
        name: ' Manhã ',
        weekdays: [4, 2],
        startTime: '07:00',
        endTime: '08:00',
        capacity: 4,
        monthlyPriceReais: 260,
      );
      expect(input.toPayload(), {
        'arenaId': 'arena-norte',
        'courtId': 'q1',
        'name': 'Manhã',
        'weekdays': [2, 4],
        'startTime': '07:00',
        'endTime': '08:00',
        'capacity': 4,
        'monthlyPriceReais': 260.0,
      });
      const withStart = ProfessorOwnClassInput(
        arenaId: 'a',
        courtId: 'q',
        name: 'n',
        weekdays: [1],
        startTime: '07:00',
        endTime: '08:00',
        capacity: 1,
        monthlyPriceReais: 1,
        startDate: '2026-11-01',
      );
      expect(withStart.toPayload()['startDate'], '2026-11-01');
      expect(
        input ==
            const ProfessorOwnClassInput(
              arenaId: 'arena-norte',
              courtId: 'q1',
              name: 'Manhã',
              weekdays: [2, 4],
              startTime: '07:00',
              endTime: '08:00',
              capacity: 4,
              monthlyPriceReais: 260,
            ),
        isFalse,
        reason: 'ordem dos dias importa na comparação (a tela ordena)',
      );
    });

    test('prévia e resultado da criação', () {
      final p = ProfessorOwnClassPreview.fromMap({
        'arenaName': 'Arena Norte',
        'courtName': 'Quadra 1',
        'hourlyReais': 60,
        'pricePerOccurrenceReais': 60,
        'occurrencesPerMonth': 8.7,
        'courtMonthlyReais': 522,
        'revenueFullReais': 1040,
        'netEstimateReais': 518,
        'conflicts': ['2026-10-29', '2026-10-22T00:00', 'x', 3],
      });
      expect(p.conflicts, ['2026-10-22', '2026-10-29']);
      expect(p.netEstimateReais, 518);
      final r = ProfessorOwnClassCreated.fromMap({
        'classId': 'oc-9',
        'createdDates': ['2026-10-27', '2026-10-22'],
        'skippedDates': ['2026-10-29'],
      });
      expect(r.classId, 'oc-9');
      expect(r.createdDates, ['2026-10-22', '2026-10-27']);
      expect(professorOwnClassCreatedMessage(r),
          'Turma criada · 2 aulas reservadas · 1 data sem quadra');
      expect(
        professorOwnClassCreatedMessage(
          const ProfessorOwnClassCreated(classId: 'x', createdDates: ['d']),
        ),
        'Turma criada · 1 aula reservada',
      );
    });

    test('arenas liberadas: independente ativo com a chave', () {
      final ok = independentLink();
      final noKey = independentLink(arenaId: 'a2', canBookRecurring: false);
      final suspended = independentLink(
        arenaId: 'a3',
        status: ArenaProfessorLinkStatus.suspended,
      );
      // Equipe com a chave gravada (dado antigo): nunca vale.
      final staff = professorLink(
        arenaId: 'a4',
        permissions: const ArenaProfessorPermissions(
          canManageOwnLessons: true,
          canBookCourts: true,
          canAppearInArenaProfile: true,
          canBookRecurring: true,
        ),
      );
      final links = [ok, noKey, suspended, staff];
      expect(professorOwnClassArenas(links), [ok]);
      expect(professorOwnClassLockedArenas(links), [noKey]);
      expect(
        professorOwnClassLockedHint([noKey]),
        'Peça à Arena Norte para liberar horário fixo e criar uma turma '
        'própria.',
      );
    });

    test('horários de meia em meia hora, até 4 h', () {
      expect(kProfessorOwnClassStartTimes.first, '05:00');
      expect(kProfessorOwnClassStartTimes, contains('07:30'));
      expect(kProfessorOwnClassStartTimes.last, '22:00');
      expect(professorOwnClassEndTimes('07:00'),
          ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00']);
      expect(professorOwnClassEndTimes('22:00'), ['23:00', '23:30', '24:00']);
      expect(professorOwnClassEndTimes('x'), isEmpty);
    });

    test('o que falta para a prévia', () {
      String? blocker({
        String? arenaId = 'a',
        String name = 'Turma',
        List<int> weekdays = const [2],
        String? start = '07:00',
        String? end = '08:00',
        int capacity = 4,
        String? courtId = 'q1',
        double? price = 260,
      }) =>
          professorOwnClassBlocker(
            arenaId: arenaId,
            name: name,
            weekdays: weekdays,
            startTime: start,
            endTime: end,
            capacity: capacity,
            courtId: courtId,
            monthlyPriceReais: price,
            minPrice: 1,
            maxPrice: 10000,
          );
      expect(blocker(), isNull);
      expect(blocker(arenaId: null), 'Escolha a arena.');
      expect(blocker(name: '  '), 'Dê um nome à turma.');
      expect(blocker(weekdays: const []), 'Escolha os dias da turma.');
      expect(blocker(end: null), 'Escolha o horário.');
      expect(blocker(end: '12:30'), contains('até 4 h'));
      expect(blocker(capacity: 31), 'Vagas de 1 a 30.');
      expect(blocker(courtId: null), 'Escolha a quadra.');
      expect(blocker(price: null), 'Informe a mensalidade por aluno.');
      expect(blocker(price: 0.5), contains('Mensalidade de'));
    });

    test('rótulos', () {
      expect(professorOwnClassOccurrencesLabel(8.7), '8,7 aulas/mês');
      expect(professorOwnClassOccurrencesLabel(8), '8 aulas/mês');
      expect(professorOwnClassDayMonth('2026-10-22'), '22/10');
      expect(professorOwnClassConflictsLabel(['2026-10-29', '2026-10-22']),
          '22/10, 29/10');
      expect(professorOwnClassScheduleLabel(ownClass()),
          'Ter e Qui · 07:00–08:00');
      final split = professorSplitOwnClasses([
        ownClass(id: 'a'),
        ownClass(id: 'b', status: ProfessorOwnClassStatus.ended),
      ]);
      expect(split.active.map((c) => c.id), ['a']);
      expect(split.ended.map((c) => c.id), ['b']);
    });
  });

  group('Nova turma própria (B10)', () {
    testWidgets('preenche, mostra a prévia e cria a turma', (tester) async {
      final repo = FakeProfessorOwnClassesRepository();
      await pumpOwnClassesApp(
        tester,
        repo: repo,
        location: AppRoutes.professorOwnClassNew,
        initialStack: [AppRoutes.professorClasses],
      );

      expect(find.text('Nova turma própria'), findsOneWidget);
      expect(find.text('ARENA NORTE · INDEPENDENTE'), findsOneWidget);
      expect(find.byKey(const Key('professor-own-class-ctx')), findsOneWidget);
      expect(find.text('SEU PREÇO'), findsOneWidget);
      // Quadra em manutenção fica de fora.
      expect(
          find.byKey(const Key('professor-own-class-court-q3')), findsNothing);
      expect(find.textContaining('regras da Arena Norte'), findsOneWidget);
      expect(submitEnabled(tester), isFalse);

      await fillForm(tester);

      expect(repo.callsOf('preview'), hasLength(1),
          reason: 'debounce: um pedido só no fim');
      expect(repo.callsOf('preview').single.data, {
        'arenaId': ownArenaId,
        'courtId': 'q1',
        'name': 'Manhã Intermediário',
        'weekdays': [2, 4],
        'startTime': '07:00',
        'endTime': '08:00',
        'capacity': 4,
        'monthlyPriceReais': 260.0,
      });
      expect(find.text('Reserva recorrente'), findsOneWidget);
      expect(find.text('− ${formatBRL(522)}'), findsOneWidget);
      expect(find.text('8,7 aulas/mês · Quadra 1 · R\$ 60/h'), findsOneWidget);
      expect(find.text(formatBRL(1040)), findsOneWidget);
      expect(find.text('4 × R\$ 260'), findsOneWidget);
      expect(find.text(formatBRL(518)), findsOneWidget);
      expect(
          find.byKey(const Key('professor-own-class-conflicts')), findsNothing);

      // Mais uma vaga: nova prévia com 5 alunos.
      await tapKey(tester, 'professor-own-class-capacity-plus');
      await settleProfessorStudents(tester);
      expect(repo.callsOf('preview'), hasLength(2));
      expect(
        (repo.callsOf('preview').last.data! as Map)['capacity'],
        5,
      );
      expect(submitEnabled(tester), isTrue);

      await tapKey(tester, 'professor-own-class-submit');
      expect(repo.callsOf('create'), hasLength(1));
      expect((repo.callsOf('create').single.data! as Map)['capacity'], 5);
      expect(find.text('Turma criada · 3 aulas reservadas'), findsOneWidget);
      // Vai para o detalhe da turma nova.
      expect(find.text('ARENA NORTE · TURMA PRÓPRIA'), findsOneWidget);
      expect(find.byKey(const Key('professor-own-class-edit-students')),
          findsOneWidget);
    });

    testWidgets('datas ocupadas: aviso e confirmação antes de criar', (
      tester,
    ) async {
      final repo = FakeProfessorOwnClassesRepository(
        preview: ownPreview(conflicts: const ['2026-10-29', '2026-10-22']),
        skippedDates: const ['2026-10-22', '2026-10-29'],
      );
      await pumpOwnClassesApp(
        tester,
        repo: repo,
        location: AppRoutes.professorOwnClassNew,
      );
      await fillForm(tester);

      final note = find.byKey(const Key('professor-own-class-conflicts'));
      expect(note, findsOneWidget);
      expect(
        find.descendant(
          of: note,
          matching: find.textContaining('22/10, 29/10'),
        ),
        findsOneWidget,
      );

      // Voltar no diálogo não cria.
      await tapKey(tester, 'professor-own-class-submit');
      expect(find.text('Algumas datas ficam de fora'), findsOneWidget);
      await tap(tester, find.text('Voltar'));
      expect(repo.callsOf('create'), isEmpty);

      await tapKey(tester, 'professor-own-class-submit');
      await tapKey(tester, 'professor-wallet-confirm');
      expect(repo.callsOf('create'), hasLength(1));
      expect(
        find.text('Turma criada · 3 aulas reservadas · 2 datas sem quadra'),
        findsOneWidget,
      );
    });

    testWidgets('erro da prévia aparece e segura o botão', (tester) async {
      final repo = FakeProfessorOwnClassesRepository()
        ..error = 'A arena ainda não configurou o preço desta quadra.';
      await pumpOwnClassesApp(
        tester,
        repo: repo,
        location: AppRoutes.professorOwnClassNew,
      );
      await fillForm(tester);
      expect(
        find.text('A arena ainda não configurou o preço desta quadra.'),
        findsOneWidget,
      );
      expect(submitEnabled(tester), isFalse);
    });

    testWidgets('duas arenas liberadas: troca pelo contexto', (tester) async {
      final repo = FakeProfessorOwnClassesRepository();
      await pumpOwnClassesApp(
        tester,
        repo: repo,
        location: AppRoutes.professorOwnClassNew,
        links: [
          independentLink(),
          independentLink(arenaId: 'arena-sul', arenaName: 'Arena Sul'),
        ],
      );
      // Sem arena escolhida: botão de escolher.
      expect(find.text('INDEPENDENTE'), findsOneWidget);
      await tapKey(tester, 'professor-own-class-pick-arena');
      await tapKey(tester, 'professor-own-class-arena-arena-sul');
      expect(find.text('ARENA SUL · INDEPENDENTE'), findsOneWidget);
      await fillForm(tester);
      expect(
        (repo.callsOf('preview').single.data! as Map)['arenaId'],
        'arena-sul',
      );
    });

    testWidgets('sem a chave: só a dica de pedir à arena', (tester) async {
      await pumpOwnClassesApp(
        tester,
        location: AppRoutes.professorOwnClassNew,
        links: [independentLink(canBookRecurring: false)],
      );
      expect(
          find.byKey(const Key('professor-own-class-locked')), findsOneWidget);
      expect(find.textContaining('Peça à Arena Norte'), findsOneWidget);
      expect(find.byKey(const Key('professor-own-class-submit')), findsNothing);
    });
  });

  group('Turmas próprias no Minhas turmas (A4)', () {
    testWidgets('sem a chave: dica no lugar de "+ Turma própria"', (
      tester,
    ) async {
      await pumpOwnClassesApp(
        tester,
        location: AppRoutes.professorClasses,
        links: [independentLink(canBookRecurring: false)],
      );
      expect(find.byKey(const Key('professor-own-class-new')), findsNothing);
      expect(
          find.byKey(const Key('professor-own-class-locked')), findsOneWidget);
      expect(
          find.textContaining('Peça à Arena Norte para liberar horário '
              'fixo'),
          findsOneWidget);
    });

    testWidgets('só equipe: a seção some', (tester) async {
      await pumpOwnClassesApp(
        tester,
        location: AppRoutes.professorClasses,
        links: [professorLink()],
      );
      expect(find.byKey(const Key('professor-own-classes')), findsNothing);
      expect(find.byKey(const Key('professor-classes-empty')), findsOneWidget);
    });

    testWidgets('lista ativas e encerradas recolhidas; abre o B10', (
      tester,
    ) async {
      final repo = FakeProfessorOwnClassesRepository(classes: [
        ownClass(studentIds: const ['ath-paulo']),
        ownClass(
          id: 'oc-old',
          name: 'Noite Antiga',
          status: ProfessorOwnClassStatus.ended,
        ),
      ]);
      await pumpOwnClassesApp(
        tester,
        repo: repo,
        location: AppRoutes.professorClasses,
      );

      final card = find.byKey(const Key('professor-own-class-oc-1'));
      expect(card, findsOneWidget);
      Finder inCard(String text) =>
          find.descendant(of: card, matching: find.text(text));
      expect(inCard('Manhã Intermediário'), findsOneWidget);
      expect(inCard('PRÓPRIA'), findsOneWidget);
      expect(inCard('Ter e Qui · 07:00–08:00'), findsOneWidget);
      expect(inCard('Quadra 1 · Arena Norte'), findsOneWidget);
      expect(inCard('1/4'), findsOneWidget);
      // A contagem do cabeçalho soma a turma própria ATIVA (a encerrada não).
      expect(find.text('1 TURMA · 1 ALUNO'), findsOneWidget);
      // Com turma própria, o vazio das turmas da arena some.
      expect(find.byKey(const Key('professor-classes-empty')), findsNothing);

      expect(find.text('ENCERRADAS · 1'), findsOneWidget);
      expect(find.text('Noite Antiga'), findsNothing);
      await tapKey(tester, 'professor-own-classes-ended-toggle');
      expect(find.text('Noite Antiga'), findsOneWidget);
      expect(find.text('ENCERRADA'), findsOneWidget);

      await tapKey(tester, 'professor-own-class-new');
      expect(find.text('Nova turma própria'), findsOneWidget);
      expect(find.text('ARENA NORTE · INDEPENDENTE'), findsOneWidget);
    });

    testWidgets('toque no cartão abre o detalhe', (tester) async {
      final repo = FakeProfessorOwnClassesRepository(classes: [ownClass()]);
      await pumpOwnClassesApp(
        tester,
        repo: repo,
        location: AppRoutes.professorClasses,
      );
      await tapKey(tester, 'professor-own-class-oc-1');
      expect(find.text('ARENA NORTE · TURMA PRÓPRIA'), findsOneWidget);
    });
  });

  group('Detalhe da turma própria', () {
    FakeProfessorWalletRepository wallet() => FakeProfessorWalletRepository(
          account: walletAccount(),
          students: [
            walletStudent(),
            walletStudent(athleteId: 'ath-ana', name: 'Ana Lima'),
            walletStudent(athleteId: 'ath-bia', name: 'Bia Souza'),
            walletStudent(
              athleteId: 'ath-caio',
              name: 'Caio Invited',
              status: ProfessorWalletStudentStatus.invited,
            ),
          ],
        );

    testWidgets('mostra dados, mensalidade e os alunos da carteira', (
      tester,
    ) async {
      final repo = FakeProfessorOwnClassesRepository(classes: [
        ownClass(studentIds: const ['ath-paulo', 'ath-sumiu']),
      ]);
      await pumpOwnClassesApp(
        tester,
        repo: repo,
        wallet: wallet(),
        location: detailPath('oc-1'),
      );
      expect(find.text('Manhã Intermediário'), findsOneWidget);
      expect(find.text('Ter e Qui · 07:00–08:00'), findsOneWidget);
      expect(find.text('Arena Norte · R\$ 60 por aula'), findsOneWidget);
      expect(find.text('2/4'), findsOneWidget);
      expect(find.text(formatBRL(260)), findsOneWidget);
      expect(find.text('ALUNOS · 2 DE 4'), findsOneWidget);
      expect(
        find.descendant(
          of: find.byKey(const Key('professor-own-class-student-ath-paulo')),
          matching: find.text('Paulo Viana'),
        ),
        findsOneWidget,
      );
      // Saiu da carteira: fica o genérico.
      expect(
        find.descendant(
          of: find.byKey(const Key('professor-own-class-student-ath-sumiu')),
          matching: find.text('Aluno'),
        ),
        findsOneWidget,
      );
    });

    testWidgets('editar alunos respeita as vagas e oferece a cobrança', (
      tester,
    ) async {
      final repo = FakeProfessorOwnClassesRepository(classes: [
        ownClass(capacity: 2, studentIds: const ['ath-paulo']),
      ]);
      await pumpOwnClassesApp(
        tester,
        repo: repo,
        wallet: wallet(),
        location: detailPath('oc-1'),
        initialStack: [AppRoutes.professorClasses],
      );

      await tapKey(tester, 'professor-own-class-edit-students');
      expect(find.text('Alunos da turma'), findsOneWidget);
      // Só os ativos da carteira.
      expect(find.byKey(const Key('professor-own-class-pick-ath-caio')),
          findsNothing);
      expect(find.text('1 de 2 vagas · só alunos ativos da sua carteira'),
          findsOneWidget);

      await tapKey(tester, 'professor-own-class-pick-ath-ana');
      expect(find.text('2 de 2 vagas · só alunos ativos da sua carteira'),
          findsOneWidget);
      expect(
          find.text('Turma cheia: tire alguém para trocar.'), findsOneWidget);
      // Cheia: a Bia não entra.
      await tapKey(tester, 'professor-own-class-pick-ath-bia');
      expect(find.text('2 de 2 vagas · só alunos ativos da sua carteira'),
          findsOneWidget);

      await tapKey(tester, 'professor-own-class-students-save');
      expect(repo.callsOf('setStudents').single.data, {
        'classId': 'oc-1',
        'ids': ['ath-paulo', 'ath-ana'],
      });
      // Quem entrou: a oferta de cobrança.
      expect(find.text('Cobrar mensalidade?'), findsOneWidget);
      expect(find.byKey(const Key('professor-own-class-charge-ath-ana')),
          findsOneWidget);
      expect(find.byKey(const Key('professor-own-class-charge-ath-paulo')),
          findsNothing);

      await tapKey(tester, 'professor-own-class-charge-ath-ana');
      expect(find.text('Nova cobrança'), findsOneWidget);
      expect(find.text('ANA LIMA · CARTEIRA'), findsOneWidget);
      expect(
        tester
            .widget<TextField>(field('professor-charge-amount'))
            .controller!
            .text,
        '260',
      );
      expect(
        tester
            .widget<TextField>(field('professor-charge-description'))
            .controller!
            .text,
        'Mensalidade · Manhã Intermediário',
      );
      expect(
        tester
            .widget<Switch>(find.descendant(
              of: find.byKey(const Key('professor-charge-repeat')),
              matching: find.byType(Switch),
            ))
            .value,
        isTrue,
      );
    });

    testWidgets('encerrar pede confirmação e chama o servidor', (
      tester,
    ) async {
      final repo = FakeProfessorOwnClassesRepository(classes: [ownClass()]);
      await pumpOwnClassesApp(
        tester,
        repo: repo,
        location: detailPath('oc-1'),
        initialStack: [AppRoutes.professorClasses],
      );

      await tapKey(tester, 'professor-own-class-end');
      expect(find.text('Encerrar turma?'), findsOneWidget);
      await tap(tester, find.text('Voltar'));
      expect(repo.callsOf('end'), isEmpty);

      await tapKey(tester, 'professor-own-class-end');
      await tapKey(tester, 'professor-wallet-confirm');
      expect(repo.callsOf('end').single.data, 'oc-1');
      expect(
          find.text('Turma encerrada. A quadra foi liberada.'), findsOneWidget);
      // Voltou ao Minhas turmas, com a turma entre as encerradas.
      expect(find.text('ENCERRADAS · 1'), findsOneWidget);
    });

    testWidgets('turma encerrada: sem editar nem encerrar', (tester) async {
      final repo = FakeProfessorOwnClassesRepository(classes: [
        ownClass(
          status: ProfessorOwnClassStatus.ended,
          endedReason: 'link_or_permission',
        ),
      ]);
      await pumpOwnClassesApp(
        tester,
        repo: repo,
        location: detailPath('oc-1'),
      );
      expect(
          find.byKey(const Key('professor-own-class-ended')), findsOneWidget);
      expect(find.textContaining('vínculo ou o horário fixo'), findsOneWidget);
      expect(find.byKey(const Key('professor-own-class-edit-students')),
          findsNothing);
      expect(find.byKey(const Key('professor-own-class-end')), findsNothing);
    });
  });

  test('cobrança preenchida: valor personalizado e mensal', () {
    const p = ProfessorChargePrefill(amountReais: 260.5, description: 'x');
    expect(p.repeatMonthly, isTrue);
  });
}
