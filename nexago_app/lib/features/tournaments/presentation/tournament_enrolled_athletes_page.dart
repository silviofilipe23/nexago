import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../athlete/presentation/widgets/athlete_profile_avatar.dart';
import '../domain/tournament_discovery_providers.dart';
import '../domain/tournament_enrolled_athletes_logic.dart';
import '../domain/tournament_enrolled_athletes_providers.dart';
import 'widgets/tournament_detail/tournament_detail_category_chips.dart';
import 'widgets/tournament_detail/tournament_detail_subpage_scaffold.dart';

/// Equipes com inscrição confirmada, agrupadas por categoria.
///
/// Chips no topo filtram a categoria. Cada linha é uma equipe (avatares
/// empilhados + "Nome1 / Nome2"); com `teamId`, toque abre o perfil da dupla.
class TournamentEnrolledAthletesPage extends ConsumerStatefulWidget {
  const TournamentEnrolledAthletesPage({super.key, required this.tournamentId});

  final String tournamentId;

  @override
  ConsumerState<TournamentEnrolledAthletesPage> createState() =>
      _TournamentEnrolledAthletesPageState();
}

class _TournamentEnrolledAthletesPageState
    extends ConsumerState<TournamentEnrolledAthletesPage> {
  static const _title = 'Equipes inscritas';
  static const _allCategoriesId = '';

  String _selectedCategoryId = _allCategoriesId;

  @override
  Widget build(BuildContext context) {
    final tournamentAsync = ref.watch(
      tournamentDetailProvider(widget.tournamentId),
    );
    final teamsAsync = ref.watch(
      tournamentEnrolledTeamsProvider(widget.tournamentId),
    );

    return tournamentAsync.when(
      loading: () => const _Loading(),
      error: (error, stackTrace) => const TournamentDetailSubpageScaffold(
        title: _title,
        slivers: [_MessageSliver('Não foi possível carregar o torneio.')],
      ),
      data: (tournament) {
        if (tournament == null) {
          return const TournamentDetailSubpageScaffold(
            title: _title,
            slivers: [_MessageSliver('Torneio não encontrado.')],
          );
        }

        return teamsAsync.when(
          loading: () => const _Loading(),
          error: (error, stackTrace) => const TournamentDetailSubpageScaffold(
            title: _title,
            slivers: [
              _MessageSliver('Não foi possível carregar as equipes inscritas.'),
            ],
          ),
          data: (teams) {
            final filtered = filterEnrolledTeamsByCategory(
              teams,
              _selectedCategoryId,
            );
            final groups = groupEnrolledTeamsByCategory(filtered);
            final chipOptions = <TournamentCategoryChipOption>[
              (id: _allCategoriesId, name: 'Todas'),
              for (final c in tournament.categoryOffers)
                if (c.id.trim().isNotEmpty) (id: c.id, name: c.name),
            ];

            return TournamentDetailSubpageScaffold(
              title: _title,
              slivers: [
                if (chipOptions.length > 2)
                  SliverToBoxAdapter(
                    child: TournamentDetailCategoryChips.fromOptions(
                      options: chipOptions,
                      selectedId: _selectedCategoryId,
                      onSelected: (id) =>
                          setState(() => _selectedCategoryId = id),
                    ),
                  ),
                if (groups.isEmpty)
                  const _MessageSliver(
                    'Nenhuma equipe com inscrição confirmada ainda.',
                  )
                else
                  for (final group in groups) ...[
                    SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
                        child: Text(
                          group.categoryName.toUpperCase(),
                          style: AppTypography.mono(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 1.1,
                            color: context.themeColors.onSurfaceMuted,
                          ),
                        ),
                      ),
                    ),
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
                      sliver: SliverList.separated(
                        itemCount: group.teams.length,
                        separatorBuilder: (context, index) =>
                            const SizedBox(height: AppSpacing.sm),
                        itemBuilder: (context, index) {
                          final team = group.teams[index];
                          return _TeamRow(
                            team: team,
                            onTap: team.teamId.isEmpty
                                ? null
                                : () => context.pushNamed(
                                    AppRouteNames.teamProfile,
                                    pathParameters: {'teamId': team.teamId},
                                  ),
                          );
                        },
                      ),
                    ),
                  ],
              ],
            );
          },
        );
      },
    );
  }
}

class _TeamRow extends StatelessWidget {
  const _TeamRow({required this.team, this.onTap});

  final TournamentEnrolledTeam team;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final namesJoined = team.members.map((m) => m.name).join(' / ');
    final showMembersSubtitle =
        team.displayName != namesJoined && team.members.isNotEmpty;
    return Material(
      color: colors.surfaceCard,
      borderRadius: BorderRadius.circular(AppRadii.md),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadii.md),
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md,
            vertical: AppSpacing.sm + 2,
          ),
          child: Row(
            children: [
              _MemberAvatarStack(members: team.members),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      team.displayName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.bodyM.copyWith(
                        fontWeight: FontWeight.w600,
                        color: colors.onSurface,
                        fontSize: 12,
                      ),
                    ),
                    if (showMembersSubtitle) ...[
                      const SizedBox(height: 2),
                      Text(
                        namesJoined,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.bodyS.copyWith(
                          color: colors.onSurfaceMuted,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              if (onTap != null)
                Icon(Icons.chevron_right_rounded, color: colors.onSurfaceMuted),
            ],
          ),
        ),
      ),
    );
  }
}

class _MemberAvatarStack extends StatelessWidget {
  const _MemberAvatarStack({required this.members});

  final List<TournamentEnrolledTeamMember> members;

  static const _size = 40.0;
  static const _overlap = 14.0;

  @override
  Widget build(BuildContext context) {
    final shown = members.take(4).toList(growable: false);
    if (shown.isEmpty) {
      return const AthleteProfileAvatar(size: _size, initials: '?');
    }
    final width = _size + (shown.length - 1) * (_size - _overlap);
    return SizedBox(
      width: width,
      height: _size,
      child: Stack(
        children: [
          for (var i = 0; i < shown.length; i++)
            Positioned(
              left: i * (_size - _overlap),
              child: AthleteProfileAvatar(
                size: _size,
                initials: shown[i].initials,
                imageUrl: shown[i].photoUrl,
              ),
            ),
        ],
      ),
    );
  }
}

class _Loading extends StatelessWidget {
  const _Loading();

  @override
  Widget build(BuildContext context) {
    return const TournamentDetailSubpageScaffold(
      title: 'Equipes inscritas',
      slivers: [
        SliverFillRemaining(
          hasScrollBody: false,
          child: Center(
            child: CircularProgressIndicator(color: AppColors.brand),
          ),
        ),
      ],
    );
  }
}

class _MessageSliver extends StatelessWidget {
  const _MessageSliver(this.message);

  final String message;

  @override
  Widget build(BuildContext context) {
    return SliverFillRemaining(
      hasScrollBody: false,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.xl),
          child: Text(
            message,
            textAlign: TextAlign.center,
            style: AppTypography.bodyM.copyWith(
              color: context.themeColors.onSurfaceMuted,
            ),
          ),
        ),
      ),
    );
  }
}
