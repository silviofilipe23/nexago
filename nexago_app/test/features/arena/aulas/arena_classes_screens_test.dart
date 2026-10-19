import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/domain/arena_plan.dart';
import 'package:nexago_app/features/arena/domain/arena_staff_role.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class_session.dart';

import 'arena_class_fixtures.dart';
import 'aulas_pump.dart';
import 'fake_arena_class_repository.dart';

FakeArenaClassRepository dayRepo() => FakeArenaClassRepository(
      classes: [
        arenaClass(
            id: 'c1',
            name: 'Iniciante A',
            weekdays: const [1, 3],
            start: '07:00',
            end: '08:00',
            studentCount: 6,
            capacity: 6),
        arenaClass(
            id: 'c4',
            name: 'Experimental BT',
            weekdays: const [],
            startDate: '2026-10-19',
            start: '17:00',
            end: '18:00',
            studentCount: 3,
            capacity: 3),
        arenaClass(
            id: 'c5', name: 'Vôlei Avançado', studentCount: 10, capacity: 12),
      ],
      sessionsByDate: {
        '2026-10-19': [
          session(
              id: 's1',
              classId: 'c1',
              className: 'Iniciante A',
              start: '07:00',
              end: '08:00',
              capacity: 6,
              status: 'completed',
              attendance: const {'x': AttendanceMark.present}),
          session(
              id: 's4',
              classId: 'c4',
              className: 'Experimental BT',
              start: '17:00',
              end: '18:00',
              capacity: 3),
          session(
              id: 's5',
              classId: 'c5',
              className: 'Vôlei Avançado',
              start: '18:00',
              end: '19:30',
              capacity: 12),
        ],
      },
    );

void main() {
  group('A1 · Aulas de hoje', () {
    testWidgets('cards com AGORA, PRÓXIMA, concluídas e os 3 KPIs',
        (tester) async {
      await pumpAulas(tester, repo: dayRepo());

      expect(find.text('Aulas'), findsOneWidget);
      expect(find.text('SEG, 19 OUT · 3 AULAS'), findsOneWidget);
      expect(find.text('AGORA'), findsOneWidget);
      expect(find.text('PRÓXIMA'), findsOneWidget);
      expect(find.text('CONCLUÍDAS · 1'), findsOneWidget);
      expect(find.text('Chamada fechada'), findsOneWidget);
      // 6 + 3 + 10 alunos em 6 + 3 + 12 vagas.
      expect(find.text('19'), findsWidgets);
      expect(find.text('${(19 * 100 / 21).round()}%'), findsOneWidget);
      expect(find.text('10 alunos'), findsOneWidget);
    });

    testWidgets('aba Turmas lista lotação e horário', (tester) async {
      await pumpAulas(tester, repo: dayRepo());

      await tester.tap(find.text('Turmas'));
      await tester.pump();

      expect(find.text('2 TURMAS · 19 ALUNOS'), findsOneWidget);
      expect(find.text('Seg · Qua · Sex · 18:00–19:30'), findsOneWidget);
      expect(find.text('10/12'), findsOneWidget);
      expect(find.text('AULAS AVULSAS'), findsOneWidget);
    });

    testWidgets('sem plano e sem turmas mostra o paywall de Aulas',
        (tester) async {
      await pumpAulas(
        tester,
        repo: FakeArenaClassRepository(),
        plan: ArenaPlanStatus.none,
      );

      expect(find.text('Planos Pro e Elite'), findsOneWidget);
      expect(find.textContaining('turmas e aulas avulsas'), findsOneWidget);
    });

    testWidgets('tocar no cartão abre a chamada da aula', (tester) async {
      final repo = dayRepo();
      repo.sessionsById['s5'] = repo.sessionsByDate['2026-10-19']!.last;
      await pumpAulas(tester, repo: repo);

      await tester.tap(find.text('Vôlei Avançado'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      expect(find.text('CHAMADA'), findsOneWidget);
      // A lista do dia lê os alunos de cada turma (conta do dia): deixa o
      // agendador do Riverpod assentar antes de desmontar.
      await tester.pump(const Duration(milliseconds: 50));
    });
  });

  group('A2 · Chamada', () {
    FakeArenaClassRepository chamadaRepo({String date = '2026-10-19'}) {
      return FakeArenaClassRepository(
        sessionsById: {
          's5': session(
            id: 's5',
            classId: 'c5',
            date: date,
            attendance: const {'u2': AttendanceMark.absent},
          ),
        },
        students: [
          student('u1', 'Felipe Rocha', athleteId: 'u1'),
          student('u2', 'Caio Ramos'),
          student('u3', 'Renan Alves', athleteId: 'u3'),
          student('u9', 'Saiu Antes', status: 'removed'),
        ],
      );
    }

    testWidgets('recepção: "Demais presentes" e fechar grava as marcas',
        (tester) async {
      final repo = chamadaRepo();
      final router = await pumpAulas(
        tester,
        repo: repo,
        initial: '/arena/classes/session/s5',
      );

      expect(find.text('Vôlei Avançado'), findsOneWidget);
      expect(find.text('Saiu Antes'), findsNothing);
      expect(find.text('Fechar chamada · 0 presentes'), findsOneWidget);

      await tester.tap(find.text('Demais presentes'));
      await tester.pump();
      expect(find.text('Fechar chamada · 2 presentes'), findsOneWidget);
      expect(find.text('1 falta'), findsOneWidget);

      await tester.tap(find.text('Fechar chamada · 2 presentes'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      expect(repo.savedAttendance.single, {
        'sessionId': 's5',
        'marks': {'u2': 'absent', 'u1': 'present', 'u3': 'present'},
        'close': true,
      });
      // Fechou a chamada → sai da tela (aqui a pilha do teste começa em "/").
      expect(router.routerDelegate.currentConfiguration.uri.path, '/');
      expect(find.text('Chamada fechada · 2 presentes.'), findsOneWidget);
    });

    testWidgets('marcar um aluno a um troca a contagem antes de gravar',
        (tester) async {
      final repo = chamadaRepo();
      await pumpAulas(tester, repo: repo, initial: '/arena/classes/session/s5');

      await tester
          .tap(find.bySemanticsLabel('Marcar presença de Felipe Rocha'));
      await tester.pump();

      expect(find.text('Fechar chamada · 1 presente'), findsOneWidget);
      expect(repo.savedAttendance, isEmpty);
    });

    testWidgets('fechar com aluno sem marca pede confirmação', (tester) async {
      final repo = chamadaRepo();
      await pumpAulas(tester, repo: repo, initial: '/arena/classes/session/s5');

      await tester.tap(find.text('Fechar chamada · 0 presentes'));
      await tester.pump();

      expect(find.text('Fechar com alunos sem marca?'), findsOneWidget);
      await tester.tap(find.text('Voltar'));
      await tester.pump();
      expect(repo.savedAttendance, isEmpty);
    });

    testWidgets('manutenção só lê: sem fechar, sem marcar e sem cancelar',
        (tester) async {
      await pumpAulas(
        tester,
        repo: chamadaRepo(),
        role: ArenaStaffRole.manutencao,
        initial: '/arena/classes/session/s5',
      );

      expect(find.textContaining('Fechar chamada'), findsNothing);
      expect(find.text('Demais presentes'), findsNothing);
      expect(find.textContaining('Só leitura'), findsOneWidget);
      expect(find.byTooltip('Mais ações'), findsNothing);
      expect(find.bySemanticsLabel(RegExp('Marcar presença')), findsNothing);
    });

    testWidgets('aula futura: chamada fechada até o dia, cancelar liberado',
        (tester) async {
      await pumpAulas(
        tester,
        repo: chamadaRepo(date: '2099-01-05'),
        initial: '/arena/classes/session/s5',
      );

      expect(
          find.textContaining('A chamada abre no dia da aula'), findsOneWidget);
      expect(find.textContaining('Fechar chamada'), findsNothing);
      expect(find.byTooltip('Mais ações'), findsOneWidget);
    });
  });

  group('A4 · Cancelar aula', () {
    testWidgets('exige o motivo, mostra a prévia do push e cancela',
        (tester) async {
      final repo = FakeArenaClassRepository(
        sessionsById: {'s5': session(id: 's5', classId: 'c5')},
        students: [
          student('u1', 'Felipe Rocha', athleteId: 'u1'),
          student('u2', 'Caio Ramos'),
        ],
      )..notifiedOnCancel = 1;
      await pumpAulas(tester, repo: repo, initial: '/arena/classes/session/s5');

      await tester.tap(find.byTooltip('Mais ações'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      await tester.tap(find.text('Cancelar aula').last);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      // Fase 2: a compensação segue a regra da arena (padrão: gera crédito).
      expect(find.text('Gerar crédito de reposição'), findsOneWidget);
      expect(
          find.textContaining('A quadra é liberada na agenda'), findsOneWidget);
      final button = find.widgetWithText(FilledButton, 'Escolha o motivo');
      expect(tester.widget<FilledButton>(button).onPressed, isNull);

      await tester.tap(find.text('Chuva'));
      await tester.pump();
      expect(
        find.text(
          'A aula Vôlei Avançado de 19/10 às 18:00 foi cancelada pela arena '
          '(chuva). Você ganhou 1 crédito de reposição.',
        ),
        findsOneWidget,
      );

      await tester.tap(find.text('Cancelar e avisar 1 aluno'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      expect(repo.canceled.single['reason'], 'rain');
      expect(repo.canceled.single['sessionId'], 's5');
      expect(repo.canceled.single['generateCredits'], isTrue);
      expect(
        find.text('Aula cancelada. Quadra liberada · 1 aluno avisado.'),
        findsOneWidget,
      );
    });
  });
}
