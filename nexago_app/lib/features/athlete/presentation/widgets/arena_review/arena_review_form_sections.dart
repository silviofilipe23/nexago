import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../../../core/theme/app_typography.dart';
import '../../../domain/arena_review_form_logic.dart';
import 'arena_review_widgets.dart';

TextStyle _sectionLabel(BuildContext context) => AppTypography.mono(
      fontSize: 10,
      fontWeight: FontWeight.w500,
      letterSpacing: 1.5,
      color: context.themeColors.onSurfaceMuted,
    );

/// Opções que mudam com a nota: "O que se destacou?" em 4 e 5, "O que pode
/// melhorar?" de 1 a 3. Sem nota não aparece.
class ArenaReviewTagsSection extends StatelessWidget {
  const ArenaReviewTagsSection({
    super.key,
    required this.rating,
    required this.selected,
    required this.onToggle,
    this.enabled = true,
  });

  final int rating;
  final Set<String> selected;
  final ValueChanged<String> onToggle;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final tone = arenaReviewToneFor(rating);
    final title = switch (tone) {
      ArenaReviewTone.praise => 'O QUE SE DESTACOU? · OPCIONAL',
      ArenaReviewTone.improve => 'O QUE PODE MELHORAR? · OPCIONAL',
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(title,
            key: const ValueKey('arena-review-tags-title'),
            style: _sectionLabel(context)),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final tag in arenaReviewTagsFor(rating))
              ArenaReviewChip(
                label: tag,
                selected: selected.contains(tag),
                critical: tone == ArenaReviewTone.improve,
                onTap: enabled ? () => onToggle(tag) : null,
              ),
          ],
        ),
      ],
    );
  }
}

/// "A quadra foi liberada no horário?" com Sim/Atrasou; tocar de novo desmarca.
class ArenaReviewOnTimeQuestion extends StatelessWidget {
  const ArenaReviewOnTimeQuestion({
    super.key,
    required this.value,
    required this.onChanged,
    this.enabled = true,
  });

  final bool? value;
  final ValueChanged<bool?> onChanged;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          '${arenaReviewOnTimeQuestion.toUpperCase()} · OPCIONAL',
          style: _sectionLabel(context),
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            ArenaReviewChip(
              key: const ValueKey('arena-review-on-time-yes'),
              label: 'Sim',
              selected: value == true,
              onTap:
                  enabled ? () => onChanged(value == true ? null : true) : null,
            ),
            ArenaReviewChip(
              key: const ValueKey('arena-review-on-time-late'),
              label: 'Atrasou',
              selected: value == false,
              critical: true,
              onTap: enabled
                  ? () => onChanged(value == false ? null : false)
                  : null,
            ),
          ],
        ),
      ],
    );
  }
}

/// Comentário público: um link que abre o campo (não mais um chip entre as opções).
class ArenaReviewCommentField extends StatelessWidget {
  const ArenaReviewCommentField({
    super.key,
    required this.controller,
    required this.open,
    required this.onOpen,
    required this.maxLength,
    this.enabled = true,
  });

  final TextEditingController controller;
  final bool open;
  final VoidCallback onOpen;
  final int maxLength;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    if (!open) {
      return Align(
        alignment: Alignment.centerLeft,
        child: TextButton.icon(
          key: const ValueKey('arena-review-comment-toggle'),
          onPressed: enabled ? onOpen : null,
          icon: const Icon(Icons.edit_outlined, size: 18),
          label: const Text(
            'Escrever um comentário',
            style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
          ),
          style: TextButton.styleFrom(
            foregroundColor: colors.brandText,
            padding: const EdgeInsets.symmetric(horizontal: 4),
            minimumSize: const Size(0, 44),
          ),
        ),
      );
    }
    final border = OutlineInputBorder(
      borderRadius: BorderRadius.circular(14),
      borderSide: BorderSide(color: colors.outline.withValues(alpha: 0.35)),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('COMENTÁRIO · APARECE NO PERFIL DA ARENA',
            style: _sectionLabel(context)),
        const SizedBox(height: 10),
        TextField(
          key: const ValueKey('arena-review-comment'),
          controller: controller,
          enabled: enabled,
          autofocus: true,
          minLines: 3,
          maxLines: 6,
          maxLength: maxLength,
          textCapitalization: TextCapitalization.sentences,
          style: TextStyle(fontSize: 14, color: colors.onSurface),
          decoration: InputDecoration(
            hintText: 'O que a arena deveria manter ou mudar?',
            filled: true,
            fillColor: colors.surfaceCard,
            border: border,
            enabledBorder: border,
            focusedBorder: border.copyWith(
              borderSide: BorderSide(color: colors.brandText),
            ),
          ),
        ),
      ],
    );
  }
}
