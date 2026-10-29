import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/auth/auth_providers.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../../arenas/domain/booking_providers.dart';
import '../../application/weather_providers.dart';
import '../../domain/weather_booking_rules.dart';
import '../../domain/weather_models.dart';
import '../../infrastructure/weather_service.dart';
import '../weather_ui.dart';
import 'weather_request_sheet.dart';

/// Chuva na tela da reserva: aviso de liberação (A1), pedido em análise (A6),
/// botão de pedir, pedido recusado ou o resumo do que já aconteceu. Some
/// quando não há nada a mostrar (inclusive antes do doc da reserva chegar).
class BookingWeatherSection extends ConsumerStatefulWidget {
  const BookingWeatherSection({
    super.key,
    required this.bookingId,
    required this.booking,
    required this.arenaName,
    required this.now,
    this.fallbackArenaId,
    this.onOpenChoice,
  });

  final String bookingId;

  /// Doc cru de `arenaBookings/{bookingId}` (vivo); `null` enquanto carrega.
  final Map<String, dynamic>? booking;
  final String arenaName;
  final DateTime now;
  final String? fallbackArenaId;

  /// Injetável para teste; em produção abre `/booking/:bookingId/rain`.
  final VoidCallback? onOpenChoice;

  @override
  ConsumerState<BookingWeatherSection> createState() =>
      _BookingWeatherSectionState();
}

class _BookingWeatherSectionState extends ConsumerState<BookingWeatherSection> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final booking = widget.booking;
    if (booking == null) return const SizedBox.shrink();

    final viewerUid = ref.watch(authProvider).valueOrNull?.uid;
    final hasRelease = WeatherRelease.fromBooking(booking) != null;
    final status = (booking['status'] as String?)?.trim().toLowerCase() ?? '';
    final canceled = status == 'canceled' || status == 'cancelled';
    // Política e pedido só importam sem liberação e com a reserva de pé.
    final watchExtras = !hasRelease && !canceled;
    final arenaId =
        ((booking['arenaId'] as String?)?.trim().isNotEmpty ?? false)
            ? (booking['arenaId'] as String).trim()
            : (widget.fallbackArenaId?.trim() ?? '');
    final policy = watchExtras && arenaId.isNotEmpty
        ? ref.watch(weatherPolicyProvider(arenaId)).valueOrNull
        : null;
    // Pedido só existe com a política ligada: sem ela, nem abre a leitura.
    final requestAsync = watchExtras && (policy?.enabled ?? false)
        ? ref.watch(weatherRequestProvider(widget.bookingId))
        : null;
    final request = requestAsync?.valueOrNull;
    // Enquanto o pedido carrega, o botão de pedir não pisca antes do card A6.
    final requestLoading = requestAsync != null &&
        requestAsync.isLoading &&
        !requestAsync.hasValue;

    final view = resolveWeatherBookingView(
      booking: booking,
      viewerUid: viewerUid,
      policy: policy,
      request: request,
      now: widget.now,
    );

    final Widget? child = switch (view) {
      WeatherViewHidden() => null,
      WeatherViewReleasePending(:final release) => WeatherReleaseAlertCard(
          release: release,
          arenaName: widget.arenaName,
          now: widget.now,
          busy: _busy,
          onChoose: _openChoice,
          onKeep: _keep,
        ),
      WeatherViewOutcome(:final kind, :final release) => WeatherOutcomeTile(
          kind: kind,
          release: release,
          arenaName: widget.arenaName,
        ),
      WeatherViewRequestAvailable() when requestLoading => null,
      WeatherViewRequestAvailable(:final closesAt, :final afterStart) =>
        WeatherRequestButton(
          closesAt: closesAt,
          now: widget.now,
          busy: _busy,
          onTap: () => _request(afterStart: afterStart),
        ),
      WeatherViewRequestPending(:final request) => WeatherRequestPendingCard(
          request: request,
          arenaName: widget.arenaName,
          busy: _busy,
          onWithdraw: _withdraw,
        ),
      WeatherViewRequestRejected(:final request) => WeatherRequestRejectedCard(
          request: request,
          arenaName: widget.arenaName,
        ),
    };
    if (child == null) return const SizedBox.shrink();
    return Padding(padding: const EdgeInsets.only(top: 14), child: child);
  }

  void _openChoice() {
    final custom = widget.onOpenChoice;
    if (custom != null) {
      custom();
      return;
    }
    context.pushNamed(
      AppRouteNames.bookingWeatherChoice,
      pathParameters: {'bookingId': widget.bookingId},
    );
  }

  Future<void> _keep() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: ctx.themeColors.surfaceSheet,
        title: const Text('Manter a reserva?'),
        content: const Text(
          'Você joga no horário de sempre, mesmo com chuva. Nada muda no '
          'pagamento e a opção de crédito deixa de valer.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Voltar'),
          ),
          FilledButton(
            key: const Key('weather-keep-confirm'),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Manter reserva'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    await _run(
      () => ref.read(weatherServiceProvider).chooseOption(
            bookingId: widget.bookingId,
            choice: WeatherChoice.keep,
          ),
      success: 'Reserva mantida.',
    );
  }

  Future<void> _request({required bool afterStart}) async {
    final note = await showWeatherRequestSheet(
      context,
      arenaName: widget.arenaName,
      afterStart: afterStart,
    );
    if (note == null || !mounted) return;
    WeatherRequestResult? result;
    await _run(() async {
      result = await ref
          .read(weatherServiceProvider)
          .requestRelease(bookingId: widget.bookingId, note: note);
    });
    if (!mounted || result == null) return;
    ref.invalidate(weatherRequestProvider(widget.bookingId));
    showAppSnackBar(
      context,
      result!.status == WeatherRequestStatus.approved
          ? 'Pedido aprovado pela previsão. Escolha o que fazer com o valor.'
          : 'Pedido enviado. A ${widget.arenaName} vai analisar.',
    );
  }

  Future<void> _withdraw() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: ctx.themeColors.surfaceSheet,
        title: const Text('Desistir do pedido?'),
        content: const Text('A reserva continua de pé, como antes do pedido.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Voltar'),
          ),
          FilledButton(
            key: const Key('weather-withdraw-confirm'),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Desistir'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final done = await _run(
      () => ref
          .read(weatherServiceProvider)
          .withdrawRequest(bookingId: widget.bookingId),
      success: 'Pedido retirado.',
    );
    if (done && mounted)
      ref.invalidate(weatherRequestProvider(widget.bookingId));
  }

  Future<bool> _run(Future<void> Function() action, {String? success}) async {
    if (_busy) return false;
    setState(() => _busy = true);
    try {
      await action();
      if (mounted && success != null) showAppSnackBar(context, success);
      return true;
    } on WeatherException catch (e) {
      if (mounted) showAppSnackBar(context, e.message, isError: true);
      return false;
    } catch (_) {
      if (mounted) {
        showAppSnackBar(
          context,
          'Não foi possível concluir. Tente de novo.',
          isError: true,
        );
      }
      return false;
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

/// A1 — "Modo chuva ativo": a arena liberou o horário.
class WeatherReleaseAlertCard extends StatelessWidget {
  const WeatherReleaseAlertCard({
    super.key,
    required this.release,
    required this.arenaName,
    required this.now,
    required this.onChoose,
    required this.onKeep,
    this.busy = false,
  });

  static const Key cardKey = ValueKey('weather-release-alert');
  static const Key chooseKey = ValueKey('weather-release-choose');
  static const Key keepKey = ValueKey('weather-release-keep');

  final WeatherRelease release;
  final String arenaName;
  final DateTime now;
  final VoidCallback onChoose;
  final VoidCallback onKeep;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    final rainText = WeatherTone.rainText(context);
    final hours = weatherReleaseHighlightHours(release);
    final worst = hours.isEmpty ? null : _worstIndex(hours);
    final deadline = release.decisionDeadline;
    final body = release.canReschedule
        ? 'A $arenaName liberou seu horário. Remarque ou guarde o valor como '
            'crédito, sem custo.'
        : 'A $arenaName liberou seu horário. '
            '${WeatherCopy.money(release.creditableReais)} vira crédito, sem custo.';

    return Container(
      key: cardKey,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            WeatherTone.rain.withValues(alpha: colors.isDark ? 0.26 : 0.16),
            colors.surfaceCard,
          ],
        ),
        border: Border.all(color: WeatherTone.rain.withValues(alpha: 0.30)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              WeatherIconTile(
                background: WeatherTone.rain.withValues(alpha: 0.16),
                child:
                    WeatherRainIcon(size: 24, strokeWidth: 2, color: rainText),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    WeatherKicker('Modo chuva ativo', color: rainText),
                    const SizedBox(height: 4),
                    Text(
                      weatherReleaseHeadline(release),
                      style: AppTypography.soraRegular(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: colors.onSurface,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            body,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: colors.onSurface.withValues(alpha: 0.82),
              height: 1.5,
            ),
          ),
          if (release.arenaMessage != null) ...[
            const SizedBox(height: 8),
            Text(
              '“${release.arenaMessage}”',
              style: theme.textTheme.bodySmall?.copyWith(
                color: colors.onSurfaceMuted,
                fontStyle: FontStyle.italic,
                height: 1.4,
              ),
            ),
          ],
          if (hours.isNotEmpty) ...[
            const SizedBox(height: 14),
            Row(
              children: [
                for (var i = 0; i < hours.length; i++) ...[
                  if (i > 0) const SizedBox(width: 8),
                  Expanded(
                    child:
                        _ForecastCell(hour: hours[i], highlighted: i == worst),
                  ),
                ],
              ],
            ),
          ],
          if (deadline != null) ...[
            const SizedBox(height: 14),
            Text(
              'Você tem até ${WeatherCopy.deadline(deadline, now)} para escolher. '
              'Depois disso, vira crédito automaticamente.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: colors.onSurfaceMuted,
                height: 1.4,
              ),
            ),
          ],
          const SizedBox(height: 14),
          FilledButton.icon(
            key: chooseKey,
            onPressed: busy ? null : onChoose,
            icon: const Icon(Icons.arrow_forward_rounded, size: 18),
            iconAlignment: IconAlignment.end,
            label: Text(
              release.canReschedule
                  ? 'Remarcar ou guardar crédito'
                  : 'Guardar crédito',
            ),
          ),
          const SizedBox(height: 8),
          OutlinedButton(
            key: keepKey,
            onPressed: busy ? null : onKeep,
            child: const Text('Manter minha reserva'),
          ),
        ],
      ),
    );
  }

  static int _worstIndex(List<WeatherHour> hours) {
    var idx = 0;
    for (var i = 1; i < hours.length; i++) {
      final a = hours[i];
      final b = hours[idx];
      final am = a.precipitationMm ?? 0;
      final bm = b.precipitationMm ?? 0;
      if (am > bm ||
          (am == bm && (a.probability ?? 0) > (b.probability ?? 0))) {
        idx = i;
      }
    }
    return idx;
  }
}

class _ForecastCell extends StatelessWidget {
  const _ForecastCell({required this.hour, required this.highlighted});

  final WeatherHour hour;
  final bool highlighted;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final p = hour.probability;
    final mm = hour.precipitationMm;
    final value = p != null
        ? WeatherCopy.percent(p)
        : mm != null
            ? WeatherCopy.millimeters(mm)
            : '—';
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(10),
        color: highlighted
            ? WeatherTone.rain.withValues(alpha: 0.16)
            : colors.onSurface.withValues(alpha: 0.04),
      ),
      child: Column(
        children: [
          Text(
            value,
            style: AppTypography.mono(
              fontSize: 13,
              fontWeight: FontWeight.w800,
              color: WeatherTone.rainText(context),
            ),
          ),
          const SizedBox(height: 2),
          Text(
            hour.hourLabel,
            style: TextStyle(fontSize: 11, color: colors.onSurfaceMuted),
          ),
        ],
      ),
    );
  }
}

/// "Choveu? Pedir cancelamento sem custo".
class WeatherRequestButton extends StatelessWidget {
  const WeatherRequestButton({
    super.key,
    required this.closesAt,
    required this.now,
    required this.onTap,
    this.busy = false,
  });

  static const Key buttonKey = ValueKey('weather-request-button');

  final DateTime closesAt;
  final DateTime now;
  final VoidCallback onTap;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    return Material(
      color: colors.surfaceCard,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        key: buttonKey,
        borderRadius: BorderRadius.circular(16),
        onTap: busy ? null : onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: WeatherTone.rain.withValues(alpha: 0.30)),
          ),
          child: Row(
            children: [
              WeatherIconTile(
                size: 40,
                radius: 11,
                background: WeatherTone.rain.withValues(alpha: 0.14),
                child: WeatherRainIcon(
                  size: 20,
                  strokeWidth: 2,
                  color: WeatherTone.rainText(context),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Choveu? Pedir cancelamento sem custo',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Disponível até ${WeatherCopy.deadline(closesAt, now)}',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: colors.onSurfaceMuted,
                      ),
                    ),
                  ],
                ),
              ),
              if (busy)
                const SizedBox.square(
                  dimension: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              else
                Icon(Icons.chevron_right_rounded, color: colors.onSurfaceMuted),
            ],
          ),
        ),
      ),
    );
  }
}

/// A6 — pedido em análise.
class WeatherRequestPendingCard extends StatelessWidget {
  const WeatherRequestPendingCard({
    super.key,
    required this.request,
    required this.arenaName,
    required this.onWithdraw,
    this.busy = false,
  });

  static const Key cardKey = ValueKey('weather-request-pending');
  static const Key withdrawKey = ValueKey('weather-request-withdraw');

  final WeatherRequest request;
  final String arenaName;
  final VoidCallback onWithdraw;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    final pending = colors.pending;
    final weather = request.weather;
    final steps = <({String label, String time, bool done})>[
      (
        label: 'Pedido enviado',
        time: request.createdAt == null
            ? ''
            : WeatherCopy.time(request.createdAt!),
        done: true,
      ),
      if (weather != null && weather.hasData)
        (
          label: weather.precipitationMm != null
              ? 'Chuva registrada · ${WeatherCopy.millimeters(weather.precipitationMm!)}'
              : 'Previsão · ${WeatherCopy.percent(weather.probability!)} de chuva',
          time: weather.fetchedAt == null
              ? ''
              : WeatherCopy.time(weather.fetchedAt!),
          done: true,
        ),
      (label: 'Arena confirma', time: 'aguardando', done: false),
    ];

    return Column(
      key: cardKey,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            color: AppColors.pending.withValues(alpha: 0.06),
            border:
                Border.all(color: AppColors.pending.withValues(alpha: 0.28)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 8,
                    height: 8,
                    decoration:
                        BoxDecoration(color: pending, shape: BoxShape.circle),
                  ),
                  const SizedBox(width: 8),
                  WeatherKicker('Pedido em análise', color: pending),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                'A $arenaName vai analisar seu pedido',
                style: AppTypography.soraRegular(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: colors.onSurface,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                'Se aprovar, você escolhe entre remarcar ou guardar o valor como '
                'crédito, sem custo. Até lá, a reserva segue de pé.',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: colors.onSurfaceMuted,
                  height: 1.5,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: colors.surfaceCard,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: colors.onSurface.withValues(alpha: 0.08)),
          ),
          child: Column(
            children: [
              for (var i = 0; i < steps.length; i++)
                _TimelineRow(
                  label: steps[i].label,
                  time: steps[i].time,
                  done: steps[i].done,
                  last: i == steps.length - 1,
                ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        OutlinedButton(
          key: withdrawKey,
          onPressed: busy ? null : onWithdraw,
          child: const Text('Desistir do pedido'),
        ),
      ],
    );
  }
}

class _TimelineRow extends StatelessWidget {
  const _TimelineRow({
    required this.label,
    required this.time,
    required this.done,
    required this.last,
  });

  final String label;
  final String time;
  final bool done;
  final bool last;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Column(
            children: [
              const SizedBox(height: 4),
              Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: done ? AppColors.brand : Colors.transparent,
                  border: done
                      ? null
                      : Border.all(color: colors.onSurfaceMuted, width: 1.5),
                ),
              ),
              if (!last)
                Expanded(
                  child: Container(
                    width: 1,
                    margin: const EdgeInsets.only(top: 4),
                    color: colors.onSurface.withValues(alpha: 0.10),
                  ),
                ),
            ],
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: last ? 0 : 14),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      label,
                      style: TextStyle(
                        fontSize: 13,
                        color: done ? colors.onSurface : colors.onSurfaceMuted,
                      ),
                    ),
                  ),
                  Text(
                    time,
                    style: AppTypography.mono(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: colors.onSurfaceMuted,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Pedido recusado pela arena.
class WeatherRequestRejectedCard extends StatelessWidget {
  const WeatherRequestRejectedCard({
    super.key,
    required this.request,
    required this.arenaName,
  });

  static const Key cardKey = ValueKey('weather-request-rejected');

  final WeatherRequest request;
  final String arenaName;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    final reason = request.rejectReason;
    return Container(
      key: cardKey,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.live.withValues(alpha: 0.28)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.cloud_off_outlined, size: 20, color: colors.live),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Pedido de cancelamento recusado',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  reason == null
                      ? 'A $arenaName não liberou o horário por chuva. A reserva segue de pé.'
                      : 'Motivo: $reason',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: colors.onSurfaceMuted,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Linha de resumo: crédito guardado, remarcada, mantida ou cancelada por chuva.
class WeatherOutcomeTile extends ConsumerWidget {
  const WeatherOutcomeTile({
    super.key,
    required this.kind,
    required this.arenaName,
    this.release,
  });

  static const Key tileKey = ValueKey('weather-outcome');

  final WeatherOutcomeKind kind;
  final WeatherRelease? release;
  final String arenaName;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    final r = release;
    final newBookingId = kind == WeatherOutcomeKind.rescheduled
        ? r?.rescheduledToBookingId
        : null;
    final newBooking = newBookingId == null
        ? null
        : ref.watch(arenaBookingDocProvider(newBookingId)).valueOrNull?.data();

    final (String title, String subtitle) = switch (kind) {
      WeatherOutcomeKind.credited => (
          'Crédito de ${WeatherCopy.money(r?.creditableReais ?? 0)} guardado',
          r?.autoCredited == true
              ? 'O prazo de escolha acabou e o valor virou crédito na $arenaName.'
              : 'Use em qualquer reserva na $arenaName.',
        ),
      WeatherOutcomeKind.rescheduled => (
          _rescheduledTitle(newBooking),
          'Sem custo, por causa da chuva.',
        ),
      WeatherOutcomeKind.kept => (
          'Você manteve a reserva',
          'A $arenaName liberou o horário por chuva, mas você decidiu jogar.',
        ),
      WeatherOutcomeKind.canceledUnpaid => (
          'Cancelada por chuva, nada foi cobrado',
          'A $arenaName cancelou o horário por causa da chuva.',
        ),
      WeatherOutcomeKind.canceledByWeather => (
          'Cancelada por chuva',
          'A $arenaName cancelou o horário por causa da chuva.',
        ),
    };
    final onTap = kind == WeatherOutcomeKind.credited
        ? () => context.pushNamed(AppRouteNames.athleteWeatherCredits)
        : null;

    return Material(
      color: colors.surfaceCard,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        key: tileKey,
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: WeatherTone.rain.withValues(alpha: 0.24)),
          ),
          child: Row(
            children: [
              WeatherIconTile(
                size: 40,
                radius: 11,
                background: WeatherTone.rain.withValues(alpha: 0.14),
                child: WeatherRainIcon(
                  size: 20,
                  strokeWidth: 2,
                  color: WeatherTone.rainText(context),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: colors.onSurfaceMuted,
                        height: 1.35,
                      ),
                    ),
                  ],
                ),
              ),
              if (onTap != null)
                Icon(Icons.chevron_right_rounded, color: colors.onSurfaceMuted),
            ],
          ),
        ),
      ),
    );
  }

  static String _rescheduledTitle(Map<String, dynamic>? booking) {
    if (booking == null) return 'Remarcada para um novo horário';
    final window = weatherBookingWindow(booking);
    if (window == null) return 'Remarcada para um novo horário';
    final w = WeatherCopy.weekdayShort(window.start);
    final cap = w.isEmpty ? w : w[0].toUpperCase() + w.substring(1);
    return 'Remarcada para $cap ${WeatherCopy.dayShortMonth(window.start)} · '
        '${WeatherCopy.time(window.start)}';
  }
}
