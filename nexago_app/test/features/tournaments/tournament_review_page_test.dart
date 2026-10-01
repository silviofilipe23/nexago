import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/tournaments/data/tournament_review_service.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_review_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_review_providers.dart';
import 'package:nexago_app/features/tournaments/presentation/tournament_review_page.dart';

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  TournamentReviewInvite invite({
    TournamentReviewInviteStatus status = TournamentReviewInviteStatus.pending,
    DateTime? closesAt,
  }) =>
      TournamentReviewInvite(
        tournamentId: 't1',
        tournamentName: 'Copa Areia',
        closesAt: closesAt ?? DateTime.now().add(const Duration(days: 5)),
        status: status,
      );

  Future<void> pumpPage(
    WidgetTester tester, {
    required TournamentReviewInvite? invite,
    MyTournamentReview? existing,
    Future<MyTournamentReview?> Function()? existingFuture,
    required _FakeReviewService service,
    bool settle = true,
  }) async {
    final router = GoRouter(
      initialLocation: '/torneios/t1/avaliar',
      routes: [
        GoRoute(
          path: '/torneios/:tournamentId',
          name: AppRouteNames.tournamentDetail,
          builder: (_, __) => const Scaffold(body: Text('detalhe do torneio')),
          routes: [
            GoRoute(
              path: 'avaliar',
              name: AppRouteNames.tournamentReview,
              builder: (_, state) => TournamentReviewPage(
                tournamentId: state.pathParameters['tournamentId']!,
              ),
            ),
          ],
        ),
      ],
    );
    addTearDown(router.dispose);
    await tester.pumpWidget(ProviderScope(
      overrides: [
        tournamentReviewInviteProvider('t1').overrideWith((ref) => Stream.value(invite)),
        myTournamentReviewProvider('t1').overrideWith(
            (ref) => existingFuture != null ? existingFuture() : Future.value(existing)),
        tournamentReviewServiceProvider.overrideWithValue(service),
      ],
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ));
    if (settle) {
      await tester.pumpAndSettle();
    } else {
      await tester.pump();
      await tester.pump();
    }
  }

  Future<void> tapKey(WidgetTester tester, String key) async {
    final finder = find.byKey(ValueKey(key));
    await tester.ensureVisible(finder);
    await tester.tap(finder);
    await tester.pumpAndSettle();
  }

  testWidgets('sem nota geral o botão não envia', (tester) async {
    await pumpPage(tester, invite: invite(), service: _FakeReviewService());
    expect(find.text('Como foi o torneio Copa Areia?'), findsOneWidget);
    final button = tester.widget<FilledButton>(find.byKey(const ValueKey('review-submit')));
    expect(button.onPressed, isNull);
  });

  testWidgets('envia nota, aspecto e comentário e volta pro torneio com o XP', (tester) async {
    final service = _FakeReviewService();
    await pumpPage(tester, invite: invite(), service: service);

    await tapKey(tester, 'overall-4');
    expect(find.text('Bom'), findsOneWidget);
    await tapKey(tester, 'schedule-2');
    await tester.ensureVisible(find.byType(TextField));
    await tester.enterText(find.byType(TextField), 'Atrasou');
    await tapKey(tester, 'review-submit');

    expect(service.submits.single.overall, 4);
    expect(service.submits.single.aspects, {TournamentReviewAspect.schedule: 2});
    expect(service.submits.single.comment, 'Atrasou');
    expect(find.text('Obrigado! +10 XP'), findsOneWidget);
    expect(find.text('detalhe do torneio'), findsOneWidget);
  });

  testWidgets('tocar de novo na mesma estrela do aspecto limpa a nota', (tester) async {
    final service = _FakeReviewService();
    await pumpPage(tester, invite: invite(), service: service);

    await tapKey(tester, 'overall-5');
    await tapKey(tester, 'venue-3');
    await tapKey(tester, 'venue-3');
    await tapKey(tester, 'review-submit');

    expect(service.submits.single.aspects, isEmpty);
  });

  testWidgets('edição chega preenchida e o sucesso diz Avaliação atualizada.', (tester) async {
    final service = _FakeReviewService()..created = false;
    await pumpPage(
      tester,
      invite: invite(status: TournamentReviewInviteStatus.submitted),
      existing: const MyTournamentReview(
        overall: 3,
        aspects: {TournamentReviewAspect.venue: 2},
        comment: 'Bom torneio',
      ),
      service: service,
    );

    expect(find.text('Salvar alterações'), findsOneWidget);
    expect(find.text('Ok'), findsOneWidget);
    expect(find.text('Bom torneio'), findsOneWidget);
    await tapKey(tester, 'review-submit');

    expect(service.submits.single.overall, 3);
    expect(service.submits.single.aspects, {TournamentReviewAspect.venue: 2});
    expect(find.text('Avaliação atualizada.'), findsOneWidget);
  });

  testWidgets('edição: enquanto a avaliação salva carrega, não há formulário para salvar por cima', (tester) async {
    await pumpPage(
      tester,
      invite: invite(status: TournamentReviewInviteStatus.submitted),
      existingFuture: () => Completer<MyTournamentReview?>().future,
      service: _FakeReviewService(),
      settle: false,
    );
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(find.byKey(const ValueKey('review-submit')), findsNothing);
  });

  testWidgets('edição: se a avaliação salva não carrega, avisa e oferece tentar de novo', (tester) async {
    await pumpPage(
      tester,
      invite: invite(status: TournamentReviewInviteStatus.submitted),
      existingFuture: () => Future<MyTournamentReview?>.error(Exception('rede')),
      service: _FakeReviewService(),
    );
    expect(find.text('Não foi possível carregar sua avaliação.'), findsOneWidget);
    expect(find.text('Tentar novamente'), findsOneWidget);
    expect(find.byKey(const ValueKey('review-submit')), findsNothing);
  });

  testWidgets('edição: tirar um aspecto pré-preenchido some do envio', (tester) async {
    final service = _FakeReviewService()..created = false;
    await pumpPage(
      tester,
      invite: invite(status: TournamentReviewInviteStatus.submitted),
      existing: const MyTournamentReview(
        overall: 4,
        aspects: {TournamentReviewAspect.venue: 2, TournamentReviewAspect.schedule: 5},
      ),
      service: service,
    );
    await tapKey(tester, 'venue-2');
    await tapKey(tester, 'review-submit');
    expect(service.submits.single.aspects, {TournamentReviewAspect.schedule: 5});
  });

  testWidgets('convite vencido (ainda pending) mostra encerrada e nenhum formulário', (tester) async {
    await pumpPage(
      tester,
      invite: invite(closesAt: DateTime(2025, 10, 15, 10)),
      service: _FakeReviewService(),
    );
    expect(find.text('Avaliação encerrada em 15/10'), findsOneWidget);
    expect(find.byKey(const ValueKey('review-submit')), findsNothing);
  });

  testWidgets('sem convite explica que só quem jogou avalia', (tester) async {
    await pumpPage(tester, invite: null, service: _FakeReviewService());
    expect(find.text('Nada para avaliar aqui'), findsOneWidget);
  });

  testWidgets('erro do servidor aparece e o formulário continua', (tester) async {
    final service = _FakeReviewService()
      ..error = const TournamentReviewException('A avaliação deste torneio foi encerrada.');
    await pumpPage(tester, invite: invite(), service: service);

    await tapKey(tester, 'overall-2');
    await tapKey(tester, 'review-submit');

    expect(find.text('A avaliação deste torneio foi encerrada.'), findsOneWidget);
    expect(find.byKey(const ValueKey('review-submit')), findsOneWidget);
  });
}

class _FakeReviewService implements TournamentReviewService {
  final submits = <({int overall, Map<TournamentReviewAspect, int> aspects, String? comment})>[];
  bool created = true;
  Object? error;

  @override
  Future<bool> submit({
    required String tournamentId,
    required int overall,
    required Map<TournamentReviewAspect, int> aspects,
    String? comment,
  }) async {
    submits.add((overall: overall, aspects: aspects, comment: comment));
    final failure = error;
    if (failure != null) throw failure;
    return created;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('O dublê não implementa ${invocation.memberName}.');
}
