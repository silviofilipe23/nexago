import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../athlete/domain/agenda/class_story_tag.dart';
import '../../domain/professor_class_story.dart';

/// G1b · Novo bloco — folha de baixo do "Treino encerrado": duração (− / +
/// e atalhos), o que foi feito (com sugestões dos blocos mais usados), a
/// prévia no story e "Adicionar outro" / "Adicionar bloco". Cada bloco sai
/// por [onAdd] na hora — "Adicionar outro" deixa a folha aberta.
Future<void> showProfessorPlanBlockSheet(
  BuildContext context, {
  required int totalMinutes,
  required List<ClassStoryPlanBlock> plan,
  required List<ClassStoryBlockSuggestion> suggestions,
  required bool suggestionsFromHistory,
  required ValueChanged<ClassStoryPlanBlock> onAdd,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    backgroundColor: context.themeColors.surfaceSheet,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (_) => ProfessorPlanBlockSheet(
      totalMinutes: totalMinutes,
      usedMinutes: classStoryPlanMinutes(plan),
      count: plan.length,
      suggestions: suggestions,
      suggestionsFromHistory: suggestionsFromHistory,
      onAdd: onAdd,
    ),
  );
}

class ProfessorPlanBlockSheet extends StatefulWidget {
  const ProfessorPlanBlockSheet({
    super.key,
    required this.totalMinutes,
    required this.usedMinutes,
    required this.count,
    required this.suggestions,
    required this.suggestionsFromHistory,
    required this.onAdd,
  });

  /// Duração da aula (o "60" de "Restam 30 min dos 60").
  final int totalMinutes;
  final int usedMinutes;

  /// Blocos que o plano já tem (a arte cabe [kClassStoryPlanMaxBlocks]).
  final int count;
  final List<ClassStoryBlockSuggestion> suggestions;
  final bool suggestionsFromHistory;
  final ValueChanged<ClassStoryPlanBlock> onAdd;

  static const List<int> quickMinutes = [5, 10, 15, 20];
  static const int step = 5;
  static const int maxMinutes = 120;

  @override
  State<ProfessorPlanBlockSheet> createState() =>
      _ProfessorPlanBlockSheetState();
}

class _ProfessorPlanBlockSheetState extends State<ProfessorPlanBlockSheet> {
  final _label = TextEditingController();
  final _focus = FocusNode();
  int _minutes = 10;
  late int _used = widget.usedMinutes;
  late int _count = widget.count;

  @override
  void dispose() {
    _label.dispose();
    _focus.dispose();
    super.dispose();
  }

  String get _text => _label.text.trim();
  bool get _canAdd => _text.isNotEmpty && _count < kClassStoryPlanMaxBlocks;

  /// Sobra vaga para mais um depois deste.
  bool get _canAddAnother => _canAdd && _count + 1 < kClassStoryPlanMaxBlocks;

  void _setMinutes(int m) =>
      setState(() => _minutes = m.clamp(1, ProfessorPlanBlockSheet.maxMinutes));

  void _step(int dir) {
    const s = ProfessorPlanBlockSheet.step;
    // Fora do passo, o primeiro toque encaixa no múltiplo de 5.
    final next = dir > 0 ? (_minutes ~/ s + 1) * s : ((_minutes - 1) ~/ s) * s;
    _setMinutes(next < 1 ? 1 : next);
  }

  void _pick(ClassStoryBlockSuggestion s) {
    _label.value = TextEditingValue(
      text: s.label,
      selection: TextSelection.collapsed(offset: s.label.length),
    );
    setState(() => _minutes = s.minutes.clamp(
          1,
          ProfessorPlanBlockSheet.maxMinutes,
        ));
  }

  void _add({required bool close}) {
    if (!_canAdd) return;
    widget.onAdd(ClassStoryPlanBlock(minutes: _minutes, label: _text));
    if (close) {
      Navigator.of(context).pop();
      return;
    }
    setState(() {
      _used += _minutes;
      _count += 1;
      _label.clear();
    });
    _focus.requestFocus();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final left = widget.totalMinutes - _used;
    final over = left < 0;

    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Novo bloco',
                        style: AppTypography.soraRegular(
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                          color: colors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text.rich(
                        key: const Key('professor-plan-block-left'),
                        TextSpan(
                          children: [
                            TextSpan(text: over ? 'Passou ' : 'Restam '),
                            TextSpan(
                              text: '${left.abs()} min',
                              style: TextStyle(
                                fontWeight: FontWeight.w700,
                                color: over ? colors.live : colors.onSurface,
                              ),
                            ),
                            TextSpan(
                              text: ' dos ${widget.totalMinutes} do treino',
                            ),
                          ],
                        ),
                        style: AppTypography.soraRegular(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w500,
                          color: colors.onSurfaceMuted,
                        ),
                      ),
                    ],
                  ),
                ),
                _SquareButton(
                  key: const Key('professor-plan-block-close'),
                  icon: Icons.close_rounded,
                  label: 'Fechar',
                  onTap: () => Navigator.of(context).pop(),
                ),
              ],
            ),
            const SizedBox(height: 18),
            const _Kicker('Duração'),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  flex: 3,
                  child: _Box(
                    child: Row(
                      children: [
                        _StepButton(
                          key: const Key('professor-plan-block-minus'),
                          icon: Icons.remove_rounded,
                          label: 'Menos 5 minutos',
                          onTap: _minutes > 1 ? () => _step(-1) : null,
                        ),
                        Expanded(
                          child: Text(
                            '$_minutes′',
                            key: const Key('professor-plan-block-minutes'),
                            textAlign: TextAlign.center,
                            maxLines: 1,
                            softWrap: false,
                            style: AppTypography.soraRegular(
                              fontSize: 20,
                              fontWeight: FontWeight.w800,
                              color: colors.onSurface,
                            ),
                          ),
                        ),
                        _StepButton(
                          key: const Key('professor-plan-block-plus'),
                          icon: Icons.add_rounded,
                          label: 'Mais 5 minutos',
                          onTap: _minutes < ProfessorPlanBlockSheet.maxMinutes
                              ? () => _step(1)
                              : null,
                        ),
                      ],
                    ),
                  ),
                ),
                for (final m in ProfessorPlanBlockSheet.quickMinutes) ...[
                  const SizedBox(width: 8),
                  Expanded(
                    child: _QuickChip(
                      key: Key('professor-plan-block-quick-$m'),
                      label: '$m',
                      selected: _minutes == m,
                      onTap: () => _setMinutes(m),
                    ),
                  ),
                ],
              ],
            ),
            const SizedBox(height: 18),
            Row(
              children: [
                const Expanded(child: _Kicker('O que foi feito')),
                ValueListenableBuilder(
                  valueListenable: _label,
                  builder: (_, value, __) => Text(
                    '${value.text.length}/$kClassStoryPlanLabelMax',
                    key: const Key('professor-plan-block-counter'),
                    style: AppTypography.mono(
                      fontSize: 10,
                      color: colors.onSurfaceMuted,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            TextField(
              key: const Key('professor-plan-block-label'),
              controller: _label,
              focusNode: _focus,
              autofocus: true,
              textCapitalization: TextCapitalization.sentences,
              textInputAction: TextInputAction.done,
              inputFormatters: [
                LengthLimitingTextInputFormatter(kClassStoryPlanLabelMax),
              ],
              onChanged: (_) => setState(() {}),
              onSubmitted: (_) => _add(close: true),
              style: AppTypography.soraRegular(
                fontSize: 15,
                fontWeight: FontWeight.w600,
                color: colors.onSurface,
              ),
              cursorColor: AppColors.brand,
              decoration: InputDecoration(
                hintText: 'Ex.: saque cruzado',
                hintStyle: AppTypography.soraRegular(
                  fontSize: 15,
                  fontWeight: FontWeight.w500,
                  color: colors.onSurface.withValues(alpha: 0.35),
                ),
                filled: true,
                fillColor: colors.onSurface.withValues(alpha: 0.04),
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 16,
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: BorderSide(
                    color: colors.onSurface.withValues(alpha: 0.12),
                  ),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: const BorderSide(color: AppColors.brand),
                ),
              ),
            ),
            if (widget.suggestions.isNotEmpty) ...[
              const SizedBox(height: 18),
              _Kicker(widget.suggestionsFromHistory
                  ? 'Sugestões · seus blocos mais usados'
                  : 'Sugestões'),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final s in widget.suggestions)
                    _SuggestionChip(
                      key: Key('professor-plan-block-suggestion-${s.label}'),
                      suggestion: s,
                      selected: _text.toLowerCase() == s.label.toLowerCase(),
                      onTap: () => _pick(s),
                    ),
                ],
              ),
            ],
            const SizedBox(height: 16),
            _Box(
              key: const Key('professor-plan-block-preview'),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              child: Row(
                children: [
                  SizedBox(
                    width: 38,
                    child: Text(
                      '$_minutes′',
                      style: AppTypography.mono(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: colors.brandText,
                      ),
                    ),
                  ),
                  Expanded(
                    child: Text(
                      _text.isEmpty ? 'O que foi feito' : _text,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.soraRegular(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        color: _text.isEmpty
                            ? colors.onSurface.withValues(alpha: 0.35)
                            : colors.onSurface,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'PRÉVIA NO STORY',
                    style: AppTypography.mono(
                      fontSize: 9,
                      letterSpacing: 1,
                      color: colors.onSurfaceMuted,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: SizedBox(
                    height: 52,
                    child: OutlinedButton(
                      key: const Key('professor-plan-block-another'),
                      onPressed:
                          _canAddAnother ? () => _add(close: false) : null,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: colors.onSurface,
                        side: BorderSide(
                          color: colors.onSurface.withValues(alpha: 0.16),
                        ),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16),
                        ),
                      ),
                      child: Text(
                        'Adicionar outro',
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
                  child: SizedBox(
                    height: 52,
                    child: FilledButton(
                      key: const Key('professor-plan-block-save'),
                      onPressed: _canAdd ? () => _add(close: true) : null,
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.brand,
                        foregroundColor: const Color(0xFF0A0A0A),
                        disabledBackgroundColor:
                            AppColors.brand.withValues(alpha: 0.4),
                        disabledForegroundColor:
                            const Color(0xFF0A0A0A).withValues(alpha: 0.6),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16),
                        ),
                      ),
                      child: Text(
                        'Adicionar bloco',
                        style: AppTypography.soraRegular(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
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

class _Box extends StatelessWidget {
  const _Box({super.key, required this.child, this.padding});

  final Widget child;
  final EdgeInsets? padding;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: colors.onSurface.withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: colors.onSurface.withValues(alpha: 0.10)),
      ),
      child: child,
    );
  }
}

class _StepButton extends StatelessWidget {
  const _StepButton({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Semantics(
      button: true,
      label: label,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: SizedBox(
          width: 36,
          height: 50,
          child: Icon(
            icon,
            size: 18,
            color: onTap == null
                ? colors.onSurface.withValues(alpha: 0.25)
                : colors.onSurface.withValues(alpha: 0.72),
          ),
        ),
      ),
    );
  }
}

class _QuickChip extends StatelessWidget {
  const _QuickChip({
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
      label: '$label minutos',
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 140),
          height: 52,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: selected
                ? AppColors.brand.withValues(alpha: 0.12)
                : colors.onSurface.withValues(alpha: 0.04),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: selected
                  ? AppColors.brand
                  : colors.onSurface.withValues(alpha: 0.10),
            ),
          ),
          child: Text(
            label,
            style: AppTypography.mono(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: selected ? colors.brandText : colors.onSurface,
            ),
          ),
        ),
      ),
    );
  }
}

class _SuggestionChip extends StatelessWidget {
  const _SuggestionChip({
    super.key,
    required this.suggestion,
    required this.selected,
    required this.onTap,
  });

  final ClassStoryBlockSuggestion suggestion;
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
          padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 10),
          decoration: BoxDecoration(
            color: selected
                ? AppColors.brand.withValues(alpha: 0.12)
                : colors.onSurface.withValues(alpha: 0.03),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: selected
                  ? AppColors.brand
                  : colors.onSurface.withValues(alpha: 0.10),
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Flexible(
                child: Text(
                  suggestion.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.soraRegular(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: selected ? colors.brandText : colors.onSurface,
                  ),
                ),
              ),
              if (suggestion.tag.isNotEmpty) ...[
                const SizedBox(width: 6),
                Text(
                  suggestion.tag,
                  style: AppTypography.mono(
                    fontSize: 8.5,
                    letterSpacing: 0.8,
                    color: colors.onSurfaceMuted,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _SquareButton extends StatelessWidget {
  const _SquareButton({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Semantics(
      button: true,
      label: label,
      child: Material(
        color: colors.onSurface.withValues(alpha: 0.05),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(color: colors.onSurface.withValues(alpha: 0.10)),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: SizedBox(
            width: 44,
            height: 44,
            child: Icon(icon, size: 20, color: colors.onSurface),
          ),
        ),
      ),
    );
  }
}
