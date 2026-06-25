import 'package:flutter/material.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../domain/tournament_discovery_models.dart';
import '../domain/tournament_discovery_providers.dart';
import '../domain/tournament_listing_status.dart';
import '../../athlete/domain/daily_mission_sync_provider.dart';
import 'widgets/tournament_discovery_card.dart';
import 'widgets/league_detail_ranking_section.dart';

class LeagueDetailPage extends ConsumerStatefulWidget {
  const LeagueDetailPage({super.key, required this.leagueId});

  final String leagueId;

  @override
  ConsumerState<LeagueDetailPage> createState() => _LeagueDetailPageState();
}

class _LeagueDetailPageState extends ConsumerState<LeagueDetailPage> {
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final leagueAsync = ref.watch(leagueDetailProvider(widget.leagueId));
    final tournamentsAsync = ref.watch(discoveryTournamentsProvider);
    final league = leagueAsync.valueOrNull;

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      appBar: _buildAppBar(context, theme, league),
      body: leagueAsync.when(
        loading: () => Center(
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
        error: (e, _) => Center(
          child: Text(
            'Não foi possível carregar a liga.\n$e',
            style: theme.textTheme.bodyLarge?.copyWith(color: AppColors.live),
          ),
        ),
        data: (league) {
          if (league == null) {
            return Center(child: Text('Liga não encontrada.'));
          }

          WidgetsBinding.instance.addPostFrameCallback((_) {
            tryAwardExploreTournamentMission(
              ref,
              listingId: 'league_${widget.leagueId}',
            );
          });

          final tournaments = tournamentsAsync.valueOrNull ?? [];
          final byId = {for (final t in tournaments) t.id: t};
          final listingBanner =
              leagueListingBannerMessage(league.listingStatus);

          return ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
            children: [
              if (listingBanner != null) ...[
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: AppColors.live.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: AppColors.live.withValues(alpha: 0.35),
                    ),
                  ),
                  child: Text(
                    listingBanner,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: AppColors.live,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                const SizedBox(height: 16),
              ],
              LeagueDetailRankingSection(league: league),
              SizedBox(height: 8),
              for (final stage in league.stages) ...[
                Text(
                  stage.name,
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                  ),
                ),
                if (stage.dateLabel != null) ...[
                  SizedBox(height: 4),
                  Text(
                    stage.dateLabel!,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: context.themeColors.onSurfaceMuted,
                    ),
                  ),
                ],
                SizedBox(height: 10),
                for (final tid in stage.tournamentIds) ...[
                  if (byId.containsKey(tid)) ...[
                    TournamentDiscoveryCard(
                      tournament: byId[tid]!,
                      onTap: () => context.pushNamed(
                        AppRouteNames.tournamentDetail,
                        pathParameters: {'tournamentId': tid},
                      ),
                    ),
                    SizedBox(height: 10),
                  ],
                ],
                SizedBox(height: 14),
              ],
            ],
          );
        },
      ),
    );
  }

  PreferredSizeWidget _buildAppBar(
    BuildContext context,
    ThemeData theme,
    DiscoveryLeague? league,
  ) {
    final subtitle = league != null ? _leagueSubtitle(league) : null;
    final hasSubtitle = subtitle != null;

    return NexaAppBar(
      backgroundColor: context.themeColors.canvas,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      centerTitle: false,
      toolbarHeight: hasSubtitle ? 64 : kToolbarHeight,
      titleSpacing: 8,
      leading: Padding(
        padding: const EdgeInsets.only(left: 12),
        child: Center(
          child: Material(
            color: context.themeColors.surfaceRaised,
            borderRadius: BorderRadius.circular(12),
            child: InkWell(
              onTap: () => context.pop(),
              borderRadius: BorderRadius.circular(12),
              child: SizedBox(
                width: 40,
                height: 40,
                child: Icon(
                  Icons.chevron_left_rounded,
                  color: context.themeColors.onSurface,
                ),
              ),
            ),
          ),
        ),
      ),
      title: hasSubtitle
          ? Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  subtitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.mono(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    color: context.themeColors.onSurfaceMuted,
                    letterSpacing: 0.4,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  league!.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                    letterSpacing: -0.2,
                    height: 1.1,
                  ),
                ),
              ],
            )
          : Text(
              league?.name ?? 'Liga',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
                color: context.themeColors.onSurface,
                letterSpacing: -0.2,
              ),
            ),
    );
  }

  String? _leagueSubtitle(DiscoveryLeague league) {
    final parts = <String>[
      if (league.seasonLabel != null && league.seasonLabel!.trim().isNotEmpty)
        league.seasonLabel!.trim(),
      if (league.city != null && league.city!.trim().isNotEmpty)
        league.city!.trim(),
    ];
    if (parts.isEmpty) return null;
    return parts.join(' · ');
  }
}
