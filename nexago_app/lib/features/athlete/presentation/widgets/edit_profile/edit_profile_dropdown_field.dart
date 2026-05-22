import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'edit_profile_field_decorations.dart';

/// Dropdown estilo Editar perfil (protótipo 11).
class EditProfileDropdownField<T> extends StatefulWidget {
  const EditProfileDropdownField({
    super.key,
    required this.value,
    required this.label,
    required this.items,
    required this.onChanged,
    this.required = false,
    this.validator,
  });

  final T value;
  final String label;
  final bool required;
  final List<DropdownMenuItem<T>> items;
  final ValueChanged<T?> onChanged;
  final String? Function(T?)? validator;

  @override
  State<EditProfileDropdownField<T>> createState() =>
      _EditProfileDropdownFieldState<T>();
}

class _EditProfileDropdownFieldState<T>
    extends State<EditProfileDropdownField<T>> {
  final _focusNode = FocusNode();
  bool _focused = false;

  @override
  void initState() {
    super.initState();
    _focusNode.addListener(() => setState(() => _focused = _focusNode.hasFocus));
  }

  @override
  void dispose() {
    _focusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return DropdownButtonFormField<T>(
      key: ValueKey<T>(widget.value),
      initialValue: widget.value,
      focusNode: _focusNode,
      isExpanded: true,
      icon: Icon(
        Icons.keyboard_arrow_down_rounded,
        color: AppColors.onSurfaceMuted.withValues(alpha: 0.8),
      ),
      style: theme.textTheme.bodyLarge?.copyWith(
        color: AppColors.onSurface,
        fontWeight: FontWeight.w600,
      ),
      dropdownColor: AppColors.surfaceSheet,
      decoration: editProfileInputDecoration(
        label: widget.label,
        required: widget.required,
        focused: _focused,
      ),
      items: widget.items,
      onChanged: widget.onChanged,
      validator: widget.validator,
    );
  }
}
