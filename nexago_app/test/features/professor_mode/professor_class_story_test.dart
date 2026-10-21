import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/domain/booking_story.dart';
import 'package:nexago_app/features/athlete/data/class_story_tag_repository.dart';
import 'package:nexago_app/features/athlete/domain/agenda/class_agenda_entry.dart';
import 'package:nexago_app/features/athlete/domain/agenda/class_story.dart';
import 'package:nexago_app/features/athlete/domain/agenda/class_story_tag.dart';
import 'package:nexago_app/features/athlete/domain/agenda/teacher_class_roster.dart';
import 'package:nexago_app/features/athlete/domain/athlete_privacy_preferences.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';
import 'package:nexago_app/features/athlete/presentation/class_story_tag_page.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/agenda/class_story_card.dart';
import 'package:nexago_app/features/professor_links/application/professor_links_providers.dart';
import 'package:nexago_app/features/professor_mode/application/professor_agenda_providers.dart';
import 'package:nexago_app/features/professor_mode/application/professor_lesson_plans_providers.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_class_story.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_lesson_plans.dart';
import 'package:nexago_app/features/professor_mode/infrastructure/professor_class_story_repository.dart';
import 'package:nexago_app/features/professor_mode/presentation/story/professor_class_closed_page.dart';
import 'package:nexago_app/features/professor_mode/presentation/story/professor_class_story_page.dart';

const thiago = AthleteProfile(
  id: 'uThiago',
  name: 'Thiago Mendes',
  sport: '',
  level: '',
  city: '',
  nickname: 'prof.thiagomendes',
);

const marina = AthleteProfile(
  id: 'uMarina',
  name: 'Marina Torres',
  sport: '',
  level: '',
  city: '',
  nickname: 'marina.bt',
);

TeacherClassRoster roster() => TeacherClassRoster.fromMap({
      'session': {
        'sessionId': 's1',
        'arenaId': 'a1',
        'arenaName': 'Arena CFC',
        'classId': 'c1',
        'className': 'Intermediário B',
        'date': '2026-10-20',
        'startTime': '19:00',
        'endTime': '20:00',
        'courtName': 'Quadra 2',
        'status': 'completed',
        'attendanceOpen': true,
      },
      'students': [
        {
          'studentId': 'm1',
          'name': 'Marina Torres',
          'kind': 'regular',
          'mark': 'present',
          'storyTaggable': true,
        },
        {
          'studentId': 'e1',
          'name': 'Elisa Prado',
          'kind': 'regular',
          'mark': 'present',
          'storyTaggable': true,
        },
        {
          'studentId': 'r1',
          'name': 'Rafael Souza',
          'kind': 'regular',
          'mark': 'present',
        },
        {
          'studentId': 'f1',
          'name': 'Felipe Rocha',
          'kind': 'regular',
          'mark': 'absent',
          'storyTaggable': true,
        },
      ],
    });

class _FakeStoryRepo implements ProfessorClassStoryRepository {
  final calls = <({List<String> ids, List<ClassStoryPlanBlock> plan})>[];

  @override
  Future<({int tagged, int notified})> shareClassStory({
    required String sessionId,
    required List<String> studentIds,
    required List<ClassStoryPlanBlock> plan,
    required Set<ClassStoryInfo> infos,
  }) async {
    calls.add((ids: studentIds, plan: plan));
    return (tagged: studentIds.length, notified: studentIds.length);
  }
}

class _FakeTagRepo implements ClassStoryTagRepository {
  _FakeTagRepo(this.tag);

  final ClassStoryTag? tag;

  @override
  Future<ClassStoryTag?> fetch(String tagId) async => tag;
}

ClassStoryTag tag() => ClassStoryTag.fromMap('s1_uMarina', {
      'className': 'Intermediário B',
      'classType': 'turma',
      'arenaName': 'Arena CFC',
      'courtName': 'Quadra 2',
      'date': '2026-10-20',
      'startTime': '19:00',
      'endTime': '20:00',
      'teacherName': 'Thiago Mendes',
      'teacherHandle': '@prof.thiagomendes',
      'presentCount': 3,
      'plan': [
        {'minutes': 10, 'label': 'Aquecimento'},
        {'minutes': 20, 'label': 'Saque + devolução cruzada'},
      ],
      'show': {'plan': true, 'numbers': true, 'place': false},
      'people': [
        {'firstName': 'Marina', 'initials': 'MT', 'photoUrl': null},
        {'firstName': 'Elisa', 'initials': 'EP', 'photoUrl': ''},
      ],
      'taggedCount': 2,
    });

LessonPlan lessonPlan(List<(String, int)> blocks, {LessonReview? review}) =>
    LessonPlan(
      id: 'uThiago_session_s1',
      kind: LessonPlanKind.session,
      refId: 's1',
      title: 'Intermediário B',
      date: '2026-10-20',
      blocks: [
        for (var i = 0; i < blocks.length; i++)
          LessonPlanBlock(
            id: 'b$i',
            name: blocks[i].$1,
            minutes: blocks[i].$2,
            category: LessonPlanCategory.jogo,
            note: 'nota privada $i',
          ),
      ],
      review: review,
    );

void main() {
  setUpAll(() => initializeDateFormatting('pt_BR'));

  group('domínio', () {
    test('só aula dele, não cancelada, com chamada liberada e já terminada',
        () {
      ClassAgendaEntry e({
        String date = '2026-10-20',
        String role = 'teacher',
        String status = 'completed',
        bool manage = true,
      }) =>
          ClassAgendaEntry(
            sessionId: 's1',
            arenaId: 'a1',
            arenaName: 'Arena',
            classId: 'c1',
            className: 'Turma',
            teacherName: 'Thiago',
            courtName: 'Q1',
            date: date,
            startTime: '19:00',
            endTime: '20:00',
            startAt: null,
            status: status,
            role: role,
            kind: 'regular',
            canManageLessons: manage,
          );
      const today = (todayKey: '2026-10-20', nowMin: 20 * 60);
      const during = (todayKey: '2026-10-20', nowMin: 19 * 60 + 30);
      expect(isProfessorClassStoryAvailable(e(), today), isTrue);
      expect(isProfessorClassStoryAvailable(e(), during), isFalse);
      expect(isProfessorClassStoryAvailable(e(date: '2026-10-19'), during),
          isTrue);
      expect(isProfessorClassStoryAvailable(e(date: '2026-10-21'), today),
          isFalse);
      expect(
          isProfessorClassStoryAvailable(e(role: 'student'), today), isFalse);
      expect(isProfessorClassStoryAvailable(e(status: 'canceled'), today),
          isFalse);
      expect(isProfessorClassStoryAvailable(e(manage: false), today), isFalse);
    });

    test('resumo e marcáveis saem da chamada', () {
      final r = roster();
      final s = professorClassSummary(r);
      expect(s.minutes, 60);
      expect(s.present, 3);
      expect(s.total, 4);
      expect(s.taggable, 2);
      expect(professorStoryTaggable(r).map((x) => x.studentId), ['m1', 'e1']);
    });

    test('arte do professor: @, números com blocos, "com Marina, Elisa e +1"',
        () {
      const p = BookingStoryPerson(firstName: 'X', initials: 'X');
      final data = professorClassStoryData(
        className: 'Intermediário B',
        arenaName: 'Arena CFC',
        courtName: 'Quadra 2',
        date: '2026-10-20',
        startTime: '19:00',
        endTime: '20:00',
        presentCount: 5,
        plan: const [ClassStoryPlanBlock(minutes: 10, label: 'Aquecimento')],
        tagged: const [
          BookingStoryPerson(firstName: 'Marina', initials: 'MT'),
          BookingStoryPerson(firstName: 'Elisa', initials: 'EP'),
          p,
        ],
        teacherName: 'Thiago Mendes',
        teacherNickname: 'prof.thiagomendes',
      );
      expect(data.kicker, 'AULA · INTERMEDIÁRIO B');
      expect(data.stats, [('60', 'MIN'), ('5', 'ALUNOS'), ('1', 'BLOCO')]);
      expect(data.plan, [('10′', 'Aquecimento')]);
      expect(data.handle, '@prof.thiagomendes');
      expect(data.withLine, 'com Marina, Elisa e +1');
      expect(data.placeLine, ' · Quadra 2 · Ter 19:00');
      expect(data.footer, startsWith('TREINE COMIGO'));
      expect(classStoryInfosFor(data), ClassStoryInfo.values);
    });

    test('esporte da turma no kicker: chamada, arte do professor e repost', () {
      final r = TeacherClassRoster.fromMap({
        'session': {'sessionId': 's1', 'sport': 'beachTennis'},
        'students': const [],
      });
      expect(r.session.sport, 'beachTennis');
      expect(roster().session.sport, isNull);

      final data = professorClassStoryData(
        className: 'Intermediário B',
        sport: r.session.sport,
        arenaName: 'Arena CFC',
        courtName: 'Quadra 2',
        date: '2026-10-20',
        startTime: '19:00',
        endTime: '20:00',
        presentCount: 0,
        plan: const [],
        tagged: const [],
        teacherName: 'Thiago Mendes',
      );
      expect(data.kicker, 'BEACH TENNIS · INTERMEDIÁRIO B');

      final repost = taggedClassStoryData(
        tag: ClassStoryTag.fromMap('t1', {
          'className': 'Intermediário B',
          'sport': 'beachVolleyball',
        }),
        athleteName: 'Marina Torres',
      );
      expect(repost.kicker, 'VÔLEI DE PRAIA · INTERMEDIÁRIO B');
      // Card gravado antes do campo segue com "AULA".
      expect(
        taggedClassStoryData(
          tag: ClassStoryTag.fromMap('t2', {'className': 'Turma'}),
          athleteName: 'Marina',
        ).kicker,
        'AULA · TURMA',
      );
    });

    test('sem plano nem marcados: os chips somem', () {
      final data = professorClassStoryData(
        className: 'Turma',
        arenaName: 'Arena',
        courtName: '',
        date: '2026-10-20',
        startTime: '19:00',
        endTime: '20:00',
        presentCount: 0,
        plan: const [],
        tagged: const [],
        teacherName: 'Thiago Mendes',
      );
      expect(data.handle, 'Prof. Thiago');
      expect(classStoryInfosFor(data),
          [ClassStoryInfo.numbers, ClassStoryInfo.place]);
    });

    test('doc do marcado: lê o que o professor ligou e assina com o aluno', () {
      final t = tag();
      expect(t.people.map((p) => p.avatarUrl), [null, null]);
      expect(t.infos, {
        ClassStoryInfo.plan,
        ClassStoryInfo.numbers,
        ClassStoryInfo.people,
      });
      final data = taggedClassStoryData(
        tag: t,
        athleteName: 'Marina Torres',
        athleteNickname: 'marina.bt',
      );
      expect(data.handle, '@marina.bt');
      expect(data.withLine, 'com Prof. Thiago e a turma');
      expect(data.stats, [('60', 'MIN'), ('3', 'ALUNOS'), ('2', 'BLOCOS')]);
    });

    test('marcação no story é opt-in e vai para o Firestore', () {
      expect(const AthletePrivacyShowOthers().storyTags, isFalse);
      expect(AthletePrivacyShowOthers.fromFirestore({}).storyTags, isFalse);
      final on = AthletePrivacyShowOthers.fromFirestore({'storyTags': true});
      expect(on.storyTags, isTrue);
      expect(on.toFirestore()['storyTags'], isTrue);
      expect(on == const AthletePrivacyShowOthers(), isFalse);
    });
  });

  group('plano de aula → plano do story', () {
    test('tira "Não rolou" e "Pulado", corta o nome e não leva a nota', () {
      final r = classStoryPlanFromLessonPlan(lessonPlan(
        [
          ('Aquecimento', 10),
          ('Saque', 15),
          ('  ', 5),
          ('Devolução cruzada com deslocamento lateral e volta ao centro', 20),
          ('Jogo reduzido', 20),
        ],
        review: const LessonReview(blockRatings: {
          'b1': LessonBlockRating.skipped,
          'b4': LessonBlockRating.ok,
        }),
      ));
      expect(r.blocks.map((b) => b.label), [
        'Aquecimento',
        'Devolução cruzada com deslocamento later',
        'Jogo reduzido',
      ]);
      expect(r.blocks[1].label.length, lessThanOrEqualTo(40));
      expect(r.left, 0);
      final r2 = classStoryPlanFromLessonPlan(lessonPlan(
        [('Saque', 10)],
        review: const LessonReview(blockRatings: {'b0': LessonBlockRating.no}),
      ));
      expect(r2.blocks, isEmpty);
    });

    test('cabe 5 no story; o resto conta em left', () {
      final r = classStoryPlanFromLessonPlan(
          lessonPlan([for (var i = 0; i < 7; i++) ('Bloco $i', 10)]));
      expect(r.blocks, hasLength(5));
      expect(r.left, 2);
    });
  });

  group('G1 · Treino encerrado → G2', () {
    late _FakeStoryRepo repo;

    Future<void> pump(
      WidgetTester tester, {
      ThemeData? theme,
      List<LessonPlan> plans = const [],
    }) async {
      tester.view.physicalSize = const Size(400, 1300);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      repo = _FakeStoryRepo();
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            professorSessionRosterProvider
                .overrideWith((ref, _) async => roster()),
            athleteProfileProvider.overrideWith((ref) => Stream.value(thiago)),
            professorClassStoryRepositoryProvider.overrideWithValue(repo),
            professorLinksUidProvider.overrideWithValue('uThiago'),
            professorLessonPlansProvider
                .overrideWith((ref) => Stream.value(plans)),
          ],
          child: MaterialApp(
            theme: theme ?? AppTheme.dark,
            home: const ProfessorClassClosedPage(sessionId: 's1'),
          ),
        ),
      );
      await tester.pump();
      await tester.pump();
    }

    testWidgets('números, presentes e quem pode ser marcado', (tester) async {
      await pump(tester);
      expect(find.text('Treino encerrado'), findsOneWidget);
      expect(find.text('60′'), findsOneWidget);
      expect(find.text('3/4'), findsOneWidget);
      expect(
        find.byKey(const Key('professor-class-closed-present-m1')),
        findsOneWidget,
      );
      expect(
        find.byKey(const Key('professor-class-closed-present-f1')),
        findsNothing,
      );
      expect(find.text('Pode ser marcado no story'), findsNWidgets(2));
      expect(find.text('Não liberou o story'), findsOneWidget);
    });

    testWidgets('com plano de aula da turma: o plano já vem preenchido',
        (tester) async {
      await pump(tester, plans: [
        lessonPlan([
          for (var i = 0; i < 7; i++) ('Bloco $i', 10),
        ]),
        // Plano de outra aula não entra.
        LessonPlan(
          id: 'uThiago_session_s2',
          kind: LessonPlanKind.session,
          refId: 's2',
          title: 'Outra',
          date: '2026-10-21',
          blocks: const [
            LessonPlanBlock(
                id: 'x',
                name: 'Intruso',
                minutes: 5,
                category: LessonPlanCategory.jogo),
          ],
        ),
      ]);
      for (var i = 0; i < 5; i++) {
        expect(
            find.byKey(Key('professor-class-closed-plan-$i')), findsOneWidget);
      }
      expect(
          find.byKey(const Key('professor-class-closed-plan-5')), findsNothing);
      expect(find.text('Intruso'), findsNothing);
      expect(find.textContaining('nota privada'), findsNothing);
      expect(
        find.textContaining('Veio do seu plano de aula — o story cabe 5 '
            'blocos, 2 ficaram de fora'),
        findsOneWidget,
      );
      // Cheio: sem "Adicionar bloco"; tirar um não traz o plano de volta.
      expect(find.byKey(const Key('professor-class-closed-add-block')),
          findsNothing);
      await tester.tap(find.byTooltip('Tirar bloco').first);
      await tester.pump();
      expect(
          find.byKey(const Key('professor-class-closed-plan-4')), findsNothing);
      expect(find.text('Bloco 0'), findsNothing);

      await tester.tap(find.byKey(const Key('professor-class-closed-share')));
      await tester.pumpAndSettle();
      expect(
          find.byKey(const Key('professor-story-info-plan')), findsOneWidget);
      expect(find.text('Bloco 1'), findsOneWidget);
    });

    testWidgets('sem plano de aula: começa vazio, com "Montar o plano"',
        (tester) async {
      await pump(tester);
      expect(
          find.byKey(const Key('professor-class-closed-plan-0')), findsNothing);
      expect(find.text('Montar o plano'), findsOneWidget);
      expect(find.textContaining('Opcional.'), findsOneWidget);
    });

    testWidgets('monta o plano e abre o editor com os quatro chips',
        (tester) async {
      await pump(tester, theme: AppTheme.light);
      await tester
          .tap(find.byKey(const Key('professor-class-closed-add-block')));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const Key('professor-plan-block-label')),
        'Aquecimento',
      );
      await tester.pump();
      await tester.tap(find.byKey(const Key('professor-plan-block-save')));
      await tester.pumpAndSettle();
      expect(find.text('Aquecimento'), findsOneWidget);
      expect(find.text('10′'), findsOneWidget);

      await tester.tap(find.byKey(const Key('professor-class-closed-share')));
      await tester.pumpAndSettle();
      expect(find.text('Postar no story'), findsWidgets);
      expect(find.byType(ClassStoryCard), findsOneWidget);
      for (final info in ClassStoryInfo.values) {
        expect(
          find.byKey(Key('professor-story-info-${info.name}')),
          findsOneWidget,
        );
      }
      expect(find.text('Marcar alunos'), findsOneWidget);
      expect(
        find.textContaining('liberaram imagem no perfil (2 de 3)'),
        findsOneWidget,
      );
      // A arte assina com o @ do professor e mostra o plano.
      expect(
          find.text('@prof.thiagomendes\ncom Marina e Elisa',
              findRichText: true),
          findsOneWidget);
    });

    testWidgets('desligar "Marcar alunos" tira a turma e muda a nota',
        (tester) async {
      await pump(tester);
      await tester.tap(find.byKey(const Key('professor-class-closed-share')));
      await tester.pumpAndSettle();
      // Sem plano montado, sem o chip do plano.
      expect(
        find.byKey(const Key('professor-story-info-plan')),
        findsNothing,
      );
      await tester.tap(find.byKey(const Key('professor-story-info-people')));
      await tester.pump();
      expect(find.text('Nenhum aluno é marcado nem aparece no story.'),
          findsOneWidget);
      expect(
          find.textContaining('com Marina', findRichText: true), findsNothing);
    });

    testWidgets('postar marca só presentes que liberaram, com o plano',
        (tester) async {
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        const MethodChannel('dev.fluttercommunity.plus/share'),
        (call) async => 'dev.fluttercommunity.plus/share/unavailable',
      );
      addTearDown(() => tester.binding.defaultBinaryMessenger
          .setMockMethodCallHandler(
              const MethodChannel('dev.fluttercommunity.plus/share'), null));
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            athleteProfileProvider.overrideWith((ref) => Stream.value(thiago)),
            professorClassStoryRepositoryProvider
                .overrideWithValue(repo = _FakeStoryRepo()),
          ],
          child: MaterialApp(
            theme: AppTheme.dark,
            home: ProfessorClassStoryPage(
              roster: roster(),
              plan: const [
                ClassStoryPlanBlock(minutes: 10, label: 'Aquecimento'),
              ],
            ),
          ),
        ),
      );
      await tester.pump();
      await tester.runAsync(() async {
        await tester.tap(find.byKey(const Key('booking-story-post')));
        await Future<void>.delayed(const Duration(milliseconds: 300));
      });
      await tester.pump();
      expect(repo.calls, hasLength(1));
      expect(repo.calls.single.ids, ['m1', 'e1']);
      expect(repo.calls.single.plan.single.label, 'Aquecimento');
      expect(find.text('2 alunos receberam o aviso para repostar.'),
          findsOneWidget);
    });
  });

  group('G3 · aluno marcado', () {
    Future<void> pump(WidgetTester tester, ClassStoryTag? t,
        {ThemeData? theme}) async {
      tester.view.physicalSize = const Size(400, 900);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            classStoryTagRepositoryProvider.overrideWithValue(_FakeTagRepo(t)),
            athleteProfileProvider.overrideWith((ref) => Stream.value(marina)),
          ],
          child: MaterialApp(
            theme: theme ?? AppTheme.dark,
            home: const ClassStoryTagPage(tagId: 's1_uMarina'),
          ),
        ),
      );
      await tester.pump();
      await tester.pump();
    }

    testWidgets('card com o @ do aluno, plano e o convite para repostar',
        (tester) async {
      await pump(tester, tag(), theme: AppTheme.light);
      expect(find.text('Você está no story'), findsOneWidget);
      expect(find.text('PROF. THIAGO MENDES'), findsOneWidget);
      expect(find.byType(ClassStoryCard), findsOneWidget);
      expect(find.textContaining('@marina.bt', findRichText: true),
          findsOneWidget);
      expect(find.text('Saque + devolução cruzada'), findsOneWidget);
      // O professor desligou "Arena e horário".
      expect(
          find.textContaining('Arena CFC', findRichText: true), findsNothing);
      expect(find.textContaining('Thiago postou o treino e marcou você'),
          findsOneWidget);
      expect(find.byKey(const Key('class-story-tag-repost')), findsOneWidget);
      expect(find.byKey(const Key('class-story-tag-dismiss')), findsOneWidget);
    });

    testWidgets('marcação tirada ou doc alheio: aviso, sem card',
        (tester) async {
      await pump(tester, null);
      expect(find.byKey(const Key('class-story-tag-missing')), findsOneWidget);
      expect(find.byType(ClassStoryCard), findsNothing);
    });
  });
}
