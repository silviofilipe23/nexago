import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/router/navigation_helpers.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/presentation/availability/availability_widgets.dart'
    show AvailabilityChoiceChip;
import '../../professor_mode/presentation/widgets/professor_students_widgets.dart';
import '../application/center_coach_providers.dart';
import '../application/center_management_providers.dart';
import '../domain/center_coach_repository.dart' show CenterCoachException;
import '../domain/center_leads.dart';
import '../infrastructure/firebase_center_leads_repository.dart';
import 'widgets/center_management_widgets.dart';
import 'widgets/center_trial_schedule_sheet.dart';

/// Caminho da Captação (C6) do centro — para onde o cadastro volta.
String centerLeadsLocation(String centerId) =>
    '/athlete/professor/centros/$centerId/captacao';

/// C7 · Novo interessado (cadastro no balcão): nome e WhatsApp obrigatórios,
/// modalidade, experiência, período e como conheceu. "Salvar e agendar" abre
/// o sheet de horários logo depois de salvar.
class CenterCoachNewLeadPage extends ConsumerStatefulWidget {
  const CenterCoachNewLeadPage({super.key, required this.centerId});

  final String centerId;

  @override
  ConsumerState<CenterCoachNewLeadPage> createState() =>
      _CenterCoachNewLeadPageState();
}

class _CenterCoachNewLeadPageState
    extends ConsumerState<CenterCoachNewLeadPage> {
  final _name = TextEditingController();
  final _phone = TextEditingController();
  String _programId = '';
  String _programName = '';
  String _experience = '';
  String _period = '';
  String _source = 'desk';
  bool _tried = false;

  /// `save` ou `schedule` enquanto grava.
  String? _busy;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    super.dispose();
  }

  CenterNewLeadInput _input() => CenterNewLeadInput(
        name: _name.text,
        phone: _phone.text,
        programId: _programId,
        programName: _programName,
        experience: _experience,
        period: _period,
        source: _source,
      );

  Future<void> _save({required bool schedule}) async {
    setState(() => _tried = true);
    final input = _input();
    if (_busy != null || centerNewLeadProblems(input).isNotEmpty) return;
    setState(() {
      _busy = schedule ? 'schedule' : 'save';
      _error = null;
    });
    final centerId = widget.centerId;
    try {
      final actor = ref.read(centerActorProvider(centerId));
      final id = await ref.read(centerLeadsRepositoryProvider).createLead(
            centerId: centerId,
            input: input,
            actor: actor,
          );
      if (!mounted) return;
      if (schedule) {
        await showCenterTrialScheduleSheet(
          context,
          centerId: centerId,
          lead: CenterLead(
            id: id,
            name: input.name.trim(),
            phone: input.phone.trim(),
            phoneDigits: centerLeadPhoneDigits(input.phone),
            source: input.source,
            programId: input.programId,
            programName: input.programName,
            experience: input.experience,
            period: input.period,
          ),
        );
      } else {
        ScaffoldMessenger.maybeOf(context)?.showSnackBar(
          SnackBar(content: Text('${input.name.trim()} entrou na captação.')),
        );
      }
      if (mounted) popOrGo(context, centerLeadsLocation(centerId));
    } on CenterCoachException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final centerId = widget.centerId;
    final member = ref.watch(centerMembershipProvider(centerId));
    final programs =
        ref.watch(centerProgramsProvider(centerId)).valueOrNull ?? const [];
    final sorted = [...programs]..sort((a, b) => a.order.compareTo(b.order));
    final problems =
        _tried ? centerNewLeadProblems(_input()) : const <String>[];

    Widget chips(
      String keyPrefix,
      List<(String, String)> options,
      String value,
      ValueChanged<String> onPick,
    ) =>
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final (k, label) in options)
              AvailabilityChoiceChip(
                key: Key('center-new-lead-$keyPrefix-$k'),
                label: label,
                selected: value == k,
                // Tocar de novo desmarca (campo opcional).
                onTap: () => setState(() => onPick(value == k ? '' : k)),
              ),
          ],
        );

    return ProfessorLinksScaffold(
      title: 'Novo interessado',
      subtitle: 'CADASTRO NO BALCÃO',
      onBack: () => popOrGo(context, centerLeadsLocation(centerId)),
      body: member == null || !member.has('enroll_students')
          ? const Padding(
              padding: EdgeInsets.fromLTRB(20, 8, 20, 40),
              child: ProfessorLinksCard(
                key: Key('center-new-lead-denied'),
                child: ProfessorMutedText(
                  'Sem permissão para cadastrar interessados neste centro.',
                ),
              ),
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
              children: [
                const CenterKicker('Nome'),
                const SizedBox(height: 6),
                CenterTextField(
                  key: const Key('center-new-lead-name'),
                  controller: _name,
                  hint: 'Nome do interessado',
                  icon: Icons.person_outline_rounded,
                  onChanged: (_) => setState(() {}),
                ),
                const SizedBox(height: 14),
                const CenterKicker('WhatsApp'),
                const SizedBox(height: 6),
                CenterTextField(
                  key: const Key('center-new-lead-phone'),
                  controller: _phone,
                  hint: '(21) 9 0000-0000',
                  icon: Icons.phone_outlined,
                  keyboardType: TextInputType.phone,
                  onChanged: (_) => setState(() {}),
                ),
                const SizedBox(height: 16),
                const CenterKicker('Modalidade'),
                const SizedBox(height: 8),
                if (sorted.isEmpty)
                  Text(
                    'O centro ainda não tem modalidades cadastradas.',
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 11.5,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  )
                else
                  chips(
                    'program',
                    [for (final p in sorted) (p.id, p.name)],
                    _programId,
                    (id) {
                      _programId = id;
                      _programName = id.isEmpty
                          ? ''
                          : sorted.firstWhere((p) => p.id == id).name;
                    },
                  ),
                const SizedBox(height: 16),
                const CenterKicker('Experiência'),
                const SizedBox(height: 8),
                chips(
                  'experience',
                  kCenterLeadExperienceLabels.entries
                      .map((e) => (e.key, e.value))
                      .toList(),
                  _experience,
                  (v) => _experience = v,
                ),
                const SizedBox(height: 16),
                const CenterKicker('Período'),
                const SizedBox(height: 8),
                chips(
                  'period',
                  kCenterLeadPeriodLabels.entries
                      .map((e) => (e.key, e.value))
                      .toList(),
                  _period,
                  (v) => _period = v,
                ),
                const SizedBox(height: 16),
                const CenterKicker('Como conheceu'),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final (k, label) in kCenterLeadSourceChoices)
                      AvailabilityChoiceChip(
                        key: Key('center-new-lead-source-$k'),
                        label: label,
                        selected: _source == k,
                        onTap: () => setState(() => _source = k),
                      ),
                  ],
                ),
                const SizedBox(height: 22),
                if (problems.isNotEmpty) ...[
                  ProfessorLinksNote(
                    problems.first,
                    key: const Key('center-new-lead-problem'),
                    tone: ProfessorLinksNoteTone.red,
                  ),
                  const SizedBox(height: 10),
                ],
                if (_error != null) ...[
                  ProfessorLinksNote(_error!, tone: ProfessorLinksNoteTone.red),
                  const SizedBox(height: 10),
                ],
                ProfessorLinksPrimaryButton(
                  key: const Key('center-new-lead-save-schedule'),
                  label: 'Salvar e agendar experimental',
                  loading: _busy == 'schedule',
                  onPressed: _busy != null ? null : () => _save(schedule: true),
                ),
                const SizedBox(height: 8),
                ProfessorLinksGhostButton(
                  key: const Key('center-new-lead-save'),
                  label: 'Só salvar',
                  height: 44,
                  loading: _busy == 'save',
                  onPressed:
                      _busy != null ? null : () => _save(schedule: false),
                ),
              ],
            ),
    );
  }
}
