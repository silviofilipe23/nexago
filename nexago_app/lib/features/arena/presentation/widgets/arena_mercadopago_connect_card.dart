import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../data/arena_mercadopago_service.dart';
import '../../domain/mercado_pago_providers.dart';
import 'arena_dashboard_tokens.dart';

/// Vincula a conta Mercado Pago do gestor para receber PIX das reservas.
class ArenaMercadoPagoConnectCard extends ConsumerStatefulWidget {
  const ArenaMercadoPagoConnectCard({super.key});

  @override
  ConsumerState<ArenaMercadoPagoConnectCard> createState() =>
      _ArenaMercadoPagoConnectCardState();
}

class _ArenaMercadoPagoConnectCardState extends ConsumerState<ArenaMercadoPagoConnectCard> {
  bool _opening = false;

  Future<void> _connect() async {
    setState(() => _opening = true);
    try {
      await ref.read(arenaMercadoPagoServiceProvider).openConnectFlow();
      if (!mounted) return;
      showAppSnackBar(
        context,
        'Conclua a autorização no Mercado Pago e volte ao app.',
      );
    } on MercadoPagoLinkException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } on FirebaseFunctionsException catch (e) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        ArenaMercadoPagoService.messageFromFunctions(e),
        isError: true,
      );
    } catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, 'Erro: $e', isError: true);
    } finally {
      if (mounted) setState(() => _opening = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final linkedAsync = ref.watch(mercadoPagoLinkedProvider);

    return linkedAsync.when(
      loading: () => const SizedBox.shrink(),
      error: (e, _) => DecoratedBox(
        decoration: ArenaDashboardTokens.cardDecoration(
          color: AppColors.surfaceRaised,
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Text(
            'Não foi possível verificar Mercado Pago: $e',
            style: theme.textTheme.bodySmall?.copyWith(color: AppColors.onSurfaceMuted),
          ),
        ),
      ),
      data: (linked) {
        final connected = linked;
        return DecoratedBox(
          decoration: BoxDecoration(
            color: AppColors.surfaceRaised,
            borderRadius: BorderRadius.circular(ArenaDashboardTokens.cardRadius),
            border: Border.all(
              color: connected
                  ? AppColors.win.withValues(alpha: 0.35)
                  : AppColors.brand.withValues(alpha: 0.35),
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
                      connected ? Icons.check_circle_rounded : Icons.link_rounded,
                      color: connected ? AppColors.win : AppColors.brand,
                      size: 22,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        connected ? 'Mercado Pago conectado' : 'Receber PIX das reservas',
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
                  connected
                      ? 'Sua conta está autorizada. Os pagamentos PIX das reservas serão creditados na sua carteira NexaGO.'
                      : 'Conecte sua conta Mercado Pago para habilitar cobrança PIX (50% ou 100%) aos atletas.',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: AppColors.onSurfaceMuted,
                    height: 1.45,
                  ),
                ),
                if (!connected) ...[
                  const SizedBox(height: 14),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: _opening ? null : _connect,
                      icon: _opening
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: AppColors.black,
                              ),
                            )
                          : const Icon(Icons.open_in_new_rounded, size: 18),
                      label: Text(_opening ? 'Abrindo...' : 'Conectar Mercado Pago'),
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.brand,
                        foregroundColor: AppColors.black,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                    ),
                  ),
                ] else ...[
                  const SizedBox(height: 10),
                  TextButton(
                    onPressed: _opening ? null : _connect,
                    child: Text(
                      _opening ? 'Abrindo...' : 'Reconectar conta',
                      style: const TextStyle(color: AppColors.onSurfaceMuted),
                    ),
                  ),
                ],
              ],
            ),
          ),
        );
      },
    );
  }
}
