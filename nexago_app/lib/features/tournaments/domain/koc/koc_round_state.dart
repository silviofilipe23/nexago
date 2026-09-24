/// Estado da rodada King of the Court, lido do doc de `matches`.
///
/// Mora fora de `TournamentMatch` de propósito: aquele modelo fala em dois
/// lados, e a rodada tem elenco e tabela. Misturar os dois traria o formato
/// para dentro de 56 arquivos que a fase 0 acabou de blindar.
library;

import 'package:flutter/foundation.dart';

import '../tournament_match_status.dart';

/// Desfecho do rally — o lado, não a dupla.
///
/// [serveFault] é o erro de saque do desafiante: ele perde a vez e volta para o
/// fim da fila, o rei fica no trono e NINGUÉM pontua. Não é "o rei venceu" — se
/// fosse, o rei somaria um ponto que o regulamento não dá.
enum KocRallyOutcome {
  king('king'),
  challenger('challenger'),
  serveFault('serve_fault');

  const KocRallyOutcome(this.wire);

  /// Valor mandado na callable (espelha `KocRallyOutcome` do servidor).
  final String wire;
}

@immutable
class KocStanding {
  const KocStanding({
    required this.teamId,
    required this.place,
    required this.points,
    required this.crowns,
  });

  final String teamId;
  final int place;
  final int points;
  final int crowns;
}

/// Relógio da rodada.
///
/// [endsAtMs] é DERIVADO NO SERVIDOR. O cliente nunca calcula prazo: só conta
/// para trás até esse instante, que é o que mantém mesa, telão e app no mesmo
/// relógio.
@immutable
class KocClock {
  const KocClock({
    required this.endsAtMs,
    required this.durationSec,
    required this.pausedAtMs,
  });

  final int endsAtMs;
  final int durationSec;

  /// Quando a pausa atual começou; nulo se está correndo.
  final int? pausedAtMs;

  bool get isPaused => pausedAtMs != null;

  /// Segundos restantes. Em pausa, congela onde parou.
  int remainingSec(DateTime now) {
    final reference = pausedAtMs ?? now.millisecondsSinceEpoch;
    final remaining = ((endsAtMs - reference) / 1000).ceil();
    return remaining < 0 ? 0 : remaining;
  }

  bool isExpired(DateTime now) => remainingSec(now) == 0;

  /// "12:05" — o formato que a mesa lê de relance.
  String remainingLabel(DateTime now) {
    final total = remainingSec(now);
    final minutes = total ~/ 60;
    final seconds = total % 60;
    return '$minutes:${seconds.toString().padLeft(2, '0')}';
  }
}

@immutable
class KocRoundState {
  const KocRoundState({
    required this.teamIds,
    required this.kingTeamId,
    required this.challengerTeamId,
    required this.queue,
    required this.points,
    required this.crowns,
    required this.rallies,
    required this.servingTeamId,
    required this.clock,
    required this.standings,
    required this.qualifiersPerRound,
    required this.configuredDurationSec,
    this.isFinished = false,
    this.batteryLabel = 1,
  });

  /// Elenco da rodada, na ordem de semeadura.
  final List<String> teamIds;
  final String kingTeamId;
  final String challengerTeamId;
  final List<String> queue;
  final Map<String, int> points;
  final Map<String, int> crowns;
  final int rallies;
  final String servingTeamId;

  /// Nulo enquanto a rodada não começou.
  final KocClock? clock;

  /// Preenchida só no encerramento.
  final List<KocStanding> standings;

  final int qualifiersPerRound;
  final int configuredDurationSec;

  /// Rodada concluída — vem do `status` do doc, a MESMA fonte que o servidor usa
  /// para recusar rally. A mesa troca para leitura em vez de manter botões que
  /// só renderiam erro.
  final bool isFinished;

  /// Posição da bateria dentro da chave. Rodada publicada antes desta entrega
  /// não tem o campo gravado: vale 1.
  final int batteryLabel;

  bool get hasStarted => clock != null;

  /// Tabela final, quando existe. `kocStandings` só é gravado no encerramento;
  /// uma rodada encerrada por um caminho antigo cai na ordem ao vivo, em vez de
  /// a tela ficar vazia.
  List<KocStanding> get finalTable {
    if (standings.isNotEmpty) return standings;
    final order = liveOrder;
    return [
      for (var i = 0; i < order.length; i++)
        KocStanding(
          teamId: order[i],
          place: i + 1,
          points: pointsOf(order[i]),
          crowns: crowns[order[i]] ?? 0,
        ),
    ];
  }

  int pointsOf(String teamId) => points[teamId] ?? 0;

  /// Tabela ao vivo, com o mesmo critério do servidor: pontos, depois quem foi
  /// rei mais recentemente. Serve para a mesa ver a ordem antes de encerrar —
  /// a tabela oficial é a que `kocFinishRound` grava.
  List<String> get liveOrder {
    final order = [...teamIds];
    order.sort((a, b) {
      final byPoints = pointsOf(b) - pointsOf(a);
      if (byPoints != 0) return byPoints;
      return teamIds.indexOf(a) - teamIds.indexOf(b);
    });
    return order;
  }

  /// Duplas empatadas em pontos com [teamId].
  List<String> tiedWith(String teamId) {
    final mine = pointsOf(teamId);
    return teamIds.where((id) => id != teamId && pointsOf(id) == mine).toList();
  }

  /// Duplas que disputam a vaga no empate — as que jogam a bola de ouro.
  ///
  /// Com poucos rallies (uma rodada de 15 min produz poucos) o empate no corte
  /// é o caso COMUM, e costuma envolver mais de duas duplas: entram todas as
  /// que estão na pontuação da última vaga. Espelha `kocQualifyingTies` do
  /// servidor, que é quem valida a bola de ouro.
  List<String> get qualifyingTieGroup {
    final order = liveOrder;
    final cut = qualifiersPerRound;
    if (cut < 1 || cut >= order.length) return const [];
    final lastIn = pointsOf(order[cut - 1]);
    if (lastIn != pointsOf(order[cut])) return const [];
    final tied = order.where((id) => pointsOf(id) == lastIn).toList();
    return tied.length > 1 ? tied : const [];
  }

  /// O empate atravessa o corte de classificação — onde a bola de ouro é
  /// devida. Mesma regra de `kocQualifyingTies` no servidor.
  bool get hasQualifyingTie => qualifyingTieGroup.isNotEmpty;
}

int _asInt(dynamic value, [int fallback = 0]) {
  if (value is num) return value.toInt();
  return fallback;
}

List<String> _asStringList(dynamic value) {
  if (value is! List) return const [];
  return value
      .map((e) => e is String ? e.trim() : '')
      .where((e) => e.isNotEmpty)
      .toList();
}

Map<String, int> _asIntMap(dynamic value) {
  if (value is! Map) return const {};
  final out = <String, int>{};
  value.forEach((key, v) {
    if (key is String && v is num) out[key] = v.toInt();
  });
  return out;
}

KocClock? _parseClock(dynamic raw) {
  if (raw is! Map) return null;
  final endsAtMs = raw['endsAtMs'];
  if (endsAtMs is! num) return null;
  final pausedAtMs = raw['pausedAtMs'];
  return KocClock(
    endsAtMs: endsAtMs.toInt(),
    durationSec: _asInt(raw['durationSec'], 900),
    pausedAtMs: pausedAtMs is num ? pausedAtMs.toInt() : null,
  );
}

List<KocStanding> _parseStandings(dynamic raw) {
  if (raw is! List) return const [];
  final out = <KocStanding>[];
  for (final item in raw) {
    if (item is! Map) continue;
    final teamId = item['teamId'];
    if (teamId is! String || teamId.trim().isEmpty) continue;
    out.add(
      KocStanding(
        teamId: teamId.trim(),
        place: _asInt(item['place'], out.length + 1),
        points: _asInt(item['points']),
        crowns: _asInt(item['crowns']),
      ),
    );
  }
  out.sort((a, b) => a.place.compareTo(b.place));
  return out;
}

/// Lê a rodada do doc de `matches`.
///
/// Tolerante por escolha: campo ausente ou corrompido vira vazio em vez de
/// exceção. A mesa não pode ficar sem tela por causa de um campo torto — e o
/// servidor é quem valida antes de gravar.
KocRoundState kocRoundStateFromMap(Map<String, dynamic> data) {
  final state = data['kocState'];
  final stateMap = state is Map ? state : const {};
  final config = data['kocConfig'];
  final configMap = config is Map ? config : const {};

  return KocRoundState(
    teamIds: _asStringList(data['kocTeamIds']),
    kingTeamId: (stateMap['kingTeamId'] as String?)?.trim() ?? '',
    challengerTeamId: (stateMap['challengerTeamId'] as String?)?.trim() ?? '',
    queue: _asStringList(stateMap['queue']),
    points: _asIntMap(stateMap['points']),
    crowns: _asIntMap(stateMap['crowns']),
    rallies: _asInt(stateMap['rallies']),
    servingTeamId: (stateMap['servingTeamId'] as String?)?.trim() ?? '',
    clock: _parseClock(data['kocClock']),
    standings: _parseStandings(data['kocStandings']),
    qualifiersPerRound: _asInt(configMap['qualifiersPerRound'], 2),
    configuredDurationSec: _asInt(configMap['durationSec'], 900),
    isFinished: TournamentMatchStatus.isCompleted(
      data['status'] is String ? data['status'] as String : '',
    ),
    batteryLabel: _asInt(data['kocBatteryLabel'], 1),
  );
}
