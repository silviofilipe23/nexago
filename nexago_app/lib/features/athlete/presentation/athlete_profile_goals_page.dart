import 'package:nexago_app/core/ui/app_status_views.dart';
import 'package:flutter/material.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../domain/athlete_firestore_codes.dart';
import '../domain/athlete_profile_providers.dart';
import '../domain/gamification_providers.dart';
import '../domain/profile_completion_providers.dart';
import '../onboarding/domain/athlete_onboarding_options.dart';
import '../onboarding/presentation/widgets/onboarding_goal_tile.dart';
import 'widgets/gamification_feedback_sheet.dart';
import '../domain/gamification_models.dart';

/// Edição de objetivos (passo de completar perfil).
class AthleteProfileGoalsPage extends ConsumerStatefulWidget {
  const AthleteProfileGoalsPage({super.key});

  @override
  ConsumerState<AthleteProfileGoalsPage> createState() =>
      _AthleteProfileGoalsPageState();
}

class _AthleteProfileGoalsPageState extends ConsumerState<AthleteProfileGoalsPage> {
  final Set<String> _selected = {};
  bool _initialized = false;
  bool _saving = false;

  void _initFromProfile() {
    final profile = ref.read(athleteProfileProvider).valueOrNull;
    if (profile == null || _initialized) return;
    _selected.clear();
    for (final code in profile.goals) {
      _selected.add(AthleteFirestoreCodes.goalFirestoreToApp(code));
    }
    _initialized = true;
  }

  Future<void> _save() async {
    if (_saving) return;
    final user = ref.read(authProvider).valueOrNull;
    final profile = ref.read(athleteProfileProvider).valueOrNull;
    if (user == null || profile == null) return;

    setState(() => _saving = true);
    try {
      final goalsFs =
          AthleteFirestoreCodes.goalsAppToFirestore(_selected);
      final updated = profile.copyWith(goals: goalsFs);
      await ref.read(athleteProfileRepositoryProvider).saveProfile(updated);

      final sync = await ref
          .read(gamificationServiceProvider)
          .syncProfileCompletionRewards(
            userId: user.uid,
            profile: updated,
          );

      ref.invalidate(athleteProfileProvider);
      ref.invalidate(profileCompletionStateProvider);
      ref.invalidate(gamificationSummaryProvider);

      if (!context.mounted) return;
      if (sync.totalXpGained > 0) {
        await showGamificationFeedbackSheet(
          context,
          feedback: GamificationFeedback(
            xpGained: sync.totalXpGained,
            streakIncreased: false,
            newStreak: 0,
            unlockedBadges: sync.unlockedProfileBadge
                ? [GamificationBadge.profileComplete]
                : const [],
          ),
        );
      }
      if (!context.mounted) return;
      context.pop();
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Não foi possível salvar. Tente novamente.'),
          backgroundColor: AppColors.live,
        ),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final profileAsync = ref.watch(athleteProfileProvider);
    _initFromProfile();

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      appBar: _appBar(context, theme),
      body: profileAsync.when(
        loading: () => Center(
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
        error: (e, _) => AppInlineErrorView(error: e),
        data: (_) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                  children: [
                    ...AthleteOnboardingOptions.goals.map((option) {
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: OnboardingGoalTile(
                          option: option,
                          selected: _selected.contains(option.id),
                          onTap: () {
                            setState(() {
                              if (_selected.contains(option.id)) {
                                _selected.remove(option.id);
                              } else {
                                _selected.add(option.id);
                              }
                            });
                          },
                        ),
                      );
                    }),
                  ],
                ),
              ),
              SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: FilledButton(
                    onPressed: _saving || _selected.isEmpty ? null : _save,
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.brand,
                      foregroundColor: AppColors.black,
                      minimumSize: const Size.fromHeight(52),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                    child: _saving
                        ? SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: AppColors.black,
                            ),
                          )
                        : Text(
                            'Salvar objetivos',
                            style: TextStyle(fontWeight: FontWeight.w800),
                          ),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  PreferredSizeWidget _appBar(BuildContext context, ThemeData theme) {
    return NexaAppBar(
      backgroundColor: context.themeColors.canvas,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      centerTitle: true,
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
      title: Text(
        'Objetivos',
        style: theme.textTheme.titleLarge?.copyWith(
          fontWeight: FontWeight.w800,
          color: context.themeColors.onSurface,
          letterSpacing: -0.3,
        ),
      ),
      bottom: PreferredSize(
        preferredSize: const Size.fromHeight(52),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
          child: Align(
            alignment: Alignment.centerLeft,
            child: Text(
              'Conta o que você busca na quadra. Ganhe +40 XP ao salvar.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: context.themeColors.onSurfaceMuted,
                height: 1.35,
                fontSize: 13,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
