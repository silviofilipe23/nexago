import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../core/formatting/app_currency_format.dart';
import '../../data/arena_class_repository.dart';
import '../../domain/arena_schedule_providers.dart';
import '../../domain/aulas/arena_class_billing_logic.dart';
import '../../domain/aulas/arena_class_payout.dart';
import '../../domain/aulas/arena_class_payout_logic.dart';
import '../../domain/aulas/arena_class_payout_providers.dart';
import '../../domain/aulas/arena_class_teacher.dart';
import 'widgets/arena_class_form_atoms.dart';

// Folhas do repasse do professor (fase 2b): modelo no cadastro, fechar o mês
// (com ajuste explicado) e registrar o pagamento feito por fora. Todas
// devolvem `true` quando gravaram.

Future<bool?> _showSheet(BuildContext context, Widget child) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: context.themeColors.surfaceSheet,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(26)),
    ),
    builder: (_) => child,
  );
}

String _errorText(Object e) => e is ArenaClassException
    ? e.message
    : 'Não foi possível concluir. Tente novamente.';

Widget _hint(BuildContext context, String text) => Text(
      text,
      style: TextStyle(
        fontSize: 11.5,
        height: 1.45,
        color: context.themeColors.onSurfaceMuted,
      ),
    );

Widget _errorLine(String text) => Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Text(
        text,
        style: const TextStyle(
          color: AppColors.live,
          fontWeight: FontWeight.w600,
          fontSize: 12.5,
        ),
      ),
    );

/// Padding da folha com o teclado aberto.
EdgeInsets _sheetPadding(BuildContext context) => EdgeInsets.fromLTRB(
      16,
      10,
      16,
      20 + MediaQuery.viewInsetsOf(context).bottom,
    );

// ---------------------------------------------------------------------------
// Modelo de repasse (só o gestor)
// ---------------------------------------------------------------------------

/// Modelo de repasse do [teacher] — `upsertArenaClassTeacher` com `payout`.
Future<bool?> showArenaClassPayoutModelSheet(
  BuildContext context, {
  required ArenaClassTeacher teacher,
}) {
  return _showSheet(context, _PayoutModelSheet(teacher: teacher));
}

class _PayoutModelSheet extends ConsumerStatefulWidget {
  const _PayoutModelSheet({required this.teacher});

  final ArenaClassTeacher teacher;

  @override
  ConsumerState<_PayoutModelSheet> createState() => _PayoutModelSheetState();
}

class _PayoutModelSheetState extends ConsumerState<_PayoutModelSheet> {
  late final ArenaClassTeacherPayoutModel _initial =
      widget.teacher.payout ?? ArenaClassTeacherPayoutModel.defaults;
  late ArenaClassPayoutModelKind _kind = _initial.kind;
  late final TextEditingController _value =
      TextEditingController(text: arenaClassPayoutDraftValue(_initial));
  bool _sending = false;
  String? _error;

  @override
  void dispose() {
    _value.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final draft = arenaClassPayoutModelFromDraft(_kind, _value.text);
    final arenaId = ref.read(managedArenaIdProvider).valueOrNull ?? '';
    if (draft.model == null) {
      setState(() => _error = draft.error);
      return;
    }
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await ref.read(arenaClassPayoutRepositoryProvider).saveTeacherPayout(
            arenaId: arenaId,
            teacher: widget.teacher,
            payout: draft.model!,
          );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        _error = _errorText(e);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final share = _kind == ArenaClassPayoutModelKind.revenueShare;
    final affix = AppTypography.mono(
      fontSize: 11,
      color: colors.onSurfaceMuted,
    );
    return SingleChildScrollView(
      padding: _sheetPadding(context),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          ArenaClassSheetHeader(
            title: 'Repasse do professor',
            subtitle: widget.teacher.name,
            onClose: _sending ? () {} : null,
          ),
          const SizedBox(height: 14),
          const ArenaClassKicker('Modelo'),
          for (final k in ArenaClassPayoutModelKind.values) ...[
            const SizedBox(height: 8),
            ArenaClassChoiceCard(
              title: k.label,
              subtitle: switch (k) {
                ArenaClassPayoutModelKind.revenueShare =>
                  'Percentual das mensalidades pagas no mês',
                ArenaClassPayoutModelKind.perClass =>
                  'Valor fixo por aula com a chamada fechada',
                ArenaClassPayoutModelKind.perStudent =>
                  'Valor por aluno presente na chamada',
              },
              selected: k == _kind,
              onTap: _sending ? null : () => setState(() => _kind = k),
            ),
          ],
          const SizedBox(height: 14),
          ArenaClassKicker(share ? 'Percentual' : 'Valor'),
          const SizedBox(height: 8),
          Row(
            children: [
              if (!share) ...[
                Text('R\$', style: affix),
                const SizedBox(width: 8),
              ],
              SizedBox(
                width: 110,
                child: TextField(
                  controller: _value,
                  enabled: !_sending,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  style: AppTypography.mono(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                  decoration: arenaClassInputDecoration(
                    context,
                    hint: share ? '50' : '45',
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  switch (_kind) {
                    ArenaClassPayoutModelKind.revenueShare =>
                      '% das mensalidades pagas',
                    ArenaClassPayoutModelKind.perClass => 'por aula dada',
                    ArenaClassPayoutModelKind.perStudent =>
                      'por aluno presente',
                  },
                  style: affix,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          _hint(
            context,
            'Receita de aluno com horários de professores diferentes é '
            'rateada pelos horários. A taxa de matrícula fica com a arena. O '
            'pagamento ao professor é feito por fora — o app só registra.',
          ),
          if (_error != null) _errorLine(_error!),
          const SizedBox(height: 14),
          ArenaClassPrimaryButton(
            label: 'Salvar repasse',
            busy: _sending,
            onPressed: _submit,
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Fechar / recalcular o mês
// ---------------------------------------------------------------------------

/// Fecha (ou recalcula) o repasse do [teacherId] no [month]. O valor
/// calculado vem da prévia do servidor — a folha escuta a prévia do mês, que
/// a tela atualiza antes de abrir.
Future<bool?> showArenaClassPayoutCloseSheet(
  BuildContext context, {
  required String teacherId,
  required String teacherName,
  required String month,
  ArenaClassPayout? closed,
}) {
  return _showSheet(
    context,
    _CloseSheet(
      teacherId: teacherId,
      teacherName: teacherName,
      month: month,
      closed: closed,
    ),
  );
}

class _CloseSheet extends ConsumerStatefulWidget {
  const _CloseSheet({
    required this.teacherId,
    required this.teacherName,
    required this.month,
    required this.closed,
  });

  final String teacherId;
  final String teacherName;
  final String month;
  final ArenaClassPayout? closed;

  @override
  ConsumerState<_CloseSheet> createState() => _CloseSheetState();
}

class _CloseSheetState extends ConsumerState<_CloseSheet> {
  late final TextEditingController _adjustment = TextEditingController(
    text: (widget.closed?.adjustmentReais ?? 0) == 0
        ? ''
        : arenaClassDecimalText(widget.closed!.adjustmentReais),
  );
  late final TextEditingController _note =
      TextEditingController(text: widget.closed?.adjustmentNote ?? '');
  bool _sending = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _adjustment.addListener(_refresh);
  }

  void _refresh() => setState(() {});

  @override
  void dispose() {
    _adjustment.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final raw = _adjustment.text.trim();
    final adjustment = raw.isEmpty ? 0.0 : arenaClassParseDecimal(raw);
    if (adjustment == null) {
      setState(() => _error = 'Ajuste inválido.');
      return;
    }
    if (adjustment != 0 && _note.text.trim().isEmpty) {
      setState(() =>
          _error = 'Explique o ajuste (ex.: aula cancelada pelo professor).');
      return;
    }
    final arenaId = ref.read(managedArenaIdProvider).valueOrNull ?? '';
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await ref.read(arenaClassPayoutRepositoryProvider).closePayout(
            arenaId: arenaId,
            teacherId: widget.teacherId,
            month: widget.month,
            adjustmentReais: adjustment,
            adjustmentNote: adjustment == 0 ? null : _note.text,
          );
      ref.invalidate(arenaClassPayoutPreviewProvider(widget.month));
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        _error = _errorText(e);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final previewAsync =
        ref.watch(arenaClassPayoutPreviewProvider(widget.month));
    final figures = previewAsync.valueOrNull?.teacher(widget.teacherId);
    final computed = figures?.amountReais;
    final total = computed == null
        ? null
        : arenaClassPayoutCloseTotal(computed, _adjustment.text);
    final recalc = widget.closed != null;
    final monthLabel = arenaClassMonthSlashLabel(widget.month);
    final modelLabel = arenaClassPayoutModelLabel(figures?.model);

    return SingleChildScrollView(
      padding: _sheetPadding(context),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          ArenaClassSheetHeader(
            title: recalc ? 'Recalcular o repasse' : 'Fechar o repasse',
            subtitle: '${widget.teacherName} · $monthLabel',
            onClose: _sending ? () {} : null,
          ),
          const SizedBox(height: 12),
          ArenaClassInfoRow(label: 'Modelo', value: modelLabel),
          ArenaClassInfoRow(
            label: 'Calculado hoje',
            value: previewAsync.isLoading
                ? 'calculando…'
                : computed == null
                    ? '—'
                    : formatBRL(computed),
          ),
          if ((figures?.pendingSessions ?? 0) > 0) ...[
            const SizedBox(height: 12),
            Text(
              '${figures!.pendingSessions} aula(s) do mês estão com a chamada '
              'aberta e não entram. Feche a chamada antes, se for o caso.',
              style: const TextStyle(
                fontSize: 12,
                height: 1.4,
                color: AppColors.pending,
              ),
            ),
          ],
          const SizedBox(height: 14),
          const ArenaClassKicker('Ajuste (R\$, negativo desconta)'),
          const SizedBox(height: 8),
          TextField(
            controller: _adjustment,
            enabled: !_sending,
            keyboardType: const TextInputType.numberWithOptions(
              decimal: true,
              signed: true,
            ),
            style: AppTypography.mono(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: colors.onSurface,
            ),
            decoration: arenaClassInputDecoration(context, hint: '0'),
          ),
          const SizedBox(height: 12),
          const ArenaClassKicker('Motivo do ajuste'),
          const SizedBox(height: 8),
          TextField(
            controller: _note,
            enabled: !_sending,
            maxLength: 200,
            textCapitalization: TextCapitalization.sentences,
            decoration: arenaClassInputDecoration(
              context,
              hint: 'Ex.: aula de 08/10 sem substituto',
            ),
          ),
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.only(top: 12),
            decoration: BoxDecoration(
              border: Border(
                top: BorderSide(color: colors.onSurface.withValues(alpha: 0.1)),
              ),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.baseline,
              textBaseline: TextBaseline.alphabetic,
              children: [
                Expanded(
                  child: Text(
                    'Total do fechamento',
                    style: AppTypography.soraRegular(
                      fontSize: 13.5,
                      fontWeight: FontWeight.w700,
                      color: colors.onSurface,
                    ),
                  ),
                ),
                Text(
                  total == null ? '—' : formatBRL(total),
                  style: AppTypography.soraRegular(
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                    color: AppColors.brand,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          _hint(
            context,
            'O fechamento grava um retrato do mês. Até registrar o pagamento, '
            'dá para recalcular.',
          ),
          if (_error != null) _errorLine(_error!),
          const SizedBox(height: 14),
          ArenaClassPrimaryButton(
            label: recalc ? 'Recalcular' : 'Fechar mês',
            busy: _sending,
            onPressed: computed == null || total == null ? null : _submit,
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Registrar pagamento
// ---------------------------------------------------------------------------

/// Registra o pagamento do repasse feito direto ao professor.
Future<bool?> showArenaClassPayoutPaySheet(
  BuildContext context, {
  required ArenaClassPayout payout,
  required String todayKey,
}) {
  return _showSheet(
    context,
    _PaySheet(payout: payout, todayKey: todayKey),
  );
}

class _PaySheet extends ConsumerStatefulWidget {
  const _PaySheet({required this.payout, required this.todayKey});

  final ArenaClassPayout payout;
  final String todayKey;

  @override
  ConsumerState<_PaySheet> createState() => _PaySheetState();
}

class _PaySheetState extends ConsumerState<_PaySheet> {
  ArenaClassPayoutMethod _method = ArenaClassPayoutMethod.pix;
  late String _paidOn = widget.todayKey;
  bool _sending = false;
  String? _error;

  Future<void> _pickDate() async {
    final today = DateTime.parse(widget.todayKey);
    final first = DateTime.parse('${widget.payout.month}-01');
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime.parse(_paidOn),
      firstDate: first.isAfter(today) ? today : first,
      lastDate: today,
      helpText: 'Data do pagamento',
    );
    if (picked == null || !mounted) return;
    setState(() => _paidOn = '${picked.year.toString().padLeft(4, '0')}-'
        '${picked.month.toString().padLeft(2, '0')}-'
        '${picked.day.toString().padLeft(2, '0')}');
  }

  Future<void> _submit() async {
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await ref.read(arenaClassPayoutRepositoryProvider).markPayoutPaid(
            payoutId: widget.payout.id,
            method: _method,
            paidOn: _paidOn,
          );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        _error = _errorText(e);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final p = widget.payout;
    final isToday = _paidOn == widget.todayKey;
    return SingleChildScrollView(
      padding: _sheetPadding(context),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          ArenaClassSheetHeader(
            title: 'Registrar pagamento',
            subtitle: '${p.teacherName} · repasse de '
                '${arenaClassMonthSlashLabel(p.month)} · '
                '${formatBRL(p.amountReais)}',
            onClose: _sending ? () {} : null,
          ),
          const SizedBox(height: 14),
          const ArenaClassKicker('Como foi pago'),
          for (final m in ArenaClassPayoutMethod.values) ...[
            const SizedBox(height: 8),
            ArenaClassChoiceCard(
              title: m.label,
              selected: m == _method,
              onTap: _sending ? null : () => setState(() => _method = m),
            ),
          ],
          const SizedBox(height: 14),
          const ArenaClassKicker('Data do pagamento'),
          const SizedBox(height: 8),
          Material(
            color: colors.surfaceRaised,
            borderRadius: BorderRadius.circular(13),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: _sending ? null : _pickDate,
              child: Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 13, vertical: 13),
                child: Row(
                  children: [
                    Icon(
                      Icons.event_rounded,
                      size: 18,
                      color: colors.onSurfaceMuted,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        isToday
                            ? 'Hoje · ${arenaClassShortDate(_paidOn)}'
                            : arenaClassShortDate(_paidOn),
                        style: TextStyle(
                          fontSize: 13.5,
                          fontWeight: FontWeight.w600,
                          color: colors.onSurface,
                        ),
                      ),
                    ),
                    Text(
                      'Alterar',
                      style: TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                        color: AppColors.brand,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 12),
          _hint(
            context,
            'O pagamento é feito direto ao professor — o app só registra.',
          ),
          if (_error != null) _errorLine(_error!),
          const SizedBox(height: 14),
          ArenaClassPrimaryButton(
            label: 'Confirmar pagamento',
            busy: _sending,
            color: AppColors.win,
            onPressed: _submit,
          ),
        ],
      ),
    );
  }
}
