import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/friendly_error_message.dart';
import '../../../core/formatting/app_currency_format.dart';
import '../../../core/layout/nexa_app_bar.dart';
import '../../../core/profiles/app_user_profile.dart';
import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/nexa_async_view.dart';
import '../../../core/ui/nexa_bottom_action_bar.dart';
import '../../../core/ui/nexa_skeleton.dart';
import '../../arena/domain/aulas/arena_class_logic.dart'
    show arenaClassInitials;
import '../../arena/presentation/aulas/widgets/arena_class_atoms.dart'
    show ArenaClassAvatar;
import '../../arena/presentation/aulas/widgets/arena_class_form_atoms.dart'
    show ArenaClassAthleteSearch, arenaClassAthleteName;
import '../application/schedule_plans_providers.dart';
import '../domain/schedule_plan_logic.dart';
import '../domain/schedule_plan_models.dart';
import 'widgets/schedule_plan_ui.dart';

/// A2 · Montar o horário fixo: dias, horário que vale para todos, ciclo,
/// forma de pagamento e rateio. Também serve para aceitar a vaga oferecida
/// pela lista de espera ([offerEntryId], horário travado) e para o titular
/// trocar o horário da assinatura ([changeSubscriptionId]).
class SchedulePlanSignupPage extends ConsumerStatefulWidget {
  const SchedulePlanSignupPage({
    super.key,
    required this.arenaId,
    required this.planId,
    this.offerEntryId,
    this.changeSubscriptionId,
  });

  final String arenaId;
  final String planId;
  final String? offerEntryId;
  final String? changeSubscriptionId;

  @override
  ConsumerState<SchedulePlanSignupPage> createState() =>
      _SchedulePlanSignupPageState();
}

enum _Mode { subscribe, offer, change }

class _SchedulePlanSignupPageState
    extends ConsumerState<SchedulePlanSignupPage> {
  List<int> _days = const [];
  String? _time;
  SchedulePlanCycle? _cycle;
  SchedulePaymentMethod? _method;
  bool _split = false;
  final List<AppUserProfile> _members = [];
  bool _saving = false;
  String? _joiningTime;

  _Mode get _mode => widget.offerEntryId != null
      ? _Mode.offer
      : widget.changeSubscriptionId != null
          ? _Mode.change
          : _Mode.subscribe;

  ({String arenaId, String planId}) get _key =>
      (arenaId: widget.arenaId, planId: widget.planId);

  SchedulePlanCycleOption _cycleOption(SchedulePlan plan) {
    final options = plan.enabledCycles;
    return options.firstWhere(
      (o) => o.cycle == _cycle,
      orElse: () => options.first,
    );
  }

  SchedulePaymentMethod _methodOf(SchedulePlan plan) {
    final m = _method;
    return m != null && plan.billingMethods.contains(m)
        ? m
        : plan.billingMethods.first;
  }

  int _players(SchedulePlan plan) =>
      plan.rules.splitEnabled && _split ? 1 + _members.length : 1;

  ScheduleWaitlistOffer? _offer() {
    final id = widget.offerEntryId;
    if (id == null) return null;
    final data = ref.watch(myScheduleSubscriptionsProvider).valueOrNull;
    for (final o in data?.offers ?? const <ScheduleWaitlistOffer>[]) {
      if (o.entryId == id) return o;
    }
    return null;
  }

  Future<void> _addMember(SchedulePlan plan) async {
    final me = ref.read(schedulePlansUidProvider);
    final picked = await showScheduleSheet<AppUserProfile>(
      context,
      builder: (sheetContext) => Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          12,
          20,
          20 + MediaQuery.viewInsetsOf(sheetContext).bottom,
        ),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              const ScheduleSheetHeader(
                title: 'Dividir com quem?',
                subtitle: 'Busque atletas com conta NexaGO. Cada um paga a '
                    'sua parte todo mês.',
              ),
              const SizedBox(height: 16),
              ArenaClassAthleteSearch(
                selectedUid: null,
                autofocus: true,
                hint: 'Buscar atleta por nome ou apelido',
                excludeUids: {me, for (final m in _members) m.uid},
                onSelect: (user) => Navigator.of(sheetContext).pop(user),
              ),
            ],
          ),
        ),
      ),
    );
    if (picked == null || !mounted) return;
    if (_members.any((m) => m.uid == picked.uid)) return;
    if (1 + _members.length >= plan.rules.splitMaxPlayers) return;
    setState(() => _members.add(picked));
  }

  void _removeMember(AppUserProfile user) {
    setState(() => _members.removeWhere((m) => m.uid == user.uid));
    showAppSnackBar(
      context,
      '${arenaClassAthleteName(user)} saiu da divisão.',
    );
  }

  Future<void> _joinWaitlist(SchedulePlan plan, String startTime) async {
    if (_joiningTime != null) return;
    setState(() => _joiningTime = startTime);
    try {
      final position = await ref.read(schedulePlansRepositoryProvider).joinWaitlist(
            arenaId: widget.arenaId,
            planId: widget.planId,
            weekdays: [..._days]..sort(),
            startTime: startTime,
            playersCount: _players(plan),
          );
      ref.invalidate(schedulePlanAvailabilityProvider(_key));
      if (!mounted) return;
      showAppSnackBar(
        context,
        position > 0
            ? 'Você entrou na fila: é o $positionº. A arena avisa quando '
                'abrir vaga.'
            : 'Você entrou na fila. A arena avisa quando abrir vaga.',
      );
    } catch (e) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        friendlyErrorMessage(
          e,
          action: 'Não foi possível entrar na fila',
          logReason: 'schedule_plan_waitlist',
        ),
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _joiningTime = null);
    }
  }

  Future<void> _submit(SchedulePlan plan) async {
    if (_saving) return;
    setState(() => _saving = true);
    final repo = ref.read(schedulePlansRepositoryProvider);
    final cycle = _cycleOption(plan).cycle;
    final method = _methodOf(plan);
    final memberIds = plan.rules.splitEnabled && _split
        ? [for (final m in _members) m.uid]
        : const <String>[];
    try {
      final String message;
      switch (_mode) {
        case _Mode.subscribe:
          final result = await repo.subscribe(
            arenaId: widget.arenaId,
            planId: widget.planId,
            weekdays: [..._days]..sort(),
            startTime: _time!,
            cycle: cycle,
            paymentMethod: method,
            memberAthleteIds: memberIds,
          );
          final court =
              result.courtName.isEmpty ? '' : ' na ${result.courtName}';
          final first = result.firstChargeReais;
          message = first != null && first > 0
              ? 'Plano assinado$court! 1ª mensalidade: ${formatBRL(first)}.'
              : 'Plano assinado$court! Seu horário é seu toda semana.';
        case _Mode.offer:
          await repo.acceptOffer(
            entryId: widget.offerEntryId!,
            cycle: cycle,
            paymentMethod: method,
            memberAthleteIds: memberIds,
          );
          message = 'Vaga aceita! O horário agora é seu toda semana.';
        case _Mode.change:
          final court = await repo.changeSlots(
            subscriptionId: widget.changeSubscriptionId!,
            weekdays: [..._days]..sort(),
            startTime: _time!,
          );
          message = court.isEmpty
              ? 'Horário trocado.'
              : 'Horário trocado. Agora na $court.';
      }
      ref.invalidate(myScheduleSubscriptionsProvider);
      ref.invalidate(schedulePlanAvailabilityProvider(_key));
      ref.invalidate(arenaActiveSchedulePlansProvider(widget.arenaId));
      if (!mounted) return;
      showAppSnackBar(context, message);
      if (_mode == _Mode.change) {
        popOrGo(context, AppRoutes.mySchedulePlans);
      } else {
        context.pushReplacement(AppRoutes.mySchedulePlans);
      }
    } catch (e) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        friendlyErrorMessage(
          e,
          action: switch (_mode) {
            _Mode.subscribe => 'Não foi possível assinar o plano',
            _Mode.offer => 'Não foi possível aceitar a vaga',
            _Mode.change => 'Não foi possível trocar o horário',
          },
          logReason: 'schedule_plan_submit',
        ),
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final availabilityAsync = ref.watch(schedulePlanAvailabilityProvider(_key));
    final availability = availabilityAsync.valueOrNull;
    final plan = availability?.plan;
    final offer = _offer();
    return Scaffold(
      backgroundColor: colors.canvas,
      appBar: NexaAppBar(
        centerTitle: true,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          tooltip: 'Voltar',
          onPressed: () => popOrGo(
            context,
            _mode == _Mode.subscribe
                ? AppRoutes.arenaSchedulePlans
                    .replaceAll(':arenaId', widget.arenaId)
                : AppRoutes.mySchedulePlans,
          ),
        ),
        title: Text(
          _mode == _Mode.change
              ? 'Trocar horário'
              : (plan?.name ?? 'Escolher horário'),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
      ),
      bottomNavigationBar: availability == null
          ? null
          : _bottomBar(availability, offer),
      body: NexaAsyncView<SchedulePlanAvailability>(
        value: availabilityAsync,
        onRetry: () => ref.invalidate(schedulePlanAvailabilityProvider(_key)),
        errorMessage: 'Não foi possível carregar os horários. Tente novamente.',
        skeleton: const _SignupSkeleton(),
        data: (a) => ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
          children: [
            if (_mode == _Mode.offer)
              ..._offerSection(a, offer)
            else
              ..._slotSection(a),
            if (_mode != _Mode.change) ...[
              const SizedBox(height: 18),
              const ScheduleKicker('Ciclo'),
              const SizedBox(height: 8),
              _cycleChips(a.plan),
              ..._cycleNote(a.plan),
              const SizedBox(height: 18),
              const ScheduleKicker('Pagamento'),
              const SizedBox(height: 8),
              _methodChips(a.plan),
              const SizedBox(height: 8),
              Text(
                'Por enquanto a mensalidade é acertada com a arena, que dá '
                'baixa a cada mês.',
                style: TextStyle(fontSize: 11.5, color: colors.onSurfaceMuted),
              ),
              if (a.plan.rules.splitEnabled) ...[
                const SizedBox(height: 16),
                _splitCard(a.plan),
              ],
            ],
          ],
        ),
      ),
    );
  }

  // ── Dias + horário ────────────────────────────────────────────────────

  List<Widget> _slotSection(SchedulePlanAvailability a) {
    final colors = context.themeColors;
    final plan = a.plan;
    final n = plan.timesPerWeek;
    final weekdays = scheduleSelectableWeekdays(plan, a.days);
    final times = scheduleTimesForWeekdays(a.days, _days);
    final complete = _days.length == n;
    return [
      ScheduleKicker(n == 1 ? 'Escolha 1 dia' : 'Escolha $n dias'),
      const SizedBox(height: 8),
      Row(
        children: [
          for (var i = 0; i < weekdays.length; i++) ...[
            if (i > 0) const SizedBox(width: 6),
            Expanded(
              child: ScheduleChoiceChip(
                key: ValueKey('schedule-day-${weekdays[i]}'),
                label: scheduleWeekdayShort(weekdays[i]),
                selected: _days.contains(weekdays[i]),
                onTap: () => setState(() {
                  _days = scheduleToggleWeekday(_days, weekdays[i], n);
                  final still = scheduleTimesForWeekdays(a.days, _days)
                      .any((t) => t.startTime == _time);
                  if (!still) _time = null;
                }),
              ),
            ),
          ],
        ],
      ),
      const SizedBox(height: 18),
      ScheduleKicker(
        _days.isEmpty
            ? 'Horário'
            : 'Horário · vale para ${scheduleWeekdaysList(_days)}',
      ),
      const SizedBox(height: 8),
      if (_days.isEmpty)
        Text(
          n == 1
              ? 'Escolha o dia para ver os horários livres.'
              : 'Escolha os $n dias para ver os horários livres em todos eles.',
          style: TextStyle(fontSize: 12.5, color: colors.onSurfaceMuted),
        )
      else if (times.isEmpty)
        Text(
          'Nenhum horário que sirva para ${scheduleWeekdaysList(_days)}. '
          'Tente outra combinação de dias.',
          style: TextStyle(fontSize: 12.5, color: colors.onSurfaceMuted),
        )
      else ...[
        if (!complete)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(
              'Falta escolher ${n - _days.length} '
              '${n - _days.length == 1 ? 'dia' : 'dias'}.',
              style: TextStyle(fontSize: 12, color: colors.pending),
            ),
          ),
        for (final t in times) ...[
          _TimeRow(
            time: t,
            primeCapReached: a.primeCapReached,
            selected: t.startTime == _time,
            canJoinWaitlist: complete && _mode == _Mode.subscribe,
            joining: _joiningTime == t.startTime,
            onTap: t.bookable(primeCapReached: a.primeCapReached)
                ? () => setState(() => _time = t.startTime)
                : null,
            onJoinWaitlist: () => _joinWaitlist(plan, t.startTime),
          ),
          const SizedBox(height: 6),
        ],
      ],
    ];
  }

  List<Widget> _offerSection(
    SchedulePlanAvailability a,
    ScheduleWaitlistOffer? offer,
  ) {
    final colors = context.themeColors;
    final loading = ref.watch(myScheduleSubscriptionsProvider).isLoading;
    if (offer == null) {
      if (loading) {
        return const [NexaSkeleton(height: 96)];
      }
      return const [
        ScheduleBanner(
          icon: Icons.timer_off_rounded,
          title: 'Esta vaga não está mais disponível',
          message: 'A oferta venceu ou já foi respondida. Você pode escolher '
              'outro horário no plano.',
          tone: AppColors.pending,
        ),
      ];
    }
    final end = scheduleEndTime(offer.startTime, a.plan.durationMinutes);
    final expires = offer.expiresAt;
    return [
      const ScheduleKicker('Vaga liberada para você'),
      const SizedBox(height: 8),
      ScheduleCard(
        selected: true,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${offer.startTime} – $end',
              style: AppTypography.mono(
                fontSize: 24,
                fontWeight: FontWeight.w800,
                color: colors.onSurface,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              [
                scheduleWeekdaysList(offer.weekdays, long: true),
                if (offer.courtName.isNotEmpty) offer.courtName,
              ].join(' · '),
              style: TextStyle(fontSize: 13, color: colors.onSurfaceMuted),
            ),
            if (expires != null) ...[
              const SizedBox(height: 8),
              Text(
                'Aceite até ${scheduleDayMonth(expires)} às '
                '${expires.hour.toString().padLeft(2, '0')}:'
                '${expires.minute.toString().padLeft(2, '0')}.',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: colors.pending,
                ),
              ),
            ],
          ],
        ),
      ),
    ];
  }

  // ── Ciclo, pagamento, rateio ──────────────────────────────────────────

  Widget _cycleChips(SchedulePlan plan) {
    final options = plan.enabledCycles;
    final current = _cycleOption(plan).cycle;
    return Row(
      children: [
        for (var i = 0; i < options.length; i++) ...[
          if (i > 0) const SizedBox(width: 6),
          Expanded(
            child: ScheduleChoiceChip(
              key: ValueKey('schedule-cycle-${options[i].cycle.key}'),
              label: options[i].cycle.label,
              sub: '${scheduleMoney(scheduleCycleMonthlyPrice(
                plan.monthlyPriceReais,
                options[i],
              ).roundToDouble())}/mês',
              selected: options[i].cycle == current,
              onTap: () => setState(() => _cycle = options[i].cycle),
            ),
          ),
        ],
      ],
    );
  }

  List<Widget> _cycleNote(SchedulePlan plan) {
    final option = _cycleOption(plan);
    final months = switch (option.cycle) {
      SchedulePlanCycle.monthly => 0,
      SchedulePlanCycle.quarterly => 3,
      SchedulePlanCycle.annual => 12,
    };
    if (months == 0) return const [];
    return [
      const SizedBox(height: 8),
      Text(
        '${option.discountPercent.round()}% de desconto com compromisso de '
        '$months meses, pago mês a mês.',
        style: TextStyle(
          fontSize: 11.5,
          color: context.themeColors.onSurfaceMuted,
        ),
      ),
    ];
  }

  Widget _methodChips(SchedulePlan plan) {
    final methods = plan.billingMethods;
    final current = _methodOf(plan);
    return Row(
      children: [
        for (var i = 0; i < methods.length; i++) ...[
          if (i > 0) const SizedBox(width: 6),
          Expanded(
            child: ScheduleChoiceChip(
              key: ValueKey('schedule-method-${methods[i].key}'),
              label: methods[i].label,
              selected: methods[i] == current,
              onTap: () => setState(() => _method = methods[i]),
            ),
          ),
        ],
      ],
    );
  }

  Widget _splitCard(SchedulePlan plan) {
    final colors = context.themeColors;
    final max = plan.rules.splitMaxPlayers;
    final count = 1 + _members.length;
    return ScheduleCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: AppColors.brand.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(11),
                ),
                child: Icon(
                  Icons.group_rounded,
                  size: 20,
                  color: colors.brandText,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Dividir com a galera',
                      style: AppTypography.soraRegular(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Cada um paga a sua parte todo mês',
                      style: TextStyle(
                        fontSize: 12,
                        color: colors.onSurfaceMuted,
                      ),
                    ),
                  ],
                ),
              ),
              Switch.adaptive(
                key: const Key('schedule-split-toggle'),
                value: _split,
                activeTrackColor: AppColors.brand,
                onChanged: (v) => setState(() => _split = v),
              ),
            ],
          ),
          if (_split) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      const Tooltip(
                        message: 'Você (titular)',
                        child: ArenaClassAvatar(initials: 'VC', size: 30),
                      ),
                      for (final m in _members)
                        Tooltip(
                          message: 'Tirar ${arenaClassAthleteName(m)}',
                          child: InkWell(
                            customBorder: const CircleBorder(),
                            onTap: () => _removeMember(m),
                            child: ArenaClassAvatar(
                              initials: arenaClassInitials(
                                arenaClassAthleteName(m),
                              ),
                              photoUrl: m.profilePhotoUrl,
                              size: 30,
                            ),
                          ),
                        ),
                      if (count < max)
                        Semantics(
                          button: true,
                          label: 'Adicionar atleta à divisão',
                          child: InkWell(
                            key: const Key('schedule-split-add'),
                            customBorder: const CircleBorder(),
                            onTap: () => _addMember(plan),
                            child: Container(
                              width: 30,
                              height: 30,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                border: Border.all(
                                  color: colors.onSurfaceMuted,
                                ),
                              ),
                              child: Icon(
                                Icons.add_rounded,
                                size: 16,
                                color: colors.onSurfaceMuted,
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  '$count de $max',
                  style: TextStyle(
                    fontSize: 11.5,
                    color: colors.onSurfaceMuted,
                  ),
                ),
              ],
            ),
            if (_members.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                [
                  'Você',
                  for (final m in _members) arenaClassAthleteName(m),
                ].join(', '),
                style: TextStyle(fontSize: 12, color: colors.onSurfaceMuted),
              ),
            ],
            const SizedBox(height: 6),
            Text(
              'Se alguém não pagar, o titular cobre a parte dele.',
              style: TextStyle(fontSize: 11.5, color: colors.onSurfaceMuted),
            ),
          ],
        ],
      ),
    );
  }

  // ── Rodapé ────────────────────────────────────────────────────────────

  Widget _bottomBar(SchedulePlanAvailability a, ScheduleWaitlistOffer? offer) {
    final colors = context.themeColors;
    final plan = a.plan;
    if (_mode == _Mode.change) {
      final ready = _readyForSlots(a);
      return NexaBottomActionBar(
        action: SchedulePrimaryButton(
          key: const Key('schedule-signup-submit'),
          label: 'Trocar horário',
          loading: _saving,
          onPressed: ready ? () => _submit(plan) : null,
        ),
      );
    }
    final players = _players(plan);
    final monthly = scheduleCycleMonthlyPrice(
      plan.monthlyPriceReais,
      _cycleOption(plan),
    );
    final share = scheduleSharePerPlayer(monthly, players);
    final ready = _mode == _Mode.offer ? offer != null : _readyForSlots(a);
    return NexaBottomActionBar(
      leading: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            formatBRL(share),
            key: const Key('schedule-signup-share'),
            style: AppTypography.mono(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              color: colors.onSurface,
            ),
          ),
          Text(
            players > 1 ? 'sua parte · por mês' : 'por mês',
            style: TextStyle(fontSize: 11, color: colors.onSurfaceMuted),
          ),
        ],
      ),
      action: SchedulePrimaryButton(
        key: const Key('schedule-signup-submit'),
        label: _mode == _Mode.offer ? 'Aceitar vaga' : 'Assinar',
        loading: _saving,
        onPressed: ready ? () => _submit(plan) : null,
      ),
    );
  }

  bool _readyForSlots(SchedulePlanAvailability a) {
    if (_days.length != a.plan.timesPerWeek || _time == null) return false;
    return scheduleTimesForWeekdays(a.days, _days).any((t) =>
        t.startTime == _time &&
        t.bookable(primeCapReached: a.primeCapReached));
  }
}

class _TimeRow extends StatelessWidget {
  const _TimeRow({
    required this.time,
    required this.primeCapReached,
    required this.selected,
    required this.canJoinWaitlist,
    required this.joining,
    required this.onTap,
    required this.onJoinWaitlist,
  });

  final ScheduleCombinedTime time;
  final bool primeCapReached;
  final bool selected;
  final bool canJoinWaitlist;
  final bool joining;
  final VoidCallback? onTap;
  final VoidCallback onJoinWaitlist;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final bookable = time.bookable(primeCapReached: primeCapReached);
    final primeFull = time.prime && primeCapReached && time.freeCourts > 0;
    final status = bookable
        ? scheduleFreeCourtsLabel(time.freeCourts)
        : primeFull
            ? 'Nobre no limite de planos · fila ${time.waitlistCount}'
            : 'Lista de espera · ${time.waitlistCount}';
    final radius = BorderRadius.circular(12);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        key: ValueKey('schedule-time-${time.startTime}'),
        onTap: onTap,
        borderRadius: radius,
        child: Ink(
          height: 46,
          padding: const EdgeInsets.symmetric(horizontal: 14),
          decoration: BoxDecoration(
            color: selected
                ? AppColors.brand.withValues(alpha: 0.08)
                : colors.surfaceCard,
            borderRadius: radius,
            border: Border.all(
              width: 1.5,
              color: selected ? AppColors.brand : scheduleLine(context),
            ),
          ),
          child: Row(
            children: [
              Text(
                time.startTime,
                style: AppTypography.mono(
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                  color: colors.onSurface,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  status,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 12,
                    color: bookable ? colors.onSurfaceMuted : colors.pending,
                  ),
                ),
              ),
              if (!bookable && canJoinWaitlist)
                joining
                    ? SizedBox.square(
                        dimension: 16,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: colors.pending,
                        ),
                      )
                    : GestureDetector(
                        key: ValueKey('schedule-waitlist-${time.startTime}'),
                        behavior: HitTestBehavior.opaque,
                        onTap: onJoinWaitlist,
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          child: Text(
                            'Entrar na fila',
                            style: AppTypography.soraRegular(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: colors.pending,
                            ),
                          ),
                        ),
                      ),
              if (selected)
                Container(
                  width: 20,
                  height: 20,
                  decoration: const BoxDecoration(
                    color: AppColors.brand,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.check_rounded,
                    size: 13,
                    color: AppColors.black,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SignupSkeleton extends StatelessWidget {
  const _SignupSkeleton();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const NexaSkeleton(width: 120, height: 11),
          const SizedBox(height: 10),
          Row(
            children: [
              for (var i = 0; i < 5; i++) ...[
                if (i > 0) const SizedBox(width: 6),
                const Expanded(child: NexaSkeleton(height: 40)),
              ],
            ],
          ),
          const SizedBox(height: 22),
          const NexaSkeleton(width: 160, height: 11),
          const SizedBox(height: 10),
          for (var i = 0; i < 4; i++) ...[
            const NexaSkeleton(height: 46),
            const SizedBox(height: 6),
          ],
        ],
      ),
    );
  }
}
