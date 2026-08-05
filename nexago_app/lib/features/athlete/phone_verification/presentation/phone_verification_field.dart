import 'package:flutter/material.dart';

import '../../../../core/formatting/br_phone_format.dart';
import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'phone_verification_sheet.dart';

/// Campo de WhatsApp verificado por SMS.
///
/// Substitui o `TextField` de telefone no onboarding e na edição de perfil:
/// o número não é mais digitável direto porque as regras do Firestore
/// proíbem o client de gravar `phoneNumber` — ele só entra pela Cloud
/// Function `confirmPhoneVerification`, depois do SMS.
class PhoneVerificationField extends StatelessWidget {
  const PhoneVerificationField({
    super.key,
    required this.phoneNumber,
    required this.verified,
    required this.onVerified,
    this.errorText,
  });

  /// Telefone salvo no perfil (E.164 depois de verificado, ou legado sem
  /// máscara em contas antigas).
  final String? phoneNumber;
  final bool verified;

  /// Chamado com o telefone verificado quando o fluxo de SMS conclui.
  final ValueChanged<String> onVerified;
  final String? errorText;

  Future<void> _openSheet(BuildContext context) async {
    final result = await showPhoneVerificationSheet(
      context: context,
      initialPhone: formatPhoneBrDisplay(phoneNumber),
    );
    if (result != null) onVerified(result);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final hasError = errorText != null;
    final display = formatPhoneBrDisplay(phoneNumber);

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
            padding: const EdgeInsets.fromLTRB(16, 12, 12, 12),
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
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        display ?? 'Nenhum número verificado',
                        style: theme.textTheme.bodyLarge?.copyWith(
                          fontWeight: FontWeight.w600,
                          color: display == null
                              ? context.themeColors.onSurfaceMuted
                              : context.themeColors.onSurface,
                        ),
                      ),
                      SizedBox(height: 2),
                      Text(
                        verified
                            ? 'Verificado por SMS'
                            : 'Confirme por SMS pra liberar torneios',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: verified
                              ? AppColors.win
                              : context.themeColors.onSurfaceMuted,
                        ),
                      ),
                    ],
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
