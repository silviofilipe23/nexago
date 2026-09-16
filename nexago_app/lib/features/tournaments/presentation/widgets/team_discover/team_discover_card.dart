import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_motion.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../../athlete/domain/athlete_public_profile_models.dart';
import '../../../domain/team_discover_models.dart';
import 'team_discover_dual_avatars.dart';

/// Linha da listagem de duplas — mesma anatomia do `AthleteDiscoverCard`:
/// sem card, nome em cima e linhas mono embaixo. O único elemento exclusivo da
/// dupla é o `#rank`; seguir mora no perfil dela, não aqui.
class TeamDiscoverCard extends StatefulWidget {
  const TeamDiscoverCard({super.key, required this.entry});

  final TeamDiscoverEntry entry;

  @override
  State<TeamDiscoverCard> createState() => _TeamDiscoverCardState();
}

class _TeamDiscoverCardState extends State<TeamDiscoverCard> {
  var _pressed = false;

  void _setPressed(bool value) {
    if (_pressed == value) return;
    setState(() => _pressed = value);
  }

  @override
  Widget build(BuildContext context) {
    final entry = widget.entry;
    final rank = entry.rankPosition;

    // Sem nome próprio, `displayName` já é derivado dos dois atletas — repetir
    // os nomes embaixo seria eco.
    final hasOwnName = (entry.team.teamName ?? '').trim().isNotEmpty;
    final members = hasOwnName ? entry.membersLabel.toUpperCase() : '';

    // Só cidade · UF: o esporte tem linha própria, porque junto aqui a linha
    // truncava em quase toda dupla num aparelho de 390pt.
    final detail = entry.locationLabel.toUpperCase();
    final hasContextLine = entry.isLookingForPartner || detail.isNotEmpty;

    final sport = entry.primarySportLabel.trim();
    final sportLabel = sport == '—' ? '' : sport.toUpperCase();

    return AnimatedScale(
      scale: _pressed ? 0.97 : 1,
      duration: AppMotion.fast,
      curve: AppMotion.curve,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTapDown: (_) => _setPressed(true),
        onTapUp: (_) => _setPressed(false),
        onTapCancel: () => _setPressed(false),
        onTap: () => context.pushNamed(
          AppRouteNames.teamProfile,
          pathParameters: {'teamId': entry.teamId},
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Row(
            children: [
              TeamDiscoverDualAvatars(
                entry: entry,
                size: TeamDiscoverDualAvatars.listAvatarSize,
                overlapFactor: TeamDiscoverDualAvatars.listOverlap,
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      entry.displayName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.soraRegular(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: context.themeColors.onSurface,
                      ),
                    ),
                    if (members.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        members,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.mono(
                          fontSize: 9,
                          color: context.themeColors.onSurfaceMuted,
                          height: 1.2,
                          letterSpacing: 0,
                        ),
                      ),
                    ],
                    if (hasContextLine) ...[
                      const SizedBox(height: 2),
                      _ContextLine(
                        lookingForPartner: entry.isLookingForPartner,
                        detail: detail,
                      ),
                    ],
                    // Força da equipe: o nível vem colado no esporte a que ele
                    // se refere — solto numa linha compartilhada, não dizia de
                    // que esporte era aquele nível.
                    const SizedBox(height: 3),
                    Row(
                      children: [
                        if (sportLabel.isNotEmpty) ...[
                          Flexible(
                            child: Text(
                              sportLabel,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: AppTypography.mono(
                                fontSize: 9,
                                fontWeight: FontWeight.w600,
                                color: context.themeColors.onSurfaceMuted,
                                height: 1.2,
                                letterSpacing: 0,
                              ),
                            ),
                          ),
                          const SizedBox(width: 7),
                        ],
                        _LevelDots(segments: entry.levelSegments),
                      ],
                    ),
                  ],
                ),
              ),
              if (rank != null) ...[
                const SizedBox(width: 10),
                Text(
                  '#$rank',
                  style: AppTypography.soraRegular(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                    height: 1,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// `PROCURA DUPLA · GOIÂNIA · GO` numa linha só: a etiqueta em brand ocupa o
/// lugar do `contextTag` do card de atleta.
class _ContextLine extends StatelessWidget {
  const _ContextLine({required this.lookingForPartner, required this.detail});

  final bool lookingForPartner;
  final String detail;

  @override
  Widget build(BuildContext context) {
    final base = AppTypography.mono(
      fontSize: 9,
      fontWeight: FontWeight.w600,
      color: context.themeColors.onSurfaceMuted,
      height: 1.2,
      letterSpacing: 0,
    );

    return Text.rich(
      TextSpan(
        children: [
          if (lookingForPartner)
            TextSpan(
              text: 'PROCURA DUPLA',
              style: base.copyWith(
                color: AppColors.brand,
                fontWeight: FontWeight.w800,
              ),
            ),
          if (lookingForPartner && detail.isNotEmpty)
            const TextSpan(text: ' · '),
          if (detail.isNotEmpty) TextSpan(text: detail),
        ],
      ),
      style: base,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
    );
  }
}

class _LevelDots extends StatelessWidget {
  const _LevelDots({required this.segments});

  final int segments;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 0; i < athleteLevelSegmentCount; i++) ...[
          if (i > 0) const SizedBox(width: 4),
          Container(
            width: 5,
            height: 5,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: i < segments
                  ? AppColors.brand
                  : context.themeColors.surfaceRaised,
            ),
          ),
        ],
      ],
    );
  }
}
