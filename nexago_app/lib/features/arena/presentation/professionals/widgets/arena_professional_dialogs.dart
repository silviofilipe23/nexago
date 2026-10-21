import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/professionals/arena_professionals_logic.dart';
import '../../../../professor_links/domain/arena_professor_link.dart';
import '../../../../professor_links/presentation/widgets/professor_links_ui.dart';

/// Confirmações das ações irreversíveis do gestor (copy do portal da arena).
/// Os que aceitam motivo devolvem `(reason: ...)` (vazio = `null`) ou `null`
/// quando o gestor desistiu.

Future<({String? reason})?> confirmRejectArenaProfessorRequest(
  BuildContext context, {
  required String professorName,
}) =>
    showDialog<({String? reason})>(
      context: context,
      builder: (_) => _ReasonDialog(
        title: 'Rejeitar a solicitação de $professorName?',
        body: 'O professor recebe o aviso e pode pedir de novo depois.',
        reasonHint: 'Conte ao professor por que não deu certo',
        confirmLabel: 'Rejeitar',
      ),
    );

Future<({String? reason})?> confirmEndArenaProfessorLink(
  BuildContext context, {
  required String professorName,
}) =>
    showDialog<({String? reason})>(
      context: context,
      builder: (_) => _ReasonDialog(
        title: 'Encerrar o vínculo com $professorName?',
        body: 'As permissões dele nesta arena acabam agora e ele sai da '
            'página pública. O histórico fica guardado e os vínculos com '
            'outras arenas não mudam.',
        reasonHint: 'Motivo do encerramento',
        confirmLabel: 'Encerrar vínculo',
      ),
    );

Future<bool> confirmCancelArenaProfessorInvite(
  BuildContext context, {
  required String professorName,
}) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text('Cancelar o convite para $professorName?'),
      content: const Text(
        'O convite deixa de valer. Você pode convidar de novo quando quiser.',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx, false),
          child: const Text('Voltar'),
        ),
        FilledButton(
          key: const Key('arena-professor-confirm'),
          style: FilledButton.styleFrom(backgroundColor: AppColors.live),
          onPressed: () => Navigator.pop(ctx, true),
          child: const Text('Cancelar convite'),
        ),
      ],
    ),
  );
  return result == true;
}

/// Desconto escolhido no diálogo: % (0 = remover) e a faixa do dia em que
/// vale (`null` nas duas = o dia todo).
typedef ArenaProfessorCourtDiscountChoice = ({
  int percent,
  String? startTime,
  String? endTime,
});

/// Desconto (%) no aluguel de quadra e a faixa do dia em que vale. Devolve
/// `null` quando o gestor desistiu. Vazio = remover (0).
Future<ArenaProfessorCourtDiscountChoice?> askArenaProfessorCourtDiscount(
  BuildContext context, {
  required String professorName,
  required int current,
  String? currentStartTime,
  String? currentEndTime,
}) =>
    showDialog<ArenaProfessorCourtDiscountChoice>(
      context: context,
      builder: (_) => _CourtDiscountDialog(
        professorName: professorName,
        current: current,
        currentStartTime: currentStartTime,
        currentEndTime: currentEndTime,
      ),
    );

class _CourtDiscountDialog extends StatefulWidget {
  const _CourtDiscountDialog({
    required this.professorName,
    required this.current,
    required this.currentStartTime,
    required this.currentEndTime,
  });

  final String professorName;
  final int current;
  final String? currentStartTime;
  final String? currentEndTime;

  @override
  State<_CourtDiscountDialog> createState() => _CourtDiscountDialogState();
}

class _CourtDiscountDialogState extends State<_CourtDiscountDialog> {
  late final _percent = TextEditingController(
    text: widget.current > 0 ? '${widget.current}' : '',
  );
  late final _currentWindow = parseProfessorCourtDiscountWindow(
    widget.currentStartTime,
    widget.currentEndTime,
  );
  late bool _onlyWindow = _currentWindow != null;
  late String _startTime = _currentWindow?.startTime ?? '08:00';
  late String _endTime = _currentWindow?.endTime ?? '17:00';
  String? _error;
  String? _windowError;

  @override
  void dispose() {
    _percent.dispose();
    super.dispose();
  }

  void _save() {
    final value = parseArenaProfessorCourtDiscountInput(_percent.text);
    if (value == null) {
      setState(() => _error = 'Use um número inteiro de 0 a 90.');
      return;
    }
    // Sem desconto, a faixa não importa: o servidor apaga.
    if (value == 0 || !_onlyWindow) {
      Navigator.pop(context, (percent: value, startTime: null, endTime: null));
      return;
    }
    final windowError =
        arenaProfessorCourtDiscountWindowError(_startTime, _endTime);
    if (windowError != null) {
      setState(() => _windowError = windowError);
      return;
    }
    Navigator.pop(
      context,
      (percent: value, startTime: _startTime, endTime: _endTime),
    );
  }

  Future<void> _pickTime({required bool isEnd}) async {
    final current = isEnd ? _endTime : _startTime;
    final minutes = professorCourtDiscountTimeToMinutes(current) ?? 0;
    final picked = await showTimePicker(
      context: context,
      initialTime: TimeOfDay(hour: (minutes ~/ 60) % 24, minute: minutes % 60),
      helpText: isEnd ? 'Fim do desconto' : 'Início do desconto',
      builder: (ctx, child) => MediaQuery(
        data: MediaQuery.of(ctx).copyWith(alwaysUse24HourFormat: true),
        child: child ?? const SizedBox.shrink(),
      ),
    );
    if (picked == null || !mounted) return;
    final value = arenaProfessorCourtDiscountTimeValue(
      picked.hour,
      picked.minute,
      isEnd: isEnd,
    );
    setState(() {
      if (isEnd) {
        _endTime = value;
      } else {
        _startTime = value;
      }
      _windowError = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return AlertDialog(
      title: const Text('Desconto no aluguel de quadra'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Vale quando ${widget.professorName} reservar quadra como '
              'professor. Deixe vazio ou 0 para remover.',
            ),
            const SizedBox(height: 14),
            TextField(
              key: const Key('arena-professor-court-discount-input'),
              controller: _percent,
              autofocus: true,
              keyboardType: TextInputType.number,
              inputFormatters: [
                FilteringTextInputFormatter.digitsOnly,
                LengthLimitingTextInputFormatter(2),
              ],
              onSubmitted: (_) => _save(),
              onChanged: (_) {
                if (_error != null) setState(() => _error = null);
              },
              style: AppTypography.bodyM.copyWith(color: colors.onSurface),
              decoration: InputDecoration(
                labelText: 'Desconto (%)',
                hintText: '0 a 90',
                suffixText: '%',
                errorText: _error,
                hintStyle: AppTypography.bodyS.copyWith(
                  color: ProfessorLinksStyle.dim(colors),
                ),
              ),
            ),
            const SizedBox(height: 16),
            const ProfessorLinksKicker('Vale em'),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                ChoiceChip(
                  key: const Key('arena-professor-court-discount-all-day'),
                  label: const Text('O dia todo'),
                  selected: !_onlyWindow,
                  onSelected: (_) => setState(() {
                    _onlyWindow = false;
                    _windowError = null;
                  }),
                ),
                ChoiceChip(
                  key: const Key('arena-professor-court-discount-window'),
                  label: const Text('Só em um horário'),
                  selected: _onlyWindow,
                  onSelected: (_) => setState(() => _onlyWindow = true),
                ),
              ],
            ),
            if (_onlyWindow) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: _TimeField(
                      key: const Key('arena-professor-court-discount-start'),
                      label: 'Início',
                      value: _startTime,
                      onTap: () => _pickTime(isEnd: false),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _TimeField(
                      key: const Key('arena-professor-court-discount-end'),
                      label: 'Fim',
                      value: _endTime,
                      onTap: () => _pickTime(isEnd: true),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                _windowError ??
                    'Só os horários inteiros dentro da faixa têm desconto.',
                key: const Key('arena-professor-court-discount-window-hint'),
                style: AppTypography.bodyS.copyWith(
                  fontSize: 11.5,
                  color: _windowError != null
                      ? AppColors.live
                      : ProfessorLinksStyle.dim(colors),
                ),
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Voltar'),
        ),
        FilledButton(
          key: const Key('arena-professor-court-discount-save'),
          style: FilledButton.styleFrom(backgroundColor: AppColors.brand),
          onPressed: _save,
          child: const Text('Salvar'),
        ),
      ],
    );
  }
}

/// Campo de horário (abre o seletor 24h).
class _TimeField extends StatelessWidget {
  const _TimeField({
    super.key,
    required this.label,
    required this.value,
    required this.onTap,
  });

  final String label;
  final String value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: label,
          suffixIcon: const Icon(Icons.schedule_rounded, size: 18),
        ),
        child: Text(
          value,
          style: AppTypography.bodyM.copyWith(color: colors.onSurface),
        ),
      ),
    );
  }
}

class _ReasonDialog extends StatefulWidget {
  const _ReasonDialog({
    required this.title,
    required this.body,
    required this.reasonHint,
    required this.confirmLabel,
  });

  final String title;
  final String body;
  final String reasonHint;
  final String confirmLabel;

  @override
  State<_ReasonDialog> createState() => _ReasonDialogState();
}

class _ReasonDialogState extends State<_ReasonDialog> {
  final _reason = TextEditingController();

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return AlertDialog(
      title: Text(widget.title),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(widget.body),
            const SizedBox(height: 14),
            TextField(
              key: const Key('arena-professor-reason'),
              controller: _reason,
              maxLength: 300,
              maxLines: 3,
              minLines: 2,
              textCapitalization: TextCapitalization.sentences,
              style: AppTypography.bodyM.copyWith(color: colors.onSurface),
              decoration: InputDecoration(
                labelText: 'Motivo (opcional)',
                hintText: widget.reasonHint,
                hintStyle: AppTypography.bodyS.copyWith(
                  color: ProfessorLinksStyle.dim(colors),
                ),
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Voltar'),
        ),
        FilledButton(
          key: const Key('arena-professor-confirm'),
          style: FilledButton.styleFrom(backgroundColor: AppColors.live),
          onPressed: () {
            final text = _reason.text.trim();
            Navigator.pop(context, (reason: text.isEmpty ? null : text));
          },
          child: Text(widget.confirmLabel),
        ),
      ],
    );
  }
}
