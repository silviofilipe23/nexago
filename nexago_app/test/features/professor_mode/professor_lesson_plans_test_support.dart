import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/athlete/domain/agenda/class_agenda_entry.dart';
import 'package:nexago_app/features/professor_mode/application/professor_lesson_plans_providers.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_agenda.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_lesson_plans.dart';
import 'package:nexago_app/features/professor_mode/infrastructure/professor_lesson_plans_repository.dart';
import 'package:nexago_app/features/professor_mode/presentation/lesson_plans/athlete_lesson_plan_pages.dart';
import 'package:nexago_app/features/professor_mode/presentation/lesson_plans/lesson_live_page.dart';
import 'package:nexago_app/features/professor_mode/presentation/lesson_plans/lesson_plan_editor_page.dart';
import 'package:nexago_app/features/professor_mode/presentation/lesson_plans/lesson_review_page.dart';
import 'package:nexago_app/features/professor_mode/presentation/lesson_plans/lesson_plans_page.dart';

import 'professor_agenda_test_support.dart';
import 'professor_students_test_support.dart';

/// Apoio dos testes do plano de aula (H1–H5, H8). Agora = Ter 20/10/2026
/// 12:00 em SP ([agendaNow]).

const lessonPlanUid = professorStudentsTestUid;

LessonPlanBlock planBlock({
  String id = 'b1',
  String name = 'Saque em zonas-alvo',
  LessonPlanCategory category = LessonPlanCategory.saque,
  int minutes = 15,
  String note = '',
  bool notePublic = false,
}) =>
    LessonPlanBlock(
      id: id,
      name: name,
      category: category,
      minutes: minutes,
      note: note,
      notePublic: notePublic,
    );

LessonPlan lessonPlan({
  LessonPlanKind kind = LessonPlanKind.session,
  String refId = 'class_c1_2026-10-20',
  String date = '2026-10-20',
  String title = 'Iniciante A',
  String objective = 'Saque com direção',
  List<LessonPlanBlock>? blocks,
  List<LessonPlanFocus> focus = const [],
  LessonPlanStatus status = LessonPlanStatus.ready,
  bool published = true,
  LessonReview? review,
  Map<String, int> ratings = const {},
}) =>
    LessonPlan(
      id: lessonPlanId(lessonPlanUid, kind, refId),
      professorUid: lessonPlanUid,
      kind: kind,
      refId: refId,
      title: title,
      date: date,
      startTime: '19:00',
      endTime: '20:00',
      objective: objective,
      tags: const [LessonPlanCategory.saque],
      blocks: blocks ??
          [
            planBlock(),
            planBlock(
              id: 'b2',
              name: 'Jogo reduzido',
              category: LessonPlanCategory.jogo,
              minutes: 20,
            ),
          ],
      focus: focus,
      published: published,
      status: status,
      review: review,
      ratings: ratings,
    );

LessonPlanView lessonView({
  String refId = 'class_c1_2026-10-22',
  String athleteId = 'ath-1',
  String? myFocus,
  String date = '2026-10-22',
  List<LessonPlanViewBlock>? blocks,
  LessonViewFeedback? feedback,
  bool planVisible = true,
  int? ratingStars,
}) {
  final planId = lessonPlanId('prof-9', LessonPlanKind.session, refId);
  return LessonPlanView(
    id: lessonPlanViewId(planId, athleteId),
    planId: planId,
    athleteId: athleteId,
    professorUid: 'prof-9',
    kind: LessonPlanKind.session,
    professorName: 'Thiago Mendes',
    lessonTitle: 'Intermediário B',
    date: date,
    startTime: '19:00',
    endTime: '20:00',
    arenaName: 'Arena CFC',
    place: 'Quadra 2',
    objective: 'Saque com direção e devolução cruzada',
    blocks: blocks ??
        const [
          LessonPlanViewBlock(
            name: 'Aquecimento',
            category: LessonPlanCategory.fisico,
            minutes: 10,
          ),
          LessonPlanViewBlock(
            name: 'Devolução cruzada',
            category: LessonPlanCategory.devolucao,
            minutes: 20,
            note: 'Sair do saque já posicionado',
          ),
        ],
    durationMin: 30,
    myFocus: myFocus,
    feedback: feedback,
    planVisible: planVisible,
    ratingStars: ratingStars,
  );
}

typedef SavedTemplate = ({
  String uid,
  String? templateId,
  String name,
  String level,
  LessonPlanContent content,
});

/// Repositório do plano em memória.
class FakeProfessorLessonPlansRepository
    implements ProfessorLessonPlansRepository {
  FakeProfessorLessonPlansRepository({
    List<LessonPlan>? plans,
    List<LessonTemplate>? templates,
    List<LessonExercise>? exercises,
    List<LessonPlanView>? views,
    Map<String, LessonPlanLesson>? lessons,
  })  : plans = plans ?? [],
        templates = templates ?? [],
        exercises = exercises ?? [],
        views = views ?? [],
        lessons = lessons ?? {};

  List<LessonPlan> plans;
  List<LessonTemplate> templates;
  List<LessonExercise> exercises;
  List<LessonPlanView> views;

  /// `kind:refId` → aula e alunos.
  Map<String, LessonPlanLesson> lessons;
  int viewCount = 2;
  final savedPlans = <LessonPlanDraft>[];
  final deletedPlans = <String>[];
  final savedTemplates = <SavedTemplate>[];
  final deletedTemplates = <String>[];
  final usedTemplates = <String>[];
  final savedExercises = <({String? id, LessonExerciseInput input})>[];
  final deletedExercises = <String>[];
  final _changes = StreamController<void>.broadcast();

  Stream<T> _watch<T>(T Function() read) async* {
    yield read();
    await for (final _ in _changes.stream) {
      yield read();
    }
  }

  @override
  Stream<List<LessonPlan>> watchPlans(
    String uid, {
    required String fromDateKey,
  }) =>
      _watch(() => [
            for (final p in plans)
              if (p.date.compareTo(fromDateKey) >= 0) p,
          ]);

  @override
  Future<({String planId, int viewCount})> savePlan(
    LessonPlanDraft draft,
  ) async {
    savedPlans.add(draft);
    final id = lessonPlanId(lessonPlanUid, draft.kind, draft.refId);
    final lesson = lessons['${draft.kind.id}:${draft.refId}'];
    plans = [
      for (final p in plans)
        if (p.id != id) p,
      LessonPlan(
        id: id,
        kind: draft.kind,
        refId: draft.refId,
        title: lesson?.title ?? 'Aula',
        date: lesson?.date ?? '2026-10-20',
        objective: draft.objective,
        tags: draft.tags,
        blocks: draft.blocks,
        focus: draft.focus,
        published: draft.toPayload()['published'] == true,
        status: draft.effectiveStatus,
      ),
    ];
    _changes.add(null);
    return (planId: id, viewCount: viewCount);
  }

  @override
  Future<void> deletePlan(String planId) async {
    deletedPlans.add(planId);
    plans = [
      for (final p in plans)
        if (p.id != planId) p,
    ];
    _changes.add(null);
  }

  final savedReviews = <LessonReviewDraft>[];
  final ratings = <({String viewId, int stars})>[];
  Object? rateError;

  @override
  Future<int> saveReview(LessonReviewDraft draft) async {
    savedReviews.add(draft);
    LessonPlan? plan;
    for (final p in plans) {
      if (p.id == draft.planId) plan = p;
    }
    final sent = lessonReviewSendCount(draft, plan?.review);
    if (plan != null) {
      final p = plan;
      plans = [
        for (final x in plans)
          if (x.id != p.id) x,
        LessonPlan(
          id: p.id,
          kind: p.kind,
          refId: p.refId,
          title: p.title,
          date: p.date,
          startTime: p.startTime,
          endTime: p.endTime,
          objective: p.objective,
          tags: p.tags,
          blocks: p.blocks,
          focus: p.focus,
          published: p.published,
          status: p.status,
          review: LessonReview(
            blockRatings: draft.blockRatings,
            generalNote: draft.generalNote,
            feedback: draft.feedback,
          ),
        ),
      ];
      _changes.add(null);
    }
    return sent;
  }

  @override
  Future<void> rateFeedback(String viewId, int stars) async {
    final e = rateError;
    if (e != null) throw e;
    ratings.add((viewId: viewId, stars: stars));
  }

  @override
  Future<LessonPlanLesson> fetchLessonStudents(
    LessonPlanKind kind,
    String refId,
  ) async =>
      lessons['${kind.id}:$refId'] ??
      LessonPlanLesson(
        planId: lessonPlanId(lessonPlanUid, kind, refId),
        title: 'Aula',
        date: '2026-10-20',
        startTime: '19:00',
        endTime: '20:00',
      );

  @override
  Stream<List<LessonTemplate>> watchTemplates(String uid) =>
      _watch(() => List.of(templates));

  @override
  Future<void> saveTemplate(
    String uid, {
    String? templateId,
    required String name,
    required String level,
    required LessonPlanContent content,
    int uses = 0,
  }) async {
    savedTemplates.add((
      uid: uid,
      templateId: templateId,
      name: name,
      level: level,
      content: content,
    ));
    final id = templateId ?? 'tpl-${savedTemplates.length}';
    templates = [
      for (final t in templates)
        if (t.id != id) t,
      LessonTemplate(
        id: id,
        name: name,
        level: level,
        objective: content.objective,
        tags: content.tags,
        blocks: content.blocks,
        uses: uses,
      ),
    ];
    _changes.add(null);
  }

  @override
  Future<void> deleteTemplate(String uid, String templateId) async {
    deletedTemplates.add(templateId);
    templates = [
      for (final t in templates)
        if (t.id != templateId) t,
    ];
    _changes.add(null);
  }

  @override
  Future<void> markTemplateUsed(String uid, String templateId) async {
    usedTemplates.add(templateId);
  }

  @override
  Stream<List<LessonExercise>> watchExercises(String uid) =>
      _watch(() => List.of(exercises));

  @override
  Future<void> saveExercise(
    String uid,
    LessonExerciseInput input, {
    String? exerciseId,
  }) async {
    savedExercises.add((id: exerciseId, input: input));
    final id = exerciseId ?? 'ex-${savedExercises.length}';
    exercises = [
      for (final e in exercises)
        if (e.id != id) e,
      LessonExercise.fromMap(id, lessonExerciseDocument(input)),
    ];
    _changes.add(null);
  }

  @override
  Future<void> deleteExercise(String uid, String exerciseId) async {
    deletedExercises.add(exerciseId);
    exercises = [
      for (final e in exercises)
        if (e.id != exerciseId) e,
    ];
    _changes.add(null);
  }

  @override
  Stream<List<LessonPlanView>> watchMyViews(String athleteId) => _watch(() => [
        for (final v in views)
          if (v.athleteId == athleteId) v,
      ]);

  @override
  Stream<LessonPlanView?> watchView(String viewId) => _watch(() {
        for (final v in views) {
          if (v.id == viewId) return v;
        }
        return null;
      });
}

List<RouteBase> get lessonPlanRoutes => [
      GoRoute(
        path: AppRoutes.professorLessonPlans,
        name: AppRouteNames.professorLessonPlans,
        builder: (_, __) => const ProfessorLessonPlansPage(),
      ),
      GoRoute(
        path: AppRoutes.professorLessonPlanEditor,
        name: AppRouteNames.professorLessonPlanEditor,
        builder: (_, state) => ProfessorLessonPlanEditorPage(
          kind: LessonPlanKind.parse(state.uri.queryParameters['kind']) ??
              LessonPlanKind.session,
          refId: state.uri.queryParameters['refId'] ?? '',
          prefill: state.extra is LessonPlanContent
              ? state.extra! as LessonPlanContent
              : null,
        ),
      ),
      GoRoute(
        path: AppRoutes.professorLessonLive,
        name: AppRouteNames.professorLessonLive,
        builder: (_, state) => ProfessorLessonLivePage(
          planId: state.uri.queryParameters['planId'] ?? '',
        ),
      ),
      GoRoute(
        path: AppRoutes.professorLessonReview,
        name: AppRouteNames.professorLessonReview,
        builder: (_, state) => ProfessorLessonReviewPage(
          planId: state.uri.queryParameters['planId'] ?? '',
        ),
      ),
      GoRoute(
        path: AppRoutes.athleteConversation,
        name: AppRouteNames.athleteConversation,
        builder: (_, state) => Scaffold(
          body: Text('conversa ${state.pathParameters['conversationId']}'),
        ),
      ),
      GoRoute(
        path: AppRoutes.athleteLessonPlans,
        name: AppRouteNames.athleteLessonPlans,
        builder: (_, __) => const AthleteLessonPlansPage(),
      ),
      GoRoute(
        path: AppRoutes.athleteLessonPlan,
        name: AppRouteNames.athleteLessonPlan,
        builder: (_, state) => AthleteLessonPlanPage(
          viewId: state.pathParameters['viewId'] ?? '',
        ),
      ),
    ];

/// Aulas da semana: turma Iniciante A hoje (19h) e quinta (19h), turma
/// Avançado hoje (20h, cancelada) e Avançado amanhã.
List<ClassAgendaEntry> lessonPlanSessions() => [
      agendaSession(id: 'class_c1_2026-10-20'),
      agendaSession(id: 'class_c1_2026-10-22', date: '2026-10-22'),
      agendaSession(
        id: 'class_c2_2026-10-20',
        classId: 'c2',
        className: 'Avançado',
        start: '20:00',
        end: '21:00',
        status: 'canceled',
      ),
      agendaSession(
        id: 'class_c2_2026-10-21',
        classId: 'c2',
        className: 'Avançado',
        date: '2026-10-21',
        start: '07:00',
        end: '08:00',
      ),
    ];

String editorLocation(LessonPlanKind kind, String refId) =>
    '${AppRoutes.professorLessonPlanEditor}?kind=${kind.id}&refId=$refId';

/// App com a agenda, as rotas do plano e o repositório em memória.
Future<GoRouter> pumpLessonPlansApp(
  WidgetTester tester, {
  required FakeProfessorLessonPlansRepository plans,
  String location = AppRoutes.professorLessonPlans,
  List<ClassAgendaEntry>? sessions,
  ProfessorBlock? block,
  String uid = lessonPlanUid,
  DateTime Function()? liveClock,
  List<Override> overrides = const [],
}) =>
    pumpProfessorAgendaApp(
      tester,
      agenda: FakeProfessorAgendaRepository(
        sessions: sessions ?? lessonPlanSessions(),
        blocks: [if (block != null) block],
      ),
      location: location,
      lessonPlans: plans,
      extraRoutes: lessonPlanRoutes,
      uid: uid,
      extraOverrides: [
        lessonLiveWakelockProvider.overrideWithValue((_) async {}),
        if (liveClock != null)
          lessonLiveClockProvider.overrideWithValue(liveClock),
        ...overrides,
      ],
    );
