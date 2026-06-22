import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

class TournamentDetailSubpageScaffold extends StatelessWidget {
  const TournamentDetailSubpageScaffold({
    super.key,
    required this.title,
    required this.slivers,
    this.onBack,
  });

  final String title;
  final List<Widget> slivers;
  final VoidCallback? onBack;

  @override
  Widget build(BuildContext context) {
    final topInset = MediaQuery.paddingOf(context).top;

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        top: false,
        bottom: false,
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: _SubpageToolbar(
                topInset: topInset,
                title: title,
                onBack: onBack ?? () => _defaultBack(context),
              ),
            ),
            ...slivers,
          ],
        ),
      ),
    );
  }

  void _defaultBack(BuildContext context) {
    if (context.canPop()) {
      context.pop();
      return;
    }
    context.go(AppRoutes.tournamentDiscoveryList);
  }
}

class _SubpageToolbar extends StatelessWidget {
  const _SubpageToolbar({
    required this.topInset,
    required this.title,
    required this.onBack,
  });

  final double topInset;
  final String title;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(16, topInset + 8, 20, 12),
      child: Row(
        children: [
          Material(
            color: context.themeColors.surfaceRaised,
            borderRadius: BorderRadius.circular(12),
            child: InkWell(
              onTap: onBack,
              borderRadius: BorderRadius.circular(12),
              child: const SizedBox(
                width: 44,
                height: 44,
                child: Icon(Icons.arrow_back_rounded, size: 22),
              ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Text(
              title,
              style: AppTypography.soraRegular(
                fontSize: 20,
                fontWeight: FontWeight.w900,
                color: context.themeColors.onSurface,
                letterSpacing: -0.3,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
