import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../core/formatting/app_currency_format.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../../arenas/presentation/widgets/booking_pix/booking_pix_qr_card.dart';
import '../../../arenas/presentation/widgets/booking_pix/booking_pix_copy_button.dart';
import '../../data/arena_subscription_repository.dart';
import '../../domain/arena_plan.dart';
import '../../domain/arena_plan_providers.dart';

/// Exibe o QR PIX da 1ª cobrança da assinatura e observa o plano até ativar.
class ArenaSubscriptionPixPage extends ConsumerWidget {
  const ArenaSubscriptionPixPage({
    super.key,
    required this.arenaId,
    required this.result,
    required this.plan,
    required this.cycle,
  });

  final String arenaId;
  final ArenaSubscriptionResult result;
  final ArenaPlan plan;
  final ArenaBillingCycle cycle;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final planStatus = ref.watch(arenaPlanStatusProvider(arenaId));
    final activated = planStatus.valueOrNull?.isActive == true &&
        planStatus.valueOrNull?.tier == plan.tier;
    final priceLabel = formatBRL(plan.priceCents(cycle) / 100);
    final cycleLabel = cycle == ArenaBillingCycle.yearly ? 'ano' : 'mês';

    return Scaffold(
      backgroundColor: colors.canvas,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        title: const Text('Pagamento do plano'),
      ),
      body: SafeArea(
        child: activated
            ? _SuccessView(plan: plan, colors: colors)
            : ListView(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
                children: [
                  Text(
                    'Plano ${plan.name}',
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: colors.onSurface,
                        ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '$priceLabel / $cycleLabel — pague com PIX para ativar',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: colors.onSurfaceMuted,
                        ),
                  ),
                  const SizedBox(height: 20),
                  BookingPixQrCard(
                    base64: result.qrCodeBase64 ?? '',
                    payload: result.qrCode ?? '',
                  ),
                  const SizedBox(height: 16),
                  BookingPixCopyButton(
                    onPressed: () async {
                      await Clipboard.setData(
                        ClipboardData(text: result.qrCode ?? ''),
                      );
                      if (context.mounted) {
                        showAppSnackBar(context, 'Código PIX copiado.');
                      }
                    },
                  ),
                  const SizedBox(height: 24),
                  Row(
                    children: [
                      SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: colors.brand,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          'Aguardando confirmação do pagamento. Esta tela atualiza '
                          'automaticamente quando o plano for ativado.',
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                color: colors.onSurfaceMuted,
                              ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
      ),
    );
  }
}

class _SuccessView extends StatelessWidget {
  const _SuccessView({required this.plan, required this.colors});

  final ArenaPlan plan;
  final AppThemeColors colors;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.check_circle_rounded, size: 72, color: colors.win),
          const SizedBox(height: 16),
          Text(
            'Plano ${plan.name} ativado!',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: colors.onSurface,
                ),
          ),
          const SizedBox(height: 8),
          Text(
            'Sua arena já está com os benefícios do plano liberados.',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: colors.onSurfaceMuted,
                ),
          ),
          const SizedBox(height: 28),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: () => Navigator.of(context).pop(),
              style: FilledButton.styleFrom(
                backgroundColor: colors.brand,
                foregroundColor: colors.black,
                padding: const EdgeInsets.symmetric(vertical: 16),
              ),
              child: const Text('Concluir', style: TextStyle(fontWeight: FontWeight.w800)),
            ),
          ),
        ],
      ),
    );
  }
}
