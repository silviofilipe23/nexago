import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/links/open_external_url.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../arena/domain/aulas/arena_class_logic.dart';
import '../../arenas/domain/arena_booking_success_actions.dart';
import '../../athlete_training/application/athlete_training_providers.dart';
import '../../athlete_training/domain/class_presence.dart' show classLevelLabel;
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/presentation/widgets/professor_students_widgets.dart'
    show ProfessorMutedText;
import '../application/class_directory_providers.dart';
import '../domain/class_directory.dart';
import '../domain/class_directory_logic.dart';
import '../domain/class_trial.dart';
import '../infrastructure/class_directory_repository.dart';
import 'class_provider_detail_page.dart' show classDirectoryContactMessage;

/// Abre o calendário da experimental do local.
Future<void> openClassTrialBooking(
  BuildContext context,
  ClassProviderDetail detail, {
  String? classId,
}) =>
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => ClassTrialBookingPage(detail: detail, classId: classId),
      ),
    );

/// "Agendar experimental": dias com aula e vaga, os horários do dia e o
/// confirmar. Arena marca pelo app (encaixe experimental); CT confirma pelo
/// WhatsApp já com a aula escolhida.
class ClassTrialBookingPage extends ConsumerStatefulWidget {
  const ClassTrialBookingPage({super.key, required this.detail, this.classId});

  final ClassProviderDetail detail;

  /// Turma escolhida no detalhe — começa nela.
  final String? classId;

  @override
  ConsumerState<ClassTrialBookingPage> createState() =>
      _ClassTrialBookingPageState();
}

class _ClassTrialBookingPageState extends ConsumerState<ClassTrialBookingPage> {
  String? _day;
  String? _selected;
  bool _saving = false;
  String? _error;

  ({ClassProviderKind kind, String id}) get _key =>
      (kind: widget.detail.kind, id: widget.detail.id);

  Future<void> _openWhatsApp(String message) async {
    final url = ArenaBookingSuccessActions.buildWhatsAppUrl(
      phone: widget.detail.contactPhone,
      message: message,
    );
    final ok = url != null && await openExternalUrl(url);
    if (!ok && mounted) {
      ScaffoldMessenger.maybeOf(context)?.showSnackBar(
        const SnackBar(content: Text('Não foi possível abrir o WhatsApp.')),
      );
    }
  }

  Future<void> _submit(ClassTrialOptions data, ClassTrialOption o) async {
    if (!data.bookInApp) {
      await _openWhatsApp(classTrialContactMessage(widget.detail, o));
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    final center = widget.detail.isCenter;
    try {
      final repo = ref.read(classDirectoryRepositoryProvider);
      if (center) {
        await repo.bookCenterTrial(widget.detail.id, o.sessionId);
        // A experimental do CT entra na agenda pelo `getMyTrainingCenters`.
        refreshAthleteTrainingCenters(ref);
      } else {
        await repo.bookArenaTrial(o.sessionId);
        refreshAthleteClassPresence(ref);
      }
      ref.invalidate(classTrialOptionsProvider(_key));
      if (!mounted) return;
      ScaffoldMessenger.maybeOf(context)
        ?..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(
          content: Text(
            center
                ? 'Experimental agendada: ${trialOptionWhen(o)}. '
                    'O centro vai confirmar.'
                : 'Experimental marcada: ${trialOptionWhen(o)}. '
                    'Ela aparece nos seus treinos.',
          ),
        ));
    } on ClassDirectoryException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _cancel(String bookingId) async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref
          .read(classDirectoryRepositoryProvider)
          .cancelCenterTrial(widget.detail.id, bookingId);
      refreshAthleteTrainingCenters(ref);
      ref.invalidate(classTrialOptionsProvider(_key));
      if (!mounted) return;
      ScaffoldMessenger.maybeOf(context)
        ?..hideCurrentSnackBar()
        ..showSnackBar(
          const SnackBar(content: Text('Experimental desmarcada.')),
        );
    } on ClassDirectoryException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.detail;
    final async = ref.watch(classTrialOptionsProvider(_key));
    final data = async.valueOrNull;
    final options = data?.options ?? const <ClassTrialOption>[];
    final days = trialDays(options);
    final initial = initialTrialOption(options, widget.classId);
    final day = _day != null && days.contains(_day)
        ? _day!
        : (initial?.date ?? (days.isEmpty ? null : days.first));
    final dayOptions =
        day == null ? const <ClassTrialOption>[] : trialOptionsOn(options, day);
    ClassTrialOption? picked;
    for (final o in dayOptions) {
      if (o.sessionId == (_selected ?? initial?.sessionId)) picked = o;
    }
    picked ??= dayOptions.firstOrNull;
    final booked = data?.booked;

    return ProfessorLinksScaffold(
      title: 'Agendar experimental',
      subtitle:
          '${d.name} · ${d.trial == null ? '' : directoryTrialLabel(d.trial!)}'
              .toUpperCase(),
      onBack: () => Navigator.of(context).maybePop(),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              key: const Key('class-trial-booking'),
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
              children: [
                if (data == null && async.hasError)
                  _LoadError(
                    message: async.error is ClassDirectoryException
                        ? '${async.error}'
                        : 'Não foi possível carregar os horários.',
                    onRetry: () =>
                        ref.invalidate(classTrialOptionsProvider(_key)),
                    onContact: d.contactPhone == null
                        ? null
                        : () => _openWhatsApp(
                              classDirectoryContactMessage(d, null),
                            ),
                  )
                else if (data == null)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 40),
                    child: Center(
                      child: CircularProgressIndicator(color: AppColors.brand),
                    ),
                  )
                else if (booked != null)
                  _Booked(
                    option: booked,
                    pending: data.awaitingConfirmation,
                    saving: _saving,
                    error: _error,
                    onCancel: d.isCenter && data.bookingId != null
                        ? () => _cancel(data.bookingId!)
                        : null,
                  )
                else ...[
                  Text(
                    !data.bookInApp
                        ? 'Escolha o dia e o horário. Você confirma com o '
                            'centro pelo WhatsApp.'
                        : d.isCenter
                            ? 'Escolha o dia e o horário. A vaga fica '
                                'reservada e o centro confirma o agendamento.'
                            : 'Escolha o dia e o horário. A vaga fica '
                                'reservada para você na turma.',
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 12.5,
                      height: 1.45,
                      color: ProfessorLinksStyle.dim(context.themeColors),
                    ),
                  ),
                  const SizedBox(height: 14),
                  if (days.isEmpty)
                    const ProfessorLinksCard(
                      key: Key('class-trial-empty'),
                      child: ProfessorMutedText(
                        'Nenhuma aula com vaga nas próximas semanas. '
                        'Fale com o local para combinar outro horário.',
                      ),
                    )
                  else ...[
                    _DayStrip(
                      days: days,
                      value: day!,
                      onChanged: (v) => setState(() {
                        _day = v;
                        _selected = null;
                      }),
                    ),
                    const SizedBox(height: 16),
                    for (final o in dayOptions) ...[
                      _OptionRow(
                        option: o,
                        selected: o.sessionId == picked?.sessionId,
                        onTap: () => setState(() {
                          _day = o.date;
                          _selected = o.sessionId;
                        }),
                      ),
                      const SizedBox(height: 8),
                    ],
                  ],
                  if (d.trial?.note.isNotEmpty == true) ...[
                    const SizedBox(height: 8),
                    ProfessorLinksNote(d.trial!.note),
                  ],
                  if (_error != null) ...[
                    const SizedBox(height: 8),
                    ProfessorLinksNote(_error!,
                        tone: ProfessorLinksNoteTone.red),
                  ],
                ],
              ],
            ),
          ),
          if (data != null && booked == null && picked != null)
            SafeArea(
              top: false,
              minimum: const EdgeInsets.fromLTRB(20, 8, 20, 16),
              child: ProfessorLinksPrimaryButton(
                key: const Key('class-trial-submit'),
                label: data.bookInApp
                    ? 'Agendar ${trialOptionWhen(picked)}'
                    : 'Confirmar pelo WhatsApp',
                loading: _saving,
                onPressed: !data.bookInApp && d.contactPhone == null
                    ? null
                    : () => _submit(data, picked!),
              ),
            ),
        ],
      ),
    );
  }
}

class _LoadError extends StatelessWidget {
  const _LoadError({
    required this.message,
    required this.onRetry,
    required this.onContact,
  });

  final String message;
  final VoidCallback onRetry;
  final VoidCallback? onContact;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ProfessorLinksNote(message, tone: ProfessorLinksNoteTone.red),
          const SizedBox(height: 12),
          ProfessorLinksGhostButton(
              label: 'Tentar de novo', onPressed: onRetry),
          if (onContact != null) ...[
            const SizedBox(height: 8),
            ProfessorLinksGhostButton(
              key: const Key('class-trial-contact'),
              label: 'Falar pelo WhatsApp',
              onPressed: onContact,
            ),
          ],
        ],
      );
}

class _Booked extends StatelessWidget {
  const _Booked({
    required this.option,
    required this.pending,
    required this.saving,
    required this.error,
    required this.onCancel,
  });

  final ClassTrialOption option;

  /// CT ainda não confirmou.
  final bool pending;
  final bool saving;
  final String? error;

  /// CT: desmarcar o pedido. Arena desmarca em Treinos ("Não vou").
  final VoidCallback? onCancel;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final o = option;
    final tone = pending ? colors.pending : colors.win;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ProfessorLinksCard(
          key: const Key('class-trial-booked'),
          borderColor: tone.withValues(alpha: 0.4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                pending
                    ? 'AGUARDANDO CONFIRMAÇÃO DO CENTRO'
                    : 'EXPERIMENTAL CONFIRMADA',
                style: ProfessorLinksStyle.mono(
                  10,
                  color: colors.readableTone(tone),
                ),
              ),
              const SizedBox(height: 6),
              Text(
                trialOptionWhen(o),
                style: ProfessorLinksStyle.display(
                  18,
                  weight: FontWeight.w700,
                  color: colors.onSurface,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                [o.className, o.teacherName, o.place]
                    .where((s) => s.isNotEmpty)
                    .join(' · '),
                style: AppTypography.bodyS.copyWith(
                  fontSize: 12.5,
                  color: ProfessorLinksStyle.dim(colors),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        ProfessorMutedText(
          onCancel != null
              ? pending
                  ? 'A vaga já está reservada. Você recebe um aviso quando o '
                      'centro confirmar.'
                  : 'Se não puder ir, desmarque aqui — a vaga volta para a '
                      'turma.'
              : 'Se não puder ir, desmarque em Treinos com “Não vou” — a vaga '
                  'volta para a turma.',
        ),
        if (error != null) ...[
          const SizedBox(height: 10),
          ProfessorLinksNote(error!, tone: ProfessorLinksNoteTone.red),
        ],
        const SizedBox(height: 14),
        if (onCancel != null)
          ProfessorLinksGhostButton(
            key: const Key('class-trial-cancel'),
            label: 'Desmarcar experimental',
            loading: saving,
            color: colors.live,
            onPressed: onCancel,
          )
        else
          ProfessorLinksGhostButton(
            key: const Key('class-trial-open-trainings'),
            label: 'Ver nos meus treinos',
            onPressed: () => context.push(AppRoutes.athleteTrainingClasses),
          ),
      ],
    );
  }
}

class _DayStrip extends StatelessWidget {
  const _DayStrip({
    required this.days,
    required this.value,
    required this.onChanged,
  });

  final List<String> days;
  final String value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return SizedBox(
      height: 64,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        clipBehavior: Clip.none,
        itemCount: days.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, i) {
          final key = days[i];
          final date = DateTime.tryParse(key);
          final weekday = arenaClassDateKeyWeekday(key);
          final on = key == value;
          return Semantics(
            selected: on,
            button: true,
            child: InkWell(
              key: Key('class-trial-day-$key'),
              borderRadius: BorderRadius.circular(14),
              onTap: () => onChanged(key),
              child: Container(
                width: 52,
                decoration: BoxDecoration(
                  color: on ? colors.onSurface : colors.surfaceRaised,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: on
                        ? colors.onSurface
                        : ProfessorLinksStyle.line2(colors),
                  ),
                ),
                alignment: Alignment.center,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      weekday == null
                          ? ''
                          : arenaClassWeekdayShort(weekday).toUpperCase(),
                      style: ProfessorLinksStyle.mono(
                        9.5,
                        color: on
                            ? colors.canvas
                            : ProfessorLinksStyle.dim(colors),
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      date == null ? key : '${date.day}',
                      style: ProfessorLinksStyle.display(
                        17,
                        weight: FontWeight.w700,
                        color: on ? colors.canvas : colors.onSurface,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _OptionRow extends StatelessWidget {
  const _OptionRow({
    required this.option,
    required this.selected,
    required this.onTap,
  });

  final ClassTrialOption option;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final o = option;
    final level = classLevelLabel(o.level).isNotEmpty
        ? classLevelLabel(o.level)
        : o.level;
    final sub =
        [level, o.teacherName, o.place].where((s) => s.isNotEmpty).join(' · ');
    return ProfessorLinksCard(
      key: Key('class-trial-option-${o.sessionId}'),
      padding: const EdgeInsets.all(13),
      onTap: onTap,
      borderColor: selected ? AppColors.brand.withValues(alpha: 0.5) : null,
      backgroundColor:
          selected ? AppColors.brand.withValues(alpha: 0.08) : null,
      child: Row(
        children: [
          SizedBox(
            width: 50,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  o.startTime,
                  style: ProfessorLinksStyle.mono(14, color: colors.onSurface),
                ),
                if (o.endTime.isNotEmpty)
                  Text(
                    o.endTime,
                    style: ProfessorLinksStyle.mono(
                      9.5,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  o.className,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: ProfessorLinksStyle.display(
                    13.5,
                    weight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
                if (sub.isNotEmpty) ...[
                  const SizedBox(height: 3),
                  Text(
                    sub,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 11.5,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(
            directorySpotsLabel(o.spotsLeft).toUpperCase(),
            style: ProfessorLinksStyle.mono(
              10,
              color: colors.readableTone(colors.win),
            ),
          ),
          const SizedBox(width: 10),
          Container(
            width: 22,
            height: 22,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(
                width: 2,
                color: selected
                    ? AppColors.brand
                    : ProfessorLinksStyle.line2(colors),
              ),
            ),
            alignment: Alignment.center,
            child: selected
                ? Container(
                    width: 10,
                    height: 10,
                    decoration: const BoxDecoration(
                      color: AppColors.brand,
                      shape: BoxShape.circle,
                    ),
                  )
                : null,
          ),
        ],
      ),
    );
  }
}
