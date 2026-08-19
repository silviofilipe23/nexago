import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Convite RECEBIDO para a categoria escolhida, dentro da tela de inscrição.
///
/// Mesma posição do portal web: quem foi convidado não precisa achar a Agenda
/// nem esperar a notificação para responder. O cartão não decide nada — abre a
/// tela do convite, que é onde moram o termo LGPD, a confirmação de nível e o
/// uniforme. Duplicar esse fluxo aqui criaria duas versões da mesma regra.
class TournamentRegistrationReceivedInviteCard extends StatelessWidget {
  const TournamentRegistrationReceivedInviteCard({
    super.key,
    required this.title,
    required this.onOpenInvite,
    this.expiryLabel,
  });

  /// "Bia te chamou pra dupla" / "…pra equipe Areia Quente".
  final String title;
  final String? expiryLabel;
  final VoidCallback onOpenInvite;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final expiry = expiryLabel?.trim();

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.brand.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: AppColors.brand.withValues(alpha: 0.16),
                  borderRadius: BorderRadius.circular(11),
                ),
                child: const Icon(
                  Icons.mail_outline_rounded,
                  size: 20,
                  color: AppColors.brand,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      expiry != null && expiry.isNotEmpty
                          ? 'Falta só a sua resposta · $expiry'
                          : 'Falta só a sua resposta.',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: colors.onSurfaceMuted,
                        height: 1.3,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: onOpenInvite,
            child: const Text('Ver convite'),
          ),
        ],
      ),
    );
  }
}
