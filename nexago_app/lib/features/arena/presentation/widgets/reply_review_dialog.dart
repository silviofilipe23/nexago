import 'package:flutter/material.dart';

Future<String?> showReplyReviewDialog(
  BuildContext context, {
  required String originalComment,
  required int rating,
  String? initialValue,
}) {
  return showDialog<String>(
    context: context,
    builder: (_) => _ReplyReviewDialog(
      originalComment: originalComment,
      rating: rating,
      initialValue: initialValue,
    ),
  );
}

class _ReplyReviewDialog extends StatefulWidget {
  const _ReplyReviewDialog({
    required this.originalComment,
    required this.rating,
    this.initialValue,
  });

  final String originalComment;
  final int rating;
  final String? initialValue;

  @override
  State<_ReplyReviewDialog> createState() => _ReplyReviewDialogState();
}

class _ReplyReviewDialogState extends State<_ReplyReviewDialog> {
  static const int _maxChars = 300;
  late final TextEditingController _controller = TextEditingController(
    text: widget.initialValue?.trim().isNotEmpty == true
        ? widget.initialValue!.trim()
        : _suggestedReply(widget.rating),
  );

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  String _suggestedReply(int rating) {
    if (rating <= 3) {
      return 'Sentimos muito pela sua experiência. Estamos trabalhando para melhorar 🙏';
    }
    return 'Obrigado pela avaliação! Esperamos você novamente 🙌';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final text = _controller.text;
    return AlertDialog(
      title: const Text('Responder avaliação'),
      content: SizedBox(
        width: 480,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Comentário do atleta',
              style: theme.textTheme.labelLarge?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 6),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.45),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                widget.originalComment.trim().isEmpty
                    ? 'Atleta não deixou comentário.'
                    : widget.originalComment.trim(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _controller,
              autofocus: true,
              maxLength: _maxChars,
              minLines: 3,
              maxLines: 6,
              decoration: const InputDecoration(
                border: OutlineInputBorder(),
                hintText: 'Escreva uma resposta oficial da arena',
              ),
              onChanged: (_) => setState(() {}),
            ),
            Align(
              alignment: Alignment.centerRight,
              child: Text(
                '${text.trim().length}/$_maxChars',
                style: theme.textTheme.labelSmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          onPressed: text.trim().length < 5 ? null : () => Navigator.of(context).pop(text.trim()),
          child: Text(widget.initialValue == null ? 'Responder' : 'Salvar'),
        ),
      ],
    );
  }
}
