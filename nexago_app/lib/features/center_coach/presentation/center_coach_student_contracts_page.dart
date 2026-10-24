import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/time/nexago_event_timezone.dart';
import '../../athlete_training/domain/center_contract.dart';
import '../../athlete_training/presentation/widgets/center_contract_widgets.dart';
import '../../professor_links/application/professor_links_providers.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/presentation/widgets/professor_students_widgets.dart';
import '../application/center_coach_providers.dart';
import '../application/center_management_providers.dart';
import '../domain/center_coach.dart';
import '../domain/center_coach_repository.dart' show CenterCoachException;
import '../domain/center_contracts.dart';
import '../domain/center_students.dart' show centerContactPhone;
import '../infrastructure/firebase_center_contracts_repository.dart';
import 'center_coach_student_page.dart' show centerContactLauncherProvider;

/// K5 · Contratos do aluno (gestão): o pendente em destaque, os documentos
/// vigentes/abertos e o histórico. Lembrete pela callable (1 por hora),
/// WhatsApp do aluno (do responsável no menor) e o texto do documento.
/// Enviar e encerrar contratos ficam no portal.
class CenterCoachStudentContractsPage extends ConsumerStatefulWidget {
  const CenterCoachStudentContractsPage({
    super.key,
    required this.centerId,
    required this.studentId,
  });

  final String centerId;
  final String studentId;

  @override
  ConsumerState<CenterCoachStudentContractsPage> createState() =>
      _CenterCoachStudentContractsPageState();
}

class _CenterCoachStudentContractsPageState
    extends ConsumerState<CenterCoachStudentContractsPage> {
  bool _reminding = false;

  ({String centerId, String studentId}) get _key =>
      (centerId: widget.centerId, studentId: widget.studentId);

  void _snack(String text) => ScaffoldMessenger.maybeOf(context)
    ?..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(text)));

  Future<void> _remind(CenterStudentContract c) async {
    setState(() => _reminding = true);
    try {
      await ref
          .read(centerContractsRepositoryProvider)
          .remind(centerId: widget.centerId, contractId: c.id);
      if (mounted) _snack('Lembrete enviado para o app do aluno.');
    } on CenterCoachException catch (e) {
      if (mounted) _snack(e.message);
    } finally {
      if (mounted) setState(() => _reminding = false);
    }
  }

  void _openDocument(CenterStudentContract c, String centerName) =>
      Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) =>
              CenterContractDocumentPage(contract: c, centerName: centerName),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final member = ref.watch(centerMembershipProvider(widget.centerId));
    final allowed = member != null && member.has('enroll_students');
    final now = ref.watch(professorLinksClockProvider)();
    final today = nexagoEventDayKey(now);
    final student = ref
        .watch(coachStudentsProvider(widget.centerId))
        .valueOrNull?[widget.studentId];
    final async = ref.watch(centerStudentContractsProvider(_key));
    final groups = centerContractGroups(
      async.valueOrNull ?? const [],
      today,
    );
    final pending = groups.pending;
    final className = pending?.className ??
        (groups.current.isEmpty ? '' : groups.current.first.className);
    final centerName = member?.centerName ?? 'Centro de treinamento';
    final doc = pending ??
        (groups.current.isNotEmpty
            ? groups.current.first
            : groups.history.isNotEmpty
                ? groups.history.first
                : null);

    final list = ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
      children: [
        if (!allowed)
          const ProfessorLinksCard(
            key: Key('center-contracts-no-access'),
            child: ProfessorMutedText(
              'Os contratos ficam com quem matricula alunos neste centro.',
            ),
          )
        else if (async.isLoading && async.valueOrNull == null)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 40),
            child: Center(
              child: CircularProgressIndicator(color: AppColors.brand),
            ),
          )
        else if (async.hasError && async.valueOrNull == null)
          ProfessorRetryCard(
            message: 'Não foi possível carregar os contratos.',
            onRetry: () => ref.invalidate(centerStudentContractsProvider(_key)),
          )
        else if (groups.isEmpty)
          const ProfessorLinksCard(
            key: Key('center-contracts-empty'),
            child: ProfessorMutedText(
              'Nenhum contrato enviado para este aluno. O envio é feito no '
              'portal do centro.',
            ),
          )
        else ...[
          if (pending != null) ...[
            ContractHighlightCard(
              key: const Key('center-contracts-pending'),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: ProfessorLinksKicker(
                          'Contrato pendente',
                          color: colors.readableTone(AppColors.brand),
                        ),
                      ),
                      Text(
                        centerContractPendingBadge(
                          centerContractPendingDays(pending, now) ?? 0,
                        ),
                        key: const Key('center-contracts-pending-days'),
                        style: ProfessorLinksStyle.mono(
                          10,
                          color: colors.readableTone(AppColors.brand),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    pending.displayName,
                    style: ProfessorLinksStyle.display(
                      18,
                      color: colors.onSurface,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    centerContractPendingText(pending, now),
                    key: const Key('center-contracts-pending-text'),
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 12,
                      height: 1.45,
                      color: ProfessorLinksStyle.mute(colors),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 4),
          ],
          if (groups.current.isNotEmpty) ...[
            _Section('Documentos'),
            ContractDocList(
              children: [
                for (final (i, c) in groups.current.indexed)
                  _row(context, c, now, today, centerName, first: i == 0),
              ],
            ),
          ],
          if (groups.history.isNotEmpty) ...[
            _Section('Histórico'),
            ContractDocList(
              children: [
                for (final (i, c) in groups.history.indexed)
                  _row(
                    context,
                    c,
                    now,
                    today,
                    centerName,
                    first: i == 0,
                    history: true,
                  ),
              ],
            ),
          ],
        ],
      ],
    );

    final phone = student == null ? '' : centerContactPhone(student);
    final whatsapp = centerWhatsappUri(
      phone,
      message: pending == null || student == null
          ? ''
          : _whatsappMessage(student, centerName),
    );
    final launch = ref.read(centerContactLauncherProvider);
    final showFooter = allowed && doc != null;

    return ProfessorLinksScaffold(
      title: 'Contratos',
      subtitle: [
        student?.name ?? '',
        className,
      ].where((s) => s.isNotEmpty).join(' · ').toUpperCase(),
      onBack: () => popOrGo(
        context,
        AppRoutes.centerCoachStudent
            .replaceFirst(':centerId', widget.centerId)
            .replaceFirst(':studentId', widget.studentId),
      ),
      body: !showFooter
          ? list
          : Column(
              children: [
                Expanded(child: list),
                Container(
                  padding: EdgeInsets.fromLTRB(
                    20,
                    12,
                    20,
                    12 + MediaQuery.paddingOf(context).bottom,
                  ),
                  decoration: BoxDecoration(
                    color: colors.canvas,
                    border: Border(
                      top: BorderSide(color: ProfessorLinksStyle.line(colors)),
                    ),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (pending != null) ...[
                        ProfessorLinksPrimaryButton(
                          key: const Key('center-contracts-remind'),
                          label: 'Reenviar lembrete',
                          loading: _reminding,
                          onPressed: () => _remind(pending),
                        ),
                        const SizedBox(height: 8),
                      ],
                      Row(
                        children: [
                          Expanded(
                            child: ProfessorLinksGhostButton(
                              key: const Key('center-contracts-whatsapp'),
                              label: 'WhatsApp',
                              height: 44,
                              onPressed: whatsapp == null
                                  ? null
                                  : () => launch(whatsapp),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: ProfessorLinksGhostButton(
                              key: const Key('center-contracts-view'),
                              label: 'Ver documento',
                              height: 44,
                              onPressed: () => _openDocument(doc, centerName),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
    );
  }

  Widget _row(
    BuildContext context,
    CenterStudentContract c,
    DateTime now,
    String today,
    String centerName, {
    required bool first,
    bool history = false,
  }) {
    final st = c.state(today);
    final colors = context.themeColors;
    return ContractDocRow(
      key: Key('center-contracts-row-${c.id}'),
      first: first,
      title: c.displayName,
      subtitle: centerContractRowLine(c, now),
      color: history
          ? ProfessorLinksStyle.dim(colors)
          : contractToneColor(contractStateTone(st), colors),
      trailing: history
          ? null
          : ContractStateTag(st, label: contractStateShortLabel(st)),
      onTap: () => _openDocument(c, centerName),
    );
  }
}

String _whatsappMessage(CenterCoachStudent s, String centerName) {
  final toGuardian = s.isMinor && s.guardianName.isNotEmpty;
  final who = (toGuardian ? s.guardianName : s.name).trim().split(' ').first;
  return 'Oi, $who! O contrato '
      '${toGuardian ? 'de ${s.name.trim().split(' ').first} ' : ''}'
      'no $centerName está esperando a assinatura no app NexaGO '
      '(Treinos > Centro > Contratos).';
}

class _Section extends StatelessWidget {
  const _Section(this.title);

  final String title;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 18, bottom: 8),
        child: ProfessorLinksKicker(title),
      );
}

/// "Ver documento": o texto congelado do contrato, as assinaturas e a trilha.
class CenterContractDocumentPage extends ConsumerWidget {
  const CenterContractDocumentPage({
    super.key,
    required this.contract,
    required this.centerName,
  });

  final CenterStudentContract contract;
  final String centerName;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final c = contract;
    final now = ref.watch(professorLinksClockProvider)();
    final st = c.state(nexagoEventDayKey(now));
    String wall(DateTime? t) =>
        t == null ? '' : contractWallLabel(toNexagoEventLocal(t));
    final signed = c.status == 'signed' || c.status == 'terminated';
    return ProfessorLinksScaffold(
      title: c.displayName,
      subtitle: [
        if (c.number.isNotEmpty) c.number,
        c.studentName,
      ].join(' · ').toUpperCase(),
      onBack: () => Navigator.of(context).maybePop(),
      body: ListView(
        key: const Key('center-contract-document'),
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          Row(
            children: [
              ContractStateTag(st),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  contractTermLabel(c.startDate, c.endDate),
                  style: ProfessorLinksStyle.mono(
                    10,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (c.essentials.isNotEmpty) ...[
            ContractEssentialsCard(rows: c.essentials),
            const SizedBox(height: 4),
          ],
          const _Section('Texto completo'),
          ContractPaper(
            title: c.title,
            meta: [
              if (c.number.isNotEmpty) c.number,
              'v${c.templateVersion}',
            ].join(' · '),
            body: c.body,
            signatures: signed
                ? [
                    (
                      c.signerName,
                      '${c.asGuardian ? 'Responsável legal' : 'Aluno'} · '
                          '${wall(c.signedAt)}',
                    ),
                    (
                      c.centerSignatureName.isEmpty
                          ? centerName
                          : c.centerSignatureName,
                      'Assinatura do centro · '
                          '${wall(c.centerSignatureAt ?? c.signedAt)}',
                    ),
                  ]
                : const [],
          ),
          if (c.events.isNotEmpty) ...[
            const _Section('Linha do tempo'),
            ProfessorLinkTimeline(
              entries: [
                for (final e in c.events.reversed)
                  ProfessorLinkTimelineEntry(
                    title: e.title.isEmpty ? e.type : e.title,
                    meta: [
                      if (e.at != null) centerContractWhen(e.at!, now),
                      if (e.byName.isNotEmpty) e.byName,
                      if (e.detail.isNotEmpty) e.detail,
                    ].join(' · '),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
