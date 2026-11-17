import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/store_checkout_models.dart';
import '../store_checkout_copy.dart';
import 'store_checkout_parts.dart';
import 'store_style.dart';

const Color _problemRed = Color(0xFFFF5A4F);

/// "Tem código de embaixador?" no carrinho da Loja. A indicação por link já
/// vem resolvida na cotação; digitar troca por outro código. O estado (código
/// digitado, campo aberto) mora na página, que cota de novo a cada mudança.
class StoreSquadField extends StatelessWidget {
  const StoreSquadField({
    super.key,
    required this.controller,
    required this.squad,
    required this.typedCode,
    required this.open,
    required this.onOpen,
    required this.onApply,
    required this.onRemove,
    required this.onChanged,
  });

  final TextEditingController controller;

  /// Indicação da cotação em dia (`null` = nenhuma).
  final StoreQuoteSquad? squad;

  /// Código digitado pelo atleta (`null` = vale o link, se houver).
  final String? typedCode;
  final bool open;
  final VoidCallback onOpen;
  final VoidCallback onApply;
  final VoidCallback onRemove;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final s = squad;
    final message = s != null && !s.applied ? s.message : null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _body(colors, s),
        if (message != null) ...[
          const SizedBox(height: 6),
          Text(
            message,
            key: const ValueKey('store-cart-squad-msg'),
            style: AppTypography.bodyS.copyWith(
              color: s?.reason == 'invalido'
                  ? _problemRed
                  : StoreStyle.tertiary(colors),
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ],
    );
  }

  Widget _body(AppThemeColors colors, StoreQuoteSquad? s) {
    final typed = typedCode;
    if (typed != null) {
      final ok = s != null && s.applied;
      return _chip(
        colors,
        tone: ok ? AppColors.win : _problemRed,
        text:
            ok ? StoreCheckoutCopy.squadTyped(s.code, s.ambassadorName) : typed,
        action: StoreCheckoutCopy.squadRemove,
        actionKey: const ValueKey('store-cart-squad-remove'),
        onAction: onRemove,
      );
    }
    if (open) return _field(colors);
    if (s != null && s.applied) {
      return _chip(
        colors,
        tone: AppColors.win,
        text: StoreCheckoutCopy.squadFrom(s.ambassadorName),
        action: StoreCheckoutCopy.squadOther,
        actionKey: const ValueKey('store-cart-squad-other'),
        onAction: onOpen,
      );
    }
    return Align(
      alignment: Alignment.centerLeft,
      child: TextButton(
        key: const ValueKey('store-cart-squad-toggle'),
        onPressed: onOpen,
        child: const Text(StoreCheckoutCopy.squadToggle),
      ),
    );
  }

  Widget _chip(
    AppThemeColors colors, {
    required Color tone,
    required String text,
    required String action,
    required Key actionKey,
    required VoidCallback onAction,
  }) {
    return Container(
      constraints: const BoxConstraints(minHeight: 50),
      padding: const EdgeInsets.only(left: 14, right: 4),
      decoration: BoxDecoration(
        borderRadius: AppRadii.mdAll,
        color: tone.withValues(alpha: 0.08),
        border: Border.all(color: tone.withValues(alpha: 0.45)),
      ),
      child: Row(
        children: [
          Icon(
            Icons.verified_outlined,
            size: 17,
            color: colors.readableTone(tone),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: AppTypography.bodyM.copyWith(
                color: colors.onSurface,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          TextButton(
            key: actionKey,
            onPressed: onAction,
            style: TextButton.styleFrom(foregroundColor: colors.onSurface),
            child: Text(action),
          ),
        ],
      ),
    );
  }

  Widget _field(AppThemeColors colors) {
    final border = OutlineInputBorder(
      borderRadius: AppRadii.mdAll,
      borderSide: BorderSide(color: StoreCheckoutStyle.line(colors)),
    );
    return Row(
      children: [
        Expanded(
          child: TextField(
            key: const ValueKey('store-cart-squad-field'),
            controller: controller,
            autofocus: true,
            textCapitalization: TextCapitalization.characters,
            textInputAction: TextInputAction.done,
            maxLength: 20,
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp('[A-Za-z0-9]')),
            ],
            onSubmitted: (_) => onApply(),
            onChanged: (_) => onChanged(),
            style: AppTypography.mono(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: colors.onSurface,
            ),
            decoration: InputDecoration(
              counterText: '',
              isDense: true,
              hintText: StoreCheckoutCopy.squadHint,
              hintStyle: AppTypography.bodyM.copyWith(
                color: StoreStyle.tertiary(colors),
              ),
              prefixIcon: Icon(
                Icons.verified_outlined,
                size: 17,
                color: StoreStyle.tertiary(colors),
              ),
              filled: true,
              fillColor: StoreCheckoutStyle.card(colors),
              contentPadding: const EdgeInsets.symmetric(vertical: 15),
              border: border,
              enabledBorder: border,
              focusedBorder: const OutlineInputBorder(
                borderRadius: AppRadii.mdAll,
                borderSide: BorderSide(color: AppColors.brand, width: 1.5),
              ),
            ),
          ),
        ),
        const SizedBox(width: 10),
        StoreSoftButton(
          key: const ValueKey('store-cart-squad-apply'),
          label: StoreCheckoutCopy.squadApply,
          height: 50,
          onPressed: controller.text.trim().isEmpty ? null : onApply,
        ),
      ],
    );
  }
}
