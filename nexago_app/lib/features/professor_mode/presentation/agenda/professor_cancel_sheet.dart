import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/professor_cancel.dart';

/// O que o professor escolheu na folha.
class ProfessorCancelChoice {
  const ProfessorCancelChoice({
    required this.reason,
    required this.toggle,
    this.alternative = false,
  });

  final ProfessorCancelReason reason;
  final bool toggle;

  /// Tocou a ação principal "em vez de cancelar" (E5c), não o cancelamento.
  final bool alternative;
}

/// Liga/desliga da folha (crédito de reposição na turma).
class ProfessorCancelToggle {
  const ProfessorCancelToggle({
    required this.label,
    required this.sub,
    this.initial = true,
  });

  final String label;
  final String sub;
  final bool initial;
}

/// Abre a folha "Cancelar aula?" (E5a/E5b) ou "Fora do prazo" (E5c).
/// `null` = manteve a aula.
Future<ProfessorCancelChoice?> showProfessorCancelSheet(
  BuildContext context, {
  required String title,
  required String subtitle,
  required List<ProfessorCancelImpact> Function(bool toggle) impacts,
  required String confirmLabel,
  bool late = false,
  String? message,
  ProfessorCancelToggle? toggle,
  String? alternativeLabel,
  ProfessorCancelReason? fixedReason,
}) {
  return showModalBottomSheet<ProfessorCancelChoice>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    backgroundColor: context.themeColors.surfaceSheet,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (_) => ProfessorCancelSheet(
      title: title,
      subtitle: subtitle,
      impacts: impacts,
      confirmLabel: confirmLabel,
      late: late,
      message: message,
      toggle: toggle,
      alternativeLabel: alternativeLabel,
      fixedReason: fixedReason,
    ),
  );
}

class ProfessorCancelSheet extends StatefulWidget {
  const ProfessorCancelSheet({
    super.key,
    required this.title,
    required this.subtitle,
    required this.impacts,
    required this.confirmLabel,
    this.late = false,
    this.message,
    this.toggle,
    this.alternativeLabel,
    this.fixedReason,
  });

  final String title;
  final String subtitle;
  final List<ProfessorCancelImpact> Function(bool toggle) impacts;
  final String confirmLabel;

  /// Fora do prazo (E5c): relógio amarelo, cancelar vira a ação secundária e
  /// [alternativeLabel] a principal.
  final bool late;
  final String? message;
  final ProfessorCancelToggle? toggle;
  final String? alternativeLabel;

  /// Sem os chips (E5c): o motivo já vem decidido.
  final ProfessorCancelReason? fixedReason;

  @override
  State<ProfessorCancelSheet> createState() => _ProfessorCancelSheetState();
}

class _ProfessorCancelSheetState extends State<ProfessorCancelSheet> {
  late ProfessorCancelReason? _reason = widget.fixedReason;
  late bool _toggle = widget.toggle?.initial ?? false;

  void _confirm({bool alternative = false}) {
    final reason = _reason;
    if (reason == null) return;
    Navigator.of(context).pop(ProfessorCancelChoice(
      reason: reason,
      toggle: _toggle,
      alternative: alternative,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final late = widget.late;
    final accent = late ? colors.pending : colors.live;
    final impacts = widget.impacts(_toggle);
    final canConfirm = _reason != null;

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: accent.withValues(alpha: 0.45)),
                ),
                child: Icon(
                  late ? Icons.schedule_rounded : Icons.close_rounded,
                  size: 20,
                  color: accent,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      widget.title,
                      style: AppTypography.soraRegular(
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      widget.subtitle,
                      key: const Key('professor-cancel-subtitle'),
                      style: AppTypography.soraRegular(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w500,
                        color: colors.onSurfaceMuted,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (widget.message != null) ...[
            const SizedBox(height: 14),
            Text(
              widget.message!,
              key: const Key('professor-cancel-message'),
              style: AppTypography.soraRegular(
                fontSize: 13,
                fontWeight: FontWeight.w500,
                height: 1.45,
                color: colors.onSurface.withValues(alpha: 0.78),
              ),
            ),
          ],
          if (widget.fixedReason == null) ...[
            const SizedBox(height: 16),
            const _Kicker('Motivo · os alunos veem'),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final r in ProfessorCancelReason.values)
                  _ReasonChip(
                    key: Key('professor-cancel-reason-${r.name}'),
                    label: r.label,
                    selected: r == _reason,
                    onTap: () => setState(() => _reason = r),
                  ),
              ],
            ),
          ],
          const SizedBox(height: 16),
          Container(
            key: const Key('professor-cancel-impacts'),
            padding: const EdgeInsets.symmetric(horizontal: 14),
            decoration: BoxDecoration(
              color: colors.onSurface.withValues(alpha: 0.03),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: late
                    ? colors.pending.withValues(alpha: 0.35)
                    : colors.onSurface.withValues(alpha: 0.10),
              ),
            ),
            child: Column(
              children: [
                for (var i = 0; i < impacts.length; i++)
                  _ImpactRow(impact: impacts[i], last: i == impacts.length - 1),
              ],
            ),
          ),
          if (widget.toggle != null) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.fromLTRB(14, 10, 8, 10),
              decoration: BoxDecoration(
                color: colors.onSurface.withValues(alpha: 0.03),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: colors.onSurface.withValues(alpha: 0.10),
                ),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.toggle!.label,
                          style: AppTypography.soraRegular(
                            fontSize: 13.5,
                            fontWeight: FontWeight.w700,
                            color: colors.onSurface,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          widget.toggle!.sub,
                          style: AppTypography.soraRegular(
                            fontSize: 11.5,
                            fontWeight: FontWeight.w500,
                            color: colors.onSurfaceMuted,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Switch(
                    key: const Key('professor-cancel-toggle'),
                    value: _toggle,
                    activeTrackColor: AppColors.brand,
                    onChanged: (v) => setState(() => _toggle = v),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                flex: 4,
                child: SizedBox(
                  height: 52,
                  child: OutlinedButton(
                    key: Key(late
                        ? 'professor-cancel-confirm'
                        : 'professor-cancel-keep'),
                    onPressed: late
                        ? (canConfirm ? _confirm : null)
                        : () => Navigator.of(context).pop(),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: late ? colors.live : colors.onSurface,
                      side: BorderSide(
                        color: colors.onSurface.withValues(alpha: 0.16),
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                    ),
                    child: Text(
                      late ? widget.confirmLabel : 'Manter aula',
                      style: AppTypography.soraRegular(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                flex: 5,
                child: SizedBox(
                  height: 52,
                  child: FilledButton(
                    key: Key(late
                        ? 'professor-cancel-alternative'
                        : 'professor-cancel-confirm'),
                    onPressed: late
                        ? () => _confirm(alternative: true)
                        : (canConfirm ? _confirm : null),
                    style: FilledButton.styleFrom(
                      backgroundColor: late ? AppColors.brand : AppColors.live,
                      foregroundColor:
                          late ? const Color(0xFF0A0A0A) : Colors.white,
                      disabledBackgroundColor:
                          AppColors.live.withValues(alpha: 0.35),
                      disabledForegroundColor:
                          Colors.white.withValues(alpha: 0.7),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                    ),
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Text(
                        late
                            ? (widget.alternativeLabel ?? 'Manter aula')
                            : widget.confirmLabel,
                        maxLines: 1,
                        style: AppTypography.soraRegular(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Kicker extends StatelessWidget {
  const _Kicker(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text.toUpperCase(),
      style: AppTypography.mono(
        fontSize: 10,
        letterSpacing: 1.4,
        color: context.themeColors.onSurfaceMuted,
      ),
    );
  }
}

class _ReasonChip extends StatelessWidget {
  const _ReasonChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Semantics(
      button: true,
      selected: selected,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 140),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: selected
                ? AppColors.brand
                : colors.onSurface.withValues(alpha: 0.04),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: selected
                  ? AppColors.brand
                  : colors.onSurface.withValues(alpha: 0.10),
            ),
          ),
          child: Text(
            label,
            style: AppTypography.soraRegular(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: selected ? const Color(0xFF0A0A0A) : colors.onSurface,
            ),
          ),
        ),
      ),
    );
  }
}

class _ImpactRow extends StatelessWidget {
  const _ImpactRow({required this.impact, required this.last});

  final ProfessorCancelImpact impact;
  final bool last;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final valueColor = switch (impact.tone) {
      ProfessorCancelTone.win => colors.win,
      ProfessorCancelTone.live => colors.live,
      ProfessorCancelTone.normal => colors.onSurface,
    };
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12),
      decoration: BoxDecoration(
        border: last
            ? null
            : Border(
                bottom: BorderSide(
                  color: colors.onSurface.withValues(alpha: 0.08),
                ),
              ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  impact.title,
                  style: AppTypography.soraRegular(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w600,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  impact.sub,
                  style: AppTypography.mono(
                    fontSize: 10,
                    color: colors.onSurfaceMuted,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Text(
            impact.value,
            style: AppTypography.soraRegular(
              fontSize: 13.5,
              fontWeight: FontWeight.w700,
              color: valueColor,
            ),
          ),
        ],
      ),
    );
  }
}
