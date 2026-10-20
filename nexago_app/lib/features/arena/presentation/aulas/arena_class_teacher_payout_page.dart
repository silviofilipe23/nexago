import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../core/formatting/app_currency_format.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../data/arena_class_repository.dart';
import '../../domain/arena_access_providers.dart';
import '../../domain/arena_staff_role.dart';
import '../../domain/aulas/arena_class_billing_logic.dart';
import '../../domain/aulas/arena_class_enrollment_providers.dart';
import '../../domain/aulas/arena_class_payout.dart';
import '../../domain/aulas/arena_class_payout_logic.dart';
import '../../domain/aulas/arena_class_payout_providers.dart';
import '../../domain/aulas/arena_class_teacher.dart';
import '../widgets/arena_async_state.dart';
import 'arena_class_payout_sheets.dart';
import 'widgets/arena_class_atoms.dart';
import 'widgets/arena_class_form_atoms.dart';
import 'widgets/arena_class_payout_atoms.dart';

/// Repasse de um professor no mês (tela 15): composição, regra e histórico.
/// O gestor (escreve a agenda E lê o financeiro) fecha o mês com ajuste
/// explicado, registra o pagamento feito por fora e pode desfazer. Quem só lê
/// o financeiro vê tudo sem os botões.
class ArenaClassTeacherPayoutPage extends ConsumerStatefulWidget {
  const ArenaClassTeacherPayoutPage({
    super.key,
    required this.teacherId,
    this.month,
  });

  final String teacherId;

  /// `YYYY-MM` da URL; inválido ou futuro cai no mês padrão.
  final String? month;

  @override
  ConsumerState<ArenaClassTeacherPayoutPage> createState() =>
      _ArenaClassTeacherPayoutPageState();
}

class _ArenaClassTeacherPayoutPageState
    extends ConsumerState<ArenaClassTeacherPayoutPage> {
  late String _month;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    final today = ref.read(arenaClassTodayKeyProvider);
    final raw = widget.month;
    _month = arenaClassIsMonthKey(raw) &&
            raw!.compareTo(arenaClassMonthOf(today)) <= 0
        ? raw
        : arenaClassDefaultPayoutMonth(today);
  }

  @override
  Widget build(BuildContext context) {
    final todayKey = ref.watch(arenaClassTodayKeyProvider);
    final currentMonth = arenaClassMonthOf(todayKey);
    final canManage = ref.watch(arenaClassCanManagePayoutProvider);
    // O cadastro (`classTeachers`) é da agenda: o cargo financeiro lê o
    // repasse mas não o cadastro — a tela vive da prévia e do fechamento.
    final canReadTeachers = ref.watch(arenaCanReadProvider(ArenaArea.agenda));
    final previewAsync = ref.watch(arenaClassPayoutPreviewProvider(_month));
    final closedAsync = ref.watch(arenaClassTeacherPayoutProvider(
        (teacherId: widget.teacherId, month: _month)));
    final history = ref
            .watch(arenaClassTeacherPayoutHistoryProvider(widget.teacherId))
            .valueOrNull ??
        const <ArenaClassPayout>[];
    ArenaClassTeacher? teacher;
    if (canReadTeachers) {
      for (final t in ref.watch(arenaClassTeachersProvider).valueOrNull ??
          const <ArenaClassTeacher>[]) {
        if (t.id == widget.teacherId) teacher = t;
      }
    }

    final previewFigures = previewAsync.valueOrNull?.teacher(widget.teacherId);
    final closed = closedAsync.valueOrNull;
    // Modelo de hoje (cadastro; a prévia carrega o mesmo).
    final currentModel = teacher?.payout ?? previewFigures?.model;
    final currentKnown = teacher != null || previewFigures != null;
    final model = closed?.model ?? currentModel;
    final state = arenaClassPayoutState(
      closed: closed,
      model: model,
      month: _month,
      todayKey: todayKey,
    );
    final name = closed?.teacherName ??
        previewFigures?.teacherName ??
        teacher?.name ??
        (history.isEmpty ? 'Professor' : history.first.teacherName);
    final figures = closed ??
        previewFigures ??
        ArenaClassPayoutFigures(
          teacherId: widget.teacherId,
          teacherName: name,
          teacherColor: teacher?.color ?? '#FF6A1A',
          model: currentModel,
        );

    final loading = (previewAsync.isLoading && !previewAsync.hasValue) ||
        (closedAsync.isLoading && !closedAsync.hasValue);

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        bottom: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ArenaClassHeader(
              eyebrow: 'REPASSE',
              title: name,
              subtitle: '${arenaClassMonthSlashLabel(_month)} · '
                      '${arenaClassPayoutStateText(state, closed)}'
                  .toUpperCase(),
              onBack: () => context.pop(),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 6),
              child: ArenaClassMonthNav(
                month: _month,
                currentMonth: currentMonth,
                onChanged: (m) => setState(() => _month = m),
              ),
            ),
            Expanded(
              child: previewAsync.hasError && !previewAsync.hasValue
                  ? ArenaErrorState(
                      message: '${previewAsync.error}',
                      onRetry: () => ref
                          .invalidate(arenaClassPayoutPreviewProvider(_month)),
                    )
                  : loading
                      ? const ArenaLoadingState(
                          label: 'Calculando o repasse...',
                        )
                      : _body(
                          context,
                          figures: figures,
                          closed: closed,
                          previewFigures: previewFigures,
                          state: state,
                          model: model,
                          modelChanged: closed != null &&
                              currentKnown &&
                              currentModel != closed.model,
                          currentModel: currentModel,
                          teacher: teacher,
                          canManage: canManage,
                          history: history,
                          todayKey: todayKey,
                        ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _body(
    BuildContext context, {
    required ArenaClassPayoutFigures figures,
    required ArenaClassPayout? closed,
    required ArenaClassTeacherPayoutPreview? previewFigures,
    required ArenaClassPayoutState state,
    required ArenaClassTeacherPayoutModel? model,
    required bool modelChanged,
    required ArenaClassTeacherPayoutModel? currentModel,
    required ArenaClassTeacher? teacher,
    required bool canManage,
    required List<ArenaClassPayout> history,
    required String todayKey,
  }) {
    final colors = context.themeColors;
    final stale = arenaClassPayoutIsStale(closed, previewFigures);
    final paid = state == ArenaClassPayoutState.paid;
    final adjustment = closed?.adjustmentReais ?? 0;
    final pending = figures.pendingSessions;
    final nextMonth =
        arenaClassMonthName('${arenaClassShiftMonth(_month, 1)}-01');
    final editModel =
        canManage && teacher != null ? () => _editModel(teacher) : null;

    return ListView(
      padding: EdgeInsets.fromLTRB(
        16,
        8,
        16,
        MediaQuery.paddingOf(context).bottom + 32,
      ),
      children: [
        if (state == ArenaClassPayoutState.partial) ...[
          ArenaClassInfoBanner(
            'Mês em andamento — valores parciais. O fechamento abre em 1º de '
            '$nextMonth.',
          ),
          const SizedBox(height: 12),
        ] else if (stale) ...[
          ArenaClassInfoBanner(
            'A conta de hoje deu ${formatBRL(previewFigures!.amountReais)} — '
            'mudou desde o fechamento (pagamento lançado ou estornado '
            'depois). Recalcule antes de pagar.',
            warn: true,
          ),
          const SizedBox(height: 12),
        ],
        ArenaClassPanel(
          highlight: true,
          padding: const EdgeInsets.fromLTRB(18, 16, 18, 14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ArenaClassKicker(
                paid
                    ? 'Pago'
                    : state == ArenaClassPayoutState.partial
                        ? 'Parcial até hoje'
                        : 'A pagar',
                color: paid ? AppColors.win : AppColors.brandHover,
              ),
              const SizedBox(height: 6),
              FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerLeft,
                child: Text(
                  formatBRL(figures.amountReais),
                  style: AppTypography.soraRegular(
                    fontSize: 34,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -1.2,
                    color: colors.onSurface,
                  ),
                ),
              ),
              const SizedBox(height: 2),
              Text(
                arenaClassPayoutAmountSub(state, closed),
                style: TextStyle(fontSize: 11.5, color: colors.onSurfaceMuted),
              ),
              const SizedBox(height: 12),
              ArenaClassPayoutStatRow(
                stats: [
                  ArenaClassPayoutStat(
                    label: 'Aulas dadas',
                    value: '${figures.classesGiven}',
                    sub: pending > 0
                        ? '$pending sem chamada fechada'
                        : 'chamada fechada',
                  ),
                  ArenaClassPayoutStat(
                    label: 'Receita gerada',
                    value: formatBRL(figures.revenueReais),
                    color: AppColors.win,
                    sub: model?.kind == ArenaClassPayoutModelKind.revenueShare
                        ? 'base do repasse'
                        : 'mensalidades pagas',
                  ),
                  if (adjustment != 0)
                    ArenaClassPayoutStat(
                      label: 'Ajuste',
                      value: arenaClassSignedBrl(adjustment),
                      color: adjustment < 0 ? AppColors.live : AppColors.win,
                      sub: closed?.adjustmentNote,
                    )
                  else
                    ArenaClassPayoutStat(
                      label: 'Alunos',
                      value: '${figures.students}',
                      sub: '${figures.presences} presença'
                          '${figures.presences == 1 ? '' : 's'}',
                    ),
                ],
              ),
            ],
          ),
        ),
        if (canManage)
          ..._actions(state, closed, figures.teacherName, editModel),
        const SizedBox(height: 16),
        _Composition(
          figures: figures,
          closed: closed,
          model: model,
          paid: paid,
          partial: state == ArenaClassPayoutState.partial,
        ),
        const SizedBox(height: 12),
        ArenaClassPanel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  const Expanded(child: ArenaClassKicker('Regra de repasse')),
                  if (editModel != null)
                    GestureDetector(
                      onTap: _busy ? null : editModel,
                      child: const Text(
                        'Alterar',
                        style: TextStyle(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w600,
                          color: AppColors.brand,
                        ),
                      ),
                    ),
                ],
              ),
              for (final (k, v) in arenaClassPayoutRuleFacts(model))
                _FactRow(label: k, value: v),
              if (modelChanged) ...[
                const SizedBox(height: 10),
                Text(
                  'Fechado com o modelo anterior — hoje o cadastro diz '
                  '${arenaClassPayoutModelLabel(currentModel)}. Recalcule '
                  'para aplicar.',
                  style: TextStyle(
                    fontSize: 11.5,
                    height: 1.4,
                    color: colors.pending,
                  ),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 12),
        ArenaClassPanel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const ArenaClassKicker('Histórico'),
              const SizedBox(height: 4),
              if (history.isEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    'Nenhum mês fechado ainda.',
                    style:
                        TextStyle(fontSize: 12.5, color: colors.onSurfaceMuted),
                  ),
                ),
              for (final h in history)
                _HistoryRow(
                  payout: h,
                  current: h.month == _month,
                  onTap: () => setState(() => _month = h.month),
                ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        Text(
          'O pagamento é feito direto ao professor — o app só registra.',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 11.5,
            height: 1.45,
            color: colors.onSurfaceMuted,
          ),
        ),
      ],
    );
  }

  List<Widget> _actions(
    ArenaClassPayoutState state,
    ArenaClassPayout? closed,
    String teacherName,
    VoidCallback? editModel,
  ) {
    final Widget? row = switch (state) {
      ArenaClassPayoutState.noModel => editModel == null
          ? null
          : ArenaClassPrimaryButton(
              label: 'Definir modelo de repasse',
              onPressed: _busy ? null : editModel,
            ),
      ArenaClassPayoutState.toClose => ArenaClassPrimaryButton(
          label: 'Fechar mês',
          onPressed: _busy ? null : () => _close(teacherName, null),
        ),
      ArenaClassPayoutState.closed => Row(
          children: [
            Expanded(
              child: ArenaClassGhostButton(
                label: 'Recalcular',
                icon: Icons.refresh_rounded,
                height: 50,
                onPressed: _busy ? null : () => _close(teacherName, closed),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              flex: 2,
              child: ArenaClassPrimaryButton(
                label: 'Registrar pagamento',
                color: AppColors.win,
                onPressed: _busy ? null : () => _pay(closed!),
              ),
            ),
          ],
        ),
      ArenaClassPayoutState.paid => ArenaClassGhostButton(
          label: 'Desfazer pagamento',
          icon: Icons.undo_rounded,
          height: 46,
          busy: _busy,
          onPressed: () => _undo(closed!),
        ),
      ArenaClassPayoutState.partial => null,
    };
    return row == null ? const [] : [const SizedBox(height: 12), row];
  }

  Future<void> _close(String teacherName, ArenaClassPayout? closed) async {
    // A prévia pode ter mudado desde que a tela abriu (pagamento lançado
    // agora): a folha escuta a prévia refeita.
    ref.invalidate(arenaClassPayoutPreviewProvider(_month));
    final ok = await showArenaClassPayoutCloseSheet(
      context,
      teacherId: widget.teacherId,
      teacherName: teacherName,
      month: _month,
      closed: closed,
    );
    if (ok != true || !mounted) return;
    showAppSnackBar(
      context,
      closed == null
          ? 'Repasse de ${arenaClassMonthName('$_month-01')} fechado.'
          : 'Repasse recalculado.',
    );
  }

  Future<void> _pay(ArenaClassPayout closed) async {
    final ok = await showArenaClassPayoutPaySheet(
      context,
      payout: closed,
      todayKey: ref.read(arenaClassTodayKeyProvider),
    );
    if (ok != true || !mounted) return;
    showAppSnackBar(context, 'Pagamento de ${closed.teacherName} registrado.');
  }

  Future<void> _undo(ArenaClassPayout closed) async {
    final go = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: ctx.themeColors.surfaceSheet,
        title: const Text('Desfazer o pagamento?'),
        content: Text(
          'O repasse de ${arenaClassMonthSlashLabel(closed.month)} volta para '
          '"a pagar". Use quando o pagamento foi registrado por engano.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Voltar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Desfazer'),
          ),
        ],
      ),
    );
    if (go != true || !mounted) return;
    setState(() => _busy = true);
    try {
      await ref
          .read(arenaClassPayoutRepositoryProvider)
          .undoPayoutPayment(closed.id);
      if (!mounted) return;
      showAppSnackBar(
          context,
          'Pagamento desfeito — o repasse voltou para '
          '"a pagar".');
    } on ArenaClassException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } catch (_) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        'Não foi possível desfazer. Tente novamente.',
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _editModel(ArenaClassTeacher teacher) async {
    final ok = await showArenaClassPayoutModelSheet(context, teacher: teacher);
    if (ok != true || !mounted) return;
    ref.invalidate(arenaClassPayoutPreviewProvider);
    showAppSnackBar(context, 'Repasse de ${teacher.name} atualizado.');
  }
}

/// Composição do repasse: uma linha por turma (ou avulsas do mesmo tipo),
/// o ajuste e o total.
class _Composition extends StatelessWidget {
  const _Composition({
    required this.figures,
    required this.closed,
    required this.model,
    required this.paid,
    required this.partial,
  });

  final ArenaClassPayoutFigures figures;
  final ArenaClassPayout? closed;
  final ArenaClassTeacherPayoutModel? model;
  final bool paid;
  final bool partial;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final closedAt = closed?.closedAt;
    final adjustment = closed?.adjustmentReais ?? 0;
    final line = colors.onSurface.withValues(alpha: 0.08);
    final dim = AppTypography.mono(fontSize: 10, color: colors.onSurfaceMuted);

    return ArenaClassPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Expanded(child: ArenaClassKicker('Composição do repasse')),
              Text(
                closedAt != null
                    ? 'fechado em ${closedAt.day.toString().padLeft(2, '0')}/'
                        '${closedAt.month.toString().padLeft(2, '0')}'
                    : closed != null
                        ? 'fechado'
                        : 'prévia de hoje',
                style: dim,
              ),
            ],
          ),
          if (figures.lines.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text(
                'Nenhuma aula com chamada fechada nem mensalidade paga neste '
                'mês.',
                style: TextStyle(fontSize: 12.5, color: colors.onSurfaceMuted),
              ),
            ),
          for (final l in figures.lines)
            Container(
              padding: const EdgeInsets.symmetric(vertical: 11),
              decoration: BoxDecoration(
                border: Border(bottom: BorderSide(color: line)),
              ),
              child: Column(
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
                              l.label,
                              style: AppTypography.soraRegular(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: colors.onSurface,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              l.payingStudents > 0
                                  ? '${l.detail} · ${l.payingStudents} '
                                      'pagante${l.payingStudents == 1 ? '' : 's'}'
                                  : l.detail,
                              style: TextStyle(
                                fontSize: 11.5,
                                color: colors.onSurfaceMuted,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 10),
                      Text(
                        formatBRL(l.amountReais),
                        style: AppTypography.mono(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: colors.onSurface,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 5),
                  Text(
                    '${l.classes} aula${l.classes == 1 ? '' : 's'} · '
                    '${l.presences} presença${l.presences == 1 ? '' : 's'} · '
                    '${formatBRL(l.revenueReais)} receita',
                    style: dim,
                  ),
                ],
              ),
            ),
          if (adjustment != 0)
            Container(
              padding: const EdgeInsets.symmetric(vertical: 11),
              decoration: BoxDecoration(
                border: Border(bottom: BorderSide(color: line)),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Ajuste',
                          style: AppTypography.soraRegular(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: adjustment < 0
                                ? colors.live
                                : colors.onSurface,
                          ),
                        ),
                        if (closed?.adjustmentNote != null) ...[
                          const SizedBox(height: 2),
                          Text(
                            closed!.adjustmentNote!,
                            style: TextStyle(
                              fontSize: 11.5,
                              color: colors.onSurfaceMuted,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(width: 10),
                  Text(
                    arenaClassSignedBrl(adjustment),
                    style: AppTypography.mono(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: adjustment < 0 ? colors.live : colors.win,
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Expanded(
                child: Text(
                  paid
                      ? 'Total pago'
                      : partial
                          ? 'Parcial até hoje'
                          : 'Total a pagar',
                  style: AppTypography.soraRegular(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
              ),
              Text(
                formatBRL(figures.amountReais),
                style: AppTypography.soraRegular(
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                  color: AppColors.brand,
                ),
              ),
            ],
          ),
          if (model != null) ...[
            const SizedBox(height: 4),
            Text(
              '${arenaClassPayoutColumnLabel(model)} · '
              '${arenaClassPayoutBaseLabel(figures)}',
              textAlign: TextAlign.right,
              style: dim,
            ),
          ],
        ],
      ),
    );
  }
}

class _HistoryRow extends StatelessWidget {
  const _HistoryRow({
    required this.payout,
    required this.current,
    required this.onTap,
  });

  final ArenaClassPayout payout;
  final bool current;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final h = payout;
    final label = arenaClassMonthSlashLabel(h.month);
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(
          children: [
            Expanded(
              child: Text(
                '${label[0].toUpperCase()}${label.substring(1)}',
                style: AppTypography.soraRegular(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w600,
                  color: current ? AppColors.brand : colors.onSurface,
                ),
              ),
            ),
            Text(
              h.isPaid
                  ? 'Pago${h.paidOn == null ? '' : ' ${arenaClassShortDate(h.paidOn!)}'}'
                  : 'A pagar',
              style: AppTypography.mono(
                fontSize: 10.5,
                color: h.isPaid ? colors.win : colors.pending,
              ),
            ),
            const SizedBox(width: 12),
            Text(
              formatBRL(h.amountReais),
              style: AppTypography.mono(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: colors.onSurface,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Linha da regra de repasse: rótulos longos ("Aluno com vários
/// professores") quebram em vez de empurrar o valor para fora.
class _FactRow extends StatelessWidget {
  const _FactRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Padding(
      padding: const EdgeInsets.only(top: 9),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            flex: 5,
            child: Text(
              label,
              style: TextStyle(fontSize: 12.5, color: colors.onSurfaceMuted),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            flex: 4,
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: AppTypography.soraRegular(
                fontSize: 12.5,
                fontWeight: FontWeight.w600,
                color: colors.onSurface,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
