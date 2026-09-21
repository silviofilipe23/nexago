// `enrolledTeamsVisible`: o organizador decide se o atleta vê a lista de
// equipes inscritas. Ausente = VISÍVEL — a tela já existia antes da flag e
// torneio antigo não pode perdê-la.
//
// Três frentes num arquivo porque o contrato é um só: o mapper traduz o campo,
// a seção Explorar mostra ou não o card, e a própria tela recusa o acesso por
// link direto (esconder só o card deixaria a rota aberta).

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/data/tournament_document_mapper.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_enrolled_athletes_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_enrolled_athletes_providers.dart';
import 'package:nexago_app/features/tournaments/presentation/tournament_enrolled_athletes_page.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_detail/tournament_detail_explore_section.dart';

TournamentDetail _tournament({bool enrolledTeamsVisible = true}) {
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
    spotsLeft: 4,
    spotsTotal: 16,
    status: TournamentListingStatus.open,
    featured: false,
    enrolledCount: 12,
    liveMatchesNow: 0,
    categoryOffers: const [
      TournamentCategoryOffer(id: 'c1', name: 'Masculino B', entryFee: 90),
    ],
    enrolledTeamsVisible: enrolledTeamsVisible,
  );
}

Widget _exploreSection({required bool showEquipesInscritas}) {
  final tournament = _tournament();
  return MaterialApp(
    home: Scaffold(
      body: TournamentDetailExploreSection(
        tournament: tournament,
        stats: tournamentDetailStats(tournament),
        showEquipesInscritas: showEquipesInscritas,
        onOpenPodio: () {},
        onOpenCategorias: () {},
        onOpenAtletasInscritos: () {},
        onOpenPalpites: () {},
        onOpenHoje: () {},
        onOpenMinhaInscricao: () {},
      ),
    ),
  );
}

Widget _enrolledPage({required bool enrolledTeamsVisible}) {
  const team = TournamentEnrolledTeam(
    registrationId: 'r1',
    teamId: 'team-1',
    displayName: 'Dupla Fantasma',
    members: [
      TournamentEnrolledTeamMember(uid: 'u1', name: 'Ana', initials: 'A'),
      TournamentEnrolledTeamMember(uid: 'u2', name: 'Bia', initials: 'B'),
    ],
    categoryId: 'c1',
    categoryName: 'Masculino B',
  );

  return ProviderScope(
    overrides: [
      tournamentDetailProvider('t1').overrideWith(
        (ref) => Stream.value(
          _tournament(enrolledTeamsVisible: enrolledTeamsVisible),
        ),
      ),
      tournamentEnrolledTeamsProvider(
        't1',
      ).overrideWith((ref) => Stream.value(const [team])),
    ],
    child: const MaterialApp(
      home: TournamentEnrolledAthletesPage(tournamentId: 't1'),
    ),
  );
}

void main() {
  group('mapper', () {
    test('torneio sem o campo continua exibindo as equipes inscritas', () {
      final t = TournamentDocumentMapper.detailFromMap('t1', {
        'name': 'Copa',
        'capacity': 16,
        'enrolledCount': 4,
      });

      expect(t.enrolledTeamsVisible, isTrue);
    });

    test('organizador desligou: a lista fica escondida', () {
      final t = TournamentDocumentMapper.detailFromMap('t1', {
        'name': 'Copa',
        'capacity': 16,
        'enrolledCount': 4,
        'enrolledTeamsVisible': false,
      });

      expect(t.enrolledTeamsVisible, isFalse);
    });
  });

  group('seção Explorar', () {
    testWidgets('sem a flag, o card Equipes inscritas não existe', (
      tester,
    ) async {
      await tester.pumpWidget(_exploreSection(showEquipesInscritas: false));

      expect(find.text('Equipes inscritas'), findsNothing);
    });

    testWidgets('com a flag, o card Equipes inscritas aparece', (tester) async {
      await tester.pumpWidget(_exploreSection(showEquipesInscritas: true));

      expect(find.text('Equipes inscritas'), findsOneWidget);
    });
  });

  group('tela por link direto', () {
    testWidgets('flag desligada recusa o acesso mesmo com equipes carregadas', (
      tester,
    ) async {
      await tester.pumpWidget(_enrolledPage(enrolledTeamsVisible: false));
      await tester.pumpAndSettle();

      expect(find.text('Dupla Fantasma'), findsNothing);
      expect(
        find.textContaining('não está exibindo as equipes inscritas'),
        findsOneWidget,
      );
    });

    testWidgets('flag ligada mostra a equipe', (tester) async {
      await tester.pumpWidget(_enrolledPage(enrolledTeamsVisible: true));
      await tester.pumpAndSettle();

      expect(find.text('Dupla Fantasma'), findsOneWidget);
    });
  });
}
