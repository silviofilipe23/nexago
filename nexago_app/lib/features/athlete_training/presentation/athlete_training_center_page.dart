import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/formatting/app_currency_format.dart';
import '../../../core/links/open_external_url.dart';
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
import '../application/athlete_training_providers.dart';
import '../domain/athlete_training.dart';
import '../domain/training_center.dart';
import '../domain/training_plans.dart';
import 'widgets/training_origin_widgets.dart';
import 'widgets/training_widgets.dart';

enum _Tab { program, places, plan }

/// O6 · Centro de treinamento — a matrícula do aluno no centro: programa
/// (equipe e próximas aulas), locais (o centro treina em mais de um lugar)
/// e plano (mensalidade cobrada PELO CENTRO e as faturas).
class AthleteTrainingCenterPage extends ConsumerStatefulWidget {
  const AthleteTrainingCenterPage({
    super.key,
    required this.centerId,
    this.initialTab,
  });

  final String centerId;

  /// `plano` abre direto na aba do plano (push de fatura).
  final String? initialTab;

  @override
  ConsumerState<AthleteTrainingCenterPage> createState() =>
      _AthleteTrainingCenterPageState();
}

class _AthleteTrainingCenterPageState
    extends ConsumerState<AthleteTrainingCenterPage> {
  late _Tab _tab = widget.initialTab == 'plano' ? _Tab.plan : _Tab.program;

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(athleteTrainingCenterProvider(widget.centerId));
    final center = async.valueOrNull;
    final now = ref.watch(professorLinksClockProvider)();
    final todayKey = nexagoEventDayKey(now);
    final active = center?.enrollments.where((e) => e.isActive).toList();

    return ProfessorLinksScaffold(
      title: 'Centro de treinamento',
      subtitle: center == null
          ? null
          : active != null && active.isNotEmpty
          ? 'MATRÍCULA ATIVA · DESDE '
                '${_monthYear(active.first.startDate)}'
          : center.enrollments.isEmpty
          ? 'SEM MATRÍCULA ATIVA'
          : centerEnrollmentStatusLabel(center.enrollments.first),
      onBack: () => popOrGo(context, AppRoutes.athleteTrainings),
      body: RefreshIndicator(
        color: AppColors.brand,
        onRefresh: () async {
          refreshAthleteTrainingCenters(ref);
          await ref.read(athleteTrainingCentersProvider.future);
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
          children: [
            if (async.isLoading && center == null)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 40),
                child: Center(
                  child: CircularProgressIndicator(color: AppColors.brand),
                ),
              )
            else if (center == null)
              const ProfessorLinksCard(
                key: Key('training-center-missing'),
                child: ProfessorMutedText(
                  'Não encontramos sua matrícula neste centro. Se você '
                  'acabou de entrar, puxe para atualizar.',
                ),
              )
            else ...[
              _Header(center: center, todayKey: todayKey),
              if (center.billingHold) ...[
                const SizedBox(height: 10),
                const TrainingOriginNote(
                  key: Key('training-center-hold'),
                  color: AppColors.live,
                  icon: Icons.error_outline_rounded,
                  title: 'Mensalidade em atraso',
                  text:
                      'O centro pode pedir a regularização antes do '
                      'check-in. Veja a fatura na aba Plano.',
                ),
              ],
              const SizedBox(height: 14),
              ArenaClassSegmented<_Tab>(
                items: const [
                  (_Tab.program, 'Programa'),
                  (_Tab.places, 'Locais'),
                  (_Tab.plan, 'Plano'),
                ],
                selected: _tab,
                onChanged: (t) => setState(() => _tab = t),
              ),
              ...switch (_tab) {
                _Tab.program => _program(context, center, now),
                _Tab.places => _places(context, center, now),
                _Tab.plan => _plan(context, center, todayKey),
              },
            ],
          ],
        ),
      ),
    );
  }

  List<Widget> _program(
    BuildContext context,
    TrainingCenterLink center,
    DateTime now,
  ) {
    final trainings = ref.watch(athleteTrainingsProvider) ?? const [];
    final upcoming = [
      for (final t in upcomingTrainings(trainings, now))
        if (t.isCenter && t.centerId == center.centerId) t,
    ];
    final coaches = center.coachNames;
    return [
      if (coaches.isNotEmpty) ...[
        const TrainingSectionTitle('Equipe'),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final n in coaches)
              _CoachChip(key: Key('training-center-coach-$n'), name: n),
          ],
        ),
      ],
      if (center.makeupCredits > 0) ...[
        const SizedBox(height: 12),
        TrainingOriginNote(
          key: const Key('training-center-makeup'),
          color: ProfessorLinksStyle.blue,
          title: center.makeupCredits == 1
              ? '1 crédito de reposição'
              : '${center.makeupCredits} créditos de reposição',
          text:
              'A reposição é marcada pelo centro numa turma com vaga. '
              'Vale por ${center.policies.makeupValidityDays} dias.',
        ),
      ],
      const TrainingSectionTitle('Próximas aulas'),
      if (upcoming.isEmpty)
        const ProfessorLinksCard(
          key: Key('training-center-no-sessions'),
          child: ProfessorMutedText(
            'Nenhuma aula marcada nas próximas semanas.',
          ),
        )
      else
        for (final t in upcoming.take(6)) ...[
          TrainingRow(
            key: Key('training-center-row-${t.id}'),
            training: t,
            onTap: () => openTraining(context, t),
          ),
          const SizedBox(height: 8),
        ],
    ];
  }

  List<Widget> _places(
    BuildContext context,
    TrainingCenterLink center,
    DateTime now,
  ) {
    final colors = context.themeColors;
    final today = nexagoEventDayKey(now);
    // Aula futura em local diferente do padrão: marca o local "só nesta".
    final changedBy = <String, CenterSession>{};
    for (final s in center.sessions) {
      if (s.locationChanged && !s.isCancelled && s.date.compareTo(today) >= 0) {
        changedBy.putIfAbsent(s.locationName, () => s);
      }
    }
    return [
      const SizedBox(height: 12),
      Text(
        'O centro pode treinar em mais de um lugar. Cada aula mostra o local '
        'certo, e o aviso chega quando muda só para uma data.',
        style: AppTypography.bodyS.copyWith(
          fontSize: 12,
          height: 1.45,
          color: ProfessorLinksStyle.dim(colors),
        ),
      ),
      const SizedBox(height: 12),
      if (center.locations.isEmpty)
        const ProfessorLinksCard(
          child: ProfessorMutedText('O centro ainda não cadastrou os locais.'),
        ),
      for (final l in center.locations) ...[
        _PlaceCard(
          key: Key('training-center-place-${l.name}'),
          location: l,
          changedSession: changedBy[l.name],
        ),
        const SizedBox(height: 8),
      ],
    ];
  }

  List<Widget> _plan(
    BuildContext context,
    TrainingCenterLink center,
    String todayKey,
  ) {
    final p = center.policies;
    final open = center.openInvoices;
    final paid = [
      for (final i in center.invoices)
        if (i.isPaid) i,
    ];
    return [
      const SizedBox(height: 4),
      for (final e in center.enrollments) ...[
        const SizedBox(height: 10),
        TrainingKeyValueCard(
          key: Key('training-center-plan-${e.enrollmentId}'),
          rows: [
            ('Turma', e.className, null),
            ('Plano', e.planName, null),
            if (e.isPack && e.credits != null)
              ('Pacote', '${e.credits} aulas', null)
            else if (e.classesPerWeek != null)
              ('Frequência', '${e.classesPerWeek}× por semana', null),
            (
              'Valor',
              '${formatBRLFromCents(e.priceCents)}${e.isPack ? '' : '/mês'}',
              null,
            ),
            if (e.isPack && e.creditsLeft != null)
              ('Aulas restantes', '${e.creditsLeft}', ProfessorLinksStyle.blue),
            if (e.billingDay != null)
              ('Cobrança', 'Todo dia ${e.billingDay}', null),
            if (e.billingStatus != null)
              ('Forma', centerBillingMethodLabel(e.billingMethod), null),
            if (e.nextChargeDate != null)
              (
                'Próxima',
                '${trainingPlanShortDate(e.nextChargeDate!)} · '
                    '${formatBRLFromCents(e.priceCents)}',
                null,
              ),
            if (e.status != 'active')
              ('Situação', _statusText(e), AppColors.pending),
          ],
        ),
      ],
      const SizedBox(height: 10),
      TrainingKeyValueCard(
        key: const Key('training-center-rules'),
        rows: [
          ('Quem cobra', center.name, null),
          (
            'Avisar falta',
            p.excusedAbsenceMakeup
                ? 'Até ${p.excusedNoticeHours}h antes gera reposição'
                : 'Falta não gera reposição',
            null,
          ),
          (
            'Cancelar',
            p.monthlyCancellation == 'immediate'
                ? 'Na hora, sem próximo ciclo'
                : 'Vale até o fim do ciclo pago',
            null,
          ),
          if (p.allowPause) ('Pausa', 'Permitida, combine com o centro', null),
        ],
      ),
      if (open.isNotEmpty) ...[
        const TrainingSectionTitle('Em aberto'),
        for (final i in open) ...[
          _InvoiceCard(
            key: Key('training-center-invoice-${i.invoiceId}'),
            centerId: center.centerId,
            invoice: i,
            todayKey: todayKey,
          ),
          const SizedBox(height: 8),
        ],
      ] else if (paid.isNotEmpty) ...[
        const SizedBox(height: 10),
        TrainingOriginNote(
          key: const Key('training-center-paid-note'),
          color: AppColors.win,
          title:
              '${paid.first.reference} paga'
              '${paid.first.paidOn == null ? '' : ' em ${trainingPlanShortDate(paid.first.paidOn!)}'}',
          text: 'A cobrança é feita pelo centro, não pelo professor.',
        ),
      ],
      if (paid.isNotEmpty) ...[
        const TrainingSectionTitle('Pagas'),
        ProfessorLinksCard(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
          child: Column(
            children: [
              for (final i in paid)
                _PaidRow(
                  key: Key('training-center-paid-${i.invoiceId}'),
                  invoice: i,
                ),
            ],
          ),
        ),
      ],
    ];
  }
}

String _statusText(CenterEnrollment e) => switch (e.status) {
  'paused' =>
    e.pausedUntil == null
        ? 'Pausada'
        : 'Pausada até ${trainingPlanShortDate(e.pausedUntil!)}',
  'pending' => 'Aguardando pagamento',
  'waitlisted' => 'Na fila de espera',
  _ => e.status,
};

/// "AGO 2026".
String _monthYear(String dateKey) {
  final d = DateTime.tryParse(dateKey);
  if (d == null) return '';
  const months = [
    'JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', //
    'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ',
  ];
  return '${months[d.month - 1]} ${d.year}';
}

class _Header extends StatelessWidget {
  const _Header({required this.center, required this.todayKey});

  final TrainingCenterLink center;
  final String todayKey;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final e = center.enrollments.isEmpty ? null : center.enrollments.first;
    final presence = center.monthPresencePercent(todayKey);
    final places = center.locations.length;
    final line = [
      center.placeLabel,
      if (places > 1) '$places locais de treino',
    ].where((s) => s.isNotEmpty).join(' · ');
    return TrainingOriginHeader(
      origin: TrainingOrigin.center,
      name: center.name,
      line: line,
      extra: e == null
          ? null
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        [
                          e.className,
                          if (e.level.isNotEmpty) e.level,
                        ].join(' · '),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: ProfessorLinksStyle.display(
                          14,
                          weight: FontWeight.w700,
                          color: colors.onSurface,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      _schedule(e).toUpperCase(),
                      style: ProfessorLinksStyle.mono(
                        10,
                        color: ProfessorLinksStyle.dim(colors),
                      ),
                    ),
                  ],
                ),
                if (presence != null) ...[
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          'FREQUÊNCIA DO MÊS',
                          style: ProfessorLinksStyle.mono(
                            9,
                            color: ProfessorLinksStyle.dim(colors),
                          ),
                        ),
                      ),
                      Text(
                        '$presence%',
                        key: const Key('training-center-presence'),
                        style: ProfessorLinksStyle.mono(
                          12,
                          color: colors.readableTone(
                            presence >= 75 ? AppColors.win : AppColors.pending,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(3),
                    child: LinearProgressIndicator(
                      value: presence / 100,
                      minHeight: 5,
                      color: trainingCenterColor,
                      backgroundColor: colors.surfaceRaised,
                    ),
                  ),
                ],
              ],
            ),
    );
  }
}

/// "Seg, Qua e Sex 07:00".
String _schedule(CenterEnrollment e) {
  final slots = [
    for (final w in e.weekdays)
      ArenaPlanSlot(className: e.className, weekday: w, startTime: e.startTime),
  ];
  return arenaPlanScheduleLabel(slots);
}

class _CoachChip extends StatelessWidget {
  const _CoachChip({super.key, required this.name});

  final String name;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.fromLTRB(8, 8, 14, 8),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(15),
        border: Border.all(color: ProfessorLinksStyle.line(colors)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          ArenaClassAvatar(
            initials: arenaClassInitials(name),
            size: 30,
            color: trainingCenterColor,
          ),
          const SizedBox(width: 9),
          Text(
            name,
            style: ProfessorLinksStyle.display(
              12.5,
              weight: FontWeight.w700,
              color: colors.onSurface,
            ),
          ),
        ],
      ),
    );
  }
}

class _PlaceCard extends StatelessWidget {
  const _PlaceCard({super.key, required this.location, this.changedSession});

  final CenterLocation location;
  final CenterSession? changedSession;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final l = location;
    final changed = changedSession;
    final query = [l.name, l.address].where((s) => s.isNotEmpty).join(', ');
    return ProfessorLinksCard(
      borderColor: changed == null
          ? null
          : AppColors.pending.withValues(alpha: 0.35),
      onTap: () => openExternalUrl(
        'https://www.google.com/maps/search/?api=1&query='
        '${Uri.encodeComponent(query)}',
      ),
      padding: const EdgeInsets.all(12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: colors.surfaceRaised,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(
              Icons.place_outlined,
              size: 20,
              color: ProfessorLinksStyle.mute(colors),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  l.name,
                  style: ProfessorLinksStyle.display(
                    13.5,
                    weight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  [
                    centerLocationTypeLabel(l.type),
                    l.address,
                  ].where((s) => s.isNotEmpty).join(' · '),
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 11.5,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
                if (l.notes.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    l.notes,
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 11.5,
                      height: 1.35,
                      color: ProfessorLinksStyle.mute(colors),
                    ),
                  ),
                ],
                if (changed != null) ...[
                  const SizedBox(height: 6),
                  Text(
                    '${trainingWeekdayDay(changed.date)} · SÓ NESTA AULA',
                    style: ProfessorLinksStyle.mono(
                      9.5,
                      color: colors.readableTone(AppColors.pending),
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

class _InvoiceCard extends StatelessWidget {
  const _InvoiceCard({
    super.key,
    required this.centerId,
    required this.invoice,
    required this.todayKey,
  });

  final String centerId;
  final CenterInvoice invoice;
  final String todayKey;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final i = invoice;
    final overdue = i.isOverdue(todayKey);
    final statusColor = overdue || i.status == 'failed'
        ? AppColors.live
        : AppColors.pending;
    return ProfessorLinksCard(
      padding: const EdgeInsets.all(13),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  i.reference,
                  style: ProfessorLinksStyle.display(
                    14,
                    weight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
              ),
              Text(
                centerInvoiceStatusLabel(i, todayKey),
                style: ProfessorLinksStyle.mono(
                  9.5,
                  color: colors.readableTone(statusColor),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(
                formatBRLFromCents(i.amountCents),
                style: ProfessorLinksStyle.display(24, color: colors.onSurface),
              ),
              const SizedBox(width: 8),
              if (i.dueDate.isNotEmpty)
                Flexible(
                  child: Text(
                    '${overdue ? 'venceu' : 'vence'} '
                    '${trainingPlanShortDate(i.dueDate)}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 12.5,
                      color: overdue
                          ? colors.readableTone(AppColors.live)
                          : ProfessorLinksStyle.mute(colors),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 10),
          ProfessorLinksPrimaryButton(
            key: Key('training-center-pay-${i.invoiceId}'),
            label: 'Pagar com Pix ou cartão',
            height: 42,
            onPressed: () => openCenterInvoice(context, centerId, i.invoiceId),
          ),
        ],
      ),
    );
  }
}

class _PaidRow extends StatelessWidget {
  const _PaidRow({super.key, required this.invoice});

  final CenterInvoice invoice;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final i = invoice;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 9),
      child: Row(
        children: [
          SizedBox(
            width: 50,
            child: Text(
              trainingPlanShortDate(i.paidOn ?? i.dueDate).toUpperCase(),
              style: ProfessorLinksStyle.mono(
                10,
                color: ProfessorLinksStyle.dim(colors),
              ),
            ),
          ),
          Expanded(
            child: Text(
              i.reference,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.bodyS.copyWith(
                fontSize: 12.5,
                color: colors.onSurface,
              ),
            ),
          ),
          Text(
            formatBRLFromCents(i.amountCents),
            style: ProfessorLinksStyle.mono(
              12,
              color: ProfessorLinksStyle.mute(colors),
            ),
          ),
        ],
      ),
    );
  }
}
