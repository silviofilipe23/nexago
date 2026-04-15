import 'package:flutter/material.dart';

import '../../domain/gamification_models.dart';

Future<void> showGamificationFeedbackSheet(
  BuildContext context, {
  required GamificationFeedback feedback,
}) {
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (context) => _GamificationFeedbackSheet(feedback: feedback),
  );
}

class _GamificationFeedbackSheet extends StatefulWidget {
  const _GamificationFeedbackSheet({required this.feedback});

  final GamificationFeedback feedback;

  @override
  State<_GamificationFeedbackSheet> createState() =>
      _GamificationFeedbackSheetState();
}

class _GamificationFeedbackSheetState extends State<_GamificationFeedbackSheet>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _scale;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 520),
    )..forward();
    _scale = CurvedAnimation(parent: _controller, curve: Curves.easeOutBack);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final unlocked = widget.feedback.unlockedBadges;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
        child: ScaleTransition(
          scale: _scale,
          child: Material(
            color: theme.colorScheme.surface,
            borderRadius: BorderRadius.circular(22),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(18, 16, 18, 14),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '+${widget.feedback.xpGained} XP',
                    style: theme.textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 8),
                  if (widget.feedback.streakIncreased)
                    Text(
                      '🔥 Streak aumentado para ${widget.feedback.newStreak} dias!',
                      style: theme.textTheme.bodyLarge?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  if (unlocked.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Text(
                      'Conquista desbloqueada',
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: unlocked
                          .map(
                            (b) => Chip(
                              label: Text('${b.icon} ${b.title}'),
                              visualDensity: VisualDensity.compact,
                            ),
                          )
                          .toList(growable: false),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
