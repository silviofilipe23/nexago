import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/friendly_error_message.dart';
import '../../../core/formatting/app_currency_format.dart';
import '../../../core/formatting/app_date_format.dart';
import '../../../core/layout/nexa_app_bar.dart';
import '../../../core/links/open_external_url.dart';
import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/nexa_async_view.dart';
import '../../../core/ui/nexa_skeleton.dart';
import '../../../core/validation/cpf_cnpj.dart';
import '../../arena/domain/aulas/arena_class_logic.dart'
    show arenaClassInitials;
import '../../arena/presentation/aulas/widgets/arena_class_atoms.dart'
    show ArenaClassAvatar;
import '../../athlete/domain/athlete_profile_providers.dart';
import '../application/schedule_plans_providers.dart';
import '../domain/schedule_plan_logic.dart';
import '../domain/schedule_plan_models.dart';
import '../infrastructure/schedule_plans_repository.dart';
import 'schedule_plans_routes.dart';
import 'widgets/schedule_charge_cpf_sheet.dart';
import 'widgets/schedule_plan_sheets.dart';
import 'widgets/schedule_plan_ui.dart';

/// A3 · Meu plano: a próxima ocorrência, a faixa do mês, as ações (faltar,
/// reposição, trocar, pausar), a próxima cobrança e as vagas oferecidas pela
/// lista de espera. Destino dos pushes dos planos (`/meus-planos-horario`).
class MySchedulePlansPage extends ConsumerStatefulWidget {
  const MySchedulePlansPage({super.key, this.now, this.openUrl});

  /// Relógio injetável para teste.
  final DateTime Function()? now;

  /// Abre a fatura fora do app; injetável para teste.
  final Future<bool> Function(String url)? openUrl;

  @override
  ConsumerState<MySchedulePlansPage> createState() =>
      _MySchedulePlansPageState();
}

class _MySchedulePlansPageState extends ConsumerState<MySchedulePlansPage> {
  String? _selectedId;
  bool _busy = false;

  /// Mensalidade cujo "Pagar" está buscando o link.
  String? _payingChargeId;

  /// A fatura abriu no navegador: na volta ao app, recarrega para mostrar
  /// "Pago" se o atleta pagou.
  bool _refreshOnResume = false;
  late final AppLifecycleListener _lifecycle;

  DateTime get _now => widget.now?.call() ?? DateTime.now();

  @override
  void initState() {
    super.initState();
    _lifecycle = AppLifecycleListener(onResume: () {
      if (!_refreshOnResume || !mounted) return;
      _refreshOnResume = false;
      _refresh();
    });
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    ref.invalidate(myScheduleSubscriptionsProvider);
    try {
      await ref.read(myScheduleSubscriptionsProvider.future);
    } catch (_) {
      // A tela mostra o erro.
    }
  }

  Future<void> _run(
    Future<String?> Function() action, {
    required String failure,
    required String logReason,
  }) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final message = await action();
      ref.invalidate(myScheduleSubscriptionsProvider);
      if (mounted && message != null) showAppSnackBar(context, message);
    } catch (e) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        friendlyErrorMessage(e, action: failure, logReason: logReason),
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  // ── Ações ─────────────────────────────────────────────────────────────

  /// "Pagar": link da fatura (Pix ou cartão) → navegador. Sem CPF guardado o
  /// servidor pede o CPF; a folha repete a chamada com ele.
  Future<void> _pay(ScheduleCharge charge) async {
    if (_payingChargeId != null) return;
    setState(() => _payingChargeId = charge.id);
    try {
      String? url;
      try {
        url = await ref
            .read(schedulePlansRepositoryProvider)
            .chargePaymentLink(chargeId: charge.id);
      } on SchedulePlanException catch (e) {
        if (!scheduleIsCpfRequired(code: e.code, message: e.message)) rethrow;
        if (!mounted) return;
        url = await showScheduleSheet<String>(
          context,
          builder: (_) => ScheduleChargeCpfSheet(
            chargeId: charge.id,
            initialCpf: _profileCpf(),
          ),
        );
      }
      if (url == null || !mounted) return;
      final opened = await (widget.openUrl ?? openExternalUrl)(url);
      if (!mounted) return;
      if (opened) {
        _refreshOnResume = true;
      } else {
        showAppSnackBar(
          context,
          'Não foi possível abrir a fatura. Tente de novo em instantes.',
          isError: true,
        );
      }
    } catch (e) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        friendlyErrorMessage(
          e,
          action: 'Não foi possível abrir o pagamento',
          logReason: 'schedule_plan_pay',
        ),
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _payingChargeId = null);
    }
  }

  /// CPF já salvo no perfil (preenche a folha); `null` sem perfil.
  String? _profileCpf() {
    try {
      final cpf = ref.read(athleteProfileProvider).valueOrNull?.cpfCnpj;
      return cpf != null && CpfCnpjValidator.isValid(cpf) ? cpf : null;
    } catch (_) {
      return null;
    }
  }

  Future<void> _skip(ScheduleSubscription sub) async {
    final now = _now;
    final options = scheduleSkippableOccurrences(sub.occurrences, now);
    if (options.isEmpty) return;
    final occurrence = options.length == 1
        ? options.first
        : await pickScheduleOccurrence(context, options);
    if (occurrence == null || !mounted) return;
    final rules = sub.rules;
    final late = scheduleIsLateNotice(
      occurrence,
      now,
      noticeHours: rules.makeupNoticeHours,
    );
    final ok = await confirmScheduleSkip(
      context,
      occurrence: occurrence,
      makeupEnabled: rules.makeupEnabled,
      lateNotice: late,
      noticeHours: rules.makeupNoticeHours,
      validityDays: rules.makeupValidityDays,
    );
    if (ok != true || !mounted) return;
    await _run(
      () async {
        final result = await ref
            .read(schedulePlansRepositoryProvider)
            .skipOccurrence(occurrence.bookingId);
        return scheduleSkipResultMessage(
          result,
          noticeHours: rules.makeupNoticeHours,
        );
      },
      failure: 'Não foi possível avisar a arena',
      logReason: 'schedule_plan_skip',
    );
  }

  Future<void> _useMakeup(ScheduleSubscription sub) async {
    final credits = scheduleAvailableCredits(sub.credits, _now);
    if (credits.isEmpty) return;
    final message = await showScheduleSheet<String>(
      context,
      builder: (_) => ScheduleMakeupSheet(
        credits: credits,
        validityDays: sub.rules.makeupValidityDays,
        now: _now,
      ),
    );
    if (message == null || !mounted) return;
    ref.invalidate(myScheduleSubscriptionsProvider);
    showAppSnackBar(context, message);
  }

  void _change(ScheduleSubscription sub) {
    context.push(
      schedulePlanSignupLocation(
        arenaId: sub.arenaId,
        planId: sub.planId,
        changeSubscriptionId: sub.id,
      ),
    );
  }

  Future<void> _pause(ScheduleSubscription sub) async {
    final now = _now;
    final left = schedulePauseDaysLeft(sub, now);
    if (left <= 0) return;
    final today = DateTime(now.year, now.month, now.day);
    final picked = await showDatePicker(
      context: context,
      initialDate: today.add(const Duration(days: 1)),
      firstDate: today.add(const Duration(days: 1)),
      lastDate: today.add(Duration(days: left)),
      helpText: 'Pausar até',
      cancelText: 'Cancelar',
      confirmText: 'Pausar',
    );
    if (picked == null || !mounted) return;
    final until = calendarDateKey(picked);
    await _run(
      () async {
        final daysLeft = await ref
            .read(schedulePlansRepositoryProvider)
            .pause(subscriptionId: sub.id, until: until);
        final tail = daysLeft == null
            ? ''
            : ' Sobram $daysLeft ${daysLeft == 1 ? 'dia' : 'dias'} de pausa '
                'no ano.';
        return 'Plano pausado até ${scheduleDayMonth(picked)}.$tail';
      },
      failure: 'Não foi possível pausar o plano',
      logReason: 'schedule_plan_pause',
    );
  }

  Future<void> _resume(ScheduleSubscription sub) async {
    final ok = await confirmScheduleAction(
      context,
      title: 'Retomar o plano agora?',
      message: 'Seus horários voltam a partir da próxima semana livre.',
      confirmLabel: 'Retomar',
    );
    if (ok != true || !mounted) return;
    await _run(
      () async {
        await ref.read(schedulePlansRepositoryProvider).resume(sub.id);
        return 'Plano retomado. Bom jogo!';
      },
      failure: 'Não foi possível retomar o plano',
      logReason: 'schedule_plan_resume',
    );
  }

  Future<void> _cancel(ScheduleSubscription sub) async {
    final exit = scheduleAthleteExitDate(sub, _now);
    final lastDay = DateTime(exit.year, exit.month, exit.day - 1);
    final commitment = sub.commitmentEndsOn;
    final ok = await confirmScheduleAction(
      context,
      title: 'Cancelar o plano?',
      message: 'Você continua jogando até ${scheduleDayMonth(lastDay)}. '
          'Depois disso o horário volta a ficar livre na arena.',
      confirmLabel: 'Cancelar plano',
      warning: ScheduleBanner(
        key: const Key('schedule-cancel-warning'),
        icon: Icons.info_outline_rounded,
        title: commitment != null && commitment.isAfter(_now)
            ? 'Fidelidade até ${scheduleDayMonth(commitment)}'
            : 'Sem devolução',
        message: 'As mensalidades até essa data seguem valendo e o que já foi '
            'pago não é devolvido. As seguintes são canceladas.',
        tone: AppColors.pending,
      ),
    );
    if (ok != true || !mounted) return;
    await _run(
      () async {
        final endsOn =
            await ref.read(schedulePlansRepositoryProvider).cancelMine(sub.id);
        final until = endsOn == null
            ? lastDay
            : DateTime(endsOn.year, endsOn.month, endsOn.day - 1);
        return 'Plano cancelado. Você joga até ${scheduleDayMonth(until)}.';
      },
      failure: 'Não foi possível cancelar o plano',
      logReason: 'schedule_plan_cancel',
    );
  }

  void _acceptOffer(ScheduleWaitlistOffer offer) {
    context.push(
      schedulePlanSignupLocation(
        arenaId: offer.arenaId,
        planId: offer.planId,
        offerEntryId: offer.entryId,
      ),
    );
  }

  // ── Tela ──────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final dataAsync = ref.watch(myScheduleSubscriptionsProvider);
    return Scaffold(
      backgroundColor: colors.canvas,
      appBar: NexaAppBar(
        centerTitle: true,
        // O push abre com `go` (sem pilha).
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          tooltip: 'Voltar',
          onPressed: () =>
              popOrGo(context, '${AppRoutes.discover}?tab=agenda'),
        ),
        title: const Text('Meu plano'),
      ),
      body: NexaAsyncView<MyScheduleSubscriptions>(
        value: dataAsync,
        onRetry: () => ref.invalidate(myScheduleSubscriptionsProvider),
        errorMessage:
            'Não foi possível carregar seus planos. Tente novamente.',
        skeleton: const _MyPlanSkeleton(),
        emptyWhen: (d) => d.isEmpty,
        empty: const _EmptyMyPlans(),
        data: (data) => RefreshIndicator(
          onRefresh: _refresh,
          color: AppColors.brand,
          child: _content(data),
        ),
      ),
    );
  }

  Widget _content(MyScheduleSubscriptions data) {
    final uid = ref.watch(schedulePlansUidProvider);
    final now = _now;
    final subs = data.subscriptions;
    ScheduleSubscription? sub;
    for (final s in subs) {
      if (s.id == _selectedId) sub = s;
    }
    sub ??= subs.isEmpty ? null : subs.first;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
      children: [
        for (final offer in data.offers) ...[
          _OfferBanner(offer: offer, onAccept: () => _acceptOffer(offer)),
          const SizedBox(height: 12),
        ],
        if (subs.length > 1) ...[
          _SubscriptionSelector(
            subscriptions: subs,
            selectedId: sub?.id,
            onSelect: (id) => setState(() => _selectedId = id),
          ),
          const SizedBox(height: 12),
        ],
        if (sub != null)
          ..._subscriptionSection(sub, uid: uid, now: now),
      ],
    );
  }

  List<Widget> _subscriptionSection(
    ScheduleSubscription sub, {
    required String uid,
    required DateTime now,
  }) {
    final colors = context.themeColors;
    final holder = scheduleIsHolder(sub, uid);
    final banner = _statusBanner(sub);
    final explanations = scheduleSkippedExplanations(sub, now);
    final credits = scheduleAvailableCredits(sub.credits, now);
    final skippable = scheduleSkippableOccurrences(sub.occurrences, now);
    final live = sub.status == ScheduleSubscriptionStatus.active;
    final paused = sub.status == ScheduleSubscriptionStatus.paused;
    final pauseLeft = schedulePauseDaysLeft(sub, now);
    final actions = <ScheduleActionTile>[
      ScheduleActionTile(
        key: const Key('schedule-action-skip'),
        icon: Icons.skip_next_rounded,
        title: 'Não vou nesta semana',
        subtitle: sub.rules.makeupEnabled ? 'Vira reposição' : 'Libera o horário',
        onTap: live && skippable.isNotEmpty && !_busy ? () => _skip(sub) : null,
      ),
      ScheduleActionTile(
        key: const Key('schedule-action-makeup'),
        icon: Icons.undo_rounded,
        title: 'Usar reposição',
        subtitle: credits.isEmpty
            ? 'Nenhuma disponível'
            : credits.length == 1
                ? '1 disponível'
                : '${credits.length} disponíveis',
        onTap: credits.isNotEmpty && !paused && !_busy
            ? () => _useMakeup(sub)
            : null,
      ),
      if (holder)
        ScheduleActionTile(
          key: const Key('schedule-action-change'),
          icon: Icons.swap_horiz_rounded,
          title: 'Trocar horário',
          subtitle: 'Se houver vaga',
          onTap: live && !_busy ? () => _change(sub) : null,
        ),
      if (holder && paused)
        ScheduleActionTile(
          key: const Key('schedule-action-resume'),
          icon: Icons.play_arrow_rounded,
          title: 'Retomar',
          subtitle: 'Volta a jogar já',
          onTap: !_busy ? () => _resume(sub) : null,
        )
      else if (holder && sub.rules.pauseEnabled)
        ScheduleActionTile(
          key: const Key('schedule-action-pause'),
          icon: Icons.pause_rounded,
          title: 'Pausar',
          subtitle: pauseLeft > 0
              ? 'Até $pauseLeft ${pauseLeft == 1 ? 'dia' : 'dias'}'
              : 'Sem dias de pausa no ano',
          onTap: live && pauseLeft > 0 && !_busy ? () => _pause(sub) : null,
        ),
    ];
    final byMonth = <int, List<ScheduleOccurrence>>{};
    for (final o in sub.occurrences) {
      byMonth.putIfAbsent(o.date.year * 100 + o.date.month, () => []).add(o);
    }
    final months = byMonth.keys.toList()..sort();
    return [
      if (banner != null) ...[banner, const SizedBox(height: 12)],
      ScheduleHeroCard(subscription: sub, now: now),
      for (final key in months) ...[
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(child: ScheduleKicker(scheduleMonthLong(key % 100))),
            if (credits.isNotEmpty && key == months.first)
              Text(
                credits.length == 1
                    ? '1 reposição para usar'
                    : '${credits.length} reposições para usar',
                style: AppTypography.mono(
                  fontSize: 10.5,
                  fontWeight: FontWeight.w600,
                  color: colors.onSurfaceMuted,
                ),
              ),
          ],
        ),
        const SizedBox(height: 8),
        ScheduleMonthStrip(occurrences: byMonth[key]!, now: now),
      ],
      if (explanations.isNotEmpty) ...[
        const SizedBox(height: 8),
        for (final line in explanations)
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(
              line,
              style: TextStyle(fontSize: 11.5, color: colors.onSurfaceMuted),
            ),
          ),
      ],
      const SizedBox(height: 14),
      ScheduleActionGrid(actions: actions),
      const SizedBox(height: 12),
      ScheduleChargeCard(
        subscription: sub,
        uid: uid,
        now: now,
        payingChargeId: _payingChargeId,
        onPay: _pay,
      ),
      if (scheduleCanCancel(sub, uid)) ...[
        const SizedBox(height: 8),
        Center(
          child: TextButton(
            key: const Key('schedule-action-cancel'),
            onPressed: _busy ? null : () => _cancel(sub),
            style: TextButton.styleFrom(
              foregroundColor: colors.onSurfaceMuted,
            ),
            child: const Text('Cancelar plano'),
          ),
        ),
      ],
    ];
  }

  Widget? _statusBanner(ScheduleSubscription sub) {
    switch (sub.status) {
      case ScheduleSubscriptionStatus.suspended:
        return const ScheduleBanner(
          key: Key('schedule-banner-suspended'),
          icon: Icons.error_outline_rounded,
          title: 'Plano suspenso por atraso',
          message: 'Os horários foram liberados. Quando a mensalidade em '
              'atraso for paga, a arena reativa o plano.',
          tone: AppColors.live,
        );
      case ScheduleSubscriptionStatus.paused:
        final until = sub.pausedUntil;
        return ScheduleBanner(
          key: const Key('schedule-banner-paused'),
          icon: Icons.pause_circle_outline_rounded,
          title: until == null
              ? 'Plano pausado'
              : 'Plano pausado até ${scheduleDayMonth(until)}',
          message: 'Seus horários voltam sozinhos na volta da pausa.',
          tone: AppColors.pending,
        );
      case ScheduleSubscriptionStatus.canceled:
        return const ScheduleBanner(
          icon: Icons.block_rounded,
          title: 'Plano encerrado',
          message: 'Este horário não é mais seu. Veja os planos da arena para '
              'assinar de novo.',
          tone: AppColors.live,
        );
      case ScheduleSubscriptionStatus.active:
        final ends = sub.endsOn;
        if (ends == null) return null;
        return ScheduleBanner(
          key: const Key('schedule-banner-ending'),
          icon: Icons.event_busy_rounded,
          title: 'Seu plano termina em ${scheduleDayMonth(ends)}',
          message: 'Depois disso o horário volta a ficar livre na arena.',
          tone: AppColors.brand,
        );
    }
  }
}

// ── Peças ─────────────────────────────────────────────────────────────────

class _OfferBanner extends StatelessWidget {
  const _OfferBanner({required this.offer, required this.onAccept});

  final ScheduleWaitlistOffer offer;
  final VoidCallback onAccept;

  @override
  Widget build(BuildContext context) {
    final expires = offer.expiresAt;
    final when = [
      if (offer.weekdays.isNotEmpty) scheduleWeekdaysList(offer.weekdays),
      if (offer.startTime.isNotEmpty) 'às ${offer.startTime}',
    ].join(' ');
    final parts = [
      if (when.isNotEmpty) when,
      if (offer.courtName.isNotEmpty) offer.courtName,
    ].join(' · ');
    final deadline = expires == null
        ? ''
        : ' Aceite até ${scheduleDayMonth(expires)} às '
            '${expires.hour.toString().padLeft(2, '0')}:'
            '${expires.minute.toString().padLeft(2, '0')}.';
    return ScheduleBanner(
      key: ValueKey('schedule-offer-${offer.entryId}'),
      icon: Icons.celebration_rounded,
      title: 'Vaga liberada · ${offer.planName}',
      message: '${parts.isEmpty ? 'Abriu vaga no horário que você queria.' : '$parts.'}'
          '$deadline',
      tone: AppColors.win,
      action: SizedBox(
        height: 40,
        child: FilledButton(
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.win,
            foregroundColor: AppColors.black,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
          onPressed: onAccept,
          child: Text(
            'Aceitar vaga',
            style: AppTypography.soraRegular(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: AppColors.black,
            ),
          ),
        ),
      ),
    );
  }
}

class _SubscriptionSelector extends StatelessWidget {
  const _SubscriptionSelector({
    required this.subscriptions,
    required this.selectedId,
    required this.onSelect,
  });

  final List<ScheduleSubscription> subscriptions;
  final String? selectedId;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final s in subscriptions) ...[
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ChoiceChip(
                key: ValueKey('schedule-sub-${s.id}'),
                selected: s.id == selectedId,
                showCheckmark: false,
                selectedColor: AppColors.brand,
                backgroundColor: colors.surfaceCard,
                side: BorderSide(
                  color: s.id == selectedId
                      ? AppColors.brand
                      : scheduleLine(context),
                ),
                label: Text(
                  s.arenaName.isEmpty
                      ? s.planName
                      : '${s.planName} · ${s.arenaName}',
                  style: AppTypography.soraRegular(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                    color: s.id == selectedId
                        ? AppColors.black
                        : colors.onSurface,
                  ),
                ),
                onSelected: (_) => onSelect(s.id),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Destaque da próxima ocorrência (ou de hoje), com quadra, plano e quem
/// joga junto.
class ScheduleHeroCard extends StatelessWidget {
  const ScheduleHeroCard({
    super.key,
    required this.subscription,
    required this.now,
  });

  final ScheduleSubscription subscription;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final sub = subscription;
    final next = scheduleHeroOccurrence(sub.occurrences, now);
    final String kicker;
    final String time;
    final String court;
    if (next != null) {
      final isToday = scheduleOccurrenceState(next, now) ==
          ScheduleOccurrenceState.today;
      kicker = isToday
          ? 'Hoje · ${scheduleWeekdayLong(next.date.weekday)}'
          : 'Próximo · ${scheduleWeekdayLong(next.date.weekday)}, '
              '${scheduleDayMonth(next.date)}';
      time = '${next.startTime} – ${next.endTime}';
      court = next.courtName;
    } else {
      final slot = sub.slots.isEmpty ? null : sub.slots.first;
      kicker = sub.slots.isEmpty
          ? 'Seu horário'
          : 'Seu horário · ${scheduleWeekdaysList(sub.slots.map((s) => s.weekday))}';
      time = slot == null ? '—' : '${slot.startTime} – ${slot.endTime}';
      court = slot?.courtName ?? '';
    }
    final members = sub.members;
    return Container(
      key: const Key('schedule-hero'),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          stops: const [0, 0.7],
          colors: [
            AppColors.brand.withValues(alpha: colors.isDark ? 0.22 : 0.12),
            colors.surfaceCard,
          ],
        ),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ScheduleKicker(kicker, color: colors.brandText),
          const SizedBox(height: 6),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              time,
              style: AppTypography.mono(
                fontSize: 30,
                fontWeight: FontWeight.w800,
                color: colors.onSurface,
              ),
            ),
          ),
          const SizedBox(height: 4),
          Text.rich(
            TextSpan(
              children: [
                if (sub.arenaName.isNotEmpty)
                  TextSpan(
                    text: sub.arenaName,
                    style: AppTypography.soraRegular(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: colors.onSurface,
                    ),
                  ),
                TextSpan(
                  text: [
                    if (sub.arenaName.isNotEmpty) '',
                    if (court.isNotEmpty) court,
                    sub.planName,
                  ].join(' · '),
                ),
              ],
            ),
            style: TextStyle(fontSize: 13, color: colors.onSurfaceMuted),
          ),
          if (members.isNotEmpty) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                SizedBox(
                  height: 26,
                  width: 26.0 + 18.0 * (members.length.clamp(1, 6) - 1),
                  child: Stack(
                    children: [
                      for (var i = 0; i < members.length && i < 6; i++)
                        Positioned(
                          left: 18.0 * i,
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              border: Border.all(
                                color: colors.surfaceCard,
                                width: 2,
                              ),
                            ),
                            child: ArenaClassAvatar(
                              initials: arenaClassInitials(members[i].name),
                              photoUrl: members[i].photoUrl,
                              size: 22,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    members.length == 1
                        ? 'Individual'
                        : '${members.length} jogadores no plano',
                    style: TextStyle(
                      fontSize: 12,
                      color: colors.onSurfaceMuted,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// Faixa do mês: uma célula por ocorrência (feita, hoje, próxima,
/// desmarcada, reposição), 8 por linha.
class ScheduleMonthStrip extends StatelessWidget {
  const ScheduleMonthStrip({
    super.key,
    required this.occurrences,
    required this.now,
  });

  final List<ScheduleOccurrence> occurrences;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        const gap = 4.0;
        final width = (constraints.maxWidth - gap * 7) / 8;
        return Wrap(
          spacing: gap,
          runSpacing: gap,
          children: [
            for (final o in occurrences)
              SizedBox(
                width: width,
                child: _OccurrenceCell(
                  occurrence: o,
                  state: scheduleOccurrenceState(o, now),
                ),
              ),
          ],
        );
      },
    );
  }
}

class _OccurrenceCell extends StatelessWidget {
  const _OccurrenceCell({required this.occurrence, required this.state});

  final ScheduleOccurrence occurrence;
  final ScheduleOccurrenceState state;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final (Color bg, Color? border, Color dayInk, Color wdInk) = switch (state) {
      ScheduleOccurrenceState.today => (
          AppColors.brand,
          null,
          AppColors.black,
          AppColors.black,
        ),
      ScheduleOccurrenceState.skipped => (
          AppColors.pending.withValues(alpha: 0.10),
          AppColors.pending.withValues(alpha: 0.35),
          colors.pending,
          colors.onSurfaceMuted,
        ),
      ScheduleOccurrenceState.makeup => (
          AppColors.win.withValues(alpha: 0.10),
          AppColors.win.withValues(alpha: 0.35),
          colors.win,
          colors.onSurfaceMuted,
        ),
      ScheduleOccurrenceState.next => (
          colors.surfaceCard,
          scheduleLine(context),
          colors.onSurface,
          colors.onSurfaceMuted,
        ),
      ScheduleOccurrenceState.done => (
          colors.surfaceCard,
          null,
          colors.onSurfaceMuted,
          colors.onSurfaceMuted,
        ),
    };
    final label = switch (state) {
      ScheduleOccurrenceState.today => 'hoje',
      ScheduleOccurrenceState.skipped => 'desmarcada',
      ScheduleOccurrenceState.makeup => 'reposição',
      ScheduleOccurrenceState.next => 'próxima',
      ScheduleOccurrenceState.done => 'feita',
    };
    return Semantics(
      label: '${scheduleWeekdayLong(occurrence.date.weekday)}, '
          '${scheduleDayMonth(occurrence.date)}: $label',
      excludeSemantics: true,
      child: Opacity(
        opacity: state == ScheduleOccurrenceState.done ? 0.55 : 1,
        child: Container(
          key: ValueKey(
            'schedule-occ-${occurrence.bookingId}-${state.name}',
          ),
          padding: const EdgeInsets.symmetric(vertical: 7),
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadius.circular(10),
            border: border == null ? null : Border.all(color: border),
          ),
          child: Column(
            children: [
              Text(
                scheduleWeekdayShort(occurrence.date.weekday).toUpperCase(),
                style: AppTypography.mono(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  color: wdInk,
                ),
              ),
              Text(
                occurrence.date.day.toString().padLeft(2, '0'),
                style: AppTypography.mono(
                  fontSize: 14,
                  fontWeight: FontWeight.w800,
                  color: dayInk,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Grade 2×2 de ações (`acts` do protótipo).
class ScheduleActionGrid extends StatelessWidget {
  const ScheduleActionGrid({super.key, required this.actions});

  final List<ScheduleActionTile> actions;

  @override
  Widget build(BuildContext context) {
    final rows = <Widget>[];
    for (var i = 0; i < actions.length; i += 2) {
      rows.add(
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(child: actions[i]),
              const SizedBox(width: 8),
              Expanded(
                child: i + 1 < actions.length
                    ? actions[i + 1]
                    : const SizedBox.shrink(),
              ),
            ],
          ),
        ),
      );
      if (i + 2 < actions.length) rows.add(const SizedBox(height: 8));
    }
    return Column(children: rows);
  }
}

class ScheduleActionTile extends StatelessWidget {
  const ScheduleActionTile({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final enabled = onTap != null;
    final radius = BorderRadius.circular(16);
    return Opacity(
      opacity: enabled ? 1 : 0.5,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: radius,
          child: Ink(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: colors.surfaceCard,
              borderRadius: radius,
              border: Border.all(color: scheduleLine(context)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(icon, size: 20, color: colors.brandText),
                const SizedBox(height: 10),
                Text(
                  title,
                  style: AppTypography.soraRegular(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    height: 1.25,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  subtitle,
                  style: TextStyle(fontSize: 11, color: colors.onSurfaceMuted),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// "Próxima cobrança · dd/mm": a parte do atleta e a forma de pagamento.
/// Mensalidade online aberta ganha "Pagar"; sem nada em aberto, a última
/// paga online mostra "Pago · Pix/Cartão".
class ScheduleChargeCard extends StatelessWidget {
  const ScheduleChargeCard({
    super.key,
    required this.subscription,
    required this.uid,
    required this.now,
    this.payingChargeId,
    this.onPay,
  });

  final ScheduleSubscription subscription;
  final String uid;
  final DateTime now;

  /// Mensalidade buscando o link (botão carregando).
  final String? payingChargeId;
  final ValueChanged<ScheduleCharge>? onPay;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final sub = subscription;
    final charge = scheduleNextOpenCharge(sub.charges, uid);
    final split = sub.members.length > 1;
    final overdue = charge == null ? 0 : scheduleOverdueDays(charge, now);
    final kicker = charge?.dueDate != null
        ? 'Próxima cobrança · ${scheduleDayMonth(charge!.dueDate!)}'
        : sub.dueDay > 0
            ? 'Mensalidade · todo dia ${sub.dueDay}'
            : 'Mensalidade';
    final amount = charge?.amountReais ?? scheduleMyShare(sub, uid);
    final pay = onPay;
    final payable =
        charge != null && pay != null && scheduleCanPayOnline(charge)
            ? charge
            : null;
    final lastPaid =
        charge == null ? scheduleLastPaidCharge(sub.charges, uid) : null;
    final paidLabel =
        lastPaid == null ? null : schedulePaidOnlineLabel(lastPaid);
    final paying = payable != null && payingChargeId == payable.id;
    final row = Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ScheduleKicker(kicker),
              const SizedBox(height: 6),
              Text(
                formatBRL(amount),
                style: AppTypography.mono(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: colors.onSurface,
                ),
              ),
              if (overdue > 0) ...[
                const SizedBox(height: 4),
                Text(
                  overdue == 1 ? 'Atrasada 1 dia' : 'Atrasada $overdue dias',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: colors.live,
                  ),
                ),
              ],
            ],
          ),
        ),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              split ? 'sua parte' : 'por mês',
              style: TextStyle(fontSize: 12, color: colors.onSurfaceMuted),
            ),
            const SizedBox(height: 4),
            if (paidLabel != null)
              Row(
                key: const Key('schedule-charge-paid-online'),
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.check_circle_rounded,
                    size: 14,
                    color: colors.win,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    paidLabel,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: colors.win,
                    ),
                  ),
                ],
              )
            else
              Text(
                scheduleChargeMethodLabel(sub.paymentMethod, charge),
                style: TextStyle(fontSize: 12, color: colors.win),
              ),
          ],
        ),
      ],
    );
    return ScheduleCard(
      key: const Key('schedule-charge-card'),
      child: payable == null || pay == null
          ? row
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                row,
                const SizedBox(height: 14),
                SchedulePrimaryButton(
                  key: const Key('schedule-charge-pay'),
                  label: 'Pagar',
                  icon: Icons.open_in_new_rounded,
                  loading: paying,
                  onPressed: () => pay(payable),
                ),
                const SizedBox(height: 6),
                Text(
                  'Pix ou cartão. A fatura abre no navegador.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 11.5,
                    color: colors.onSurfaceMuted,
                  ),
                ),
              ],
            ),
    );
  }
}

class _EmptyMyPlans extends StatelessWidget {
  const _EmptyMyPlans();

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.event_repeat_rounded, size: 40, color: colors.brandText),
            const SizedBox(height: 12),
            Text(
              'Nenhum plano de horário',
              style: AppTypography.soraRegular(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: colors.onSurface,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Quando você assinar um horário fixo numa arena, ele aparece '
              'aqui com as próximas datas e a mensalidade.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 13,
                height: 1.45,
                color: colors.onSurfaceMuted,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MyPlanSkeleton extends StatelessWidget {
  const _MyPlanSkeleton();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const NexaSkeleton(height: 132),
          const SizedBox(height: 18),
          const NexaSkeleton(width: 90, height: 11),
          const SizedBox(height: 10),
          Row(
            children: [
              for (var i = 0; i < 8; i++) ...[
                if (i > 0) const SizedBox(width: 4),
                const Expanded(child: NexaSkeleton(height: 44)),
              ],
            ],
          ),
          const SizedBox(height: 18),
          for (var r = 0; r < 2; r++) ...[
            const Row(
              children: [
                Expanded(child: NexaSkeleton(height: 92)),
                SizedBox(width: 8),
                Expanded(child: NexaSkeleton(height: 92)),
              ],
            ),
            const SizedBox(height: 8),
          ],
        ],
      ),
    );
  }
}
