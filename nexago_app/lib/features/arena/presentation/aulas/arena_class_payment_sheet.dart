import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../core/formatting/app_currency_format.dart';
import '../../data/arena_class_repository.dart';
import '../../domain/aulas/arena_class_billing_logic.dart';
import '../../domain/aulas/arena_class_enrollment.dart';
import '../../domain/aulas/arena_class_enrollment_providers.dart';
import 'widgets/arena_class_form_atoms.dart';

/// O que a folha gravou — `null` quando o gestor fechou sem mudar nada.
enum ArenaClassChargeSheetResult { paid, canceled }

/// "Registrar pagamento": o gestor recebeu direto (PIX, dinheiro,
/// maquininha, transferência) e dá baixa na cobrança — ou cancela a
/// mensalidade. Em mensalidade online, o servidor anula a fatura nos dois
/// casos; a folha avisa antes.
Future<ArenaClassChargeSheetResult?> showArenaClassPaymentSheet(
  BuildContext context, {
  required ArenaClassCharge charge,
}) {
  return showModalBottomSheet<ArenaClassChargeSheetResult>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: context.themeColors.surfaceSheet,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(26)),
    ),
    builder: (_) => _PaymentSheet(charge: charge),
  );
}

class _PaymentSheet extends ConsumerStatefulWidget {
  const _PaymentSheet({required this.charge});

  final ArenaClassCharge charge;

  @override
  ConsumerState<_PaymentSheet> createState() => _PaymentSheetState();
}

class _PaymentSheetState extends ConsumerState<_PaymentSheet> {
  late ArenaClassPaymentMethod _method = widget.charge.paymentMethod;
  bool _sending = false;
  String? _error;

  Future<void> _run(
    Future<void> Function() action,
    ArenaClassChargeSheetResult result,
    String fallbackError,
  ) async {
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await action();
      if (!mounted) return;
      Navigator.of(context).pop(result);
    } on ArenaClassException catch (e) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        _error = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        _error = fallbackError;
      });
    }
  }

  Future<void> _submit() => _run(
        () => ref.read(arenaClassEnrollmentRepositoryProvider).markChargePaid(
              chargeId: widget.charge.id,
              method: _method,
            ),
        ArenaClassChargeSheetResult.paid,
        'Não foi possível registrar. Tente novamente.',
      );

  Future<void> _cancel() async {
    final c = widget.charge;
    final invoice = arenaClassManualPaymentVoidsInvoice(c)
        ? ' A fatura online também é cancelada no Asaas e o link deixa de '
            'valer; se ela cobria outras mensalidades, o aluno recebe um link '
            'novo só com elas.'
        : '';
    final go = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: ctx.themeColors.surfaceSheet,
        title: const Text('Cancelar a mensalidade?'),
        content: Text(
          '${c.description} (${formatBRL(c.amountReais)}) sai do que '
          '${arenaClassFirstName(c.name)} deve e não volta a ser cobrada.'
          '$invoice',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Voltar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: AppColors.live),
            child: const Text('Sim, cancelar'),
          ),
        ],
      ),
    );
    if (go != true || !mounted) return;
    await _run(
      () => ref
          .read(arenaClassEnrollmentRepositoryProvider)
          .cancelCharge(chargeId: c.id),
      ArenaClassChargeSheetResult.canceled,
      'Não foi possível cancelar. Tente novamente.',
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final c = widget.charge;
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          ArenaClassSheetHeader(
            title: 'Registrar pagamento',
            subtitle: '${c.name} · ${formatBRL(c.amountReais)}',
            onClose: _sending ? () {} : null,
          ),
          const SizedBox(height: 6),
          Text(
            c.description,
            style: TextStyle(fontSize: 12.5, color: colors.onSurfaceMuted),
          ),
          if (arenaClassManualPaymentVoidsInvoice(c)) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.pending.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: AppColors.pending.withValues(alpha: 0.35),
                ),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    Icons.link_off_rounded,
                    size: 18,
                    color: colors.pending,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'Esta mensalidade tem fatura online: registrar o '
                      'pagamento aqui cancela o link enviado ao aluno.',
                      style: TextStyle(
                        fontSize: 12.5,
                        height: 1.4,
                        color: colors.onSurface,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 14),
          const ArenaClassKicker('Como foi pago'),
          for (final m in ArenaClassPaymentMethod.values) ...[
            const SizedBox(height: 8),
            ArenaClassChoiceCard(
              title: m.label,
              selected: m == _method,
              onTap: _sending ? null : () => setState(() => _method = m),
            ),
          ],
          const SizedBox(height: 12),
          Text(
            'A baixa vale com a data de hoje. O dinheiro não passa pela '
            'plataforma — é só o registro do que a arena recebeu.',
            style: TextStyle(
              fontSize: 11.5,
              height: 1.45,
              color: colors.onSurfaceMuted,
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(
              _error!,
              style: TextStyle(
                color: colors.live,
                fontWeight: FontWeight.w600,
                fontSize: 12.5,
              ),
            ),
          ],
          const SizedBox(height: 14),
          ArenaClassPrimaryButton(
            label: 'Confirmar recebimento',
            busy: _sending,
            color: AppColors.win,
            onPressed: _submit,
          ),
          const SizedBox(height: 6),
          TextButton(
            onPressed: _sending ? null : _cancel,
            child: Text(
              'Cancelar mensalidade',
              style: AppTypography.soraRegular(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: _sending ? colors.onSurfaceMuted : colors.live,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
