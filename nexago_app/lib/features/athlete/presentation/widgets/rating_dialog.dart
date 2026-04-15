import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../../core/auth/auth_providers.dart';
import '../../domain/arena_review.dart';
import '../../domain/arena_review_providers.dart';
import '../../domain/gamification_providers.dart';

Future<void> showRatingDialog(
  BuildContext context, {
  required PendingArenaReview pending,
}) {
  return showDialog<void>(
    context: context,
    barrierDismissible: false,
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
  static const int _xpReward = 10;
  final TextEditingController _commentController = TextEditingController();
  int _rating = 0;
  bool _sending = false;

  @override
  void dispose() {
    _commentController.dispose();
    super.dispose();
  }

  String get _emotionMessage {
    if (_rating == 5) return '🔥 Que bom que você gostou!';
    if (_rating > 0 && _rating <= 3) return '😕 O que podemos melhorar?';
    return '';
  }

  String get _scheduleLabel {
    final rawDate = widget.pending.dateRaw.trim();
    if (rawDate.isEmpty) {
      return '${widget.pending.startTime} - ${widget.pending.endTime}';
    }
    final parsed = DateTime.tryParse(rawDate.length >= 10 ? rawDate.substring(0, 10) : rawDate);
    if (parsed == null) {
      return '$rawDate • ${widget.pending.startTime} - ${widget.pending.endTime}';
    }
    final formattedDate = DateFormat('dd/MM/yyyy').format(parsed);
    return '$formattedDate • ${widget.pending.startTime} - ${widget.pending.endTime}';
  }

  Future<void> _submit() async {
    if (_rating <= 0 || _sending) return;
    final userId = ref.read(authProvider).valueOrNull?.uid;
    if (userId == null || userId.isEmpty) return;
    setState(() => _sending = true);
    try {
      await ref.read(arenaReviewServiceProvider).submitArenaReview(
            arenaId: widget.pending.arenaId,
            bookingId: widget.pending.bookingId,
            userId: userId,
            rating: _rating,
            comment: _commentController.text,
          );
      await ref.read(gamificationServiceProvider).addXp(
            userId: userId,
            amount: _xpReward,
            reason: 'ARENA_REVIEW',
          );
      if (!mounted) return;
      Navigator.of(context).pop();
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Obrigado pela sua avaliação! ⭐'),
          content: Text(
            'Sua opinião ajuda outros atletas e melhora a arena.\n\n+$_xpReward XP adicionados ao seu progresso! 🚀',
          ),
          actions: [
            FilledButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text('Fechar'),
            ),
          ],
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Não foi possível enviar avaliação: $e')),
      );
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AlertDialog(
      title: const Text('Como foi sua experiência?'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Avalie a ${widget.pending.arenaName}'),
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.35),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(
                        Icons.storefront_rounded,
                        size: 18,
                        color: theme.colorScheme.primary,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          widget.pending.arenaName,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Icon(
                        Icons.schedule_rounded,
                        size: 18,
                        color: theme.colorScheme.primary,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _scheduleLabel,
                          style: theme.textTheme.bodyMedium,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Icon(
                        Icons.sports_volleyball_rounded,
                        size: 18,
                        color: theme.colorScheme.primary,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          widget.pending.courtName,
                          style: theme.textTheme.bodyMedium,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: const Color(0xFFFFF8E1),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: const Color(0xFFFFC107).withValues(alpha: 0.45),
                ),
              ),
              child: Text(
                'Avalie esta reserva e ganhe +$_xpReward XP no seu perfil.',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: const Color(0xFF8D6E00),
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(5, (i) {
                final value = i + 1;
                final selected = _rating >= value;
                return IconButton(
                  onPressed:
                      _sending ? null : () => setState(() => _rating = value),
                  iconSize: selected ? 34 : 30,
                  icon: AnimatedScale(
                    scale: selected ? 1.12 : 1.0,
                    duration: const Duration(milliseconds: 180),
                    child: Icon(
                      selected
                          ? Icons.star_rounded
                          : Icons.star_outline_rounded,
                      color: selected
                          ? const Color(0xFFFFC107)
                          : theme.colorScheme.outline,
                    ),
                  ),
                );
              }),
            ),
            if (_emotionMessage.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                _emotionMessage,
                style: theme.textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: _rating >= 5
                      ? const Color(0xFF2E7D32)
                      : const Color(0xFFEF6C00),
                ),
              ),
            ],
            const SizedBox(height: 12),
            TextField(
              controller: _commentController,
              minLines: 2,
              maxLines: 4,
              decoration: const InputDecoration(
                hintText: 'Deixe um comentário',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _sending ? null : () => Navigator.of(context).pop(),
          child: const Text('Agora não'),
        ),
        FilledButton(
          onPressed: (_rating > 0 && !_sending) ? _submit : null,
          child: _sending
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Enviar avaliação'),
        ),
      ],
    );
  }
}
