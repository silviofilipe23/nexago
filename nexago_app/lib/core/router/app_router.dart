import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/arenas/presentation/arena_booking_confirm_page.dart';
import '../../features/arenas/presentation/arena_booking_pix_page.dart';
import '../../features/arenas/domain/arena_booking_pix_args.dart';
import '../../features/arenas/presentation/booking_blocked_page.dart';
import '../../features/arenas/presentation/arena_detail_page.dart';
import '../../features/arenas/presentation/arena_detail_route_extra.dart';
import '../../features/arenas/presentation/booking_success_page.dart';
import '../../features/arenas/presentation/slots_page.dart';
import '../../features/arenas/domain/arena_booking_confirm_args.dart';
import '../../features/arenas/domain/arena_list_item.dart';
import '../../features/auth/login_page.dart';
import '../../features/auth/forgot_password_page.dart';
import '../../features/auth/register_page.dart';
import '../../features/auth/presentation/role_selection_page.dart';
import '../../features/auth/presentation/auth_loading_page.dart';
import '../../features/organizer/presentation/organizer_home_page.dart';
import '../../features/arena/domain/arena_manager_booking.dart';
import '../../features/arena/domain/arena_booking_canceled_args.dart';
import '../../features/arena/presentation/arena_booking_canceled_page.dart';
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
import '../../features/arena/presentation/arena_payments_page.dart';
import '../../features/arena/presentation/arena_slot_detail_page.dart';
import '../../features/arena/presentation/arena_shell_page.dart';
import '../../features/arena/presentation/products/arena_product_form_page.dart';
import '../../features/arena/presentation/products/arena_product_deleted_page.dart';
import '../../features/arena/domain/products/arena_product_delete_args.dart';
import '../../features/arena/presentation/products/arena_products_list_page.dart';
import '../../features/arena/presentation/products/arena_restock_page.dart';
import '../../features/arena/presentation/products/arena_stock_alerts_page.dart';
import '../../features/arena/domain/arena_slot_detail_args.dart';
import '../../features/arenas/presentation/my_bookings_page.dart';
import '../../features/athlete/onboarding/presentation/athlete_onboarding_welcome_page.dart';
import '../../features/athlete/onboarding/presentation/steps/athlete_onboarding_goals_step.dart';
import '../../features/athlete/onboarding/presentation/steps/athlete_onboarding_level_step.dart';
import '../../features/athlete/onboarding/presentation/steps/athlete_onboarding_other_sports_step.dart';
import '../../features/athlete/onboarding/presentation/steps/athlete_onboarding_primary_sport_step.dart';
import '../../features/athlete/onboarding/presentation/steps/athlete_onboarding_profile_step.dart';
import '../../features/athlete/presentation/athlete_complete_profile_page.dart';
import '../../features/athlete/presentation/athlete_edit_profile_page.dart';
import '../../features/athlete/presentation/athlete_profile_goals_page.dart';
import '../../features/athlete/presentation/booking_invite_page.dart';
import '../../features/athlete/presentation/achievements/athlete_achievements_page.dart';
import '../../features/athlete/presentation/athlete_profile_page.dart';
import '../../features/athlete/presentation/athlete_settings_page.dart';
import '../../features/athlete/presentation/athlete_active_sessions_page.dart';
import '../../features/athlete/presentation/athlete_change_password_page.dart';
import '../../features/athlete/presentation/athlete_notification_settings_page.dart';
import '../../features/athlete/presentation/athlete_favorite_arenas_page.dart';
import '../../features/athlete/presentation/athlete_notifications_page.dart';
import '../../features/arenas/domain/arena_search_filters.dart';
import '../../features/athlete/presentation/athlete_match_detail_page.dart';
import '../../features/athlete/presentation/athlete_match_play_by_play_page.dart';
import '../../features/athlete/presentation/athlete_quest_page.dart';
import '../../features/athlete/presentation/athlete_match_history_page.dart';
import '../../features/athlete/presentation/athlete_tournament_detail_page.dart';
import '../../features/athlete/presentation/athlete_privacy_security_page.dart';
import '../../features/athlete/presentation/athlete_sports_levels_page.dart';
import '../../features/athlete/presentation/athlete_profile_update_success_page.dart';
import '../../features/athlete/presentation/arena_reviews_page.dart';
import '../../features/athlete/presentation/athlete_shell_page.dart';
import '../../features/tournaments/presentation/league_detail_page.dart';
import '../../features/athlete/presentation/athlete_discover_page.dart';
import '../../features/tournaments/presentation/team_discover_page.dart';
import '../../features/tournaments/presentation/team_profile/team_public_profile_page.dart';
import '../../features/ranking/presentation/athlete_ranking_page.dart';
import '../../features/tournaments/presentation/my_tournaments_page.dart';
import '../../features/tournaments/presentation/tournament_discovery_list_page.dart';
import '../../features/tournaments/presentation/double_elimination_bracket_page.dart';
import '../../features/tournaments/presentation/tournament_detail_page.dart';
import '../../features/tournaments/presentation/tournament_partner_invite_page.dart';
import '../../features/tournaments/domain/tournament_registration_logic.dart';
import '../../features/tournaments/domain/tournament_registration_pix_args.dart';
import '../../features/tournaments/domain/tournament_registration_success_args.dart';
import '../../features/tournaments/presentation/tournament_registration_page.dart';
import '../../features/tournaments/presentation/tournament_registration_pix_page.dart';
import '../../features/tournaments/presentation/tournament_registration_success_page.dart';
import '../auth/post_login_destination.dart';
import '../auth/auth_providers.dart';
import 'go_router_refresh.dart';
import 'routes.dart';

bool _routeIsRegister(GoRouterState state) {
  return routeIsRegisterPath(state.uri.path, state.matchedLocation);
}

Future<String?> _resolveAuthenticatedRedirect({
  required Ref ref,
  required User user,
  required IdTokenResult token,
  required GoRouterState state,
  required bool leavingAuthRoute,
}) {
  return resolveAuthenticatedRedirect(
    ref: ref,
    user: user,
    token: token,
    path: state.uri.path,
    matchedLocation: state.matchedLocation,
    leavingAuthRoute: leavingAuthRoute,
  );
}

/// Router centralizado com guard baseado em [authProvider].
final goRouterProvider = Provider<GoRouter>((ref) {
  ref.keepAlive();
  final refresh = ref.watch(goRouterRefreshNotifierProvider);

  return GoRouter(
    initialLocation: AppRoutes.discover,
    refreshListenable: refresh,
    redirect: (context, state) async {
      final authAsync = ref.read(authProvider);
      final path = state.uri.path;
      final isAuthRoute = path == AppRoutes.login ||
          path == AppRoutes.register ||
          path == AppRoutes.forgotPassword;
      final isPublicRoute = path.startsWith('/convite/');

      if (authAsync.isLoading) {
        return null;
      }
      if (authAsync.hasError) {
        return AppRoutes.login;
      }

      final user = authAsync.valueOrNull;
      if (user == null && path == AppRoutes.authLoading) {
        return AppRoutes.login;
      }

      if (user == null && !isAuthRoute && !isPublicRoute) {
        return AppRoutes.login;
      }

      if (user != null && isAuthRoute) {
        if (_routeIsRegister(state)) {
          return null;
        }
        final token = await _safeGetIdTokenResult(user);
        if (token == null) {
          return AppRoutes.login;
        }
        return _resolveAuthenticatedRedirect(
          ref: ref,
          user: user,
          token: token,
          state: state,
          leavingAuthRoute: true,
        );
      }

      if (user != null) {
        final token = await _safeGetIdTokenResult(user);
        if (token == null) {
          return isAuthRoute ? null : AppRoutes.login;
        }
        return _resolveAuthenticatedRedirect(
          ref: ref,
          user: user,
          token: token,
          state: state,
          leavingAuthRoute: false,
        );
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
        path: AppRoutes.forgotPassword,
        name: AppRouteNames.forgotPassword,
        builder: (context, state) => const ForgotPasswordPage(),
      ),
      GoRoute(
        path: AppRoutes.authLoading,
        name: AppRouteNames.authLoading,
        builder: (context, state) => const AuthLoadingPage(),
      ),
      GoRoute(
        path: AppRoutes.roleSelection,
        name: AppRouteNames.roleSelection,
        builder: (context, state) => const RoleSelectionPage(),
      ),
      GoRoute(
        path: AppRoutes.organizerHome,
        name: AppRouteNames.organizerHome,
        builder: (context, state) => const OrganizerHomePage(),
      ),
      GoRoute(
        path: AppRoutes.home,
        redirect: (context, state) => AppRoutes.discover,
      ),
      GoRoute(
        path: AppRoutes.discover,
        name: AppRouteNames.discover,
        redirect: (context, state) {
          final tab = state.uri.queryParameters['tab']?.trim().toLowerCase();
          if (tab == 'profile' || tab == 'perfil') {
            return AppRoutes.athleteProfile;
          }
          return null;
        },
        builder: (context, state) {
          final tab = state.uri.queryParameters['tab']?.trim().toLowerCase();
          final initialIndex = switch (tab) {
            'agenda' => 1,
            'reservar' => 2,
            'torneios' || 'competir' || 'feed' => 3,
            'comunidade' || 'community' => 4,
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
        path: AppRoutes.favoriteArenas,
        name: AppRouteNames.favoriteArenas,
        builder: (context, state) {
          final extra = state.extra;
          return AthleteFavoriteArenasPage(
            slotFilters: extra is ArenaSearchSlotFilters ? extra : null,
          );
        },
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
        builder: (context, state) {
          final focus = state.uri.queryParameters['focus'];
          return AthleteEditProfilePage(initialFocus: focus);
        },
      ),
      GoRoute(
        path: AppRoutes.athleteCompleteProfile,
        name: AppRouteNames.athleteCompleteProfile,
        builder: (context, state) => const AthleteCompleteProfilePage(),
      ),
      GoRoute(
        path: AppRoutes.athleteProfileGoals,
        name: AppRouteNames.athleteProfileGoals,
        builder: (context, state) => const AthleteProfileGoalsPage(),
      ),
      GoRoute(
        path: AppRoutes.athleteAchievements,
        name: AppRouteNames.athleteAchievements,
        builder: (context, state) => const AthleteAchievementsPage(),
      ),
      GoRoute(
        path: AppRoutes.athleteSettings,
        name: AppRouteNames.athleteSettings,
        builder: (context, state) => const AthleteSettingsPage(),
      ),
      GoRoute(
        path: AppRoutes.athleteSportsLevels,
        name: AppRouteNames.athleteSportsLevels,
        builder: (context, state) => const AthleteSportsLevelsPage(),
      ),
      GoRoute(
        path: AppRoutes.athleteNotificationSettings,
        name: AppRouteNames.athleteNotificationSettings,
        builder: (context, state) =>
            const AthleteNotificationSettingsPage(),
      ),
      GoRoute(
        path: AppRoutes.athleteNotifications,
        name: AppRouteNames.athleteNotifications,
        builder: (context, state) => const AthleteNotificationsPage(),
      ),
      GoRoute(
        path: AppRoutes.athletePrivacySecurity,
        name: AppRouteNames.athletePrivacySecurity,
        builder: (context, state) => const AthletePrivacySecurityPage(),
      ),
      GoRoute(
        path: AppRoutes.athleteChangePassword,
        name: AppRouteNames.athleteChangePassword,
        builder: (context, state) => const AthleteChangePasswordPage(),
      ),
      GoRoute(
        path: AppRoutes.athleteActiveSessions,
        name: AppRouteNames.athleteActiveSessions,
        builder: (context, state) => const AthleteActiveSessionsPage(),
      ),
      GoRoute(
        path: AppRoutes.athleteQuest,
        name: AppRouteNames.athleteQuest,
        builder: (context, state) => const AthleteQuestPage(),
      ),
      GoRoute(
        path: AppRoutes.athleteMatchHistory,
        name: AppRouteNames.athleteMatchHistory,
        builder: (context, state) => const AthleteMatchHistoryPage(),
        routes: [
          GoRoute(
            path: 'match/:matchId',
            name: AppRouteNames.athleteMatchDetail,
            builder: (context, state) {
              final matchId = state.pathParameters['matchId'] ?? '';
              final fromTournament = state.uri.queryParameters[
                      AppRoutes.matchDetailFromTournamentQuery] ==
                  '1';
              return AthleteMatchDetailPage(
                matchId: matchId,
                hideTournamentAction: fromTournament,
              );
            },
            routes: [
              GoRoute(
                path: 'play-by-play',
                name: AppRouteNames.athleteMatchPlayByPlay,
                builder: (context, state) {
                  final matchId = state.pathParameters['matchId'] ?? '';
                  return AthleteMatchPlayByPlayPage(matchId: matchId);
                },
              ),
            ],
          ),
          GoRoute(
            path: 'tournament/:tournamentId',
            name: AppRouteNames.athleteTournamentDetail,
            builder: (context, state) {
              final tournamentId = state.pathParameters['tournamentId'] ?? '';
              return AthleteTournamentDetailPage(tournamentId: tournamentId);
            },
          ),
        ],
      ),
      GoRoute(
        path: AppRoutes.athleteProfileUpdateSuccess,
        name: AppRouteNames.athleteProfileUpdateSuccess,
        builder: (context, state) => const AthleteProfileUpdateSuccessPage(),
      ),
      GoRoute(
        path: AppRoutes.athleteOnboarding,
        redirect: (context, state) {
          final path = state.uri.path;
          // Só redireciona a raiz; redirect incondicional no pai bloqueia rotas filhas.
          if (path == AppRoutes.athleteOnboarding ||
              path == '${AppRoutes.athleteOnboarding}/') {
            return AppRoutes.athleteOnboardingWelcome;
          }
          return null;
        },
        routes: [
          GoRoute(
            path: 'welcome',
            name: AppRouteNames.athleteOnboardingWelcome,
            builder: (context, state) => const AthleteOnboardingWelcomePage(),
          ),
          GoRoute(
            path: 'primary-sport',
            name: AppRouteNames.athleteOnboardingPrimarySport,
            builder: (context, state) =>
                const AthleteOnboardingPrimarySportStep(),
          ),
          GoRoute(
            path: 'other-sports',
            name: AppRouteNames.athleteOnboardingOtherSports,
            builder: (context, state) => const AthleteOnboardingOtherSportsStep(),
          ),
          GoRoute(
            path: 'level',
            name: AppRouteNames.athleteOnboardingLevel,
            builder: (context, state) => const AthleteOnboardingLevelStep(),
          ),
          GoRoute(
            path: 'goals',
            name: AppRouteNames.athleteOnboardingGoals,
            builder: (context, state) => const AthleteOnboardingGoalsStep(),
          ),
          GoRoute(
            path: 'profile',
            name: AppRouteNames.athleteOnboardingProfile,
            builder: (context, state) => const AthleteOnboardingProfileStep(),
          ),
        ],
      ),
      GoRoute(
        path: AppRoutes.myTournaments,
        name: AppRouteNames.myTournaments,
        builder: (context, state) => const MyTournamentsPage(),
      ),
      GoRoute(
        path: AppRoutes.tournamentDiscoveryList,
        name: AppRouteNames.tournamentDiscoveryList,
        builder: (context, state) {
          final searchOpen =
              state.uri.queryParameters['search']?.trim() == '1';
          final query = state.uri.queryParameters['q']?.trim() ?? '';
          return TournamentDiscoveryListPage(
            initialSearchOpen: searchOpen,
            initialQuery: query,
          );
        },
      ),
      GoRoute(
        path: AppRoutes.athleteRanking,
        name: AppRouteNames.athleteRanking,
        builder: (context, state) => const AthleteRankingPage(),
      ),
      GoRoute(
        path: AppRoutes.athleteDiscover,
        name: AppRouteNames.athleteDiscover,
        builder: (context, state) => const AthleteDiscoverPage(),
      ),
      GoRoute(
        path: AppRoutes.teamDiscover,
        name: AppRouteNames.teamDiscover,
        builder: (context, state) => const TeamDiscoverPage(),
      ),
      GoRoute(
        path: AppRoutes.teamProfile,
        name: AppRouteNames.teamProfile,
        builder: (context, state) {
          final teamId = state.pathParameters['teamId']?.trim() ?? '';
          return TeamPublicProfilePage(teamId: teamId);
        },
      ),
      GoRoute(
        path: AppRoutes.tournamentDetail,
        name: AppRouteNames.tournamentDetail,
        builder: (context, state) {
          final id = state.pathParameters['tournamentId']?.trim() ?? '';
          return TournamentDetailPage(tournamentId: id);
        },
      ),
      GoRoute(
        path: AppRoutes.tournamentDoubleEliminationBracket,
        name: AppRouteNames.tournamentDoubleEliminationBracket,
        builder: (context, state) {
          final tournamentId =
              state.pathParameters['tournamentId']?.trim() ?? '';
          final categoryId = state.pathParameters['categoryId']?.trim() ?? '';
          return DoubleEliminationBracketPage(
            tournamentId: tournamentId,
            categoryId: categoryId,
          );
        },
      ),
      GoRoute(
        path: AppRoutes.tournamentRegistration,
        name: AppRouteNames.tournamentRegistration,
        builder: (context, state) {
          final id = state.pathParameters['tournamentId']?.trim() ?? '';
          final categoryId = state.uri.queryParameters['categoryId']?.trim();
          final registrationId =
              state.uri.queryParameters['registrationId']?.trim();
          final inviteId = state.uri.queryParameters['inviteId']?.trim();
          final stepParam = state.uri.queryParameters['step']?.trim();
          TournamentRegistrationStep? initialStep;
          if (stepParam == 'payment') {
            initialStep = TournamentRegistrationStep.payment;
          } else if (stepParam == 'waiting') {
            initialStep = TournamentRegistrationStep.waiting;
          }
          return TournamentRegistrationPage(
            tournamentId: id,
            initialCategoryId: categoryId,
            initialRegistrationId: registrationId,
            initialInviteId: inviteId,
            initialStep: initialStep,
          );
        },
      ),
      GoRoute(
        path: AppRoutes.tournamentRegistrationPix,
        name: AppRouteNames.tournamentRegistrationPix,
        builder: (context, state) {
          final extra = state.extra;
          if (extra is TournamentRegistrationPixArgs) {
            return TournamentRegistrationPixPage(args: extra);
          }

          // Fallback para restore/deeplink sem `extra`.
          final tournamentId = state.pathParameters['tournamentId']?.trim() ?? '';
          final registrationId =
              state.uri.queryParameters['registrationId']?.trim() ?? '';
          final categoryId = state.uri.queryParameters['categoryId']?.trim();
          final tournamentName =
              state.uri.queryParameters['tournamentName']?.trim() ?? '';
          final categoryName =
              state.uri.queryParameters['categoryName']?.trim() ?? '';
          final shareAmountRaw =
              state.uri.queryParameters['shareAmountReais']?.trim() ?? '';
          final shareAmount = double.tryParse(shareAmountRaw);

          if (tournamentId.isNotEmpty &&
              registrationId.isNotEmpty &&
              tournamentName.isNotEmpty &&
              categoryName.isNotEmpty &&
              shareAmount != null &&
              shareAmount > 0) {
            return TournamentRegistrationPixPage(
              args: TournamentRegistrationPixArgs(
                registrationId: registrationId,
                tournamentId: tournamentId,
                tournamentName: tournamentName,
                categoryName: categoryName,
                shareAmountReais: shareAmount,
              ),
            );
          }

          return TournamentRegistrationPage(
            tournamentId: tournamentId,
            initialCategoryId: categoryId,
            initialRegistrationId: registrationId.isNotEmpty
                ? registrationId
                : null,
            initialStep: TournamentRegistrationStep.payment,
          );
        },
      ),
      GoRoute(
        path: AppRoutes.tournamentRegistrationSuccess,
        name: AppRouteNames.tournamentRegistrationSuccess,
        builder: (context, state) {
          final tournamentId = state.pathParameters['tournamentId']?.trim() ?? '';
          final extra = state.extra;
          if (extra is TournamentRegistrationSuccessArgs) {
            return TournamentRegistrationSuccessPage(args: extra);
          }

          final registrationId =
              state.uri.queryParameters['registrationId']?.trim() ?? '';
          final tournamentName =
              state.uri.queryParameters['tournamentName']?.trim() ?? '';
          final categoryName =
              state.uri.queryParameters['categoryName']?.trim() ?? '';

          if (tournamentId.isNotEmpty &&
              registrationId.isNotEmpty &&
              tournamentName.isNotEmpty &&
              categoryName.isNotEmpty) {
            return TournamentRegistrationSuccessPage(
              args: TournamentRegistrationSuccessArgs(
                tournamentId: tournamentId,
                registrationId: registrationId,
                tournamentName: tournamentName,
                categoryName: categoryName,
              ),
            );
          }

          return TournamentRegistrationPage(
            tournamentId: tournamentId,
            initialRegistrationId: registrationId.isNotEmpty
                ? registrationId
                : null,
            initialStep: TournamentRegistrationStep.payment,
          );
        },
      ),
      GoRoute(
        path: AppRoutes.tournamentPartnerInvite,
        name: AppRouteNames.tournamentPartnerInvite,
        builder: (context, state) {
          final inviteId = state.pathParameters['inviteId']?.trim() ?? '';
          return TournamentPartnerInvitePage(inviteId: inviteId);
        },
      ),
      GoRoute(
        path: AppRoutes.leagueDetail,
        name: AppRouteNames.leagueDetail,
        builder: (context, state) {
          final id = state.pathParameters['leagueId']?.trim() ?? '';
          return LeagueDetailPage(leagueId: id);
        },
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
                  GoRoute(
                    path: 'canceled',
                    name: AppRouteNames.arenaBookingCanceled,
                    builder: (context, state) {
                      final extra = state.extra;
                      if (extra is! ArenaBookingCanceledArgs) {
                        return const Scaffold(
                          body: Center(
                            child: Text('Dados de cancelamento inválidos.'),
                          ),
                        );
                      }
                      return ArenaBookingCanceledPage(args: extra);
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
                routes: [
                  GoRoute(
                    path: 'payments',
                    name: AppRouteNames.arenaPayments,
                    builder: (context, state) => const ArenaPaymentsPage(),
                  ),
                ],
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
        path: AppRoutes.arenaProducts,
        name: AppRouteNames.arenaProducts,
        builder: (context, state) => const ArenaProductsListPage(),
        routes: [
          GoRoute(
            path: 'new',
            name: AppRouteNames.arenaProductNew,
            builder: (context, state) => const ArenaProductFormPage(),
          ),
          GoRoute(
            path: 'stock',
            name: AppRouteNames.arenaProductStock,
            builder: (context, state) => const ArenaStockAlertsPage(),
          ),
          GoRoute(
            path: ':productId/edit',
            name: AppRouteNames.arenaProductEdit,
            builder: (context, state) {
              final productId = state.pathParameters['productId'] ?? '';
              return ArenaProductFormPage(productId: productId);
            },
          ),
          GoRoute(
            path: ':productId/restock',
            name: AppRouteNames.arenaProductRestock,
            builder: (context, state) {
              final productId = state.pathParameters['productId'] ?? '';
              return ArenaRestockPage(productId: productId);
            },
          ),
          GoRoute(
            path: 'deleted',
            name: AppRouteNames.arenaProductDeleted,
            builder: (context, state) {
              final extra = state.extra;
              if (extra is! ArenaProductDeleteArgs) {
                return const Scaffold(
                  body: Center(
                    child: Text('Dados de exclusão inválidos.'),
                  ),
                );
              }
              return ArenaProductDeletedPage(args: extra);
            },
          ),
        ],
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
          ArenaListItem? initial;
          var isBestPrice = state.uri.queryParameters['bestPrice'] == '1';
          if (extra is ArenaDetailRouteExtra) {
            initial = extra.arena;
            isBestPrice = isBestPrice || extra.isBestPrice;
          } else if (extra is ArenaListItem) {
            initial = extra;
          }
          return ArenaDetailPage(
            arenaId: arenaId,
            initialArena: initial?.id == arenaId ? initial : null,
            isBestPrice: isBestPrice,
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
          final arenaCity = state.uri.queryParameters['arenaCity']?.trim();
          return ArenaReviewsPage(
            arenaId: arenaId,
            arenaName: arenaName,
            arenaCity: arenaCity,
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
        path: AppRoutes.arenaBookingPix,
        name: AppRouteNames.arenaBookingPix,
        builder: (context, state) {
          final arenaId = state.pathParameters['arenaId']!;
          final extra = state.extra;
          if (extra is! ArenaBookingPixArgs) {
            return const Scaffold(
              body: Center(child: Text('Dados de pagamento inválidos.')),
            );
          }
          return ArenaBookingPixPage(arenaId: arenaId, args: extra);
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
      GoRoute(
        path: AppRoutes.bookingInvite,
        name: AppRouteNames.bookingInvite,
        builder: (context, state) {
          final inviteId = state.pathParameters['inviteId']!;
          return BookingInvitePage(inviteId: inviteId);
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
