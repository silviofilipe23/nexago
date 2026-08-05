import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../auth/widgets/auth_form_widgets.dart';
import '../../domain/profile_completion_models.dart';
import '../../onboarding/presentation/utils/onboarding_input_formatters.dart';
import '../data/phone_verification_service.dart';
import '../domain/phone_verification_errors.dart';

/// Segundos de espera antes de liberar o reenvio (mesmo valor do portal web).
const int _resendCooldownSeconds = 30;

/// Abre a verificação de telefone por SMS.
///
/// Devolve o telefone verificado (E.164, como gravado em `users/{uid}`) ou
/// `null` se o usuário fechou o sheet sem concluir.
Future<String?> showPhoneVerificationSheet({
  required BuildContext context,
  String? initialPhone,
}) {
  return showModalBottomSheet<String>(
    context: context,
    backgroundColor: context.themeColors.surfaceSheet,
    isScrollControlled: true,
    // Sem isso o sheet fecha ao tocar fora no meio da digitação do código e o
    // usuário perde a sessão de verificação (teria que pedir um SMS novo).
    isDismissible: false,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (context) => _PhoneVerificationSheet(initialPhone: initialPhone),
  );
}

enum _Step { phone, code }

class _PhoneVerificationSheet extends ConsumerStatefulWidget {
  const _PhoneVerificationSheet({this.initialPhone});

  final String? initialPhone;

  @override
  ConsumerState<_PhoneVerificationSheet> createState() =>
      _PhoneVerificationSheetState();
}

class _PhoneVerificationSheetState
    extends ConsumerState<_PhoneVerificationSheet> {
  final _phoneCtrl = TextEditingController();
  final _codeCtrl = TextEditingController();

  _Step _step = _Step.phone;
  PhoneVerificationSession? _session;
  bool _sending = false;
  bool _confirming = false;
  String? _error;
  int _resendCooldown = 0;
  Timer? _cooldownTimer;

  @override
  void initState() {
    super.initState();
    _phoneCtrl.text = widget.initialPhone ?? '';
  }

  @override
  void dispose() {
    _cooldownTimer?.cancel();
    _phoneCtrl.dispose();
    _codeCtrl.dispose();
    super.dispose();
  }

  bool get _phoneValid =>
      ProfileCompletionValidators.isValidWhatsApp(_phoneCtrl.text);

  bool get _codeValid => RegExp(r'^\d{6}$').hasMatch(_codeCtrl.text);

  Future<void> _sendCode() async {
    if (!_phoneValid || _sending || _resendCooldown > 0) return;
    setState(() {
      _error = null;
      _sending = true;
    });

    await ref.read(phoneVerificationServiceProvider).sendCode(
          phoneNumberRaw: _phoneCtrl.text,
          resendToken: _session?.resendToken,
          onCodeSent: (session) {
            if (!mounted) return;
            setState(() {
              _session = session;
              _sending = false;
              _step = _Step.code;
              _codeCtrl.clear();
            });
            _startCooldown();
          },
          // Android leu o SMS sozinho: a verificação já terminou.
          onAutoVerified: (phoneNumber) {
            if (!mounted) return;
            Navigator.of(context).pop(phoneNumber);
          },
          onFailed: (error) {
            if (!mounted) return;
            setState(() {
              _sending = false;
              _error = phoneVerificationErrorMessage(error);
            });
          },
        );
  }

  Future<void> _confirmCode() async {
    final session = _session;
    if (!_codeValid || _confirming || session == null) return;
    setState(() {
      _error = null;
      _confirming = true;
    });

    try {
      final phoneNumber =
          await ref.read(phoneVerificationServiceProvider).confirmCode(
                session: session,
                smsCode: _codeCtrl.text,
              );
      if (!mounted) return;
      Navigator.of(context).pop(phoneNumber);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _confirming = false;
        _error = phoneVerificationErrorMessage(error);
      });
    }
  }

  void _changeNumber() {
    // O cooldown protege contra reenvio repetido para o MESMO número; trocar
    // de número é um envio novo. Sem zerar aqui, o botão "Enviar código"
    // aparece habilitado e não faz nada até o contador acabar.
    _cooldownTimer?.cancel();
    setState(() {
      _step = _Step.phone;
      _codeCtrl.clear();
      _error = null;
      _session = null;
      _resendCooldown = 0;
    });
  }

  void _startCooldown() {
    _cooldownTimer?.cancel();
    setState(() => _resendCooldown = _resendCooldownSeconds);
    _cooldownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      setState(() => _resendCooldown--);
      if (_resendCooldown <= 0) timer.cancel();
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final busy = _sending || _confirming;

    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  const SizedBox(width: 40),
                  Expanded(
                    child: Center(
                      child: Container(
                        width: 40,
                        height: 4,
                        decoration: BoxDecoration(
                          color: context.themeColors.onSurfaceMuted
                              .withValues(alpha: 0.35),
                          borderRadius: BorderRadius.circular(999),
                        ),
                      ),
                    ),
                  ),
                  SizedBox(
                    width: 40,
                    child: IconButton(
                      onPressed:
                          busy ? null : () => Navigator.of(context).pop(),
                      icon: const Icon(Icons.close_rounded, size: 20),
                      color: context.themeColors.onSurfaceMuted,
                      tooltip: 'Fechar',
                    ),
                  ),
                ],
              ),
              SizedBox(height: 4),
              Text(
                _step == _Step.phone
                    ? 'Verificar WhatsApp'
                    : 'Digite o código',
                style: theme.textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: context.themeColors.onSurface,
                ),
              ),
              SizedBox(height: 6),
              Text(
                _step == _Step.phone
                    ? 'Enviamos um código por SMS pra confirmar que o número é seu.'
                    : 'Enviamos um SMS para ${_phoneCtrl.text}.',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
              SizedBox(height: 20),
              if (_step == _Step.phone) ..._phoneStep() else ..._codeStep(),
              if (_error != null) ...[
                SizedBox(height: 12),
                Text(
                  _error!,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: AppColors.live,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _phoneStep() {
    return [
      const AuthFieldLabel(label: 'WHATSAPP'),
      AuthTextField(
        controller: _phoneCtrl,
        hintText: '(00) 00000-0000',
        keyboardType: TextInputType.phone,
        textInputAction: TextInputAction.done,
        autofillHints: const [AutofillHints.telephoneNumber],
        inputFormatters: [BrPhoneInputFormatter()],
        prefixIcon: Icon(
          Icons.chat_bubble_outline_rounded,
          size: 20,
          color: context.themeColors.onSurfaceMuted,
        ),
        onChanged: (_) => setState(() {}),
        onSubmitted: (_) => _sendCode(),
      ),
      SizedBox(height: 20),
      AuthContinueButton(
        label: 'Enviar código',
        loading: _sending,
        onPressed: _phoneValid ? _sendCode : null,
      ),
    ];
  }

  List<Widget> _codeStep() {
    return [
      const AuthFieldLabel(label: 'CÓDIGO DE 6 DÍGITOS'),
      AuthTextField(
        controller: _codeCtrl,
        hintText: '000000',
        keyboardType: TextInputType.number,
        textInputAction: TextInputAction.done,
        autofillHints: const [AutofillHints.oneTimeCode],
        inputFormatters: [
          FilteringTextInputFormatter.digitsOnly,
          LengthLimitingTextInputFormatter(6),
        ],
        prefixIcon: Icon(
          Icons.sms_outlined,
          size: 20,
          color: context.themeColors.onSurfaceMuted,
        ),
        onChanged: (_) => setState(() {}),
        onSubmitted: (_) => _confirmCode(),
      ),
      SizedBox(height: 20),
      AuthContinueButton(
        label: 'Confirmar',
        loading: _confirming,
        onPressed: _codeValid ? _confirmCode : null,
      ),
      SizedBox(height: 4),
      Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          TextButton(
            onPressed: _confirming ? null : _changeNumber,
            child: const Text('Trocar número'),
          ),
          TextButton(
            onPressed: (_resendCooldown > 0 || _sending || _confirming)
                ? null
                : _sendCode,
            child: Text(
              _resendCooldown > 0
                  ? 'Reenviar em ${_resendCooldown}s'
                  : 'Reenviar código',
            ),
          ),
        ],
      ),
    ];
  }
}
