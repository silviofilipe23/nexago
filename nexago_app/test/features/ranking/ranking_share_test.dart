import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/ranking/domain/ranking_list_models.dart';
import 'package:nexago_app/features/ranking/domain/ranking_share.dart';

RankingListEntry _entry(
  int rank, {
  bool me = false,
  RankingFormatFilter? format = RankingFormatFilter.dupla,
}) =>
    RankingListEntry(
      rank: rank,
      points: 1000 - rank * 10,
      tournamentsCount: 2,
      displayName: 'Dupla $rank',
      subtitle: '',
      isCurrentUser: me,
      entityId: 't$rank',
      teamFormat: format,
    );

List<RankingListEntry> _field(int n, {int? mine}) => [
      // Fora de ordem de propósito: a arte ordena pela posição.
      for (var r = n; r >= 1; r--) _entry(r, me: r == mine),
    ];

const _teams = RankingPageFilter(
  mode: RankingListMode.teams,
  year: 2026,
  gender: RankingGenderFilter.female,
  level: RankingLevelFilter.open,
);

void main() {
  group('rankingShareLink', () {
    test('leva o recorte inteiro e quem compartilhou', () {
      final uri = Uri.parse(rankingShareLink(
        filter: _teams.copyWith(format: RankingFormatFilter.trio),
        sportCode: 'VOLEI_PRAIA',
        sharedBy: 'uid-ray',
      ));

      expect(uri.host, 'atleta.nexago.com.br');
      expect(uri.path, '/ranking');
      expect(uri.queryParameters, {
        'esporte': 'VOLEI_PRAIA',
        'modo': 'equipes',
        'ano': '2026',
        'genero': 'feminino',
        'nivel': 'open',
        'formato': 'trio',
        'por': 'uid-ray',
      });
    });

    test('ranking geral sem recorte: só esporte e modo', () {
      final uri = Uri.parse(rankingShareLink(
        filter: const RankingPageFilter(),
        sportCode: 'BEACH_TENNIS',
      ));

      expect(uri.queryParameters, {
        'esporte': 'BEACH_TENNIS',
        'modo': 'atletas',
      });
    });

    test('formato não viaja no Individual', () {
      final uri = Uri.parse(rankingShareLink(
        filter: const RankingPageFilter(format: RankingFormatFilter.trio),
        sportCode: 'VOLEI_PRAIA',
      ));

      expect(uri.queryParameters.containsKey('formato'), isFalse);
    });

    test('nível usa o código da faixa, sem acento', () {
      final uri = Uri.parse(rankingShareLink(
        filter: const RankingPageFilter(
          level: RankingLevelFilter.intermediario,
        ),
        sportCode: 'VOLEI_PRAIA',
      ));

      expect(uri.queryParameters['nivel'], 'intermediario');
    });
  });

  test('filtros incluídos seguem a ordem da tela', () {
    expect(
      rankingShareFilterLabels(
        _teams.copyWith(format: RankingFormatFilter.dupla),
        sportLabel: 'Vôlei de Praia',
      ),
      ['Equipes', 'Vôlei de Praia', '2026', 'Feminino', 'Open', 'Dupla'],
    );
    expect(
      rankingShareFilterLabels(
        const RankingPageFilter(),
        sportLabel: 'Beach Tennis',
      ),
      ['Atletas', 'Beach Tennis', 'Geral'],
    );
  });

  test('Post para no Top 10', () {
    expect(RankingShareFormat.post.topOptions, [5, 10]);
    expect(RankingShareFormat.story.topOptions, [5, 10, 20]);
    expect(RankingShareFormat.link.hasImage, isFalse);
  });

  group('rankingShareDataFrom', () {
    RankingShareData build({
      List<RankingListEntry>? entries,
      int top = 10,
      bool highlight = true,
      RankingPageFilter filter = _teams,
    }) =>
        rankingShareDataFrom(
          entries: entries ?? _field(30, mine: 6),
          filter: filter,
          sportLabel: 'Vôlei de Praia',
          top: top,
          highlightMine: highlight,
          link: 'https://atleta.nexago.com.br/ranking?modo=equipes',
          now: DateTime(2026, 10, 29),
        );

    test('pódio em ordem e linhas até o Top', () {
      final data = build();

      expect(data.podium.map((e) => e.rank), [1, 2, 3]);
      expect(data.rows.map((e) => e.rank), [4, 5, 6, 7, 8, 9, 10]);
      expect(data.mine?.rank, 6);
      expect(data.mineOutside, isFalse);
    });

    test('destaque fora do Top entra depois das linhas', () {
      final data = build(entries: _field(30, mine: 17), top: 5);

      expect(data.rows.map((e) => e.rank), [4, 5]);
      expect(data.mine?.rank, 17);
      expect(data.mineOutside, isTrue);
    });

    test('destaque desligado não marca ninguém', () {
      final data = build(highlight: false);

      expect(data.mine, isNull);
      expect(data.mineOutside, isFalse);
    });

    test('recorte menor que o Top mostra o que tem', () {
      final data = build(entries: _field(2), top: 20);

      expect(data.podium.map((e) => e.rank), [1, 2]);
      expect(data.rows, isEmpty);
      expect(data.mine, isNull);
    });

    test('textos da arte', () {
      final data = build();

      expect(data.kicker, 'RANKING 2026 · DUPLAS');
      expect(data.title, 'Feminino Open');
      expect(data.subtitle, 'Vôlei de Praia 2026');
      expect(data.tags, [
        'Vôlei de Praia',
        'Feminino',
        'Open',
        'Temporada 2026',
      ]);
      expect(data.updatedLabel, 'ATUALIZADO 29 OUT');
    });

    test('sem recorte o título é o Top e o kicker é o geral', () {
      final data = build(
        filter: const RankingPageFilter(),
        entries: [
          for (var r = 1; r <= 12; r++) _entry(r, format: null),
        ],
      );

      expect(data.kicker, 'RANKING GERAL · ATLETAS');
      expect(data.title, 'Top 10');
      expect(data.subtitle, 'Vôlei de Praia');
      expect(data.tags, ['Vôlei de Praia', 'Todas as temporadas']);
    });

    test('trio no meio das duplas vira "equipes"', () {
      final data = build(
        filter: _teams.copyWith(level: RankingLevelFilter.all),
        entries: [
          _entry(1),
          _entry(2, format: RankingFormatFilter.trio),
        ],
      );

      expect(data.unit, 'equipes');
      expect(data.title, 'Feminino');
    });

    test('legenda e mensagem levam o link', () {
      final data = build();

      expect(
        data.caption,
        'Top 10 do ranking 2026 de duplas de Vôlei de Praia '
        '(Feminino, Open) no nexaGO. Ranking completo: '
        'https://atleta.nexago.com.br/ranking?modo=equipes #vamosnexa',
      );
      expect(
        data.message,
        'Olha o ranking 2026 de duplas de Vôlei de Praia (Feminino, Open) '
        'no nexaGO: https://atleta.nexago.com.br/ranking?modo=equipes',
      );
    });
  });

  test('rótulo do destaque segue a linha de quem compartilha', () {
    expect(
      rankingShareHighlightLabel(_entry(1), isTeam: true),
      'Destacar minha dupla',
    );
    expect(
      rankingShareHighlightLabel(
        _entry(1, format: RankingFormatFilter.quarteto),
        isTeam: true,
      ),
      'Destacar minha equipe',
    );
    expect(
      rankingShareHighlightLabel(_entry(1, format: null), isTeam: false),
      'Destacar minha posição',
    );
  });
}
