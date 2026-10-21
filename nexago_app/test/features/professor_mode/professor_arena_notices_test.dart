import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/professor_mode/domain/arena_professor_notices.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_notices.dart';

import '../professor_links/professor_links_test_support.dart'
    show loadProfessorLinksFonts;
import 'professor_notices_test_support.dart';
import 'professor_students_test_support.dart';

/// F6 Comunicados da gestão da arena para o professor: domínio, a aba "Da
/// gestão" da lista (F1), o detalhe com os elegíveis e o repasse preenchido.

Future<void> tap(WidgetTester tester, Finder f) async {
  await tester.ensureVisible(f);
  await tester.tap(f);
  await settleProfessorStudents(tester);
}

Finder field(String key) => find.descendant(
      of: find.byKey(Key(key)),
      matching: find.byType(TextField),
    );

Finder inside(String key, Finder matching) =>
    find.descendant(of: find.byKey(Key(key)), matching: matching);

/// João e Maria em Iniciante A (CFC), Pedro particular na Norte.
final _snapshot = professorStudentsSnapshot(students: [
  studentMap({}),
  studentMap({'studentId': 's2', 'athleteId': 'ath-2', 'name': 'Maria Souza'}),
  studentMap({
    'studentId': 's3',
    'athleteId': 'ath-3',
    'arenaId': 'arena-norte',
    'arenaName': 'Arena Norte',
    'name': 'Pedro Lima',
    'classes': [studentClassMap(classId: 'c2', name: 'Particular Pedro')],
  }),
]);

String _detail(String id) =>
    AppRoutes.professorArenaNotice.replaceAll(':noticeId', id);

void main() {
  setUpAll(loadProfessorLinksFonts);

  group('domínio', () {
    test('lê o comunicado da arena', () {
      final n = ArenaProfessorNotice.fromMap('an1', {
        'arenaId': 'arena-cfc',
        'arenaName': 'Arena CFC',
        'authorUid': 'staff-ana',
        'authorName': 'Ana Souza',
        'kind': 'agenda',
        'title': 'Quadra 2 em manutenção',
        'body': 'Amanhã até 11h.',
        'recipientIds': ['prof-1', 'prof-2'],
        'recipientCount': 2,
        'readCount': 1,
        'sentAt': Timestamp.fromDate(DateTime.utc(2026, 10, 20, 14)),
      });
      expect(n.kind, ArenaProfessorNoticeKind.agenda);
      expect(n.arenaName, 'Arena CFC');
      expect(n.authorName, 'Ana Souza');
      expect(n.recipientIds, ['prof-1', 'prof-2']);
      expect(n.readCount, 1);
      expect(n.sentAt, DateTime.utc(2026, 10, 20, 14));
      final empty = ArenaProfessorNotice.fromMap('x', const {'kind': '??'});
      expect(empty.kind, ArenaProfessorNoticeKind.aviso);
      expect(empty.arenaName, 'Arena');
      expect(empty.authorName, 'Gestão');
    });

    test('elegíveis da arena, um por atleta; repasse sem a carteira', () {
      expect(arenaNoticeEligibleStudents(_snapshot, 'arena-cfc'), 2);
      expect(arenaNoticeEligibleStudents(_snapshot, 'arena-norte'), 1);
      expect(arenaNoticeEligibleStudents(_snapshot, 'arena-lagoa'), 0);

      const classes = <ProfessorNoticeClass>[
        (
          classId: 'c1',
          name: 'Iniciante A',
          arenaId: 'arena-cfc',
          arenaName: 'Arena CFC',
          students: 4,
        ),
        (
          classId: 'c2',
          name: 'Particular Pedro',
          arenaId: 'arena-norte',
          arenaName: 'Arena Norte',
          students: 1,
        ),
      ];
      final mine = arenaNoticeClasses(classes, 'arena-cfc');
      expect(mine.map((c) => c.classId), ['c1']);
      final p = arenaNoticeForwardPrefill(arenaNotice(), mine);
      expect(p.title, 'Torneio interno 15/11 · inscrições abertas');
      expect(p.kind, ProfessorNoticeKind.aviso);
      expect(p.audience.classIds, ['c1']);
      expect(p.audience.wallet, isFalse);

      final sorted = sortArenaProfessorNotices([
        arenaNotice(id: 'old', sentAt: DateTime.utc(2026, 10, 1)),
        arenaNotice(id: 'new', sentAt: DateTime.utc(2026, 10, 19)),
      ]);
      expect(sorted.map((n) => n.id), ['new', 'old']);
    });
  });

  group('F1 lista', () {
    testWidgets('destaque do não lido e a aba "Da gestão"', (tester) async {
      final repo = FakeProfessorNoticesRepository(
        notices: [notice()],
        arenaNotices: [
          arenaNotice(),
          arenaNotice(
            id: 'an2',
            title: 'Horário de verão',
            sentAt: DateTime.utc(2026, 10, 10),
          ),
        ],
        arenaRead: {'an2'},
      );
      await pumpProfessorNoticesApp(
        tester,
        notices: repo,
        snapshot: _snapshot,
        location: AppRoutes.professorNotices,
      );
      expect(
          find.byKey(const Key('arena-notice-highlight-an1')), findsOneWidget);
      expect(find.text('DA GESTÃO · ARENA CFC'), findsOneWidget);
      expect(find.text('Da gestão · 1'), findsOneWidget);
      // Os do professor seguem embaixo.
      expect(find.byKey(const Key('professor-notice-n1')), findsOneWidget);

      await tap(tester, find.byKey(const Key('professor-notices-tab-arena')));
      expect(find.byKey(const Key('professor-notice-n1')), findsNothing);
      expect(find.byKey(const Key('arena-notice-an1')), findsOneWidget);
      expect(find.byKey(const Key('arena-notice-an2')), findsOneWidget);
      expect(find.byKey(const Key('arena-notice-unread-an1')), findsOneWidget);
      expect(find.byKey(const Key('arena-notice-unread-an2')), findsNothing);

      await tap(tester, find.byKey(const Key('arena-notice-an1')));
      expect(find.text('Da gestão'), findsOneWidget);
      expect(repo.arenaMarked, ['an1']);
    });

    testWidgets('sem comunicados da gestão: aviso vazio', (tester) async {
      await pumpProfessorNoticesApp(
        tester,
        notices: FakeProfessorNoticesRepository(),
        location: AppRoutes.professorNotices,
      );
      await tap(tester, find.byKey(const Key('professor-notices-tab-arena')));
      expect(find.byKey(const Key('arena-notices-empty')), findsOneWidget);
    });
  });

  group('F6 detalhe', () {
    testWidgets('autor, elegíveis, regra e marca lido ao abrir',
        (tester) async {
      final repo =
          FakeProfessorNoticesRepository(arenaNotices: [arenaNotice()]);
      await pumpProfessorNoticesApp(
        tester,
        notices: repo,
        snapshot: _snapshot,
        location: _detail('an1'),
      );
      expect(find.text('ARENA CFC · PARA PROFESSORES'), findsOneWidget);
      expect(find.text('Ana Souza · gestão'), findsOneWidget);
      expect(find.text('HOJE 11:20'), findsOneWidget);
      expect(find.text('EVENTO'), findsOneWidget);
      expect(find.text('Torneio interno 15/11 · inscrições abertas'),
          findsOneWidget);
      expect(
          inside('arena-notice-eligible', find.text('Seus alunos elegíveis')),
          findsOneWidget);
      expect(inside('arena-notice-eligible', find.text('2')), findsOneWidget);
      expect(
        find.text('Só alunos da Arena CFC recebem ao repassar. Sua carteira '
            'independente fica de fora.'),
        findsOneWidget,
      );
      expect(repo.arenaMarked, ['an1']);
    });

    testWidgets('repassar abre o editor preenchido com as turmas da arena',
        (tester) async {
      final repo = FakeProfessorNoticesRepository(
        arenaNotices: [arenaNotice()],
        previewCount: 2,
      );
      await pumpProfessorNoticesApp(
        tester,
        notices: repo,
        snapshot: _snapshot,
        location: _detail('an1'),
      );
      await tap(tester, find.byKey(const Key('arena-notice-forward')));
      expect(find.text('Novo comunicado'), findsOneWidget);
      expect(
        tester
            .widget<TextField>(field('professor-notice-title'))
            .controller!
            .text,
        'Torneio interno 15/11 · inscrições abertas',
      );

      await tap(tester, find.byKey(const Key('professor-notice-next')));
      expect(repo.previews.last, {
        'classIds': ['c1'],
        'wallet': false,
      });
      await tap(tester, find.byKey(const Key('professor-notice-continue')));
      await tap(tester, find.byKey(const Key('professor-notice-send')));
      expect(repo.sent.single['audience'], {
        'classIds': ['c1'],
        'wallet': false,
      });
      expect(repo.sent.single['title'],
          'Torneio interno 15/11 · inscrições abertas');
      expect(repo.sent.single['body'], 'Inscrição R\$ 60 por dupla até 08/11.');
    });

    testWidgets('sem turmas na arena: repasse desligado', (tester) async {
      await pumpProfessorNoticesApp(
        tester,
        notices: FakeProfessorNoticesRepository(
          arenaNotices: [
            arenaNotice(arenaId: 'arena-lagoa', arenaName: 'Arena Lagoa'),
          ],
        ),
        snapshot: _snapshot,
        location: _detail('an1'),
      );
      expect(find.byKey(const Key('arena-notice-no-classes')), findsOneWidget);
      expect(inside('arena-notice-eligible', find.text('0')), findsOneWidget);
      final button = find.descendant(
        of: find.byKey(const Key('arena-notice-forward')),
        matching: find.byType(FilledButton),
      );
      expect(tester.widget<FilledButton>(button).onPressed, isNull);
    });

    testWidgets('não é para esta conta: aviso', (tester) async {
      await pumpProfessorNoticesApp(
        tester,
        notices: FakeProfessorNoticesRepository(),
        location: _detail('nope'),
      );
      expect(find.byKey(const Key('arena-notice-missing')), findsOneWidget);
    });
  });
}
