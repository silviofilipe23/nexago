import 'dart:math' as math;

import '../tournament_match.dart';
import '../tournament_match_display.dart';
import '../tournament_match_status.dart';

/// A Trajetória do Focus: quanto falta pro título, por onde passa o caminho, e
/// os números da campanha. Porte de `focus/focus-journey.ts` do portal do
/// atleta — inclusive os comentários, que registram os bugs que cada guarda
/// aqui existe pra matar. Não simplifique nada sem entender qual deles volta.
///
/// Módulo puro: nada de Flutter, nada de Firestore.

/// Uma barra do gráfico "você × adversário": um set de uma partida do atleta.
class SetBar {
  const SetBar({required this.label, required this.mine, required this.theirs});

  final String label;
  final int mine;
  final int theirs;
}

class TournamentNumbers {
  const TournamentNumbers({
    required this.matches,
    required this.setsWon,
    required this.setsLost,
    required this.points,
    required this.pointsAgainst,
    required this.pointsPerSet,
    required this.sets,
  });

  final int matches;
  final int setsWon;
  final int setsLost;
  final int points;
  final int pointsAgainst;
  final double pointsPerSet;
  final List<SetBar> sets;
}

/// Um caminho de mata-mata nunca é maior que isto. Só existe pra que fiação
/// circular — planta quebrada, não dado normal — pare em vez de girar pra
/// sempre; 32 já cobre uma chave de 4 bilhões de duplas.
const int _maxHappyPath = 32;

/// `'A'`, `'B'` ou `null` — o lado do atleta na partida.
String? _sideOf(TournamentMatch m, Set<String> myTeamIds) {
  if (myTeamIds.contains(m.teamAId)) return 'A';
  if (myTeamIds.contains(m.teamBId)) return 'B';
  return null;
}

/// `'win'`, `'loss'` ou `null` (não é dele, ou ainda não terminou).
String? _outcomeOf(TournamentMatch m, Set<String> myTeamIds) {
  if (_sideOf(m, myTeamIds) == null) return null;
  if (!TournamentMatchStatus.isCompleted(m.status)) return null;
  final winner = m.winnerId?.trim() ?? '';
  if (winner.isEmpty) return null;
  return myTeamIds.contains(winner) ? 'win' : 'loss';
}

/// Ainda por jogar: nem encerrada, nem cancelada.
bool _isPending(TournamentMatch m) =>
    !TournamentMatchStatus.isCompleted(m.status) &&
    !TournamentMatchStatus.isCanceled(m.status);

/// Fases de mata-mata da categoria, da mais distante da final para a final.
List<int> knockoutRounds(List<TournamentMatch> matches, String categoryId) {
  final rounds = matches
      .where((m) => m.categoryId == categoryId && m.poolId.isEmpty && !m.isGroupMatch)
      .map((m) => m.round)
      .toSet()
      .toList()
    ..sort();
  return rounds;
}

/// O round da partida de mata-mata JÁ VENCIDA mais avançada do atleta, ou
/// [double.negativeInfinity] se ele ainda não venceu nenhuma — o piso: nenhuma
/// partida de round anterior a este pode servir de referência "pendente mais
/// cedo".
///
/// Existe porque um BYE é gravado como partida real (`teamAId=meu`,
/// `teamBId=''`, `Scheduled`) e NUNCA é jogado — sem o piso, "a pendente mais
/// cedo" ancora nesse bye pra sempre, não importa quantas fases reais o atleta
/// já tenha vencido depois dele. Byes existem em todo mata-mata que não é
/// potência de 2 (6 duplas → 2 byes, 12 → 4…), então não é caso de canto.
double wonRoundsFloorOf(
  List<TournamentMatch> myKnockouts,
  Set<String> myTeamIds,
) {
  final wonRounds = myKnockouts
      .where((m) => _outcomeOf(m, myTeamIds) == 'win')
      .map((m) => m.round)
      .toList();
  if (wonRounds.isEmpty) return double.negativeInfinity;
  return wonRounds.reduce(math.max).toDouble();
}

/// Um BYE já consumido: partida de mata-mata pendente com o slot do adversário
/// vazio, em que o atleta JÁ aparece numa rodada estritamente posterior. Nunca
/// pode ser a referência "pendente mais cedo".
///
/// [wonRoundsFloorOf] só enxerga o bye depois que o atleta vence alguma coisa —
/// antes disso o piso é -infinito e o bye segue sendo "a pendente mais cedo".
/// Mas byes são propagados pra rodada seguinte NA CONSTRUÇÃO da chave, ANTES de
/// qualquer partida real acontecer: o estado inicial de toda chave que não é
/// potência de 2 já tem o atleta com bye aparecendo em duas partidas ao mesmo
/// tempo. É esse cenário — zero vitórias ainda, mas já mais adiante — que o
/// piso sozinho não cobre.
///
/// O slot vazio SOZINHO não basta pra identificar um bye: uma partida
/// legitimamente pendente também tem o lado do adversário vazio enquanto o
/// alimentador dela não termina. O que distingue um bye é o atleta já estar
/// presente numa rodada MAIS ADIANTE.
bool _isConsumedBye(
  TournamentMatch m,
  List<TournamentMatch> myKnockouts,
  Set<String> myTeamIds,
) {
  final side = _sideOf(m, myTeamIds);
  final opponentEmpty =
      side == 'A' ? m.teamBId.isEmpty : m.teamAId.isEmpty;
  if (!opponentEmpty) return false;
  return myKnockouts.any((other) => other.round > m.round);
}

/// As partidas de mata-mata do atleta que ainda estão de fato pendentes —
/// depois de descontar o piso das já vencidas e os byes já consumidos.
///
/// Compartilhada de propósito: no portal, uma cópia da regra do piso já ficou
/// pra trás entre dois rounds de review, e as duas cópias também discordavam
/// sobre o que conta como "pendente".
/// NOTA DO PORTE (teste de mutação, 20/08): desligar o piso sozinho NÃO quebra
/// nenhum teste — a guarda do bye consumido já cobre todo dado realista, porque
/// um bye pendente de rodada anterior sempre vem acompanhado do atleta numa
/// rodada posterior. O piso só dispararia para uma pendente de rodada anterior
/// com adversário PREENCHIDO, que é dado contraditório.
///
/// Mantido mesmo assim: é o original revisado do portal, e as duas guardas
/// cobrem ângulos diferentes do mesmo bug. Não remova por parecer morto sem
/// antes provar, com fixture do gerador real, que a sobreposição é total.
List<TournamentMatch> pendingKnockoutsOf(
  List<TournamentMatch> myKnockouts,
  Set<String> myTeamIds,
) {
  final floor = wonRoundsFloorOf(myKnockouts, myTeamIds);
  return myKnockouts
      .where((m) =>
          _isPending(m) &&
          m.round >= floor &&
          !_isConsumedBye(m, myKnockouts, myTeamIds))
      .toList();
}

/// A final da categoria — em eliminação simples e a grande final da dupla
/// eliminação, que o gerador grava com o mesmo `matchType: 'Final'`.
bool isFinalMatchTypeOf(TournamentMatch m) {
  final t = m.matchType.trim().toLowerCase();
  return t == 'final' || t == 'grand final' || t == 'grand_final';
}

/// A partida de onde o caminho do atleta parte: a pendente de menor
/// `matchNumber` que não seja um BYE já consumido.
///
/// NÃO usa [pendingKnockoutsOf], e a diferença importa: aquela ancora tudo no
/// `round`, e na dupla eliminação `round` não é uma escala única — WB e LB
/// numeram a partir de 1 cada uma. Um atleta que vence a WB rodada 3 e cai na
/// LB rodada 2 tem piso 3 e seria filtrado da própria partida que vai jogar.
/// `matchNumber` é global e cronológico no gerador, então serve às duas chaves;
/// e o bye é reconhecido pela FIAÇÃO — slot vazio numa partida cujo destino do
/// vencedor JÁ tem o time do atleta —, que também não depende de rodada.
TournamentMatch? _happyPathAnchorOf(
  List<TournamentMatch> myKnockouts,
  Map<int, TournamentMatch> byMatchNumber,
  Set<String> myTeamIds,
) {
  final pending = myKnockouts.where(_isPending).toList()
    ..sort((a, b) => a.matchNumber.compareTo(b.matchNumber));
  for (final m in pending) {
    final side = _sideOf(m, myTeamIds);
    final opponentEmpty =
        side == 'A' ? m.teamBId.isEmpty : m.teamAId.isEmpty;
    if (!opponentEmpty) return m;
    final advance = m.winnerAdvanceMatchNumber;
    final next = advance != null ? byMatchNumber[advance] : null;
    // Bye consumido: o atleta já está na partida seguinte sem ter jogado esta.
    if (next == null || _sideOf(next, myTeamIds) == null) return m;
  }
  return null;
}

/// O CAMINHO FELIZ: as partidas que o atleta ainda precisa vencer, na ordem,
/// até o título — ele ganhando todas a partir de onde está.
///
/// Sai da fiação real da planta (`winnerAdvance`), nunca de contagem de
/// rodadas. É o que torna a resposta possível na DUPLA ELIMINAÇÃO, onde contar
/// fases mente: WB e LB são duas escadas de comprimentos diferentes, e quem
/// caiu pra LB tem MAIS partidas pela frente que quem segue invicto — a fiação
/// sabe disso, a rodada não.
///
/// `null` quando não dá pra afirmar: sem partida pendente (campeão ou eliminado
/// de vez), fiação ausente (torneio gerado antes do `winnerAdvance`) ou fiação
/// que não desemboca na final — planta com ligação errada já aconteceu neste
/// projeto, e uma cadeia que termina no meio da chave viraria um número menor
/// que a verdade. Melhor não afirmar nada.
List<TournamentMatch>? happyPathOf(
  List<TournamentMatch> matches,
  String categoryId,
  Set<String> myTeamIds,
) {
  final knockouts = matches
      .where((m) => m.categoryId == categoryId && m.poolId.isEmpty && !m.isGroupMatch)
      .toList();
  final byMatchNumber = {for (final m in knockouts) m.matchNumber: m};
  final anchor = _happyPathAnchorOf(
    knockouts.where((m) => _sideOf(m, myTeamIds) != null).toList(),
    byMatchNumber,
    myTeamIds,
  );
  if (anchor == null) return null;

  final path = <TournamentMatch>[anchor];
  final seen = <int>{anchor.matchNumber};
  var current = anchor;
  while (current.winnerAdvanceMatchNumber != null &&
      path.length < _maxHappyPath) {
    final next = byMatchNumber[current.winnerAdvanceMatchNumber];
    if (next == null || seen.contains(next.matchNumber)) break;
    seen.add(next.matchNumber);
    path.add(next);
    current = next;
  }
  return isFinalMatchTypeOf(path.last) ? path : null;
}

/// Quantas vitórias separam o atleta do título.
///
/// Duas derivações, uma por formato. Na ELIMINAÇÃO SIMPLES a contagem é por
/// fases restantes. Na DUPLA ELIMINAÇÃO a resposta vem de [happyPathOf], que
/// caminha a fiação: contar fases ali mentiria.
///
/// [isDoubleElimination] chega pronto de quem chama — no app a fonte é
/// `isDoubleEliminationBracketFormat(offer.bracketFormat)`, o formato declarado
/// da categoria, que é autoritativo. O portal precisa inspecionar as partidas
/// porque não tem esse dado à mão; aqui adivinhar seria pior.
///
/// `null` quando: a chave ainda não foi sorteada; na eliminação simples, quando
/// o atleta já PERDEU alguma partida do mata-mata; na dupla eliminação, quando
/// não sobrou partida pendente ou a fiação não desemboca na final.
///
/// `0` quando o atleta já venceu a final — campeão. É uma resposta honesta
/// (zero vitórias faltando), diferente do `null` de "não dá pra afirmar".
///
/// Deliberadamente NÃO tenta detectar eliminação que aconteceu só na fase de
/// grupos. Decidir isso exigiria simular o desempate do grupo, e errar
/// desempate num app de torneio é pior que uma imprecisão temporária. Um atleta
/// fora só pelo resultado do grupo continua vendo um número até o mata-mata ser
/// sorteado — não "complete" essa lacuna sem entender o custo.
int? winsToTitleOf(
  List<TournamentMatch> matches,
  String categoryId,
  Set<String> myTeamIds, {
  required bool isDoubleElimination,
}) {
  final rounds = knockoutRounds(matches, categoryId);
  if (rounds.isEmpty) return null;

  final categoryMatches =
      matches.where((m) => m.categoryId == categoryId).toList();
  final myKnockouts = categoryMatches
      .where((m) =>
          m.poolId.isEmpty &&
          !m.isGroupMatch &&
          _sideOf(m, myTeamIds) != null)
      .toList();

  // Campeão primeiro, e não depois de `lost`: na DUPLA ELIMINAÇÃO uma derrota
  // não elimina — quem cai pra LB e volta pra vencer a final é campeão com uma
  // derrota no currículo, e a ordem antiga responderia `null` pra ele.
  //
  // Checado por `matchType`, NUNCA por `round == lastRound`: a disputa de 3º
  // lugar recebe o MESMO número de rodada da final, então checar por round faria
  // um atleta que perdeu a semi e venceu o 3º lugar coroar como campeão.
  final champion = myKnockouts.any(
    (m) => isFinalMatchTypeOf(m) && _outcomeOf(m, myTeamIds) == 'win',
  );
  if (champion) return 0;

  if (isDoubleElimination) {
    return happyPathOf(matches, categoryId, myTeamIds)?.length;
  }

  // Eliminado na eliminação simples: uma derrota encerra a campanha. Checado
  // ANTES do fallback de "sem pendência" abaixo — sem isso, um atleta eliminado
  // cai no mesmo ramo de quem ainda está nos grupos e herda a chave inteira.
  final lost = myKnockouts.any((m) => _outcomeOf(m, myTeamIds) == 'loss');
  if (lost) return null;

  // Piso + byes já consumidos: sem isso, um BYE ancora a contagem na 1ª rodada
  // pra sempre, e um atleta na final de uma chave de 6 duplas lia "3 vitórias
  // do título" (a chave inteira) em vez de "1".
  final myPending = pendingKnockoutsOf(myKnockouts, myTeamIds)
      .map((m) => m.round)
      .toList()
    ..sort();

  // Já dentro do mata-mata: conta da fase pendente dele em diante. Ainda nos
  // grupos: todas.
  if (myPending.isEmpty) return rounds.length;
  final index = rounds.indexOf(myPending.first);
  return index < 0 ? rounds.length : rounds.length - index;
}

/// Sets e pontos do atleta nas partidas já encerradas — tudo derivado dos sets
/// fechados ([matchClosedSets], que já normaliza `sets[]` e o formato legado).
TournamentNumbers tournamentNumbersOf(
  List<TournamentMatch> matches,
  Set<String> myTeamIds,
) {
  final mine = matches
      .where((m) =>
          _sideOf(m, myTeamIds) != null &&
          TournamentMatchStatus.isCompleted(m.status))
      .toList();

  final bars = <SetBar>[];
  var setsWon = 0;
  var setsLost = 0;
  var points = 0;
  var pointsAgainst = 0;

  for (var matchIndex = 0; matchIndex < mine.length; matchIndex++) {
    final m = mine[matchIndex];
    final iAmA = _sideOf(m, myTeamIds) == 'A';
    final sets = matchClosedSets(m);
    for (var setIndex = 0; setIndex < sets.length; setIndex++) {
      final s = sets[setIndex];
      final my = iAmA ? s.a : s.b;
      final their = iAmA ? s.b : s.a;
      if (my > their) {
        setsWon++;
      } else if (their > my) {
        setsLost++;
      }
      points += my;
      pointsAgainst += their;
      bars.add(SetBar(
        label: 'P${matchIndex + 1} · S${setIndex + 1}',
        mine: my,
        theirs: their,
      ));
    }
  }

  return TournamentNumbers(
    matches: mine.length,
    setsWon: setsWon,
    setsLost: setsLost,
    points: points,
    pointsAgainst: pointsAgainst,
    pointsPerSet:
        bars.isNotEmpty ? (points / bars.length * 10).round() / 10 : 0,
    sets: bars,
  );
}
