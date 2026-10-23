import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete_training/application/athlete_training_providers.dart';
import 'package:nexago_app/features/athlete_training/domain/athlete_training.dart';
import 'package:nexago_app/features/athlete_training/domain/class_review.dart';
import 'package:nexago_app/features/athlete_training/infrastructure/class_presence_repository.dart';
import 'package:nexago_app/features/athlete_training/infrastructure/class_review_repository.dart';
import 'package:nexago_app/features/athlete_training/presentation/athlete_training_review_pages.dart';
import 'package:nexago_app/features/professor_links/application/professor_links_providers.dart';

// "Agora": quarta 21/10/2026 12:00.
final _now = DateTime(2026, 10, 21, 12);

TrainingSession _training({
  required String id,
  required TrainingSource source,
  required TrainingState state,
  required DateTime start,
  String title = 'Intermediário B',
  String professor = 'Juliana Rocha',
  String arena = 'Arena CFC',
  String centerId = '',
  String centerName = '',
}) =>
    TrainingSession(
      id: id,
      source: source,
      title: title,
      professorName: professor,
      dateKey:
          '${start.year}-${start.month.toString().padLeft(2, '0')}-${start.day.toString().padLeft(2, '0')}',
      startTime:
          '${start.hour.toString().padLeft(2, '0')}:${start.minute.toString().padLeft(2, '0')}',
      startAt: start,
      endAt: start.add(const Duration(hours: 1)),
      state: state,
      arenaName: arena,
      centerId: centerId,
      centerName: centerName,
    );

final _arena = _training(
  id: 's1',
  source: TrainingSource.arenaClass,
  state: TrainingState.present,
  start: DateTime(2026, 10, 20, 19),
);
final _center = _training(
  id: 'c1_2026-10-16',
  source: TrainingSource.centerClass,
  state: TrainingState.present,
  start: DateTime(2026, 10, 16, 7),
  title: 'Performance',
  professor: 'Paula Viana',
  arena: 'Sede Barra',
  centerId: 'elv',
  centerName: 'CT Areia Alta',
);
final _private = _training(
  id: 'l1',
  source: TrainingSource.privateLesson,
  state: TrainingState.done,
  start: DateTime(2026, 10, 17, 9),
  title: 'Particular',
  professor: 'Thiago Mendes',
  arena: '',
);
final _absent = _training(
  id: 's0',
  source: TrainingSource.arenaClass,
  state: TrainingState.absent,
  start: DateTime(2026, 10, 19, 19),
);
final _old = _training(
  id: 's-old',
  source: TrainingSource.arenaClass,
  state: TrainingState.present,
  start: DateTime(2026, 10, 10, 19),
);
final _future = _training(
  id: 's-next',
  source: TrainingSource.arenaClass,
  state: TrainingState.present,
  start: DateTime(2026, 10, 22, 19),
);

ClassReview _sent({ReviewTicket? ticket}) => ClassReview(
      id: 'p_l1_aluno',
      key: 'p_l1',
      origin: TrainingOrigin.private,
      date: '2026-10-17',
      startTime: '09:00',
      title: 'Particular',
      professorName: 'Thiago Mendes',
      placeName: '',
      scores: const {ReviewPart.professor: PartScore(stars: 5)},
      ticket: ticket,
      editableUntil: _now.add(const Duration(days: 3)),
    );

class _FakeRepo implements ClassReviewRepository {
  final drafts = <ClassReviewDraft>[];
  bool ticket = false;
  String? fail;

  @override
  Future<bool> submit(ClassReviewDraft draft) async {
    if (fail != null) throw ClassPresenceException(fail!);
    drafts.add(draft);
    return ticket;
  }

  @override
  Stream<List<ClassReview>> watchMine(String uid) => Stream.value(const []);
}

void main() {
  group('domínio', () {
    test('chave igual à do servidor', () {
      expect(classReviewKey(_arena), 'a_s1');
      expect(classReviewKey(_center), 'ct_elv_c1_2026-10-16');
      expect(classReviewKey(_private), 'p_l1');
    });

    test('pendentes: com presença, já terminado, dentro de 7 dias, sem avaliação',
        () {
      final p = pendingClassReviews(
        [_arena, _center, _private, _absent, _old, _future],
        [_sent()],
        _now,
      );
      // Particular já avaliada; falta, velha (> 7 dias) e futura não entram.
      expect(p.map((x) => x.key), ['a_s1', 'ct_elv_c1_2026-10-16']);
      expect(reviewExpiryLabel(p.last.expiresAt, _now), '1 dia');
    });

    test('partes por origem e tags por nota', () {
      expect(reviewPartsFor(TrainingOrigin.private), [ReviewPart.professor]);
      expect(reviewPartsFor(TrainingOrigin.arena).length, 3);
      expect(reviewTagsFor(ReviewPart.place, 2), contains('Iluminação'));
      expect(reviewTagsFor(ReviewPart.place, 5), contains('Quadra boa'));
      expect(reviewTagsFor(ReviewPart.place, 0), isEmpty);
    });

    test('trocar de lado da nota limpa as tags', () {
      const s = PartScore(stars: 5, tags: ['Pontual']);
      expect(s.withStars(4).tags, ['Pontual']);
      expect(s.withStars(2).tags, isEmpty);
      expect(s.toggle('Pontual').tags, isEmpty);
      expect(s.toggle('Motivador').tags, ['Pontual', 'Motivador']);
    });

    test('lê a avaliação do Firestore, com chamado respondido', () {
      final r = ClassReview.fromMap('a_s1_aluno', {
        'key': 'a_s1',
        'origin': 'arena',
        'date': '2026-10-20',
        'title': 'Intermediário B',
        'professorName': 'Juliana Rocha',
        'placeName': 'Arena CFC',
        'scores': {
          'class': {'stars': 3, 'tags': ['Turma cheia']},
          'professor': {'stars': 5, 'tags': []},
          'place': {'stars': 2, 'tags': ['Iluminação']},
        },
        'ticket': {
          'status': 'resolved',
          'reply': 'Refletores trocados.',
          'repliedAt': Timestamp.fromDate(_now),
        },
        'editableUntil': Timestamp.fromDate(_now.add(const Duration(days: 1))),
      });
      expect(r.scores[ReviewPart.place]!.isLow, isTrue);
      expect(r.ticket!.reply, 'Refletores trocados.');
      expect(r.canEdit(_now), isTrue);
    });

    test('rascunho da callable por origem', () {
      final d = ClassReviewDraft(
        training: _center,
        scores: const {
          ReviewPart.lesson: PartScore(stars: 4),
          ReviewPart.professor: PartScore(stars: 5),
          ReviewPart.place: PartScore(stars: 4),
        },
      ).toCallable();
      expect(d['origin'], 'center');
      expect(d['centerId'], 'elv');
      expect(d['sessionId'], 'c1_2026-10-16');
      expect((d['scores']! as Map).keys, ['class', 'professor', 'place']);
      final p = ClassReviewDraft(
        training: _private,
        scores: const {ReviewPart.professor: PartScore(stars: 5)},
      ).toCallable();
      expect(p['lessonId'], 'l1');
      expect(p.containsKey('sessionId'), isFalse);
    });
  });

  Future<(GoRouter, _FakeRepo)> pump(
    WidgetTester tester,
    String location, {
    List<ClassReview> reviews = const [],
    _FakeRepo? repo,
  }) async {
    tester.view.physicalSize = const Size(400, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final fake = repo ?? _FakeRepo();
    final router = GoRouter(
      initialLocation: location,
      routes: [
        GoRoute(
          path: AppRoutes.athleteTrainings,
          name: AppRouteNames.athleteTrainings,
          builder: (_, __) => const Scaffold(body: Text('hub')),
        ),
        GoRoute(
          path: AppRoutes.athleteTrainingReviewStart,
          name: AppRouteNames.athleteTrainingReviewStart,
          builder: (_, __) => const AthleteTrainingReviewStartPage(),
        ),
        GoRoute(
          path: AppRoutes.athleteTrainingReview,
          name: AppRouteNames.athleteTrainingReview,
          builder: (_, s) => AthleteTrainingReviewPage(
            reviewKey: s.pathParameters['key']!,
            initialStars: int.tryParse(s.uri.queryParameters['n'] ?? '') ?? 0,
          ),
        ),
        GoRoute(
          path: AppRoutes.athleteTrainingReviews,
          name: AppRouteNames.athleteTrainingReviews,
          builder: (_, __) => const AthleteTrainingReviewsPage(),
        ),
      ],
    );
    addTearDown(router.dispose);
    await tester.pumpWidget(ProviderScope(
      overrides: [
        professorLinksClockProvider.overrideWithValue(() => _now),
        athleteTrainingsProvider
            .overrideWith((ref) => [_arena, _center, _private, _absent]),
        myClassReviewsProvider.overrideWith((ref) => Stream.value(reviews)),
        classReviewRepositoryProvider.overrideWithValue(fake),
      ],
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ));
    await settle(tester);
    return (router, fake);
  }

  testWidgets('A1 · estrelas rápidas levam ao formulário com a nota',
      (tester) async {
    final (router, _) = await pump(tester, AppRoutes.athleteTrainingReviewStart);
    expect(find.text('Treino concluído'), findsOneWidget);
    expect(find.text('TAMBÉM ESPERANDO AVALIAÇÃO'), findsOneWidget);
    expect(find.byKey(const Key('review-pending-p_l1')), findsOneWidget);
    await tester.tap(find.byKey(const Key('review-start-star-4')));
    await settle(tester);
    expect(find.text('Boa · toque para detalhar'), findsOneWidget);
    await tester.tap(find.byKey(const Key('review-start-continue')));
    await settle(tester);
    expect(router.state.uri.toString(), '/treinos/avaliar/a_s1?n=4');
    // A nota do A1 já vem marcada na aula.
    expect(find.text('Boa'), findsOneWidget);
    expect(find.text('Falta avaliar 2'), findsOneWidget);
  });

  testWidgets('A2/A5 · arena: três partes, nota baixa pede retorno e envia',
      (tester) async {
    final repo = _FakeRepo()..ticket = true;
    await pump(tester, '/treinos/avaliar/a_s1', repo: repo);
    expect(find.byKey(const Key('review-part-class')), findsOneWidget);
    expect(find.byKey(const Key('review-part-professor')), findsOneWidget);
    expect(find.byKey(const Key('review-part-place')), findsOneWidget);
    final send = find.byKey(const Key('review-send'));
    expect(
      tester.widget<FilledButton>(
        find.descendant(of: send, matching: find.byType(FilledButton)),
      ).onPressed,
      isNull,
    );

    await tester.tap(find.byKey(const Key('review-star-class-3')));
    await tester.tap(find.byKey(const Key('review-star-professor-5')));
    await tester.tap(find.byKey(const Key('review-star-place-2')));
    await settle(tester);
    expect(find.byKey(const Key('review-contact')), findsOneWidget);
    await tester.tap(find.byKey(const Key('review-tag-Iluminação')));
    await tester.enterText(
      find.byKey(const Key('review-comment')),
      'Refletores apagados.',
    );
    await settle(tester);
    await tester.tap(send);
    await settle(tester);

    final d = repo.drafts.single;
    expect(d.wantsContact, isTrue);
    expect(d.scores[ReviewPart.place]!.tags, ['Iluminação']);
    expect(d.toCallable()['comment'], 'Refletores apagados.');
    // A6
    expect(find.byKey(const Key('review-sent')), findsOneWidget);
    expect(find.textContaining('recebeu seu pedido de retorno'), findsOneWidget);
    expect(find.text('QUEM VÊ'), findsOneWidget);
    expect(find.byKey(const Key('review-next')), findsOneWidget);
  });

  testWidgets('A4 · particular só avalia o professor; sem pedido de retorno',
      (tester) async {
    final repo = _FakeRepo();
    await pump(tester, '/treinos/avaliar/p_l1', repo: repo);
    expect(find.byKey(const Key('review-part-class')), findsNothing);
    expect(find.byKey(const Key('review-part-place')), findsNothing);
    await tester.tap(find.byKey(const Key('review-star-professor-1')));
    await settle(tester);
    expect(find.byKey(const Key('review-contact')), findsNothing);
    await tester.tap(find.byKey(const Key('review-show-name')).first);
    await tester.tap(find.descendant(
      of: find.byKey(const Key('review-show-name')),
      matching: find.byType(Switch),
    ));
    await settle(tester);
    await tester.tap(find.byKey(const Key('review-send')));
    await settle(tester);
    expect(repo.drafts.single.showName, isFalse);
    expect(repo.drafts.single.wantsContact, isFalse);
  });

  testWidgets('erro do servidor aparece no formulário', (tester) async {
    final repo = _FakeRepo()..fail = 'O prazo para avaliar este treino acabou.';
    await pump(tester, '/treinos/avaliar/p_l1', repo: repo);
    await tester.tap(find.byKey(const Key('review-star-professor-5')));
    await settle(tester);
    await tester.tap(find.byKey(const Key('review-send')));
    await settle(tester);
    expect(find.text('O prazo para avaliar este treino acabou.'), findsOneWidget);
    expect(find.byKey(const Key('review-sent')), findsNothing);
  });

  testWidgets('treino fora da janela: aviso em vez do formulário',
      (tester) async {
    await pump(tester, '/treinos/avaliar/a_nada');
    expect(find.byKey(const Key('review-not-found')), findsOneWidget);
  });

  testWidgets('A7 · pendentes e enviadas, com a resposta da gestão',
      (tester) async {
    await pump(
      tester,
      AppRoutes.athleteTrainingReviews,
      reviews: [
        _sent(
          ticket: const ReviewTicket(
            status: 'resolved',
            reply: 'Ajustamos o horário.',
          ),
        ),
      ],
    );
    expect(find.text('2 PENDENTES · 1 ENVIADA'), findsOneWidget);
    expect(find.byKey(const Key('review-pending-a_s1')), findsOneWidget);
    expect(find.byKey(const Key('review-pending-p_l1')), findsNothing);
    expect(find.byKey(const Key('review-sent-p_l1')), findsOneWidget);
    expect(find.text('Ajustamos o horário.'), findsOneWidget);
    expect(find.text('RESOLVIDO'), findsOneWidget);
  });
}

Future<void> settle(WidgetTester tester) async {
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 60));
  }
}
