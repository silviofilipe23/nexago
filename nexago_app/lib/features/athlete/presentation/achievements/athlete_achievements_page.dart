import 'package:flutter/material.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/auth/auth_providers.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../domain/achievements/achievement_category.dart';
import '../../domain/achievements/achievement_providers.dart';
import '../../domain/gamification_providers.dart';
import 'widgets/achievement_category_section.dart';
import 'widgets/achievements_summary_row.dart';

/// Tela Conquistas (protótipo 03).
class AthleteAchievementsPage extends ConsumerStatefulWidget {
  const AthleteAchievementsPage({super.key});

  @override
  ConsumerState<AthleteAchievementsPage> createState() =>
      _AthleteAchievementsPageState();
}

class _AthleteAchievementsPageState
    extends ConsumerState<AthleteAchievementsPage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _syncAchievements());
  }

  Future<void> _syncAchievements() async {
    final uid = ref.read(authProvider).valueOrNull?.uid;
    if (uid == null || uid.isEmpty) return;
    await ref.read(gamificationServiceProvider).syncAchievements(userId: uid);
    if (mounted) {
      ref.invalidate(achievementsScreenStateProvider);
      ref.invalidate(gamificationBadgesProvider);
      ref.invalidate(gamificationSummaryProvider);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final user = ref.watch(authProvider).valueOrNull;
    final state = ref.watch(achievementsScreenStateProvider);

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      appBar: NexaAppBar(
        backgroundColor: context.themeColors.canvas,
        elevation: 0,
        leading: IconButton(
          onPressed: () => context.pop(),
          icon: Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: context.themeColors.surfaceRaised.withValues(alpha: 0.9),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: context.themeColors.onSurfaceMuted.withValues(
                  alpha: 0.15,
                ),
              ),
            ),
            child: Icon(
              Icons.chevron_left_rounded,
              color: context.themeColors.onSurface,
            ),
          ),
        ),
        centerTitle: true,
        title: Text(
          'Conquistas',
          style: theme.textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.w800,
            color: context.themeColors.onSurface,
          ),
        ),
      ),
      body: user == null
          ? Center(
              child: Text(
                'Faça login para ver suas conquistas.',
                style: theme.textTheme.bodyLarge?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
              children: [
                AchievementsSummaryRow(
                  unlocked: state.unlockedCount,
                  inProgress: state.inProgressCount,
                  total: state.totalCount,
                ),
                SizedBox(height: 24),
                for (final category in AchievementCategory.displayOrder) ...[
                  AchievementCategorySection(
                    category: category,
                    items: state.forCategory(category),
                  ),
                  SizedBox(height: 22),
                ],
              ],
            ),
    );
  }
}
