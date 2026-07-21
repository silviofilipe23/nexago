import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/layout/nexa_floating_header.dart';
import '../../../../../core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

class TournamentDetailSubpageScaffold extends StatelessWidget {
  const TournamentDetailSubpageScaffold({
    super.key,
    required this.title,
    required this.slivers,
    this.onBack,
    this.actions = const [],
  });

  final String title;
  final List<Widget> slivers;
  final VoidCallback? onBack;

  /// Botões/ícones extras no fim da barra de título (ex.: atalho pra
  /// "Palpites" na chave). Vazio por padrão — não afeta subpáginas existentes.
  final List<Widget> actions;

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
                onBack: onBack ?? () => _defaultBack(context),
                actions: actions,
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
    required this.title,
    required this.onBack,
    this.actions = const [],
  });

  final String title;
  final VoidCallback onBack;
  final List<Widget> actions;

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
        for (final action in actions) ...[
          const SizedBox(width: 8),
          action,
        ],
      ],
    );
  }
}
