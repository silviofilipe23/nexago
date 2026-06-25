import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../domain/category_ops/category_ops_logic.dart';
import '../../../domain/category_ops/category_ops_models.dart';
import 'organizer_team_dual_avatars.dart';

class OrganizerGroupDrawHeader extends StatelessWidget {
  const OrganizerGroupDrawHeader({
    super.key,
    required this.eyebrow,
    required this.onBack,
    required this.onClose,
  });

  final String eyebrow;
  final VoidCallback onBack;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
      child: Row(
        children: [
          _GroupDrawIconButton(
            icon: Icons.arrow_back_ios_new_rounded,
            onPressed: onBack,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (eyebrow.isNotEmpty)
                  Text(
                    eyebrow,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.mono(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: AppColors.brand,
                      letterSpacing: 0.6,
                    ),
                  ),
                if (eyebrow.isNotEmpty) const SizedBox(height: 2),
                Text(
                  'Sorteio de grupos',
                  style: AppTypography.soraRegular(
                    fontSize: 22,
                    fontWeight: FontWeight.w900,
                    color: context.themeColors.onSurface,
                    height: 1.1,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          _GroupDrawIconButton(icon: Icons.close_rounded, onPressed: onClose),
        ],
      ),
    );
  }
}

class _GroupDrawIconButton extends StatelessWidget {
  const _GroupDrawIconButton({required this.icon, required this.onPressed});

  final IconData icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(12),
        child: SizedBox(
          width: 40,
          height: 40,
          child: Icon(icon, size: 18, color: context.themeColors.onSurface),
        ),
      ),
    );
  }
}

class OrganizerGroupCountStepper extends StatelessWidget {
  const OrganizerGroupCountStepper({
    super.key,
    required this.groupCount,
    required this.onDecrement,
    required this.onIncrement,
    this.minReached = false,
    this.maxReached = false,
  });

  final int groupCount;
  final VoidCallback onDecrement;
  final VoidCallback onIncrement;
  final bool minReached;
  final bool maxReached;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ),
      child: Row(
        children: [
          _StepperCircleButton(
            icon: Icons.remove_rounded,
            onTap: minReached ? null : onDecrement,
          ),
          Expanded(
            child: Column(
              children: [
                Text(
                  '$groupCount',
                  style: AppTypography.soraRegular(
                    fontSize: 32,
                    fontWeight: FontWeight.w900,
                    color: context.themeColors.onSurface,
                    height: 1,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'GRUPOS',
                  style: AppTypography.mono(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: context.themeColors.onSurfaceMuted,
                    letterSpacing: 0.8,
                  ),
                ),
              ],
            ),
          ),
          _StepperCircleButton(
            icon: Icons.add_rounded,
            onTap: maxReached ? null : onIncrement,
            accent: true,
          ),
        ],
      ),
    );
  }
}

class _StepperCircleButton extends StatelessWidget {
  const _StepperCircleButton({
    required this.icon,
    required this.onTap,
    this.accent = false,
  });

  final IconData icon;
  final VoidCallback? onTap;
  final bool accent;

  @override
  Widget build(BuildContext context) {
    final disabled = onTap == null;
    return Material(
      color: accent
          ? AppColors.brand.withValues(alpha: disabled ? 0.2 : 0.18)
          : context.themeColors.onSurfaceMuted.withValues(alpha: 0.08),
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: SizedBox(
          width: 44,
          height: 44,
          child: Icon(
            icon,
            size: 22,
            color: disabled
                ? context.themeColors.onSurfaceMuted.withValues(alpha: 0.35)
                : (accent ? AppColors.brand : context.themeColors.onSurface),
          ),
        ),
      ),
    );
  }
}

class OrganizerGroupDrawStatsRow extends StatelessWidget {
  const OrganizerGroupDrawStatsRow({
    super.key,
    required this.teamCount,
    required this.qualifiersPerGroup,
    required this.totalQualifiers,
  });

  final int teamCount;
  final int qualifiersPerGroup;
  final int totalQualifiers;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _StatCard(
            value: '$teamCount',
            label: 'duplas\nno sorteio',
            highlight: false,
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: _StatCard(
            value: '$qualifiersPerGroup',
            label: 'classificam\npor grupo',
            highlight: true,
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: _StatCard(
            value: '$totalQualifiers',
            label: 'no\nmata-mata',
            highlight: false,
          ),
        ),
      ],
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({
    required this.value,
    required this.label,
    required this.highlight,
  });

  final String value;
  final String label;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: highlight
              ? AppColors.brand.withValues(alpha: 0.55)
              : context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ),
      child: Column(
        children: [
          Text(
            value,
            style: AppTypography.soraRegular(
              fontSize: 22,
              fontWeight: FontWeight.w900,
              color: highlight
                  ? AppColors.brand
                  : context.themeColors.onSurface,
              height: 1,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            textAlign: TextAlign.center,
            style: AppTypography.soraRegular(
              fontSize: 10,
              fontWeight: FontWeight.w500,
              color: context.themeColors.onSurfaceMuted,
              height: 1.25,
            ),
          ),
        ],
      ),
    );
  }
}

class OrganizerGroupSeedsToggleCard extends StatelessWidget {
  const OrganizerGroupSeedsToggleCard({
    super.key,
    required this.value,
    required this.headCount,
    required this.onChanged,
  });

  final bool value;
  final int headCount;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: value
              ? AppColors.brand.withValues(alpha: 0.35)
              : context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: AppColors.brand.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(Icons.flag_outlined, size: 20, color: AppColors.brand),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Respeitar cabeças de chave',
                  style: AppTypography.soraRegular(
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'As $headCount cabeças caem em grupos diferentes; '
                  'o resto é sorteado.',
                  style: AppTypography.soraRegular(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: context.themeColors.onSurfaceMuted,
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
          Switch(
            value: value,
            onChanged: onChanged,
            activeThumbColor: AppColors.black,
            activeTrackColor: AppColors.brand,
          ),
        ],
      ),
    );
  }
}

class OrganizerGroupDrawKnockoutWarningBanner extends StatelessWidget {
  const OrganizerGroupDrawKnockoutWarningBanner({
    super.key,
    required this.totalQualifiers,
    required this.groupCount,
    required this.qualifiersPerGroup,
  });

  final int totalQualifiers;
  final int groupCount;
  final int qualifiersPerGroup;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.pending.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.pending.withValues(alpha: 0.35)),
      ),
      child: Text(
        '$totalQualifiers classificados ($groupCount grupos × '
        '$qualifiersPerGroup) não formam um mata-mata equilibrado. '
        'Ajuste o número de grupos ou de classificados '
        '(totais como 4, 8 ou 16).',
        style: AppTypography.soraRegular(
          fontSize: 12,
          fontWeight: FontWeight.w500,
          color: context.themeColors.onSurface,
          height: 1.4,
        ),
      ),
    );
  }
}

class OrganizerGroupDrawExcludedBanner extends StatelessWidget {
  const OrganizerGroupDrawExcludedBanner({
    super.key,
    required this.excludedCount,
  });

  final int excludedCount;

  @override
  Widget build(BuildContext context) {
    final label = excludedCount == 1
        ? '1 dupla pendente ou na fila não participa do sorteio.'
        : '$excludedCount duplas pendentes ou na fila não participam do sorteio.';
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.2),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            Icons.info_outline_rounded,
            size: 18,
            color: context.themeColors.onSurfaceMuted,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              label,
              style: AppTypography.soraRegular(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: context.themeColors.onSurface,
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class OrganizerGroupDrawSectionHeader extends StatelessWidget {
  const OrganizerGroupDrawSectionHeader({super.key, required this.onRedraw});

  final VoidCallback onRedraw;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            'RESULTADO DO SORTEIO',
            style: AppTypography.mono(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: context.themeColors.onSurfaceMuted,
              letterSpacing: 0.8,
            ),
          ),
        ),
        TextButton.icon(
          onPressed: onRedraw,
          style: TextButton.styleFrom(
            foregroundColor: AppColors.brand,
            padding: const EdgeInsets.symmetric(horizontal: 4),
            minimumSize: Size.zero,
            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
          icon: const Icon(Icons.refresh_rounded, size: 16),
          label: Text(
            'Sortear de novo',
            style: AppTypography.soraRegular(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: AppColors.brand,
            ),
          ),
        ),
      ],
    );
  }
}

class OrganizerGroupDrawCard extends StatelessWidget {
  const OrganizerGroupDrawCard({
    super.key,
    required this.group,
    required this.teamsById,
    required this.qualifiersPerGroup,
    required this.primaryHeadCount,
    required this.overallRankByTeamId,
  });

  final CategoryGroupPreview group;
  final Map<String, OrganizerCategoryTeamRow> teamsById;
  final int qualifiersPerGroup;
  final int primaryHeadCount;
  final Map<String, int> overallRankByTeamId;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                width: 36,
                height: 36,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: AppColors.brand,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  group.id,
                  style: AppTypography.soraRegular(
                    fontSize: 16,
                    fontWeight: FontWeight.w900,
                    color: AppColors.black,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Grupo ${group.id}',
                  style: AppTypography.soraRegular(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                  ),
                ),
              ),
              Container(
                width: 6,
                height: 6,
                decoration: const BoxDecoration(
                  color: AppColors.win,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 6),
              Text(
                '$qualifiersPerGroup CLASSIFICAM',
                style: AppTypography.mono(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  color: context.themeColors.onSurfaceMuted,
                  letterSpacing: 0.5,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          for (var i = 0; i < group.teamIds.length; i++) ...[
            if (i == qualifiersPerGroup) ...[
              const SizedBox(height: 4),
              const OrganizerGroupCutoffLine(),
              const SizedBox(height: 4),
            ],
            Builder(
              builder: (context) {
                final teamId = group.teamIds[i];
                final team = teamsById[teamId];
                if (team == null) {
                  return const SizedBox.shrink();
                }
                final isPrimaryHead = isGroupDrawPrimaryHead(
                  seedRank: team.seedRank,
                  primaryHeadCount: primaryHeadCount,
                );
                return OrganizerGroupDrawTeamRow(
                  position: i + 1,
                  team: team,
                  qualifies: i < qualifiersPerGroup,
                  badgeLabel: groupDrawTeamBadgeLabel(
                    team: team,
                    overallRankByTeamId: overallRankByTeamId,
                    primaryHeadCount: primaryHeadCount,
                  ),
                  isSeedBadge: isPrimaryHead,
                );
              },
            ),
          ],
        ],
      ),
    );
  }
}

class OrganizerGroupDrawTeamRow extends StatelessWidget {
  const OrganizerGroupDrawTeamRow({
    super.key,
    required this.position,
    required this.team,
    required this.qualifies,
    required this.badgeLabel,
    required this.isSeedBadge,
  });

  final int position;
  final OrganizerCategoryTeamRow team;
  final bool qualifies;
  final String badgeLabel;
  final bool isSeedBadge;

  @override
  Widget build(BuildContext context) {
    final positionBg = qualifies
        ? AppColors.win.withValues(alpha: 0.15)
        : context.themeColors.onSurfaceMuted.withValues(alpha: 0.08);
    final positionFg = qualifies
        ? AppColors.win
        : context.themeColors.onSurfaceMuted.withValues(alpha: 0.55);
    final positionBorder = qualifies
        ? AppColors.win.withValues(alpha: 0.45)
        : context.themeColors.onSurfaceMuted.withValues(alpha: 0.2);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          // Container(
          //   width: 20,
          //   height: 20,
          //   alignment: Alignment.center,
          //   decoration: BoxDecoration(
          //     color: positionBg,
          //     shape: BoxShape.circle,
          //     border: Border.all(color: positionBorder),
          //   ),
          //   child: Text(
          //     '$position',
          //     style: AppTypography.mono(
          //       fontSize: 8,
          //       fontWeight: FontWeight.w800,
          //       color: positionFg,
          //     ),
          //   ),
          // ),
          // const SizedBox(width: 10),
          OrganizerTeamDualAvatars(
            player1: team.player1,
            player2: team.player2,
            avatarSize: 28,
            overlapRingColor: context.themeColors.surfaceRaised,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              team.displayName,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.soraRegular(
                fontSize: 10,
                fontWeight: FontWeight.w500,
                color: context.themeColors.onSurface,
              ),
            ),
          ),
          const SizedBox(width: 8),
          _TeamBadge(label: badgeLabel, isSeed: isSeedBadge),
        ],
      ),
    );
  }
}

class _TeamBadge extends StatelessWidget {
  const _TeamBadge({required this.label, required this.isSeed});

  final String label;
  final bool isSeed;

  @override
  Widget build(BuildContext context) {
    if (!isSeed) {
      return Text(
        label,
        style: AppTypography.mono(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: context.themeColors.onSurfaceMuted,
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(8),
        color: AppColors.brand.withValues(alpha: 0.14),
        border: Border.all(color: AppColors.brand),
      ),
      child: Text(
        label,
        style: AppTypography.mono(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: AppColors.brand,
        ),
      ),
    );
  }
}

class OrganizerGroupCutoffLine extends StatelessWidget {
  const OrganizerGroupCutoffLine({super.key});

  @override
  Widget build(BuildContext context) {
    final lineColor = context.themeColors.onSurfaceMuted.withValues(
      alpha: 0.35,
    );
    return Row(
      children: [
        Expanded(child: _DashedLine(color: lineColor)),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10),
          child: Text(
            'LINHA DE CORTE',
            style: AppTypography.mono(
              fontSize: 9,
              fontWeight: FontWeight.w700,
              color: context.themeColors.onSurfaceMuted,
              letterSpacing: 0.6,
            ),
          ),
        ),
        Expanded(child: _DashedLine(color: lineColor)),
      ],
    );
  }
}

class _DashedLine extends StatelessWidget {
  const _DashedLine({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        const dashWidth = 4.0;
        const dashSpace = 4.0;
        final dashCount = (constraints.maxWidth / (dashWidth + dashSpace))
            .floor();
        return Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: List.generate(dashCount, (_) {
            return Container(width: dashWidth, height: 1, color: color);
          }),
        );
      },
    );
  }
}

class OrganizerGroupDrawInfoBanner extends StatelessWidget {
  const OrganizerGroupDrawInfoBanner({
    super.key,
    required this.qualifiersPerGroup,
  });

  final int qualifiersPerGroup;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.28)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 22,
            height: 22,
            alignment: Alignment.center,
            decoration: const BoxDecoration(
              color: AppColors.brand,
              shape: BoxShape.circle,
            ),
            child: Text(
              '?',
              style: AppTypography.soraRegular(
                fontSize: 13,
                fontWeight: FontWeight.w800,
                color: AppColors.black,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text.rich(
              TextSpan(
                style: AppTypography.soraRegular(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  color: context.themeColors.onSurfaceMuted,
                  height: 1.4,
                ),
                children: [
                  const TextSpan(text: 'As '),
                  TextSpan(
                    text: '$qualifiersPerGroup melhores',
                    style: const TextStyle(
                      color: AppColors.brand,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const TextSpan(
                    text:
                        ' de cada grupo avançam para o mata-mata. '
                        'Os confrontos são montados ao publicar a chave.',
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class OrganizerGroupDrawBottomActions extends StatelessWidget {
  const OrganizerGroupDrawBottomActions({
    super.key,
    required this.onRedraw,
    required this.onPublish,
    required this.publishing,
    required this.enabled,
  });

  final VoidCallback onRedraw;
  final VoidCallback onPublish;
  final bool publishing;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // OutlinedButton.icon(
            //   onPressed: enabled ? onRedraw : null,
            //   style: OutlinedButton.styleFrom(
            //     minimumSize: const Size.fromHeight(48),
            //     foregroundColor: context.themeColors.onSurface,
            //     side: BorderSide(
            //       color: context.themeColors.onSurfaceMuted.withValues(
            //         alpha: 0.35,
            //       ),
            //     ),
            //     shape: RoundedRectangleBorder(
            //       borderRadius: BorderRadius.circular(14),
            //     ),
            //   ),
            //   icon: const Icon(Icons.refresh_rounded, size: 18),
            //   label: const Text(
            //     'Sortear de novo',
            //     style: TextStyle(fontWeight: FontWeight.w700),
            //   ),
            // ),
            // const SizedBox(height: 10),
            FilledButton.icon(
              onPressed: enabled && !publishing ? onPublish : null,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brand,
                foregroundColor: AppColors.black,
                minimumSize: const Size.fromHeight(52),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              icon: publishing
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: AppColors.black,
                      ),
                    )
                  : const Icon(Icons.sports_rounded, size: 20),
              label: const Text(
                'Publicar chave',
                style: TextStyle(fontWeight: FontWeight.w800),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
