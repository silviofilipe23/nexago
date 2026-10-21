import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_lesson_plans.dart';
import 'package:nexago_app/features/professor_mode/presentation/lesson_plans/athlete_lesson_plan_pages.dart';

import 'professor_agenda_test_support.dart';
import 'professor_lesson_plans_test_support.dart';
import 'professor_students_test_support.dart';

Future<void> tap(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pump();
  await tester.tap(finder);
  await settleProfessorStudents(tester);
}

Future<void> menu(WidgetTester tester, Key key, String item) async {
  await tap(tester, find.byKey(key));
  await tester.tap(find.text(item).last);
  await settleProfessorStudents(tester);
}

const _c1Today = 'class_c1_2026-10-20';
const _c2Tomorrow = 'class_c2_2026-10-21';
const _c1Thursday = 'class_c1_2026-10-22';

LessonPlanLesson _lesson(String refId, {List<LessonPlanStudent>? students}) =>
    LessonPlanLesson(
      planId: lessonPlanId(lessonPlanUid, LessonPlanKind.session, refId),
      title: 'Iniciante A',
      date: '2026-10-22',
      startTime: '19:00',
      endTime: '20:00',
      place: 'Quadra 2',
      students: students ??
          const [
            LessonPlanStudent(athleteId: 'ath-1', name: 'Marina Teles'),
            LessonPlanStudent(athleteId: 'ath-2', name: 'Caio Ramos'),
          ],
    );

void main() {
  group('H1 · Planos de aula', () {
    testWidgets('status por aula e contagem no cabeçalho', (tester) async {
      final repo = FakeProfessorLessonPlansRepository(plans: [
        lessonPlan(),
        lessonPlan(
          refId: _c2Tomorrow,
          date: '2026-10-21',
          status: LessonPlanStatus.draft,
        ),
      ]);
      await pumpLessonPlansApp(tester, plans: repo);

      expect(find.text('3 PRÓXIMAS · 1 SEM PLANO'), findsOneWidget);
      Text status(String refId) =>
          tester.widget<Text>(find.byKey(Key('lesson-plan-status-$refId')));
      expect(status(_c1Today).data, 'PRONTO');
      expect(status(_c2Tomorrow).data, 'RASCUNHO');
      expect(status(_c1Thursday).data, 'SEM PLANO');
      // Cancelada fica de fora.
      expect(find.byKey(const Key('lesson-plan-row-class_c2_2026-10-20')),
          findsNothing);
      // Sem plano: Planejar, Usar modelo e (mesma turma com plano) Repetir.
      expect(find.byKey(const Key('lesson-plan-plan-$_c1Thursday')),
          findsOneWidget);
      expect(find.byKey(const Key('lesson-plan-template-$_c1Thursday')),
          findsOneWidget);
      expect(find.byKey(const Key('lesson-plan-repeat-$_c1Thursday')),
          findsOneWidget);
      expect(find.byKey(const Key('lesson-plan-plan-$_c1Today')), findsNothing);
    });

    testWidgets('"Repetir anterior" abre o editor com o plano de terça',
        (tester) async {
      final repo = FakeProfessorLessonPlansRepository(plans: [lessonPlan()]);
      final router = await pumpLessonPlansApp(tester, plans: repo);

      await tap(
          tester, find.byKey(const Key('lesson-plan-repeat-$_c1Thursday')));

      expect(router.state.uri.path, AppRoutes.professorLessonPlanEditor);
      expect(router.state.uri.queryParameters['refId'], _c1Thursday);
      expect(find.text('Saque com direção'), findsOneWidget);
      expect(find.text('Saque em zonas-alvo'), findsOneWidget);
      expect(find.text('Jogo reduzido'), findsOneWidget);
      expect(find.text('BLOCOS · 2'), findsOneWidget);
      expect(find.text('35′ / 60′'), findsOneWidget);

      await tap(tester, find.byKey(const Key('lesson-plan-save')));
      final saved = repo.savedPlans.single;
      expect(saved.refId, _c1Thursday);
      expect([for (final b in saved.blocks) b.name],
          ['Saque em zonas-alvo', 'Jogo reduzido']);
      // Blocos copiados ganham ids novos.
      expect(saved.blocks.first.id, isNot('b1'));
    });

    testWidgets('"Usar modelo" preenche o editor e conta o uso',
        (tester) async {
      final repo = FakeProfessorLessonPlansRepository(templates: [
        LessonTemplate(
          id: 'tpl-1',
          name: 'Rede e smash',
          level: 'Avançado',
          objective: 'Transição para a rede',
          blocks: [
            planBlock(
              name: 'Smash com recuo',
              category: LessonPlanCategory.smash,
              minutes: 12,
            ),
          ],
          uses: 3,
        ),
      ]);
      await pumpLessonPlansApp(tester, plans: repo);

      await tap(
          tester, find.byKey(const Key('lesson-plan-template-$_c1Thursday')));
      await tap(tester, find.byKey(const Key('lesson-template-pick-tpl-1')));

      expect(repo.usedTemplates, ['tpl-1']);
      expect(find.text('Transição para a rede'), findsOneWidget);
      expect(find.text('Smash com recuo'), findsOneWidget);
      expect(find.text('12′ / 60′'), findsOneWidget);
    });

    testWidgets('Modelos lista nível, duração e uso', (tester) async {
      final repo = FakeProfessorLessonPlansRepository(templates: [
        LessonTemplate(
          id: 'tpl-1',
          name: 'Fundamentos do zero',
          level: 'Iniciante',
          blocks: [
            planBlock(category: LessonPlanCategory.fisico, minutes: 10),
            planBlock(id: 'b2', minutes: 50),
          ],
          uses: 9,
        ),
      ]);
      await pumpLessonPlansApp(tester, plans: repo);
      await tap(tester, find.byKey(const Key('lesson-plans-tab-1')));

      expect(find.text('Fundamentos do zero'), findsOneWidget);
      expect(find.text('Iniciante · usado 9×'), findsOneWidget);
      expect(find.text('60′'), findsOneWidget);

      await tap(tester, find.byKey(const Key('lesson-template-tpl-1')));
      await tap(tester, find.byKey(const Key('lesson-template-delete')));
      await tap(tester, find.byKey(const Key('professor-wallet-confirm')));
      expect(repo.deletedTemplates, ['tpl-1']);
    });

    testWidgets('Exercícios mostra a biblioteca NexaGO e os próprios',
        (tester) async {
      final repo = FakeProfessorLessonPlansRepository(exercises: [
        LessonExercise.fromMap(
          'meu-1',
          lessonExerciseDocument(const LessonExerciseInput(
            name: 'Meu saque',
            category: LessonPlanCategory.saque,
            minutes: 10,
          )),
        ),
      ]);
      await pumpLessonPlansApp(tester, plans: repo);
      await tap(tester, find.byKey(const Key('lesson-plans-tab-2')));

      expect(find.text('Meu saque'), findsOneWidget);
      expect(find.text('Meu exercício'), findsOneWidget);
      expect(find.text('Aquecimento dinâmico'), findsOneWidget);

      await tap(tester, find.byKey(const Key('lesson-exercise-filter-smash')));
      expect(find.text('Smash com recuo'), findsOneWidget);
      expect(find.text('Meu saque'), findsNothing);
    });
  });

  group('H2 · Editor', () {
    Future<FakeProfessorLessonPlansRepository> openEditor(
      WidgetTester tester, {
      List<LessonPlan> plans = const [],
      String refId = _c1Thursday,
    }) async {
      final repo = FakeProfessorLessonPlansRepository(
        plans: List.of(plans),
        lessons: {'session:$refId': _lesson(refId)},
      );
      await pumpLessonPlansApp(
        tester,
        plans: repo,
        location: editorLocation(LessonPlanKind.session, refId),
      );
      return repo;
    }

    testWidgets('cabeçalho com o dia, a hora e a duração', (tester) async {
      await openEditor(tester);
      expect(find.text('Plano · Iniciante A'), findsOneWidget);
      expect(find.text('QUI 22 OUT · 19:00 · 60 MIN'), findsOneWidget);
      expect(find.text('Salvar e publicar'), findsOneWidget);
      expect(find.text('BLOCOS · 0'), findsOneWidget);
    });

    testWidgets('adiciona da biblioteca, reordena, remove e publica',
        (tester) async {
      final repo = await openEditor(tester);

      await tap(tester, find.byKey(const Key('lesson-plan-add-exercise')));
      expect(find.text('Selecione exercícios'), findsOneWidget);
      await tap(tester,
          find.byKey(const Key('lesson-exercise-nexago-aquecimento-dinamico')));
      await tap(
          tester, find.byKey(const Key('lesson-exercise-nexago-mini-tenis')));
      await tap(tester,
          find.byKey(const Key('lesson-exercise-nexago-rei-da-quadra')));
      expect(find.text('Adicionar 3 ao plano · 30′'), findsOneWidget);
      await tap(tester, find.byKey(const Key('lesson-exercise-add-selected')));

      expect(find.text('BLOCOS · 3'), findsOneWidget);
      expect(find.text('30′ / 60′'), findsOneWidget);

      // Desce o aquecimento e remove o mini-tênis.
      await menu(tester, const Key('lesson-plan-block-menu-0'), 'Descer');
      await menu(tester, const Key('lesson-plan-block-menu-0'), 'Remover');
      await tap(tester, find.byKey(const Key('professor-wallet-confirm')));
      expect(find.text('BLOCOS · 2'), findsOneWidget);
      expect(find.text('23′ / 60′'), findsOneWidget);

      await tester.enterText(
        find.byKey(const Key('lesson-plan-objective')),
        'Aquecer e jogar',
      );
      await tap(tester, find.byKey(const Key('lesson-plan-tag-jogo')));
      await tap(tester, find.byKey(const Key('lesson-plan-save')));

      final p = repo.savedPlans.single.toPayload();
      expect(p['kind'], 'session');
      expect(p['refId'], _c1Thursday);
      expect(p['objective'], 'Aquecer e jogar');
      expect(p['tags'], ['jogo']);
      expect(p['status'], 'ready');
      expect(p['published'], isTrue);
      expect(
        [for (final b in p['blocks']! as List) (b as Map)['name']],
        ['Aquecimento dinâmico', 'Rei da quadra'],
      );
      expect(
        [for (final b in p['blocks']! as List) (b as Map)['exerciseId']],
        ['nexago-aquecimento-dinamico', 'nexago-rei-da-quadra'],
      );
      expect(find.text('Plano publicado para 2 alunos.'), findsOneWidget);
    });

    testWidgets('passar da duração deixa o total em alerta', (tester) async {
      await openEditor(tester, plans: [
        lessonPlan(
          refId: _c1Thursday,
          date: '2026-10-22',
          blocks: [planBlock(minutes: 45), planBlock(id: 'b2', minutes: 30)],
        ),
      ]);
      expect(find.text('75′ / 60′'), findsOneWidget);
      expect(find.byKey(const Key('lesson-plan-over')), findsOneWidget);
    });

    testWidgets('H4: o tempo escolhido no ± entra no bloco', (tester) async {
      final repo = await openEditor(tester);
      await tap(tester, find.byKey(const Key('lesson-plan-add-exercise')));
      await tap(tester,
          find.byKey(const Key('lesson-exercise-info-nexago-saque-zonas')));

      expect(find.byKey(const Key('lesson-exercise-media')), findsOneWidget);
      expect(find.text('Como fazer'.toUpperCase()), findsOneWidget);
      expect(find.byKey(const Key('lesson-exercise-easier')), findsOneWidget);
      expect(find.byKey(const Key('lesson-exercise-harder')), findsOneWidget);
      expect(find.text('Adicionar ao plano · 15′'), findsOneWidget);

      await tap(tester, find.byKey(const Key('lesson-plan-stepper-plus')));
      await tap(tester, find.byKey(const Key('lesson-plan-stepper-plus')));
      expect(find.text('Adicionar ao plano · 25′'), findsOneWidget);
      await tap(tester, find.byKey(const Key('lesson-exercise-add')));

      expect(find.text('Saque em zonas-alvo'), findsOneWidget);
      expect(find.text('25′ / 60′'), findsOneWidget);
      await tap(tester, find.byKey(const Key('lesson-plan-save')));
      expect(repo.savedPlans.single.blocks.single.minutes, 25);
    });

    testWidgets('H5: comentário da turma e foco individual vão no payload',
        (tester) async {
      final repo = await openEditor(tester, plans: [
        lessonPlan(
          refId: _c1Thursday,
          date: '2026-10-22',
          blocks: [planBlock()],
        ),
      ]);
      await tap(tester, find.byKey(const Key('lesson-plan-block-0')));

      expect(find.text('Bloco 1 · 15′ · comentários e foco individual'),
          findsOneWidget);
      await tester.enterText(
        find.byKey(const Key('lesson-plan-note')),
        'Abrir a terceira zona só com 60% de acerto',
      );
      await tap(tester, find.byKey(const Key('lesson-plan-note-public')));

      await tap(tester, find.byKey(const Key('lesson-plan-focus-add')));
      await tap(tester, find.byKey(const Key('lesson-plan-focus-pick-ath-1')));
      await tester.enterText(
        find.byKey(const Key('lesson-plan-focus-text-ath-1')),
        'Flexionar o joelho na batida',
      );
      await tap(tester, find.byKey(const Key('lesson-plan-focus-add')));
      await tap(tester, find.byKey(const Key('lesson-plan-focus-pick-ath-2')));
      await tester.enterText(
        find.byKey(const Key('lesson-plan-focus-text-ath-2')),
        'Voltando de dor no ombro',
      );
      // Marina vê o foco; o do Caio fica privado.
      await tap(
          tester, find.byKey(const Key('lesson-plan-focus-toggle-ath-1')));
      expect(find.text('ALUNO VÊ'), findsOneWidget);
      expect(find.text('PRIVADO'), findsOneWidget);
      await tap(tester, find.byKey(const Key('lesson-plan-comments-save')));

      expect(find.byKey(const Key('lesson-plan-block-note-0')), findsOneWidget);
      expect(find.text('Foco individual · 2'.toUpperCase()), findsOneWidget);

      await tap(tester, find.byKey(const Key('lesson-plan-save')));
      final p = repo.savedPlans.single.toPayload();
      final block = (p['blocks']! as List).single as Map;
      expect(block['note'], 'Abrir a terceira zona só com 60% de acerto');
      expect(block['notePublic'], isTrue);
      expect(p['focus'], [
        {
          'athleteId': 'ath-1',
          'text': 'Flexionar o joelho na batida',
          'public': true,
        },
        {
          'athleteId': 'ath-2',
          'text': 'Voltando de dor no ombro',
          'public': false,
        },
      ]);
    });

    testWidgets('H5: "Só eu" deixa a nota privada', (tester) async {
      final repo = await openEditor(tester, plans: [
        lessonPlan(
          refId: _c1Thursday,
          date: '2026-10-22',
          blocks: [planBlock(note: 'Visível', notePublic: true)],
        ),
      ]);
      await tap(tester, find.byKey(const Key('lesson-plan-block-0')));
      await tap(tester, find.byKey(const Key('lesson-plan-note-private')));
      await tap(tester, find.byKey(const Key('lesson-plan-comments-save')));
      await tap(tester, find.byKey(const Key('lesson-plan-save')));
      final block =
          (repo.savedPlans.single.toPayload()['blocks']! as List).single as Map;
      expect(block['note'], 'Visível');
      expect(block['notePublic'], isFalse);
    });

    testWidgets('desligar "Mostrar aos alunos" salva sem publicar',
        (tester) async {
      final repo = await openEditor(tester, plans: [
        lessonPlan(refId: _c1Thursday, date: '2026-10-22'),
      ]);
      await tap(tester, find.byType(Switch));
      expect(find.text('Salvar plano'), findsOneWidget);
      await tap(tester, find.byKey(const Key('lesson-plan-save')));
      expect(repo.savedPlans.single.toPayload()['published'], isFalse);
      expect(find.text('Plano salvo.'), findsOneWidget);
    });

    testWidgets('sem blocos salva como rascunho', (tester) async {
      final repo = await openEditor(tester);
      await tap(tester, find.byKey(const Key('lesson-plan-save')));
      expect(repo.savedPlans.single.toPayload()['status'], 'draft');
      expect(find.text('Rascunho salvo.'), findsOneWidget);
    });

    testWidgets('sair com alteração pede confirmação', (tester) async {
      final repo = await openEditor(tester);
      await tester.enterText(
        find.byKey(const Key('lesson-plan-objective')),
        'Algo novo',
      );
      await settleProfessorStudents(tester);

      await tap(tester, find.bySemanticsLabel('Voltar'));
      expect(find.text('Sair sem salvar?'), findsOneWidget);
      await tap(tester, find.text('Continuar editando'));
      expect(find.text('Plano · Iniciante A'), findsOneWidget);

      await tap(tester, find.bySemanticsLabel('Voltar'));
      await tap(tester, find.byKey(const Key('lesson-plan-discard')));
      expect(find.text('Plano · Iniciante A'), findsNothing);
      expect(find.text('Planos de aula'), findsOneWidget);
      expect(repo.savedPlans, isEmpty);
    });

    testWidgets('"Salvar modelo" grava os blocos como modelo', (tester) async {
      final repo = await openEditor(tester, plans: [
        lessonPlan(refId: _c1Thursday, date: '2026-10-22'),
      ]);
      await tap(tester, find.byKey(const Key('lesson-plan-save-template')));
      await tester.enterText(
        find.byKey(const Key('lesson-template-name')),
        'Saque + jogo',
      );
      await tap(
          tester, find.byKey(const Key('lesson-template-level-Intermediário')));
      await tap(tester, find.byKey(const Key('lesson-template-confirm')));

      final t = repo.savedTemplates.single;
      expect(t.uid, lessonPlanUid);
      expect(t.name, 'Saque + jogo');
      expect(t.level, 'Intermediário');
      expect(t.content.objective, 'Saque com direção');
      expect([for (final b in t.content.blocks) b.name],
          ['Saque em zonas-alvo', 'Jogo reduzido']);
      expect(find.text('Modelo salvo.'), findsOneWidget);
    });

    testWidgets('"Apagar plano" no menu', (tester) async {
      final repo = await openEditor(tester, plans: [
        lessonPlan(refId: _c1Thursday, date: '2026-10-22'),
      ]);
      await menu(tester, const Key('lesson-plan-menu'), 'Apagar plano');
      await tap(tester, find.byKey(const Key('professor-wallet-confirm')));
      expect(repo.deletedPlans,
          [lessonPlanId(lessonPlanUid, LessonPlanKind.session, _c1Thursday)]);
    });
  });

  group('exercício próprio', () {
    testWidgets('"+" cria o exercício e ele entra na biblioteca',
        (tester) async {
      final repo = FakeProfessorLessonPlansRepository();
      await pumpLessonPlansApp(
        tester,
        plans: repo,
        location: editorLocation(LessonPlanKind.session, _c1Thursday),
      );
      await tap(tester, find.byKey(const Key('lesson-plan-add-exercise')));
      await tap(tester, find.byKey(const Key('lesson-exercise-new')));
      await tester.enterText(
        find.descendant(
          of: find.byKey(const Key('lesson-exercise-form-name')),
          matching: find.byType(TextField),
        ),
        'Lob de defesa',
      );
      await tap(
          tester, find.byKey(const Key('lesson-exercise-form-cat-toque')));
      await tester.enterText(
        find.byKey(const Key('lesson-exercise-form-steps')),
        'Recuar\nLevantar a bola',
      );
      await tap(tester, find.byKey(const Key('lesson-exercise-form-save')));

      final saved = repo.savedExercises.single.input;
      expect(saved.name, 'Lob de defesa');
      expect(saved.category, LessonPlanCategory.toque);
      expect(saved.cleanSteps, ['Recuar', 'Levantar a bola']);
      expect(find.text('Lob de defesa'), findsOneWidget);
      expect(find.text('Meu exercício'), findsOneWidget);
    });
  });

  group('E4 · plano no detalhe da aula', () {
    testWidgets('com plano mostra os blocos; toque abre o editor',
        (tester) async {
      final repo = FakeProfessorLessonPlansRepository(plans: [lessonPlan()]);
      final router = await pumpLessonPlansApp(
        tester,
        plans: repo,
        location: AppRoutes.professorAgenda,
      );
      router.pushNamed(
        AppRouteNames.professorAgendaSession,
        pathParameters: {'sessionId': _c1Today},
        extra: agendaSession(id: _c1Today),
      );
      await settleProfessorStudents(tester);

      expect(find.byKey(const Key('lesson-plan-agenda-card')), findsOneWidget);
      expect(find.text('Saque em zonas-alvo'), findsOneWidget);
      expect(find.text('20′'), findsOneWidget);
      expect(find.text('PRONTO'), findsOneWidget);

      await tap(tester, find.byKey(const Key('lesson-plan-agenda-card')));
      expect(router.state.uri.path, AppRoutes.professorLessonPlanEditor);
      expect(router.state.uri.queryParameters['refId'], _c1Today);
    });

    testWidgets('sem plano: "Planejar aula"', (tester) async {
      final router = await pumpLessonPlansApp(
        tester,
        plans: FakeProfessorLessonPlansRepository(),
        location: AppRoutes.professorAgenda,
      );
      router.pushNamed(
        AppRouteNames.professorAgendaSession,
        pathParameters: {'sessionId': _c1Thursday},
        extra: agendaSession(id: _c1Thursday, date: '2026-10-22'),
      );
      await settleProfessorStudents(tester);
      expect(find.text('Planejar aula'), findsOneWidget);
    });
  });

  group('H8 · plano do aluno', () {
    testWidgets('foco e nota pública aparecem; a privada não existe',
        (tester) async {
      final view = lessonView(myFocus: 'Flexionar o joelho na batida');
      await pumpLessonPlansApp(
        tester,
        plans: FakeProfessorLessonPlansRepository(views: [view]),
        location: '/aula/plano/${view.id}',
        uid: 'ath-1',
      );

      expect(find.text('Próxima aula'), findsOneWidget);
      expect(find.text('QUI 22 OUT · 19:00 · QUADRA 2'), findsOneWidget);
      expect(find.text('Intermediário B'), findsOneWidget);
      expect(find.text('Prof. Thiago Mendes · Arena CFC'), findsOneWidget);
      expect(
          find.byKey(const Key('athlete-lesson-plan-focus')), findsOneWidget);
      expect(find.text('SEU FOCO NESTA AULA'), findsOneWidget);
      expect(find.text('Flexionar o joelho na batida'), findsOneWidget);
      expect(find.text('Aquecimento'), findsOneWidget);
      expect(find.text('Sair do saque já posicionado'), findsOneWidget);
      // O bloco 0 veio com a nota vazia (privada no plano): nada a mostrar.
      expect(find.byKey(const Key('athlete-lesson-plan-note-0')), findsNothing);
      expect(
          find.byKey(const Key('athlete-lesson-plan-note-1')), findsOneWidget);
      expect(find.text('30′'), findsOneWidget);
    });

    testWidgets('sem foco não há destaque', (tester) async {
      final view = lessonView();
      await pumpLessonPlansApp(
        tester,
        plans: FakeProfessorLessonPlansRepository(views: [view]),
        location: '/aula/plano/${view.id}',
        uid: 'ath-1',
      );
      expect(find.byKey(const Key('athlete-lesson-plan-focus')), findsNothing);
      expect(find.text('SEU FOCO NESTA AULA'), findsNothing);
    });

    testWidgets('lista "Planos das aulas" abre o plano', (tester) async {
      final view = lessonView();
      final router = await pumpLessonPlansApp(
        tester,
        plans: FakeProfessorLessonPlansRepository(views: [
          view,
          lessonView(refId: 'class_c9_2026-10-01', date: '2026-10-01'),
        ]),
        location: AppRoutes.athleteLessonPlans,
        uid: 'ath-1',
      );
      expect(find.text('PRÓXIMAS'), findsOneWidget);
      expect(find.text('ANTERIORES'), findsOneWidget);
      await tap(tester, find.byKey(Key('athlete-lesson-plan-${view.id}')));
      expect(router.state.uri.path, '/aula/plano/${view.id}');
    });

    testWidgets('"Ver plano da aula" só quando a aula tem plano publicado',
        (tester) async {
      final view = lessonView();
      final router = await pumpProfessorAgendaApp(
        tester,
        agenda: FakeProfessorAgendaRepository(),
        location: '/detalhe',
        uid: 'ath-1',
        lessonPlans: FakeProfessorLessonPlansRepository(views: [view]),
        extraRoutes: [
          ...lessonPlanRoutes,
          GoRoute(
            path: '/detalhe',
            builder: (_, __) => const Scaffold(
              body: Column(
                children: [
                  AthleteLessonPlanLink(
                    kind: LessonPlanKind.session,
                    refId: 'class_c1_2026-10-22',
                  ),
                  AthleteLessonPlanLink(
                    kind: LessonPlanKind.session,
                    refId: 'class_c1_2026-10-29',
                  ),
                ],
              ),
            ),
          ),
        ],
      );
      expect(find.text('Ver plano da aula'), findsOneWidget);
      await tap(tester, find.text('Ver plano da aula'));
      expect(router.state.uri.path, '/aula/plano/${view.id}');
    });

    testWidgets('plano que sumiu', (tester) async {
      await pumpLessonPlansApp(
        tester,
        plans: FakeProfessorLessonPlansRepository(),
        location: '/aula/plano/nada',
        uid: 'ath-1',
      );
      expect(
          find.byKey(const Key('athlete-lesson-plan-missing')), findsOneWidget);
    });
  });
}
