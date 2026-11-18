import 'package:flutter/material.dart';

import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Topo da aba Reservas: só o título e, à direita, as ações da tela.
///
/// O eyebrow "GESTOR · ARENA" e a linha de resumo saíram: o resumo do dia
/// virou a faixa de ocupação/em quadra/a receber dentro da lista.
class ArenaBookingsHeader extends StatelessWidget {
  const ArenaBookingsHeader({super.key, this.actions = const []});

  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        Expanded(
          child: Text(
            'Reservas',
            style: theme.textTheme.headlineMedium?.copyWith(
              fontWeight: FontWeight.w800,
              letterSpacing: -0.5,
              color: context.themeColors.onSurface,
              fontSize: 26,
              height: 1.05,
            ),
          ),
        ),
        for (final a in actions) ...[const SizedBox(width: 8), a],
      ],
    );
  }
}
