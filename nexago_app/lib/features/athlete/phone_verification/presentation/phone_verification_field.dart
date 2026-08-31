import 'package:flutter/material.dart';

import '../../../../core/formatting/br_phone_format.dart';
import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'phone_verification_sheet.dart';

/// Campo de WhatsApp do atleta.
///
/// O número é digitado direto: desde que o SMS deixou de ser obrigatório para
/// inscrição, `phoneNumber` é um contato declarado pelo próprio atleta e as
/// regras do Firestore aceitam a escrita do client ENQUANTO não há selo.
///
/// A verificação por SMS continua disponível como opcional (vira selo na
/// gamificação). Depois de verificado o número fica somente leitura: as rules
/// recusam qualquer troca vinda do client, e trocar exige um novo SMS.
class PhoneVerificationField extends StatelessWidget {
  const PhoneVerificationField({
    super.key,
    required this.controller,
    required this.verified,
    required this.onChanged,
    required this.onVerified,
    this.errorText,
  });

  /// Número em edição, já mascarado (`(62) 99999-9999`).
  final TextEditingController controller;

  /// Posse confirmada por SMS (Firebase Phone Auth).
  final bool verified;

  final ValueChanged<String> onChanged;

  /// Chamado com o telefone verificado quando o fluxo de SMS conclui.
  final ValueChanged<String> onVerified;
  final String? errorText;

  Future<void> _openSheet(BuildContext context) async {
    final result = await showPhoneVerificationSheet(
      context: context,
      initialPhone: controller.text.trim().isEmpty
          ? null
          : formatPhoneBrDisplay(controller.text),
    );
    if (result != null) onVerified(result);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final hasError = errorText != null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        DecoratedBox(
          decoration: BoxDecoration(
            color: context.themeColors.surfaceSheet,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: hasError
                  ? AppColors.live
                  : verified
                      ? AppColors.win.withValues(alpha: 0.45)
                      : context.themeColors.onSurfaceMuted
                          .withValues(alpha: 0.22),
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 12, 4),
            child: Row(
              children: [
                Icon(
                  verified
                      ? Icons.verified_rounded
                      : Icons.chat_bubble_outline_rounded,
                  size: 20,
                  color: verified
                      ? AppColors.win
                      : context.themeColors.onSurfaceMuted,
                ),
                SizedBox(width: 12),
                Expanded(
                  child: TextField(
                    controller: controller,
                    // Verificado = imutável pelo client (firestore.rules).
                    readOnly: verified,
                    keyboardType: TextInputType.phone,
                    inputFormatters: [BrPhoneInputFormatter()],
                    onChanged: onChanged,
                    style: theme.textTheme.bodyLarge?.copyWith(
                      fontWeight: FontWeight.w600,
                      color: context.themeColors.onSurface,
                    ),
                    decoration: InputDecoration(
                      isDense: true,
                      border: InputBorder.none,
                      hintText: '(00) 00000-0000',
                      hintStyle: theme.textTheme.bodyLarge?.copyWith(
                        fontWeight: FontWeight.w600,
                        color: context.themeColors.onSurfaceMuted,
                      ),
                      helperText: verified
                          ? 'Verificado por SMS'
                          : 'Verificar por SMS é opcional',
                      helperStyle: theme.textTheme.bodySmall?.copyWith(
                        color: verified
                            ? AppColors.win
                            : context.themeColors.onSurfaceMuted,
                      ),
                    ),
                  ),
                ),
                SizedBox(width: 8),
                TextButton(
                  onPressed: () => _openSheet(context),
                  child: Text(verified ? 'Trocar' : 'Verificar'),
                ),
              ],
            ),
          ),
        ),
        if (hasError) ...[
          SizedBox(height: 6),
          Text(
            errorText!,
            style: theme.textTheme.bodySmall?.copyWith(color: AppColors.live),
          ),
        ],
      ],
    );
  }
}
