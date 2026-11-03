import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/errors/friendly_error_message.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/validation/cpf_cnpj.dart';
import '../../../arenas/presentation/widgets/booking_pix/booking_pix_cpf_field.dart';
import '../../application/schedule_plans_providers.dart';
import 'schedule_plan_ui.dart';

/// "Pagar" sem CPF guardado: pede o CPF e repete o
/// `getArenaScheduleChargePaymentLink` com ele. Fecha com o `invoiceUrl`.
class ScheduleChargeCpfSheet extends ConsumerStatefulWidget {
  const ScheduleChargeCpfSheet({
    super.key,
    required this.chargeId,
    this.initialCpf,
  });

  final String chargeId;

  /// CPF do perfil, para não digitar de novo (o atleta confirma).
  final String? initialCpf;

  @override
  ConsumerState<ScheduleChargeCpfSheet> createState() =>
      _ScheduleChargeCpfSheetState();
}

class _ScheduleChargeCpfSheetState
    extends ConsumerState<ScheduleChargeCpfSheet> {
  late final TextEditingController _cpf;
  String? _fieldError;
  String? _serverError;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    final initial = widget.initialCpf;
    _cpf = TextEditingController(
      text: initial != null && CpfCnpjValidator.isValid(initial)
          ? CpfCnpjValidator.formatDisplay(initial)
          : '',
    );
  }

  @override
  void dispose() {
    _cpf.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_busy) return;
    final text = _cpf.text;
    if (!CpfCnpjValidator.isValid(text)) {
      setState(() {
        _fieldError =
            CpfCnpjValidator.validationMessage(text) ?? 'Informe um CPF válido.';
        _serverError = null;
      });
      return;
    }
    setState(() {
      _busy = true;
      _fieldError = null;
      _serverError = null;
    });
    try {
      final url = await ref.read(schedulePlansRepositoryProvider).chargePaymentLink(
            chargeId: widget.chargeId,
            cpfCnpj: CpfCnpjValidator.digitsOnly(text),
          );
      if (mounted) Navigator.of(context).pop(url);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _serverError = friendlyErrorMessage(
          e,
          action: 'Não foi possível gerar o link de pagamento',
          logReason: 'schedule_plan_pay_cpf',
        );
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return SafeArea(
      top: false,
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(
          20,
          12,
          20,
          20 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            const ScheduleSheetHeader(
              title: 'Informe seu CPF',
              subtitle: 'A fatura do Pix ou do cartão sai no seu nome, como '
                  'pede a lei. Você só informa uma vez.',
            ),
            const SizedBox(height: 16),
            BookingPixCpfField(
              key: const Key('schedule-pay-cpf-field'),
              controller: _cpf,
              errorText: _fieldError,
              onSubmitted: _submit,
              helperText: 'Fica guardado para as próximas mensalidades.',
            ),
            if (_serverError != null) ...[
              const SizedBox(height: 12),
              Text(
                _serverError!,
                key: const Key('schedule-pay-cpf-error'),
                style: TextStyle(fontSize: 12.5, color: colors.live),
              ),
            ],
            const SizedBox(height: 18),
            SchedulePrimaryButton(
              key: const Key('schedule-pay-cpf-submit'),
              label: 'Ir para o pagamento',
              icon: Icons.open_in_new_rounded,
              loading: _busy,
              onPressed: _submit,
            ),
            const SizedBox(height: 6),
            TextButton(
              onPressed: _busy ? null : () => Navigator.of(context).pop(),
              child: const Text('Voltar'),
            ),
          ],
        ),
      ),
    );
  }
}
