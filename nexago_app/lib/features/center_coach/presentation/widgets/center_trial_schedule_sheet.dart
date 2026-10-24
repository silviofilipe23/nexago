import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../professor_links/application/professor_links_providers.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../../professor_mode/presentation/availability/availability_widgets.dart'
    show AvailabilityChoiceChip;
import '../../../professor_mode/presentation/widgets/professor_students_widgets.dart'
    show ProfessorMutedText;
import '../../application/center_coach_providers.dart';
import '../../application/center_leads_providers.dart';
import '../../domain/center_coach_repository.dart' show CenterCoachException;
import '../../domain/center_leads.dart';
import '../../infrastructure/firebase_center_leads_repository.dart';
import '../center_coach_student_page.dart' show centerContactLauncherProvider;
import 'center_management_widgets.dart';

/// Quantos dias à frente o sheet oferece aulas.
const int kCenterTrialHorizonDays = 14;

/// "Agendar aula experimental": aulas das turmas ativas nos próximos 14 dias
/// com a ocupação e o limite da config; confirmar chama a callable e oferece a
/// mensagem de confirmação no WhatsApp. Devolve `true` se agendou.
Future<bool> showCenterTrialScheduleSheet(
  BuildContext context, {
  required String centerId,
  required CenterLead lead,
}) async {
  final done = await showProfessorLinksSheet<bool>(
    context,
    builder: (_) => CenterTrialScheduleSheet(centerId: centerId, lead: lead),
  );
  return done ?? false;
}

class CenterTrialScheduleSheet extends ConsumerStatefulWidget {
  const CenterTrialScheduleSheet({
    super.key,
    required this.centerId,
    required this.lead,
  });

  final String centerId;
  final CenterLead lead;

  @override
  ConsumerState<CenterTrialScheduleSheet> createState() =>
      _CenterTrialScheduleSheetState();
}

class _CenterTrialScheduleSheetState
    extends ConsumerState<CenterTrialScheduleSheet> {
  late bool _byProgram = widget.lead.programId.isNotEmpty;
  late bool _byPeriod = widget.lead.period.isNotEmpty;
  String? _sessionId;
  bool _busy = false;
  String? _error;
  CenterTrialSlot? _booked;

  Future<void> _confirm(CenterTrialSlot slot) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(centerLeadsRepositoryProvider).scheduleTrial(
            centerId: widget.centerId,
            leadId: widget.lead.id,
            sessionId: slot.session.id,
          );
      if (mounted) setState(() => _booked = slot);
    } on CenterCoachException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final centerId = widget.centerId;
    final lead = widget.lead;
    final now = ref.watch(professorLinksClockProvider)();
    final today = centerLeadDayKey(now);
    final toKey = centerLeadShiftDay(today, kCenterTrialHorizonDays);
    final sessionsAsync = ref.watch(
      coachSessionsProvider((centerId: centerId, fromKey: today, toKey: toKey)),
    );
    final classes =
        ref.watch(coachClassesProvider(centerId)).valueOrNull ?? const [];
    final settings =
        ref.watch(centerLeadSettingsProvider(centerId)).valueOrNull ??
            const CenterLeadSettings();
    final centerName =
        ref.watch(coachCenterProvider(centerId)).valueOrNull?.name ??
            ref.watch(centerMembershipProvider(centerId))?.centerName ??
            'centro';

    if (_booked != null) {
      return _Booked(
        lead: lead,
        slot: _booked!,
        centerName: centerName,
      );
    }

    final slots = centerTrialSlots(
      sessions: sessionsAsync.valueOrNull ?? const [],
      classes: classes,
      settings: settings,
      todayKey: today,
      nowHm: centerLeadHm(now),
      toKey: toKey,
      programId: _byProgram ? lead.programId : '',
      period: _byPeriod ? lead.period : '',
      leadTrialKey: lead.trialKey,
    );
    final selected = slots.where((s) => s.session.id == _sessionId).firstOrNull;
    final overLimit = settings.maxTrialsPerPerson > 0 &&
        lead.trialsCount >= settings.maxTrialsPerPerson;

    return ProfessorLinksSheetBody(
      key: const Key('center-trial-sheet'),
      title: 'Agendar aula experimental',
      subtitle: lead.name,
      children: [
        if (lead.programId.isNotEmpty || lead.period.isNotEmpty)
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              if (lead.programId.isNotEmpty)
                AvailabilityChoiceChip(
                  key: const Key('center-trial-filter-program'),
                  label: lead.programName.isEmpty
                      ? 'Modalidade'
                      : lead.programName,
                  selected: _byProgram,
                  onTap: () => setState(() => _byProgram = !_byProgram),
                ),
              if (lead.period.isNotEmpty)
                AvailabilityChoiceChip(
                  key: const Key('center-trial-filter-period'),
                  label: kCenterLeadPeriodLabels[lead.period] ?? lead.period,
                  selected: _byPeriod,
                  onTap: () => setState(() => _byPeriod = !_byPeriod),
                ),
            ],
          ),
        if (overLimit)
          ProfessorLinksNote(
            settings.maxTrialsPerPerson == 1
                ? '${lead.firstName} já fez a experimental. O limite do '
                    'centro é 1 por pessoa.'
                : '${lead.firstName} já fez ${lead.trialsCount} '
                    'experimentais (limite ${settings.maxTrialsPerPerson}).',
            tone: ProfessorLinksNoteTone.red,
          ),
        if (sessionsAsync.isLoading && sessionsAsync.valueOrNull == null)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 24),
            child: Center(
              child: CircularProgressIndicator(color: AppColors.brand),
            ),
          )
        else if (slots.isEmpty)
          ProfessorLinksCard(
            key: const Key('center-trial-empty'),
            child: ProfessorMutedText(
              _byProgram || _byPeriod
                  ? 'Nenhuma aula com esse filtro nos próximos '
                      '$kCenterTrialHorizonDays dias. Tire o filtro para ver '
                      'todos os horários.'
                  : 'Nenhuma aula agendada nos próximos '
                      '$kCenterTrialHorizonDays dias.',
            ),
          )
        else
          for (final s in slots)
            _SlotRow(
              key: Key('center-trial-slot-${s.session.id}'),
              slot: s,
              selected: s.session.id == _sessionId,
              onTap: s.enabled
                  ? () => setState(() => _sessionId = s.session.id)
                  : null,
            ),
        if (_error != null)
          ProfessorLinksNote(_error!, tone: ProfessorLinksNoteTone.red),
        ProfessorLinksPrimaryButton(
          key: const Key('center-trial-confirm'),
          label: 'Agendar experimental',
          loading: _busy,
          onPressed: selected == null || !selected.enabled || _busy
              ? null
              : () => _confirm(selected),
        ),
      ],
    );
  }
}

class _SlotRow extends StatelessWidget {
  const _SlotRow({
    super.key,
    required this.slot,
    required this.selected,
    required this.onTap,
  });

  final CenterTrialSlot slot;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final s = slot.session;
    final disabled = onTap == null;
    final coach = s.coachName.isNotEmpty ? s.coachName : slot.cls?.coachName;
    return Opacity(
      opacity: disabled ? 0.5 : 1,
      child: ProfessorLinksCard(
        onTap: onTap,
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        borderColor: selected ? AppColors.brand : null,
        backgroundColor: selected
            ? AppColors.brand.withValues(alpha: 0.08)
            : ProfessorLinksStyle.soft(colors),
        child: Row(
          children: [
            SizedBox(
              width: 78,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    centerLeadWeekdayDay(s.date),
                    style: ProfessorLinksStyle.display(
                      13,
                      weight: FontWeight.w700,
                      color: colors.onSurface,
                    ),
                  ),
                  Text(
                    s.startTime,
                    style: ProfessorLinksStyle.mono(
                      11,
                      weight: FontWeight.w700,
                      color: selected
                          ? colors.brandText
                          : ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    s.className,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: ProfessorLinksStyle.display(
                      13.5,
                      weight: FontWeight.w600,
                      color: colors.onSurface,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    [
                      if (coach != null && coach.isNotEmpty) coach,
                      slot.blockedReason ?? slot.spotsLabel,
                    ].join(' · '),
                    maxLines: 2,
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 11,
                      color: slot.blockedReason != null
                          ? colors.live
                          : ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                ],
              ),
            ),
            if (selected)
              const Icon(
                Icons.check_rounded,
                size: 18,
                color: AppColors.brand,
              ),
          ],
        ),
      ),
    );
  }
}

/// Agendou: resumo e a mensagem de confirmação no WhatsApp.
class _Booked extends ConsumerWidget {
  const _Booked({
    required this.lead,
    required this.slot,
    required this.centerName,
  });

  final CenterLead lead;
  final CenterTrialSlot slot;
  final String centerName;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = slot.session;
    final coach = s.coachName.isNotEmpty ? s.coachName : slot.cls?.coachName;
    final message = centerLeadTrialMessage(
      leadName: lead.name,
      centerName: centerName,
      dateKey: s.date,
      startTime: s.startTime,
      className: s.className,
      coachName: coach ?? '',
    );
    final wa = centerLeadWhatsAppUri(lead.phone, text: message);
    return ProfessorLinksSheetBody(
      key: const Key('center-trial-booked'),
      title: 'Experimental agendada',
      subtitle: '${lead.name} · ${centerLeadWeekdayDay(s.date)} às '
          '${s.startTime}',
      children: [
        CenterInfoRows(
          rows: [
            ('Quando', '${centerLeadWeekdayDay(s.date)} · ${s.startTime}'),
            ('Turma', s.className),
            if (coach != null && coach.isNotEmpty) ('Professor', coach),
            if (s.placeLabel.isNotEmpty) ('Onde', s.placeLabel),
          ],
        ),
        if (wa != null) ...[
          ProfessorLinksNote(message, tone: ProfessorLinksNoteTone.blue),
          ProfessorLinksPrimaryButton(
            key: const Key('center-trial-whatsapp'),
            label: 'Enviar confirmação no WhatsApp',
            onPressed: () async {
              await ref.read(centerContactLauncherProvider)(wa);
              if (context.mounted) Navigator.of(context).pop(true);
            },
          ),
        ],
        ProfessorLinksGhostButton(
          key: const Key('center-trial-close'),
          label: 'Fechar',
          height: 44,
          onPressed: () => Navigator.of(context).pop(true),
        ),
      ],
    );
  }
}
