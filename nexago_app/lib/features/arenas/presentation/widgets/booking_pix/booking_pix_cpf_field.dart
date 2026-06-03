import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/validation/cpf_cnpj.dart';

class BookingPixCpfField extends StatelessWidget {
  const BookingPixCpfField({
    super.key,
    required this.controller,
    this.errorText,
    this.onSubmitted,
  });

  final TextEditingController controller;
  final String? errorText;
  final VoidCallback? onSubmitted;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final hasError = errorText != null && errorText!.isNotEmpty;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'CPF DO TITULAR',
          style: theme.textTheme.labelSmall?.copyWith(
            fontWeight: FontWeight.w800,
            letterSpacing: 0.8,
            color: context.themeColors.onSurfaceMuted,
          ),
        ),
        SizedBox(height: 8),
        TextField(
          controller: controller,
          keyboardType: TextInputType.number,
          inputFormatters: [CpfCnpjInputFormatter()],
          style: theme.textTheme.bodyLarge?.copyWith(
            fontWeight: FontWeight.w700,
            color: context.themeColors.onSurface,
          ),
          decoration: InputDecoration(
            hintText: '000.000.000-00',
            errorText: hasError ? errorText : null,
            prefixIcon: Icon(
              Icons.badge_outlined,
              color: context.themeColors.onSurfaceMuted,
              size: 22,
            ),
            filled: true,
            fillColor: context.themeColors.surfaceCard,
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 14,
              vertical: 16,
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide(color: context.themeColors.surfaceRaised),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide(color: AppColors.brand, width: 2),
            ),
            errorBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide(
                color: AppColors.live.withValues(alpha: 0.6),
              ),
            ),
          ),
          onSubmitted: (_) => onSubmitted?.call(),
        ),
        if (!hasError) ...[
          SizedBox(height: 8),
          Text(
            'Necessário pela legislação brasileira para emissão do PIX.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: context.themeColors.onSurfaceMuted,
              height: 1.35,
            ),
          ),
        ],
      ],
    );
  }
}
