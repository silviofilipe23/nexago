import '../../../../core/router/routes.dart';
import '../../../tournaments/domain/tournament_match.dart';

String organizerMatchCenterPath(String tournamentId) =>
    AppRoutes.organizerMatchCenter.replaceAll(':tournamentId', tournamentId);

String organizerMatchQueuePath(String tournamentId) =>
    AppRoutes.organizerMatchQueue.replaceAll(':tournamentId', tournamentId);

String organizerMatchCourtsPath(String tournamentId) =>
    AppRoutes.organizerMatchCourts.replaceAll(':tournamentId', tournamentId);

String organizerMatchSchedulePath(String tournamentId) =>
    AppRoutes.organizerMatchSchedule.replaceAll(':tournamentId', tournamentId);

String organizerMatchSchedulePickPath(String tournamentId) =>
    AppRoutes.organizerMatchSchedulePick.replaceAll(':tournamentId', tournamentId);

String organizerMatchScheduleTimePath(String tournamentId, String matchId) =>
    AppRoutes.organizerMatchScheduleTime
        .replaceAll(':tournamentId', tournamentId)
        .replaceAll(':matchId', matchId);

String organizerMatchAutoSchedulePath(String tournamentId) =>
    AppRoutes.organizerMatchAutoSchedule.replaceAll(':tournamentId', tournamentId);

String organizerMatchInsightsPath(String tournamentId) =>
    AppRoutes.organizerMatchInsights.replaceAll(':tournamentId', tournamentId);

String organizerMatchCheckInPath(String tournamentId, String matchId) =>
    AppRoutes.organizerMatchCheckIn
        .replaceAll(':tournamentId', tournamentId)
        .replaceAll(':matchId', matchId);

String organizerMatchLivePath(String tournamentId, String matchId) =>
    AppRoutes.organizerMatchLive
        .replaceAll(':tournamentId', tournamentId)
        .replaceAll(':matchId', matchId);

String organizerMatchQuickScorePath(String tournamentId, String matchId) =>
    AppRoutes.organizerMatchQuickScore
        .replaceAll(':tournamentId', tournamentId)
        .replaceAll(':matchId', matchId);

/// Mesa da rodada King of the Court.
///
/// [categoryId] vai na query porque a mesa resolve os nomes das duplas pelas
/// inscrições da categoria — sem ele a tabela mostra "Dupla" em todas as linhas.
String organizerKocTablePath(
  String tournamentId,
  String matchId, {
  String categoryId = '',
}) {
  final path = AppRoutes.organizerKocTable
      .replaceAll(':tournamentId', tournamentId)
      .replaceAll(':matchId', matchId);
  if (categoryId.trim().isEmpty) return path;
  return '$path?categoryId=${Uri.encodeComponent(categoryId.trim())}';
}

String organizerMatchValidatePath(String tournamentId, String matchId) =>
    AppRoutes.organizerMatchValidate
        .replaceAll(':tournamentId', tournamentId)
        .replaceAll(':matchId', matchId);

String organizerMatchSummaryPath(String tournamentId, String matchId) =>
    AppRoutes.organizerMatchSummary
        .replaceAll(':tournamentId', tournamentId)
        .replaceAll(':matchId', matchId);

String publicMatchLivePath(String tournamentId, String matchId) =>
    AppRoutes.publicMatchLive
        .replaceAll(':tournamentId', tournamentId)
        .replaceAll(':matchId', matchId);

/// Telão da categoria King of the Court.
///
/// Por CATEGORIA, não por rodada: numa quadra só as rodadas acontecem em
/// sequência, e um link por rodada obrigaria a trocar a tela sete vezes durante
/// a etapa. Este acompanha sozinho.
String publicKocBoardPath(String tournamentId, String categoryId) =>
    AppRoutes.publicKocBoard
        .replaceAll(':tournamentId', tournamentId)
        .replaceAll(':categoryId', categoryId);

/// Mesa certa para a partida.
///
/// Rodada King of the Court tem elenco, fila e tabela; duelo tem placar por
/// sets. Mandar uma rodada para a mesa de sets daria uma tela que não sabe ler
/// o que está na quadra — por isso a escolha mora aqui, num lugar só.
String organizerMatchTablePath(String tournamentId, TournamentMatch match) {
  if (match.isKingOfCourt) {
    return organizerKocTablePath(
      tournamentId,
      match.id,
      categoryId: match.categoryId,
    );
  }
  return organizerMatchLivePath(tournamentId, match.id);
}
