import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_tabs_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';

TournamentMatch _match({
  String id = 'm1',
  String teamAId = 'a',
  String teamBId = 'b',
  String status = TournamentMatchStatus.scheduled,
  int matchNumber = 1,
  DateTime? scheduleTime,
  DateTime? matchStartedAt,
}) {
  return TournamentMatch(
    id: id,
    tournamentId: 't1',
    categoryId: 'c1',
    round: 1,
    matchType: 'bracket',
    poolId: '',
    teamAId: teamAId,
    teamBId: teamBId,
    status: status,
    resultA: '',
    resultB: '',
    isGroupMatch: false,
    matchNumber: matchNumber,
    scheduleTime: scheduleTime,
    matchStartedAt: matchStartedAt,
  );
}

TournamentDetail _tournament({
  required DateTime startDate,
  DateTime? endDate,
  String location = 'Arena X',
  String city = 'Goiânia',
}) {
  return TournamentDetail(
    id: 't1',
    name: 'Copa Teste',
    location: location,
    city: city,
    dateLabel: '',
    startDate: startDate,
    endDate: endDate,
    categories: const [TournamentGenderCat.m],
    format: TournamentFormat.dupla,
    priceLabel: r'R$ 90',
    priceValue: 90,
    spotsLeft: 10,
    spotsTotal: 32,
    status: TournamentListingStatus.open,
    featured: false,
    enrolledCount: 0,
    liveMatchesNow: 0,
  );
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR', null);
  });

  group('visibleTournamentDetailTabs', () {
    test('esqueleto fixo: só Visão geral e Categorias quando tudo é false',
        () {
      final tabs = visibleTournamentDetailTabs(
        hasMyMatchToday: false,
        isRegistered: false,
        hasDefinedMatchups: false,
      );

      expect(tabs, [
        TournamentDetailTab.visaoGeral,
        TournamentDetailTab.categorias,
      ]);
    });

    test('Hoje entra quando tenho jogo hoje', () {
      final tabs = visibleTournamentDetailTabs(
        hasMyMatchToday: true,
        isRegistered: false,
        hasDefinedMatchups: false,
      );

      expect(tabs, contains(TournamentDetailTab.hoje));
      expect(tabs, [
        TournamentDetailTab.visaoGeral,
        TournamentDetailTab.hoje,
        TournamentDetailTab.categorias,
      ]);
    });

    test('Minha inscrição entra quando estou inscrito', () {
      final tabs = visibleTournamentDetailTabs(
        hasMyMatchToday: false,
        isRegistered: true,
        hasDefinedMatchups: false,
      );

      expect(tabs, [
        TournamentDetailTab.visaoGeral,
        TournamentDetailTab.categorias,
        TournamentDetailTab.minhaInscricao,
      ]);
    });

    test('Palpites entra quando há confrontos definidos', () {
      final tabs = visibleTournamentDetailTabs(
        hasMyMatchToday: false,
        isRegistered: false,
        hasDefinedMatchups: true,
      );

      expect(tabs, [
        TournamentDetailTab.visaoGeral,
        TournamentDetailTab.categorias,
        TournamentDetailTab.palpites,
      ]);
    });

    test('ordem completa com tudo true', () {
      final tabs = visibleTournamentDetailTabs(
        hasMyMatchToday: true,
        isRegistered: true,
        hasDefinedMatchups: true,
      );

      expect(tabs, [
        TournamentDetailTab.visaoGeral,
        TournamentDetailTab.hoje,
        TournamentDetailTab.categorias,
        TournamentDetailTab.minhaInscricao,
        TournamentDetailTab.palpites,
      ]);
    });
  });

  group('defaultTournamentDetailTab', () {
    test('cai no Hoje quando a aba está presente', () {
      final tabs = visibleTournamentDetailTabs(
        hasMyMatchToday: true,
        isRegistered: false,
        hasDefinedMatchups: false,
      );

      expect(defaultTournamentDetailTab(tabs), TournamentDetailTab.hoje);
    });

    test('cai na Visão geral quando não há Hoje', () {
      final tabs = visibleTournamentDetailTabs(
        hasMyMatchToday: false,
        isRegistered: true,
        hasDefinedMatchups: true,
      );

      expect(defaultTournamentDetailTab(tabs), TournamentDetailTab.visaoGeral);
    });
  });

  group('visibleCategoryViews', () {
    test('Chave é o esqueleto fixo: única visão quando tudo é false', () {
      final views = visibleCategoryViews(
        hasMatches: false,
        hasGroups: false,
      );

      expect(views, [TournamentCategoryView.chave]);
    });

    test('Partidas entra quando há jogos publicados', () {
      final views = visibleCategoryViews(
        hasMatches: true,
        hasGroups: false,
      );

      expect(views, [
        TournamentCategoryView.partidas,
        TournamentCategoryView.chave,
      ]);
    });

    test('Grupos entra quando a categoria tem fase de grupos', () {
      final views = visibleCategoryViews(
        hasMatches: false,
        hasGroups: true,
      );

      expect(views, [
        TournamentCategoryView.grupos,
        TournamentCategoryView.chave,
      ]);
    });

    test('ordem completa com tudo true', () {
      final views = visibleCategoryViews(
        hasMatches: true,
        hasGroups: true,
      );

      expect(views, [
        TournamentCategoryView.partidas,
        TournamentCategoryView.grupos,
        TournamentCategoryView.chave,
      ]);
    });
  });

  group('defaultCategoryView', () {
    test('cai nas Partidas quando elas estão presentes', () {
      final views = visibleCategoryViews(
        hasMatches: true,
        hasGroups: true,
      );

      expect(defaultCategoryView(views), TournamentCategoryView.partidas);
    });

    test('cai nos Grupos quando só há Grupos e Chave', () {
      final views = visibleCategoryViews(
        hasMatches: false,
        hasGroups: true,
      );

      expect(defaultCategoryView(views), TournamentCategoryView.grupos);
    });

    test('cai na Chave quando ela é a única visão', () {
      final views = visibleCategoryViews(
        hasMatches: false,
        hasGroups: false,
      );

      expect(defaultCategoryView(views), TournamentCategoryView.chave);
    });

    test('lista vazia cai na Chave por segurança', () {
      expect(defaultCategoryView(const []), TournamentCategoryView.chave);
    });
  });

  group('tournamentHasDefinedMatchups', () {
    test('false quando nenhuma partida tem os dois times definidos', () {
      final matches = [
        _match(id: 'm1', teamAId: '', teamBId: ''),
        _match(id: 'm2', teamAId: 'a', teamBId: ''),
        _match(id: 'm3', teamAId: '', teamBId: 'b'),
      ];

      expect(tournamentHasDefinedMatchups(matches), isFalse);
    });

    test('true quando ao menos uma partida tem teamA e teamB preenchidos',
        () {
      final matches = [
        _match(id: 'm1', teamAId: '', teamBId: ''),
        _match(id: 'm2', teamAId: 'a', teamBId: 'b'),
      ];

      expect(tournamentHasDefinedMatchups(matches), isTrue);
    });

    test('false com lista vazia', () {
      expect(tournamentHasDefinedMatchups(const []), isFalse);
    });
  });

  group('myTournamentDayTimeline', () {
    final reference = DateTime(2026, 8, 20, 8, 0);

    test('só partidas dos meus times, no mesmo dia, ordenadas por horário',
        () {
      final matches = [
        // Meu time como B, mais tarde no dia.
        _match(
          id: 'tarde',
          teamAId: 'x',
          teamBId: 'meu',
          scheduleTime: DateTime(2026, 8, 20, 15, 0),
        ),
        // Meu time como A, de manhã.
        _match(
          id: 'manha',
          teamAId: 'meu',
          teamBId: 'y',
          scheduleTime: DateTime(2026, 8, 20, 9, 0),
        ),
        // Não é meu time.
        _match(
          id: 'outros',
          teamAId: 'x',
          teamBId: 'y',
          scheduleTime: DateTime(2026, 8, 20, 10, 0),
        ),
      ];

      final timeline = myTournamentDayTimeline(matches, {'meu'}, reference);

      expect(timeline.map((m) => m.id), ['manha', 'tarde']);
    });

    test('partida sem scheduleTime fica fora', () {
      final matches = [
        _match(id: 'sem-horario', teamAId: 'meu', teamBId: 'y'),
      ];

      expect(myTournamentDayTimeline(matches, {'meu'}, reference), isEmpty);
    });

    test('partida de outro dia fica fora', () {
      final matches = [
        _match(
          id: 'ontem',
          teamAId: 'meu',
          teamBId: 'y',
          scheduleTime: DateTime(2026, 8, 19, 9, 0),
        ),
        _match(
          id: 'amanha',
          teamAId: 'meu',
          teamBId: 'y',
          scheduleTime: DateTime(2026, 8, 21, 9, 0),
        ),
      ];

      expect(myTournamentDayTimeline(matches, {'meu'}, reference), isEmpty);
    });

    test('sem horário entra quando o torneio está rolando hoje', () {
      final matches = [
        _match(id: 'sem-horario', teamAId: 'meu', teamBId: 'y'),
      ];

      final timeline = myTournamentDayTimeline(
        matches,
        {'meu'},
        reference,
        tournamentRunningToday: true,
      );

      expect(timeline.map((m) => m.id), ['sem-horario']);
    });

    test('sem horário e encerrada fica fora — não há evidência de dia', () {
      final matches = [
        _match(
          id: 'encerrada',
          teamAId: 'meu',
          teamBId: 'y',
          status: TournamentMatchStatus.completed,
        ),
        _match(
          id: 'cancelada',
          teamAId: 'meu',
          teamBId: 'y',
          status: TournamentMatchStatus.canceled,
        ),
      ];

      expect(
        myTournamentDayTimeline(
          matches,
          {'meu'},
          reference,
          tournamentRunningToday: true,
        ),
        isEmpty,
      );
    });

    test('começou hoje entra mesmo agendada para ontem', () {
      final matches = [
        _match(
          id: 'atrasada',
          teamAId: 'meu',
          teamBId: 'y',
          status: TournamentMatchStatus.inProgress,
          scheduleTime: DateTime(2026, 8, 19, 18, 0),
          matchStartedAt: DateTime(2026, 8, 20, 9, 30),
        ),
      ];

      final timeline = myTournamentDayTimeline(matches, {'meu'}, reference);

      expect(timeline.map((m) => m.id), ['atrasada']);
    });

    test('âncora de outro dia não cai no caso do torneio rolando', () {
      final matches = [
        _match(
          id: 'ontem',
          teamAId: 'meu',
          teamBId: 'y',
          scheduleTime: DateTime(2026, 8, 19, 9, 0),
        ),
      ];

      expect(
        myTournamentDayTimeline(
          matches,
          {'meu'},
          reference,
          tournamentRunningToday: true,
        ),
        isEmpty,
      );
    });

    test('agendadas primeiro, sem horário no fim por matchNumber', () {
      final matches = [
        _match(id: 'sem-b', teamAId: 'meu', teamBId: 'y', matchNumber: 9),
        _match(
          id: 'com-horario',
          teamAId: 'meu',
          teamBId: 'y',
          scheduleTime: DateTime(2026, 8, 20, 15, 0),
        ),
        _match(id: 'sem-a', teamAId: 'meu', teamBId: 'y', matchNumber: 4),
      ];

      final timeline = myTournamentDayTimeline(
        matches,
        {'meu'},
        reference,
        tournamentRunningToday: true,
      );

      expect(timeline.map((m) => m.id), ['com-horario', 'sem-a', 'sem-b']);
    });
  });

  group('liveTournamentMatches', () {
    test('só partidas In Progress entram', () {
      final matches = [
        _match(id: 'agendada', status: TournamentMatchStatus.scheduled),
        _match(id: 'ao-vivo', status: TournamentMatchStatus.inProgress),
        _match(id: 'encerrada', status: TournamentMatchStatus.completed),
        _match(id: 'cancelada', status: TournamentMatchStatus.canceled),
      ];

      final live = liveTournamentMatches(matches);

      expect(live.map((m) => m.id), ['ao-vivo']);
    });

    test('ordena por horário; sem horário vai pro fim', () {
      final matches = [
        _match(
          id: 'sem-horario',
          status: TournamentMatchStatus.inProgress,
          matchNumber: 1,
        ),
        _match(
          id: 'tarde',
          status: TournamentMatchStatus.inProgress,
          matchNumber: 2,
          scheduleTime: DateTime(2026, 8, 20, 14, 0),
        ),
        _match(
          id: 'manha',
          status: TournamentMatchStatus.inProgress,
          matchNumber: 3,
          scheduleTime: DateTime(2026, 8, 20, 9, 0),
        ),
      ];

      final live = liveTournamentMatches(matches);

      expect(live.map((m) => m.id), ['manha', 'tarde', 'sem-horario']);
    });

    test('sem horário dos dois lados desempata por matchNumber', () {
      final matches = [
        _match(
          id: 'jogo-7',
          status: TournamentMatchStatus.inProgress,
          matchNumber: 7,
        ),
        _match(
          id: 'jogo-2',
          status: TournamentMatchStatus.inProgress,
          matchNumber: 2,
        ),
      ];

      final live = liveTournamentMatches(matches);

      expect(live.map((m) => m.id), ['jogo-2', 'jogo-7']);
    });
  });

  group('tournamentIsEventToday', () {
    final tournament = _tournament(
      startDate: DateTime(2026, 8, 20, 8, 0),
      endDate: DateTime(2026, 8, 22, 18, 0),
    );

    test('false antes do início', () {
      expect(
        tournamentIsEventToday(tournament, DateTime(2026, 8, 19, 23, 59)),
        isFalse,
      );
    });

    test('true no primeiro dia, mesmo antes do horário de início', () {
      expect(
        tournamentIsEventToday(tournament, DateTime(2026, 8, 20, 0, 30)),
        isTrue,
      );
    });

    test('true no último dia, mesmo depois do horário de fim', () {
      expect(
        tournamentIsEventToday(tournament, DateTime(2026, 8, 22, 23, 0)),
        isTrue,
      );
    });

    test('false depois do fim', () {
      expect(
        tournamentIsEventToday(tournament, DateTime(2026, 8, 23, 0, 1)),
        isFalse,
      );
    });

    test('endDate null usa o startDate como fim', () {
      final oneDay = _tournament(
        startDate: DateTime(2026, 8, 20, 8, 0),
        endDate: null,
      );

      expect(
        tournamentIsEventToday(oneDay, DateTime(2026, 8, 20, 22, 0)),
        isTrue,
      );
      expect(
        tournamentIsEventToday(oneDay, DateTime(2026, 8, 21, 1, 0)),
        isFalse,
      );
    });
  });

  group('tournamentDetailHeroMeta', () {
    test('torneio de 1 dia fora do evento: data do startDate + lugar', () {
      // 20/08/2026 é uma quinta-feira.
      final tournament = _tournament(
        startDate: DateTime(2026, 8, 20),
        endDate: DateTime(2026, 8, 20),
      );

      final meta =
          tournamentDetailHeroMeta(tournament, DateTime(2026, 8, 10, 12, 0));

      expect(meta, 'Qui 20 ago · Arena X, Goiânia');
    });

    test('torneio de 3 dias com now no dia 2: usa a data de hoje e o contador',
        () {
      final tournament = _tournament(
        startDate: DateTime(2026, 8, 19),
        endDate: DateTime(2026, 8, 21),
      );

      final meta =
          tournamentDetailHeroMeta(tournament, DateTime(2026, 8, 20, 10, 0));

      expect(meta, contains('dia 2 de 3'));
      // A data exibida é a de HOJE (20/08), não a do startDate (19/08).
      expect(meta, startsWith('Qui 20 ago'));
    });

    test('sem location e city não sobra separador', () {
      final tournament = _tournament(
        startDate: DateTime(2026, 8, 20),
        endDate: DateTime(2026, 8, 20),
        location: '',
        city: '',
      );

      final meta =
          tournamentDetailHeroMeta(tournament, DateTime(2026, 8, 10, 12, 0));

      expect(meta, 'Qui 20 ago');
      expect(meta, isNot(contains('·')));
    });

    test('só city preenchida: junta sem vírgula sobrando', () {
      final tournament = _tournament(
        startDate: DateTime(2026, 8, 20),
        endDate: DateTime(2026, 8, 20),
        location: '',
        city: 'Goiânia',
      );

      final meta =
          tournamentDetailHeroMeta(tournament, DateTime(2026, 8, 10, 12, 0));

      expect(meta, 'Qui 20 ago · Goiânia');
    });
  });
}
