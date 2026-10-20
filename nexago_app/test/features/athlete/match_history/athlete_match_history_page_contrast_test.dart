import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/time/nexago_event_timezone.dart';
import 'package:nexago_app/features/arenas/domain/booking_result_record.dart';
import 'package:nexago_app/features/arenas/domain/booking_result_record_providers.dart';
import 'package:nexago_app/features/athlete/domain/match_history/athlete_match_history_models.dart';
import 'package:nexago_app/features/athlete/domain/match_history/athlete_match_history_providers.dart';
import 'package:nexago_app/features/athlete/presentation/athlete_match_history_page.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/match_history/match_history_month_header.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/match_history/match_history_tournament_card.dart';

import '../../arenas/fake_booking_result_repository.dart';

/// Razão de contraste WCAG entre o texto [fg] (composto sobre [bg]) e [bg].
double contrastRatio(Color fg, Color bg) {
  final a = Color.alphaBlend(fg, bg).computeLuminance();
  final b = bg.computeLuminance();
  final (hi, lo) = a > b ? (a, b) : (b, a);
  return (hi + 0.05) / (lo + 0.05);
}

final _year = DateTime.now().year;

AthleteMatchHistoryBundle _bundle({
  List<AthleteMatchHistoryItem> matches = const [],
  List<AthleteTournamentHistoryItem> tournaments = const [],
}) {
  return AthleteMatchHistoryBundle(
    matches: matches,
    tournaments: tournaments,
    seasonSummary: AthleteSeasonSummary(
      year: _year,
      winRatePercent: 50,
      wins: 1,
      losses: 1,
    ),
  );
}

final _match = AthleteMatchHistoryItem(
  id: 'm1',
  playedAt: DateTime(_year, 3, 10),
  result: AthleteMatchResult.win,
  opponentLabel: 'Bruno & Caio',
  competitionLabel: 'Copa Verão',
  scoreDisplay: '2-0',
);

const _tournament = AthleteTournamentHistoryItem(
  id: 't1',
  name: 'Copa Verão',
  venue: 'Arena Sol',
  periodLabel: 'MAR 2026',
  categoryLabel: 'B',
  genderLabel: 'Misto',
  placement: 5,
  medal: TournamentPlacement.other,
  wins: 2,
  losses: 2,
);

String _day(int month, int d) =>
    '$_year-${month.toString().padLeft(2, '0')}-${d.toString().padLeft(2, '0')}';

Future<void> _pumpPage(
  WidgetTester tester,
  ThemeData theme, {
  Future<AthleteMatchHistoryBundle> Function()? bundle,
  MatchHistoryTab tab = MatchHistoryTab.matches,
  List<SavedBookingResult> peladas = const [],
}) async {
  // Largo o bastante pra fonte de teste (glifos quadrados) não estourar a linha.
  tester.view.physicalSize = const Size(560, 1600);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        bookingResultRepositoryProvider.overrideWithValue(
          FakeBookingResultRepository(peladas),
        ),
        bookingResultUidProvider.overrideWithValue('u1'),
        currentAthleteMatchHistoryBundleProvider.overrideWith(
          (ref) => (bundle ?? () async => _bundle(matches: [_match]))(),
        ),
        matchHistoryTabProvider.overrideWith((ref) => tab),
      ],
      child: MaterialApp(theme: theme, home: const AthleteMatchHistoryPage()),
    ),
  );
  await tester.pump();
  await tester.pump();
}

Color _pageBackground(WidgetTester tester) =>
    tester.widget<Scaffold>(find.byType(Scaffold)).backgroundColor!;

Color _richTextColor(WidgetTester tester, Finder text) {
  final rich = tester.widget<RichText>(
    find.descendant(of: text, matching: find.byType(RichText)).first,
  );
  return rich.text.style!.color!;
}

void _expectLegible(Color fg, Color bg, String what) {
  expect(
    contrastRatio(fg, bg),
    greaterThanOrEqualTo(4.5),
    reason: '$what ($fg) sobre $bg',
  );
}

void main() {
  setUpAll(() async {
    initializeNexagoEventTimezone();
    await initializeDateFormatting('pt_BR');
  });

  for (final (name, theme) in [
    ('claro', AppTheme.light),
    ('escuro', AppTheme.dark),
  ]) {
    group('tema $name', () {
      testWidgets('fundo, app bar e voltar seguem o tema', (tester) async {
        await _pumpPage(tester, theme);

        final bg = _pageBackground(tester);
        expect(bg, theme.colorScheme.surfaceContainerLowest);

        final appBar = tester.widget<AppBar>(find.byType(AppBar));
        expect(appBar.backgroundColor, bg);
        _expectLegible(
          _richTextColor(tester, find.text('Histórico')),
          bg,
          'Título "Histórico"',
        );

        final back = find.byIcon(Icons.chevron_left_rounded);
        final backFill = tester
            .widget<Material>(
              find.ancestor(of: back, matching: find.byType(Material)).first,
            )
            .color!;
        _expectLegible(
          tester.widget<Icon>(back).color!,
          backFill,
          'Seta do voltar',
        );
      });

      testWidgets('cabeçalho do mês legível sobre o fundo', (tester) async {
        await _pumpPage(tester, theme);

        final bg = _pageBackground(tester);
        final header = find.byType(MatchHistoryMonthHeader);
        expect(header, findsOneWidget);
        _expectLegible(
          _richTextColor(tester, find.text('Março • $_year')),
          bg,
          'Título do mês',
        );
        _expectLegible(
          _richTextColor(tester, find.text('1 JOGOS • 1V 0D')),
          bg,
          'Resumo do mês',
        );
      });

      testWidgets('vazio do filtro legível sobre o fundo', (tester) async {
        await _pumpPage(tester, theme, bundle: () async => _bundle());

        _expectLegible(
          _richTextColor(tester, find.text('Nenhuma partida neste filtro.')),
          _pageBackground(tester),
          'Vazio do filtro',
        );
      });

      testWidgets('aba Peladas: cabeçalho do mês legível sobre o fundo', (
        tester,
      ) async {
        await _pumpPage(
          tester,
          theme,
          tab: MatchHistoryTab.peladas,
          peladas: [
            savedResult(
              bookingId: 'a',
              status: BookingResultStatus.confirmed,
              dateKey: _day(3, 10),
            ),
          ],
        );

        final header = find.byType(MatchHistoryMonthHeader);
        expect(header, findsOneWidget);
        final title = tester.widget<MatchHistoryMonthHeader>(header).title;
        _expectLegible(
          _richTextColor(tester, find.text(title)),
          _pageBackground(tester),
          'Título do mês das peladas',
        );
      });

      testWidgets('aba Peladas: vazio legível sobre o fundo', (tester) async {
        await _pumpPage(tester, theme, tab: MatchHistoryTab.peladas);

        // O tom é o `PeladaStyle.dim` da feature Peladas (onSurface a 55%):
        // no claro dá ~3,8:1. Aqui só se garante que o texto acompanha o
        // fundo do tema — sobre o fundo escuro fixo ele ficava em 1,1:1.
        final color =
            _richTextColor(tester, find.byKey(const Key('peladas-empty')));
        final bg = _pageBackground(tester);
        expect(
          contrastRatio(color, bg),
          greaterThanOrEqualTo(3.0),
          reason: 'Vazio das peladas ($color) sobre $bg',
        );
      });

      testWidgets('aba Torneios: card na superfície do tema', (tester) async {
        await _pumpPage(
          tester,
          theme,
          tab: MatchHistoryTab.tournaments,
          bundle: () async => _bundle(tournaments: [_tournament]),
        );

        final card = find.byType(MatchHistoryTournamentCard);
        final fill = tester
            .widget<Material>(
              find.descendant(of: card, matching: find.byType(Material)).first,
            )
            .color!;
        expect(fill, theme.colorScheme.surface);
        for (final text in ['Copa Verão', 'Arena Sol', 'MAR 2026', '5º']) {
          final color = _richTextColor(
            tester,
            find.descendant(of: card, matching: find.text(text)),
          );
          // Pílulas e selo têm fundo próprio, mas translúcido/no tom do card.
          _expectLegible(color, fill, '"$text"');
        }
      });

      testWidgets('erro legível sobre o fundo', (tester) async {
        await _pumpPage(
          tester,
          theme,
          bundle: () async => throw Exception('offline'),
        );

        _expectLegible(
          _richTextColor(
            tester,
            find.text('Não foi possível carregar o histórico.'),
          ),
          _pageBackground(tester),
          'Mensagem de erro',
        );
      });
    });
  }

  // O tema escuro é o visual de referência: a troca por tokens do tema não
  // pode mexer em nenhuma cor dele.
  testWidgets('tema escuro: cores idênticas às de antes', (tester) async {
    await _pumpPage(tester, AppTheme.dark);

    expect(_pageBackground(tester), AppColors.canvas);
    expect(
      tester.widget<AppBar>(find.byType(AppBar)).backgroundColor,
      AppColors.canvas,
    );
    expect(
      _richTextColor(tester, find.text('Histórico')),
      AppColors.onSurface,
    );
    final back = find.byIcon(Icons.chevron_left_rounded);
    expect(tester.widget<Icon>(back).color, AppColors.onSurface);
    expect(
      tester
          .widget<Material>(
            find.ancestor(of: back, matching: find.byType(Material)).first,
          )
          .color,
      AppColors.surfaceRaised,
    );
  });

  testWidgets('tema escuro: card de torneio idêntico ao de antes', (
    tester,
  ) async {
    await _pumpPage(
      tester,
      AppTheme.dark,
      tab: MatchHistoryTab.tournaments,
      bundle: () async => _bundle(tournaments: [_tournament]),
    );

    final card = find.byType(MatchHistoryTournamentCard);
    expect(
      tester
          .widget<Material>(
            find.descendant(of: card, matching: find.byType(Material)).first,
          )
          .color,
      AppColors.surfaceCard,
    );
    Color textColor(String text) => _richTextColor(
          tester,
          find.descendant(of: card, matching: find.text(text)),
        );
    expect(textColor('Copa Verão'), AppColors.onSurface);
    expect(textColor('Arena Sol'), AppColors.onSurfaceMuted);
    expect(textColor('MAR 2026'), AppColors.onSurface);
    expect(textColor('5º'), AppColors.onSurfaceMuted);
  });
}
