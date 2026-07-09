import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../core/router/routes.dart';
import '../../domain/gamification_providers.dart';
import '../../domain/sand_rank/sand_rank_catalog.dart';
import '../../domain/sand_rank/sand_rank_models.dart';
import '../../domain/sand_rank/sand_rank_providers.dart';
import '../../domain/sand_rank/sand_rank_reward_catalog.dart';
import 'widgets/sand_rank_emblem.dart';

/// Trilha de elos — todos os 16 degraus com recompensas bloqueadas e
/// desbloqueadas. É o motivador visual central do sistema de elos.
class SandRankTrackPage extends ConsumerStatefulWidget {
  const SandRankTrackPage({super.key});

  @override
  ConsumerState<SandRankTrackPage> createState() => _SandRankTrackPageState();
}

class _SandRankTrackPageState extends ConsumerState<SandRankTrackPage> {
  final _currentStepKey = GlobalKey();
  bool _scrolledToCurrent = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final progress = ref.watch(sandRankProgressProvider);
    final cosmetics = ref.watch(sandRankCosmeticsProvider).valueOrNull ??
        const SandRankCosmetics();
    final currentIndex = progress.current.trackIndex;
    final conqueredSteps =
        sandRankTrack.where((s) => s.trackIndex < currentIndex).toList();
    final upcomingSteps =
        sandRankTrack.where((s) => s.trackIndex >= currentIndex).toList();

    if (!_scrolledToCurrent) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        final ctx = _currentStepKey.currentContext;
        if (ctx != null && mounted) {
          Scrollable.ensureVisible(
            ctx,
            alignment: 0.15,
            duration: const Duration(milliseconds: 450),
            curve: Curves.easeOutCubic,
          );
        }
      });
      _scrolledToCurrent = true;
    }

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      appBar: NexaAppBar(
        backgroundColor: context.themeColors.canvas,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        automaticallyImplyLeading: false,
        centerTitle: false,
        leadingWidth: 52,
        leading: Padding(
          padding: const EdgeInsets.only(left: 12),
          child: Center(
            child: Material(
              color: context.themeColors.surfaceRaised,
              borderRadius: BorderRadius.circular(12),
              child: InkWell(
                onTap: () {
                  if (context.canPop()) {
                    context.pop();
                  } else {
                    context.go(AppRoutes.athleteQuest);
                  }
                },
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
        title: Text(
          'Trilha de Elos',
          style: theme.textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.w800,
            color: context.themeColors.onSurface,
            letterSpacing: -0.3,
          ),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          _TierProgressBar(current: progress.current),
          const SizedBox(height: 16),
          _CurrentRankCard(progress: progress),
          if (conqueredSteps.isNotEmpty) ...[
            const SizedBox(height: 24),
            _SectionLabel(text: 'SUA TRILHA ATÉ AQUI'),
            const SizedBox(height: 12),
            for (var i = 0; i < conqueredSteps.length; i++)
              _TrackTimelineRow(
                step: conqueredSteps[i],
                nextStep: i < conqueredSteps.length - 1
                    ? conqueredSteps[i + 1]
                    : null,
                progress: progress,
                cosmetics: cosmetics,
                isLast: i == conqueredSteps.length - 1,
              ),
          ],
          if (upcomingSteps.isNotEmpty) ...[
            const SizedBox(height: 24),
            _SectionLabel(text: 'PRÓXIMOS ELOS'),
            const SizedBox(height: 12),
            for (var i = 0; i < upcomingSteps.length; i++)
              _TrackTimelineRow(
                key: upcomingSteps[i].trackIndex == currentIndex
                    ? _currentStepKey
                    : null,
                step: upcomingSteps[i],
                nextStep: i < upcomingSteps.length - 1
                    ? upcomingSteps[i + 1]
                    : null,
                progress: progress,
                cosmetics: cosmetics,
                isLast: i == upcomingSteps.length - 1,
              ),
          ],
        ],
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: AppTypography.mono(
        fontSize: 10,
        fontWeight: FontWeight.w700,
        color: context.themeColors.onSurfaceMuted,
        letterSpacing: 1.1,
      ),
    );
  }
}

class _TierProgressBar extends StatelessWidget {
  const _TierProgressBar({required this.current});

  final SandRankStep current;

  @override
  Widget build(BuildContext context) {
    final tiers = _sandRankTierCodes;

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (var i = 0; i < tiers.length; i++) ...[
            if (i > 0) const SizedBox(width: 14),
            _TierGroup(
              rankCode: tiers[i],
              current: current,
              segmentCount: tiers[i] == 'LENDA' ? 1 : 3,
            ),
          ],
        ],
      ),
    );
  }
}

class _TierGroup extends StatelessWidget {
  const _TierGroup({
    required this.rankCode,
    required this.current,
    required this.segmentCount,
  });

  final String rankCode;
  final SandRankStep current;
  final int segmentCount;

  @override
  Widget build(BuildContext context) {
    final tierColor = sandRankColor(rankCode);
    final filled = _filledSegments(rankCode, current.trackIndex);
    final isCurrentTier = current.rankCode == rankCode;
    final isFutureTier = _tierStartIndex(rankCode) > current.trackIndex;
    final labelColor = isCurrentTier
        ? tierColor
        : isFutureTier
            ? context.themeColors.onSurfaceMuted.withValues(alpha: 0.45)
            : context.themeColors.onSurfaceMuted;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            for (var i = 0; i < segmentCount; i++) ...[
              if (i > 0) const SizedBox(width: 4),
              Container(
                width: segmentCount == 1 ? 28 : 22,
                height: 5,
                decoration: BoxDecoration(
                  color: i < filled
                      ? tierColor
                      : context.themeColors.surfaceRaised,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ],
          ],
        ),
        const SizedBox(height: 6),
        Text(
          rankCode,
          style: AppTypography.mono(
            fontSize: 9,
            fontWeight: FontWeight.w700,
            color: labelColor,
            letterSpacing: 0.6,
          ),
        ),
      ],
    );
  }
}

class _CurrentRankCard extends StatelessWidget {
  const _CurrentRankCard({required this.progress});

  final SandRankProgress progress;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final tierColor = sandRankColor(progress.current.rankCode);
    final percent = (progress.progress * 100).round();

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: tierColor.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: tierColor.withValues(alpha: 0.4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SandRankStepEmblem(
                step: progress.current,
                size: SandRankEmblemSize.hero,
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${progress.current.rankName.toUpperCase()} • ELO ATUAL',
                      style: AppTypography.mono(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: tierColor,
                        letterSpacing: 0.8,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      sandRankLabel(progress.current),
                      style: AppTypography.soraRegular(
                        fontSize: 22,
                        fontWeight: FontWeight.w900,
                        color: colors.onSurface,
                        letterSpacing: -0.4,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (progress.next != null) ...[
            const SizedBox(height: 14),
            ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: LinearProgressIndicator(
                minHeight: 6,
                value: progress.progress,
                backgroundColor: colors.surfaceRaised,
                color: tierColor,
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: RichText(
                    text: TextSpan(
                      style: AppTypography.soraRegular(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: colors.onSurfaceMuted,
                      ),
                      children: [
                        const TextSpan(text: 'Faltam '),
                        TextSpan(
                          text: '${progress.xpToNext} XP',
                          style: TextStyle(
                            fontWeight: FontWeight.w800,
                            color: colors.onSurface,
                          ),
                        ),
                        TextSpan(
                          text: ' pra ${sandRankLabel(progress.next!)}',
                        ),
                      ],
                    ),
                  ),
                ),
                Text(
                  '$percent%',
                  style: AppTypography.mono(
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                    color: tierColor,
                  ),
                ),
              ],
            ),
          ],
          const SizedBox(height: 10),
          Text(
            progress.next != null
                ? 'Cada jogo, missão e conquista te leva mais longe.'
                : 'O topo da trilha. Seu nome já faz parte da história da areia. 👑',
            style: AppTypography.soraRegular(
              fontSize: 12,
              fontWeight: FontWeight.w500,
              color: colors.onSurfaceMuted,
              height: 1.35,
            ),
          ),
        ],
      ),
    );
  }
}

class _TrackTimelineRow extends ConsumerWidget {
  const _TrackTimelineRow({
    super.key,
    required this.step,
    required this.nextStep,
    required this.progress,
    required this.cosmetics,
    required this.isLast,
  });

  final SandRankStep step;
  final SandRankStep? nextStep;
  final SandRankProgress progress;
  final SandRankCosmetics cosmetics;
  final bool isLast;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currentIndex = progress.current.trackIndex;
    final isCurrent = step.trackIndex == currentIndex;
    final isUnlocked = step.trackIndex <= currentIndex;
    final tierColor = sandRankColor(step.rankCode);
    final connectorColor = isUnlocked
        ? tierColor.withValues(alpha: 0.65)
        : context.themeColors.surfaceRaised;

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 44,
            child: Column(
              children: [
                SandRankStepEmblem(
                  step: step,
                  size: SandRankEmblemSize.small,
                  locked: !isUnlocked,
                ),
                if (!isLast)
                  Expanded(
                    child: Container(
                      width: 3,
                      margin: const EdgeInsets.symmetric(vertical: 4),
                      decoration: BoxDecoration(
                        color: connectorColor,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: isLast ? 0 : 14),
              child: _TrackStepCard(
                step: step,
                progress: progress,
                cosmetics: cosmetics,
                isCurrent: isCurrent,
                isUnlocked: isUnlocked,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TrackStepCard extends ConsumerWidget {
  const _TrackStepCard({
    required this.step,
    required this.progress,
    required this.cosmetics,
    required this.isCurrent,
    required this.isUnlocked,
  });

  final SandRankStep step;
  final SandRankProgress progress;
  final SandRankCosmetics cosmetics;
  final bool isCurrent;
  final bool isUnlocked;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final tierColor = sandRankColor(step.rankCode);
    final rewards = SandRankRewardCatalog.forTrackIndex(step.trackIndex);

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isCurrent
            ? tierColor.withValues(alpha: 0.08)
            : colors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: isCurrent
              ? tierColor.withValues(alpha: 0.45)
              : colors.outline.withValues(alpha: 0.12),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Row(
                  children: [
                    Flexible(
                      child: Text(
                        sandRankLabel(step),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.soraRegular(
                          fontSize: 14,
                          fontWeight: FontWeight.w800,
                          color: isUnlocked
                              ? colors.onSurface
                              : colors.onSurfaceMuted,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    _DivisionDots(
                      division: step.division,
                      color: tierColor,
                      locked: !isUnlocked,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              _StepStatusBadge(
                isCurrent: isCurrent,
                isUnlocked: isUnlocked,
                color: tierColor,
                minXp: step.minXp,
              ),
            ],
          ),
          if (isCurrent && progress.next != null) ...[
            const SizedBox(height: 10),
            ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: LinearProgressIndicator(
                minHeight: 4,
                value: progress.progress,
                backgroundColor: colors.surfaceRaised,
                color: tierColor,
              ),
            ),
          ],
          if (rewards.isNotEmpty) ...[
            const SizedBox(height: 10),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final reward in rewards)
                  _RewardChip(
                    reward: reward,
                    unlocked: isUnlocked,
                    equipped: cosmetics.frameId == reward.id ||
                        cosmetics.titleId == reward.id,
                    tierColor: tierColor,
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _DivisionDots extends StatelessWidget {
  const _DivisionDots({
    required this.division,
    required this.color,
    required this.locked,
  });

  final int division;
  final Color color;
  final bool locked;

  @override
  Widget build(BuildContext context) {
    if (division <= 0) return const SizedBox.shrink();
    final lit = (4 - division).clamp(1, 3);

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(3, (index) {
        final active = index < lit && !locked;
        return Container(
          width: 5,
          height: 5,
          margin: const EdgeInsets.only(left: 3),
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: active
                ? color
                : context.themeColors.onSurfaceMuted.withValues(alpha: 0.25),
          ),
        );
      }),
    );
  }
}

class _StepStatusBadge extends StatelessWidget {
  const _StepStatusBadge({
    required this.isCurrent,
    required this.isUnlocked,
    required this.color,
    required this.minXp,
  });

  final bool isCurrent;
  final bool isUnlocked;
  final Color color;
  final int minXp;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    if (isCurrent) {
      return Text(
        'Você está aqui',
        style: AppTypography.mono(
          fontSize: 10,
          fontWeight: FontWeight.w700,
          color: color,
        ),
      );
    }

    if (isUnlocked) {
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.check_rounded, size: 14, color: color),
          const SizedBox(width: 2),
          Text(
            'Conquistado',
            style: AppTypography.mono(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
        ],
      );
    }

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.lock_rounded, size: 13, color: colors.onSurfaceMuted),
        const SizedBox(width: 4),
        Text(
          '${minXp} XP',
          style: AppTypography.mono(
            fontSize: 10,
            fontWeight: FontWeight.w700,
            color: colors.onSurfaceMuted,
          ),
        ),
      ],
    );
  }
}

class _RewardChip extends ConsumerWidget {
  const _RewardChip({
    required this.reward,
    required this.unlocked,
    required this.equipped,
    required this.tierColor,
  });

  final SandRankRewardDefinition reward;
  final bool unlocked;
  final bool equipped;
  final Color tierColor;

  IconData get _icon => switch (reward.type) {
        SandRankRewardType.avatarFrame => Icons.account_circle_outlined,
        SandRankRewardType.title => Icons.timer_outlined,
        SandRankRewardType.emblem => Icons.shield_outlined,
        SandRankRewardType.perk => Icons.shield_rounded,
        SandRankRewardType.partnerVoucher => Icons.card_giftcard_rounded,
      };

  bool get _equippable =>
      unlocked &&
      (reward.type == SandRankRewardType.avatarFrame ||
          reward.type == SandRankRewardType.title);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final isVoucher = reward.type == SandRankRewardType.partnerVoucher;
    final fg = unlocked ? colors.onSurfaceMuted : colors.onSurfaceMuted.withValues(alpha: 0.5);

    return Tooltip(
      message: reward.description,
      triggerMode: TooltipTriggerMode.longPress,
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: _equippable && !equipped
            ? () => _equip(context, ref)
            : null,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            color: colors.surfaceRaised.withValues(alpha: 0.65),
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
              color: equipped
                  ? tierColor.withValues(alpha: 0.5)
                  : colors.outline.withValues(alpha: 0.2),
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(_icon, size: 13, color: fg),
              const SizedBox(width: 5),
              Text(
                isVoucher && !unlocked
                    ? '${reward.title} · em breve'
                    : equipped
                        ? '${reward.title} · equipado'
                        : reward.title,
                style: AppTypography.mono(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  color: fg,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _equip(BuildContext context, WidgetRef ref) async {
    final service = ref.read(gamificationServiceProvider);
    final messenger = ScaffoldMessenger.of(context);
    try {
      if (reward.type == SandRankRewardType.avatarFrame) {
        await service.equipSandRankFrame(reward.id);
      } else {
        await service.equipSandRankTitle(reward.id);
      }
      messenger.showSnackBar(
        SnackBar(content: Text('${reward.title} equipado!')),
      );
    } catch (_) {
      messenger.showSnackBar(
        const SnackBar(
          content: Text('Não foi possível equipar agora. Tente de novo.'),
        ),
      );
    }
  }
}

List<String> get _sandRankTierCodes {
  final tiers = <String>[];
  for (final step in sandRankTrack) {
    if (!tiers.contains(step.rankCode)) tiers.add(step.rankCode);
  }
  return tiers;
}

int _tierStartIndex(String rankCode) {
  return sandRankTrack
      .firstWhere((step) => step.rankCode == rankCode)
      .trackIndex;
}

int _filledSegments(String rankCode, int currentTrackIndex) {
  final steps = sandRankTrack.where((s) => s.rankCode == rankCode);
  return steps.where((s) => s.trackIndex <= currentTrackIndex).length;
}
