import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import 'arena_dashboard_tokens.dart';

/// Resumo do recebimento NexaGO (Asaas): repasses via chave PIX no perfil.
class ArenaPlatformPixCard extends StatelessWidget {
  const ArenaPlatformPixCard({
    super.key,
    required this.payoutPixKey,
  });

  final String payoutPixKey;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final hasKey = payoutPixKey.trim().length >= 5;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.surfaceRaised,
        borderRadius: BorderRadius.circular(ArenaDashboardTokens.cardRadius),
        border: Border.all(
          color: hasKey
              ? AppColors.win.withValues(alpha: 0.35)
              : AppColors.pending.withValues(alpha: 0.45),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Icon(
                  hasKey ? Icons.pix_rounded : Icons.warning_amber_rounded,
                  color: hasKey ? AppColors.win : AppColors.pending,
                  size: 22,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'PIX via NexaGO (Asaas)',
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: AppColors.onSurface,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              hasKey
                  ? 'Atletas pagam PIX para a NexaGO. Repasses automáticos saem para:'
                  : 'Cadastre a chave PIX da arena no perfil para receber repasses.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: AppColors.onSurfaceMuted,
                height: 1.45,
              ),
            ),
            if (hasKey) ...[
              const SizedBox(height: 10),
              SelectableText(
                payoutPixKey.trim(),
                style: theme.textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                  color: AppColors.onSurface,
                ),
              ),
            ],
            const SizedBox(height: 12),
            TextButton(
              onPressed: () => context.pushNamed(AppRouteNames.arenaProfileEdit),
              child: Text(hasKey ? 'Editar chave no perfil' : 'Cadastrar chave PIX'),
            ),
          ],
        ),
      ),
    );
  }
}
