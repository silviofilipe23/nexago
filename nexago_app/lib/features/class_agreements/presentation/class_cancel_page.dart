import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/friendly_error_message.dart';
import '../../../core/formatting/app_currency_format.dart';
import '../../../core/layout/nexa_app_bar.dart';
import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart' show showAppSnackBar;
import '../../../core/ui/nexa_bottom_action_bar.dart';
import '../../athlete_training/application/athlete_training_providers.dart'
    show athleteTrainingPlansProvider;
import '../../schedule_plans/presentation/widgets/schedule_plan_ui.dart';
import '../application/class_agreements_providers.dart';
import '../domain/class_agreements.dart';
import 'class_signup_payment_view.dart';

/// Cancelar plano de aula (canvas "Cancelar plano de aula · aviso prévio e
/// multa", 02–05): motivo e outras saídas → como fica (última aula, fidelidade
/// e multa) → pagar a multa (se houver, online) → cancelamento agendado.
/// Cancelar vale na hora; a multa vira cobrança e não pagar não desfaz.
class ClassCancelPage extends ConsumerStatefulWidget {
  const ClassCancelPage({super.key, required this.enrollmentId});

  final String enrollmentId;

  @override
  ConsumerState<ClassCancelPage> createState() => _ClassCancelPageState();
}

enum _Step { reason, summary, pay, done }

class _ClassCancelPageState extends ConsumerState<ClassCancelPage> {
  _Step _step = _Step.reason;
  String? _reason;
  ClassCancellationQuote? _quote;
  Object? _quoteError;
  bool _loading = false;
  bool _canceling = false;
  ClassCancellationQuote? _done;
  bool _penaltyPaid = false;

  String _br(String? key) => brDateKey(key);

  Future<void> _loadQuote() async {
    setState(() {
      _step = _Step.summary;
      _loading = true;
      _quoteError = null;
    });
    try {
      final q = await ref.read(classAgreementsRepositoryProvider).previewCancellation(widget.enrollmentId);
      if (!mounted) return;
      setState(() {
        _quote = q;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _quoteError = e;
        _loading = false;
      });
    }
  }

  Future<void> _confirm() async {
    if (_canceling || _reason == null) return;
    setState(() => _canceling = true);
    try {
      final done = await ref.read(classAgreementsRepositoryProvider).cancel(
            enrollmentId: widget.enrollmentId,
            reason: _reason!,
          );
      if (!mounted) return;
      ref.invalidate(athleteTrainingPlansProvider);
      setState(() {
        _done = done;
        _canceling = false;
        _step = done.hasPenalty && done.penaltyOnline ? _Step.pay : _Step.done;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _canceling = false);
      showAppSnackBar(context, friendlyErrorMessage(e, action: 'Não foi possível cancelar o plano'), isError: true);
    }
  }

  void _back() {
    switch (_step) {
      case _Step.summary:
        setState(() => _step = _Step.reason);
      case _Step.reason:
      case _Step.pay:
      case _Step.done:
        popOrGo(context, AppRoutes.athleteTrainingPlans);
    }
  }

  @override
  Widget build(BuildContext context) {
    final title = switch (_step) {
      _Step.reason => 'Cancelar plano',
      _Step.summary => 'Como fica',
      _Step.pay => 'Multa do cancelamento',
      _Step.done => '',
    };
    return PopScope(
      canPop: _step != _Step.summary,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _back();
      },
      child: Scaffold(
        appBar: _step == _Step.done
            ? null
            : NexaAppBar(
                leading: IconButton(
                  tooltip: 'Voltar',
                  icon: const Icon(Icons.arrow_back_rounded),
                  onPressed: _back,
                ),
                title: Text(title),
              ),
        body: SafeArea(
          top: _step == _Step.done,
          bottom: false,
          child: switch (_step) {
            _Step.reason => _reasonStep(),
            _Step.summary => _summaryStep(),
            _Step.pay => ClassSignupPaymentView(
                kind: 'penalty',
                pending: ClassPendingPayment(
                  enrollmentId: widget.enrollmentId,
                  amountReais: _done?.penaltyReais ?? 0,
                ),
                methods: const ['pix', 'card'],
                onPaid: () => setState(() {
                  _penaltyPaid = true;
                  _step = _Step.done;
                }),
                onExpired: () => setState(() => _step = _Step.done),
              ),
            _Step.done => _doneStep(),
          },
        ),
        bottomNavigationBar: switch (_step) {
          _Step.reason => NexaBottomActionBar(
              hint: _reason == null ? 'Escolha o motivo' : null,
              action: SchedulePrimaryButton(
                key: const Key('class-cancel-next'),
                label: 'Ver como fica',
                onPressed: _reason == null ? null : _loadQuote,
              ),
            ),
          _Step.summary => _quote == null
              ? null
              : NexaBottomActionBar(
                  action: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      OutlinedButton(
                        key: const Key('class-cancel-confirm'),
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size.fromHeight(52),
                          foregroundColor: AppColors.live,
                          side: BorderSide(color: AppColors.live.withValues(alpha: 0.5)),
                        ),
                        onPressed: _canceling ? null : _confirm,
                        child: Text(_canceling ? 'Cancelando…' : 'Confirmar cancelamento'),
                      ),
                      const SizedBox(height: 8),
                      TextButton(
                        key: const Key('class-cancel-keep'),
                        onPressed: () => popOrGo(context, AppRoutes.athleteTrainingPlans),
                        child: const Text('Continuar com o plano'),
                      ),
                    ],
                  ),
                ),
          _Step.pay => NexaBottomActionBar(
              action: OutlinedButton(
                key: const Key('class-cancel-pay-later'),
                style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52)),
                onPressed: () => setState(() => _step = _Step.done),
                child: const Text('Pagar depois'),
              ),
            ),
          _Step.done => null,
        },
      ),
    );
  }

  Widget _reasonStep() {
    final colors = context.themeColors;
    Widget keep(IconData icon, String title, String sub, VoidCallback onTap, Key key) => Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: ScheduleCard(
            key: key,
            onTap: onTap,
            child: Row(
              children: [
                Icon(icon, color: colors.win),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: AppTypography.soraRegular(fontSize: 14, fontWeight: FontWeight.w700, color: colors.onSurface)),
                      const SizedBox(height: 2),
                      Text(sub, style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted)),
                    ],
                  ),
                ),
                Icon(Icons.chevron_right_rounded, color: colors.onSurfaceMuted),
              ],
            ),
          ),
        );
    return ListView(
      key: const Key('class-cancel-reason'),
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
      children: [
        const ScheduleKicker('Antes de cancelar'),
        const SizedBox(height: 10),
        keep(Icons.swap_horiz_rounded, 'Trocar de horário ou professor', 'Sem multa: fale com a arena e mantenha o plano.',
            () => popOrGo(context, AppRoutes.athleteTrainingPlans), const Key('class-cancel-swap')),
        keep(Icons.chat_bubble_outline_rounded, 'Falar com a arena', 'Às vezes dá para pausar ou ajustar o plano.',
            () => popOrGo(context, AppRoutes.athleteTrainingPlans), const Key('class-cancel-talk')),
        const SizedBox(height: 8),
        const ScheduleKicker('Por que você quer cancelar?'),
        const SizedBox(height: 10),
        for (final r in cancelReasons)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: ScheduleCard(
              key: Key('class-cancel-reason-${r.id}'),
              selected: _reason == r.id,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
              onTap: () => setState(() => _reason = r.id),
              child: Row(
                children: [
                  Expanded(
                    child: Text(r.label, style: AppTypography.bodyS.copyWith(color: colors.onSurface, fontWeight: FontWeight.w600, fontSize: 13.5)),
                  ),
                  Icon(
                    _reason == r.id ? Icons.radio_button_checked_rounded : Icons.radio_button_off_rounded,
                    color: _reason == r.id ? AppColors.brand : colors.onSurfaceMuted,
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }

  Widget _summaryStep() {
    final colors = context.themeColors;
    if (_loading) {
      return const Center(child: CircularProgressIndicator(color: AppColors.brand, strokeWidth: 2));
    }
    final q = _quote;
    if (q == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                friendlyErrorMessage(_quoteError ?? 'erro', action: 'Não foi possível calcular o cancelamento'),
                textAlign: TextAlign.center,
                style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
              ),
              TextButton(onPressed: _loadQuote, child: const Text('Tentar de novo')),
            ],
          ),
        ),
      );
    }
    Widget step(Color tone, String title, String sub, {bool last = false}) => Padding(
          padding: EdgeInsets.only(bottom: last ? 0 : 14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 22,
                height: 22,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: tone.withValues(alpha: 0.15),
                  border: Border.all(color: tone, width: 2),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: AppTypography.soraRegular(fontSize: 13.5, fontWeight: FontWeight.w700, color: colors.onSurface)),
                    const SizedBox(height: 2),
                    Text(sub, style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted, height: 1.4)),
                  ],
                ),
              ),
            ],
          ),
        );
    return ListView(
      key: const Key('class-cancel-summary'),
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
      children: [
        ScheduleCard(
          child: Column(
            children: [
              step(AppColors.brand, 'Hoje, ${_br(q.requestedOn)} · pedido', 'Você continua com as aulas normalmente.'),
              if (q.isPrepaid)
                step(AppColors.win, '${_br(q.endsOn)} · última aula',
                    'Fim do período já pago. Plano anual à vista: sem reembolso e sem multa.', last: true)
              else ...[
                step(AppColors.brand, '${_br(q.endsOn)} · última aula',
                    q.noticeDays > 0 ? 'Fim dos ${q.noticeDays} dias de aviso. As mensalidades seguem até lá.' : 'Sem aviso prévio.',
                    last: !q.hasPenalty && q.commitmentEndsOn == null),
                if (q.commitmentEndsOn != null)
                  step(q.hasPenalty ? AppColors.live : AppColors.win, 'Fidelidade até ${_br(q.commitmentEndsOn)}',
                      q.hasPenalty
                          ? 'Faltariam ${q.remainingMonths} mensalidade${q.remainingMonths == 1 ? '' : 's'} depois do aviso.'
                          : 'Termina dentro do aviso: sem multa.',
                      last: true),
              ],
            ],
          ),
        ),
        const SizedBox(height: 12),
        if (q.hasPenalty)
          ScheduleCard(
            key: const Key('class-cancel-penalty'),
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const ScheduleKicker('Multa por sair antes da fidelidade'),
                const SizedBox(height: 8),
                Text(q.penaltyFormula(formatBRL), style: AppTypography.mono(fontSize: 13, color: colors.onSurfaceMuted)),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Expanded(child: Text('Multa', style: AppTypography.soraRegular(fontSize: 15, fontWeight: FontWeight.w700, color: colors.onSurface))),
                    Text(formatBRL(q.penaltyReais), style: AppTypography.mono(fontSize: 22, fontWeight: FontWeight.w700, color: colors.brandText)),
                  ],
                ),
              ],
            ),
          )
        else if (!q.isPrepaid)
          const ScheduleBanner(
            icon: Icons.check_circle_outline_rounded,
            tone: AppColors.win,
            title: 'Sem multa',
            message: 'Só o aviso prévio do seu contrato.',
          ),
        const SizedBox(height: 12),
        ScheduleBanner(
          icon: Icons.description_outlined,
          tone: AppColors.brand,
          title: 'Está no seu contrato',
          message: q.hasPenalty
              ? 'A multa vence em ${_br(q.penaltyDueDate)} e pode ser paga por Pix ou cartão. Não pagar não desfaz o cancelamento.'
              : 'Depois de ${_br(q.endsOn)} a vaga fica livre para outro aluno.',
        ),
      ],
    );
  }

  Widget _doneStep() {
    final colors = context.themeColors;
    final q = _done!;
    final penaltyStatus = !q.hasPenalty
        ? 'Sem multa'
        : _penaltyPaid
            ? 'Paga'
            : q.penaltyOnline
                ? 'Em aberto · pague em Cobranças até ${_br(q.penaltyDueDate)}'
                : 'Em aberto · pague na arena até ${_br(q.penaltyDueDate)}';
    Widget row(String k, String v) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(k, style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted)),
              const SizedBox(width: 12),
              Expanded(
                child: Text(v, textAlign: TextAlign.right, style: AppTypography.bodyS.copyWith(color: colors.onSurface, fontWeight: FontWeight.w600)),
              ),
            ],
          ),
        );
    return ListView(
      key: const Key('class-cancel-done'),
      padding: const EdgeInsets.fromLTRB(20, 32, 20, 32),
      children: [
        Center(
          child: Container(
            width: 76,
            height: 76,
            decoration: BoxDecoration(color: colors.surfaceRaised, shape: BoxShape.circle),
            child: Icon(Icons.event_available_rounded, size: 34, color: colors.onSurface),
          ),
        ),
        const SizedBox(height: 22),
        Text(
          'Cancelamento agendado',
          textAlign: TextAlign.center,
          style: AppTypography.soraRegular(fontSize: 23, fontWeight: FontWeight.w700, color: colors.onSurface),
        ),
        const SizedBox(height: 6),
        Text(
          'Suas aulas seguem até ${_br(q.endsOn)}. A arena foi avisada.',
          textAlign: TextAlign.center,
          style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted, height: 1.45),
        ),
        const SizedBox(height: 20),
        ScheduleCard(
          padding: const EdgeInsets.fromLTRB(16, 6, 16, 6),
          child: Column(
            children: [
              row('Última aula', _br(q.endsOn)),
              row('Mensalidades', q.isPrepaid ? 'Já pagas até o fim' : 'Nenhuma depois da última aula'),
              row('Multa', penaltyStatus),
              row('Contrato', 'Encerra em ${_br(q.endsOn)}'),
            ],
          ),
        ),
        const SizedBox(height: 12),
        const ScheduleBanner(
          icon: Icons.info_outline_rounded,
          tone: Color(0xFF5B8DEF),
          title: 'Mudou de ideia?',
          message: 'Fale com a arena antes da última aula para manter o plano.',
        ),
        const SizedBox(height: 18),
        OutlinedButton(
          key: const Key('class-cancel-back'),
          style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52)),
          onPressed: () => popOrGo(context, AppRoutes.athleteTrainingPlans),
          child: const Text('Voltar aos meus planos'),
        ),
      ],
    );
  }
}
