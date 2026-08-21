import '../tournament_match.dart';
import '../tournament_match_status.dart';
import '../tournament_matches_logic.dart';

/// Qual categoria o Modo Focus coloca em foco neste torneio.
///
/// A primeira versão respondia só `athleteNextMatchProvider` — a categoria da
/// PRÓXIMA partida do atleta. Mas `pickAthleteNextMatch` descarta partida
/// concluída E partida de outro dia, então ela devolve `null` em três
/// situações comuns:
///
///  - o atleta foi eliminado (ou foi campeão) — não há próxima;
///  - a chave dele ainda não foi sorteada;
///  - a próxima partida existe, mas é amanhã.
///
/// Sem categoria o Focus não sabe o FORMATO, e a nav cai em `GRUPO` mesmo numa
/// categoria de dupla eliminatória — além de o grupo e a chave virarem a tela
/// vazia do `_NoCategory`. Daí a escada abaixo: a pergunta "onde eu estou
/// neste torneio" continua tendo resposta depois que o dia de jogo acaba.
///
/// A ordem é deliberada. Partida por jogar vem antes de partida jogada porque
/// o Focus olha para frente; entre as jogadas, a ÚLTIMA é a que descreve onde
/// a campanha parou.
String? resolveFocusCategoryId({
  /// A categoria da próxima partida do atleta, quando ela é neste torneio.
  String? nextMatchCategoryId,

  /// Todas as partidas do torneio — as do atleta são recortadas aqui.
  required List<TournamentMatch> matches,

  /// Os times do atleta neste torneio (`athleteTeamIdsForHighlight`).
  required Set<String> athleteTeamIds,

  /// As categorias em que ele está inscrito, na ordem em que o torneio as
  /// publica (`categoryOffers`). É o desempate quando não há partida nenhuma.
  required List<String> registeredCategoryIdsInOfferOrder,
}) {
  final fromNext = nextMatchCategoryId?.trim() ?? '';
  if (fromNext.isNotEmpty) return fromNext;

  final mine = filterAthleteMatches(matches, athleteTeamIds);

  final pending = mine
      .where((m) => !TournamentMatchStatus.isCompleted(m.status))
      .toList()
    ..sort(_byEarliest);
  final nextCategory = pending.isEmpty ? '' : pending.first.categoryId.trim();
  if (nextCategory.isNotEmpty) return nextCategory;

  final played = mine
      .where((m) => TournamentMatchStatus.isCompleted(m.status))
      .toList()
    ..sort(_byEarliest);
  final lastCategory = played.isEmpty ? '' : played.last.categoryId.trim();
  if (lastCategory.isNotEmpty) return lastCategory;

  for (final id in registeredCategoryIdsInOfferOrder) {
    final key = id.trim();
    if (key.isNotEmpty) return key;
  }
  return null;
}

/// Cronologia da partida, do mais cedo para o mais tarde.
///
/// `matchNumber` é o desempate final, e não o critério principal: na dupla
/// eliminação WB e LB numeram por conta própria, então o número sozinho
/// embaralha as duas escadas.
int _byEarliest(TournamentMatch a, TournamentMatch b) {
  final at = _instantOf(a);
  final bt = _instantOf(b);
  if (at != null && bt != null && at != bt) return at.compareTo(bt);
  if (at != null && bt == null) return -1;
  if (at == null && bt != null) return 1;
  return a.matchNumber.compareTo(b.matchNumber);
}

/// O instante que melhor situa a partida no tempo: quando terminou, quando
/// começou ou quando está marcada — nessa ordem de confiança.
DateTime? _instantOf(TournamentMatch m) =>
    m.matchEndedAt ?? m.matchStartedAt ?? m.scheduleTime;
