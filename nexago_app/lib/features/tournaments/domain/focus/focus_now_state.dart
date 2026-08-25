import '../tournament_match.dart';
import '../tournament_match_status.dart';

/// Estado do bloco principal da seção "Agora", em ordem de precedência.
enum FocusNowState { called, live, next, pendingKnockout, idle }

/// `queueStatus` que a mesa grava quando chama a dupla para a quadra.
const String kQueueStatusOnCourt = 'on_court';

/// Precedência do bloco principal do "Agora". Porte de `nowStateOf`
/// (`focus/now/focus-now.component.ts`), mantida como função pura para ser
/// testável sem widget.
///
/// **"chamado" e "em quadra" COEXISTEM no dado.** `callMatchToCourt` — a Cloud
/// Function que a mesa do organizador chama — grava `queueStatus: 'on_court'` E
/// `status: In Progress` na MESMA escrita. Sem esta ordem explícita, ou o
/// alerta de chamada nunca aparece, ou nunca sai da tela.
///
/// O que tira o alerta da tela é o reconhecimento, e ele é só local: não existe
/// callable para avisar a mesa. O rótulo do botão ("Ok, estou indo") diz
/// exatamente isso — não prometa mais do que ele faz.
///
/// **`idle` não é "sem partida".** Sem partida do atleta, a categoria ainda
/// pode ter mata-mata pendente cujo slot não tem o `teamId` dele até o
/// `winnerAdvance` preencher. Aí o estado é `pendingKnockout`.
FocusNowState focusNowStateOf(
  TournamentMatch? match,
  String? acknowledgedMatchId, {
  bool categoryHasPendingKnockout = false,
}) {
  if (match == null) {
    return categoryHasPendingKnockout
        ? FocusNowState.pendingKnockout
        : FocusNowState.idle;
  }
  if (match.queueStatus == kQueueStatusOnCourt &&
      acknowledgedMatchId != match.id) {
    return FocusNowState.called;
  }
  if (TournamentMatchStatus.isInProgress(match.status)) {
    return FocusNowState.live;
  }
  return FocusNowState.next;
}

/// Alguma partida do atleta no dia já entrou em quadra (ou já terminou).
///
/// Serve ao botão do herói do "Agora": "Como chegar" só ajuda quem ainda está a
/// caminho da arena; depois que o dia começa, o que o atleta quer é mostrar o
/// jogo.
///
/// Usa o início REAL, não o horário agendado: atraso de mesa é rotina e o
/// atleta ainda em trânsito continua precisando da rota. Partida encerrada
/// conta mesmo sem `matchStartedAt` — W.O. e placar lançado depois do fato não
/// gravam o início.
bool athleteFirstMatchStarted(List<TournamentMatch> dayMatches) {
  return dayMatches.any(
    (m) =>
        m.matchStartedAt != null ||
        TournamentMatchStatus.isInProgress(m.status) ||
        TournamentMatchStatus.isCompleted(m.status),
  );
}

/// Existe mata-mata pendente na categoria? Serve para o estado
/// `pendingKnockout`: os slots do bracket ainda não têm o `teamId` do atleta,
/// então a próxima partida dele não os enxerga.
bool hasPendingKnockoutInCategory(
  List<TournamentMatch> matches,
  String categoryId,
) {
  return matches.any((m) =>
      m.categoryId == categoryId &&
      !m.isGroupMatch &&
      m.poolId.isEmpty &&
      !TournamentMatchStatus.isCompleted(m.status) &&
      !TournamentMatchStatus.isCanceled(m.status));
}

/// O atleta já perdeu alguma partida do MATA-MATA desta categoria.
///
/// Sem esta trava, um atleta eliminado nas quartas veria a MESMA mensagem de
/// quem está esperando o sorteio, porque [hasPendingKnockoutInCategory] só olha
/// a chave da categoria inteira, não se o slot pendente ainda é dele.
///
/// NÃO cobre eliminação que aconteceu só na fase de grupos — mesma decisão de
/// `winsToTitleOf`: exigiria simular o desempate.
bool eliminatedFromKnockout(
  List<TournamentMatch> matches,
  String categoryId,
  Set<String> myTeamIds,
) {
  return matches.any((m) {
    if (m.categoryId != categoryId || m.isGroupMatch || m.poolId.isNotEmpty) {
      return false;
    }
    final mine = myTeamIds.contains(m.teamAId) || myTeamIds.contains(m.teamBId);
    if (!mine) return false;
    if (!TournamentMatchStatus.isCompleted(m.status)) return false;
    final winner = m.winnerId?.trim() ?? '';
    return winner.isNotEmpty && !myTeamIds.contains(winner);
  });
}
