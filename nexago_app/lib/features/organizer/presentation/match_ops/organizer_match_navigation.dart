import '../../../../core/router/routes.dart';

String organizerMatchCenterPath(String tournamentId) =>
    AppRoutes.organizerMatchCenter.replaceAll(':tournamentId', tournamentId);

String organizerMatchQueuePath(String tournamentId) =>
    AppRoutes.organizerMatchQueue.replaceAll(':tournamentId', tournamentId);

String organizerMatchCourtsPath(String tournamentId) =>
    AppRoutes.organizerMatchCourts.replaceAll(':tournamentId', tournamentId);

String organizerMatchSchedulePath(String tournamentId) =>
    AppRoutes.organizerMatchSchedule.replaceAll(':tournamentId', tournamentId);

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
