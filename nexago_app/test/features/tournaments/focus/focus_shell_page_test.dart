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

  testWidgets('nav inferior traz as três seções e o cabeçalho tem o ×',
      (tester) async {
    await tester.pumpWidget(_app());
    await tester.pumpAndSettle();

    // Rótulos em caixa alta: é o `uppercaseLabels` da nav do app.
    expect(find.text('AGORA'), findsOneWidget);
    expect(find.text('TRAJETÓRIA'), findsOneWidget);
    // Sem formato de dupla eliminação resolvido, a terceira aba é o Grupo.
    expect(find.text('GRUPO'), findsOneWidget);
    expect(find.text('CHAVE'), findsNothing);
    expect(find.byIcon(Icons.close_rounded), findsOneWidget);
    expect(find.text('FOCUS'), findsOneWidget);
  });

  testWidgets('trocar de seção mantém a casca e a nav', (tester) async {
    await tester.pumpWidget(_app());
    await tester.pumpAndSettle();

    await tester.tap(find.text('TRAJETÓRIA'));
    await tester.pumpAndSettle();

    expect(find.text('AGORA'), findsOneWidget);
    expect(find.byIcon(Icons.close_rounded), findsOneWidget);
  });

  testWidgets('sem categoria em foco a seção de grupo explica em vez de vazar',
      (tester) async {
    await tester.pumpWidget(_app());
    await tester.pumpAndSettle();

    await tester.tap(find.text('GRUPO'));
    await tester.pumpAndSettle();

    expect(find.textContaining('o grupo e a chave dela'), findsWidgets);
  });
}
