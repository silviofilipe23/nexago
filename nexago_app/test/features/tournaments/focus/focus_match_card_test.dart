import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/time/nexago_event_timezone.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_card_view_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_set.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';
import 'package:nexago_app/features/tournaments/presentation/focus/widgets/focus_match_card.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/nexa_duo_avatars.dart';

TournamentMatchCardViewModel _viewModel({
  String status = TournamentMatchStatus.inProgress,
  List<TournamentMatchSet> sets = const [
    TournamentMatchSet(a: 21, b: 15),
    TournamentMatchSet(a: 14, b: 11),
  ],
  int? currentSetIndex = 1,
  DateTime? scheduleTime,
  String courtName = '3',
}) {
  return TournamentMatchCardViewModel(
    match: TournamentMatch(
      id: 'm1',
      tournamentId: 't1',
      categoryId: 'cat-a',
      round: 1,
      matchType: 'group',
      poolId: 'B',
      teamAId: 'time-a',
      teamBId: 'time-b',
      status: status,
      resultA: '',
      resultB: '',
      isGroupMatch: true,
      matchNumber: 14,
      courtName: courtName,
      sets: sets,
      currentSetIndex: currentSetIndex,
      scheduleTime: scheduleTime,
    ),
    teamA: const TournamentMatchCardTeamViewModel(
      displayName: 'Marcelo / Enzo',
      players: [],
    ),
    teamB: const TournamentMatchCardTeamViewModel(
      displayName: 'Sá / Toledo',
      players: [],
    ),
  );
}

/// Duplas com dois nomes completos cada — o que o app mostra quando o atleta
/// não tem apelido curto.
TournamentMatchCardViewModel _longNamesViewModel({
  required String status,
  required List<TournamentMatchSet> sets,
}) {
  final base = _viewModel(status: status, sets: sets, currentSetIndex: null);
  return TournamentMatchCardViewModel(
    match: base.match,
    teamA: const TournamentMatchCardTeamViewModel(
      displayName: 'Marcelo Nascimento / Enzo Vasconcelos',
      players: [
        TournamentMatchCardPlayerViewModel(
          initials: 'MA',
          avatarColor: Color(0xFF00FF88),
        ),
        TournamentMatchCardPlayerViewModel(
          initials: 'EN',
          avatarColor: Color(0xFF00FF88),
        ),
      ],
    ),
    teamB: const TournamentMatchCardTeamViewModel(
      displayName: 'Sá Guimarães / Toledo Albuquerque',
      players: [
        TournamentMatchCardPlayerViewModel(
          initials: 'SÁ',
          avatarColor: Color(0xFF00FF88),
        ),
        TournamentMatchCardPlayerViewModel(
          initials: 'TO',
          avatarColor: Color(0xFF00FF88),
        ),
      ],
    ),
  );
}

Widget _host(Widget child) {
  return MaterialApp(
    // O ponto do "ao vivo" pulsa em laço infinito; este é o mesmo caminho que
    // o aparelho com "reduzir movimento" percorre.
    home: MediaQuery(
      data: const MediaQueryData(disableAnimations: true),
      child: Scaffold(body: ListView(children: [child])),
    ),
  );
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR', null);
    await initializeNexagoEventTimezone();
  });

  testWidgets('ao vivo: número, selo, contexto, as duas duplas e o placar',
      (tester) async {
    await tester.pumpWidget(_host(FocusMatchCard(viewModel: _viewModel())));
    await tester.pumpAndSettle();

    expect(find.text('#14'), findsOneWidget);
    expect(find.text('AO VIVO'), findsOneWidget);
    expect(find.text('GRUPO B · Q3'), findsOneWidget);
    expect(find.text('Marcelo / Enzo'), findsOneWidget);
    expect(find.text('Sá / Toledo'), findsOneWidget);
    // O número grande é SETS; os pontos do set aberto vão na linha fina.
    expect(find.text('1-0'), findsOneWidget);
    expect(find.text('2° SET 14-11'), findsOneWidget);
  });

  testWidgets('a categoria entra no contexto quando informada', (tester) async {
    await tester.pumpWidget(
      _host(FocusMatchCard(viewModel: _viewModel(), categoryName: 'Misto B')),
    );
    await tester.pumpAndSettle();

    expect(find.text('MISTO B · GRUPO B · Q3'), findsOneWidget);
  });

  testWidgets('agendada: a hora ocupa o selo e o centro vira "vs"',
      (tester) async {
    await tester.pumpWidget(
      _host(
        FocusMatchCard(
          viewModel: _viewModel(
            status: TournamentMatchStatus.scheduled,
            sets: const [],
            currentSetIndex: null,
            // 14:30 na parede de São Paulo (o mapper entrega instante UTC).
            scheduleTime: nexagoEventDateTime(
              year: 2026,
              month: 8,
              day: 21,
              hour: 14,
              minute: 30,
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('14:30'), findsOneWidget);
    expect(find.text('vs'), findsOneWidget);
    expect(find.text('AO VIVO'), findsNothing);
  });

  testWidgets('encerrada: sets no centro e as parciais na linha fina',
      (tester) async {
    await tester.pumpWidget(
      _host(
        FocusMatchCard(
          viewModel: _viewModel(
            status: TournamentMatchStatus.completed,
            sets: const [
              TournamentMatchSet(a: 21, b: 14),
              TournamentMatchSet(a: 21, b: 18),
            ],
            currentSetIndex: null,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('2-0'), findsOneWidget);
    expect(find.text('21-14 · 21-18'), findsOneWidget);
  });

  testWidgets('a dupla do atleta ganha peso no nome', (tester) async {
    await tester.pumpWidget(
      _host(
        FocusMatchCard(
          viewModel: _viewModel(),
          athleteTeamIds: const {'time-a'},
        ),
      ),
    );
    await tester.pumpAndSettle();

    final mine = tester.widget<Text>(find.text('Marcelo / Enzo'));
    final theirs = tester.widget<Text>(find.text('Sá / Toledo'));

    expect(mine.style?.fontWeight, FontWeight.w700);
    expect(theirs.style?.fontWeight, isNot(FontWeight.w700));
  });

  // O layout é de três colunas e a do meio não é `Expanded`: uma linha de
  // parciais longa ("21-14 · 21-18 · 15-13") rouba largura das duplas.
  //
  // Isso NÃO lança exceção — `NexaDuoAvatars` é um `Stack` com `Clip.none`, e
  // os rostos simplesmente vazam por cima do vizinho. Por isso o teste mede o
  // tamanho dos avatares em vez de conferir `takeException`.
  testWidgets('a coluna do placar não espreme os avatares das duplas',
      (tester) async {
    tester.view.physicalSize = const Size(320, 568);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      _host(
        FocusMatchCard(
          viewModel: _longNamesViewModel(
            status: TournamentMatchStatus.completed,
            sets: const [
              TournamentMatchSet(a: 21, b: 14),
              TournamentMatchSet(a: 18, b: 21),
              TournamentMatchSet(a: 15, b: 13),
            ],
          ),
          categoryName: 'Mista B 40+',
        ),
      ),
    );
    await tester.pumpAndSettle();

    // Dois rostos de 40px sobrepostos em 30%: 40 * 2 - 12.
    const naturalWidth = 68.0;
    final avatars = find.byType(NexaDuoAvatars);
    expect(avatars, findsNWidgets(2));
    expect(tester.getSize(avatars.at(0)).width, naturalWidth);
    expect(tester.getSize(avatars.at(1)).width, naturalWidth);
  });

  testWidgets('o toque abre a partida', (tester) async {
    var opened = 0;

    await tester.pumpWidget(
      _host(FocusMatchCard(viewModel: _viewModel(), onTap: () => opened++)),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Marcelo / Enzo'));
    await tester.pumpAndSettle();

    expect(opened, 1);
  });
}
