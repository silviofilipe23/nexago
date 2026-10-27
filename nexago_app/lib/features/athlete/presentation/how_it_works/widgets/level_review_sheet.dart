import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_theme_colors.dart';
import '../../../../../core/ui/app_snackbar.dart';
import '../../../domain/how_it_works/how_it_works_rules.dart';

/// "Acho que meu nível está errado": subir é o próprio atleta, em Esportes e
/// níveis; baixar um nível já travado só a equipe faz — o pedido vai pronto
/// pro WhatsApp da nexaGO.
Future<void> showLevelReviewSheet(
  BuildContext context, {
  required String sportLabel,
  required String levelLabel,
  required String athleteName,
  required bool openedFromLevels,
}) {
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: context.themeColors.surfaceSheet,
    isScrollControlled: true,
    useSafeArea: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (sheetContext) => _LevelReviewSheet(
      onRaise: () {
        Navigator.of(sheetContext).pop();
        if (openedFromLevels) {
          context.pop();
        } else {
          context.pushNamed(AppRouteNames.athleteSportsLevels);
        }
      },
      onRequestReview: () async {
        final url = buildLevelReviewContactUrl(
          sportLabel: sportLabel.toLowerCase(),
          levelLabel: levelLabel,
          athleteName: athleteName,
        );
        final opened = await launchUrl(
          Uri.parse(url),
          mode: LaunchMode.externalApplication,
        );
        if (!opened && sheetContext.mounted) {
          showAppSnackBar(
            sheetContext,
            'Não foi possível abrir o contato.',
            isError: true,
          );
        }
      },
    ),
  );
}

class _LevelReviewSheet extends StatelessWidget {
  const _LevelReviewSheet({
    required this.onRaise,
    required this.onRequestReview,
  });

  final VoidCallback onRaise;
  final VoidCallback onRequestReview;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;

    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(
        20,
        12,
        20,
        20 + MediaQuery.paddingOf(context).bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: colors.onSurfaceMuted.withValues(alpha: 0.3),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 18),
          Text(
            'Seu nível não bate com seu jogo?',
            style: theme.textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.w800,
              color: colors.onSurface,
            ),
          ),
          const SizedBox(height: 16),
          _Option(
            icon: Icons.trending_up_rounded,
            title: 'Jogo acima desse nível',
            body: 'Você mesmo sobe, em Esportes e níveis.',
            action: 'Subir meu nível',
            filled: true,
            onPressed: onRaise,
          ),
          const SizedBox(height: 12),
          _Option(
            icon: Icons.trending_down_rounded,
            title: 'Jogo abaixo desse nível',
            body: 'Até a sua primeira inscrição no esporte, dá pra ajustar em '
                'Esportes e níveis. Depois, só a equipe nexaGO consegue baixar.',
            action: 'Pedir revisão à equipe',
            onPressed: onRequestReview,
          ),
        ],
      ),
    );
  }
}

class _Option extends StatelessWidget {
  const _Option({
    required this.icon,
    required this.title,
    required this.body,
    required this.action,
    required this.onPressed,
    this.filled = false,
  });

  final IconData icon;
  final String title;
  final String body;
  final String action;
  final VoidCallback onPressed;
  final bool filled;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final label = Text(
      action,
      style: theme.textTheme.labelLarge?.copyWith(
        fontWeight: FontWeight.w800,
        color: filled ? AppColors.black : colors.onSurface,
      ),
    );

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: colors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(icon, size: 18, color: colors.brandText),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  title,
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: colors.onSurface,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            body,
            style: theme.textTheme.bodySmall?.copyWith(
              color: colors.onSurfaceMuted,
              height: 1.4,
            ),
          ),
          const SizedBox(height: 12),
          if (filled)
            FilledButton(
              onPressed: onPressed,
              style: FilledButton.styleFrom(
                minimumSize: const Size.fromHeight(44),
                backgroundColor: AppColors.brand,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: label,
            )
          else
            OutlinedButton(
              onPressed: onPressed,
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(44),
                side: BorderSide(
                  color: colors.onSurfaceMuted.withValues(alpha: 0.3),
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: label,
            ),
        ],
      ),
    );
  }
}
