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
import '../../domain/public_profile_game_summary.dart';
import '../../domain/sand_rank/sand_rank_providers.dart';
import '../../../arenas/domain/booking_result_record.dart';
import '../../../arenas/domain/booking_result_record_providers.dart';
import '../../../arenas/domain/pelada.dart';
import 'widgets/public_profile_achievements_tab.dart';
import 'widgets/public_profile_peladas_tab.dart';
import 'widgets/public_profile_about_section.dart';
import 'widgets/public_profile_action_row.dart';
import 'widgets/public_profile_header.dart';
import 'widgets/public_profile_highlights_section.dart';
import 'widgets/public_profile_professor_widgets.dart';
import 'widgets/public_profile_sports_section.dart';
import 'widgets/public_profile_stats_row.dart';
import 'widgets/public_profile_tabs.dart';
import 'widgets/public_profile_tournaments_tab.dart';

class AthletePublicProfilePage extends ConsumerStatefulWidget {
  const AthletePublicProfilePage({
    super.key,
    required this.userId,
    this.professorView = false,
    this.onProfessorEvaluate,
  });

  final String userId;

  /// Aberto pelo professor a partir do aluno (I1–I6). Mostra a faixa "visto
  /// como professor", a aba Torneios e a nota com os números do aluno; troca
  /// as ações sociais (seguir, convidar) por nada. NÃO libera dado nenhum:
  /// a privacidade é a mesma de qualquer visitante (ver
  /// [publicProfileVisibilityFor]).
  final bool professorView;

  /// Ação "Avaliar aluno" da nota do professor.
  final VoidCallback? onProfessorEvaluate;

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
    // Aba Peladas só com pelada confirmada no ano (spec 00d).
    final peladas =
        ref.watch(userConfirmedPeladasProvider(widget.userId)).valueOrNull ??
            const <SavedBookingResult>[];
    final showPeladas = peladasSummary(
          peladasOf(peladas, widget.userId),
          widget.userId,
          year: DateTime.now().year,
        ).sessions >
        0;
    final rankingAsync = ref.watch(athletePublicRankingProvider(widget.userId));
    final partnersAsync = ref.watch(
      athletePublicPartnersProvider(widget.userId),
    );
    final followersAsync = ref.watch(
      athleteFollowersCountProvider(widget.userId),
    );
    final followingAsync = ref.watch(
      athleteFollowingCountProvider(widget.userId),
    );
    final isFollowingAsync = ref.watch(
      athleteIsFollowingProvider(widget.userId),
    );
    final currentUid = ref.watch(authProvider).valueOrNull?.uid.trim();
    final isSelf = currentUid == widget.userId;

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: profileAsync.when(
        loading: () =>
            Center(child: CircularProgressIndicator(color: AppColors.brand)),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              'Não foi possível carregar o perfil.\n$e',
              textAlign: TextAlign.center,
              style: TextStyle(color: context.themeColors.live),
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

          final visibility = publicProfileVisibilityFor(
            profile.privacyPreferences,
            isSelf: isSelf,
            professorView: widget.professorView,
          );
          if (visibility.blocked) {
            if (widget.professorView) {
              return PublicProfileRestrictedView(
                profile: profile,
                onBack: () => context.pop(),
              );
            }
            return _PrivateBlocked(onBack: () => context.pop());
          }

          final ranking = rankingAsync.maybeWhen(
            data: (value) => value,
            orElse: () => const AthletePublicRankingSnapshot(),
          );
          final sportsBase = ref.watch(
            athletePublicSportEntriesProvider(profile),
          );
          // A posição por modalidade chega depois (outra consulta). Enquanto
          // não chega, as entradas seguem sem posição e o card mostra
          // travessão — a seção não espera por ela para aparecer.
          final sports = withSportRanks(
            sportsBase,
            ref.watch(athleteSportRanksProvider(widget.userId)).valueOrNull ??
                const {},
          );
          final partners = visibility.showPartners
              ? partnersAsync.maybeWhen(
                  data: (value) => value,
                  orElse: () => const <AthletePublicPartnerEntry>[],
                )
              : const <AthletePublicPartnerEntry>[];
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
              ref.invalidate(
                gamificationSummaryByUserIdProvider(widget.userId),
              );
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
                    sandRankFrameId: sandRankInfo?.cosmetics.frameId,
                  ),
                ),
                if (widget.professorView)
                  const SliverToBoxAdapter(
                    child: PublicProfileProfessorBanner(),
                  )
                else
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
                          final nome = athleteDisplayName(profile);
                          final url = athletePublicProfileUrl(profile);
                          // Segue por `nexaShareText`, e não por `nexaShareUri`,
                          // porque é ele quem acrescenta a hashtag da campanha.
                          nexaShareText(
                            context,
                            'Confira o perfil de $nome no NexaGO. $url',
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
                  child: PublicProfileAboutSection(bio: profile.bio ?? ''),
                ),
                SliverToBoxAdapter(
                  child: PublicProfileTabBar(
                    selected: _tab,
                    showPeladas: showPeladas,
                    showTournaments: widget.professorView,
                    onChanged: (tab) => setState(() => _tab = tab),
                  ),
                ),
                SliverToBoxAdapter(
                  child: _buildTabContent(
                    partners: partners,
                    ranking: ranking,
                    isSelf: isSelf,
                    peladas: showPeladas ? peladas : null,
                    partnersHidden: !visibility.showPartners,
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
    List<SavedBookingResult>? peladas,
    bool partnersHidden = false,
  }) {
    // A aba some se as peladas somem (ou ainda não chegaram): volta ao início.
    final tab = (_tab == PublicProfileTab.peladas && peladas == null) ||
            (_tab == PublicProfileTab.tournaments && !widget.professorView)
        ? PublicProfileTab.overview
        : _tab;
    switch (tab) {
      case PublicProfileTab.overview:
        final overview = PublicProfileOverviewTab(
          ranking: ranking,
          partners: partners,
          onPartnerTap: (uid) {
            context.pushNamed(
              AppRouteNames.athleteProfile,
              queryParameters: {'userId': uid},
            );
          },
        );
        if (!widget.professorView) return overview;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            PublicProfileProfessorSummary(
              userId: widget.userId,
              ranking: ranking,
              onEvaluate: widget.onProfessorEvaluate,
            ),
            overview,
            if (partnersHidden)
              const Padding(
                key: Key('public-profile-partners-hidden'),
                padding: EdgeInsets.fromLTRB(20, 20, 20, 0),
                child: PublicProfileHiddenSection(
                  message: 'Parceiros frequentes ocultos pelo atleta.',
                ),
              ),
          ],
        );
      case PublicProfileTab.tournaments:
        return PublicProfileTournamentsTab(userId: widget.userId);
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
      case PublicProfileTab.peladas:
        return PublicProfilePeladasTab(
          userId: widget.userId,
          peladas: peladas ?? const [],
        );
      case PublicProfileTab.achievements:
        return PublicProfileAchievementsTab(userId: widget.userId);
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
