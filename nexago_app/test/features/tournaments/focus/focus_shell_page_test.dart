import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/tournaments/data/tournament_inscriptions_repository.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_providers.dart';
import 'package:nexago_app/features/tournaments/presentation/focus/focus_shell_page.dart';

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

Widget _app() {
  return ProviderScope(
    overrides: [
      tournamentDetailProvider('t1')
          .overrideWith((ref) => Stream.value(_tournament())),
      tournamentMatchCardsProvider('t1')
          .overrideWith((ref) => Stream.value(const [])),
      tournamentUserTeamIdsByCategoryProvider('t1')
          .overrideWith((ref) => Stream.value(const {})),
    ],
    child: const MaterialApp(
      home: FocusShellPage(tournamentId: 't1'),
    ),
  );
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR', null);
  });

  testWidgets('mostra as quatro seções e o botão de sair', (tester) async {
    await tester.pumpWidget(_app());
    await tester.pumpAndSettle();

    expect(find.text('Agora'), findsOneWidget);
    expect(find.text('Trajetória'), findsOneWidget);
    expect(find.text('Grupo'), findsOneWidget);
    expect(find.text('Chave'), findsOneWidget);
    expect(find.byIcon(Icons.close_rounded), findsOneWidget);
  });

  testWidgets('trocar de seção mantém a casca e as quatro abas',
      (tester) async {
    await tester.pumpWidget(_app());
    await tester.pumpAndSettle();

    await tester.tap(find.text('Trajetória'));
    await tester.pumpAndSettle();

    // A casca não é substituída: as abas e o × seguem lá.
    expect(find.text('Agora'), findsOneWidget);
    expect(find.byIcon(Icons.close_rounded), findsOneWidget);
  });

  testWidgets('sem categoria em foco, Grupo e Chave explicam em vez de vazar',
      (tester) async {
    await tester.pumpWidget(_app());
    await tester.pumpAndSettle();

    await tester.tap(find.text('Grupo'));
    await tester.pumpAndSettle();

    expect(find.textContaining('o grupo e a chave dela'), findsWidgets);
  });
}
