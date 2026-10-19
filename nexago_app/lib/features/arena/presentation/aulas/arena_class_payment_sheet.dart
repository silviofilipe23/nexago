import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../../core/formatting/app_currency_format.dart';
import '../../data/arena_class_repository.dart';
import '../../domain/aulas/arena_class_enrollment.dart';
import '../../domain/aulas/arena_class_enrollment_providers.dart';
import 'widgets/arena_class_form_atoms.dart';

/// "Registrar pagamento": o gestor recebeu direto (PIX, dinheiro,
/// maquininha, transferência) e dá baixa na cobrança. Devolve `true` quando
/// gravou.
Future<bool?> showArenaClassPaymentSheet(
  BuildContext context, {
  required ArenaClassCharge charge,
}) {
  return showModalBottomSheet<bool>(
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

  Future<void> _submit() async {
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await ref.read(arenaClassEnrollmentRepositoryProvider).markChargePaid(
            chargeId: widget.charge.id,
            method: _method,
          );
      if (!mounted) return;
      Navigator.of(context).pop(true);
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
        _error = 'Não foi possível registrar. Tente novamente.';
      });
    }
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
              style: const TextStyle(
                color: AppColors.live,
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
        ],
      ),
    );
  }
}
