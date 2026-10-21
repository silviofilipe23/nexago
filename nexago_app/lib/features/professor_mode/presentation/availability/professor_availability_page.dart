import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/router/navigation_helpers.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/time/nexago_event_timezone.dart';
import '../../../professor_links/application/professor_links_providers.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_agenda_providers.dart';
import '../../application/professor_availability_providers.dart';
import '../../application/professor_students_providers.dart';
import '../../domain/professor_agenda.dart';
import '../../domain/professor_availability.dart';
import '../../infrastructure/professor_availability_repository.dart';
import '../wallet/professor_wallet_widgets.dart';
import '../widgets/professor_students_widgets.dart';
import 'availability_widgets.dart';
import 'reschedule_widgets.dart';

const List<String> _weekdayShort = [
  'Seg',
  'Ter',
  'Qua',
  'Qui',
  'Sex',
  'Sáb',
  'Dom',
];

/// A10 — Disponibilidade para particulares: pedidos e próximas particulares,
/// a grade da semana-modelo (toque abre/fecha a hora; turma, particular e
/// bloqueio da data desta semana aparecem por cima, só leitura), as regras
/// e "Publicar horários" (`saveProfessorAvailability`).
class ProfessorAvailabilityPage extends ConsumerStatefulWidget {
  const ProfessorAvailabilityPage({super.key});

  @override
  ConsumerState<ProfessorAvailabilityPage> createState() =>
      _ProfessorAvailabilityPageState();
}

class _ProfessorAvailabilityPageState
    extends ConsumerState<ProfessorAvailabilityPage> {
  /// Rascunho da grade e das regras (nasce do documento gravado).
  ProfessorAvailability? _draft;
  int? _weekday;
  bool _saving = false;

  /// Particular com resposta/cancelamento em andamento.
  String? _busyId;

  ProfessorAvailabilityRepository get _repo =>
      ref.read(professorAvailabilityRepositoryProvider);

  void _set(ProfessorAvailability next) => setState(() => _draft = next);

  Future<void> _publish() async {
    final draft = _draft;
    if (draft == null || _saving) return;
    setState(() => _saving = true);
    final ok = await runProfessorWalletAction(
      context,
      () => _repo.saveAvailability(draft.toPayload(published: true)),
      message: 'Horários publicados. Seus alunos já podem agendar.',
    );
    if (!mounted) return;
    setState(() {
      _saving = false;
      if (ok) _draft = draft.copyWith(published: true);
    });
  }

  Future<void> _respond(PrivateLesson l, {required bool accept}) async {
    if (!accept) {
      final sure = await confirmProfessorWalletAction(
        context,
        title: 'Recusar pedido?',
        body: '${l.athleteName} recebe o aviso de que o horário não foi '
            'aceito.',
        confirmLabel: 'Recusar',
      );
      if (!sure || !mounted) return;
    }
    setState(() => _busyId = l.id);
    await runProfessorWalletAction(
      context,
      () => _repo.respond(l.id, accept: accept),
      message: accept ? 'Particular confirmada.' : 'Pedido recusado.',
    );
    if (mounted) setState(() => _busyId = null);
  }

  Future<void> _cancel(PrivateLesson l) async {
    final sure = await confirmProfessorWalletAction(
      context,
      title: 'Cancelar particular?',
      body: 'A aula com ${l.athleteName} é cancelada e o aluno recebe o '
          'aviso. O horário volta a ficar livre.',
      confirmLabel: 'Cancelar aula',
    );
    if (!sure || !mounted) return;
    setState(() => _busyId = l.id);
    await runProfessorWalletAction(
      context,
      () => _repo.cancel(l.id),
      message: 'Particular cancelada.',
    );
    if (mounted) setState(() => _busyId = null);
  }

  Future<void> _reschedule(PrivateLesson l) => requestLessonRescheduleFlow(
        context,
        ref,
        lessonId: l.id,
        professorUid: l.professorUid,
        currentStartAt: l.startAt,
        successMessage: 'Pedido enviado ao aluno',
      );

  Future<void> _respondReschedule(PrivateLesson l, {required bool accept}) async {
    setState(() => _busyId = l.id);
    await respondLessonRescheduleFlow(
      context,
      ref,
      lessonId: l.id,
      accept: accept,
    );
    if (mounted) setState(() => _busyId = null);
  }

  /// Próxima particular: "Remarcar"/"Cancelar"; com pedido de remarcação do
  /// aluno, "Recusar"/"Aceitar" (o mesmo que o cartão da conversa).
  Widget _upcomingCard(PrivateLesson l, String todayKey) {
    final r = l.pendingReschedule;
    final athleteAsked = r != null && r.requestedBy != l.professorUid;
    final idle = _busyId == null;
    return PrivateLessonCard(
      key: Key('availability-upcoming-${l.id}'),
      lesson: l,
      title: l.athleteName,
      todayKey: todayKey,
      footer: r == null
          ? null
          : ProfessorLinksNote(
              athleteAsked
                  ? 'Pedido de remarcação: ${rescheduleSlotLabel(r.startAt)}'
                  : 'Você sugeriu ${rescheduleSlotLabel(r.startAt)} · '
                      'aguardando o aluno.',
              key: Key('availability-reschedule-note-${l.id}'),
              tone: ProfessorLinksNoteTone.yellow,
            ),
      actions: athleteAsked
          ? [
              ProfessorLinksGhostButton(
                key: Key('availability-reschedule-decline-${l.id}'),
                label: 'Recusar',
                color: AppColors.live,
                height: 42,
                onPressed: idle
                    ? () => _respondReschedule(l, accept: false)
                    : null,
              ),
              ProfessorLinksPrimaryButton(
                key: Key('availability-reschedule-accept-${l.id}'),
                label: 'Aceitar',
                height: 42,
                loading: _busyId == l.id,
                onPressed:
                    idle ? () => _respondReschedule(l, accept: true) : null,
              ),
            ]
          : [
              ProfessorLinksGhostButton(
                key: Key('availability-reschedule-${l.id}'),
                label: 'Remarcar',
                height: 42,
                onPressed: idle ? () => _reschedule(l) : null,
              ),
              ProfessorLinksGhostButton(
                key: Key('availability-cancel-${l.id}'),
                label: 'Cancelar',
                color: AppColors.live,
                height: 42,
                loading: _busyId == l.id,
                onPressed: idle ? () => _cancel(l) : null,
              ),
            ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final now = ref.watch(professorLinksClockProvider)();
    final todayKey = nexagoEventDayKey(now);
    final async = ref.watch(myProfessorAvailabilityProvider);
    _draft ??=
        async.hasValue ? (async.value ?? ProfessorAvailability.defaults) : null;
    final weekday = _weekday ?? toNexagoEventLocal(now).weekday;
    final draft = _draft;

    Widget body;
    if (draft == null && async.hasError) {
      body = ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          ProfessorRetryCard(
            message: 'Não foi possível carregar seus horários.',
            onRetry: () => ref.invalidate(
              professorAvailabilityProvider(
                  ref.read(professorLinksUidProvider)),
            ),
          ),
        ],
      );
    } else if (draft == null) {
      body = const ProfessorWalletLoading();
    } else {
      final pending = ref.watch(professorPendingPrivateLessonsProvider);
      final upcoming = ref.watch(professorUpcomingPrivateLessonsProvider);
      final dateKey = professorWeekDays(todayKey)[weekday - 1];
      final cells = availabilityDayCells(
        availability: draft,
        weekday: weekday,
        dateKey: dateKey,
        classes: ref.watch(professorStudentsProvider).valueOrNull?.classes ??
            const [],
        lessons:
            ref.watch(professorPrivateLessonsProvider).valueOrNull ?? const [],
        blocks: ref.watch(professorBlocksProvider).valueOrNull ?? const [],
      );
      body = Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
              children: [
                if (pending.isNotEmpty) ...[
                  ProfessorLinksKicker(
                    'Pedidos · ${pending.length}',
                    color: AppColors.pending,
                  ),
                  const SizedBox(height: 8),
                  for (final l in pending) ...[
                    PrivateLessonCard(
                      key: Key('availability-request-${l.id}'),
                      lesson: l,
                      title: l.athleteName,
                      todayKey: todayKey,
                      actions: [
                        ProfessorLinksGhostButton(
                          key: Key('availability-decline-${l.id}'),
                          label: 'Recusar',
                          color: AppColors.live,
                          height: 42,
                          onPressed: _busyId == null
                              ? () => _respond(l, accept: false)
                              : null,
                        ),
                        ProfessorLinksPrimaryButton(
                          key: Key('availability-accept-${l.id}'),
                          label: 'Aceitar',
                          height: 42,
                          loading: _busyId == l.id,
                          onPressed: _busyId == null
                              ? () => _respond(l, accept: true)
                              : null,
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                  ],
                  const SizedBox(height: 12),
                ],
                if (upcoming.isNotEmpty) ...[
                  const ProfessorLinksKicker('Próximas particulares'),
                  const SizedBox(height: 8),
                  for (final l in upcoming) ...[
                    _upcomingCard(l, todayKey),
                    const SizedBox(height: 10),
                  ],
                  const SizedBox(height: 12),
                ],
                const ProfessorLinksKicker('Horários abertos'),
                const SizedBox(height: 8),
                Row(
                  children: [
                    for (var d = 1; d <= 7; d++) ...[
                      if (d > 1) const SizedBox(width: 6),
                      Expanded(
                        child: _DayChip(
                          key: Key('availability-day-$d'),
                          label: _weekdayShort[d - 1],
                          selected: d == weekday,
                          count: draft.weekly[d]?.length ?? 0,
                          onTap: () => setState(() => _weekday = d),
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 12),
                const AvailabilityLegend(),
                const SizedBox(height: 12),
                for (var r = 0; r < cells.length; r += 3) ...[
                  if (r > 0) const SizedBox(height: 6),
                  Row(
                    children: [
                      for (var c = r; c < r + 3; c++) ...[
                        if (c > r) const SizedBox(width: 6),
                        Expanded(
                          child: c < cells.length
                              ? AvailabilityCellTile(
                                  key:
                                      Key('availability-cell-${cells[c].hour}'),
                                  cell: cells[c],
                                  onTap: () => _set(
                                    draft.toggle(weekday, cells[c].hour),
                                  ),
                                )
                              : const SizedBox.shrink(),
                        ),
                      ],
                    ],
                  ),
                ],
                const SizedBox(height: 10),
                ProfessorMutedText(
                  'Toque para abrir ou fechar a hora em toda '
                  '${_weekdayShort[weekday - 1].toLowerCase()}. Turma, '
                  'particular e bloqueio são desta semana.'
                  '${draft.durationMin > 60 ? ' Aula de '
                      '${availabilityDurationLabel(draft.durationMin)} precisa '
                      'das horas seguidas abertas.' : ''}',
                ),
                const SizedBox(height: 22),
                const ProfessorLinksKicker('Regras'),
                const SizedBox(height: 8),
                ProfessorLinksCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _RuleChoice(
                        keyPrefix: 'availability-duration',
                        title: 'Duração padrão',
                        options: availabilityOptionsWith(
                            kAvailabilityDurations, draft.durationMin),
                        value: draft.durationMin,
                        label: availabilityDurationLabel,
                        onChanged: (v) => _set(draft.copyWith(durationMin: v)),
                      ),
                      const SizedBox(height: 16),
                      _RuleChoice(
                        keyPrefix: 'availability-notice',
                        title: 'Antecedência mínima',
                        options: availabilityOptionsWith(
                            kAvailabilityNoticeOptions, draft.minNoticeHours),
                        value: draft.minNoticeHours,
                        label: availabilityHoursLabel,
                        onChanged: (v) =>
                            _set(draft.copyWith(minNoticeHours: v)),
                      ),
                      const SizedBox(height: 16),
                      _RuleChoice(
                        keyPrefix: 'availability-cancel',
                        title: 'Cancelamento sem custo até',
                        options: availabilityOptionsWith(
                          kAvailabilityFreeCancelOptions,
                          draft.freeCancelHours,
                        ),
                        value: draft.freeCancelHours,
                        label: (h) => h == 0 ? 'Início' : '${h}h antes',
                        onChanged: (v) =>
                            _set(draft.copyWith(freeCancelHours: v)),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 10),
                ProfessorLinksCard(
                  padding: const EdgeInsets.fromLTRB(14, 6, 6, 6),
                  child: Column(
                    children: [
                      ProfessorWalletToggleRow(
                        key: const Key('availability-auto-confirm'),
                        title: 'Aluno agenda direto',
                        subtitle: 'Sem esperar você aceitar',
                        value: draft.autoConfirm,
                        onChanged: (v) => _set(draft.copyWith(autoConfirm: v)),
                      ),
                      Divider(
                          height: 1, color: ProfessorLinksStyle.line(colors)),
                      ProfessorWalletToggleRow(
                        key: const Key('availability-accept-pairs'),
                        title: 'Aceitar duplas',
                        value: draft.acceptPairs,
                        onChanged: (v) => _set(draft.copyWith(acceptPairs: v)),
                      ),
                      Divider(
                          height: 1, color: ProfessorLinksStyle.line(colors)),
                      ProfessorWalletToggleRow(
                        key: const Key('availability-show-profile'),
                        title: 'Mostrar no perfil público',
                        value: draft.showOnProfile,
                        onChanged: (v) =>
                            _set(draft.copyWith(showOnProfile: v)),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
              child: ProfessorLinksPrimaryButton(
                key: const Key('availability-publish'),
                label: 'Publicar horários',
                loading: _saving,
                onPressed: _publish,
              ),
            ),
          ),
        ],
      );
    }

    return ProfessorLinksScaffold(
      title: 'Disponibilidade',
      subtitle: 'PARTICULARES NO APP',
      onBack: () => popOrGo(context, AppRoutes.professorMore),
      body: body,
    );
  }
}

class _DayChip extends StatelessWidget {
  const _DayChip({
    super.key,
    required this.label,
    required this.selected,
    required this.count,
    required this.onTap,
  });

  final String label;
  final bool selected;

  /// Horas abertas no dia (ponto verde quando há alguma).
  final int count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Semantics(
      button: true,
      selected: selected,
      child: Material(
        color: selected ? AppColors.brand : colors.surfaceCard,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(11),
          side: BorderSide(
            color: selected
                ? Colors.transparent
                : ProfessorLinksStyle.line(colors),
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: SizedBox(
            height: 38,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  label,
                  style: ProfessorLinksStyle.mono(
                    10.5,
                    weight: FontWeight.w700,
                    color: selected
                        ? ProfessorLinksStyle.onBrand
                        : ProfessorLinksStyle.mute(colors),
                  ),
                ),
                if (count > 0)
                  Container(
                    width: 4,
                    height: 4,
                    margin: const EdgeInsets.only(top: 3),
                    decoration: BoxDecoration(
                      color: selected
                          ? ProfessorLinksStyle.onBrand
                          : AppColors.win,
                      shape: BoxShape.circle,
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _RuleChoice extends StatelessWidget {
  const _RuleChoice({
    required this.keyPrefix,
    required this.title,
    required this.options,
    required this.value,
    required this.label,
    required this.onChanged,
  });

  final String keyPrefix;
  final String title;
  final List<int> options;
  final int value;
  final String Function(int) label;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: AppTypography.bodyS.copyWith(
            fontSize: 12.5,
            fontWeight: FontWeight.w600,
            color: colors.onSurface,
          ),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            for (final o in options)
              AvailabilityChoiceChip(
                key: Key('$keyPrefix-$o'),
                label: label(o),
                selected: o == value,
                onTap: () => onChanged(o),
              ),
          ],
        ),
      ],
    );
  }
}
