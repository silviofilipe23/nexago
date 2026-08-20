import '../tournament_group_standings_logic.dart';
import '../tournament_match.dart';
import '../tournament_match_display.dart';
import '../tournament_match_set.dart';
import '../tournament_match_status.dart';

/// O que a rodada atual decide para o atleta: "vencendo, 1º do grupo".
///
/// Porte de `focus/focus-scenarios.ts` do portal, com uma diferença importante:
/// a simulação roda no motor de classificação DO APP ([computePoolStandings]),
/// não numa cópia do motor da web. É o mesmo motor que desenha a tabela logo
/// acima na tela — se ele e o da web discordassem em algum desempate, o Focus
/// concordaria com a tabela que o atleta está vendo, que é o que importa.
class RoundScenario {
  const RoundScenario({
    required this.won,
    required this.rank,
    required this.qualifies,
    required this.text,
  });

  final bool won;

  /// Posição no grupo, ou `null` quando não é seguro afirmar.
  final int? rank;
  final bool? qualifies;
  final String text;
}

/// Os dois EXTREMOS de uma vitória em [bestOf] sets, do lado do atleta —
/// CALCULADOS a partir do formato, não constantes fixas.
///
/// A posição na tabela é monótona no saldo de sets e no de pontos: ganhar mais
/// sets, ou mais pontos, só pode melhorar ou manter a colocação. Logo, se o
/// melhor e o pior resultado possíveis de um desfecho dão a MESMA posição, todo
/// resultado legal no meio dá também — bastam duas simulações, desde que sejam
/// os limites de verdade.
///
/// O limite de baixo parece estranho de propósito: o mínimo de uma vitória NÃO
/// é margem apertada em todo set — é fechar pelo fio da navalha os sets que
/// precisa vencer e PERDER zerado os que não contam para o resultado (só para o
/// saldo de pontos). O set que fecha o jogo é sempre vitória do atleta, então
/// nunca entra como set perdido.
List<List<TournamentMatchSet>> winBoundsOf(int bestOf) {
  // `bestOf` chega cru do Firestore e nada trava o topo; um documento
  // malformado alocaria arrays proporcionais a ele. Trava no maior formato que
  // o app realmente oferece.
  final clamped = bestOf > 5 ? 5 : (bestOf < 1 ? 3 : bestOf);
  final setsToWin = (clamped / 2).ceil();
  final setsToLose = setsToWin - 1;
  final totalSets = setsToWin + setsToLose;
  final deciderIndex = totalSets - 1;

  // Vence tudo, perde nada.
  final widest = <TournamentMatchSet>[
    for (var i = 0; i < setsToWin; i++)
      TournamentMatchSet(a: matchSetTargetPoints(i, clamped), b: 0),
  ];

  final narrowest = <TournamentMatchSet>[];
  var remainingLosses = setsToLose;
  for (var i = 0; i < totalSets; i++) {
    final target = matchSetTargetPoints(i, clamped);
    if (i != deciderIndex && remainingLosses > 0) {
      narrowest.add(TournamentMatchSet(a: 0, b: target));
      remainingLosses--;
    } else {
      narrowest.add(
        TournamentMatchSet(a: target, b: target - matchMinSetAdvantage),
      );
    }
  }

  return [widest, narrowest];
}

List<TournamentMatchSet> _mirror(List<TournamentMatchSet> sets) =>
    [for (final s in sets) TournamentMatchSet(a: s.b, b: s.a)];

bool _isPending(TournamentMatch m) =>
    !TournamentMatchStatus.isCompleted(m.status) &&
    !TournamentMatchStatus.isCanceled(m.status);

/// A partida do atleta com um placar hipotético, encerrada.
///
/// Carrega os campos que [computePoolStandings] lê — ela deriva o vencedor dos
/// SETS, não do `winnerId`, então o placar orientado é o que decide a simulação.
/// `resultA`/`resultB` saem vazios de propósito: com `sets` preenchido o motor
/// usa os sets, e o formato legado atrapalharia.
TournamentMatch _withHypothetical(
  TournamentMatch m,
  String myTeamId,
  List<TournamentMatchSet> sets,
  bool iWin,
) {
  final iAmA = m.teamAId == myTeamId;
  final oriented = iAmA ? sets : _mirror(sets);
  final winnerId = iWin ? myTeamId : (iAmA ? m.teamBId : m.teamAId);

  return TournamentMatch(
    id: m.id,
    tournamentId: m.tournamentId,
    categoryId: m.categoryId,
    round: m.round,
    matchType: m.matchType,
    poolId: m.poolId,
    teamAId: m.teamAId,
    teamBId: m.teamBId,
    teamADescription: m.teamADescription,
    teamBDescription: m.teamBDescription,
    status: TournamentMatchStatus.completed,
    resultA: '',
    resultB: '',
    isGroupMatch: m.isGroupMatch,
    matchNumber: m.matchNumber,
    winnerId: winnerId,
    sets: oriented,
    bestOf: m.bestOf,
  );
}

int? _rankOf(
  List<TournamentMatch> matches,
  String categoryId,
  String poolId,
  String myTeamId,
) {
  final pool = matches
      .where((m) => m.categoryId == categoryId && m.poolId == poolId)
      .toList();
  final order = computePoolStandings(poolId, teamIdsInPool(pool), pool);
  final index = order.indexOf(myTeamId);
  return index < 0 ? null : index + 1;
}

/// O que a partida [myMatchId] decide para o atleta.
///
/// Devolve lista vazia quando não há o que dizer. Quando a partida do atleta
/// NÃO é a única pendente do grupo, os textos dizem que a posição depende dos
/// outros jogos — nunca uma posição, porque ela não está nas mãos dele.
List<RoundScenario> roundScenariosOf({
  required List<TournamentMatch> matches,
  required String poolId,
  required String? myTeamId,
  required String myMatchId,
  required int qualifiersPerGroup,
}) {
  final teamId = myTeamId?.trim() ?? '';
  if (poolId.isEmpty || teamId.isEmpty) return const [];

  // A partida do atleta vem primeiro porque é ela que diz de que CATEGORIA é
  // este grupo: `poolId` sozinho não identifica um grupo — 'A' existe em toda
  // categoria do torneio.
  TournamentMatch? mine;
  for (final m in matches) {
    if (m.id == myMatchId && m.poolId == poolId) {
      mine = m;
      break;
    }
  }
  if (mine == null || !_isPending(mine)) return const [];

  // O atleta precisa jogar essa partida — senão o placar hipotético seria
  // aplicado a duas duplas que não são a dele.
  if (mine.teamAId != teamId && mine.teamBId != teamId) return const [];

  final pool = matches
      .where((m) => m.categoryId == mine!.categoryId && m.poolId == poolId)
      .toList();
  final pending = pool.where(_isPending).toList();
  final soleDecider = pending.length == 1 && pending.first.id == myMatchId;

  return [
    for (final won in [true, false])
      _scenarioOf(
        matches: matches,
        mine: mine,
        teamId: teamId,
        won: won,
        soleDecider: soleDecider,
        qualifiersPerGroup: qualifiersPerGroup,
      ),
  ];
}

RoundScenario _scenarioOf({
  required List<TournamentMatch> matches,
  required TournamentMatch mine,
  required String teamId,
  required bool won,
  required bool soleDecider,
  required int qualifiersPerGroup,
}) {
  if (!soleDecider) {
    return RoundScenario(
      won: won,
      rank: null,
      qualifies: null,
      text: won
          ? 'Vencendo, sua posição depende do placar e dos outros jogos do '
              'grupo.'
          : 'Perdendo, sua posição depende do placar e dos outros jogos do '
              'grupo.',
    );
  }

  final ranks = <int?>[];
  for (final bound in winBoundsOf(matchBestOf(mine))) {
    final oriented = won ? bound : _mirror(bound);
    // Substitui em vez de remover-e-reanexar: a ordem de inserção é o
    // desempate de ÚLTIMO recurso entre duplas empatadas em tudo o mais, e
    // mover a partida do atleta para o fim mudaria esse desempate na simulação
    // em relação à tabela real.
    final simulated = [
      for (final m in matches)
        if (m.id == mine.id)
          _withHypothetical(mine, teamId, oriented, won)
        else
          m,
    ];
    ranks.add(_rankOf(simulated, mine.categoryId, mine.poolId, teamId));
  }

  final first = ranks.first;
  final agree = first != null && ranks.every((r) => r == first);
  if (!agree) {
    return RoundScenario(
      won: won,
      rank: null,
      qualifies: null,
      text: won
          ? 'Vencendo, sua posição depende do placar.'
          : 'Perdendo, sua posição depende do placar.',
    );
  }

  final qualifies = first <= qualifiersPerGroup;
  return RoundScenario(
    won: won,
    rank: first,
    qualifies: qualifies,
    text: '${first}º do grupo',
  );
}
