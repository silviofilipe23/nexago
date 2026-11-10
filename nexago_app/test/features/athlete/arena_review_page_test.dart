import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/domain/my_bookings_providers.dart';
import 'package:nexago_app/features/arenas/presentation/my_bookings/widgets/my_bookings_review_prompt_card.dart';
import 'package:nexago_app/features/athlete/data/arena_review_service.dart';
import 'package:nexago_app/features/athlete/domain/arena_review.dart';
import 'package:nexago_app/features/athlete/domain/arena_review_providers.dart';
import 'package:nexago_app/features/athlete/presentation/arena_review_page.dart';

class _FakeReviewService implements ArenaReviewService {
  final calls = <Map<String, Object?>>[];

  @override
  Future<void> submitArenaReview({
    required String arenaId,
    required String bookingId,
    required String userId,
    required int rating,
    String? comment,
  }) async {
    calls.add({
      'arenaId': arenaId,
      'bookingId': bookingId,
      'userId': userId,
      'rating': rating,
      'comment': comment,
    });
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

const _target = PendingArenaReview(
  bookingId: 'b1',
  arenaId: 'a1',
  arenaName: 'Arena CFC',
  courtName: 'Quadra 4',
  dateRaw: '2026-11-10',
  startTime: '19:00',
  endTime: '20:00',
);

void main() {
  testWidgets('envia nota, destaques e comentário e volta para Minhas reservas',
      (tester) async {
    final service = _FakeReviewService();
    final user = MockUser(uid: 'uid1');
    late ProviderContainer container;
    final router = GoRouter(
      initialLocation: '/review',
      routes: [
        GoRoute(
          path: '/review',
          builder: (_, __) =>
              const Scaffold(body: ArenaReviewForm(target: _target)),
        ),
        GoRoute(
            path: '/my-bookings',
            builder: (_, __) => const Text('minhas reservas')),
      ],
    );

    await tester.binding.setSurfaceSize(const Size(400, 1200));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authProvider.overrideWith((ref) => Stream.value(user)),
          arenaReviewServiceProvider.overrideWithValue(service),
          myBookingsStreamProvider
              .overrideWith((ref) => Stream.value(const [])),
        ],
        child: Consumer(
          builder: (context, ref, _) {
            container = ProviderScope.containerOf(context);
            return MaterialApp.router(
                theme: AppTheme.dark, routerConfig: router);
          },
        ),
      ),
    );
    await tester.pumpAndSettle();

    // Sem nota: avisa e não envia.
    await tester.tap(find.byKey(const ValueKey('arena-review-submit')));
    await tester.pump();
    expect(find.text('Toque nas estrelas para dar sua nota.'), findsOneWidget);
    expect(service.calls, isEmpty);

    await tester.tap(find.byKey(const ValueKey('arena-review-star-4')));
    await tester.pumpAndSettle();
    expect(find.text('Bom'), findsOneWidget);

    await tester.tap(find.text('Vestiário'));
    await tester.tap(find.byKey(const ValueKey('arena-review-comment-toggle')));
    await tester.pumpAndSettle();
    await tester.enterText(
        find.byKey(const ValueKey('arena-review-comment')), 'Rede baixa');

    // O aviso anterior ainda flutua sobre a barra do CTA.
    tester
        .state<ScaffoldMessengerState>(find.byType(ScaffoldMessenger))
        .removeCurrentSnackBar();
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('arena-review-submit')));
    await tester.pumpAndSettle();

    expect(service.calls.single, {
      'arenaId': 'a1',
      'bookingId': 'b1',
      'userId': 'uid1',
      'rating': 4,
      'comment': 'Destaques: Vestiário\nRede baixa',
    });
    expect(container.read(locallyReviewedBookingsProvider), contains('b1'));
    expect(find.text('minhas reservas'), findsOneWidget);
  });

  testWidgets('convite de Minhas reservas: avaliar e dispensar',
      (tester) async {
    var opened = 0;
    var dismissed = 0;
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: MyBookingsReviewPromptView(
            pending: _target,
            onReview: () => opened++,
            onDismiss: () => dismissed++,
          ),
        ),
      ),
    );

    expect(find.text('Como foi o jogo na Arena CFC?'), findsOneWidget);
    expect(find.text('Quadra 4 · 19:00 – 20:00'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('my-bookings-review-open')));
    await tester.tap(find.byKey(const ValueKey('my-bookings-review-dismiss')));
    expect(opened, 1);
    expect(dismissed, 1);
  });
}
