import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/auth/app_mobile_role.dart';
import 'package:nexago_app/core/auth/role_route_guard.dart';
import 'package:nexago_app/core/notifications/notification_navigation.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_agenda.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_lesson_plans.dart';

import 'professor_agenda_test_support.dart';
import 'professor_lesson_plans_test_support.dart';

void main() {
  group('payload do saveLessonPlan', () {
    test('leva blocos, notePublic e só o foco com texto', () {
      final draft = LessonPlanDraft(
        kind: LessonPlanKind.privateLesson,
        refId: 'pl-1',
        objective: '  Saque com direção  ',
        tags: const [LessonPlanCategory.saque, LessonPlanCategory.saque],
        blocks: [
          planBlock(note: 'Joelho flexionado', notePublic: true),
          planBlock(id: 'b2', name: 'Jogo', minutes: 20, note: 'privada'),
        ],
        focus: const [
          LessonPlanFocus(
            athleteId: 'ath-1',
            name: 'Marina',
            text: 'Flexionar o joelho',
            public: true,
          ),
          LessonPlanFocus(athleteId: 'ath-2', name: 'Caio', text: '   '),
        ],
        published: true,
      );
      final p = draft.toPayload();
      expect(p['kind'], 'private');
      expect(p['refId'], 'pl-1');
      expect(p['objective'], 'Saque com direção');
      expect(p['tags'], ['saque']);
      expect(p['status'], 'ready');
      expect(p['published'], isTrue);
      final blocks = p['blocks']! as List;
      expect(blocks, hasLength(2));
      expect((blocks[0] as Map)['notePublic'], isTrue);
      expect((blocks[0] as Map)['category'], 'saque');
      expect((blocks[1] as Map)['notePublic'], isFalse);
      expect(p['focus'], [
        {'athleteId': 'ath-1', 'text': 'Flexionar o joelho', 'public': true},
      ]);
    });

    test('sem blocos vira rascunho e rascunho nunca é publicado', () {
      const empty = LessonPlanDraft(
        kind: LessonPlanKind.session,
        refId: 's1',
        published: true,
      );
      expect(empty.effectiveStatus, LessonPlanStatus.draft);
      expect(empty.toPayload()['status'], 'draft');
      expect(empty.toPayload()['published'], isFalse);

      final draft = LessonPlanDraft(
        kind: LessonPlanKind.session,
        refId: 's1',
        blocks: [planBlock()],
        published: true,
        status: LessonPlanStatus.draft,
      );
      expect(draft.toPayload()['published'], isFalse);
    });

    test('validação espelha os limites do servidor', () {
      LessonPlanDraft d(List<LessonPlanBlock> b) =>
          LessonPlanDraft(kind: LessonPlanKind.session, refId: 's', blocks: b);
      expect(validateLessonPlanDraft(d([planBlock()])), isNull);
      expect(validateLessonPlanDraft(d([planBlock(name: ' ')])),
          'Dê um nome ao bloco 1.');
      expect(validateLessonPlanDraft(d([planBlock(minutes: 121)])),
          contains('1 a 120'));
      expect(
        validateLessonPlanDraft(d([
          for (var i = 0; i < 3; i++) planBlock(id: 'b$i', minutes: 90),
        ])),
        'O plano passa de 4 horas.',
      );
      expect(
        validateLessonPlanDraft(d([
          for (var i = 0; i < 21; i++) planBlock(id: 'b$i', minutes: 1),
        ])),
        contains('20 blocos'),
      );
    });
  });

  group('tempo', () {
    test('total contra a duração da aula (padrão 60)', () {
      final blocks = [planBlock(minutes: 15), planBlock(minutes: 50)];
      expect(lessonPlanTotalMinutes(blocks), 65);
      expect(lessonDurationFromTimes('19:00', '20:30'), 90);
      expect(lessonDurationFromTimes('19:00', ''), 60);
      expect(lessonDurationFromTimes('', ''), 60);
      expect(lessonPlanFits(65, 60), isFalse);
      expect(lessonPlanFits(60, 60), isTrue);
    });

    test('rótulo do dia "QUI 22 OUT"', () {
      expect(lessonPlanDayLabel('2026-10-22'), 'QUI 22 OUT');
    });
  });

  group('biblioteca NexaGO', () {
    test('uns 12 exercícios válidos, de vários fundamentos', () {
      const lib = kNexagoExerciseLibrary;
      expect(lib.length, greaterThanOrEqualTo(12));
      expect({for (final e in lib) e.id}.length, lib.length);
      expect(
        {for (final e in lib) e.category},
        containsAll([
          LessonPlanCategory.fisico,
          LessonPlanCategory.toque,
          LessonPlanCategory.saque,
          LessonPlanCategory.devolucao,
          LessonPlanCategory.voleio,
          LessonPlanCategory.smash,
          LessonPlanCategory.jogo,
        ]),
      );
      for (final e in lib) {
        expect(e.builtIn, isTrue);
        expect(e.sourceLabel, 'Biblioteca NexaGO');
        expect(e.name.length, lessThanOrEqualTo(kLessonExerciseNameMax));
        expect(e.minutes, inInclusiveRange(1, 120));
        expect(e.steps, isNotEmpty);
        expect(e.steps.length, lessThanOrEqualTo(kLessonExerciseMaxSteps));
        expect(e.easier, isNotEmpty);
        expect(e.harder, isNotEmpty);
        expect(e.attention, isNotEmpty);
        expect(e.id.contains('/'), isFalse);
      }
    });

    test('exercício vira bloco com o tempo escolhido', () {
      final e = kNexagoExerciseLibrary
          .firstWhere((x) => x.id == 'nexago-saque-zonas');
      final b = e.toBlock(blockId: 'x', minutesInPlan: 25);
      expect(b.exerciseId, e.id);
      expect(b.minutes, 25);
      expect(b.category, LessonPlanCategory.saque);
      expect(b.detail, '2–6 jogadores · 6 cones · 20 bolas');
      expect(e.matches('devolucao'), isFalse);
      expect(e.matches('SAQUE'), isTrue);
    });

    test('documento do exercício próprio só com as chaves da rule', () {
      final doc = lessonExerciseDocument(const LessonExerciseInput(
        name: ' Meu saque ',
        category: LessonPlanCategory.saque,
        minutes: 15,
        steps: ['a', ' ', 'b'],
      ));
      expect(
        doc.keys.toSet().difference({
          'name', 'category', 'minutes', 'players', 'level', 'equipment', //
          'steps', 'easier', 'harder', 'attention', 'videoUrl', 'uses',
        }),
        isEmpty,
      );
      expect(doc['minutes'], isA<int>());
      expect(doc['steps'], ['a', 'b']);
      expect(LessonExercise.fromMap('ex', doc).sourceLabel, 'Meu exercício');
      expect(
        validateLessonExercise(const LessonExerciseInput(
          name: '',
          category: LessonPlanCategory.saque,
          minutes: 10,
        )),
        isNotNull,
      );
    });

    test('documento do modelo só com as chaves da rule', () {
      final doc = lessonTemplateDocument(
        name: 'Saque + devolução',
        level: 'Intermediário',
        content: LessonPlanContent(blocks: [planBlock()]),
      );
      expect(
        doc.keys.toSet().difference(
            {'name', 'level', 'objective', 'tags', 'blocks', 'uses'}),
        isEmpty,
      );
    });
  });

  group('próximas aulas (H1)', () {
    final items = buildProfessorAgendaItems(
      sessions: lessonPlanSessions(),
      lessons: const [],
      bookingStatus: const {},
      blocks: [agendaBlock()],
    );

    test('sem bloqueios nem canceladas', () {
      final lessons = plannableLessonsFrom(
        items,
        fromKey: '2026-10-20',
        toKey: '2026-10-26',
      );
      expect([
        for (final l in lessons) l.refId
      ], [
        'class_c1_2026-10-20',
        'class_c2_2026-10-21',
        'class_c1_2026-10-22',
      ]);
      expect(lessons.first.classId, 'c1');
      expect(lessons.first.durationMin, 60);
    });

    test('status por plano, resumo e plano anterior da mesma turma', () {
      final lessons = plannableLessonsFrom(
        items,
        fromKey: '2026-10-20',
        toKey: '2026-10-26',
      );
      final rows = lessonPlanRows(
        lessons: lessons,
        plans: [
          lessonPlan(),
          lessonPlan(
            refId: 'class_c2_2026-10-21',
            date: '2026-10-21',
            status: LessonPlanStatus.draft,
          ),
        ],
        uid: lessonPlanUid,
      );
      expect([
        for (final r in rows) r.status
      ], [
        LessonPlanRowStatus.ready,
        LessonPlanRowStatus.draft,
        LessonPlanRowStatus.none,
      ]);
      expect(lessonPlanRowsSummary(rows), '3 PRÓXIMAS · 1 SEM PLANO');
      expect(rows[2].previous?.refId, 'class_c1_2026-10-20');
      expect(rows[1].previous, isNull);
    });

    test('id da turma pelo id da aula', () {
      expect(lessonPlanSessionClassId('class_abc_2026-10-20'), 'abc');
      expect(lessonPlanSessionClassId('class_a_b_2026-10-20'), 'a_b');
      expect(lessonPlanSessionClassId('outro'), isNull);
    });
  });

  group('visão do aluno', () {
    test('lê foco nulo, nota privada vazia e acha a aula pelo planId', () {
      final v = LessonPlanView.fromMap('p_session_s1_ath', {
        'planId': 'prof_session_s1',
        'athleteId': 'ath',
        'lessonTitle': 'Turma',
        'professorName': 'Thiago',
        'date': '2026-10-22',
        'myFocus': null,
        'blocks': [
          {'name': 'A', 'category': 'saque', 'minutes': 10, 'note': ''},
        ],
      });
      expect(v.myFocus, isNull);
      expect(v.blocks.single.note, isEmpty);
      expect(v.isFor(LessonPlanKind.session, 's1'), isTrue);
      expect(v.isFor(LessonPlanKind.privateLesson, 's1'), isFalse);
      expect(lessonPlanViewFor([v], LessonPlanKind.session, 's1'), v);
    });

    test('ids do plano e da visão', () {
      final planId = lessonPlanId('u1', LessonPlanKind.privateLesson, 'r1');
      expect(planId, 'u1_private_r1');
      expect(lessonPlanViewId(planId, 'a1'), 'u1_private_r1_a1');
    });
  });

  group('push e guarda', () {
    test('lesson_plan_published vai para o url (ou monta pelo viewId)', () {
      expect(
        resolveNotificationRoute(const {
          'type': 'lesson_plan_published',
          'url': '/aula/plano/v1',
          'viewId': 'v1',
          // Um `arenaId` não pode desviar para a agenda do gestor.
          'arenaId': 'arena-1',
        }),
        '/aula/plano/v1',
      );
      expect(
        resolveNotificationRoute(const {
          'type': 'lesson_plan_published',
          'viewId': 'v2',
          'bookingId': 'b1',
        }),
        '/aula/plano/v2',
      );
      expect(
        resolveNotificationRoute(const {'type': 'lesson_plan_published'}),
        AppRoutes.athleteLessonPlans,
      );
    });

    test('as telas do aluno passam na guarda do modo Atleta', () {
      expect(isAthleteExperiencePath('/aula/plano/v1'), isTrue);
      expect(isAthleteExperiencePath(AppRoutes.athleteLessonPlans), isTrue);
      expect(
        redirectForActiveRole(
          path: '/aula/plano/v1',
          activeRole: AppMobileRole.athlete,
          availableRoles: const [AppMobileRole.athlete],
          needsRoleSelection: false,
        ),
        isNull,
      );
      expect(
        isProfessorExperiencePath(AppRoutes.professorLessonPlans),
        isTrue,
      );
    });
  });
}
