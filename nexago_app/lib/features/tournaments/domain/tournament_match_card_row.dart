import 'tournament_match.dart';
import 'tournament_match_card_view_model.dart';
import 'tournament_match_display.dart';

/// Dados prontos para o card de partida, no desenho da Copa VH — o mesmo que o
/// portal do atleta monta em `category-matches.component.ts` (`MatchRowView`).
///
/// Fica no domínio, e não dentro do widget, porque é a mesma regra que o portal
/// carrega no componente: qual é o estado da partida, o que vai no selo, qual
/// placar cada lado mostra e quais parciais viram pílula. O widget só desenha.

enum TournamentMatchRowState { done, live, scheduled, canceled, tbd }

/// Final e 3º lugar têm identidade própria no card (ouro/bronze).
enum TournamentMatchRowStage { grandFinal, thirdPlace }

class TournamentMatchRowSide {
  const TournamentMatchRowSide({
    required this.name,
    required this.players,
    required this.mine,
    required this.tbd,
    required this.score,
    required this.won,
    required this.lost,
    required this.leading,
  });

  final String name;
  final List<TournamentMatchCardPlayerViewModel> players;

  /// A dupla é do atleta logado — ganha peso no nome e o sufixo "· você".
  final bool mine;

  /// Slot ainda sem dupla definida ("Vencedor do jogo 3").
  final bool tbd;

  /// Sets vencidos (encerrada) ou pontos do set atual (ao vivo); '—' sem placar.
  final String score;
  final bool won;
  final bool lost;

  /// Ao vivo: está na frente no set em andamento.
  final bool leading;
}

class TournamentMatchRowPill {
  const TournamentMatchRowPill({required this.label, required this.current});

  final String label;

  /// Set em andamento — pílula contornada em laranja no lugar do verde.
  final bool current;
}

class TournamentMatchRow {
  const TournamentMatchRow({
    required this.number,
    required this.head,
    required this.state,
    required this.stateLabel,
    required this.stage,
    required this.sideA,
    required this.sideB,
    required this.pills,
    required this.isMine,
  });

  /// `#12` — o número do jogo, como o organizador chama na quadra. Vazio em
  /// chaves antigas, geradas antes da numeração.
  final String number;

  /// "17:30 · Quadra 1" — a linha mono do topo do card.
  final String head;

  final TournamentMatchRowState state;

  /// Texto do selo: o estado, ou o horário quando a partida só está agendada.
  final String stateLabel;

  final TournamentMatchRowStage? stage;
  final TournamentMatchRowSide sideA;
  final TournamentMatchRowSide sideB;
  final List<TournamentMatchRowPill> pills;
  final bool isMine;
}

TournamentMatchRow buildTournamentMatchRow({
  required TournamentMatchCardViewModel viewModel,
  Set<String> athleteTeamIds = const {},
  DateTime? reference,
}) {
  final match = viewModel.match;
  final state = _stateOf(match);
  final timeLabel = matchTimeLabelForCard(match, reference: reference);
  final court = matchCourtLabelForCard(match);

  // Agendada, o horário é o próprio selo (é o que o atleta procura) — então sai
  // da linha de contexto pra não aparecer duas vezes no mesmo card.
  final timeInChip =
      state == TournamentMatchRowState.scheduled && timeLabel.isNotEmpty;

  final sideA = _sideOf(
    viewModel: viewModel,
    isTeamA: true,
    state: state,
    athleteTeamIds: athleteTeamIds,
  );
  final sideB = _sideOf(
    viewModel: viewModel,
    isTeamA: false,
    state: state,
    athleteTeamIds: athleteTeamIds,
  );

  final showPills = state == TournamentMatchRowState.done ||
      state == TournamentMatchRowState.live;

  return TournamentMatchRow(
    number: matchNumberLabelForCard(match),
    head: [
      if (!timeInChip && timeLabel.isNotEmpty) timeLabel,
      if (court.isNotEmpty) court,
    ].join(' · '),
    state: state,
    stateLabel: timeInChip ? timeLabel : _stateLabel(state),
    stage: _stageOf(match),
    sideA: sideA,
    sideB: sideB,
    pills: showPills
        ? [
            for (final set in matchDisplaySets(match))
              TournamentMatchRowPill(
                label: '${set.a}·${set.b}',
                current: set.inProgress,
              ),
          ]
        : const [],
    isMine: sideA.mine || sideB.mine,
  );
}

TournamentMatchRowState _stateOf(TournamentMatch match) {
  if (match.isCompleted) return TournamentMatchRowState.done;
  if (match.isInProgress) return TournamentMatchRowState.live;
  if (match.isCanceled) return TournamentMatchRowState.canceled;
  return match.scheduleTime != null
      ? TournamentMatchRowState.scheduled
      : TournamentMatchRowState.tbd;
}

String _stateLabel(TournamentMatchRowState state) {
  return switch (state) {
    TournamentMatchRowState.done => 'Encerrada',
    TournamentMatchRowState.live => 'Ao vivo',
    TournamentMatchRowState.scheduled => 'Agendada',
    TournamentMatchRowState.canceled => 'Cancelada',
    TournamentMatchRowState.tbd => 'A definir',
  };
}

/// Só no mata-mata: numa chave de grupos ninguém é "a final".
TournamentMatchRowStage? _stageOf(TournamentMatch match) {
  if (match.poolId.trim().isNotEmpty) return null;
  return switch (matchRoundLabel(match)) {
    'Final' || 'Grand Final' => TournamentMatchRowStage.grandFinal,
    '3º lugar' => TournamentMatchRowStage.thirdPlace,
    _ => null,
  };
}

TournamentMatchRowSide _sideOf({
  required TournamentMatchCardViewModel viewModel,
  required bool isTeamA,
  required TournamentMatchRowState state,
  required Set<String> athleteTeamIds,
}) {
  final match = viewModel.match;
  final team = isTeamA ? viewModel.teamA : viewModel.teamB;
  final teamId = (isTeamA ? match.teamAId : match.teamBId).trim();
  final counts = setsWonCountForMatch(match);
  final setsWon = isTeamA ? counts.$1 : counts.$2;

  var score = '—';
  var won = false;
  var lost = false;
  var leading = false;

  if (state == TournamentMatchRowState.done) {
    score = '$setsWon';
    won = isMatchTeamWinner(match, isTeamA: isTeamA);
    lost = matchTeamAWon(match) != null && !won;
  } else if (state == TournamentMatchRowState.live) {
    final live = matchLiveCurrentSet(match);
    if (live != null) {
      final mine = isTeamA ? live.a : live.b;
      final theirs = isTeamA ? live.b : live.a;
      score = '$mine';
      leading = mine > theirs;
    } else {
      score = '$setsWon';
    }
  }

  return TournamentMatchRowSide(
    name: team.displayName,
    players: team.players,
    mine: teamId.isNotEmpty && athleteTeamIds.contains(teamId),
    tbd: teamId.isEmpty,
    score: score,
    won: won,
    lost: lost,
    leading: leading,
  );
}
