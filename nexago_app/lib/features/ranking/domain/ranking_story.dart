import 'package:flutter/foundation.dart';

import '../../../core/brand/nexa_hashtag.dart';
import '../../arenas/domain/booking_story.dart';
import 'ranking_list_models.dart';

/// Informações que o atleta liga/desliga no story do ranking, na ordem dos
/// chips.
enum RankingStoryInfo { identity, points, field, movement }

/// Faixa da posição: o pódio ganha medalha (ouro, prata, bronze); top 5 e
/// top 10 só mudam a frase.
enum RankingStoryTier {
  gold,
  silver,
  bronze,
  top5,
  top10,
  rest;

  bool get isPodium => index <= RankingStoryTier.bronze.index;
}

/// Tudo o que a arte do story do ranking escreve. A posição é a da lista que o
/// atleta está vendo — com gênero/nível/formato ela é renumerada, por isso o
/// recorte vai sempre estampado ([cutLine]).
@immutable
class RankingStoryData {
  const RankingStoryData({
    required this.rank,
    required this.total,
    required this.points,
    required this.tournamentsCount,
    required this.isTeam,
    required this.name,
    required this.people,
    required this.sportLabel,
    required this.unit,
    required this.identityLabel,
    this.season,
    this.cutLabels = const [],
    this.pointsAbove,
    this.movement,
    this.previousPosition,
    this.debut = false,
  });

  final int rank;

  /// Quantos estão no mesmo recorte ("entre 48 duplas").
  final int total;
  final int points;
  final int tournamentsCount;
  final bool isTeam;

  /// "Ana / Bruno" ou o nome do atleta, como na lista.
  final String name;

  /// Os rostos da dupla (ou do atleta), na ordem da lista.
  final List<BookingStoryPerson> people;

  /// "Vôlei de Praia".
  final String sportLabel;

  /// Plural em caixa baixa: "duplas", "trios", "equipes", "atletas".
  final String unit;

  /// "Dupla", "Trio", "Equipe" ou "Atleta" — o chip e a linha do nome.
  final String identityLabel;

  /// Temporada; `null` é o ranking geral.
  final int? season;

  /// Recortes da folha de filtros que mudam a numeração ("Masculino",
  /// "Intermediário").
  final List<String> cutLabels;

  /// Pontos de quem está uma posição acima; `null` no 1º.
  final int? pointsAbove;

  /// Posições ganhas na última etapa (`< 0` caiu, `0` manteve); `null` sem
  /// etapa conhecida ou na estreia.
  final int? movement;

  /// Posição antes da última etapa; `null` sem etapa conhecida ou na estreia.
  final int? previousPosition;

  /// Os primeiros pontos do período vieram na última etapa.
  final bool debut;

  RankingStoryTier get tier => switch (rank) {
        1 => RankingStoryTier.gold,
        2 => RankingStoryTier.silver,
        3 => RankingStoryTier.bronze,
        <= 5 => RankingStoryTier.top5,
        <= 10 => RankingStoryTier.top10,
        _ => RankingStoryTier.rest,
      };

  /// A linha em cima do número. Com a variação à vista, a etapa que levou à
  /// faixa vira a notícia ("ENTRAMOS NO TOP 10"); sem ela, só a faixa.
  String kicker({bool showMovement = true}) {
    final news = showMovement && _reachedTier;
    return switch (tier) {
      RankingStoryTier.gold when news =>
        isTeam ? 'ASSUMIMOS A LIDERANÇA' : 'ASSUMI A LIDERANÇA',
      RankingStoryTier.gold =>
        isTeam ? 'LÍDERES DO RANKING' : 'LÍDER DO RANKING',
      RankingStoryTier.silver ||
      RankingStoryTier.bronze when news =>
        isTeam ? 'ENTRAMOS NO PÓDIO' : 'ENTREI NO PÓDIO',
      RankingStoryTier.silver =>
        isTeam ? 'VICE-LÍDERES DO RANKING' : 'VICE-LÍDER DO RANKING',
      RankingStoryTier.bronze => 'NO PÓDIO DO RANKING',
      RankingStoryTier.top5 when news =>
        isTeam ? 'ENTRAMOS NO TOP 5' : 'ENTREI NO TOP 5',
      RankingStoryTier.top5 => 'NO TOP 5 DO RANKING',
      RankingStoryTier.top10 when news =>
        isTeam ? 'ENTRAMOS NO TOP 10' : 'ENTREI NO TOP 10',
      RankingStoryTier.top10 => 'NO TOP 10 DO RANKING',
      RankingStoryTier.rest when showMovement && (movement ?? 0) > 0 =>
        isTeam ? 'SUBIMOS NO RANKING' : 'SUBI NO RANKING',
      RankingStoryTier.rest =>
        isTeam ? 'NOSSA POSIÇÃO NO RANKING' : 'MINHA POSIÇÃO NO RANKING',
    };
  }

  /// Chegou à faixa nesta etapa: estreou nela ou vinha de fora (liderança,
  /// pódio, top 5, top 10).
  bool get _reachedTier {
    final limit = switch (tier) {
      RankingStoryTier.gold => 1,
      RankingStoryTier.silver || RankingStoryTier.bronze => 3,
      RankingStoryTier.top5 => 5,
      RankingStoryTier.top10 => 10,
      RankingStoryTier.rest => null,
    };
    if (limit == null) return false;
    final before = previousPosition;
    return debut || (before != null && before > limit);
  }

  /// "+3 POSIÇÕES", "−2 POSIÇÕES" ou a estreia; `null` sem variação.
  String? get movementLabel {
    if (debut) {
      return season == null ? 'ESTREIA NO RANKING' : 'ESTREIA NA TEMPORADA';
    }
    final m = movement;
    if (m == null || m == 0) return null;
    final n = m.abs();
    return '${m > 0 ? '+' : '−'}$n ${n == 1 ? 'POSIÇÃO' : 'POSIÇÕES'}';
  }

  /// O selo do topo da arte.
  String get pillLabel => season == null ? 'RANKING GERAL' : 'RANKING $season';

  /// "PÓDIO · OURO"; `null` fora do pódio.
  String? get medalLabel => switch (tier) {
        RankingStoryTier.gold => 'PÓDIO · OURO',
        RankingStoryTier.silver => 'PÓDIO · PRATA',
        RankingStoryTier.bronze => 'PÓDIO · BRONZE',
        _ => null,
      };

  /// "VÔLEI DE PRAIA · DUPLAS · MASCULINO": de qual lista é a posição.
  String get cutLine => [
        sportLabel,
        isTeam ? _capitalize(unit) : 'Individual',
        ...cutLabels,
      ].where((s) => s.trim().isNotEmpty).join(' · ').toUpperCase();

  /// "ENTRE 48 DUPLAS".
  String get fieldLabel => 'ENTRE $total ${unit.toUpperCase()}';

  /// "Dupla · 4 torneios", embaixo do nome.
  String get identityLine => tournamentsCount <= 0
      ? identityLabel
      : '$identityLabel · $tournamentsCount '
          '${tournamentsCount == 1 ? 'torneio' : 'torneios'}';

  /// Pontos que faltam para a posição de cima; `null` sem ninguém acima ou
  /// empatado.
  int? get pointsToClimb {
    final above = pointsAbove;
    if (above == null || above <= points) return null;
    return above - points;
  }

  String infoLabel(RankingStoryInfo info) => switch (info) {
        RankingStoryInfo.identity => identityLabel,
        RankingStoryInfo.points => 'Pontos',
        RankingStoryInfo.field => 'Total no ranking',
        RankingStoryInfo.movement => 'Variação',
      };
}

/// Monta o story a partir da linha de quem compartilha e da lista do recorte
/// aberto na tela ([entries] sem a busca — a busca não renumera).
RankingStoryData rankingStoryDataFrom({
  required RankingListEntry entry,
  required List<RankingListEntry> entries,
  required RankingPageFilter filter,
  required String sportLabel,
}) {
  final isTeam = filter.mode == RankingListMode.teams;
  final above = entries.where((e) => e.rank == entry.rank - 1).firstOrNull;
  final change = _lastStageChange(entry, entries);
  return RankingStoryData(
    rank: entry.rank,
    total: entries.length,
    points: entry.points,
    tournamentsCount: entry.tournamentsCount,
    isTeam: isTeam,
    name: entry.displayName,
    people: _peopleOf(entry),
    sportLabel: sportLabel,
    unit: isTeam ? _teamUnit(filter.format, entries) : 'atletas',
    identityLabel: isTeam ? _teamLabel(entry.teamFormat) : 'Atleta',
    season: filter.year,
    cutLabels: [
      if (filter.gender != RankingGenderFilter.all) filter.gender.label,
      if (filter.level != RankingLevelFilter.all) filter.level.label,
    ],
    pointsAbove: above?.points,
    movement: change.movement,
    previousPosition: change.previous,
    debut: change.debut,
  );
}

/// A posição antes da última etapa, no MESMO recorte: tira dos pontos de cada
/// um o que veio dela e conta quem ficava à frente. Conta "quem tem mais
/// pontos" dos dois lados (e não a ordem da lista) para empate não virar
/// "subiu 1"/"caiu 1" de mentira.
({int? movement, int? previous, bool debut}) _lastStageChange(
  RankingListEntry entry,
  List<RankingListEntry> entries,
) {
  final before = entry.pointsBeforeLastStage;
  if (before == null) return (movement: null, previous: null, debut: false);
  if (before <= 0) return (movement: null, previous: null, debut: true);
  int ahead(int Function(RankingListEntry) pointsOf, int mine) =>
      entries.where((e) => pointsOf(e) > mine).length;
  final previous =
      1 + ahead((e) => e.pointsBeforeLastStage ?? e.points, before);
  final now = 1 + ahead((e) => e.points, entry.points);
  return (movement: previous - now, previous: previous, debut: false);
}

/// Chips que fazem sentido para esta posição: sem pontos, nada de "0 pontos";
/// sozinho no recorte, nada de "entre 1 dupla".
List<RankingStoryInfo> rankingStoryInfosFor(RankingStoryData data) => [
      RankingStoryInfo.identity,
      if (data.points > 0) RankingStoryInfo.points,
      if (data.total > 1) RankingStoryInfo.field,
      if (data.movementLabel != null) RankingStoryInfo.movement,
    ];

/// Chips que abrem desligados: queda de posição o atleta posta se quiser.
Set<RankingStoryInfo> rankingStoryInfosOffByDefault(RankingStoryData data) => {
      if ((data.movement ?? 0) < 0) RankingStoryInfo.movement,
    };

/// Legenda que vai junto do PNG no "Postar no story". Sem a variação na arte
/// ([showMovement] falso), ela também sai da legenda.
String rankingStoryShareText(
  RankingStoryData data, {
  bool showMovement = true,
}) {
  final ranking =
      data.season == null ? 'ranking geral' : 'ranking ${data.season}';
  final cut = data.cutLabels.isEmpty ? '' : ' (${data.cutLabels.join(', ')})';
  final lead =
      '${data.rank}º no $ranking de ${data.unit} de ${data.sportLabel}$cut!';
  final gap = data.pointsToClimb;
  final tail = data.rank == 1
      ? (data.isTeam
          ? 'Quem vem tirar a gente daqui?'
          : 'Quem vem me tirar daqui?')
      : gap == null
          ? 'Bora subir!'
          : 'Faltam $gap ${gap == 1 ? 'ponto' : 'pontos'} '
              '${data.rank == 2 ? 'pro topo' : 'pro ${data.rank - 1}º'}.';
  final m = data.movement ?? 0;
  final change = !showMovement
      ? ''
      : data.debut
          ? (data.isTeam ? ' Estreamos no ranking.' : ' Estreei no ranking.')
          : m > 0
              ? ' ${data.isTeam ? 'Subimos' : 'Subi'} $m '
                  '${m == 1 ? 'posição' : 'posições'} na última etapa.'
              : '';
  return withNexaHashtag('$lead$change $tail');
}

List<BookingStoryPerson> _peopleOf(RankingListEntry entry) {
  if (entry.isTeam) {
    return [
      BookingStoryPerson(
        firstName: '',
        initials: entry.player1Initials ?? '',
        avatarUrl: entry.player1AvatarUrl,
      ),
      BookingStoryPerson(
        firstName: '',
        initials: entry.player2Initials ?? '',
        avatarUrl: entry.player2AvatarUrl,
      ),
    ];
  }
  return [
    BookingStoryPerson(
      firstName: '',
      initials: entry.initials ?? '',
      avatarUrl: entry.avatarUrl,
    ),
  ];
}

/// Com o formato escolhido na folha, é ele; sem escolha, "duplas" só quando a
/// lista inteira é de duplas — trio no meio vira "equipes".
String _teamUnit(RankingFormatFilter format, List<RankingListEntry> entries) {
  final shown = format != RankingFormatFilter.all
      ? format
      : entries.every((e) => e.teamFormat == RankingFormatFilter.dupla)
          ? RankingFormatFilter.dupla
          : null;
  return switch (shown) {
    RankingFormatFilter.dupla => 'duplas',
    RankingFormatFilter.trio => 'trios',
    RankingFormatFilter.quarteto => 'quartetos',
    RankingFormatFilter.quinteto => 'quintetos',
    _ => 'equipes',
  };
}

String _teamLabel(RankingFormatFilter? format) =>
    format == null || format == RankingFormatFilter.all
        ? 'Equipe'
        : format.label;

String _capitalize(String s) =>
    s.isEmpty ? s : '${s[0].toUpperCase()}${s.substring(1)}';
