import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/tournaments/data/tournament_announcements_repository.dart';
import 'package:nexago_app/features/tournaments/data/tournament_inscriptions_repository.dart';
import 'package:nexago_app/features/tournaments/domain/focus/focus_boot_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_card_view_model.dart';
import 'package:nexago_app/features/tournaments/presentation/focus/focus_shell_page.dart';
import 'package:nexago_app/features/tournaments/presentation/focus/widgets/focus_boot_loader.dart';

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

Widget _wrap(Widget child) {
  return MaterialApp(
    theme: AppTheme.dark,
    home: Scaffold(body: child),
  );
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR', null);
  });

  group('FocusBootLoader', () {
    testWidgets('nomeia os três passos e ainda não marca nenhum',
        (tester) async {
      await tester.pumpWidget(
        _wrap(const FocusBootLoader(progress: FocusBootProgress.none)),
      );
      await tester.pump(const Duration(milliseconds: 500));

      expect(find.text('ENTRANDO NO FOCUS'), findsOneWidget);
      expect(find.text('Preparando o seu\ndia de torneio'), findsOneWidget);
      for (final step in FocusBootStep.values) {
        expect(find.text(step.label), findsOneWidget);
      }
      expect(find.byIcon(Icons.check_rounded), findsNothing);
    });

    testWidgets('marca um visto por passo assentado', (tester) async {
      await tester.pumpWidget(
        _wrap(
          const FocusBootLoader(
            progress: FocusBootProgress({
              FocusBootStep.nextMatch,
              FocusBootStep.journey,
            }),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 500));

      expect(find.byIcon(Icons.check_rounded), findsNWidgets(2));
    });

    testWidgets('sem nome do torneio a legenda não inventa um', (tester) async {
      await tester.pumpWidget(
        _wrap(const FocusBootLoader(progress: FocusBootProgress.none)),
      );
      await tester.pump(const Duration(milliseconds: 500));

      expect(find.text('Sincronizando com a mesa do torneio'), findsOneWidget);
    });

    testWidgets('o nome do torneio ganha linha própria na legenda',
        (tester) async {
      await tester.pumpWidget(
        _wrap(
          const FocusBootLoader(
            progress: FocusBootProgress.none,
            tournamentName: 'Copa Teste',
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 500));

      expect(
        find.text('Sincronizando com a mesa\nCopa Teste'),
        findsOneWidget,
      );
    });
  });

  group('portão na casca do Focus', () {
    late StreamController<TournamentDetail?> detail;
    late StreamController<List<TournamentMatchCardViewModel>> cards;
    late StreamController<TournamentUserTeamIdsByCategory> teamIds;
    late StreamController<List<TournamentAnnouncement>> announcements;

    setUp(() {
      detail = StreamController<TournamentDetail?>.broadcast();
      cards =
          StreamController<List<TournamentMatchCardViewModel>>.broadcast();
      teamIds = StreamController<TournamentUserTeamIdsByCategory>.broadcast();
      announcements =
          StreamController<List<TournamentAnnouncement>>.broadcast();
    });

    tearDown(() async {
      await detail.close();
      await cards.close();
      await teamIds.close();
      await announcements.close();
    });

    Widget app() {
      return ProviderScope(
        overrides: [
          tournamentDetailProvider('t1').overrideWith((ref) => detail.stream),
          tournamentMatchCardsProvider('t1')
              .overrideWith((ref) => cards.stream),
          tournamentUserTeamIdsByCategoryProvider('t1')
              .overrideWith((ref) => teamIds.stream),
          tournamentAnnouncementsProvider('t1')
              .overrideWith((ref) => announcements.stream),
        ],
        child: const MaterialApp(
          home: FocusShellPage(tournamentId: 't1'),
        ),
      );
    }

    testWidgets('segura o loader até os três passos assentarem',
        (tester) async {
      await tester.pumpWidget(app());
      await tester.pump();

      expect(find.byType(FocusBootLoader), findsOneWidget);

      detail.add(_tournament());
      cards.add(const []);
      teamIds.add(const {});
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));

      // Faltam os avisos: o loader continua, com dois vistos.
      expect(find.byType(FocusBootLoader), findsOneWidget);
      expect(find.byIcon(Icons.check_rounded), findsNWidgets(2));

      announcements.add(const []);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.byType(FocusBootLoader), findsNothing);
    });

    testWidgets('o piso evita o pisca quando tudo chega de imediato',
        (tester) async {
      await tester.pumpWidget(app());
      detail.add(_tournament());
      cards.add(const []);
      teamIds.add(const {});
      announcements.add(const []);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 200));

      expect(find.byType(FocusBootLoader), findsOneWidget);

      await tester.pump(const Duration(milliseconds: 500));
      expect(find.byType(FocusBootLoader), findsNothing);
    });

    testWidgets('o prazo entra mesmo com um passo pendurado', (tester) async {
      await tester.pumpWidget(app());
      detail.add(_tournament());
      cards.add(const []);
      teamIds.add(const {});
      await tester.pump();
      await tester.pump(const Duration(seconds: 7));
      await tester.pump();

      expect(find.byType(FocusBootLoader), findsNothing);
    });

    testWidgets('torneio que assentou sem dado explica em vez de girar',
        (tester) async {
      await tester.pumpWidget(app());
      detail.add(null);
      cards.add(const []);
      teamIds.add(const {});
      announcements.add(const []);
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));

      expect(find.byType(FocusBootLoader), findsNothing);
      expect(find.textContaining('Toque no × para voltar'), findsOneWidget);
    });
  });
}
