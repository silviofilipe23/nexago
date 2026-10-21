import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/domain/professor_availability.dart';
import '../../professor_mode/presentation/availability/reschedule_widgets.dart';
import '../domain/messages.dart';

/// Cartão "Pedido de remarcação" na conversa (D3): o horário de antes
/// riscado, o novo em destaque e, para o lado que NÃO pediu, Aceitar /
/// Sugerir outro (um novo pedido, que substitui este) / Recusar.
class RescheduleCardView extends ConsumerStatefulWidget {
  const RescheduleCardView({
    super.key,
    required this.messageId,
    required this.card,
    required this.viewerUid,
    required this.professorUid,
    required this.mine,
    this.time = '',
  });

  final String messageId;
  final RescheduleCard card;
  final String viewerUid;

  /// Dono dos horários livres ("Sugerir outro").
  final String professorUid;

  /// Quem está vendo mandou (o servidor grava como remetente quem pediu).
  final bool mine;
  final String time;

  @override
  ConsumerState<RescheduleCardView> createState() => _RescheduleCardViewState();
}

class _RescheduleCardViewState extends ConsumerState<RescheduleCardView> {
  bool _busy = false;

  Future<void> _run(Future<bool> Function() action) async {
    if (_busy) return;
    setState(() => _busy = true);
    await action();
    if (mounted) setState(() => _busy = false);
  }

  void _respond(bool accept) => _run(
        () => respondLessonRescheduleFlow(
          context,
          ref,
          lessonId: widget.card.lessonId,
          accept: accept,
        ),
      );

  void _suggest() => _run(
        () => requestLessonRescheduleFlow(
          context,
          ref,
          lessonId: widget.card.lessonId,
          professorUid: widget.professorUid,
          currentStartAt: widget.card.fromStartAt,
          successMessage: widget.viewerUid == widget.professorUid
              ? 'Pedido enviado ao aluno'
              : 'Pedido enviado ao professor',
        ),
      );

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final card = widget.card;
    final id = widget.messageId;
    final yellow = colors.readableTone(AppColors.pending);
    final green = colors.readableTone(AppColors.win);
    final dim = ProfessorLinksStyle.dim(colors);

    final Widget bottom;
    if (card.canRespond(widget.viewerUid)) {
      bottom = Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: ProfessorLinksPrimaryButton(
                  key: Key('reschedule-accept-$id'),
                  label: 'Aceitar',
                  height: 36,
                  loading: _busy,
                  onPressed: () => _respond(true),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: ProfessorLinksGhostButton(
                  key: Key('reschedule-suggest-$id'),
                  label: 'Sugerir outro',
                  height: 36,
                  onPressed: _busy ? null : _suggest,
                ),
              ),
            ],
          ),
          Align(
            child: TextButton(
              key: Key('reschedule-decline-$id'),
              onPressed: _busy ? null : () => _respond(false),
              style: TextButton.styleFrom(
                foregroundColor: dim,
                minimumSize: const Size(0, 32),
                padding: const EdgeInsets.symmetric(horizontal: 10),
              ),
              child: Text(
                'Recusar',
                style: AppTypography.bodyS.copyWith(fontSize: 12, color: dim),
              ),
            ),
          ),
        ],
      );
    } else {
      final (label, color) = switch (card.status) {
        LessonRescheduleStatus.pending => ('Aguardando resposta', yellow),
        LessonRescheduleStatus.accepted => ('Remarcada ✓', green),
        LessonRescheduleStatus.declined => ('Recusada', dim),
        LessonRescheduleStatus.replaced => (
            'Substituído por outra proposta',
            dim
          ),
      };
      bottom = Text(
        label,
        key: Key('reschedule-status-$id'),
        style: ProfessorLinksStyle.mono(
          11,
          weight: FontWeight.w700,
          color: color,
        ),
      );
    }

    final content = Container(
      width: 290,
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.pending.withValues(alpha: 0.4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          ProfessorLinksKicker('Pedido de remarcação', color: yellow),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      rescheduleSlotLabel(card.fromStartAt).toUpperCase(),
                      key: Key('reschedule-from-$id'),
                      style: ProfessorLinksStyle.mono(10.5, color: dim)
                          .copyWith(decoration: TextDecoration.lineThrough),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      rescheduleSlotLabel(card.toStartAt),
                      key: Key('reschedule-to-$id'),
                      style: ProfessorLinksStyle.display(
                        15,
                        weight: FontWeight.w700,
                        color: colors.onSurface,
                      ),
                    ),
                  ],
                ),
              ),
              if (card.isPending)
                Text(
                  'LIVRE',
                  style: ProfessorLinksStyle.mono(
                    10,
                    weight: FontWeight.w700,
                    color: green,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'A particular muda de horário; nada mais é alterado.',
            style: AppTypography.bodyS.copyWith(fontSize: 11, color: dim),
          ),
          const SizedBox(height: 12),
          bottom,
          if (widget.time.isNotEmpty) ...[
            const SizedBox(height: 4),
            Align(
              alignment: Alignment.centerRight,
              child: Text(
                widget.time,
                style: ProfessorLinksStyle.mono(9, color: dim),
              ),
            ),
          ],
        ],
      ),
    );

    return Align(
      alignment: widget.mine ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.sizeOf(context).width * 0.8,
        ),
        child: Opacity(
          opacity: card.status == LessonRescheduleStatus.replaced ? 0.55 : 1,
          child: content,
        ),
      ),
    );
  }
}
