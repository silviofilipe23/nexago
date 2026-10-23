import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/formatting/app_currency_format.dart';
import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/time/nexago_event_timezone.dart';
import '../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../professor_links/application/professor_links_providers.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/presentation/availability/availability_widgets.dart';
import '../../professor_mode/presentation/widgets/professor_students_widgets.dart';
import '../application/center_coach_providers.dart';
import '../domain/center_coach.dart';
import '../domain/center_coach_repository.dart';
import '../domain/center_finance.dart';
import '../domain/center_students.dart';
import '../infrastructure/firebase_center_coach_repository.dart';
import 'center_coach_finance_page.dart' show centerInvoiceToneColor;

/// G16 · A cobrança e a confirmação manual do pagamento (owner/admin): como
/// foi pago, comprovante e motivo — fica na auditoria e na linha do tempo da
/// cobrança; a matrícula pendente dela é ativada junto. O servidor apaga a
/// fatura do Asaas que ficou em aberto (e estorna se ela for paga depois).
class CenterCoachInvoicePage extends ConsumerStatefulWidget {
  const CenterCoachInvoicePage({
    super.key,
    required this.centerId,
    required this.invoiceId,
  });

  final String centerId;
  final String invoiceId;

  @override
  ConsumerState<CenterCoachInvoicePage> createState() =>
      _CenterCoachInvoicePageState();
}

class _CenterCoachInvoicePageState
    extends ConsumerState<CenterCoachInvoicePage> {
  String? _method;
  final _proof = TextEditingController();
  final _reason = TextEditingController();
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _proof.dispose();
    _reason.dispose();
    super.dispose();
  }

  Future<void> _confirm(CenterCoachInvoice inv) async {
    final err = centerManualConfirmError(
      method: _method,
      proof: _proof.text,
      reason: _reason.text,
    );
    if (err != null) {
      setState(() => _error = err);
      return;
    }
    final member = ref.read(centerMembershipProvider(widget.centerId));
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(centerCoachRepositoryProvider).confirmInvoiceManually(
            centerId: widget.centerId,
            invoice: inv,
            method: _method!,
            proof: _proof.text,
            reason: _reason.text,
            actorUid: ref.read(professorLinksUidProvider),
            actorName: (member?.displayName.isNotEmpty ?? false)
                ? member!.displayName
                : 'Equipe',
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Pagamento de ${formatBRLFromCents(inv.amountCents)} confirmado.',
          ),
        ),
      );
    } on CenterCoachException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final centerId = widget.centerId;
    final member = ref.watch(centerMembershipProvider(centerId));
    final center = ref.watch(coachCenterProvider(centerId)).valueOrNull;
    final today = nexagoEventDayKey(ref.watch(professorLinksClockProvider)());
    final async = ref.watch(coachInvoicesProvider(centerId));
    CenterCoachInvoice? inv;
    for (final i in async.valueOrNull ?? const <CenterCoachInvoice>[]) {
      if (i.id == widget.invoiceId) inv = i;
    }
    CenterCoachEnrollment? enrollment;
    for (final e in ref.watch(coachEnrollmentsProvider(centerId)).valueOrNull ??
        const <CenterCoachEnrollment>[]) {
      if (inv != null && e.id == inv.enrollmentId) enrollment = e;
    }
    final studentName = inv == null
        ? ''
        : ref
                .watch(coachStudentsProvider(centerId))
                .valueOrNull?[inv.studentId]
                ?.name ??
            '';
    final name = inv == null
        ? ''
        : (inv.payerName.isNotEmpty ? inv.payerName : studentName);
    final canConfirm = inv != null &&
        inv.status == 'pending' &&
        (member?.isManager ?? false) &&
        !(center?.isSuspended ?? false);
    final activates = enrollment?.status == 'pending';

    return ProfessorLinksScaffold(
      title: canConfirm ? 'Confirmar pagamento' : 'Cobrança',
      subtitle: inv == null
          ? null
          : [
              if (name.isNotEmpty) name,
              if (inv.reference.isNotEmpty) inv.reference,
            ].join(' · ').toUpperCase(),
      onBack: () => popOrGo(context, AppRoutes.centerCoachAgenda),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
              children: [
                if (member == null || !member.has('view_finance'))
                  const ProfessorLinksCard(
                    key: Key('center-invoice-denied'),
                    child: ProfessorMutedText(
                      'O financeiro do centro fica com quem tem essa '
                      'permissão.',
                    ),
                  )
                else if (async.isLoading && async.valueOrNull == null)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 40),
                    child: Center(
                      child: CircularProgressIndicator(color: AppColors.brand),
                    ),
                  )
                else if (inv == null)
                  const ProfessorLinksCard(
                    key: Key('center-invoice-missing'),
                    child: ProfessorMutedText('Cobrança não encontrada.'),
                  )
                else ...[
                  _AmountCard(invoice: inv, today: today),
                  const SizedBox(height: 12),
                  ProfessorRowsBlock(
                    children: [
                      if (name.isNotEmpty)
                        ProfessorInfoRow(label: 'Aluno', value: name),
                      ProfessorInfoRow(
                        label: 'Vencimento',
                        value: centerDayMonth(inv.dueDate),
                      ),
                      if (inv.status != 'pending')
                        ProfessorInfoRow(
                          key: const Key('center-invoice-situation'),
                          label: 'Situação',
                          value: centerInvoiceStatusLine(
                            inv,
                            todayKey: today,
                            now: ref.watch(professorLinksClockProvider)(),
                            localDayKey: nexagoEventDayKey,
                          ),
                        ),
                      ProfessorInfoRow(
                        label: 'Forma de cobrança',
                        value: inv.providerRef.isNotEmpty
                            ? 'Online (Pix/cartão)'
                            : 'Direto no centro',
                        last: enrollment == null,
                      ),
                      if (enrollment != null)
                        ProfessorInfoRow(
                          label: 'Matrícula',
                          value:
                              '${enrollment.className.isEmpty ? 'Turma' : enrollment.className} · '
                              '${kCenterEnrollmentStatusLabels[enrollment.status] ?? enrollment.status}',
                          last: true,
                        ),
                    ],
                  ),
                  if (inv.studentId.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    ProfessorLinksGhostButton(
                      key: const Key('center-invoice-student'),
                      label: 'Ver aluno',
                      height: 40,
                      onPressed: () => context.pushNamed(
                        AppRouteNames.centerCoachStudent,
                        pathParameters: {
                          'centerId': centerId,
                          'studentId': inv!.studentId,
                        },
                      ),
                    ),
                  ],
                  if (canConfirm) ...[
                    const SizedBox(height: 18),
                    _Kicker('Como foi pago'),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        for (final (v, label, _) in kCenterManualMethods)
                          AvailabilityChoiceChip(
                            key: Key('center-invoice-method-$v'),
                            label: label,
                            selected: _method == v,
                            onTap: () => setState(() => _method = v),
                          ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    _Kicker('Comprovante · obrigatório'),
                    const SizedBox(height: 8),
                    _Field(
                      key: const Key('center-invoice-proof'),
                      controller: _proof,
                      hint: 'Ex.: E2E 1234… ou recibo 0042',
                    ),
                    const SizedBox(height: 16),
                    _Kicker('Motivo'),
                    const SizedBox(height: 8),
                    _Field(
                      key: const Key('center-invoice-reason'),
                      controller: _reason,
                      hint: 'Ex.: pagou por Pix na chave do centro',
                      lines: 3,
                    ),
                    const SizedBox(height: 14),
                    ProfessorLinksNote(
                      'Fica registrado seu nome, o horário, o comprovante e o '
                      'motivo.'
                      '${inv.providerRef.isNotEmpty ? ' A cobrança online em aberto é cancelada para não cobrar duas vezes.' : ''}',
                      tone: ProfessorLinksNoteTone.blue,
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 10),
                      ProfessorLinksNote(
                        _error!,
                        key: const Key('center-invoice-error'),
                        tone: ProfessorLinksNoteTone.red,
                      ),
                    ],
                  ] else if (inv.status == 'pending' &&
                      !(member.isManager)) ...[
                    const SizedBox(height: 12),
                    const ProfessorLinksNote(
                      'Só o owner ou um admin do centro confirma pagamento à '
                      'mão.',
                      tone: ProfessorLinksNoteTone.blue,
                    ),
                  ],
                  if (inv.events.isNotEmpty) ...[
                    const SizedBox(height: 18),
                    _Kicker('Linha do tempo'),
                    const SizedBox(height: 8),
                    ProfessorLinksCard(
                      key: const Key('center-invoice-timeline'),
                      padding: const EdgeInsets.all(14),
                      child: ProfessorLinkTimeline(
                        entries: [
                          for (final e in inv.events.reversed)
                            ProfessorLinkTimelineEntry(
                              title: [
                                e.title.isEmpty ? 'Evento' : e.title,
                                if (e.detail.isNotEmpty) e.detail,
                              ].join(' · '),
                              meta: [
                                if (e.at != null) _when(e.at!),
                                if (e.byName.isNotEmpty) e.byName,
                              ].join(' · ').toUpperCase(),
                            ),
                        ],
                      ),
                    ),
                  ],
                ],
              ],
            ),
          ),
          if (canConfirm)
            SafeArea(
              top: false,
              child: Container(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
                decoration: BoxDecoration(
                  color: colors.canvas,
                  border: Border(
                    top: BorderSide(color: ProfessorLinksStyle.line(colors)),
                  ),
                ),
                child: ProfessorLinksPrimaryButton(
                  key: const Key('center-invoice-confirm'),
                  label: 'Confirmar ${formatBRLFromCents(inv.amountCents)}'
                      '${activates ? ' e ativar matrícula' : ''}',
                  loading: _busy,
                  onPressed: _busy ? null : () => _confirm(inv!),
                ),
              ),
            ),
        ],
      ),
    );
  }

  static String _when(DateTime at) {
    final l = toNexagoEventLocal(at);
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(l.day)}/${two(l.month)} ${two(l.hour)}:${two(l.minute)}';
  }
}

class _Kicker extends StatelessWidget {
  const _Kicker(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Text(
        text.toUpperCase(),
        style: ProfessorLinksStyle.mono(
          10,
          color: ProfessorLinksStyle.dim(context.themeColors),
        ).copyWith(letterSpacing: 0.6),
      );
}

class _Field extends StatelessWidget {
  const _Field({
    super.key,
    required this.controller,
    required this.hint,
    this.lines = 1,
  });

  final TextEditingController controller;
  final String hint;
  final int lines;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final border = OutlineInputBorder(
      borderRadius: BorderRadius.circular(13),
      borderSide: BorderSide(color: ProfessorLinksStyle.line2(colors)),
    );
    return TextField(
      controller: controller,
      minLines: lines,
      maxLines: lines == 1 ? 1 : 5,
      style: AppTypography.bodyS.copyWith(color: colors.onSurface),
      decoration: InputDecoration(
        hintText: hint,
        filled: true,
        fillColor: ProfessorLinksStyle.soft(colors),
        border: border,
        enabledBorder: border,
      ),
    );
  }
}

class _AmountCard extends StatelessWidget {
  const _AmountCard({required this.invoice, required this.today});

  final CenterCoachInvoice invoice;
  final String today;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final (label, tone) = centerInvoiceTag(invoice, today);
    return ProfessorLinksCard(
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'COBRANÇA',
                  style: ProfessorLinksStyle.mono(
                    9.5,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  formatBRLFromCents(invoice.amountCents),
                  key: const Key('center-invoice-amount'),
                  style: ProfessorLinksStyle.display(
                    24,
                    color: colors.onSurface,
                  ),
                ),
                if (invoice.refundedCents > 0) ...[
                  const SizedBox(height: 2),
                  Text(
                    'Estornado ${formatBRLFromCents(invoice.refundedCents)}',
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 11.5,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                ],
              ],
            ),
          ),
          ArenaClassTag(
            key: const Key('center-invoice-status'),
            label: label,
            color: centerInvoiceToneColor(tone, colors),
          ),
        ],
      ),
    );
  }
}
