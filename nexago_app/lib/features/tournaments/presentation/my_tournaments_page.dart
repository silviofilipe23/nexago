import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/app_status_views.dart';
import '../../athlete/domain/athlete_display_name.dart';
import '../../athlete/domain/athlete_profile_providers.dart';
import '../../organizer/presentation/staff/my_staff_tournaments_section.dart';
import '../../ranking/domain/ranking_display_helpers.dart';
import '../../ranking/domain/ranking_providers.dart';
import '../domain/athlete_tournament_day_providers.dart';
import '../domain/my_tournaments_logic.dart';
import '../domain/my_tournaments_models.dart';
import '../domain/tournament_discovery_models.dart';
import '../data/my_tournament_registrations_repository.dart';
import '../data/tournament_partner_invite_service.dart';
import '../domain/my_tournaments_providers.dart';
import '../domain/tournament_registration_navigation.dart';
import 'widgets/my_tournaments/my_tournaments_app_bar.dart';
import 'widgets/my_tournaments/my_tournaments_completed_row.dart';
import 'widgets/my_tournaments/my_tournaments_completed_stats.dart';
import 'widgets/my_tournaments/my_tournaments_day_match_widgets.dart';
import 'widgets/my_tournaments/my_tournaments_empty_state.dart';
import 'widgets/my_tournaments/my_tournaments_live_banner.dart';
import 'widgets/my_tournaments/my_tournaments_ongoing_card.dart';
import 'widgets/my_tournaments/my_tournaments_search_field.dart';
import 'widgets/my_tournaments/my_tournaments_section_header.dart';
import 'widgets/my_tournaments/my_tournaments_skeleton.dart';
import 'widgets/my_tournaments/my_tournaments_tabs.dart';

/// Lista de torneios inscritos do atleta (em andamento e concluídos).
class MyTournamentsPage extends ConsumerStatefulWidget {
  const MyTournamentsPage({super.key});

  @override
  ConsumerState<MyTournamentsPage> createState() => _MyTournamentsPageState();
}

class _MyTournamentsPageState extends ConsumerState<MyTournamentsPage> {
  MyTournamentsTab _tab = MyTournamentsTab.ongoing;
  bool _searchVisible = false;
  final _searchController = TextEditingController();
  String _searchQuery = '';
  bool _cancelling = false;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _toggleSearch() {
    setState(() {
      _searchVisible = !_searchVisible;
      if (!_searchVisible) {
        _searchController.clear();
        _searchQuery = '';
      }
    });
  }

  void _onSearchChanged(String value) {
    setState(() => _searchQuery = value);
  }

  void _closeSearch() {
    setState(() {
      _searchVisible = false;
      _searchController.clear();
      _searchQuery = '';
    });
  }

  void _openRegistration(MyTournamentRegistration registration) {
    navigateFromMyTournamentRegistration(context, registration);
  }

  Future<void> _confirmCancelEnrollment(MyTournamentEnrollment enrollment) async {
    if (_cancelling) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Cancelar inscrição?'),
        content: Text(
          'Sua vaga no ${enrollment.displayName} será liberada e outro '
          'atleta poderá se inscrever nesta categoria.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Voltar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Cancelar inscrição'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _cancelling = true);
    try {
      await ref
          .read(tournamentPartnerInviteServiceProvider)
          .cancelRegistration(enrollment.registration.registrationId);
      if (!mounted) return;
      showAppSnackBar(context, 'Inscrição cancelada.');
      ref.invalidate(myTournamentRegistrationsProvider);
    } on TournamentPartnerInviteException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } finally {
      if (mounted) setState(() => _cancelling = false);
    }
  }

  String _headerSubtitle(WidgetRef ref) {
    final profile = ref.watch(athleteProfileProvider).valueOrNull;
    final display = profile != null
        ? athleteDisplayName(profile, fallback: '')
        : '';
    final firstName = display.isNotEmpty
        ? display.split(RegExp(r'\s+')).first.toUpperCase()
        : 'ATLETA';
    return '$firstName • DUPLA';
  }

  @override
  Widget build(BuildContext context) {
    final pageAsync = ref.watch(myTournamentsPageStateProvider);
    final rankingAsync = ref.watch(competeHubUserRankingProvider);

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      appBar: MyTournamentsAppBar(
        subtitle: _headerSubtitle(ref),
        onBack: () {
          if (context.canPop()) {
            context.pop();
          } else {
            context.go(AppRoutes.discover);
          }
        },
        onSearchTap: _toggleSearch,
        searchActive: _searchVisible,
      ),
      body: SafeArea(
        top: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (_searchVisible)
              MyTournamentsSearchField(
                controller: _searchController,
                onChanged: _onSearchChanged,
                onClose: _closeSearch,
              ),
            Expanded(
              child: pageAsync.when(
                data: (state) {
                  if (state.enrollments.isEmpty) {
                    return ListView(
                      physics: const BouncingScrollPhysics(),
                      children: [
                        const MyStaffTournamentsSection(),
                        MyTournamentsTabs(
                          selected: _tab,
                          ongoingCount: 0,
                          completedCount: 0,
                          onChanged: (t) => setState(() => _tab = t),
                        ),
                        MyTournamentsEmptyState(tab: _tab),
                      ],
                    );
                  }

                  final filtered = filterEnrollmentsByQuery(
                    state.enrollments,
                    _searchQuery,
                  );
                  final split = splitMyTournamentEnrollments(filtered);
                  final ongoing = sortOngoingEnrollments(split.ongoing);
                  final completed = sortCompletedEnrollments(split.completed);

                  final rankingPoints = rankingAsync.valueOrNull?.points ?? 0;
                  final rankingDisplay = rankingPoints > 0
                      ? formatRankingPoints(rankingPoints)
                      : '—';

                  return ListView(
                    physics: const BouncingScrollPhysics(),
                    children: [
                      const MyStaffTournamentsSection(),
                      MyTournamentsTabs(
                        selected: _tab,
                        ongoingCount: state.ongoingCount,
                        completedCount: state.completedCount,
                        onChanged: (t) => setState(() => _tab = t),
                      ),
                      if (_tab == MyTournamentsTab.ongoing)
                        ..._buildOngoingTab(
                          state: state,
                          ongoing: ongoing,
                        )
                      else
                        ..._buildCompletedTab(
                          completed: completed,
                          rankingPointsDisplay: rankingDisplay,
                        ),
                      SizedBox(height: 24),
                    ],
                  );
                },
                loading: () => const MyTournamentsSkeleton(),
                error: (e, _) => AppErrorView(
                  title: 'Não foi possível carregar',
                  message: e.toString().replaceFirst('Exception: ', ''),
                  onRetry: () {
                    showAppSnackBar(context, 'Atualizando…');
                    ref.invalidate(myTournamentRegistrationsProvider);
                    ref.invalidate(myTournamentsPageStateProvider);
                  },
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _openPublicLive(String tournamentId, String matchId) {
    context.pushNamed(
      AppRouteNames.publicMatchLive,
      pathParameters: {
        'tournamentId': tournamentId.trim(),
        'matchId': matchId.trim(),
      },
    );
  }

  List<Widget> _buildOngoingTab({
    required MyTournamentsPageState state,
    required List<MyTournamentEnrollment> ongoing,
  }) {
    if (ongoing.isEmpty) {
      return [
        MyTournamentsEmptyState(tab: _tab),
      ];
    }

    final courtCall = ref.watch(athleteCourtCallMatchProvider).valueOrNull;
    final nextMatch = ref.watch(athleteNextMatchProvider).valueOrNull;
    final live = state.firstLive;
    final showLiveBanner = courtCall == null &&
        live != null &&
        ongoing.any((e) => e.tournamentId == live.tournamentId);

    return [
      if (courtCall != null)
        MyTournamentsCourtCallBanner(
          nextMatch: courtCall,
          onTap: () => _openPublicLive(
            courtCall.tournamentId,
            courtCall.match.id,
          ),
        ),
      if (courtCall == null && nextMatch != null)
        MyTournamentsNextMatchCard(
          nextMatch: nextMatch,
          onTap: () => _openPublicLive(
            nextMatch.tournamentId,
            nextMatch.match.id,
          ),
        ),
      if (showLiveBanner)
        MyTournamentsLiveBanner(
          enrollment: live,
          onTap: () => _openRegistration(live.registration),
        ),
      MyTournamentsSectionHeader(
        label: '${ongoing.length} TORNEIOS • ${state.seasonLabel}',
      ),
      for (final e in ongoing)
        MyTournamentsOngoingCard(
          enrollment: e,
          onTap: () => _openRegistration(e.registration),
          onCancel: e.canCancelRegistration && !_cancelling
              ? () => _confirmCancelEnrollment(e)
              : null,
        ),
    ];
  }

  List<Widget> _buildCompletedTab({
    required List<MyTournamentEnrollment> completed,
    required String rankingPointsDisplay,
  }) {
    if (completed.isEmpty) {
      return [
        MyTournamentsCompletedStats(
          titlesDisplay: '—',
          podiumsDisplay: '—',
          rankingPointsDisplay: rankingPointsDisplay,
        ),
        MyTournamentsEmptyState(tab: _tab),
      ];
    }

    return [
      MyTournamentsCompletedStats(
        titlesDisplay: '—',
        podiumsDisplay: '—',
        rankingPointsDisplay: rankingPointsDisplay,
      ),
      const MyTournamentsSectionHeader(
        label: 'HISTÓRICO • MAIS RECENTES',
      ),
      for (final e in completed)
        MyTournamentsCompletedRow(
          enrollment: e,
          onTap: () => _openRegistration(e.registration),
        ),
    ];
  }
}
