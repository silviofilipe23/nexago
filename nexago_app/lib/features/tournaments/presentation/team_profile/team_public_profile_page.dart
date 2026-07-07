import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../domain/team_follow_providers.dart';
import '../../domain/team_profile/team_public_profile_logic.dart';
import '../../domain/team_profile/team_public_profile_models.dart';
import '../../domain/team_profile/team_public_profile_providers.dart';
import 'widgets/team_profile_action_row.dart';
import 'widgets/team_profile_athletes_section.dart';
import 'widgets/team_profile_header.dart';
import 'widgets/team_profile_stats_row.dart';
import 'widgets/team_profile_tabs.dart';

class TeamPublicProfilePage extends ConsumerStatefulWidget {
  const TeamPublicProfilePage({super.key, required this.teamId});

  final String teamId;

  @override
  ConsumerState<TeamPublicProfilePage> createState() =>
      _TeamPublicProfilePageState();
}

class _TeamPublicProfilePageState extends ConsumerState<TeamPublicProfilePage> {
  TeamProfileTab _tab = TeamProfileTab.overview;

  Future<void> _refresh() async {
    ref.invalidate(teamPublicProfileProvider(widget.teamId));
    ref.invalidate(teamMatchHistoryProvider(widget.teamId));
    ref.invalidate(teamIsFollowedProvider(widget.teamId));
    await Future.wait([
      ref.read(teamPublicProfileProvider(widget.teamId).future),
      ref.read(teamMatchHistoryProvider(widget.teamId).future),
    ]);
  }

  void _onChallenge() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Desafiar dupla — em breve.')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final profileAsync = ref.watch(teamPublicProfileProvider(widget.teamId));
    final historyAsync = ref.watch(teamMatchHistoryProvider(widget.teamId));
    final isFollowingAsync = ref.watch(teamIsFollowedProvider(widget.teamId));

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: profileAsync.when(
        loading: () => Center(
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              'Não foi possível carregar a dupla.\n$e',
              textAlign: TextAlign.center,
              style: TextStyle(color: AppColors.live),
            ),
          ),
        ),
        data: (profile) {
          if (profile == null) {
            return Center(
              child: Text(
                'Dupla não encontrada.',
                style: TextStyle(color: context.themeColors.onSurfaceMuted),
              ),
            );
          }

          final history = historyAsync.valueOrNull;
          final campaigns = history == null
              ? const <TeamCampaignEntry>[]
              : buildTeamCampaigns(
                  matches: history.matches,
                  teamId: widget.teamId,
                  tournamentNames: history.tournamentNames,
                );
          final stats = history == null
              ? TeamProfileStats(points: profile.ranking.points)
              : buildTeamProfileStats(
                  matches: history.matches,
                  teamId: widget.teamId,
                  rankingPoints: profile.ranking.points,
                );
          final headToHead = history == null
              ? const <TeamHeadToHeadEntry>[]
              : buildTeamHeadToHead(
                  matches: history.matches,
                  teamId: widget.teamId,
                  teamDisplayNames: history.teamDisplayNames,
                );
          final formedLabel = formatTeamFormedLabel(profile.team.createdAt);
          final isFollowing = isFollowingAsync.valueOrNull ?? false;

          return RefreshIndicator(
            color: AppColors.brand,
            onRefresh: _refresh,
            child: CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(
                parent: BouncingScrollPhysics(),
              ),
              slivers: [
                SliverToBoxAdapter(
                  child: TeamProfileHeader(
                    profile: profile,
                    onBack: () => context.pop(),
                  ),
                ),
                SliverToBoxAdapter(
                  child: TeamProfileActionRow(
                    teamId: widget.teamId,
                    team: profile.team,
                    isFollowing: isFollowing,
                    isCurrentUserTeam: profile.isCurrentUserTeam,
                    onFollowStateChanged: () {
                      ref.invalidate(teamIsFollowedProvider(widget.teamId));
                    },
                    onChallenge: _onChallenge,
                  ),
                ),
                SliverToBoxAdapter(child: TeamProfileStatsRow(stats: stats)),
                SliverToBoxAdapter(
                  child: TeamProfileAthletesSection(profile: profile),
                ),
                SliverToBoxAdapter(
                  child: TeamProfileTabBar(
                    selected: _tab,
                    onChanged: (tab) => setState(() => _tab = tab),
                  ),
                ),
                SliverToBoxAdapter(
                  child: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 220),
                    switchInCurve: Curves.easeOutCubic,
                    switchOutCurve: Curves.easeInCubic,
                    child: switch (_tab) {
                      TeamProfileTab.overview => TeamProfileOverviewTab(
                          key: const ValueKey('overview'),
                          campaigns: campaigns,
                          formedLabel: formedLabel,
                        ),
                      TeamProfileTab.history => TeamProfileHistoryTab(
                          key: const ValueKey('history'),
                          campaigns: campaigns,
                          formedLabel: formedLabel,
                        ),
                      TeamProfileTab.headToHead => TeamProfileHeadToHeadTab(
                          key: const ValueKey('h2h'),
                          entries: headToHead,
                        ),
                    },
                  ),
                ),
                const SliverToBoxAdapter(child: SizedBox(height: 32)),
              ],
            ),
          );
        },
      ),
    );
  }
}
