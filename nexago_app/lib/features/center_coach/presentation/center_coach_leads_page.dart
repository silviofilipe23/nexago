import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../arena/domain/aulas/arena_class_logic.dart';
import '../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../professor_links/application/professor_links_providers.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/presentation/widgets/professor_students_widgets.dart';
import '../application/center_coach_providers.dart';
import '../application/center_leads_providers.dart';
import '../application/center_management_providers.dart';
import '../domain/center_coach_repository.dart' show CenterCoachException;
import '../domain/center_leads.dart';
import '../infrastructure/firebase_center_leads_repository.dart';
import 'center_coach_student_page.dart' show centerContactLauncherProvider;
import 'widgets/center_management_widgets.dart';
import 'widgets/center_trial_schedule_sheet.dart';

/// C6 · Captação (gestão e recepção): quem responder agora, quem está em
/// contato, as experimentais de hoje e as agendadas, e quem já fez a
/// experimental. O "+" cadastra no balcão (C7).
class CenterCoachLeadsPage extends ConsumerWidget {
  const CenterCoachLeadsPage({super.key, required this.centerId});

  final String centerId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final member = ref.watch(centerMembershipProvider(centerId));
    final now = ref.watch(professorLinksClockProvider)();
    final async = ref.watch(centerLeadsProvider(centerId));
    final settings =
        ref.watch(centerLeadSettingsProvider(centerId)).valueOrNull ??
            const CenterLeadSettings();
    final allowed = member != null && member.has('enroll_students');
    final board = buildCenterLeadsBoard(
      leads: async.valueOrNull ?? const [],
      now: now,
      settings: settings,
    );

    final groups = [
      ('respond', 'Responder agora', AppColors.pending, board.respondNow),
      ('contacted', 'Em contato', ProfessorLinksStyle.blue, board.contacted),
      ('today', 'Experimental hoje', AppColors.brand, board.trialToday),
      (
        'scheduled',
        'Experimentais agendadas',
        AppColors.brand,
        board.trialsScheduled,
      ),
      ('attended', 'Fizeram experimental', AppColors.win, board.attended),
    ];

    return ProfessorLinksScaffold(
      title: 'Captação',
      subtitle: allowed ? centerLeadsSubtitle(board, now) : null,
      onBack: () => popOrGo(context, AppRoutes.centerCoachAgenda),
      body: !allowed
          ? const Padding(
              padding: EdgeInsets.fromLTRB(20, 8, 20, 40),
              child: ProfessorLinksCard(
                key: Key('center-leads-denied'),
                child: ProfessorMutedText(
                  'A captação fica com a gestão e a recepção do centro.',
                ),
              ),
            )
          : Stack(
              children: [
                ListView(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 110),
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: _Stat(
                            key: const Key('center-leads-stat-new'),
                            value: '${board.newCount}',
                            label: 'Novos',
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: _Stat(
                            key: const Key('center-leads-stat-scheduled'),
                            value: '${board.scheduledCount}',
                            label: 'Agendadas',
                            color: AppColors.pending,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: _Stat(
                            key: const Key('center-leads-stat-conversion'),
                            value: board.conversionPercent == null
                                ? '—'
                                : '${board.conversionPercent}%',
                            label: 'Conversão',
                            color: AppColors.win,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    if (async.isLoading && async.valueOrNull == null)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 40),
                        child: Center(
                          child: CircularProgressIndicator(
                            color: AppColors.brand,
                          ),
                        ),
                      )
                    else if (board.isEmpty)
                      ProfessorLinksCard(
                        key: const Key('center-leads-empty'),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Nenhum interessado em aberto',
                              style: ProfessorLinksStyle.display(
                                14,
                                weight: FontWeight.w700,
                                color: colors.onSurface,
                              ),
                            ),
                            const SizedBox(height: 4),
                            const ProfessorMutedText(
                              'Quem pedir aula pelo app ou pela página do CT '
                              'aparece aqui. Cadastre quem passar no balcão '
                              'pelo botão +.',
                            ),
                          ],
                        ),
                      )
                    else
                      for (final (key, title, color, rows) in groups)
                        if (rows.isNotEmpty) ...[
                          Row(
                            key: Key('center-leads-group-$key'),
                            children: [
                              Container(
                                width: 8,
                                height: 8,
                                decoration: BoxDecoration(
                                  color: color,
                                  shape: BoxShape.circle,
                                ),
                              ),
                              const SizedBox(width: 8),
                              CenterKicker('$title · ${rows.length}'),
                            ],
                          ),
                          const SizedBox(height: 8),
                          ProfessorLinksCard(
                            padding: EdgeInsets.zero,
                            child: Column(
                              children: [
                                for (final (i, r) in rows.indexed)
                                  _LeadRow(
                                    key: Key('center-lead-${r.lead.id}'),
                                    row: r,
                                    first: i == 0,
                                    onTap: () => _showLeadActions(
                                      context,
                                      ref,
                                      centerId,
                                      r,
                                    ),
                                    onWhatsApp: () => _openWhatsApp(
                                      context,
                                      ref,
                                      r.lead,
                                    ),
                                  ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 16),
                        ],
                  ],
                ),
                Positioned(
                  right: 18,
                  bottom: 24 + MediaQuery.paddingOf(context).bottom,
                  child: _Fab(
                    onTap: () => context.pushNamed(
                      AppRouteNames.centerCoachNewLead,
                      pathParameters: {'centerId': centerId},
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}

Future<void> _openWhatsApp(
  BuildContext context,
  WidgetRef ref,
  CenterLead lead,
) async {
  final uri = centerLeadWhatsAppUri(lead.phone);
  if (uri == null) {
    showCenterError(context, 'Sem WhatsApp válido no cadastro.');
    return;
  }
  await ref.read(centerContactLauncherProvider)(uri);
}

/// Ações do interessado: WhatsApp, ligar, em contato, agendar e perdido.
Future<void> _showLeadActions(
  BuildContext context,
  WidgetRef ref,
  String centerId,
  CenterLeadRow row,
) async {
  final lead = row.lead;
  final action = await showProfessorLinksSheet<String>(
    context,
    builder: (sheet) {
      void pick(String a) => Navigator.of(sheet).pop(a);
      final phone = centerLeadPhoneUri(lead.phone);
      final open = lead.stage != 'won' && lead.stage != 'lost';
      return ProfessorLinksSheetBody(
        key: const Key('center-lead-actions'),
        title: lead.name,
        subtitle: row.line,
        children: [
          if (centerLeadWhatsAppUri(lead.phone) != null)
            ProfessorLinksSheetRow(
              key: const Key('center-lead-action-whatsapp'),
              icon: Icons.chat_outlined,
              title: 'WhatsApp',
              subtitle: lead.phone,
              onTap: () => pick('whatsapp'),
            ),
          if (phone != null)
            ProfessorLinksSheetRow(
              key: const Key('center-lead-action-call'),
              icon: Icons.call_outlined,
              title: 'Ligar',
              subtitle: lead.phone,
              onTap: () => pick('call'),
            ),
          if (lead.stage == 'new')
            ProfessorLinksSheetRow(
              key: const Key('center-lead-action-contacted'),
              icon: Icons.mark_chat_read_outlined,
              title: 'Marcar como em contato',
              subtitle: 'Sai de "Responder agora"',
              onTap: () => pick('contacted'),
            ),
          if (open && lead.stage != 'attended')
            ProfessorLinksSheetRow(
              key: const Key('center-lead-action-schedule'),
              icon: Icons.event_available_outlined,
              title: lead.stage == 'scheduled'
                  ? 'Remarcar experimental'
                  : 'Agendar experimental',
              subtitle: 'Escolha a aula nos próximos 14 dias',
              onTap: () => pick('schedule'),
            ),
          if (open)
            ProfessorLinksSheetRow(
              key: const Key('center-lead-action-lost'),
              icon: Icons.person_off_outlined,
              title: 'Marcar como perdido',
              subtitle: 'Preço, horário, sem resposta…',
              danger: true,
              onTap: () => pick('lost'),
            ),
        ],
      );
    },
  );
  if (action == null || !context.mounted) return;
  final repo = ref.read(centerLeadsRepositoryProvider);
  final actor = ref.read(centerActorProvider(centerId));
  try {
    switch (action) {
      case 'whatsapp':
        await _openWhatsApp(context, ref, lead);
      case 'call':
        await ref.read(centerContactLauncherProvider)(
          centerLeadPhoneUri(lead.phone)!,
        );
      case 'contacted':
        await repo.setStage(
          centerId: centerId,
          lead: lead,
          stage: 'contacted',
          actor: actor,
        );
        if (context.mounted) {
          showCenterError(context, '${lead.firstName} está em contato.');
        }
      case 'schedule':
        await showCenterTrialScheduleSheet(
          context,
          centerId: centerId,
          lead: lead,
        );
      case 'lost':
        final reason = await _pickLostReason(context, lead);
        if (reason == null) return;
        await repo.setStage(
          centerId: centerId,
          lead: lead,
          stage: 'lost',
          lostReason: reason,
          actor: actor,
        );
        if (context.mounted) {
          showCenterError(context, '${lead.firstName} marcado como perdido.');
        }
    }
  } on CenterCoachException catch (e) {
    if (context.mounted) showCenterError(context, e.message);
  }
}

Future<String?> _pickLostReason(BuildContext context, CenterLead lead) =>
    showProfessorLinksSheet<String>(
      context,
      builder: (_) => _LostReasonSheet(lead: lead),
    );

class _LostReasonSheet extends StatefulWidget {
  const _LostReasonSheet({required this.lead});

  final CenterLead lead;

  @override
  State<_LostReasonSheet> createState() => _LostReasonSheetState();
}

class _LostReasonSheetState extends State<_LostReasonSheet> {
  String? _reason;

  @override
  Widget build(BuildContext context) => ProfessorLinksSheetBody(
        key: const Key('center-lead-lost-sheet'),
        title: 'Marcar como perdido',
        subtitle: '${widget.lead.name} sai da captação. O cadastro continua '
            'guardado.',
        children: [
          for (final e in kCenterLeadLostReasonLabels.entries)
            CenterRadioTile(
              key: Key('center-lead-lost-${e.key}'),
              title: e.value,
              subtitle: switch (e.key) {
                'price' => 'Achou caro',
                'schedule' => 'Os horários não servem',
                'no_response' => 'Não respondeu mais',
                _ => 'Outro motivo',
              },
              selected: _reason == e.key,
              onTap: () => setState(() => _reason = e.key),
            ),
          ProfessorLinksPrimaryButton(
            key: const Key('center-lead-lost-confirm'),
            label: 'Marcar como perdido',
            onPressed: _reason == null
                ? null
                : () => Navigator.of(context).pop(_reason),
          ),
        ],
      );
}

class _Stat extends StatelessWidget {
  const _Stat({
    super.key,
    required this.value,
    required this.label,
    this.color,
  });

  final String value;
  final String label;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ProfessorLinksCard(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            value,
            style: ProfessorLinksStyle.display(
              22,
              color: color == null
                  ? colors.onSurface
                  : colors.readableTone(color!),
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label.toUpperCase(),
            style: ProfessorLinksStyle.mono(
              9.5,
              color: ProfessorLinksStyle.dim(colors),
            ).copyWith(letterSpacing: 0.6),
          ),
        ],
      ),
    );
  }
}

class _LeadRow extends StatelessWidget {
  const _LeadRow({
    super.key,
    required this.row,
    required this.first,
    required this.onTap,
    required this.onWhatsApp,
  });

  final CenterLeadRow row;
  final bool first;
  final VoidCallback onTap;
  final VoidCallback onWhatsApp;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final lead = row.lead;
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.fromLTRB(14, 11, 12, 11),
        decoration: BoxDecoration(
          border: first
              ? null
              : Border(
                  top: BorderSide(color: ProfessorLinksStyle.line(colors)),
                ),
        ),
        child: Row(
          children: [
            ArenaClassAvatar(
              initials: arenaClassInitials(lead.name),
              size: 34,
              color: const Color(0xFF9AA0A6),
            ),
            const SizedBox(width: 11),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          lead.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: ProfessorLinksStyle.display(
                            13.5,
                            weight: FontWeight.w600,
                            color: colors.onSurface,
                          ),
                        ),
                      ),
                      if (row.late) ...[
                        const SizedBox(width: 6),
                        ArenaClassTag(
                          key: Key('center-lead-late-${lead.id}'),
                          label: 'Atrasado',
                          color: AppColors.live,
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    row.line,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 11,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Semantics(
              button: true,
              label: 'WhatsApp de ${lead.name}',
              child: InkWell(
                key: Key('center-lead-wa-${lead.id}'),
                borderRadius: BorderRadius.circular(11),
                onTap: onWhatsApp,
                child: Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: AppColors.win.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(11),
                    border: Border.all(
                      color: AppColors.win.withValues(alpha: 0.3),
                    ),
                  ),
                  child: Icon(
                    Icons.chat_outlined,
                    size: 17,
                    color: colors.win,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Fab extends StatelessWidget {
  const _Fab({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        label: 'Novo interessado',
        child: Material(
          key: const Key('center-leads-add'),
          color: AppColors.brand,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
          ),
          shadowColor: AppColors.brand.withValues(alpha: 0.35),
          child: InkWell(
            borderRadius: BorderRadius.circular(18),
            onTap: onTap,
            child: const SizedBox(
              width: 54,
              height: 54,
              child: Icon(
                Icons.add_rounded,
                size: 26,
                color: ProfessorLinksStyle.onBrand,
              ),
            ),
          ),
        ),
      );
}
