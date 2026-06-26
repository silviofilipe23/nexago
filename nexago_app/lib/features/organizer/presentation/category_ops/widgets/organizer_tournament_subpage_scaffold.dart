import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/layout/nexa_floating_header.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

class OrganizerTournamentSubpageScaffold extends StatelessWidget {
  const OrganizerTournamentSubpageScaffold({
    super.key,
    required this.title,
    required this.slivers,
    this.onBack,
    this.trailing,
  });

  final String title;
  final List<Widget> slivers;
  final VoidCallback? onBack;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        top: false,
        bottom: false,
        child: CustomScrollView(
          slivers: [
            NexaFloatingHeaderSliver(
              topGap: 8,
              padding: const EdgeInsets.fromLTRB(16, 0, 20, 12),
              child: _SubpageToolbar(
                title: title,
                onBack: onBack ?? () => context.pop(),
                trailing: trailing,
              ),
            ),
            ...slivers,
          ],
        ),
      ),
    );
  }
}

class _SubpageToolbar extends StatelessWidget {
  const _SubpageToolbar({
    required this.title,
    required this.onBack,
    this.trailing,
  });

  final String title;
  final VoidCallback onBack;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Row(
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
        if (trailing != null) trailing!,
      ],
    );
  }
}
