import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../core/formatting/app_currency_format.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../../arenas/presentation/widgets/booking_pix/booking_pix_qr_card.dart';
import '../../../arenas/presentation/widgets/booking_pix/booking_pix_copy_button.dart';
import '../../data/arena_subscription_repository.dart';
import '../../domain/arena_plan.dart';
import '../../domain/arena_plan_providers.dart';
import 'arena_plan_activated_page.dart';

class ArenaSubscriptionPendingArgs {
  const ArenaSubscriptionPendingArgs({
    required this.arenaId,
    required this.plan,
    required this.cycle,
    this.result,
  });

  final String arenaId;
  final ArenaPlan plan;
  final ArenaBillingCycle cycle;

  /// Cobrança criada. Nulo só quando a tela é aberta sem ter passado pelo
  /// callable; nesse caso o valor exibido cai no preço do catálogo.
  final ArenaSubscriptionResult? result;
}

/// Aguarda confirmação do pagamento (PIX com QR ou cartão no browser) e
/// redireciona para [ArenaPlanActivatedPage] quando o plano ativar.
class ArenaSubscriptionPendingPage extends ConsumerStatefulWidget {
  const ArenaSubscriptionPendingPage({super.key, required this.args});

  final ArenaSubscriptionPendingArgs args;

  @override
  ConsumerState<ArenaSubscriptionPendingPage> createState() =>
      _ArenaSubscriptionPendingPageState();
}

class _ArenaSubscriptionPendingPageState
    extends ConsumerState<ArenaSubscriptionPendingPage> {
  bool _navigated = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final args = widget.args;
    final planStatus = ref.watch(arenaPlanStatusProvider(args.arenaId));
    final status = planStatus.valueOrNull;
    final activated =
        status?.isActive == true && status?.tier == args.plan.tier;

    if (activated && !_navigated) {
      _navigated = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        context.pushReplacementNamed(
          AppRouteNames.arenaPlanActivated,
          extra: ArenaPlanActivatedArgs(
            arenaId: args.arenaId,
            tier: args.plan.tier,
          ),
        );
      });
    }

    final isPix = args.result?.isPix == true;
    final cycleLabel =
        args.cycle == ArenaBillingCycle.yearly ? 'ano' : 'mês';

    // O QR abaixo é da cobrança REAL: na 1ª assinatura ela traz a ativação
    // somada, então o preço do catálogo não bate com o que o gestor vai pagar.
    final recurringCents = args.plan.priceCents(args.cycle);
    final chargedCents = args.result?.chargedCents ?? recurringCents;
    final activationCents = args.result?.activationFeeCents ?? 0;
    final chargedLabel = formatBRL(chargedCents / 100);
    final action =
        isPix ? 'pague com PIX para ativar' : 'conclua no navegador';
    final headline = activationCents > 0
        ? '$chargedLabel — $action'
        : '$chargedLabel / $cycleLabel — $action';

    return Scaffold(
      backgroundColor: colors.canvas,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        title: const Text('Pagamento do plano'),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
          children: [
            Text(
              'Plano ${args.plan.name}',
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: colors.onSurface,
                  ),
            ),
            const SizedBox(height: 4),
            Text(
              headline,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: colors.onSurfaceMuted,
                  ),
            ),
            if (activationCents > 0) ...[
              const SizedBox(height: 4),
              Text(
                'Inclui ${formatBRL(activationCents / 100)} de ativação '
                '(única). Depois, ${formatBRL(recurringCents / 100)} '
                'por $cycleLabel.',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: colors.onSurfaceMuted,
                      height: 1.35,
                    ),
              ),
            ],
            const SizedBox(height: 20),
            if (isPix) ...[
              BookingPixQrCard(
                base64: args.result!.qrCodeBase64 ?? '',
                payload: args.result!.qrCode ?? '',
              ),
              const SizedBox(height: 16),
              BookingPixCopyButton(
                onPressed: () async {
                  await Clipboard.setData(
                    ClipboardData(text: args.result!.qrCode ?? ''),
                  );
                  if (context.mounted) {
                    showAppSnackBar(context, 'Código PIX copiado.');
                  }
                },
              ),
              const SizedBox(height: 24),
            ] else ...[
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: colors.surfaceCard,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: colors.onSurfaceMuted.withValues(alpha: 0.12),
                  ),
                ),
                child: Column(
                  children: [
                    Icon(
                      Icons.credit_card_rounded,
                      size: 40,
                      color: colors.brand,
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'Finalize o pagamento na aba do navegador que foi aberta.',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: colors.onSurfaceMuted,
                            height: 1.4,
                          ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
            ],
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
                    isPix
                        ? 'Aguardando confirmação do pagamento. Esta tela atualiza '
                            'automaticamente quando o plano for ativado.'
                        : 'Aguardando confirmação do cartão. Esta tela atualiza '
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
