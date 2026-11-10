import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/friendly_error_message.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/validation/cpf_cnpj.dart';
import '../../arenas/presentation/widgets/booking_pix/booking_pix_cpf_field.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../application/payment_card_providers.dart';
import '../domain/card_input_validation.dart';
import '../domain/saved_payment_card.dart';

/// Frase do servidor que pede o CPF (cadastro sem CPF).
const _cpfRequired = 'Informe seu CPF para pagar online.';

/// Formulário do cartão. Os dados vivem só nos controllers até o envio:
/// nada é logado, guardado em disco ou mandado ao Crashlytics.
/// Devolve o [SavedPaymentCard] no `pop`.
class PaymentCardFormPage extends ConsumerStatefulWidget {
  const PaymentCardFormPage({super.key, this.now});

  /// Relógio injetável para teste (validade).
  final DateTime Function()? now;

  @override
  ConsumerState<PaymentCardFormPage> createState() =>
      _PaymentCardFormPageState();
}

class _PaymentCardFormPageState extends ConsumerState<PaymentCardFormPage> {
  final _number = TextEditingController();
  final _holder = TextEditingController();
  final _expiry = TextEditingController();
  final _ccv = TextEditingController();
  final _cep = TextEditingController();
  final _addressNumber = TextEditingController();
  final _cpf = TextEditingController();

  final Map<String, String?> _errors = {};
  bool _needsCpf = false;
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    for (final c in [
      _number,
      _holder,
      _expiry,
      _ccv,
      _cep,
      _addressNumber,
      _cpf,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  bool _validate() {
    final now = (widget.now ?? DateTime.now)();
    _errors
      ..clear()
      ..['number'] = validateCardNumber(_number.text)
      ..['holder'] =
          _holder.text.trim().isEmpty ? 'Informe o nome como no cartão.' : null
      ..['expiry'] = validateExpiry(_expiry.text, now)
      ..['ccv'] = validateCcv(_ccv.text)
      ..['cep'] = validateCep(_cep.text)
      ..['addressNumber'] = _addressNumber.text.trim().isEmpty
          ? 'Informe o número do endereço.'
          : null
      ..['cpf'] = _needsCpf && !CpfCnpjValidator.isValid(_cpf.text)
          ? (CpfCnpjValidator.validationMessage(_cpf.text) ??
              'Informe um CPF válido.')
          : null;
    return _errors.values.every((e) => e == null);
  }

  Future<void> _save() async {
    if (_saving) return;
    setState(() => _error = null);
    if (!_validate()) {
      setState(() {});
      return;
    }
    final (month, year) = parseExpiry(_expiry.text)!;
    final input = PaymentCardInput(
      number: _number.text,
      holderName: _holder.text,
      expiryMonth: month,
      expiryYear: year,
      ccv: _ccv.text,
      postalCode: _cep.text,
      addressNumber: _addressNumber.text,
    );
    setState(() => _saving = true);
    try {
      final card = await ref.read(paymentCardRepositoryProvider).save(
            input,
            cpfCnpj: _needsCpf ? CpfCnpjValidator.digitsOnly(_cpf.text) : null,
          );
      if (!mounted) return;
      ref.invalidate(myPaymentCardProvider);
      if (context.canPop()) {
        context.pop(card);
      } else {
        context.go(AppRoutes.savedPaymentCard);
      }
    } catch (e) {
      if (!mounted) return;
      final asksCpf = e.toString() == _cpfRequired;
      setState(() {
        _saving = false;
        if (asksCpf) _needsCpf = true;
        _error = friendlyErrorMessage(
          e,
          action: 'Não foi possível salvar o cartão',
          // Sem dado do cartão: só o nome do fluxo.
          logReason: 'payment_card_save',
        );
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ProfessorLinksScaffold(
      title: 'Novo cartão',
      subtitle: 'DÉBITO AUTOMÁTICO DOS PLANOS',
      onBack: () {
        if (context.canPop()) {
          context.pop();
        } else {
          context.go(AppRoutes.savedPaymentCard);
        }
      },
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          _field(
            key: 'card-number',
            label: 'Número do cartão',
            controller: _number,
            errorKey: 'number',
            keyboardType: TextInputType.number,
            formatters: [CardNumberInputFormatter()],
            hints: const [AutofillHints.creditCardNumber],
            sensitive: true,
          ),
          _field(
            key: 'card-holder',
            label: 'Nome como no cartão',
            controller: _holder,
            errorKey: 'holder',
            keyboardType: TextInputType.name,
            capitalization: TextCapitalization.characters,
            hints: const [AutofillHints.creditCardName],
          ),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: _field(
                  key: 'card-expiry',
                  label: 'Validade (MM/AA)',
                  controller: _expiry,
                  errorKey: 'expiry',
                  keyboardType: TextInputType.number,
                  formatters: [CardExpiryInputFormatter()],
                  hints: const [AutofillHints.creditCardExpirationDate],
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _field(
                  key: 'card-ccv',
                  label: 'CVV',
                  controller: _ccv,
                  errorKey: 'ccv',
                  keyboardType: TextInputType.number,
                  formatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(4),
                  ],
                  hints: const [AutofillHints.creditCardSecurityCode],
                  sensitive: true,
                  obscure: true,
                ),
              ),
            ],
          ),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                flex: 3,
                child: _field(
                  key: 'card-cep',
                  label: 'CEP da fatura',
                  controller: _cep,
                  errorKey: 'cep',
                  keyboardType: TextInputType.number,
                  formatters: [CepInputFormatter()],
                  hints: const [AutofillHints.postalCode],
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                flex: 2,
                child: _field(
                  key: 'card-address-number',
                  label: 'Número',
                  controller: _addressNumber,
                  errorKey: 'addressNumber',
                  keyboardType: TextInputType.text,
                ),
              ),
            ],
          ),
          if (_needsCpf) ...[
            BookingPixCpfField(
              controller: _cpf,
              errorText: _errors['cpf'],
              helperText: 'Necessário para cobrar o cartão online.',
            ),
            const SizedBox(height: 14),
          ],
          if (_error != null) ...[
            Text(
              _error!,
              key: const Key('payment-card-error'),
              style: TextStyle(color: AppColors.live, height: 1.35),
            ),
            const SizedBox(height: 12),
          ],
          Text(
            'Os dados do cartão vão direto ao processador de pagamento. '
            'O nexaGO guarda só a bandeira e o final.',
            style: TextStyle(
              fontSize: 11.5,
              height: 1.45,
              color: ProfessorLinksStyle.dim(colors),
            ),
          ),
          const SizedBox(height: 16),
          FilledButton(
            key: const Key('payment-card-save'),
            onPressed: _saving ? null : _save,
            child: _saving
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Salvar cartão'),
          ),
        ],
      ),
    );
  }

  Widget _field({
    required String key,
    required String label,
    required TextEditingController controller,
    required String errorKey,
    required TextInputType keyboardType,
    List<TextInputFormatter>? formatters,
    List<String>? hints,
    TextCapitalization capitalization = TextCapitalization.none,
    bool sensitive = false,
    bool obscure = false,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: TextField(
        key: Key(key),
        controller: controller,
        keyboardType: keyboardType,
        inputFormatters: formatters,
        textCapitalization: capitalization,
        autofillHints: hints,
        enableSuggestions: !sensitive,
        autocorrect: !sensitive,
        obscureText: obscure,
        decoration: InputDecoration(
          labelText: label,
          errorText: _errors[errorKey],
        ),
      ),
    );
  }
}
