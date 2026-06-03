import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../domain/athlete_profile_providers.dart';
import '../domain/gamification_models.dart';
import '../domain/achievements/achievement_providers.dart';
import '../domain/gamification_providers.dart';
import '../domain/profile_completion_models.dart';
import '../domain/profile_completion_providers.dart';
import 'widgets/gamification_feedback_sheet.dart';
import 'widgets/profile_completion/profile_completion_widgets.dart';

/// Tela "Complete seu perfil" (design 02).
class AthleteCompleteProfilePage extends ConsumerStatefulWidget {
  const AthleteCompleteProfilePage({super.key});

  @override
  ConsumerState<AthleteCompleteProfilePage> createState() =>
      _AthleteCompleteProfilePageState();
}

class _AthleteCompleteProfilePageState
    extends ConsumerState<AthleteCompleteProfilePage> {
  bool _syncing = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _syncRewards());
  }

  Future<void> _syncRewards() async {
    if (_syncing) return;
    final user = ref.read(authProvider).valueOrNull;
    final profile = ref.read(athleteProfileProvider).valueOrNull;
    if (user == null || profile == null) return;

    setState(() => _syncing = true);
    try {
      final result = await ref
          .read(gamificationServiceProvider)
          .syncProfileCompletionRewards(
            userId: user.uid,
            profile: profile,
          );
      if (!mounted) return;
      if (result.totalXpGained > 0) {
        await showGamificationFeedbackSheet(
          context,
          feedback: GamificationFeedback(
            xpGained: result.totalXpGained,
            streakIncreased: false,
            newStreak: 0,
            unlockedBadges: result.unlockedProfileBadge
                ? [GamificationBadge.profileComplete]
                : const [],
          ),
        );
      }
      ref.invalidate(gamificationSummaryProvider);
      ref.invalidate(gamificationBadgesProvider);
      ref.invalidate(achievementsScreenStateProvider);
      ref.invalidate(profileCompletionStateProvider);
    } finally {
      if (mounted) setState(() => _syncing = false);
    }
  }

  void _openStep(ProfileCompletionStep step) {
    switch (step) {
      case ProfileCompletionStep.photo:
        context.pushNamed(
          AppRouteNames.athleteProfileEdit,
          queryParameters: {'focus': 'photo'},
        );
      case ProfileCompletionStep.sportLevel:
        context.pushNamed(AppRouteNames.athleteSportsLevels);
      case ProfileCompletionStep.city:
        context.pushNamed(
          AppRouteNames.athleteProfileEdit,
          queryParameters: {'focus': 'city'},
        );
      case ProfileCompletionStep.whatsapp:
        context.pushNamed(
          AppRouteNames.athleteProfileEdit,
          queryParameters: {'focus': 'phone'},
        );
      case ProfileCompletionStep.goals:
        context.pushNamed(AppRouteNames.athleteProfileGoals);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final completion = ref.watch(profileCompletionStateProvider);

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      appBar: AppBar(
        backgroundColor: context.themeColors.canvas,
        elevation: 0,
        centerTitle: true,
        leading: IconButton(
          onPressed: () => context.pop(),
          icon: Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: context.themeColors.surfaceRaised.withValues(alpha: 0.72),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: context.themeColors.onSurface.withValues(alpha: 0.1),
              ),
            ),
            child: Icon(
              Icons.arrow_back_ios_new_rounded,
              size: 18,
              color: context.themeColors.onSurface,
            ),
          ),
        ),
        title: Text(
          'Complete seu perfil',
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w800,
            color: context.themeColors.onSurface,
          ),
        ),
      ),
      body: completion == null
          ? Center(
              child: CircularProgressIndicator(color: AppColors.brand),
            )
          : RefreshIndicator(
              color: AppColors.brand,
              onRefresh: _syncRewards,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(
                  parent: BouncingScrollPhysics(),
                ),
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                children: [
                  ProfileCompletionHeroCard(
                    percent: completion.percent,
                    remainingSteps: completion.remainingSteps,
                    remainingXp: completion.remainingXp,
                  ),
                  SizedBox(height: 16),
                  ...completion.steps.map(
                    (status) => Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: ProfileCompletionStepTile(
                        status: status,
                        onTap: status.isDone
                            ? null
                            : () => _openStep(status.step),
                      ),
                    ),
                  ),
                  SizedBox(height: 6),
                  const ProfileCompletionRewardCard(),
                  if (_syncing) ...[
                    SizedBox(height: 16),
                    Center(
                      child: SizedBox(
                        width: 24,
                        height: 24,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: AppColors.brand,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
    );
  }
}
