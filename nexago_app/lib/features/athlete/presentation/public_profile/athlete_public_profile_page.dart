import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/ui/nexa_share.dart';

import '../../../../core/auth/auth_providers.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../domain/athlete_follow_providers.dart';
import '../../domain/athlete_display_name.dart';
import '../../domain/athlete_profile_providers.dart';
import '../../domain/athlete_public_profile_models.dart';
import '../../domain/athlete_public_profile_providers.dart';
import '../../domain/gamification_providers.dart';
import '../../domain/sand_rank/sand_rank_providers.dart';
import 'widgets/public_profile_action_row.dart';
import 'widgets/public_profile_header.dart';
import 'widgets/public_profile_highlights_section.dart';
import 'widgets/public_profile_sports_section.dart';
import 'widgets/public_profile_stats_row.dart';
import 'widgets/public_profile_tabs.dart';

class AthletePublicProfilePage extends ConsumerStatefulWidget {
  const AthletePublicProfilePage({
    super.key,
    required this.userId,
  });

  final String userId;

  @override
  ConsumerState<AthletePublicProfilePage> createState() =>
      _AthletePublicProfilePageState();
}

class _AthletePublicProfilePageState
    extends ConsumerState<AthletePublicProfilePage> {
  PublicProfileTab _tab = PublicProfileTab.overview;
  var _followLoading = false;

  Future<void> _toggleFollow() async {
    final user = ref.read(authProvider).valueOrNull;
    final uid = user?.uid.trim();
    if (uid == null || uid.isEmpty) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Faça login para seguir atletas.')),
      );
      return;
    }

    final isFollowing =
        ref.read(athleteIsFollowingProvider(widget.userId)).valueOrNull ??
            false;

    setState(() => _followLoading = true);
    try {
      await ref.read(athleteFollowServiceProvider).setFollowing(
            followerId: uid,
            athleteId: widget.userId,
            follow: !isFollowing,
          );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Não foi possível atualizar o follow.\n$e')),
        );
      }
    } finally {
      if (mounted) setState(() => _followLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final profileAsync = ref.watch(athleteProfileByIdProvider(widget.userId));
    final rankingAsync = ref.watch(athletePublicRankingProvider(widget.userId));
    final partnersAsync =
        ref.watch(athletePublicPartnersProvider(widget.userId));
    final followersAsync =
        ref.watch(athleteFollowersCountProvider(widget.userId));
    final followingAsync =
        ref.watch(athleteFollowingCountProvider(widget.userId));
    final isFollowingAsync =
        ref.watch(athleteIsFollowingProvider(widget.userId));
    final currentUid = ref.watch(authProvider).valueOrNull?.uid.trim();
    final isSelf = currentUid == widget.userId;

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
              'Não foi possível carregar o perfil.\n$e',
              textAlign: TextAlign.center,
              style: TextStyle(color: AppColors.live),
            ),
          ),
        ),
        data: (profile) {
          if (profile == null) {
            return Center(
              child: Text(
                'Perfil não encontrado.',
                style: TextStyle(color: context.themeColors.onSurfaceMuted),
              ),
            );
          }

          if (profile.privacyPreferences.isProfilePrivate &&
              !isSelf) {
            return _PrivateBlocked(onBack: () => context.pop());
          }

          final ranking = rankingAsync.maybeWhen(
            data: (value) => value,
            orElse: () => const AthletePublicRankingSnapshot(),
          );
          final sports = ref.watch(athletePublicSportEntriesProvider(profile));
          final partners = partnersAsync.maybeWhen(
            data: (value) => value,
            orElse: () => const <AthletePublicPartnerEntry>[],
          );
          final followers = followersAsync.maybeWhen(
            data: (value) => value,
            orElse: () => 0,
          );
          final following = followingAsync.maybeWhen(
            data: (value) => value,
            orElse: () => 0,
          );
          final isFollowing = isFollowingAsync.maybeWhen(
            data: (value) => value,
            orElse: () => false,
          );
          final sandRankEnabled =
              ref.watch(sandRankEnabledProvider).valueOrNull ?? false;
          final sandRankInfo = sandRankEnabled
              ? ref
                  .watch(publicSandRankByUserIdProvider(widget.userId))
                  .valueOrNull
              : null;

          return RefreshIndicator(
            color: AppColors.brand,
            onRefresh: () async {
              ref.invalidate(athleteProfileByIdProvider(widget.userId));
              ref.invalidate(gamificationSummaryByUserIdProvider(widget.userId));
              ref.invalidate(athletePublicRankingProvider(widget.userId));
              ref.invalidate(athletePublicPartnersProvider(widget.userId));
              ref.invalidate(athletePublicMatchHistoryProvider(widget.userId));
            },
            child: CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverToBoxAdapter(
                  child: PublicProfileHeader(
                    profile: profile,
                    ranking: ranking,
                    onBack: () => context.pop(),
                    sandRank: sandRankInfo?.rank,
                    sandRankTitleId: sandRankInfo?.cosmetics.titleId,
                    sandRankFrameId: sandRankInfo?.cosmetics.frameId,
                  ),
                ),
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.only(top: 16),
                    child: PublicProfileActionRow(
                      isFollowing: isFollowing,
                      isSelf: isSelf,
                      followLoading: _followLoading,
                      onFollow: _toggleFollow,
                      onInvite: () {
                        if (isSelf) {
                          context.pushNamed(AppRouteNames.athleteProfileEdit);
                          return;
                        }
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('Convite para dupla em breve.'),
                          ),
                        );
                      },
                      onShare: () {
                        nexaShareText(
                          context,
                          'Confira o perfil de ${athleteDisplayName(profile)} no NexaGO.',
                        );
                      },
                    ),
                  ),
                ),
                SliverToBoxAdapter(
                  child: PublicProfileStatsRow(
                    followers: followers,
                    following: following,
                    mutualPartners: partners,
                  ),
                ),
                SliverToBoxAdapter(
                  child: PublicProfileSportsSection(sports: sports),
                ),
                SliverToBoxAdapter(
                  child: PublicProfileHighlightsSection(
                    photoUrls: profile.highlightPhotoUrls,
                  ),
                ),
                SliverToBoxAdapter(
                  child: PublicProfileTabBar(
                    selected: _tab,
                    onChanged: (tab) => setState(() => _tab = tab),
                  ),
                ),
                SliverToBoxAdapter(
                  child: _buildTabContent(
                    partners: partners,
                    ranking: ranking,
                    isSelf: isSelf,
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

  Widget _buildTabContent({
    required List<AthletePublicPartnerEntry> partners,
    required AthletePublicRankingSnapshot ranking,
    required bool isSelf,
  }) {
    switch (_tab) {
      case PublicProfileTab.overview:
        return PublicProfileOverviewTab(
          ranking: ranking,
          partners: partners,
          onPartnerTap: (uid) {
            context.pushNamed(
              AppRouteNames.athleteProfile,
              queryParameters: {'userId': uid},
            );
          },
        );
      case PublicProfileTab.matches:
        return PublicProfileMatchesTab(
          userId: widget.userId,
          onMatchTap: isSelf
              ? (matchId) {
                  context.pushNamed(
                    AppRouteNames.athleteMatchDetail,
                    pathParameters: {'matchId': matchId},
                  );
                }
              : null,
        );
      case PublicProfileTab.achievements:
        return const PublicProfilePlaceholderTab(
          message: 'Conquistas públicas em breve.',
        );
    }
  }
}

class _PrivateBlocked extends StatelessWidget {
  const _PrivateBlocked({required this.onBack});

  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Column(
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: IconButton(
              onPressed: onBack,
              icon: Icon(Icons.arrow_back_rounded),
            ),
          ),
          Expanded(
            child: Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Text(
                  'Este perfil é privado.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: context.themeColors.onSurfaceMuted),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}