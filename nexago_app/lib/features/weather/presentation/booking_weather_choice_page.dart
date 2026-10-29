import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/layout/nexa_app_bar.dart';
import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/app_status_views.dart';
import '../../arenas/domain/booking_providers.dart';
import '../../athlete/domain/booking_invite_status.dart' show bookingOwnerUidOf;
import '../application/weather_providers.dart';
import '../domain/weather_booking_rules.dart';
import '../domain/weather_models.dart';
import '../infrastructure/weather_service.dart';
import 'weather_done_view.dart';
import 'weather_reschedule_view.dart';
import 'weather_ui.dart';
import 'widgets/booking_weather_section.dart'
    show WeatherOutcomeTile, WeatherRequestRejectedCard;
import 'widgets/weather_choice_widgets.dart';

enum _Option { reschedule, credit }

/// `/booking/:bookingId/rain` — A2 (o que fazer com o valor), A3 (novo
/// horário) e A4 (sucesso), sobre o doc vivo da reserva. Se a liberação não
/// está mais pendente, mostra o que já aconteceu.
class BookingWeatherChoicePage extends ConsumerStatefulWidget {
  const BookingWeatherChoicePage({super.key, required this.bookingId});

  static const Key ctaKey = ValueKey('weather-choice-cta');
  static const Key rescheduleOptionKey = ValueKey('weather-option-reschedule');
  static const Key creditOptionKey = ValueKey('weather-option-credit');

  final String bookingId;

  @override
  ConsumerState<BookingWeatherChoicePage> createState() =>
      _BookingWeatherChoicePageState();
}

class _BookingWeatherChoicePageState
    extends ConsumerState<BookingWeatherChoicePage> {
  _Option? _option;
  bool _rescheduling = false;
  bool _submitting = false;
  WeatherChoiceResult? _result;
  WeatherReschedulePick? _pick;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final bookingAsync = ref.watch(arenaBookingDocProvider(widget.bookingId));
    final booking = bookingAsync.valueOrNull?.data();

    if (booking == null) {
      if (bookingAsync.isLoading) {
        return Scaffold(
          backgroundColor: colors.canvas,
          appBar: _appBar(),
          body: const AppLoadingView(message: 'Carregando a reserva…'),
        );
      }
      return _message(
        icon: Icons.event_busy_rounded,
        title: 'Reserva não encontrada',
        subtitle: 'Ela pode ter sido removida. Confira em Minhas reservas.',
      );
    }

    final arenaName = _text(booking['arenaName']) ?? 'Arena';
    final courtName = _text(booking['courtName']) ?? 'Quadra';
    final courtId = _text(booking['courtId']) ?? '';
    final arenaId = _text(booking['arenaId']) ?? '';
    final window = weatherBookingWindow(booking);
    final start = window?.start ?? DateTime.now();
    final end = window?.end ?? start;

    // Depois da escolha o doc muda de estado: o sucesso fica na tela.
    final result = _result;
    if (result != null) {
      return WeatherDoneView(
        result: result,
        arenaName: arenaName,
        originalStart: start,
        pick: _pick,
        pickCourtName: _pick?.courtName,
        // "Reservar agora" abre a arena (crédito e remarcação, como no design).
        onPrimary: () => arenaId.isEmpty
            ? context.go(AppRoutes.myBookings)
            : context.go(AppRoutes.arenaDetail.replaceAll(':arenaId', arenaId)),
        onHome: () => context.go(AppRoutes.home),
      );
    }

    final viewerUid = ref.watch(authProvider).valueOrNull?.uid;
    final release = WeatherRelease.fromBooking(booking);
    if (release == null || !release.isPendingChoice) {
      return _summary(booking, arenaName);
    }
    if (viewerUid != null && bookingOwnerUidOf(booking) != viewerUid) {
      return _message(
        icon: Icons.lock_outline_rounded,
        title: 'Só o dono da reserva escolhe',
        subtitle:
            'Quem reservou recebe o aviso e decide entre remarcar ou guardar o crédito.',
      );
    }

    final policy = arenaId.isEmpty
        ? null
        : ref.watch(weatherPolicyProvider(arenaId)).valueOrNull;
    final canReschedule = release.canReschedule &&
        (policy?.allowReschedule ?? true) &&
        courtId.isNotEmpty &&
        arenaId.isNotEmpty;
    final option =
        canReschedule ? (_option ?? _Option.reschedule) : _Option.credit;

    if (_rescheduling && canReschedule) {
      return WeatherRescheduleView(
        bookingId: widget.bookingId,
        booking: booking,
        release: release,
        arenaId: arenaId,
        arenaName: arenaName,
        originalCourtId: courtId,
        originalCourtName: courtName,
        originalStart: start,
        onBack: () => setState(() => _rescheduling = false),
        onDone: (r, pick) => setState(() {
          _result = r;
          _pick = pick;
        }),
      );
    }

    final amount = WeatherCopy.money(release.creditableReais);
    final until = release.rescheduleUntilDate;
    final validityDays = policy?.creditValidityDays;
    final validity = policy == null
        ? ''
        : validityDays == null
            ? ' Sem validade.'
            // "Vale por 90 dias", como no design (a data exata vem no A4).
            : ' Vale por $validityDays dias.';

    return Scaffold(
      backgroundColor: colors.canvas,
      appBar: _appBar(),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
        children: [
          Text(
            'O que fazer com seus $amount?',
            style: AppTypography.soraRegular(
              fontSize: 24,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.4,
              height: 1.15,
              color: colors.onSurface,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Nenhuma opção tem custo.',
            style: TextStyle(fontSize: 13, color: colors.onSurfaceMuted),
          ),
          const SizedBox(height: 16),
          if (canReschedule) ...[
            WeatherOptionCard(
              key: BookingWeatherChoicePage.rescheduleOptionKey,
              icon: Icons.swap_horiz_rounded,
              title: 'Remarcar',
              tag: 'SEM CUSTO',
              subtitle: until == null
                  ? 'Escolha outro horário. A diferença, se houver, é paga na arena.'
                  : 'Escolha outro horário até '
                      '${WeatherCopy.shortDate(until, DateTime.now())}.',
              selected: option == _Option.reschedule,
              enabled: !_submitting,
              onTap: () => setState(() => _option = _Option.reschedule),
            ),
            const SizedBox(height: 12),
          ],
          WeatherOptionCard(
            key: BookingWeatherChoicePage.creditOptionKey,
            icon: Icons.account_balance_wallet_outlined,
            title: 'Guardar crédito',
            subtitle:
                '$amount na sua carteira para qualquer reserva na $arenaName.$validity',
            selected: option == _Option.credit,
            enabled: !_submitting,
            onTap: () => setState(() => _option = _Option.credit),
          ),
          const SizedBox(height: 16),
          WeatherBookingTicket(
            bookingId: widget.bookingId,
            start: start,
            end: end,
            arenaName: arenaName,
            courtName: courtName,
            amountReais: (booking['amountReais'] as num?)?.toDouble(),
            strike: true,
          ),
        ],
      ),
      bottomNavigationBar: WeatherBottomBar(
        ctaKey: BookingWeatherChoicePage.ctaKey,
        ctaLabel: option == _Option.reschedule
            ? 'Escolher novo horário'
            : 'Guardar $amount como crédito',
        ctaIcon: option == _Option.reschedule,
        loading: _submitting,
        onCta: option == _Option.reschedule
            ? () => setState(() => _rescheduling = true)
            : _saveCredit,
      ),
    );
  }

  Future<void> _saveCredit() async {
    if (_submitting) return;
    setState(() => _submitting = true);
    try {
      final result = await ref.read(weatherServiceProvider).chooseOption(
            bookingId: widget.bookingId,
            choice: WeatherChoice.credit,
          );
      if (!mounted) return;
      setState(() => _result = result);
    } on WeatherException catch (e) {
      if (mounted) showAppSnackBar(context, e.message, isError: true);
    } catch (_) {
      if (mounted) {
        showAppSnackBar(context, 'Não foi possível guardar o crédito.',
            isError: true);
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Widget _summary(Map<String, dynamic> booking, String arenaName) {
    final colors = context.themeColors;
    final view = resolveWeatherBookingView(
      booking: booking,
      viewerUid: ref.watch(authProvider).valueOrNull?.uid,
      policy: null,
      request: null,
      now: DateTime.now(),
    );
    if (view is! WeatherViewOutcome) {
      // Push "pedido decidido" recusado (ou ainda em análise) cai aqui.
      final request =
          ref.watch(weatherRequestProvider(widget.bookingId)).valueOrNull;
      if (request?.status == WeatherRequestStatus.rejected) {
        return Scaffold(
          backgroundColor: colors.canvas,
          appBar: _appBar(),
          body: ListView(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
            children: [
              WeatherRequestRejectedCard(
                  request: request!, arenaName: arenaName),
              const SizedBox(height: 16),
              OutlinedButton(
                onPressed: () => context.go(AppRoutes.myBookings),
                child: const Text('Ver minhas reservas'),
              ),
            ],
          ),
        );
      }
      if (request?.status == WeatherRequestStatus.pending) {
        return _message(
          icon: Icons.hourglass_top_rounded,
          title: 'Pedido em análise',
          subtitle: 'A $arenaName ainda não respondeu. Você recebe um aviso '
              'quando ela decidir.',
        );
      }
      return _message(
        icon: Icons.cloud_outlined,
        title: 'Nada para escolher',
        subtitle: 'Esta reserva não foi liberada por chuva.',
      );
    }
    return Scaffold(
      backgroundColor: colors.canvas,
      appBar: _appBar(),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        children: [
          WeatherOutcomeTile(
              kind: view.kind, release: view.release, arenaName: arenaName),
          const SizedBox(height: 16),
          OutlinedButton(
            onPressed: () => context.go(AppRoutes.myBookings),
            child: const Text('Ver minhas reservas'),
          ),
        ],
      ),
    );
  }

  Widget _message({
    required IconData icon,
    required String title,
    required String subtitle,
  }) {
    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      appBar: _appBar(),
      body: AppEmptyView(
        icon: icon,
        title: title,
        subtitle: subtitle,
        actionLabel: 'Ver minhas reservas',
        onAction: () => context.go(AppRoutes.myBookings),
      ),
    );
  }

  /// O push abre com `go` (sem pilha): o voltar cai em Minhas reservas.
  PreferredSizeWidget _appBar() => NexaAppBar(
        title: const Text('Cancelar por chuva'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          tooltip: 'Voltar',
          onPressed: () => popOrGo(context, AppRoutes.myBookings),
        ),
      );

  static String? _text(Object? raw) {
    if (raw is! String) return null;
    final t = raw.trim();
    return t.isEmpty ? null : t;
  }
}
