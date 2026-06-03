import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'edit_profile_field_decorations.dart';

/// Campo de texto estilo protótipo 11 (label interno, borda laranja no foco).
class EditProfileTextField extends StatefulWidget {
  const EditProfileTextField({
    super.key,
    required this.controller,
    required this.label,
    this.required = false,
    this.hintText,
    this.helperText,
    this.maxLength,
    this.showCounter = false,
    this.readOnly = false,
    this.enabled = true,
    this.keyboardType,
    this.textCapitalization = TextCapitalization.none,
    this.prefixIcon,
    this.validator,
    this.onChanged,
    this.maxLines = 1,
  });

  final TextEditingController controller;
  final String label;
  final bool required;
  final String? hintText;
  final String? helperText;
  final int? maxLength;
  final bool showCounter;
  final bool readOnly;
  final bool enabled;
  final TextInputType? keyboardType;
  final TextCapitalization textCapitalization;
  final Widget? prefixIcon;
  final String? Function(String?)? validator;
  final ValueChanged<String>? onChanged;
  final int maxLines;

  @override
  State<EditProfileTextField> createState() => _EditProfileTextFieldState();
}

class _EditProfileTextFieldState extends State<EditProfileTextField> {
  final _focusNode = FocusNode();
  bool _focused = false;

  @override
  void initState() {
    super.initState();
    _focusNode.addListener(_onFocus);
    widget.controller.addListener(_onText);
  }

  @override
  void dispose() {
    _focusNode.removeListener(_onFocus);
    widget.controller.removeListener(_onText);
    _focusNode.dispose();
    super.dispose();
  }

  void _onFocus() => setState(() => _focused = _focusNode.hasFocus);
  void _onText() => setState(() {});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final counterText = widget.showCounter && widget.maxLength != null
        ? '${widget.controller.text.characters.length} / ${widget.maxLength}'
        : null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextFormField(
          controller: widget.controller,
          focusNode: _focusNode,
          readOnly: widget.readOnly,
          enabled: widget.enabled,
          maxLines: widget.maxLines,
          maxLength: widget.showCounter ? widget.maxLength : widget.maxLength,
          maxLengthEnforcement: widget.maxLength != null
              ? MaxLengthEnforcement.enforced
              : null,
          buildCounter: widget.showCounter
              ? (_, {required currentLength, required isFocused, maxLength}) =>
                  null
              : null,
          keyboardType: widget.keyboardType,
          textCapitalization: widget.textCapitalization,
          style: theme.textTheme.bodyLarge?.copyWith(
            color: widget.enabled
                ? context.themeColors.onSurface
                : context.themeColors.onSurfaceMuted,
            fontWeight: FontWeight.w600,
          ),
          validator: widget.validator,
          onChanged: widget.onChanged,
          decoration: editProfileInputDecoration(
            context: context,
            label: widget.label,
            required: widget.required,
            hintText: widget.hintText,
            helperText: widget.showCounter ? null : widget.helperText,
            prefixIcon: widget.prefixIcon,
            focused: _focused,
          ),
        ),
        if (widget.showCounter && widget.maxLength != null) ...[
          SizedBox(height: 6),
          Row(
            children: [
              if (widget.helperText != null)
                Expanded(
                  child: Text(
                    widget.helperText!,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: context.themeColors.onSurfaceMuted,
                      fontSize: 12,
                    ),
                  ),
                )
              else
                Spacer(),
              Text(
                counterText ?? '',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                  fontSize: 12,
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }
}
