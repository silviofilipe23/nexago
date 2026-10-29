import 'package:flutter/foundation.dart';

import '../../../core/brand/nexa_hashtag.dart';
import '../../../core/deep_link/app_domains.dart';
import 'ranking_list_mapper.dart' show sortedRankingEntries;
import 'ranking_list_models.dart';
import 'ranking_story.dart' show rankingTeamUnit;

/// Como o ranking sai do app: a arte 9:16, a 4:5 ou só o endereço.
enum RankingShareFormat {
  story('Story'),
  post('Post'),
  link('Só link');

  const RankingShareFormat(this.label);

  final String label;

  bool get hasImage => this != RankingShareFormat.link;

  /// Quantas posições a arte mostra. O Top 20 não cabe no 4:5 sem virar
  /// letra miúda, então o Post para no 10.
  List<int> get topOptions =>
      this == RankingShareFormat.post ? const [5, 10] : const [5, 10, 20];
}

/// Rótulo do endereço impresso na arte; o QR leva o endereço inteiro.
const String rankingShareLinkLabel = '${AppDomains.athletePortalHost}/ranking';

/// O ranking do portal do atleta com o recorte da tela na URL. Quem abre cai
/// em `/ranking` já filtrado (e pode desfazer os filtros lá). `/ranking` não
/// é App Link: abre no navegador mesmo com o app instalado, como o perfil da
/// equipe. [sharedBy] é o uid de quem compartilhou — o portal escreve
/// "Fulano compartilhou este ranking".
///
/// Os códigos são os que `athlete-ranking.share-link.ts` lê no portal: os
/// dois lados mudam juntos.
String rankingShareLink({
  required RankingPageFilter filter,
  required String sportCode,
  String? sharedBy,
}) {
  final isTeam = filter.mode == RankingListMode.teams;
  final by = sharedBy?.trim() ?? '';
  return Uri.https(AppDomains.athletePortalHost, '/ranking', {
    'esporte': sportCode,
    'modo': isTeam ? 'equipes' : 'atletas',
    if (filter.year != null) 'ano': '${filter.year}',
    if (filter.gender != RankingGenderFilter.all)
      'genero': _genderCode(filter.gender),
    if (filter.level != RankingLevelFilter.all) 'nivel': filter.level.name,
    if (isTeam && filter.format != RankingFormatFilter.all)
      'formato': filter.format.name,
    if (by.isNotEmpty) 'por': by,
  }).toString();
}

String _genderCode(RankingGenderFilter gender) => switch (gender) {
      RankingGenderFilter.male => 'masculino',
      RankingGenderFilter.female => 'feminino',
      RankingGenderFilter.mixed => 'misto',
      RankingGenderFilter.all => '',
    };

/// "Filtros incluídos" da folha: tudo o que define a lista, na ordem da tela
/// (aba, esporte, temporada e os recortes da folha de filtros).
List<String> rankingShareFilterLabels(
  RankingPageFilter filter, {
  required String sportLabel,
}) =>
    [
      filter.mode == RankingListMode.teams ? 'Equipes' : 'Atletas',
      sportLabel,
      filter.year == null ? 'Geral' : '${filter.year}',
      ..._cutLabels(filter),
    ];

/// Os recortes da folha de filtros que estão ligados ("Feminino", "Open",
/// "Trio").
List<String> _cutLabels(RankingPageFilter filter) => [
      if (filter.gender != RankingGenderFilter.all) filter.gender.label,
      if (filter.level != RankingLevelFilter.all) filter.level.label,
      if (filter.mode == RankingListMode.teams &&
          filter.format != RankingFormatFilter.all)
        filter.format.label,
    ];

const _months = [
  'JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', //
  'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ',
];

/// Tudo o que a arte do ranking compartilhado escreve: o recorte, o pódio, as
/// linhas até o Top escolhido e — com "Destacar" ligado — a linha de quem
/// compartilha, mesmo fora do Top.
@immutable
class RankingShareData {
  const RankingShareData({
    required this.isTeam,
    required this.sportLabel,
    required this.unit,
    required this.top,
    required this.podium,
    required this.rows,
    required this.updatedAt,
    required this.link,
    this.season,
    this.genderLabel,
    this.levelLabel,
    this.mine,
    this.mineOutside = false,
  });

  final bool isTeam;

  /// "Vôlei de Praia".
  final String sportLabel;

  /// Plural em caixa baixa: "duplas", "trios", "equipes", "atletas".
  final String unit;

  /// Temporada; `null` é o ranking geral.
  final int? season;

  /// "Feminino", "Open" — `null` quando o recorte não está ligado.
  final String? genderLabel;
  final String? levelLabel;

  /// 5, 10 ou 20.
  final int top;

  /// 1º, 2º e 3º, nessa ordem (pode vir com menos de três).
  final List<RankingListEntry> podium;

  /// Do 4º ao [top].
  final List<RankingListEntry> rows;

  /// A linha destacada; `null` com o destaque desligado ou fora do recorte.
  final RankingListEntry? mine;

  /// [mine] está abaixo do [top]: entra depois das linhas, separada.
  final bool mineOutside;

  /// Quando a arte foi gerada — o link é vivo, a imagem não.
  final DateTime updatedAt;

  /// Endereço completo, com os filtros (o do QR).
  final String link;

  bool get isEmpty => podium.isEmpty;

  /// "RANKING 2026 · DUPLAS".
  String get kicker =>
      '${season == null ? 'RANKING GERAL' : 'RANKING $season'} · '
      '${unit.toUpperCase()}';

  /// "Feminino Open"; sem recorte, "Top 10".
  String get title {
    final cut = [genderLabel, levelLabel].whereType<String>().join(' ');
    return cut.isEmpty ? 'Top $top' : cut;
  }

  /// A linha laranja do título: "Vôlei de Praia 2026".
  String get subtitle => season == null ? sportLabel : '$sportLabel $season';

  /// Os chips da arte: o esporte, os recortes e a temporada.
  List<String> get tags => [
        sportLabel,
        if (genderLabel != null) genderLabel!,
        if (levelLabel != null) levelLabel!,
        season == null ? 'Todas as temporadas' : 'Temporada $season',
      ];

  /// "ATUALIZADO 29 OUT".
  String get updatedLabel =>
      'ATUALIZADO ${updatedAt.day} ${_months[updatedAt.month - 1]}';

  /// "ranking 2026 de duplas de Vôlei de Praia (Feminino, Open)".
  String get _rankingPhrase {
    final ranking = season == null ? 'ranking geral' : 'ranking $season';
    final cut = [genderLabel, levelLabel].whereType<String>();
    final cutText = cut.isEmpty ? '' : ' (${cut.join(', ')})';
    return '$ranking de $unit de $sportLabel$cutText';
  }

  /// Legenda que vai junto da imagem.
  String get caption => withNexaHashtag(
        'Top $top do $_rankingPhrase no nexaGO. Ranking completo: $link',
      );

  /// O texto do "Mensagem" e do "Só link": sem imagem e sem hashtag, é
  /// conversa.
  String get message => 'Olha o $_rankingPhrase no nexaGO: $link';
}

/// Monta a arte a partir da lista do recorte aberto ([entries] sem a busca —
/// a busca não renumera).
RankingShareData rankingShareDataFrom({
  required List<RankingListEntry> entries,
  required RankingPageFilter filter,
  required String sportLabel,
  required int top,
  required bool highlightMine,
  required String link,
  required DateTime now,
}) {
  final isTeam = filter.mode == RankingListMode.teams;
  final sorted = sortedRankingEntries(entries);
  final shown = sorted.where((e) => e.rank >= 1 && e.rank <= top).toList();
  // Quem tem mais de uma dupla no recorte destaca a melhor.
  final mine =
      highlightMine ? sorted.where((e) => e.isCurrentUser).firstOrNull : null;
  return RankingShareData(
    isTeam: isTeam,
    sportLabel: sportLabel,
    unit: isTeam ? rankingTeamUnit(filter.format, entries) : 'atletas',
    season: filter.year,
    genderLabel:
        filter.gender == RankingGenderFilter.all ? null : filter.gender.label,
    levelLabel:
        filter.level == RankingLevelFilter.all ? null : filter.level.label,
    top: top,
    podium: shown.where((e) => e.rank <= 3).toList(),
    rows: shown.where((e) => e.rank > 3).toList(),
    mine: mine,
    mineOutside: mine != null && mine.rank > top,
    updatedAt: now,
    link: link,
  );
}

/// "Destacar minha dupla": o nome do que se destaca, pela linha de quem
/// compartilha.
String rankingShareHighlightLabel(RankingListEntry mine,
    {required bool isTeam}) {
  if (!isTeam) return 'Destacar minha posição';
  return mine.teamFormat == RankingFormatFilter.dupla
      ? 'Destacar minha dupla'
      : 'Destacar minha equipe';
}
