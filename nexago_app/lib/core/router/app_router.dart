import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/arenas/presentation/arena_booking_confirm_page.dart';
import '../../features/arenas/presentation/booking_blocked_page.dart';
import '../../features/arenas/presentation/arena_detail_page.dart';
import '../../features/arenas/presentation/booking_success_page.dart';
import '../../features/arenas/presentation/slots_page.dart';
import '../../features/arenas/domain/arena_booking_confirm_args.dart';
import '../../features/arenas/domain/arena_list_item.dart';
import '../../features/auth/login_page.dart';
import '../../features/auth/register_page.dart';
import '../../features/arena/domain/arena_manager_booking.dart';
import '../../features/arena/presentation/arena_booking_details_page.dart';
import '../../features/arena/presentation/arena_bookings_page.dart';
import '../../features/arena/presentation/arena_courts_page.dart';
import '../../features/arena/presentation/arena_dashboard_page.dart';
import '../../features/arena/presentation/arena_schedule_page.dart';
import '../../features/arena/presentation/arena_edit_profile_page.dart';
import '../../features/arena/presentation/arena_profile_update_success_page.dart';
import '../../features/arena/presentation/arena_profile_page.dart';
import '../../features/arena/presentation/arena_followers_page.dart';
import '../../features/arena/presentation/arena_reviews_management_page.dart';
import '../../features/arena/presentation/arena_availability_settings_page.dart';
import '../../features/arena/presentation/arena_availability_slots_success_page.dart';
import '../../features/arena/presentation/arena_settings_page.dart';
import '../../features/arena/presentation/arena_slot_detail_page.dart';
import '../../features/arena/presentation/arena_shell_page.dart';
import '../../features/arena/domain/arena_slot_detail_args.dart';
import '../../features/arenas/presentation/my_bookings_page.dart';
import '../../features/arena/domain/arena_route_guard.dart';
import '../../features/athlete/presentation/athlete_edit_profile_page.dart';
import '../../features/athlete/presentation/athlete_profile_page.dart';
import '../../features/athlete/presentation/athlete_profile_update_success_page.dart';
import '../../features/athlete/presentation/arena_reviews_page.dart';
import '../../features/athlete/presentation/athlete_shell_page.dart';
import '../auth/auth_providers.dart';
import '../auth/user_roles.dart';
import 'go_router_refresh.dart';
import 'routes.dart';

/// Router centralizado com guard baseado em [authProvider].
final goRouterProvider = Provider<GoRouter>((ref) {
  final refresh = ref.watch(goRouterRefreshNotifierProvider);

  return GoRouter(
    initialLocation: AppRoutes.discover,
    refreshListenable: refresh,
    redirect: (context, state) async {
      final authAsync = ref.read(authProvider);
      final path = state.uri.path;
      final isAuthRoute = path == AppRoutes.login || path == AppRoutes.register;

      if (authAsync.isLoading) {
        return null;
      }
      if (authAsync.hasError) {
        return AppRoutes.login;
      }

      final user = authAsync.valueOrNull;
      if (user == null && !isAuthRoute) {
        return AppRoutes.login;
      }

      if (user != null && isAuthRoute) {
        final token = await _safeGetIdTokenResult(user);
        if (token == null) {
          return AppRoutes.login;
        }
        if (userIsArenaOnlyManager(token)) {
          return AppRoutes.arenaDashboard;
        }
        return AppRoutes.discover;
      }

      if (user != null) {
        final token = await _safeGetIdTokenResult(user);
        if (token == null) {
          return isAuthRoute ? null : AppRoutes.login;
        }

        if (isArenaManagerPanelPath(path)) {
          if (!userHasArenaRole(token)) {
            return AppRoutes.discover;
          }
        }

        if (path == AppRoutes.discover && userIsArenaOnlyManager(token)) {
          return AppRoutes.arenaDashboard;
        }

        if ((path == AppRoutes.home || path == '/') &&
            userIsArenaOnlyManager(token)) {
          return AppRoutes.arenaDashboard;
        }

        if (path == AppRoutes.home || path == '/') {
          return AppRoutes.discover;
        }
      }

      return null;
    },
    routes: [
      GoRoute(
        path: AppRoutes.login,
        name: AppRouteNames.login,
        builder: (context, state) => const LoginPage(),
      ),
      GoRoute(
        path: AppRoutes.register,
        name: AppRouteNames.register,
        builder: (context, state) => const RegisterPage(),
      ),
      GoRoute(
        path: AppRoutes.home,
        redirect: (context, state) => AppRoutes.discover,
      ),
      GoRoute(
        path: AppRoutes.discover,
        name: AppRouteNames.discover,
        builder: (context, state) {
          final tab = state.uri.queryParameters['tab']?.trim().toLowerCase();
          final initialIndex = switch (tab) {
            'agenda' => 1,
            'reservar' => 2,
            'feed' => 3,
            'perfil' || 'profile' => 4,
            _ => 0,
          };
          return AthleteShellPage(initialIndex: initialIndex);
        },
      ),
      GoRoute(
        path: AppRoutes.myBookings,
        name: AppRouteNames.myBookings,
        builder: (context, state) => const MyBookingsPage(),
      ),
      GoRoute(
        path: AppRoutes.athleteProfile,
        name: AppRouteNames.athleteProfile,
        builder: (context, state) {
          final viewed = state.uri.queryParameters['userId']?.trim();
          return AthleteProfilePage(
            viewedUserId: viewed != null && viewed.isNotEmpty ? viewed : null,
          );
        },
      ),
      GoRoute(
        path: AppRoutes.athleteProfileEdit,
        name: AppRouteNames.athleteProfileEdit,
        builder: (context, state) => const AthleteEditProfilePage(),
      ),
      GoRoute(
        path: AppRoutes.athleteProfileUpdateSuccess,
        name: AppRouteNames.athleteProfileUpdateSuccess,
        builder: (context, state) => const AthleteProfileUpdateSuccessPage(),
      ),
      GoRoute(
        path: '/arena',
        redirect: (context, state) {
          if (state.uri.path == '/arena') {
            return AppRoutes.arenaDashboard;
          }
          return null;
        },
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) {
          return ArenaShellPage(navigationShell: navigationShell);
        },
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.arenaDashboard,
                name: AppRouteNames.arenaDashboard,
                builder: (context, state) => const ArenaDashboardPage(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.arenaSchedule,
                name: AppRouteNames.arenaSchedule,
                builder: (context, state) => const ArenaSchedulePage(),
                routes: [
                  GoRoute(
                    path: 'slot/:slotId',
                    name: AppRouteNames.arenaSlotDetail,
                    builder: (context, state) {
                      final extra = state.extra;
                      final args = extra is ArenaSlotDetailArgs ? extra : null;
                      if (args == null) {
                        return const Scaffold(
                          body: Center(
                            child: Text('Abra o detalhe a partir da agenda.'),
                          ),
                        );
                      }
                      return ArenaSlotDetailPage(args: args);
                    },
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.arenaBookings,
                name: AppRouteNames.arenaBookings,
                builder: (context, state) => const ArenaBookingsPage(),
                routes: [
                  GoRoute(
                    path: 'detail/:bookingId',
                    name: AppRouteNames.arenaBookingDetail,
                    builder: (context, state) {
                      final bookingId = state.pathParameters['bookingId'] ?? '';
                      final extra = state.extra;
                      final initial =
                          extra is ArenaManagerBooking ? extra : null;
                      return ArenaBookingDetailsPage(
                        bookingId: bookingId,
                        initialBooking: initial,
                      );
                    },
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.arenaSettings,
                name: AppRouteNames.arenaSettings,
                builder: (context, state) => const ArenaSettingsPage(),
              ),
            ],
          ),
        ],
      ),
      GoRoute(
        path: AppRoutes.arenaProfile,
        name: AppRouteNames.arenaProfile,
        builder: (context, state) => const ArenaProfilePage(),
      ),
      GoRoute(
        path: AppRoutes.arenaCourts,
        name: AppRouteNames.arenaCourts,
        builder: (context, state) => const ArenaCourtsPage(),
      ),
      GoRoute(
        path: AppRoutes.arenaFollowers,
        name: AppRouteNames.arenaFollowers,
        builder: (context, state) {
          final arenaId = state.uri.queryParameters['arenaId']?.trim() ?? '';
          return ArenaFollowersPage(arenaId: arenaId);
        },
      ),
      GoRoute(
        path: AppRoutes.arenaManagerReviews,
        name: AppRouteNames.arenaManagerReviews,
        builder: (context, state) => const ArenaReviewsManagementPage(),
      ),
      GoRoute(
        path: AppRoutes.arenaProfileEdit,
        name: AppRouteNames.arenaProfileEdit,
        builder: (context, state) => const ArenaEditProfilePage(),
      ),
      GoRoute(
        path: AppRoutes.arenaProfileUpdateSuccess,
        name: AppRouteNames.arenaProfileUpdateSuccess,
        builder: (context, state) => const ArenaProfileUpdateSuccessPage(),
      ),
      GoRoute(
        path: AppRoutes.arenaAvailabilitySettings,
        name: AppRouteNames.arenaAvailabilitySettings,
        builder: (context, state) => const ArenaAvailabilitySettingsPage(),
      ),
      GoRoute(
        path: AppRoutes.arenaAvailabilitySlotsSuccess,
        name: AppRouteNames.arenaAvailabilitySlotsSuccess,
        builder: (context, state) => const ArenaAvailabilitySlotsSuccessPage(),
      ),
      GoRoute(
        path: AppRoutes.arenaDetail,
        name: AppRouteNames.arenaDetail,
        builder: (context, state) {
          final arenaId = state.pathParameters['arenaId']!;
          final extra = state.extra;
          final initial = extra is ArenaListItem ? extra : null;
          return ArenaDetailPage(
            arenaId: arenaId,
            initialArena: initial?.id == arenaId ? initial : null,
          );
        },
      ),
      GoRoute(
        path: AppRoutes.arenaSlots,
        name: AppRouteNames.arenaSlots,
        builder: (context, state) {
          final arenaId = state.pathParameters['arenaId']!;
          final extra = state.extra;
          final initial = extra is ArenaListItem ? extra : null;
          final query = state.uri.queryParameters;
          final initialCourtId = query['courtId']?.trim();
          final initialStartTime = query['startTime']?.trim();
          final rawDate = query['date']?.trim();
          DateTime? initialDate;
          if (rawDate != null && rawDate.length >= 10) {
            final parsed = DateTime.tryParse(rawDate.substring(0, 10));
            if (parsed != null) {
              initialDate = DateTime(parsed.year, parsed.month, parsed.day);
            }
          }
          return SlotsPage(
            arenaId: arenaId,
            initialArena: initial?.id == arenaId ? initial : null,
            initialDate: initialDate,
            initialCourtId: (initialCourtId == null || initialCourtId.isEmpty)
                ? null
                : initialCourtId,
            initialStartTime:
                (initialStartTime == null || initialStartTime.isEmpty)
                    ? null
                    : initialStartTime,
          );
        },
      ),
      GoRoute(
        path: AppRoutes.arenaReviews,
        name: AppRouteNames.arenaReviews,
        builder: (context, state) {
          final arenaId = state.pathParameters['arenaId'] ?? '';
          final arenaName = state.uri.queryParameters['arenaName']?.trim();
          return ArenaReviewsPage(
            arenaId: arenaId,
            arenaName: arenaName,
          );
        },
      ),
      GoRoute(
        path: AppRoutes.arenaBookingConfirm,
        name: AppRouteNames.arenaBookingConfirm,
        builder: (context, state) {
          final arenaId = state.pathParameters['arenaId']!;
          final extra = state.extra;
          final args = extra is ArenaBookingConfirmArgs ? extra : null;
          return ArenaBookingConfirmPage(arenaId: arenaId, args: args);
        },
      ),
      GoRoute(
        path: AppRoutes.arenaBookingSuccess,
        name: AppRouteNames.arenaBookingSuccess,
        builder: (context, state) {
          final extra = state.extra;
          final args = extra is BookingSuccessArgs ? extra : null;
          return BookingSuccessPage(args: args);
        },
      ),
      GoRoute(
        path: AppRoutes.arenaBookingBlocked,
        name: AppRouteNames.arenaBookingBlocked,
        builder: (context, state) {
          final arenaId = state.pathParameters['arenaId']!;
          final msg = state.uri.queryParameters['message']?.trim();
          return BookingBlockedPage(
            arenaId: arenaId,
            message: (msg == null || msg.isEmpty) ? null : msg,
          );
        },
      ),
      GoRoute(
        path: AppRoutes.bookingSuccess,
        name: AppRouteNames.bookingSuccess,
        builder: (context, state) {
          final extra = state.extra;
          final args = extra is BookingSuccessArgs ? extra : null;
          return BookingSuccessPage(args: args);
        },
      ),
    ],
  );
});

Future<IdTokenResult?> _safeGetIdTokenResult(User user) async {
  try {
    return await user.getIdTokenResult(true);
  } on FirebaseAuthException catch (e) {
    if (e.code == 'no-current-user' || e.code == 'user-token-expired') {
      return null;
    }
    rethrow;
  }
}
