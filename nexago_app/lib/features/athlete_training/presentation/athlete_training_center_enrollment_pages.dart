import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/formatting/app_currency_format.dart';
import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/time/nexago_event_timezone.dart';
import '../../professor_links/application/professor_links_providers.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/presentation/widgets/professor_students_widgets.dart';
import '../application/athlete_training_providers.dart';
import '../domain/center_enrollment_request.dart';
import '../domain/training_center.dart';
import '../infrastructure/center_certificate_picker.dart';
import '../infrastructure/class_presence_repository.dart'
    show ClassPresenceException;
import '../infrastructure/training_centers_repository.dart';
import 'widgets/training_origin_widgets.dart';

/// Trancar, pausa por lesão e cancelar a matrícula do CT pelo aluno (canvas
/// `ct-saida-app.jsx`): T5 Minha matrícula (com o pedido em andamento no
/// lugar das opções — T7 atestado em análise, T10 cancelamento agendado),
/// trancamento, T6 pausa por lesão (com a alta médica, quando o centro exige)
/// e T8/T9 cancelar com retenção (troca de plano, desconto de 1 mês ou
/// trancar). Tudo pelas callables do aluno; depois de cada ação a lista do
/// centro é recarregada.

/// Abre "Minha matrícula" (T5).
void openCenterEnrollment(
  BuildContext context,
  String centerId,
  String enrollmentId,
) =>
    context.pushNamed(
      AppRouteNames.athleteTrainingCenterEnrollment,
      pathParameters: {'centerId': centerId, 'enrollmentId': enrollmentId},
    );

String _enrollmentLocation(String centerId, String enrollmentId) =>
    AppRoutes.athleteTrainingCenterEnrollment
        .replaceFirst(':centerId', centerId)
        .replaceFirst(':enrollmentId', enrollmentId);

String _centerPlanLocation(String centerId) =>
    '${AppRoutes.athleteTrainingCenter.replaceFirst(':centerId', centerId)}'
    '?aba=plano';

void _snack(BuildContext context, String text) =>
    ScaffoldMessenger.maybeOf(context)
      ?..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(text)));

/// Recarrega os centros e espera a resposta nova (a tela seguinte já abre
/// com o pedido certo).
Future<void> _reloadCenters(WidgetRef ref) async {
  refreshAthleteTrainingCenters(ref);
  try {
    await ref.read(athleteTrainingCentersProvider.future);
  } catch (_) {}
}

String _dayKeyOf(DateTime d) => '${d.year.toString().padLeft(4, '0')}-'
    '${d.month.toString().padLeft(2, '0')}-'
    '${d.day.toString().padLeft(2, '0')}';

String _todayKey(WidgetRef ref) =>
    nexagoEventDayKey(ref.read(professorLinksClockProvider)());

/// Centro e matrícula da rota (carregando = `loading`).
({bool loading, TrainingCenterLink? center, CenterEnrollment? enrollment})
    _lookup(WidgetRef ref, String centerId, String enrollmentId) {
  final async = ref.watch(athleteTrainingCenterProvider(centerId));
  final center = async.valueOrNull;
  return (
    loading: async.isLoading && center == null,
    center: center,
    enrollment: center?.enrollmentById(enrollmentId),
  );
}

Widget _loading() => const Padding(
      padding: EdgeInsets.symmetric(vertical: 40),
      child: Center(child: CircularProgressIndicator(color: AppColors.brand)),
    );

Widget _missing() => const ProfessorLinksCard(
      key: Key('center-enrollment-missing'),
      child: ProfessorMutedText(
        'Esta matrícula não está mais na sua lista. Confira a aba Plano do '
        'centro.',
      ),
    );

// ─────────────────────────────────────────────────────────────────────────
// T5 · Minha matrícula
// ─────────────────────────────────────────────────────────────────────────

class AthleteCenterEnrollmentPage extends ConsumerStatefulWidget {
  const AthleteCenterEnrollmentPage({
    super.key,
    required this.centerId,
    required this.enrollmentId,
  });

  final String centerId;
  final String enrollmentId;

  @override
  ConsumerState<AthleteCenterEnrollmentPage> createState() =>
      _AthleteCenterEnrollmentPageState();
}

class _AthleteCenterEnrollmentPageState
    extends ConsumerState<AthleteCenterEnrollmentPage> {
  String? _withdrawing;

  void _go(String routeName) => context.pushNamed(
        routeName,
        pathParameters: {
          'centerId': widget.centerId,
          'enrollmentId': widget.enrollmentId,
        },
      );

  Future<void> _withdraw(CenterEnrollmentRequest r) async {
    setState(() => _withdrawing = r.requestId);
    try {
      await ref
          .read(trainingCentersRepositoryProvider)
          .withdrawEnrollmentRequest(
            centerId: widget.centerId,
            requestId: r.requestId,
          );
      await _reloadCenters(ref);
      if (mounted) {
        _snack(
          context,
          r.isCancel
              ? 'Pronto: você continua na turma.'
              : 'Pedido desfeito. Sua matrícula segue normal.',
        );
      }
    } on ClassPresenceException catch (e) {
      if (mounted) _snack(context, e.message);
    } finally {
      if (mounted) setState(() => _withdrawing = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = _lookup(ref, widget.centerId, widget.enrollmentId);
    final center = l.center;
    final e = l.enrollment;
    final todayKey =
        nexagoEventDayKey(ref.watch(professorLinksClockProvider)());
    final open = center?.openRequestsOf(widget.enrollmentId) ?? const [];
    final closed = center?.closedRequestsOf(widget.enrollmentId) ?? const [];
    // Pausa em curso ainda deixa cancelar; qualquer outro pedido aberto
    // segura as opções.
    final onlyActivePause = open.isNotEmpty &&
        open.every(
          (r) => centerRequestStateOf(r) == CenterRequestState.pauseActive,
        );

    return ProfessorLinksScaffold(
      title: 'Minha matrícula',
      subtitle: center?.name.toUpperCase(),
      onBack: () => popOrGo(context, _centerPlanLocation(widget.centerId)),
      body: RefreshIndicator(
        color: AppColors.brand,
        onRefresh: () => _reloadCenters(ref),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
          children: [
            if (l.loading)
              _loading()
            else if (center == null || e == null)
              _missing()
            else ...[
              _EnrollmentCard(enrollment: e),
              for (final r in open) ...[
                const SizedBox(height: 12),
                _RequestStateCard(
                  key: Key('center-enrollment-request-${r.requestId}'),
                  request: r,
                  policies: center.policies,
                  todayKey: todayKey,
                  withdrawing: _withdrawing == r.requestId,
                  onWithdraw: () => _withdraw(r),
                  onResend: () => _go(
                    AppRouteNames.athleteTrainingCenterEnrollmentInjury,
                  ),
                ),
                if (centerClearanceStateOf(r, todayKey) case final cs?) ...[
                  const SizedBox(height: 12),
                  _ClearanceCard(
                    key: Key('center-clearance-${r.requestId}'),
                    centerId: widget.centerId,
                    request: r,
                    state: cs,
                    todayKey: todayKey,
                  ),
                ],
              ],
              if (open.isEmpty || onlyActivePause) ...[
                const SizedBox(height: 16),
                ProfessorLinksKicker(
                  open.isEmpty ? 'Precisa de uma pausa?' : 'Outras opções',
                ),
                const SizedBox(height: 8),
                ProfessorLinksCard(
                  padding: EdgeInsets.zero,
                  child: Column(
                    children: [
                      if (open.isEmpty) ...[
                        _OptionRow(
                          key: const Key('center-enrollment-injury'),
                          title: 'Pausa por lesão',
                          subtitle: centerCanInjuryPause(e)
                              ? centerInjuryOptionText(center.policies)
                              : 'Só a matrícula mensal ativa',
                          color: AppColors.brand,
                          onTap: centerCanInjuryPause(e)
                              ? () => _go(
                                    AppRouteNames
                                        .athleteTrainingCenterEnrollmentInjury,
                                  )
                              : null,
                        ),
                        _OptionRow(
                          key: const Key('center-enrollment-pause'),
                          title: 'Trancar matrícula',
                          subtitle: centerPauseOptionText(center.policies, e),
                          divider: true,
                          onTap: centerCanPause(center.policies, e)
                              ? () => _go(
                                    AppRouteNames
                                        .athleteTrainingCenterEnrollmentPause,
                                  )
                              : null,
                        ),
                      ],
                      _OptionRow(
                        key: const Key('center-enrollment-cancel'),
                        title: 'Cancelar matrícula',
                        subtitle: centerCancelOptionText(center.policies, e),
                        color: AppColors.live,
                        divider: open.isEmpty,
                        onTap: centerCanCancel(e)
                            ? () => _go(
                                  AppRouteNames
                                      .athleteTrainingCenterEnrollmentCancel,
                                )
                            : null,
                      ),
                    ],
                  ),
                ),
              ],
              if (closed.isNotEmpty) ...[
                const SizedBox(height: 18),
                const ProfessorLinksKicker('Pedidos recentes'),
                const SizedBox(height: 8),
                TrainingKeyValueCard(
                  key: const Key('center-enrollment-history'),
                  rows: [
                    for (final r in closed.take(4))
                      (
                        [
                          centerRequestTypeLabel(r.type),
                          if (r.createdOn != null) centerShortDay(r.createdOn!),
                        ].join(' · '),
                        [
                          centerRequestStatusLabel(r),
                          if (centerRetainedDetail(r) case final d?) d,
                          if (r.status == 'rejected' &&
                              r.decisionNote.isNotEmpty)
                            r.decisionNote,
                        ].join(' · '),
                        r.status == 'rejected' ? AppColors.live : null,
                      ),
                  ],
                ),
              ],
            ],
          ],
        ),
      ),
    );
  }
}

class _EnrollmentCard extends StatelessWidget {
  const _EnrollmentCard({required this.enrollment});

  final CenterEnrollment enrollment;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final e = enrollment;
    final kicker = switch (e.status) {
      'active' when e.startDate.isNotEmpty =>
        'Ativa desde ${centerShortDay(e.startDate)}',
      'paused' when e.pausedUntil != null =>
        'Pausada · volta em ${centerShortDay(e.pausedUntil!)}',
      _ => centerEnrollmentStatusLabel(e),
    };
    return ProfessorLinksCard(
      key: const Key('center-enrollment-card'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ProfessorLinksKicker(kicker),
          const SizedBox(height: 8),
          Text(
            e.className,
            style: ProfessorLinksStyle.display(18, color: colors.onSurface),
          ),
          const SizedBox(height: 4),
          Text(
            [
              centerPlanSummary(e),
              '${formatBRLFromCents(e.priceCents)}${e.isPack ? '' : '/mês'}',
              if (e.billingDay != null)
                'dia ${e.billingDay.toString().padLeft(2, '0')}',
            ].join(' · '),
            style: AppTypography.bodyS.copyWith(
              fontSize: 12,
              color: ProfessorLinksStyle.mute(colors),
            ),
          ),
        ],
      ),
    );
  }
}

class _OptionRow extends StatelessWidget {
  const _OptionRow({
    super.key,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.color,
    this.divider = false,
  });

  final String title;
  final String subtitle;
  final VoidCallback? onTap;
  final Color? color;
  final bool divider;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final enabled = onTap != null;
    final tone = color == null ? colors.onSurface : colors.readableTone(color!);
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.fromLTRB(14, 13, 12, 13),
        decoration: BoxDecoration(
          border: divider
              ? Border(top: BorderSide(color: ProfessorLinksStyle.line(colors)))
              : null,
        ),
        child: Opacity(
          opacity: enabled ? 1 : 0.5,
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: ProfessorLinksStyle.display(
                        14,
                        weight: FontWeight.w700,
                        color: tone,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: AppTypography.bodyS.copyWith(
                        fontSize: 11.5,
                        color: ProfessorLinksStyle.dim(colors),
                      ),
                    ),
                  ],
                ),
              ),
              if (enabled)
                Icon(
                  Icons.chevron_right_rounded,
                  size: 18,
                  color: ProfessorLinksStyle.dim(colors),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// O pedido em andamento no lugar das opções (T7, T10 e os estados da pausa).
class _RequestStateCard extends StatelessWidget {
  const _RequestStateCard({
    super.key,
    required this.request,
    required this.policies,
    required this.todayKey,
    required this.withdrawing,
    required this.onWithdraw,
    required this.onResend,
  });

  final CenterEnrollmentRequest request;
  final CenterPolicies policies;
  final String todayKey;
  final bool withdrawing;
  final VoidCallback onWithdraw;
  final VoidCallback onResend;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final r = request;
    final state = centerRequestStateOf(r);
    if (state == null) return const SizedBox.shrink();
    final canWithdraw = centerRequestWithdrawable(r, policies, todayKey);
    final injury = r.type == 'injury';
    final range = centerDayRange(r.startsOn, r.endsOn);
    final back = r.endsOn == null ? null : centerShiftDay(r.endsOn!, 1);

    final (Color tone, String kicker, String title, String text) =
        switch (state) {
      CenterRequestState.injuryReview => (
          AppColors.pending,
          'Em análise',
          'Atestado enviado',
          'O centro revisa o atestado e avisa pelo app. Se aprovado, a pausa '
              'vale${range.isEmpty ? '' : ' de $range'}, sem cobrança e com a '
              'vaga reservada.',
        ),
      CenterRequestState.documentRequested => (
          AppColors.pending,
          'O centro pediu outro documento',
          'Reenvie o atestado',
          r.decisionNote.isEmpty
              ? 'Envie um atestado legível, com data e dias de afastamento.'
              : r.decisionNote,
        ),
      CenterRequestState.pauseScheduled => (
          ProfessorLinksStyle.blue,
          injury ? 'Pausa por lesão aprovada' : 'Trancamento agendado',
          range.isEmpty ? 'Pausa agendada' : 'De $range',
          'Sua vaga fica reservada e não há cobrança no período.'
              '${back == null ? '' : ' A matrícula volta sozinha em ${centerShortDay(back)}.'}',
        ),
      CenterRequestState.pauseActive when r.awaitingClearance => (
          AppColors.pending,
          'Pausa por lesão em curso',
          'Sua volta espera a alta',
          'A pausa segue sem cobrança até o centro aprovar a alta. Sua vaga '
              'está reservada.',
        ),
      CenterRequestState.pauseActive => (
          ProfessorLinksStyle.blue,
          injury ? 'Pausa por lesão em curso' : 'Matrícula trancada',
          back == null ? 'Pausa em curso' : 'Volta em ${centerShortDay(back)}',
          'Sem aulas nem cobrança até lá. Sua vaga está reservada.',
        ),
      CenterRequestState.cancelScheduled => (
          AppColors.live,
          'Cancelamento agendado',
          r.lastDay == null
              ? 'Cancelamento agendado'
              : 'Suas aulas vão até ${centerShortDay(r.lastDay!)}',
          'Até lá, nada muda: check-in, reposições e o app funcionam '
              'normalmente.',
        ),
    };

    final rows = <(String, String, Color?)>[
      if (state == CenterRequestState.injuryReview ||
          state == CenterRequestState.documentRequested)
        ('Situação', centerRequestStatusLabel(r), AppColors.pending),
      if (r.createdOn != null)
        ('Pedido em', centerShortDay(r.createdOn!), null),
      if (r.isPause && r.days != null)
        (
          injury && state == CenterRequestState.injuryReview
              ? 'Pausa pedida'
              : 'Duração',
          '${r.days} dia${r.days == 1 ? '' : 's'}',
          null,
        ),
      if (r.isCancel && r.reason.isNotEmpty) ('Motivo', r.reason, null),
      if (r.isCancel && r.lastDay != null)
        ('Último dia', centerShortDay(r.lastDay!), null),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ProfessorLinksCard(
          borderColor: tone.withValues(alpha: 0.35),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ProfessorLinksKicker(kicker, color: colors.readableTone(tone)),
              const SizedBox(height: 8),
              Text(
                title,
                style: ProfessorLinksStyle.display(18, color: colors.onSurface),
              ),
              const SizedBox(height: 6),
              Text(
                text,
                style: AppTypography.bodyS.copyWith(
                  fontSize: 12,
                  height: 1.45,
                  color: ProfessorLinksStyle.mute(colors),
                ),
              ),
            ],
          ),
        ),
        if (rows.isNotEmpty) ...[
          const SizedBox(height: 10),
          TrainingKeyValueCard(rows: rows),
        ],
        if (state == CenterRequestState.documentRequested) ...[
          const SizedBox(height: 12),
          ProfessorLinksPrimaryButton(
            key: const Key('center-enrollment-resend'),
            label: 'Reenviar atestado',
            onPressed: onResend,
          ),
        ],
        if (state == CenterRequestState.cancelScheduled) ...[
          const SizedBox(height: 10),
          Text(
            canWithdraw
                ? 'Mudou de ideia? Você pode desistir até o último dia e '
                    'continua na mesma turma.'
                : 'Para desistir do cancelamento, fale com a recepção do '
                    'centro.',
            style: AppTypography.bodyS.copyWith(
              fontSize: 11.5,
              height: 1.45,
              color: ProfessorLinksStyle.dim(colors),
            ),
          ),
        ],
        if (canWithdraw) ...[
          const SizedBox(height: 10),
          ProfessorLinksGhostButton(
            key: const Key('center-enrollment-withdraw'),
            label: switch (state) {
              CenterRequestState.cancelScheduled => 'Desistir do cancelamento',
              CenterRequestState.pauseScheduled =>
                injury ? 'Desistir da pausa' : 'Desistir do trancamento',
              _ => 'Desistir do pedido',
            },
            loading: withdrawing,
            onPressed: onWithdraw,
          ),
        ],
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Trancar matrícula
// ─────────────────────────────────────────────────────────────────────────

class AthleteCenterPausePage extends ConsumerStatefulWidget {
  const AthleteCenterPausePage({
    super.key,
    required this.centerId,
    required this.enrollmentId,
  });

  final String centerId;
  final String enrollmentId;

  @override
  ConsumerState<AthleteCenterPausePage> createState() =>
      _AthleteCenterPausePageState();
}

class _AthleteCenterPausePageState
    extends ConsumerState<AthleteCenterPausePage> {
  final _days = TextEditingController();
  final _reason = TextEditingController();

  /// `null` = começa hoje.
  String? _startsOn;
  bool _sending = false;
  bool _seeded = false;

  @override
  void dispose() {
    _days.dispose();
    _reason.dispose();
    super.dispose();
  }

  Future<void> _pickStart(String todayKey) async {
    final today = DateTime.parse(todayKey);
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime.parse(_startsOn ?? todayKey),
      firstDate: today,
      lastDate: today.add(const Duration(days: kCenterPauseMaxLeadDays)),
    );
    if (picked == null || !mounted) return;
    final key = '${picked.year.toString().padLeft(4, '0')}-'
        '${picked.month.toString().padLeft(2, '0')}-'
        '${picked.day.toString().padLeft(2, '0')}';
    setState(() => _startsOn = key == todayKey ? null : key);
  }

  Future<void> _confirm(String startsOn, int days) async {
    final endsOn = centerPauseEndsOn(startsOn, days);
    final ok = await showProfessorLinksSheet<bool>(
      context,
      builder: (sheet) => ProfessorLinksSheetBody(
        key: const Key('center-pause-confirm-sheet'),
        title: 'Confirmar trancamento',
        subtitle: 'Vale na hora: o centro recebe um aviso.',
        children: [
          TrainingKeyValueCard(
            rows: [
              ('Pausa', centerDayRange(startsOn, endsOn), null),
              ('Duração', '$days dia${days == 1 ? '' : 's'}', null),
              ('Volta em', centerShortDay(centerShiftDay(endsOn, 1)), null),
              ('Cobrança', 'Sem cobrança no período', null),
              ('Sua vaga', 'Fica reservada', null),
            ],
          ),
          ProfessorLinksPrimaryButton(
            key: const Key('center-pause-confirm'),
            label: 'Confirmar trancamento',
            onPressed: () => Navigator.of(sheet).pop(true),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _sending = true);
    try {
      final res = await ref
          .read(trainingCentersRepositoryProvider)
          .requestEnrollmentChange(
            centerId: widget.centerId,
            enrollmentId: widget.enrollmentId,
            type: 'pause',
            startsOn: startsOn,
            days: days,
            reason: _reason.text.trim(),
          );
      await _reloadCenters(ref);
      if (!mounted) return;
      _snack(
        context,
        'Matrícula trancada de '
        '${centerDayRange(res.startsOn ?? startsOn, res.endsOn ?? endsOn)}.',
      );
      popOrGo(
          context, _enrollmentLocation(widget.centerId, widget.enrollmentId));
    } on ClassPresenceException catch (e) {
      if (mounted) _snack(context, e.message);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final l = _lookup(ref, widget.centerId, widget.enrollmentId);
    final center = l.center;
    final e = l.enrollment;
    final todayKey = _todayKey(ref);
    final p = center?.policies ?? const CenterPolicies();
    final left = e == null ? 0 : centerPauseDaysLeft(p, e);
    if (!_seeded && e != null) {
      _seeded = true;
      _days.text = '${p.pauseMinDays <= left ? p.pauseMinDays : left}';
    }
    final startsOn = _startsOn ?? todayKey;
    final days = int.tryParse(_days.text.trim());
    final error = centerPauseFormError(
      type: 'pause',
      todayKey: todayKey,
      startsOn: startsOn,
      days: days,
      policies: p,
      daysLeft: left,
    );

    return ProfessorLinksScaffold(
      title: 'Trancar matrícula',
      subtitle: e?.className.toUpperCase(),
      onBack: () => popOrGo(
        context,
        _enrollmentLocation(widget.centerId, widget.enrollmentId),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          if (l.loading)
            _loading()
          else if (center == null || e == null)
            _missing()
          else ...[
            Text(
              'Você tem $left dia${left == 1 ? '' : 's'} livre${left == 1 ? '' : 's'} '
              'no ano. Mínimo de ${p.pauseMinDays} dias por pedido; a vaga '
              'fica reservada e não há cobrança no período.',
              style: AppTypography.bodyS.copyWith(
                fontSize: 12.5,
                height: 1.45,
                color: ProfessorLinksStyle.mute(colors),
              ),
            ),
            const SizedBox(height: 16),
            const ProfessorLinksKicker('Começa'),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: _Choice(
                    key: const Key('center-pause-today'),
                    label: 'Hoje',
                    selected: _startsOn == null,
                    onTap: () => setState(() => _startsOn = null),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _Choice(
                    key: const Key('center-pause-date'),
                    label: _startsOn == null
                        ? 'Outra data'
                        : centerShortDay(_startsOn!),
                    selected: _startsOn != null,
                    onTap: () => _pickStart(todayKey),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              'Pode começar até $kCenterPauseMaxLeadDays dias à frente.',
              style: AppTypography.bodyS.copyWith(
                fontSize: 11.5,
                color: ProfessorLinksStyle.dim(colors),
              ),
            ),
            const SizedBox(height: 16),
            const ProfessorLinksKicker('Quantos dias'),
            const SizedBox(height: 8),
            _Field(
              key: const Key('center-pause-days'),
              controller: _days,
              hint: 'Dias',
              number: true,
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 16),
            const ProfessorLinksKicker('Motivo (opcional)'),
            const SizedBox(height: 8),
            _Field(
              key: const Key('center-pause-reason'),
              controller: _reason,
              hint: 'Viagem, trabalho, provas…',
            ),
            const SizedBox(height: 16),
            if (error == null && days != null)
              TrainingKeyValueCard(
                key: const Key('center-pause-summary'),
                rows: [
                  (
                    'Pausa',
                    centerDayRange(startsOn, centerPauseEndsOn(startsOn, days)),
                    null,
                  ),
                  (
                    'Volta em',
                    centerShortDay(
                      centerShiftDay(centerPauseEndsOn(startsOn, days), 1),
                    ),
                    null,
                  ),
                ],
              )
            else if (error != null)
              TrainingOriginNote(
                key: const Key('center-pause-error'),
                color: AppColors.pending,
                icon: Icons.info_outline_rounded,
                title: error,
                text: '',
              ),
            const SizedBox(height: 16),
            ProfessorLinksPrimaryButton(
              key: const Key('center-pause-review'),
              label: 'Revisar trancamento',
              loading: _sending,
              onPressed: error == null ? () => _confirm(startsOn, days!) : null,
            ),
          ],
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// T6 · Pausa por lesão
// ─────────────────────────────────────────────────────────────────────────

class AthleteCenterInjuryPage extends ConsumerStatefulWidget {
  const AthleteCenterInjuryPage({
    super.key,
    required this.centerId,
    required this.enrollmentId,
  });

  final String centerId;
  final String enrollmentId;

  @override
  ConsumerState<AthleteCenterInjuryPage> createState() =>
      _AthleteCenterInjuryPageState();
}

class _AthleteCenterInjuryPageState
    extends ConsumerState<AthleteCenterInjuryPage> {
  final _days = TextEditingController();
  final _what = TextEditingController();
  PickedCertificate? _file;

  /// `null` = hoje.
  String? _issuedOn;
  bool _sending = false;

  @override
  void dispose() {
    _days.dispose();
    _what.dispose();
    super.dispose();
  }

  Future<void> _pick(CertificateSource source) async {
    try {
      final f = await ref.read(centerCertificatePickerProvider)(source);
      if (f == null || !mounted) return;
      if (f.sizeBytes > kCenterCertificateMaxBytes) {
        _snack(context, 'O atestado pode ter até 10 MB.');
        return;
      }
      setState(() => _file = f);
    } catch (_) {
      if (mounted) {
        _snack(context, 'Não foi possível abrir o arquivo. Tente de novo.');
      }
    }
  }

  Future<void> _pickIssued(String todayKey) async {
    final today = DateTime.parse(todayKey);
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime.parse(_issuedOn ?? todayKey),
      firstDate: today.subtract(const Duration(days: 365)),
      lastDate: today,
    );
    if (picked == null || !mounted) return;
    final key = _dayKeyOf(picked);
    setState(() => _issuedOn = key == todayKey ? null : key);
  }

  Future<void> _send(String todayKey, int days) async {
    final file = _file!;
    setState(() => _sending = true);
    final repo = ref.read(trainingCentersRepositoryProvider);
    try {
      final path = await repo.uploadCertificate(
        centerId: widget.centerId,
        uid: ref.read(professorLinksUidProvider),
        bytes: file.bytes,
        fileName: file.fileName,
        contentType: file.contentType,
      );
      final res = await repo.requestEnrollmentChange(
        centerId: widget.centerId,
        enrollmentId: widget.enrollmentId,
        type: 'injury',
        startsOn: todayKey,
        days: days,
        reason: _what.text.trim(),
        certificate: CenterCertificateUpload(
          path: path,
          fileName: file.fileName,
          contentType: file.contentType,
          sizeBytes: file.sizeBytes,
          issuedOn: _issuedOn ?? todayKey,
          daysOff: days,
          description: _what.text.trim(),
        ),
      );
      await _reloadCenters(ref);
      if (!mounted) return;
      if (res.status != 'pending') {
        _snack(
          context,
          'Pausa aprovada: '
          '${centerDayRange(res.startsOn, res.endsOn)}. Melhoras!',
        );
      }
      popOrGo(
          context, _enrollmentLocation(widget.centerId, widget.enrollmentId));
    } on ClassPresenceException catch (e) {
      if (mounted) _snack(context, e.message);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final l = _lookup(ref, widget.centerId, widget.enrollmentId);
    final center = l.center;
    final e = l.enrollment;
    final todayKey = _todayKey(ref);
    final p = center?.policies ?? const CenterPolicies();
    final left = e == null ? 0 : centerPauseDaysLeft(p, e);
    final days = int.tryParse(_days.text.trim());
    final error = _days.text.trim().isEmpty
        ? null
        : centerPauseFormError(
            type: 'injury',
            todayKey: todayKey,
            startsOn: todayKey,
            days: days,
            policies: p,
            daysLeft: left,
          );
    final ready = _file != null && days != null && error == null;
    final file = _file;

    return ProfessorLinksScaffold(
      title: 'Pausa por lesão',
      subtitle: e?.className.toUpperCase(),
      onBack: () => popOrGo(
        context,
        _enrollmentLocation(widget.centerId, widget.enrollmentId),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          if (l.loading)
            _loading()
          else if (center == null || e == null)
            _missing()
          else ...[
            const ProfessorLinksKicker('Atestado médico'),
            const SizedBox(height: 8),
            if (file != null) ...[
              _PickedFileRow(
                key: const Key('center-injury-file'),
                file: file,
              ),
              const SizedBox(height: 8),
            ],
            Row(
              children: [
                Expanded(
                  child: ProfessorLinksGhostButton(
                    key: const Key('center-injury-camera'),
                    label: 'Tirar foto',
                    height: 42,
                    onPressed:
                        _sending ? null : () => _pick(CertificateSource.camera),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: ProfessorLinksGhostButton(
                    key: const Key('center-injury-pick-file'),
                    label: 'Escolher arquivo',
                    height: 42,
                    onPressed:
                        _sending ? null : () => _pick(CertificateSource.file),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const ProfessorLinksKicker('Emitido em'),
                      const SizedBox(height: 6),
                      _Choice(
                        key: const Key('center-injury-issued'),
                        label: centerShortDay(_issuedOn ?? todayKey),
                        selected: false,
                        onTap: () => _pickIssued(todayKey),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const ProfessorLinksKicker('Dias de afastamento'),
                      const SizedBox(height: 6),
                      _Field(
                        key: const Key('center-injury-days'),
                        controller: _days,
                        hint: 'Ex.: 30',
                        number: true,
                        onChanged: (_) => setState(() {}),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            const ProfessorLinksKicker('O que aconteceu'),
            const SizedBox(height: 6),
            _Field(
              key: const Key('center-injury-what'),
              controller: _what,
              hint: 'Ex.: entorse no joelho direito',
              lines: 3,
            ),
            const SizedBox(height: 16),
            if (error != null)
              TrainingOriginNote(
                key: const Key('center-injury-error'),
                color: AppColors.pending,
                icon: Icons.info_outline_rounded,
                title: error,
                text: '',
              )
            else if (days != null) ...[
              ProfessorLinksCard(
                key: const Key('center-injury-if-approved'),
                padding: const EdgeInsets.fromLTRB(14, 12, 14, 4),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const ProfessorLinksKicker('Se aprovado'),
                    const SizedBox(height: 4),
                    TrainingKeyValueCard(
                      rows: [
                        (
                          'Pausa',
                          centerDayRange(
                            todayKey,
                            centerPauseEndsOn(todayKey, days),
                          ),
                          null,
                        ),
                        ('Cobrança', 'Sem cobrança no período', null),
                        ('Sua vaga', 'Fica reservada', null),
                      ],
                    ),
                  ],
                ),
              ),
              if (days > p.injuryMaxDays) ...[
                const SizedBox(height: 8),
                TrainingOriginNote(
                  key: const Key('center-injury-over-limit'),
                  color: ProfessorLinksStyle.blue,
                  title: 'Acima de ${p.injuryMaxDays} dias',
                  text: 'O centro decide caso a caso.',
                ),
              ],
            ],
            if (p.requireMedicalClearance) ...[
              const SizedBox(height: 8),
              const TrainingOriginNote(
                key: Key('center-injury-clearance-note'),
                color: ProfessorLinksStyle.blue,
                icon: Icons.medical_services_outlined,
                title: 'Alta médica para voltar',
                text: 'Para voltar, o centro pede a alta médica '
                    '($kCenterClearanceLeadDays dias antes do fim).',
              ),
            ],
            const SizedBox(height: 12),
            Text(
              'Só a gestão do centro vê o atestado. Professores sabem apenas '
              'que você está afastado.',
              style: AppTypography.bodyS.copyWith(
                fontSize: 11.5,
                height: 1.45,
                color: ProfessorLinksStyle.dim(colors),
              ),
            ),
            const SizedBox(height: 16),
            ProfessorLinksPrimaryButton(
              key: const Key('center-injury-send'),
              label: _file == null ? 'Anexe o atestado' : 'Enviar para o CT',
              loading: _sending,
              onPressed: ready ? () => _send(todayKey, days) : null,
            ),
          ],
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// T8/T9 · Cancelar matrícula
// ─────────────────────────────────────────────────────────────────────────

class AthleteCenterCancelPage extends ConsumerStatefulWidget {
  const AthleteCenterCancelPage({
    super.key,
    required this.centerId,
    required this.enrollmentId,
  });

  final String centerId;
  final String enrollmentId;

  @override
  ConsumerState<AthleteCenterCancelPage> createState() =>
      _AthleteCenterCancelPageState();
}

class _AthleteCenterCancelPageState
    extends ConsumerState<AthleteCenterCancelPage> {
  final _comment = TextEditingController();
  String? _reason;
  bool _step2 = false;

  /// Oferta escolhida no passo 2: `pause`, `discount` ou o `planId`.
  String? _offer;
  String? _sending;

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  List<String> _offered(
    ({bool pause, List<CenterRetentionPlan> plans, int? discount}) o,
  ) =>
      [
        if (o.pause) 'pause',
        if (o.plans.isNotEmpty) 'plan_change',
        if (o.discount != null) 'discount',
      ];

  Future<void> _submit({
    required List<String> offered,
    CenterRetentionPlan? retain,
    bool discount = false,
    String? discountFrom,
  }) async {
    setState(
      () => _sending = retain == null && !discount ? 'cancel' : 'retain',
    );
    try {
      final res = await ref
          .read(trainingCentersRepositoryProvider)
          .requestEnrollmentChange(
            centerId: widget.centerId,
            enrollmentId: widget.enrollmentId,
            type: 'cancel',
            reason: _reason!,
            comment: _comment.text.trim(),
            retentionOffered: offered,
            retainPlanId: retain?.planId,
            retainDiscount: discount,
          );
      await _reloadCenters(ref);
      if (!mounted) return;
      if (res.status == 'retained') {
        _snack(
          context,
          discount
              ? (discountFrom == null
                  ? 'Desconto aplicado na próxima mensalidade.'
                  : 'Desconto aplicado na mensalidade de '
                      '${centerShortDay(discountFrom)}.')
              : 'Pronto: você fica com ${retain!.name} a partir do próximo '
                  'ciclo.',
        );
        popOrGo(
          context,
          _enrollmentLocation(widget.centerId, widget.enrollmentId),
        );
      } else if (res.status == 'done') {
        _snack(context, 'Matrícula cancelada. A vaga foi liberada.');
        context.go(_centerPlanLocation(widget.centerId));
      } else {
        popOrGo(
          context,
          _enrollmentLocation(widget.centerId, widget.enrollmentId),
        );
      }
    } on ClassPresenceException catch (e) {
      if (mounted) _snack(context, e.message);
    } finally {
      if (mounted) setState(() => _sending = null);
    }
  }

  void _goPause() => context.pushReplacementNamed(
        AppRouteNames.athleteTrainingCenterEnrollmentPause,
        pathParameters: {
          'centerId': widget.centerId,
          'enrollmentId': widget.enrollmentId,
        },
      );

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final l = _lookup(ref, widget.centerId, widget.enrollmentId);
    final center = l.center;
    final e = l.enrollment;
    final todayKey = _todayKey(ref);

    return ProfessorLinksScaffold(
      title: 'Cancelar matrícula',
      subtitle: _step2 ? 'PASSO 2 DE 2' : 'PASSO 1 DE 2',
      onBack: () => _step2
          ? setState(() => _step2 = false)
          : popOrGo(
              context,
              _enrollmentLocation(widget.centerId, widget.enrollmentId),
            ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          if (l.loading)
            _loading()
          else if (center == null || e == null)
            _missing()
          else if (!_step2) ...[
            Text(
              'Por que você quer sair?',
              style: ProfessorLinksStyle.display(18, color: colors.onSurface),
            ),
            const SizedBox(height: 4),
            Text(
              'Sua resposta vai só para a gestão do centro.',
              style: AppTypography.bodyS.copyWith(
                fontSize: 12.5,
                color: ProfessorLinksStyle.mute(colors),
              ),
            ),
            const SizedBox(height: 14),
            for (final (key, label) in kCenterCancelReasons) ...[
              _RadioOption(
                key: Key('center-cancel-reason-$key'),
                title: label,
                selected: _reason == key,
                onTap: () => setState(() => _reason = key),
              ),
              const SizedBox(height: 8),
            ],
            const SizedBox(height: 6),
            _Field(
              key: const Key('center-cancel-comment'),
              controller: _comment,
              hint: 'Quer contar mais? (opcional)',
              lines: 2,
            ),
            const SizedBox(height: 16),
            ProfessorLinksPrimaryButton(
              key: const Key('center-cancel-continue'),
              label: 'Continuar',
              onPressed: _reason == null
                  ? null
                  : () => setState(() {
                        _step2 = true;
                        final o = centerRetentionOffers(center.policies, e);
                        _offer = o.discount != null
                            ? 'discount'
                            : o.plans.isNotEmpty
                                ? o.plans.first.planId
                                : o.pause
                                    ? 'pause'
                                    : null;
                      }),
            ),
          ] else
            ..._retention(context, center, e, todayKey),
        ],
      ),
    );
  }

  List<Widget> _retention(
    BuildContext context,
    TrainingCenterLink center,
    CenterEnrollment e,
    String todayKey,
  ) {
    final colors = context.themeColors;
    final p = center.policies;
    final offers = centerRetentionOffers(p, e);
    final offered = _offered(offers);
    final hasOffers =
        offers.pause || offers.plans.isNotEmpty || offers.discount != null;
    final discount = offers.discount;
    final last = e.cancelLastDay;
    final endsNow = last == null || last.compareTo(todayKey) <= 0;
    CenterRetentionPlan? plan;
    for (final x in offers.plans) {
      if (x.planId == _offer) plan = x;
    }
    final left = centerPauseDaysLeft(p, e);
    final credits = center.makeupCredits;

    return [
      Text(
        hasOffers
            ? 'Antes de ir, alguma destas ajuda?'
            : 'Confira antes de cancelar',
        style: ProfessorLinksStyle.display(18, color: colors.onSurface),
      ),
      const SizedBox(height: 14),
      if (discount != null) ...[
        _RadioOption(
          key: const Key('center-cancel-offer-discount'),
          title: 'Fique com $discount% de desconto na próxima mensalidade',
          subtitle: [
            '${formatBRLFromCents(centerDiscountedCents(e.priceCents, discount))}'
                ' em vez de ${formatBRLFromCents(e.priceCents)}',
            if (e.nextChargeDate != null)
              'mensalidade de ${centerShortDay(e.nextChargeDate!)}',
            'depois volta ao valor normal',
          ].join(' · '),
          selected: _offer == 'discount',
          onTap: () => setState(() => _offer = 'discount'),
        ),
        const SizedBox(height: 8),
      ],
      for (final x in offers.plans) ...[
        _RadioOption(
          key: Key('center-cancel-offer-${x.planId}'),
          title: 'Trocar para ${x.name}',
          subtitle: [
            '${formatBRLFromCents(x.priceCents)}/mês',
            if (x.classesPerWeek != null) '${x.classesPerWeek}x por semana',
            'a partir do próximo ciclo',
          ].join(' · '),
          selected: _offer == x.planId,
          onTap: () => setState(() => _offer = x.planId),
        ),
        const SizedBox(height: 8),
      ],
      if (offers.pause) ...[
        _RadioOption(
          key: const Key('center-cancel-offer-pause'),
          title: 'Trancar por até $left dias',
          subtitle: 'Sem cobrança e com a vaga guardada',
          selected: _offer == 'pause',
          onTap: () => setState(() => _offer = 'pause'),
        ),
        const SizedBox(height: 8),
      ],
      const SizedBox(height: 4),
      ProfessorLinksCard(
        key: const Key('center-cancel-summary'),
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const ProfessorLinksKicker('Se cancelar'),
            const SizedBox(height: 4),
            TrainingKeyValueCard(
              rows: [
                (
                  'Último dia',
                  endsNow ? 'Hoje' : centerShortDay(last),
                  null,
                ),
                ('Novas cobranças', 'Nenhuma', null),
                if (credits > 0)
                  (
                    'Reposição',
                    '$credits crédito${credits == 1 ? '' : 's'} · '
                        '${endsNow ? 'vale só hoje' : 'usar até ${centerShortDay(last)}'}',
                    null,
                  ),
              ],
            ),
          ],
        ),
      ),
      const SizedBox(height: 16),
      if (_offer == 'discount' && discount != null)
        ProfessorLinksPrimaryButton(
          key: const Key('center-cancel-accept'),
          label: 'Ficar com $discount% de desconto',
          loading: _sending == 'retain',
          onPressed: _sending == null
              ? () => _submit(
                    offered: offered,
                    discount: true,
                    discountFrom: e.nextChargeDate,
                  )
              : null,
        )
      else if (_offer == 'pause')
        ProfessorLinksPrimaryButton(
          key: const Key('center-cancel-accept'),
          label: 'Trancar em vez de cancelar',
          onPressed: _sending == null ? _goPause : null,
        )
      else if (plan != null)
        ProfessorLinksPrimaryButton(
          key: const Key('center-cancel-accept'),
          label: 'Trocar para ${plan.name}',
          loading: _sending == 'retain',
          onPressed: _sending == null
              ? () => _submit(offered: offered, retain: plan)
              : null,
        ),
      const SizedBox(height: 8),
      ProfessorLinksGhostButton(
        key: const Key('center-cancel-confirm'),
        label: hasOffers ? 'Cancelar mesmo assim' : 'Confirmar cancelamento',
        color: AppColors.live,
        height: 44,
        loading: _sending == 'cancel',
        onPressed: _sending == null ? () => _submit(offered: offered) : null,
      ),
    ];
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Alta médica (pausa por lesão em curso, quando o centro exige)
// ─────────────────────────────────────────────────────────────────────────

/// Pede, recebe e mostra a alta médica na "Minha matrícula": aviso enquanto
/// falta tempo, formulário curto (arquivo ou foto + data de emissão) quando
/// o centro pede, e "em análise" / "aprovada" depois do envio.
class _ClearanceCard extends ConsumerStatefulWidget {
  const _ClearanceCard({
    super.key,
    required this.centerId,
    required this.request,
    required this.state,
    required this.todayKey,
  });

  final String centerId;
  final CenterEnrollmentRequest request;
  final CenterClearanceState state;
  final String todayKey;

  @override
  ConsumerState<_ClearanceCard> createState() => _ClearanceCardState();
}

class _ClearanceCardState extends ConsumerState<_ClearanceCard> {
  PickedCertificate? _file;

  /// `null` = hoje.
  String? _issuedOn;
  bool _sending = false;

  Future<void> _pick(CertificateSource source) async {
    try {
      final f = await ref.read(centerCertificatePickerProvider)(source);
      if (f == null || !mounted) return;
      if (f.sizeBytes > kCenterCertificateMaxBytes) {
        _snack(context, 'A alta pode ter até 10 MB.');
        return;
      }
      setState(() => _file = f);
    } catch (_) {
      if (mounted) {
        _snack(context, 'Não foi possível abrir o arquivo. Tente de novo.');
      }
    }
  }

  Future<void> _pickIssued() async {
    final today = DateTime.parse(widget.todayKey);
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime.parse(_issuedOn ?? widget.todayKey),
      firstDate: today.subtract(const Duration(days: 365)),
      lastDate: today,
    );
    if (picked == null || !mounted) return;
    final key = _dayKeyOf(picked);
    setState(() => _issuedOn = key == widget.todayKey ? null : key);
  }

  Future<void> _send() async {
    final file = _file!;
    setState(() => _sending = true);
    final repo = ref.read(trainingCentersRepositoryProvider);
    try {
      final path = await repo.uploadCertificate(
        centerId: widget.centerId,
        uid: ref.read(professorLinksUidProvider),
        bytes: file.bytes,
        fileName: file.fileName,
        contentType: file.contentType,
      );
      await repo.submitMedicalClearance(
        centerId: widget.centerId,
        requestId: widget.request.requestId,
        clearance: CenterCertificateUpload(
          path: path,
          fileName: file.fileName,
          contentType: file.contentType,
          sizeBytes: file.sizeBytes,
          issuedOn: _issuedOn ?? widget.todayKey,
          daysOff: 0,
        ),
      );
      await _reloadCenters(ref);
      if (!mounted) return;
      _snack(context, 'Alta enviada. O centro revisa e avisa pelo app.');
      setState(() => _file = null);
    } on ClassPresenceException catch (e) {
      if (mounted) _snack(context, e.message);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final r = widget.request;
    final back = r.endsOn == null ? null : centerShiftDay(r.endsOn!, 1);
    final (Color tone, String kicker, String title, String text) =
        switch (widget.state) {
      CenterClearanceState.later => (
          ProfessorLinksStyle.blue,
          'Alta médica',
          'O centro pede a alta para voltar',
          'Envie a alta médica a partir de $kCenterClearanceLeadDays dias '
              'antes do fim da pausa. O app avisa quando chegar a hora.',
        ),
      CenterClearanceState.needed => (
          AppColors.pending,
          'Alta médica',
          'Envie sua alta médica',
          r.awaitingClearance || back == null
              ? 'Suas aulas voltam quando o centro aprovar a alta.'
              : 'Sua pausa termina em ${centerShortDay(r.endsOn!)}. Envie a '
                  'alta para voltar em ${centerShortDay(back)}.',
        ),
      CenterClearanceState.submitted => (
          ProfessorLinksStyle.blue,
          'Alta médica',
          'Alta enviada · em análise',
          'O centro revisa e avisa pelo app.',
        ),
      CenterClearanceState.approved => (
          AppColors.win,
          'Alta médica',
          'Alta aprovada',
          back == null
              ? 'Sua volta está liberada.'
              : 'Suas aulas voltam em ${centerShortDay(back)}.',
        ),
    };
    final file = _file;
    return ProfessorLinksCard(
      borderColor: tone.withValues(alpha: 0.35),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ProfessorLinksKicker(kicker, color: colors.readableTone(tone)),
          const SizedBox(height: 8),
          Text(
            title,
            style: ProfessorLinksStyle.display(16, color: colors.onSurface),
          ),
          const SizedBox(height: 6),
          Text(
            text,
            style: AppTypography.bodyS.copyWith(
              fontSize: 12,
              height: 1.45,
              color: ProfessorLinksStyle.mute(colors),
            ),
          ),
          if (widget.state == CenterClearanceState.needed) ...[
            const SizedBox(height: 12),
            if (file != null) ...[
              _PickedFileRow(
                key: const Key('center-clearance-file'),
                file: file,
              ),
              const SizedBox(height: 8),
            ],
            Row(
              children: [
                Expanded(
                  child: ProfessorLinksGhostButton(
                    key: const Key('center-clearance-camera'),
                    label: 'Tirar foto',
                    height: 42,
                    onPressed:
                        _sending ? null : () => _pick(CertificateSource.camera),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: ProfessorLinksGhostButton(
                    key: const Key('center-clearance-pick-file'),
                    label: 'Escolher arquivo',
                    height: 42,
                    onPressed:
                        _sending ? null : () => _pick(CertificateSource.file),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            const ProfessorLinksKicker('Emitida em'),
            const SizedBox(height: 6),
            _Choice(
              key: const Key('center-clearance-issued'),
              label: centerShortDay(_issuedOn ?? widget.todayKey),
              selected: false,
              onTap: _pickIssued,
            ),
            const SizedBox(height: 12),
            ProfessorLinksPrimaryButton(
              key: const Key('center-clearance-send'),
              label: file == null ? 'Anexe a alta' : 'Enviar alta',
              loading: _sending,
              onPressed: file == null ? null : _send,
            ),
          ],
        ],
      ),
    );
  }
}

// ── peças ────────────────────────────────────────────────────────────────

/// Arquivo escolhido (atestado ou alta), pronto para enviar.
class _PickedFileRow extends StatelessWidget {
  const _PickedFileRow({super.key, required this.file});

  final PickedCertificate file;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ProfessorLinksCard(
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          Container(
            width: 46,
            height: 58,
            decoration: BoxDecoration(
              color: colors.surfaceRaised,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: ProfessorLinksStyle.line2(colors)),
            ),
            child: Icon(
              file.isPdf ? Icons.picture_as_pdf_outlined : Icons.image_outlined,
              color: ProfessorLinksStyle.mute(colors),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  file.fileName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: ProfessorLinksStyle.display(
                    13.5,
                    weight: FontWeight.w600,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  '${file.isPdf ? 'PDF' : 'Foto'} · '
                  '${centerFileSizeLabel(file.sizeBytes)}',
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 11,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
              ],
            ),
          ),
          Text(
            'PRONTO',
            style: ProfessorLinksStyle.mono(
              9.5,
              color: colors.readableTone(AppColors.win),
            ),
          ),
        ],
      ),
    );
  }
}

class _RadioOption extends StatelessWidget {
  const _RadioOption({
    super.key,
    required this.title,
    required this.selected,
    required this.onTap,
    this.subtitle,
  });

  final String title;
  final String? subtitle;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ProfessorLinksCard(
      onTap: onTap,
      borderColor: selected ? AppColors.brand : null,
      backgroundColor:
          selected ? AppColors.brand.withValues(alpha: 0.08) : null,
      child: Row(
        children: [
          Container(
            width: 20,
            height: 20,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(
                width: 2,
                color: selected
                    ? AppColors.brand
                    : ProfessorLinksStyle.line2(colors),
              ),
            ),
            child: selected
                ? Center(
                    child: Container(
                      width: 10,
                      height: 10,
                      decoration: const BoxDecoration(
                        shape: BoxShape.circle,
                        color: AppColors.brand,
                      ),
                    ),
                  )
                : null,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: ProfessorLinksStyle.display(
                    14,
                    weight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
                if (subtitle != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    subtitle!,
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 11.5,
                      height: 1.4,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Choice extends StatelessWidget {
  const _Choice({
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
    return Material(
      color: selected
          ? AppColors.brand.withValues(alpha: 0.12)
          : ProfessorLinksStyle.soft(colors),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(
          color: selected ? AppColors.brand : ProfessorLinksStyle.line(colors),
        ),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: SizedBox(
          height: 46,
          child: Center(
            child: Text(
              label,
              style: ProfessorLinksStyle.display(
                14,
                weight: FontWeight.w600,
                color: selected ? colors.brandText : colors.onSurface,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Field extends StatelessWidget {
  const _Field({
    super.key,
    required this.controller,
    required this.hint,
    this.number = false,
    this.lines = 1,
    this.onChanged,
  });

  final TextEditingController controller;
  final String hint;
  final bool number;
  final int lines;
  final ValueChanged<String>? onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final border = OutlineInputBorder(
      borderRadius: BorderRadius.circular(14),
      borderSide: BorderSide(color: ProfessorLinksStyle.line2(colors)),
    );
    return TextField(
      controller: controller,
      minLines: lines,
      maxLines: lines == 1 ? 1 : 5,
      maxLength: number ? 3 : 400,
      keyboardType: number ? TextInputType.number : TextInputType.text,
      inputFormatters: number ? [FilteringTextInputFormatter.digitsOnly] : null,
      onChanged: onChanged,
      style: AppTypography.bodyS.copyWith(color: colors.onSurface),
      decoration: InputDecoration(
        hintText: hint,
        counterText: '',
        filled: true,
        fillColor: ProfessorLinksStyle.soft(colors),
        border: border,
        enabledBorder: border,
      ),
    );
  }
}
