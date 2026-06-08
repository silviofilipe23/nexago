import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/athlete/domain/athlete_profile.dart';
import '../../features/athlete/domain/athlete_profile_providers.dart';
import '../../features/athlete/domain/booking_invite_providers.dart';
import '../../features/auth/domain/post_login_bootstrap.dart';
import '../router/routes.dart';
import 'active_role_providers.dart';
import 'app_mobile_role.dart';
import 'auth_providers.dart';
import 'role_route_guard.dart';
import 'user_roles.dart';

bool routeIsRegisterPath(String path, String matched) {
  return path == AppRoutes.register ||
      matched == AppRoutes.register ||
      path.startsWith('${AppRoutes.register}/') ||
      matched.startsWith('${AppRoutes.register}/');
}

bool routeIsAthleteOnboardingPath(String path, String matched) {
  return path == AppRoutes.athleteOnboarding ||
      matched == AppRoutes.athleteOnboarding ||
      path.startsWith('${AppRoutes.athleteOnboarding}/') ||
      matched.startsWith('${AppRoutes.athleteOnboarding}/');
}

bool needsAthleteOnboarding(AsyncValue<AthleteProfile?> profileAsync) {
  return profileAsync.when(
    data: (profile) => profile == null || !profile.onboardingCompleted,
    loading: () => false,
    error: (_, __) => false,
  );
}

bool shouldBypassAthleteOnboardingRedirect(Ref ref) {
  if (!ref.read(athleteOnboardingJustCompletedProvider)) {
    return false;
  }
  final profileAsync = ref.read(athleteProfileProvider);
  final isComplete = profileAsync.whenOrNull(
    data: (profile) => profile?.onboardingCompleted == true,
  );
  if (isComplete == true) {
    ref.read(athleteOnboardingJustCompletedProvider.notifier).state = false;
    return false;
  }
  return true;
}

bool isSessionBootstrapPending(Ref ref) {
  return ref.read(sessionBootstrapProvider) == SessionBootstrapState.pending;
}

/// Resolve redirect para usuário autenticado (router + pós-loading).
Future<String?> resolveAuthenticatedRedirect({
  required Ref ref,
  required User user,
  required IdTokenResult token,
  required String path,
  required String matchedLocation,
  required bool leavingAuthRoute,
}) async {
  final isAuthRoute = path == AppRoutes.login ||
      path == AppRoutes.register ||
      path == AppRoutes.forgotPassword;
  final isPublicRoute = path.startsWith('/convite/');

  if (routeIsRegisterPath(path, matchedLocation) ||
      routeIsAthleteOnboardingPath(path, matchedLocation)) {
    return null;
  }

  if (path == AppRoutes.authLoading) {
    return null;
  }

  if (isSessionBootstrapPending(ref) &&
      path != AppRoutes.authLoading &&
      !isPublicRoute &&
      !routeIsRegisterPath(path, matchedLocation)) {
    return AppRoutes.authLoading;
  }

  final availableRoles = mobileRolesFromIdToken(token);
  final needsSelection = await needsRoleSelectionFlow(ref);
  final activeRole = await resolveActiveMobileRole(ref);

  if (needsSelection && path != AppRoutes.roleSelection && !isPublicRoute) {
    return AppRoutes.roleSelection;
  }

  if (activeRole == AppMobileRole.athlete) {
    final profileAsync = ref.read(athleteProfileProvider);
    if (profileAsync.isLoading) {
      return null;
    }
    if (shouldBypassAthleteOnboardingRedirect(ref)) {
      return null;
    }
    if (needsAthleteOnboarding(profileAsync) &&
        !isAuthRoute &&
        !isPublicRoute &&
        path != AppRoutes.roleSelection) {
      return AppRoutes.athleteOnboardingWelcome;
    }
  }

  if (leavingAuthRoute) {
    final pendingInvite = ref.read(pendingInviteIdProvider);
    if (pendingInvite != null && pendingInvite.isNotEmpty) {
      ref.read(pendingInviteIdProvider.notifier).state = null;
      return '/convite/$pendingInvite';
    }
  }

  final guardRedirect = redirectForActiveRole(
    path: path,
    activeRole: activeRole,
    availableRoles: availableRoles,
    needsRoleSelection: needsSelection,
  );
  if (guardRedirect != null) {
    return guardRedirect;
  }

  if (leavingAuthRoute && activeRole != null) {
    return defaultHomeForRole(activeRole);
  }

  if ((path == AppRoutes.home || path == '/') && activeRole != null) {
    return defaultHomeForRole(activeRole);
  }

  return null;
}

/// Destino final após a tela de loading.
Future<String> resolvePostLoginDestination(Ref ref) async {
  final user = ref.read(authProvider).valueOrNull;
  if (user == null) return AppRoutes.login;

  final token = await user.getIdTokenResult(true);
  final destination = await resolveAuthenticatedRedirect(
    ref: ref,
    user: user,
    token: token,
    path: AppRoutes.authLoading,
    matchedLocation: AppRoutes.authLoading,
    leavingAuthRoute: true,
  );
  return destination ?? AppRoutes.discover;
}

final resolvePostLoginDestinationProvider =
    Provider<Future<String> Function()>((ref) {
  return () => resolvePostLoginDestination(ref);
});
