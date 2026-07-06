import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../core/auth/auth_providers.dart';
import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../domain/arena_review.dart';
import '../../domain/arena_review_providers.dart';

const _xpReward = 10;

const _highlightTags = <String>[
  'Quadra impecável',
  'Atendimento bom',
  'Iluminação',
  'Vestiário',
  'Pontualidade',
  'Estacionamento',
];

Future<void> showRatingDialog(
  BuildContext context, {
  required PendingArenaReview pending,
}) {
  return showDialog<void>(
    context: context,
    barrierDismissible: false,
    barrierColor: AppColors.black.withValues(alpha: 0.72),
    builder: (_) => _RatingDialog(pending: pending),
  );
}

class _RatingDialog extends ConsumerStatefulWidget {
  const _RatingDialog({required this.pending});

  final PendingArenaReview pending;

  @override
  ConsumerState<_RatingDialog> createState() => _RatingDialogState();
}

class _RatingDialogState extends ConsumerState<_RatingDialog> {
  final TextEditingController _commentController = TextEditingController();
  final Set<String> _selectedTags = {'Quadra impecável', 'Atendimento bom'};
  int _rating = 5;
  bool _showCommentField = false;
  bool _sending = false;

  @override
  void dispose() {
    _commentController.dispose();
    super.dispose();
  }

  String get _ratingLabel => switch (_rating) {
    0 => '',
    1 => 'Péssimo',
    2 => 'Ruim',
    3 => 'Regular',
    4 => 'Bom',
    5 => 'Excelente',
    _ => '',
  };

  String get _sessionSubtitle {
    final court = widget.pending.courtName.trim().isNotEmpty
        ? widget.pending.courtName.trim().toUpperCase()
        : 'QUADRA';
    final time = '${widget.pending.startTime}-${widget.pending.endTime}';
    final rawDate = widget.pending.dateRaw.trim();
    if (rawDate.isEmpty) return '$time · $court';

    final parsed = DateTime.tryParse(
      rawDate.length >= 10 ? rawDate.substring(0, 10) : rawDate,
    );
    if (parsed == null) return '$rawDate · $time · $court';

    final now = DateTime.now();
    final bookingDay = DateTime(parsed.year, parsed.month, parsed.day);
    final today = DateTime(now.year, now.month, now.day);
    final diffDays = today.difference(bookingDay).inDays;
    final dayLabel = switch (diffDays) {
      0 => 'HOJE',
      1 => 'ONTEM',
      _ => DateFormat('dd/MM', 'pt_BR').format(parsed).toUpperCase(),
    };
    return '$dayLabel · $time · $court';
  }

  String? _composedComment() {
    final tags = _selectedTags.toList()..sort();
    final userText = _commentController.text.trim();
    if (tags.isEmpty && userText.isEmpty) return null;
    final buffer = StringBuffer();
    if (tags.isNotEmpty) {
      buffer.write('Destaques: ${tags.join(', ')}');
    }
    if (userText.isNotEmpty) {
      if (buffer.isNotEmpty) buffer.writeln();
      buffer.write(userText);
    }
    return buffer.toString().trim();
  }

  Future<void> _submit() async {
    if (_rating <= 0 || _sending) return;
    final userId = ref.read(authProvider).valueOrNull?.uid;
    if (userId == null || userId.isEmpty) return;
    setState(() => _sending = true);
    try {
      await ref
          .read(arenaReviewServiceProvider)
          .submitArenaReview(
            arenaId: widget.pending.arenaId,
            bookingId: widget.pending.bookingId,
            userId: userId,
            rating: _rating,
            comment: _composedComment(),
          );
      // XP da avaliação é creditado server-side via Cloud Function (trigger em
      // arena_reviews) — nenhuma chamada do client necessária.
      if (!mounted) return;
      Navigator.of(context).pop();
      showAppSnackBar(context, 'Obrigado! +$_xpReward XP no seu progresso.');
    } catch (e) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        'Não foi possível enviar avaliação.',
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  void _toggleTag(String tag) {
    setState(() {
      if (_selectedTags.contains(tag)) {
        _selectedTags.remove(tag);
      } else {
        _selectedTags.add(tag);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final arenaName = widget.pending.arenaName.trim();

    return Dialog(
      backgroundColor: context.themeColors.surfaceCard,
      surfaceTintColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 20),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Text(
                  'RESERVA · CONCLUÍDA',
                  style: AppTypography.mono(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: AppColors.brand,
                    letterSpacing: 0.4,
                  ),
                ),
                Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: context.themeColors.surfaceRaised,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: AppColors.brand.withValues(alpha: 0.4),
                    ),
                  ),
                  child: Text(
                    '+$_xpReward XP',
                    style: AppTypography.mono(
                      fontWeight: FontWeight.w700,
                      fontSize: 10,
                      color: AppColors.brand,
                    ),
                  ),
                ),
              ],
            ),
            SizedBox(height: 16),
            RichText(
              text: TextSpan(
                style: theme.textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w900,
                  color: context.themeColors.onSurface,
                  height: 1.2,
                ),
                children: [
                  const TextSpan(text: 'Como foi o jogo na\n'),
                  TextSpan(
                    text: arenaName.isEmpty ? 'sua arena' : arenaName,
                    style: TextStyle(color: AppColors.brand),
                  ),
                  const TextSpan(text: '?'),
                ],
              ),
            ),
            SizedBox(height: 8),
            Text(
              _sessionSubtitle,
              style: AppTypography.mono(
                fontSize: 12,
                color: context.themeColors.onSurfaceMuted,
                fontWeight: FontWeight.w500,
                letterSpacing: 0.3,
              ),
            ),
            SizedBox(height: 20),
            if (_ratingLabel.isNotEmpty)
              Center(
                child: Text(
                  _ratingLabel,
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: AppColors.win,
                  ),
                ),
              ),
            if (_ratingLabel.isNotEmpty) SizedBox(height: 10),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(5, (i) {
                final value = i + 1;
                final filled = _rating >= value;
                return Padding(
                  padding: EdgeInsets.only(left: i == 0 ? 0 : 6),
                  child: Material(
                    color: context.themeColors.surfaceRaised,
                    borderRadius: BorderRadius.circular(10),
                    child: InkWell(
                      onTap: _sending
                          ? null
                          : () => setState(() => _rating = value),
                      borderRadius: BorderRadius.circular(10),
                      child: Container(
                        width: 48,
                        height: 48,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                            color: filled
                                ? AppColors.brand.withValues(alpha: 0.55)
                                : Colors.transparent,
                          ),
                        ),
                        child: Icon(
                          filled
                              ? Icons.star_rounded
                              : Icons.star_outline_rounded,
                          color: filled
                              ? AppColors.brand
                              : context.themeColors.onSurfaceMuted,
                          size: 28,
                        ),
                      ),
                    ),
                  ),
                );
              }),
            ),
            SizedBox(height: 20),
            Text(
              'O QUE DESTACOU? OPCIONAL',
              style: AppTypography.mono(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: context.themeColors.onSurfaceMuted,
                letterSpacing: 0.4,
              ),
            ),
            SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                ..._highlightTags.map(
                  (tag) => _HighlightChip(
                    label: tag,
                    selected: _selectedTags.contains(tag),
                    onTap: _sending ? null : () => _toggleTag(tag),
                  ),
                ),
                _CommentChip(
                  active: _showCommentField,
                  onTap: _sending
                      ? null
                      : () => setState(
                          () => _showCommentField = !_showCommentField,
                        ),
                ),
              ],
            ),
            if (_showCommentField) ...[
              SizedBox(height: 12),
              TextField(
                controller: _commentController,
                minLines: 2,
                maxLines: 4,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: context.themeColors.onSurface,
                ),
                decoration: InputDecoration(
                  hintText: 'Escreva um comentário…',
                  hintStyle: theme.textTheme.bodyMedium?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                  ),
                  filled: true,
                  fillColor: context.themeColors.surfaceRaised,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide(color: context.themeColors.surfaceRaised),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide(color: context.themeColors.surfaceRaised),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide(
                      color: AppColors.brand.withValues(alpha: 0.6),
                    ),
                  ),
                ),
              ),
            ],
            SizedBox(height: 20),
            Row(
              children: [
                TextButton(
                  onPressed: _sending
                      ? null
                      : () => Navigator.of(context).pop(),
                  style: TextButton.styleFrom(
                    foregroundColor: context.themeColors.onSurfaceMuted,
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                  ),
                  child: Text('Agora não'),
                ),
                SizedBox(width: 8),
                Expanded(
                  child: FilledButton(
                    onPressed: (_rating > 0 && !_sending) ? _submit : null,
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.brand,
                      foregroundColor: AppColors.black,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 12,
                      ),
                    ),
                    child: _sending
                        ? SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: AppColors.black,
                            ),
                          )
                        : Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Flexible(
                                child: Text(
                                  'Enviar e ganhar +$_xpReward XP',
                                  style: theme.textTheme.labelLarge?.copyWith(
                                    fontWeight: FontWeight.w900,
                                    color: AppColors.black,
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  textAlign: TextAlign.center,
                                ),
                              ),
                              SizedBox(width: 6),
                              Icon(
                                Icons.bolt_rounded,
                                size: 18,
                                color: AppColors.black,
                              ),
                            ],
                          ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _HighlightChip extends StatelessWidget {
  const _HighlightChip({
    required this.label,
    required this.selected,
    this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: selected
                ? AppColors.brand.withValues(alpha: 0.12)
                : Colors.transparent,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: selected
                  ? AppColors.brand
                  : context.themeColors.onSurfaceMuted.withValues(alpha: 0.35),
            ),
          ),
          child: Text(
            selected ? '✓ $label' : label,
            style: theme.textTheme.labelMedium?.copyWith(
              fontWeight: FontWeight.w700,
              color: selected ? AppColors.brand : context.themeColors.onSurfaceMuted,
            ),
          ),
        ),
      ),
    );
  }
}

class _CommentChip extends StatelessWidget {
  const _CommentChip({required this.active, this.onTap});

  final bool active;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: active
                  ? AppColors.brand
                  : context.themeColors.onSurfaceMuted.withValues(alpha: 0.35),
              style: active ? BorderStyle.solid : BorderStyle.solid,
            ),
          ),
          child: Text(
            '+ comentário',
            style: theme.textTheme.labelMedium?.copyWith(
              fontWeight: FontWeight.w700,
              color: active ? AppColors.brand : context.themeColors.onSurfaceMuted,
            ),
          ),
        ),
      ),
    );
  }
}
