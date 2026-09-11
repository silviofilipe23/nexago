import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_detail/tournament_detail_explore_section.dart';

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
    spotsLeft: 0,
    spotsTotal: 16,
    status: TournamentListingStatus.completed,
    featured: false,
    enrolledCount: 16,
    liveMatchesNow: 0,
    categoryOffers: const [
      TournamentCategoryOffer(id: 'c1', name: 'Masculino B', entryFee: 90),
    ],
  );
}

Widget _app({required bool showPodio, VoidCallback? onOpenPodio}) {
  final tournament = _tournament();
  return MaterialApp(
    home: Scaffold(
      body: TournamentDetailExploreSection(
        tournament: tournament,
        stats: tournamentDetailStats(tournament),
        showPodio: showPodio,
        onOpenPodio: onOpenPodio ?? () {},
        onOpenCategorias: () {},
        onOpenPalpites: () {},
        onOpenHoje: () {},
        onOpenMinhaInscricao: () {},
      ),
    ),
  );
}

void main() {
  testWidgets('o card do Pódio não existe enquanto o torneio não acaba',
      (tester) async {
    await tester.pumpWidget(_app(showPodio: false));

    expect(find.text('Pódio'), findsNothing);
  });

  testWidgets('torneio finalizado mostra o card e ele abre o pódio',
      (tester) async {
    var opened = 0;
    await tester.pumpWidget(
      _app(showPodio: true, onOpenPodio: () => opened++),
    );

    expect(find.text('Pódio'), findsOneWidget);

    await tester.tap(find.text('Pódio'));
    await tester.pump();

    expect(opened, 1);
  });
}
