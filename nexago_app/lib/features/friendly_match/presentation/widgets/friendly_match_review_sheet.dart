import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Selos rápidos da avaliação (armazenados como strings estáveis).
const friendlyMatchReviewTags = <(String, String)>[
  ('pontual', 'Pontual'),
  ('nivel_condizente', 'Nível condizente'),
  ('bom_papo', 'Bom papo'),
  ('joga_limpo', 'Joga limpo'),
  ('competitivo', 'Competitivo(a)'),
];

class FriendlyMatchReviewResult {
  const FriendlyMatchReviewResult({
    required this.stars,
    this.tags = const [],
    this.comment,
  });

  final int stars;
  final List<String> tags;
  final String? comment;
}

/// Folha de avaliação double-blind: estrelas + selos + comentário.
/// A nota fica oculta até o outro avaliar (ou o prazo vencer).
Future<FriendlyMatchReviewResult?> showFriendlyMatchReviewSheet(
  BuildContext context, {
  required String otherName,
}) {
  return showModalBottomSheet<FriendlyMatchReviewResult>(
    context: context,
    isScrollControlled: true,
    backgroundColor: context.themeColors.surfaceCard,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (context) => _ReviewSheetBody(otherName: otherName),
  );
}

class _ReviewSheetBody extends StatefulWidget {
  const _ReviewSheetBody({required this.otherName});

  final String otherName;

  @override
  State<_ReviewSheetBody> createState() => _ReviewSheetBodyState();
}

class _ReviewSheetBodyState extends State<_ReviewSheetBody> {
  int _stars = 0;
  final Set<String> _tags = {};
  final _commentController = TextEditingController();

  @override
  void dispose() {
    _commentController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
            20, 12, 20, 20 + MediaQuery.of(context).viewInsets.bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: colors.surfaceRaised,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              'Como foi jogar com ${widget.otherName}?',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
                color: colors.onSurface,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Sua nota fica oculta até ${widget.otherName} também avaliar.',
              style: theme.textTheme.bodySmall
                  ?.copyWith(color: colors.onSurfaceMuted),
            ),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (var i = 1; i <= 5; i++)
                  IconButton(
                    onPressed: () => setState(() => _stars = i),
                    icon: Icon(
                      i <= _stars ? Icons.star_rounded : Icons.star_outline_rounded,
                      size: 36,
                      color: i <= _stars
                          ? const Color(0xFFB98900)
                          : colors.onSurfaceMuted,
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final (value, label) in friendlyMatchReviewTags)
                  FilterChip(
                    label: Text(label),
                    selected: _tags.contains(value),
                    onSelected: (selected) => setState(() {
                      selected ? _tags.add(value) : _tags.remove(value);
                    }),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _commentController,
              maxLength: 300,
              maxLines: 2,
              decoration: const InputDecoration(
                labelText: 'Comentário (opcional)',
              ),
            ),
            const SizedBox(height: 12),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: AppColors.brand),
              onPressed: _stars == 0
                  ? null
                  : () => Navigator.pop(
                        context,
                        FriendlyMatchReviewResult(
                          stars: _stars,
                          tags: _tags.toList(),
                          comment: _commentController.text.trim().isEmpty
                              ? null
                              : _commentController.text.trim(),
                        ),
                      ),
              child: const Text('Enviar avaliação'),
            ),
          ],
        ),
      ),
    );
  }
}
