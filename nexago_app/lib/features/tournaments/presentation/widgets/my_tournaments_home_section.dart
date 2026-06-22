import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../data/my_tournament_registrations_repository.dart';
import '../../../athlete/presentation/widgets/athlete_home/athlete_home_section_header.dart';
import '../../domain/my_tournaments_logic.dart';
import '../../domain/tournament_discovery_models.dart';
import '../../domain/tournament_registration_navigation.dart';

class MyTournamentsHomeSection extends ConsumerWidget {
  const MyTournamentsHomeSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final regsAsync = ref.watch(myTournamentRegistrationsProvider);

    return regsAsync.when(
      data: (regs) {
        final preview = sortRegistrationsForHomePreview(regs).take(3).toList();
        if (preview.isEmpty) return const SizedBox.shrink();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AthleteHomeSectionHeader(
              title: 'Meus torneios',
              trailingLabel: 'VER TODOS',
              onTrailingTap: () {
                context.pushNamed(AppRouteNames.myTournaments);
              },
            ),
            SizedBox(height: 10),
            for (final r in preview) ...[
              _RegistrationRow(
                registration: r,
                onTap: () => navigateFromMyTournamentRegistration(context, r),
              ),
              SizedBox(height: 8),
            ],
          ],
        );
      },
      loading: () => const _MyTournamentsHomeSectionSkeleton(),
      error: (_, __) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(
          'Não foi possível carregar seus torneios.',
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: context.themeColors.onSurfaceMuted,
              ),
        ),
      ),
    );
  }
}

class _MyTournamentsHomeSectionSkeleton extends StatefulWidget {
  const _MyTournamentsHomeSectionSkeleton();

  @override
  State<_MyTournamentsHomeSectionSkeleton> createState() =>
      _MyTournamentsHomeSectionSkeletonState();
}

class _MyTournamentsHomeSectionSkeletonState
    extends State<_MyTournamentsHomeSectionSkeleton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1100),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _pulse,
      builder: (context, _) {
        final t = Curves.easeInOut.transform(_pulse.value);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const AthleteHomeSectionHeader(title: 'Meus torneios'),
            SizedBox(height: 10),
            for (var i = 0; i < 3; i++) ...[
              _RegistrationRowSkeleton(pulse: t),
              if (i < 2) SizedBox(height: 8),
            ],
          ],
        );
      },
    );
  }
}

class _RegistrationRowSkeleton extends StatelessWidget {
  const _RegistrationRowSkeleton({required this.pulse});

  final double pulse;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: context.themeColors.surfaceRaised),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        child: Row(
          children: [
            _ShimmerBox(width: 44, height: 44, borderRadius: 10, pulse: pulse),
            SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  LayoutBuilder(
                    builder: (context, constraints) {
                      return _ShimmerBox(
                        width: constraints.maxWidth * 0.72,
                        height: 14,
                        pulse: pulse,
                      );
                    },
                  ),
                  SizedBox(height: 8),
                  _ShimmerBox(width: 120, height: 11, pulse: pulse),
                ],
              ),
            ),
            SizedBox(width: 8),
            _ShimmerBox(width: 52, height: 22, borderRadius: 8, pulse: pulse),
          ],
        ),
      ),
    );
  }
}

class _ShimmerBox extends StatelessWidget {
  const _ShimmerBox({
    required this.width,
    required this.height,
    required this.pulse,
    this.borderRadius = 999,
  });

  final double width;
  final double height;
  final double pulse;
  final double borderRadius;

  @override
  Widget build(BuildContext context) {
    final base = context.themeColors.onSurfaceMuted.withValues(alpha: 0.12);
    final highlight = context.themeColors.onSurfaceMuted.withValues(alpha: 0.22);
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: Color.lerp(base, highlight, pulse),
        borderRadius: BorderRadius.circular(borderRadius),
      ),
    );
  }
}

class _RegistrationRow extends StatelessWidget {
  const _RegistrationRow({
    required this.registration,
    required this.onTap,
  });

  final MyTournamentRegistration registration;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final showAsLive = registrationShowsAsLiveToday(registration);
    final badgeLabel = registrationHomeBadgeLabel(registration);
    final badgeColor = showAsLive
        ? AppColors.live
        : registration.isPaid
            ? AppColors.brand
            : AppColors.pending;

    return Material(
      color: context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(12),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: showAsLive
                  ? AppColors.live.withValues(alpha: 0.55)
                  : context.themeColors.surfaceRaised,
              width: showAsLive ? 1.5 : 1,
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: context.themeColors.surfaceRaised,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(
                    Icons.emoji_events_outlined,
                    color: context.themeColors.onSurfaceMuted,
                    size: 22,
                  ),
                ),
                SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        registration.tournamentName,
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: context.themeColors.onSurface,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      if (registration.dateLabel.isNotEmpty)
                        Text(
                          registration.dateLabel,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: context.themeColors.onSurfaceMuted,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                    ],
                  ),
                ),
                SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: badgeColor.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: badgeColor.withValues(alpha: 0.35),
                    ),
                  ),
                  child: Text(
                    badgeLabel.toUpperCase(),
                    style: theme.textTheme.labelSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: badgeColor,
                      fontSize: 9,
                      letterSpacing: 0.2,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
