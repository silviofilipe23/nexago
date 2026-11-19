import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/domain/my_bookings_providers.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/agenda/agenda_review_prompt_card.dart';
import 'package:nexago_app/features/athlete/data/arena_review_prompt_store.dart';
import 'package:nexago_app/features/athlete/data/arena_review_service.dart';
import 'package:nexago_app/features/athlete/domain/arena_review.dart';
import 'package:nexago_app/features/athlete/domain/arena_review_providers.dart';
import 'package:nexago_app/features/athlete/presentation/arena_review_page.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/arena_review/arena_review_widgets.dart';

class _FakeReviewService implements ArenaReviewService {
  final calls = <Map<String, Object?>>[];

  @override
  Future<void> submitArenaReview({
    required String arenaId,
    required String bookingId,
    required String userId,
    required int rating,
    String? comment,
    List<String> tags = const [],
    bool? onTime,
  }) async {
    calls.add({
      'arenaId': arenaId,
      'bookingId': bookingId,
      'userId': userId,
      'rating': rating,
      'comment': comment,
      'tags': tags,
      'onTime': onTime,
    });
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakePromptStore implements ArenaReviewPromptStore {
  final dismissedIds = <String, Set<String>>{};

  @override
  Future<Set<String>> dismissed(String uid) async => {...?dismissedIds[uid]};

  @override
  Future<void> dismiss(String uid, String bookingId) async =>
      (dismissedIds[uid] ??= {}).add(bookingId);
}

const _target = PendingArenaReview(
  bookingId: 'b1',
  arenaId: 'a1',
  arenaName: 'Arena CFC',
  courtName: 'Quadra 4',
  courtId: 'c4',
  sport: 'beach_tennis',
  dateRaw: '2026-11-10',
  startTime: '19:00',
  endTime: '20:00',
);

GoRouter _router(Widget review) => GoRouter(
      initialLocation: '/review',
      routes: [
        GoRoute(path: '/review', builder: (_, __) => review),
        GoRoute(
          path: AppRoutes.discover,
          name: AppRouteNames.discover,
          builder: (_, state) =>
              Text('agenda ${state.uri.queryParameters['tab']}'),
        ),
        GoRoute(
          path: AppRoutes.bookingArenaReview,
          name: AppRouteNames.bookingArenaReview,
          builder: (_, state) => Text(
            'review ${state.pathParameters['bookingId']} '
            '${parseArenaReviewRatingQuery(state.uri.queryParameters[arenaReviewRatingQuery])}',
          ),
        ),
        GoRoute(
          path: AppRoutes.arenaSlots,
          name: AppRouteNames.arenaSlots,
          builder: (_, state) => Text(
            'slots ${state.pathParameters['arenaId']} '
            '${state.uri.queryParameters['courtId']} '
            '${state.uri.queryParameters['startTime']} '
            '${state.uri.queryParameters['esporte']}',
          ),
        ),
      ],
    );

Future<ProviderContainer> _pump(
  WidgetTester tester, {
  required Widget review,
  required _FakeReviewService service,
  List<Override> overrides = const [],
}) async {
  late ProviderContainer container;
  await tester.binding.setSurfaceSize(const Size(400, 1400));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authProvider.overrideWith((ref) => Stream.value(MockUser(uid: 'uid1'))),
        arenaReviewServiceProvider.overrideWithValue(service),
        myBookingsStreamProvider.overrideWith((ref) => Stream.value(const [])),
        ...overrides,
      ],
      child: Consumer(
        builder: (context, ref, _) {
          container = ProviderScope.containerOf(context);
          return MaterialApp.router(
            theme: AppTheme.dark,
            routerConfig: _router(review),
          );
        },
      ),
    ),
  );
  await tester.pumpAndSettle();
  return container;
}

Future<void> _tapSubmit(WidgetTester tester) async {
  await tester.ensureVisible(find.byKey(const ValueKey('arena-review-submit')));
  await tester.tap(find.byKey(const ValueKey('arena-review-submit')));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('sem nota o botão fica desligado e as opções não aparecem',
      (tester) async {
    final service = _FakeReviewService();
    await _pump(
      tester,
      review: const Scaffold(body: ArenaReviewForm(target: _target)),
      service: service,
    );

    expect(find.text('Escolha uma nota'), findsOneWidget);
    final button = tester.widget<FilledButton>(
        find.byKey(const ValueKey('arena-review-submit')));
    expect(button.onPressed, isNull);
    expect(find.byKey(const ValueKey('arena-review-tags-title')), findsNothing);
    expect(find.text('Como foi jogar na Arena CFC?'), findsOneWidget);
  });

  testWidgets(
      'nota 4: destaques, pontualidade e comentário viram dado e texto; '
      'sucesso oferece jogar de novo', (tester) async {
    final service = _FakeReviewService();
    final container = await _pump(
      tester,
      review: const Scaffold(body: ArenaReviewForm(target: _target)),
      service: service,
    );

    await tester.tap(find.byKey(const ValueKey('arena-review-star-4')));
    await tester.pumpAndSettle();
    expect(find.text('Bom'), findsOneWidget);
    expect(find.text('O QUE SE DESTACOU? · OPCIONAL'), findsOneWidget);

    await tester.tap(find.text('Vestiário'));
    await tester.tap(find.byKey(const ValueKey('arena-review-on-time-yes')));
    await tester.tap(find.byKey(const ValueKey('arena-review-comment-toggle')));
    await tester.pumpAndSettle();
    await tester.enterText(
        find.byKey(const ValueKey('arena-review-comment')), 'Rede baixa');
    await _tapSubmit(tester);

    expect(service.calls.single, {
      'arenaId': 'a1',
      'bookingId': 'b1',
      'userId': 'uid1',
      'rating': 4,
      'comment': 'Destaques: Vestiário\nRede baixa',
      'tags': ['Vestiário'],
      'onTime': true,
    });
    expect(container.read(locallyReviewedBookingsProvider), contains('b1'));

    expect(find.byKey(const ValueKey('arena-review-success')), findsOneWidget);
    expect(find.text('Avaliação enviada'), findsOneWidget);
    expect(find.byKey(const ValueKey('arena-review-rebook')), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('arena-review-rebook-open')));
    await tester.pumpAndSettle();
    expect(find.text('slots a1 c4 19:00 beach_tennis'), findsOneWidget);
  });

  testWidgets(
      'nota baixa troca elogios por "o que melhorar" e não oferece jogar de '
      'novo', (tester) async {
    final service = _FakeReviewService();
    await _pump(
      tester,
      review: const Scaffold(body: ArenaReviewForm(target: _target)),
      service: service,
    );

    await tester.tap(find.byKey(const ValueKey('arena-review-star-5')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Areia fofa e limpa'));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('arena-review-star-2')));
    await tester.pumpAndSettle();
    expect(find.text('O QUE PODE MELHORAR? · OPCIONAL'), findsOneWidget);
    expect(find.text('Areia fofa e limpa'), findsNothing);

    await tester.tap(find.text('Iluminação fraca'));
    await tester.tap(find.byKey(const ValueKey('arena-review-on-time-late')));
    await tester.pumpAndSettle();
    await _tapSubmit(tester);

    final call = service.calls.single;
    expect(call['rating'], 2);
    expect(call['tags'], ['Iluminação fraca']);
    expect(call['onTime'], false);
    expect(call['comment'], 'A melhorar: Iluminação fraca');

    expect(find.byKey(const ValueKey('arena-review-rebook')), findsNothing);
    await tester.tap(find.byKey(const ValueKey('arena-review-back')));
    await tester.pumpAndSettle();
    expect(find.text('agenda agenda'), findsOneWidget);
  });

  testWidgets('nota tocada no cartão da Agenda já chega marcada',
      (tester) async {
    await _pump(
      tester,
      review: const Scaffold(
        body: ArenaReviewForm(target: _target, initialRating: 5),
      ),
      service: _FakeReviewService(),
    );

    expect(find.text('Excelente'), findsOneWidget);
    final button = tester.widget<FilledButton>(
        find.byKey(const ValueKey('arena-review-submit')));
    expect(button.onPressed, isNotNull);
  });

  testWidgets(
      'na página, enviar mantém o "Avaliação enviada" em vez do "já avaliou"',
      (tester) async {
    await _pump(
      tester,
      review: const ArenaReviewPage(bookingId: 'b1'),
      service: _FakeReviewService(),
      overrides: [
        arenaReviewTargetProvider.overrideWith((ref, id) async => _target),
        arenaBookingReviewStatusProvider.overrideWith(
          (ref, id) async =>
              ref.watch(locallyReviewedBookingsProvider).contains(id)
                  ? ArenaBookingReviewStatus.reviewed
                  : ArenaBookingReviewStatus.notReviewed,
        ),
      ],
    );

    expect(find.text('Avaliar a arena'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('arena-review-star-3')));
    await tester.pumpAndSettle();
    await _tapSubmit(tester);

    expect(find.text('Avaliação enviada'), findsOneWidget);
    expect(find.text('Você já avaliou esta reserva'), findsNothing);
  });

  testWidgets('cabe em tela de 320 pt, do formulário ao sucesso',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(320, 640));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authProvider
              .overrideWith((ref) => Stream.value(MockUser(uid: 'uid1'))),
          arenaReviewServiceProvider.overrideWithValue(_FakeReviewService()),
          myBookingsStreamProvider
              .overrideWith((ref) => Stream.value(const [])),
        ],
        child: MaterialApp.router(
          theme: AppTheme.dark,
          routerConfig: _router(
            const Scaffold(
              body: ArenaReviewForm(target: _target, initialRating: 5),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);

    await _tapSubmit(tester);
    expect(find.byKey(const ValueKey('arena-review-rebook')), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  test('a nota da query só vale de 1 a 5', () {
    expect(parseArenaReviewRatingQuery('4'), 4);
    expect(parseArenaReviewRatingQuery('0'), isNull);
    expect(parseArenaReviewRatingQuery('9'), isNull);
    expect(parseArenaReviewRatingQuery('x'), isNull);
    expect(parseArenaReviewRatingQuery(null), isNull);
  });

  testWidgets('convite da Agenda: estrela abre com a nota, fechar dispensa',
      (tester) async {
    final rated = <int>[];
    var dismissed = 0;
    await tester.binding.setSurfaceSize(const Size(375, 800));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: AgendaReviewPromptView(
              pending: _target,
              onRate: rated.add,
              onDismiss: () => dismissed++,
            ),
          ),
        ),
      ),
    );

    expect(find.text('Como foi jogar na Arena CFC?'), findsOneWidget);
    expect(find.text('Quadra 4 · 19:00 – 20:00'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('agenda-review-star-5')));
    await tester.tap(find.byKey(const ValueKey('agenda-review-dismiss')));
    expect(rated, [5]);
    expect(dismissed, 1);
    expect(find.byTooltip('Agora não'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'cartão real: estrela abre a tela com ?nota= e "Agora não" grava no '
      'aparelho', (tester) async {
    final store = _FakePromptStore();
    final container = await _pump(
      tester,
      review: const Scaffold(body: AgendaReviewPromptCard()),
      service: _FakeReviewService(),
      overrides: [
        pendingReviewProvider.overrideWith((ref) async => _target),
        arenaReviewPromptStoreProvider.overrideWithValue(store),
      ],
    );

    // No app o login está sempre escutado (shell, Agenda); aqui, só o cartão.
    container.listen(authProvider, (_, __) {});
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('agenda-review-dismiss')));
    await tester.pumpAndSettle();
    expect(store.dismissedIds['uid1'], {'b1'});
    expect(container.read(dismissedArenaReviewsProvider), contains('b1'));

    await tester.tap(find.byKey(const ValueKey('agenda-review-star-3')));
    await tester.pumpAndSettle();
    expect(find.text('review b1 3'), findsOneWidget);
  });
}
