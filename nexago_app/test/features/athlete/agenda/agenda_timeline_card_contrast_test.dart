import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:intl/intl.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete/domain/agenda/athlete_agenda_logic.dart';
import 'package:nexago_app/features/athlete/domain/agenda/athlete_agenda_models.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/agenda/agenda_timeline_widgets.dart';

/// Razão de contraste WCAG entre o texto [fg] (composto sobre [bg]) e [bg].
double contrastRatio(Color fg, Color bg) {
  final a = Color.alphaBlend(fg, bg).computeLuminance();
  final b = bg.computeLuminance();
  final (hi, lo) = a > b ? (a, b) : (b, a);
  return (hi + 0.05) / (lo + 0.05);
}

final _start = DateTime.now().add(const Duration(days: 2));
final _end = _start.add(const Duration(hours: 1));

class _Case {
  const _Case(this.name, this.item, this.cardTexts);

  final String name;
  final AthleteAgendaItem item;

  /// Textos que ficam direto sobre o degradê do card.
  final List<String> cardTexts;
}

AthleteAgendaItem _rental(AthleteAgendaBookingStage stage, String status) {
  return AthleteAgendaItem(
    id: 'rental-b1',
    kind: AthleteAgendaItemKind.rental,
    startsAt: _start,
    endsAt: _end,
    title: 'Arena Sol',
    subtitle: 'Quadra 2 · Beach tennis',
    statusLabel: status,
    accentColor: bookingStageColor(stage),
    rental: AthleteAgendaRentalPayload(
      bookingId: 'b1',
      arenaName: 'Arena Sol',
      courtName: 'Quadra 2',
      startAt: _start,
      endAt: _end,
      rawStatus: 'confirmed',
      confirmedParticipants: 1,
      stage: stage,
    ),
  );
}

AthleteAgendaItem _tournament({required bool isLive}) {
  return AthleteAgendaItem(
    id: 'tournament-t1',
    kind: AthleteAgendaItemKind.tournament,
    startsAt: _start,
    title: 'Copa Verão',
    subtitle: 'Mista B · Arena Sol',
    statusLabel: isLive ? 'Em andamento' : 'Em 2 dias',
    accentColor: athleteAgendaTournamentAccent,
    tournament: AthleteAgendaTournamentPayload(
      tournamentId: 't1',
      registrationId: 'r1',
      isLive: isLive,
      categoryId: 'c1',
    ),
  );
}

final _cases = [
  _Case(
    'aluguel futuro',
    _rental(AthleteAgendaBookingStage.future, 'Em 2 dias'),
    ['ALUGUEL', 'EM 2 DIAS', 'Arena Sol', 'Quadra 2 · Beach tennis'],
  ),
  _Case(
    'aluguel finalizado',
    _rental(AthleteAgendaBookingStage.past, 'Finalizado'),
    ['ALUGUEL', 'FINALIZADO', 'Arena Sol', 'Quadra 2 · Beach tennis'],
  ),
  _Case(
    'aluguel cancelado',
    _rental(AthleteAgendaBookingStage.canceled, 'Cancelado'),
    ['ALUGUEL', 'CANCELADO', 'Arena Sol', 'Quadra 2 · Beach tennis'],
  ),
  _Case(
    'torneio',
    _tournament(isLive: false),
    [
      'TORNEIO',
      'EM 2 DIAS',
      'Copa Verão',
      'Mista B · Arena Sol',
      'Ver torneio'
    ],
  ),
  _Case(
    'torneio ao vivo',
    _tournament(isLive: true),
    ['TORNEIO', 'AO VIVO', 'EM ANDAMENTO', 'Copa Verão', 'Bracket'],
  ),
  _Case(
    'desafio',
    AthleteAgendaItem(
      id: 'challenge-c1',
      kind: AthleteAgendaItemKind.challenge,
      startsAt: _start,
      title: 'Desafio vs. Bruno',
      subtitle: 'Ranking geral',
      statusLabel: 'Pendente',
      accentColor: athleteAgendaChallengeAccent,
      challenge: const AthleteAgendaChallengePayload(challengeId: 'c1'),
    ),
    [
      'DESAFIO',
      'Pendente',
      'Desafio vs. Bruno',
      'Ranking geral',
      'Combinar no chat'
    ],
  ),
  _Case(
    'bora jogar',
    AthleteAgendaItem(
      id: 'friendly-m1',
      kind: AthleteAgendaItemKind.friendlyMatch,
      startsAt: _start,
      title: 'Jogo com Ana',
      subtitle: 'Arena Sol',
      statusLabel: 'Confirmado',
      accentColor: athleteAgendaFriendlyMatchAccent,
      friendlyMatch: const AthleteAgendaFriendlyMatchPayload(
        matchId: 'm1',
        otherName: 'Ana',
      ),
    ),
    ['BORA JOGAR', 'Confirmado', 'Jogo com Ana', 'Arena Sol'],
  ),
  _Case(
    'clubinho',
    AthleteAgendaItem(
      id: 'club-s1',
      kind: AthleteAgendaItemKind.clubSession,
      startsAt: _start,
      title: 'Clubinho da Sol',
      subtitle: 'Arena Sol',
      statusLabel: 'Confirmado',
      accentColor: athleteAgendaClubSessionAccent,
      clubSession: const AthleteAgendaClubSessionPayload(
        sessionId: 's1',
        arenaName: 'Arena Sol',
        clubName: 'Clubinho da Sol',
      ),
    ),
    ['CLUBINHO', 'Confirmado', 'Clubinho da Sol', 'Arena Sol'],
  ),
];

Future<void> _pumpRow(
  WidgetTester tester,
  AthleteAgendaItem item,
  ThemeData theme,
) async {
  // Largo o bastante pra fonte de teste (glifos quadrados) não estourar a linha.
  tester.view.physicalSize = const Size(560, 1000);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      child: MaterialApp(
        theme: theme,
        home: Scaffold(
          body: ListView(
            children: [
              AgendaTimelineRow(
                row: AthleteAgendaTimelineRow.item(
                  item,
                  isFirst: true,
                  isLast: true,
                ),
                highlightNextId: null,
                onCancelBooking: (_) async {},
              ),
            ],
          ),
        ),
      ),
    ),
  );
  await tester.pump(const Duration(milliseconds: 300));
}

List<Color> _cardGradient(WidgetTester tester) {
  final card = tester.widget<Container>(
    find.byWidgetPredicate(
      (w) =>
          w is Container &&
          w.decoration is BoxDecoration &&
          (w.decoration! as BoxDecoration).gradient != null,
    ),
  );
  return (card.decoration! as BoxDecoration).gradient!.colors;
}

Color _textColor(WidgetTester tester, String text) {
  final rich = tester.widget<RichText>(
    find.descendant(of: find.text(text), matching: find.byType(RichText)),
  );
  return rich.text.style!.color!;
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  for (final c in _cases) {
    testWidgets('tema claro, ${c.name}: degradê claro e texto legível', (
      tester,
    ) async {
      await _pumpRow(tester, c.item, AppTheme.light);

      final stops = _cardGradient(tester);
      for (final stop in stops) {
        expect(stop.computeLuminance(), greaterThan(0.75), reason: '$stop');
      }
      for (final text in c.cardTexts) {
        final color = _textColor(tester, text);
        for (final stop in stops) {
          expect(
            contrastRatio(color, stop),
            greaterThanOrEqualTo(4.5),
            reason: '"$text" ($color) sobre $stop',
          );
        }
      }
    });

    testWidgets('tema escuro, ${c.name}: título claro sobre o degradê', (
      tester,
    ) async {
      await _pumpRow(tester, c.item, AppTheme.dark);

      final stops = _cardGradient(tester);
      final title = c.item.rental?.arenaName ?? c.item.title;
      final color = _textColor(tester, title);
      for (final stop in stops) {
        expect(
          contrastRatio(color, stop),
          greaterThanOrEqualTo(4.5),
          reason: '"$title" ($color) sobre $stop',
        );
      }
    });
  }

  for (final (name, theme) in [
    ('claro', AppTheme.light),
    ('escuro', AppTheme.dark),
  ]) {
    testWidgets('tema $name: data da timeline e faixa de horário legíveis', (
      tester,
    ) async {
      await _pumpRow(
        tester,
        _rental(AthleteAgendaBookingStage.future, 'Em 2 dias'),
        theme,
      );

      // A data fica no fundo da tela, à esquerda da linha do tempo.
      final date = DateFormat('dd/MM', 'pt_BR').format(_start);
      expect(
        contrastRatio(_textColor(tester, date), theme.scaffoldBackgroundColor),
        greaterThanOrEqualTo(4.5),
      );

      // A faixa "HH:mm - HH:mm" fica sobre o degradê do card.
      final hours = DateFormat('HH:mm', 'pt_BR');
      final range = '${hours.format(_start)} - ${hours.format(_end)}';
      final color = _textColor(tester, range);
      for (final stop in _cardGradient(tester)) {
        expect(contrastRatio(color, stop), greaterThanOrEqualTo(4.5));
      }
    });
  }
}
