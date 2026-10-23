import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/formatting/app_currency_format.dart';
import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/time/nexago_event_timezone.dart';
import '../../arena/domain/aulas/arena_class_logic.dart';
import '../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../professor_links/application/professor_links_providers.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/presentation/widgets/professor_students_widgets.dart';
import '../application/center_coach_providers.dart';
import '../domain/center_coach.dart';
import '../domain/center_students.dart';
import '../application/center_management_providers.dart';
import '../domain/center_management.dart';
import '../../messages/application/messages_providers.dart'
    show messagesRepositoryProvider;
import '../../messages/presentation/messages_widgets.dart'
    show openConversationWith;
import 'center_coach_subscription_page.dart' show CenterSubscriptionsCard;
import 'widgets/center_coach_widgets.dart' show coachClassScheduleLabel;

/// Abre ligação ou e-mail (trocável nos testes).
final centerContactLauncherProvider = Provider<Future<bool> Function(Uri)>(
  (ref) => (uri) => launchUrl(uri, mode: LaunchMode.externalApplication),
);

const _kMonths = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

/// G10 · Perfil do aluno: contato (o do responsável quando é menor),
/// matrículas, cobranças (só com financeiro), presença e reposições.
/// Matricular e cobrar ficam no portal.
class CenterCoachStudentPage extends ConsumerWidget {
  const CenterCoachStudentPage({
    super.key,
    required this.centerId,
    required this.studentId,
  });

  final String centerId;
  final String studentId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final member = ref.watch(centerMembershipProvider(centerId));
    final today = nexagoEventDayKey(ref.watch(professorLinksClockProvider)());
    final studentsAsync = ref.watch(coachStudentsProvider(centerId));
    final student = studentsAsync.valueOrNull?[studentId];
    final seesEnrollments =
        member != null && (member.isManager || member.has('enroll_students'));
    final enrollments = [
      for (final e
          in ref.watch(coachEnrollmentsProvider(centerId)).valueOrNull ??
              const <CenterCoachEnrollment>[])
        if (e.studentId == studentId) e,
    ]..sort((a, b) => b.startDate.compareTo(a.startDate));
    final classes =
        ref.watch(coachClassesProvider(centerId)).valueOrNull ?? const [];
    final allInvoices = ref.watch(coachInvoicesProvider(centerId)).valueOrNull;
    final invoices = allInvoices == null
        ? null
        : ([
            for (final i in allInvoices)
              if (i.studentId == studentId) i,
          ]..sort((a, b) => b.dueDate.compareTo(a.dueDate)));
    final sessions = ref
            .watch(
              coachSessionsProvider((
                centerId: centerId,
                fromKey: coachShiftDay(today, -60),
                toKey: today,
              )),
            )
            .valueOrNull ??
        const <CenterCoachSession>[];
    final marks = centerStudentMarks(sessions, studentId, today);
    final subscriptions =
        ref
            .watch(
              centerStudentSubscriptionsProvider((
                centerId: centerId,
                studentId: studentId,
              )),
            )
            .valueOrNull ??
        const <CenterSubscription>[];
    final canEnroll =
        (member?.has('enroll_students') ?? false) && student != null;

    final list = ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          if (member == null || !member.isActive)
            const ProfessorLinksCard(
              child: ProfessorMutedText('Sem acesso a este centro.'),
            )
          else if (studentsAsync.isLoading && studentsAsync.valueOrNull == null)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 40),
              child: Center(
                child: CircularProgressIndicator(color: AppColors.brand),
              ),
            )
          else if (student == null)
            const ProfessorLinksCard(
              key: Key('center-student-missing'),
              child: ProfessorMutedText(
                'Aluno não encontrado — ou ele não está nas suas turmas.',
              ),
            )
          else ...[
            _Header(
              student: student,
              finance:
                  invoices == null ? null : centerFinanceOf(invoices, today),
              subtitle: _subtitle(student, today),
            ),
            const SizedBox(height: 14),
            _ContactButtons(centerId: centerId, student: student),
            if (student.isMinor && student.guardianName.isNotEmpty) ...[
              const SizedBox(height: 10),
              ProfessorLinksNote(
                'Responsável: ${student.guardianName}'
                '${student.guardianRelation.isEmpty ? '' : ' (${student.guardianRelation})'}'
                ' · Ligar vai para o responsável; mensagem pelo app só '
                'com aluno maior.',
              ),
            ],
            if (student.billingHold) ...[
              const SizedBox(height: 10),
              const ProfessorLinksNote(
                'Mensalidade em atraso: o check-in deste aluno mostra a '
                'pendência para a recepção decidir.',
                tone: ProfessorLinksNoteTone.yellow,
              ),
            ],
            const SizedBox(height: 16),
            if (seesEnrollments)
              ..._enrollmentCards(
                context,
                enrollments,
                showPrice: invoices != null,
                makeupCredits: student.makeupCredits,
              )
            else
              _ClassesCard(
                classes: [
                  for (final c in classes)
                    if (c.rosterStudentIds.contains(studentId)) c,
                ],
                makeupCredits: student.makeupCredits,
              ),
            if (subscriptions.isNotEmpty) ...[
              const SizedBox(height: 12),
              CenterSubscriptionsCard(
                subscriptions: subscriptions,
                onOpen: (id) => context.pushNamed(
                  AppRouteNames.centerCoachSubscription,
                  pathParameters: {
                    'centerId': centerId,
                    'studentId': studentId,
                    'subscriptionId': id,
                  },
                ),
              ),
            ],
            if (invoices != null) ...[
              const SizedBox(height: 12),
              _InvoicesCard(
                invoices: invoices,
                todayKey: today,
                onOpen: (id) => context.pushNamed(
                  AppRouteNames.centerCoachInvoice,
                  pathParameters: {'centerId': centerId, 'invoiceId': id},
                ),
              ),
            ],
            const SizedBox(height: 12),
            _PresenceCard(marks: marks),
            const SizedBox(height: 12),
            Text(
              'Dados cadastrais e planos ficam no portal do centro.',
              textAlign: TextAlign.center,
              style: AppTypography.bodyS.copyWith(
                fontSize: 11.5,
                color: ProfessorLinksStyle.dim(colors),
              ),
            ),
          ],
        ],
      );

    return ProfessorLinksScaffold(
      title: 'Aluno',
      onBack: () => popOrGo(context, AppRoutes.centerCoachAgenda),
      body: !canEnroll
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
                  child: ProfessorLinksPrimaryButton(
                    key: const Key('center-student-enroll'),
                    label: 'Nova matrícula',
                    onPressed: () => context.pushNamed(
                      AppRouteNames.centerCoachEnroll,
                      pathParameters: {'centerId': centerId},
                      queryParameters: {'aluno': studentId},
                    ),
                  ),
                ),
              ],
            ),
    );
  }

  static String _subtitle(CenterCoachStudent s, String today) {
    final age = centerAgeOn(s.birthDate, today);
    final at = s.createdAt == null ? null : toNexagoEventLocal(s.createdAt!);
    return [
      s.isMinor ? 'Aluno menor' : 'Aluno',
      if (age != null) '$age anos',
      if (at != null) 'desde ${_kMonths[at.month - 1]} ${at.year}',
      s.uid.isNotEmpty ? 'conta NexaGO' : 'sem conta NexaGO',
    ].join(' · ');
  }

  List<Widget> _enrollmentCards(
    BuildContext context,
    List<CenterCoachEnrollment> list, {
    required bool showPrice,
    required int makeupCredits,
  }) {
    if (list.isEmpty) {
      return [
        const ProfessorLinksCard(
          key: Key('center-student-no-enrollment'),
          child: ProfessorMutedText('Sem matrícula neste centro.'),
        ),
      ];
    }
    final current = centerCurrentEnrollments(list);
    final past = [
      for (final e in list)
        if (!current.contains(e)) e,
    ];
    return [
      for (final e in current) ...[
        _EnrollmentCard(
          key: Key('center-student-enrollment-${e.id}'),
          enrollment: e,
          showPrice: showPrice,
          makeupCredits: makeupCredits,
        ),
        const SizedBox(height: 10),
      ],
      if (past.isNotEmpty) ...[
        Text(
          'MATRÍCULAS ANTERIORES',
          style: ProfessorLinksStyle.mono(
            10,
            color: ProfessorLinksStyle.dim(context.themeColors),
          ).copyWith(letterSpacing: 0.6),
        ),
        const SizedBox(height: 8),
        ProfessorRowsBlock(
          children: [
            for (final (i, e) in past.indexed)
              ProfessorInfoRow(
                label: e.className.isEmpty ? 'Turma' : e.className,
                sub: e.planName.isEmpty ? null : e.planName.toUpperCase(),
                value: kCenterEnrollmentStatusLabels[e.status] ?? e.status,
                valueColor: ProfessorLinksStyle.dim(context.themeColors),
                last: i == past.length - 1,
              ),
          ],
        ),
      ],
    ];
  }
}

Color _enrollmentColor(String status, AppThemeColors colors) =>
    switch (status) {
      'active' => AppColors.win,
      'pending' => AppColors.pending,
      'waitlisted' => AppColors.brand,
      'cancelled' => AppColors.live,
      _ => ProfessorLinksStyle.dim(colors),
    };

class _Header extends StatelessWidget {
  const _Header({
    required this.student,
    required this.finance,
    required this.subtitle,
  });

  final CenterCoachStudent student;
  final CenterFinanceSummary? finance;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final s = student;
    final statusColor = switch (s.status) {
      'active' => AppColors.win,
      'invited' => AppColors.brand,
      'blocked' => AppColors.live,
      _ => ProfessorLinksStyle.dim(colors),
    };
    final f = finance;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ArenaClassAvatar(initials: arenaClassInitials(s.name), size: 62),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                s.name,
                key: const Key('center-student-name'),
                style: ProfessorLinksStyle.display(
                  20,
                  color: colors.onSurface,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                subtitle,
                style: AppTypography.bodyS.copyWith(
                  fontSize: 12,
                  color: ProfessorLinksStyle.dim(colors),
                ),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  ArenaClassTag(
                    label: kCenterStudentStatusLabels[s.status] ?? s.status,
                    color: statusColor,
                  ),
                  if (f != null)
                    ArenaClassTag(
                      key: const Key('center-student-finance'),
                      label: centerFinanceLabel(f.state),
                      color: switch (f.state) {
                        CenterFinanceState.ok => AppColors.win,
                        CenterFinanceState.pending => AppColors.pending,
                        CenterFinanceState.late => AppColors.live,
                      },
                    )
                  else if (s.billingHold)
                    const ArenaClassTag(
                      label: 'Pendência',
                      color: AppColors.live,
                    ),
                  if (s.isMinor)
                    const ArenaClassTag(
                      label: 'Menor',
                      color: ProfessorLinksStyle.blue,
                    ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _ContactButtons extends ConsumerWidget {
  const _ContactButtons({required this.centerId, required this.student});

  final String centerId;
  final CenterCoachStudent student;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final phone = centerContactPhone(student);
    // Mensagem pelo chat do app (no lugar do WhatsApp): aluno maior, ativo e
    // com conta NexaGO.
    final chat = centerStudentCanChat(student);
    final email = student.isMinor && student.guardianPhone.isNotEmpty
        ? ''
        : student.email;
    final launch = ref.read(centerContactLauncherProvider);
    final items = [
      if (chat)
        (
          'message',
          Icons.chat_bubble_outline_rounded,
          'Mensagem',
          null,
        ),
      if (phone.isNotEmpty)
        (
          'call',
          Icons.call_outlined,
          'Ligar',
          Uri(scheme: 'tel', path: phone.replaceAll(RegExp(r'[^\d+]'), '')),
        ),
      if (email.isNotEmpty)
        (
          'email',
          Icons.mail_outline_rounded,
          'E-mail',
          Uri(scheme: 'mailto', path: email)
        ),
    ];
    if (items.isEmpty) {
      return const ProfessorLinksCard(
        key: Key('center-student-no-contact'),
        child: ProfessorMutedText('Sem telefone ou e-mail no cadastro.'),
      );
    }
    final colors = context.themeColors;
    return Row(
      children: [
        for (final (i, (k, icon, label, uri)) in items.indexed) ...[
          if (i > 0) const SizedBox(width: 8),
          Expanded(
            child: InkWell(
              key: Key('center-student-contact-$k'),
              borderRadius: BorderRadius.circular(14),
              onTap: uri == null
                  ? () => openConversationWith(
                      context,
                      () => ref
                          .read(messagesRepositoryProvider)
                          .openCenterConversation(centerId, student.id),
                      professorMode: false,
                      centerId: centerId,
                    )
                  : () => launch(uri),
              child: Container(
                height: 52,
                decoration: BoxDecoration(
                  color: colors.surfaceRaised,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: ProfessorLinksStyle.line(colors)),
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(icon,
                        size: 17, color: ProfessorLinksStyle.mute(colors)),
                    const SizedBox(height: 4),
                    Text(
                      label,
                      style: AppTypography.bodyS.copyWith(
                        fontSize: 10.5,
                        color: ProfessorLinksStyle.mute(colors),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

class _EnrollmentCard extends StatelessWidget {
  const _EnrollmentCard({
    super.key,
    required this.enrollment,
    required this.showPrice,
    required this.makeupCredits,
  });

  final CenterCoachEnrollment enrollment;
  final bool showPrice;
  final int makeupCredits;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final e = enrollment;
    final price = e.priceCents;
    return ProfessorLinksCard(
      padding: const EdgeInsets.fromLTRB(14, 13, 14, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'MATRÍCULA',
                  style: ProfessorLinksStyle.mono(
                    9.5,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
              ),
              ArenaClassTag(
                label: kCenterEnrollmentStatusLabels[e.status] ?? e.status,
                color: _enrollmentColor(e.status, colors),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            e.className.isEmpty ? 'Turma' : e.className,
            style: ProfessorLinksStyle.display(16, color: colors.onSurface),
          ),
          const SizedBox(height: 6),
          ProfessorInfoRow(label: 'Plano', value: centerEnrollmentPlanLine(e)),
          if (showPrice && price != null)
            ProfessorInfoRow(
              label: 'Preço contratado',
              value: e.planType == 'monthly'
                  ? '${formatBRLFromCents(price)}/mês'
                  : formatBRLFromCents(price),
            ),
          if (e.startDate.isNotEmpty)
            ProfessorInfoRow(
              label: 'Desde',
              value: centerDayMonth(e.startDate) +
                  (e.startDate.length >= 4
                      ? '/${e.startDate.substring(0, 4)}'
                      : ''),
            ),
          ProfessorInfoRow(
            label: 'Reposições',
            value: makeupCredits == 1
                ? '1 disponível'
                : '$makeupCredits disponíveis',
            last: true,
          ),
        ],
      ),
    );
  }
}

/// Professor não lê matrículas: as turmas dele em que o aluno está.
class _ClassesCard extends StatelessWidget {
  const _ClassesCard({required this.classes, required this.makeupCredits});

  final List<CenterCoachClass> classes;
  final int makeupCredits;

  @override
  Widget build(BuildContext context) {
    return ProfessorRowsBlock(
      children: [
        for (final c in classes)
          ProfessorInfoRow(
            label: c.name,
            value: coachClassScheduleLabel(c),
          ),
        ProfessorInfoRow(
          label: 'Reposições',
          value: makeupCredits == 1
              ? '1 disponível'
              : '$makeupCredits disponíveis',
          last: true,
        ),
      ],
    );
  }
}

class _InvoicesCard extends StatelessWidget {
  const _InvoicesCard({
    required this.invoices,
    required this.todayKey,
    required this.onOpen,
  });

  final List<CenterCoachInvoice> invoices;
  final ValueChanged<String> onOpen;
  final String todayKey;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    if (invoices.isEmpty) {
      return const ProfessorLinksCard(
        key: Key('center-student-no-invoices'),
        child: ProfessorMutedText('Nenhuma cobrança ainda.'),
      );
    }
    final shown = invoices.take(6).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'COBRANÇAS',
          style: ProfessorLinksStyle.mono(
            10,
            color: ProfessorLinksStyle.dim(colors),
          ).copyWith(letterSpacing: 0.6),
        ),
        const SizedBox(height: 8),
        ProfessorRowsBlock(
          children: [
            for (final (i, inv) in shown.indexed)
              Builder(
                builder: (context) {
                  final st = centerInvoiceDisplayStatus(inv, todayKey);
                  final color = switch (st) {
                    'approved' => AppColors.win,
                    'pending' => AppColors.pending,
                    'late' || 'failed' || 'disputed' => AppColors.live,
                    _ => ProfessorLinksStyle.dim(colors),
                  };
                  return InkWell(
                    key: Key('center-student-invoice-${inv.id}'),
                    onTap: () => onOpen(inv.id),
                    child: ProfessorInfoRow(
                    label: inv.reference.isEmpty ? 'Cobrança' : inv.reference,
                    sub: switch (st) {
                      'late' => 'Venceu ${centerDayMonth(inv.dueDate)}',
                      'pending' => 'Vence ${centerDayMonth(inv.dueDate)}',
                      _ => kCenterInvoiceStatusLabels[st] ?? st,
                    }
                        .toUpperCase(),
                    value: formatBRLFromCents(inv.amountCents),
                    valueColor: colors.readableTone(color),
                    last: i == shown.length - 1,
                    ),
                  );
                },
              ),
          ],
        ),
      ],
    );
  }
}

class _PresenceCard extends StatelessWidget {
  const _PresenceCard({required this.marks});

  final List<CenterStudentMark> marks;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ProfessorLinksCard(
      key: const Key('center-student-presence'),
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'PRESENÇA RECENTE',
                  style: ProfessorLinksStyle.mono(
                    9.5,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
              ),
              Text(
                centerPresenceSummary(marks),
                style: ProfessorLinksStyle.mono(
                  9.5,
                  color: ProfessorLinksStyle.mute(colors),
                ),
              ),
            ],
          ),
          if (marks.isNotEmpty) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                for (final (i, m) in marks.indexed) ...[
                  if (i > 0) const SizedBox(width: 5),
                  Expanded(
                    child: Tooltip(
                      message: '${centerDayMonth(m.date)} · ${m.className} · '
                          '${centerMarkLabel(m.mark)}',
                      child: Container(
                        height: 28,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(7),
                          color: _markColor(m.mark).withValues(alpha: 0.14),
                        ),
                        child: Text(
                          centerMarkLetter(m.mark),
                          style: ProfessorLinksStyle.mono(
                            10,
                            weight: FontWeight.w700,
                            color: colors.readableTone(_markColor(m.mark)),
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ],
        ],
      ),
    );
  }

  static Color _markColor(CenterMark m) => switch (m) {
        CenterMark.present => AppColors.win,
        CenterMark.excused => AppColors.pending,
        CenterMark.absent => AppColors.live,
      };
}
