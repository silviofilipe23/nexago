import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
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
            color: AppColors.onSurfaceMuted,
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: controller,
          keyboardType: TextInputType.number,
          inputFormatters: [CpfCnpjInputFormatter()],
          style: theme.textTheme.bodyLarge?.copyWith(
            fontWeight: FontWeight.w700,
            color: AppColors.onSurface,
          ),
          decoration: InputDecoration(
            hintText: '000.000.000-00',
            errorText: hasError ? errorText : null,
            prefixIcon: const Icon(
              Icons.badge_outlined,
              color: AppColors.onSurfaceMuted,
              size: 22,
            ),
            filled: true,
            fillColor: AppColors.surfaceCard,
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 14,
              vertical: 16,
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: AppColors.surfaceRaised),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: AppColors.brand, width: 2),
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
          const SizedBox(height: 8),
          Text(
            'Necessário pela legislação brasileira para emissão do PIX.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: AppColors.onSurfaceMuted,
              height: 1.35,
            ),
          ),
        ],
      ],
    );
  }
}
