import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';

void pushOrganizerTournamentDetail(GoRouter router, String tournamentId) {
  router.pushNamed(
    AppRouteNames.organizerTournamentDetail,
    pathParameters: {'tournamentId': tournamentId.trim()},
  );
}

void pushOrganizerTournamentUniforms(
  GoRouter router, {
  required String tournamentId,
  String? categoryId,
}) {
  router.pushNamed(
    AppRouteNames.organizerTournamentUniforms,
    pathParameters: {'tournamentId': tournamentId.trim()},
    queryParameters: {
      if (categoryId != null && categoryId.trim().isNotEmpty)
        'categoryId': categoryId.trim(),
    },
  );
}

void pushOrganizerTournamentCategories(
  GoRouter router, {
  required String tournamentId,
}) {
  router.pushNamed(
    AppRouteNames.organizerTournamentCategories,
    pathParameters: {'tournamentId': tournamentId.trim()},
  );
}

void pushOrganizerTournamentOverview(
  GoRouter router, {
  required String tournamentId,
}) {
  router.pushNamed(
    AppRouteNames.organizerTournamentOverview,
    pathParameters: {'tournamentId': tournamentId.trim()},
  );
}

void pushOrganizerTournamentFinancial(
  GoRouter router, {
  required String tournamentId,
}) {
  router.pushNamed(
    AppRouteNames.organizerTournamentFinancial,
    pathParameters: {'tournamentId': tournamentId.trim()},
  );
}

void pushOrganizerTournamentOperations(
  GoRouter router, {
  required String tournamentId,
}) {
  router.pushNamed(
    AppRouteNames.organizerTournamentOperations,
    pathParameters: {'tournamentId': tournamentId.trim()},
  );
}

void pushOrganizerTournamentStaff(
  GoRouter router, {
  required String tournamentId,
}) {
  router.pushNamed(
    AppRouteNames.organizerTournamentStaff,
    pathParameters: {'tournamentId': tournamentId.trim()},
  );
}

void pushOrganizerTournamentAnnounce(
  GoRouter router, {
  required String tournamentId,
}) {
  router.pushNamed(
    AppRouteNames.organizerTournamentAnnounce,
    pathParameters: {'tournamentId': tournamentId.trim()},
  );
}

void pushOrganizerCategoryShell(
  GoRouter router, {
  required String tournamentId,
  required String categoryId,
}) {
  router.pushNamed(
    AppRouteNames.organizerCategoryShell,
    pathParameters: {
      'tournamentId': tournamentId.trim(),
      'categoryId': categoryId.trim(),
    },
  );
}

void pushOrganizerCategoryTeams(
  GoRouter router, {
  required String tournamentId,
  required String categoryId,
}) {
  router.pushNamed(
    AppRouteNames.organizerCategoryTeams,
    pathParameters: {
      'tournamentId': tournamentId.trim(),
      'categoryId': categoryId.trim(),
    },
  );
}

void pushOrganizerCategoryPayments(
  GoRouter router, {
  required String tournamentId,
  required String categoryId,
}) {
  router.pushNamed(
    AppRouteNames.organizerCategoryPayments,
    pathParameters: {
      'tournamentId': tournamentId.trim(),
      'categoryId': categoryId.trim(),
    },
  );
}

void pushOrganizerCategorySeeding(
  GoRouter router, {
  required String tournamentId,
  required String categoryId,
}) {
  router.pushNamed(
    AppRouteNames.organizerCategorySeeding,
    pathParameters: {
      'tournamentId': tournamentId.trim(),
      'categoryId': categoryId.trim(),
    },
  );
}

void pushOrganizerCategoryGenerateBracket(
  GoRouter router, {
  required String tournamentId,
  required String categoryId,
  required String format,
}) {
  router.pushNamed(
    AppRouteNames.organizerCategoryGenerateBracket,
    pathParameters: {
      'tournamentId': tournamentId.trim(),
      'categoryId': categoryId.trim(),
    },
    queryParameters: {'format': format},
  );
}

void pushOrganizerCategoryFormat(
  GoRouter router, {
  required String tournamentId,
  required String categoryId,
}) {
  router.pushNamed(
    AppRouteNames.organizerCategoryFormat,
    pathParameters: {
      'tournamentId': tournamentId.trim(),
      'categoryId': categoryId.trim(),
    },
  );
}

void pushOrganizerCategoryCommunicate(
  GoRouter router, {
  required String tournamentId,
  required String categoryId,
}) {
  router.pushNamed(
    AppRouteNames.organizerCategoryCommunicate,
    pathParameters: {
      'tournamentId': tournamentId.trim(),
      'categoryId': categoryId.trim(),
    },
  );
}

void pushOrganizerCategoryBracket(
  GoRouter router, {
  required String tournamentId,
  required String categoryId,
  String tab = 'winners',
}) {
  router.pushNamed(
    AppRouteNames.organizerCategoryBracket,
    pathParameters: {
      'tournamentId': tournamentId.trim(),
      'categoryId': categoryId.trim(),
    },
    queryParameters: {'tab': tab},
  );
}

void goOrganizerTournamentCreateIdentity(GoRouter router, String tournamentId) {
  router.pushNamed(
    AppRouteNames.organizerTournamentCreateIdentity,
    queryParameters: {'draftId': tournamentId.trim()},
  );
}
