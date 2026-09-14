import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/layout/nexa_page_header.dart';
import '../../../../../core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Volta uma subpágina do detalhe do torneio: desempilha quando dá, e cai na
/// vitrine quando a rota foi aberta direto (deep link, notificação).
///
/// Público porque nem toda subpágina usa [TournamentDetailSubpageScaffold] —
/// a de categorias desenha o próprio cabeçalho sobre a arte do hero.
void tournamentDetailSubpageBack(BuildContext context) {
  if (context.canPop()) {
    context.pop();
    return;
  }
  context.go(AppRoutes.tournamentDiscoveryList);
}

class TournamentDetailSubpageScaffold extends StatelessWidget {
  const TournamentDetailSubpageScaffold({
    super.key,
    required this.title,
    this.slivers,
    this.body,
    this.onBack,
    this.actions = const [],
  }) : assert(
          (slivers != null) ^ (body != null),
          'Informe slivers ou body, não os dois.',
        );

  final String title;

  /// Conteúdo em slivers (padrão das subpáginas do detalhe).
  final List<Widget>? slivers;

  /// Conteúdo já montado (ex.: Stack / layout custom acima da rolagem).
  final Widget? body;

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
        child: NexaPageHeader(
          topGap: 8,
          padding: const EdgeInsets.fromLTRB(16, 0, 20, 12),
          header: _SubpageToolbar(
            title: title,
            onBack: onBack ?? () => _defaultBack(context),
            actions: actions,
          ),
          child: body ?? CustomScrollView(slivers: slivers!),
        ),
      ),
    );
  }

  void _defaultBack(BuildContext context) =>
      tournamentDetailSubpageBack(context);
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
