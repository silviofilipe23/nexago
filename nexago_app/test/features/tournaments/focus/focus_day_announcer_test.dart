import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/tournaments/domain/athlete_tournament_day_logic.dart';
import 'package:nexago_app/features/tournaments/domain/athlete_tournament_day_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/presentation/focus/focus_day_announcer.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';

class _FakeUser implements User {
  @override
  String get uid => 'u1';

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

TournamentMatch _match() => const TournamentMatch(
      id: 'm1',
      tournamentId: 't1',
      categoryId: 'c1',
      round: 1,
      matchType: 'group',
      poolId: 'A',
      teamAId: 'team-1',
      teamBId: 'team-2',
      status: 'scheduled',
      resultA: '',
      resultB: '',
      isGroupMatch: true,
      matchNumber: 1,
    );

AthleteNextMatch _target() => AthleteNextMatch(
      match: _match(),
      tournamentId: 't1',
      tournamentName: 'Copa Teste',
      isCourtCall: false,
    );

TournamentDetail _tournament() {
  final today = DateTime.now();
  return TournamentDetail(
    id: 't1',
    name: 'Copa Teste',
    location: 'Arena X',
    city: 'Goiânia',
    dateLabel: '',
    startDate: today,
    endDate: today,
    categories: const [TournamentGenderCat.m],
    format: TournamentFormat.dupla,
    priceLabel: r'R$ 90',
    priceValue: 90,
    spotsLeft: 10,
    spotsTotal: 32,
    status: TournamentListingStatus.live,
    featured: false,
    enrolledCount: 0,
    liveMatchesNow: 0,
  );
}

Widget _app({
  Future<AthleteNextMatch?>? nextMatch,
  GlobalKey<NavigatorState>? navigatorKey,
}) {
  return ProviderScope(
    overrides: [
      authProvider.overrideWith((ref) => Stream.value(_FakeUser())),
      athleteNextMatchProvider
          .overrideWith((ref) => nextMatch ?? Future.value(_target())),
      tournamentDetailProvider('t1')
          .overrideWith((ref) => Stream.value(_tournament())),
    ],
    child: MaterialApp(
      navigatorKey: navigatorKey,
      home: FocusDayAnnouncer(
        child: Scaffold(body: const Text('casca do atleta')),
      ),
    ),
  );
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR', null);
  });

  testWidgets('oferece o Focus quando o atleta tem partida hoje',
      (tester) async {
    await tester.pumpWidget(_app());
    await tester.pumpAndSettle();

    expect(find.text('Hoje é dia de torneio.'), findsOneWidget);
    expect(find.text('Entrar no Focus'), findsOneWidget);
  });

  // A casca dispara vários anúncios no mesmo primeiro frame (convite de dupla,
  // feedback de missão diária, promoção de elo). Quem chega primeiro empilha
  // uma rota, e a oferta do Focus cai na guarda de visibilidade — ela tem que
  // ADIAR, não sumir da sessão.
  //
  // O reteste vem do `build`, que refaz a tentativa quando a casca volta a ser
  // a rota corrente. Tirar essa chamada de lá — achando que o `ref.listen`
  // basta — mata a oferta em silêncio; é isso que este teste pega.
  testWidgets('oferta adiada por rota em cima aparece quando ela sai',
      (tester) async {
    final navigatorKey = GlobalKey<NavigatorState>();
    final gate = Completer<AthleteNextMatch?>();

    await tester.pumpWidget(
      _app(nextMatch: gate.future, navigatorKey: navigatorKey),
    );
    await tester.pumpAndSettle();

    unawaited(navigatorKey.currentState!.push<void>(
      MaterialPageRoute<void>(
        builder: (_) => const Scaffold(body: Text('convite de dupla')),
      ),
    ));
    await tester.pumpAndSettle();
    expect(find.text('convite de dupla'), findsOneWidget);

    // O alvo do dia só resolve com a casca fora de cena: nada é aberto por cima
    // do fluxo que o atleta já está seguindo.
    gate.complete(_target());
    await tester.pumpAndSettle();
    expect(
      find.text('Entrar no Focus', skipOffstage: false),
      findsNothing,
      reason: 'a folha não pode abrir por cima da rota em andamento',
    );

    navigatorKey.currentState!.pop();
    await tester.pumpAndSettle();

    expect(find.text('Hoje é dia de torneio.'), findsOneWidget);
    expect(find.text('Entrar no Focus'), findsOneWidget);
  });
}
