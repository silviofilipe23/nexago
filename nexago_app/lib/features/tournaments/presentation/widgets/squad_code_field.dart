import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Código de embaixador do NexaSquad no checkout PIX da inscrição.
///
/// Recolhido em "Tem código de embaixador?" para não pesar no checkout de
/// quem não tem. Quem confere o código é a própria cobrança: código que não
/// existe ou do próprio atleta (ou do parceiro) volta como erro e não gera PIX.
class SquadCodeField extends StatefulWidget {
  const SquadCodeField({
    super.key,
    required this.controller,
    this.enabled = true,
  });

  final TextEditingController controller;
  final bool enabled;

  @override
  State<SquadCodeField> createState() => _SquadCodeFieldState();
}

class _SquadCodeFieldState extends State<SquadCodeField> {
  late bool _open = widget.controller.text.isNotEmpty;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    if (!_open) {
      return Align(
        child: TextButton(
          onPressed: widget.enabled ? () => setState(() => _open = true) : null,
          child: const Text('Tem código de embaixador?'),
        ),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'CÓDIGO DE EMBAIXADOR (OPCIONAL)',
          style: theme.textTheme.labelSmall?.copyWith(
            fontWeight: FontWeight.w800,
            letterSpacing: 0.8,
            color: context.themeColors.onSurfaceMuted,
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          key: const Key('squad-code-field'),
          controller: widget.controller,
          enabled: widget.enabled,
          textCapitalization: TextCapitalization.characters,
          autocorrect: false,
          inputFormatters: [
            FilteringTextInputFormatter.allow(RegExp('[A-Za-z0-9]')),
            LengthLimitingTextInputFormatter(20),
            _UpperCaseFormatter(),
          ],
          style: theme.textTheme.bodyLarge?.copyWith(
            fontWeight: FontWeight.w700,
            letterSpacing: 0.6,
            color: context.themeColors.onSurface,
          ),
          decoration: InputDecoration(
            hintText: 'Ex.: JOAO10',
            prefixIcon: Icon(
              Icons.sell_outlined,
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
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'O desconto da indicação aparece no valor do PIX.',
          style: theme.textTheme.bodySmall?.copyWith(
            color: context.themeColors.onSurfaceMuted,
            height: 1.35,
          ),
        ),
      ],
    );
  }
}

class _UpperCaseFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    return newValue.copyWith(text: newValue.text.toUpperCase());
  }
}
