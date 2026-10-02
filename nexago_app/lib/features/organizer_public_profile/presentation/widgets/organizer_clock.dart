import 'dart:async';

import 'package:flutter/widgets.dart';

/// Reconstrói a subárvore no próximo instante que muda alguma decisão, e de novo no seguinte.
///
/// Diferente de `RebuildAt`, que dispara uma vez num instante fixo: aqui o próximo instante é
/// recalculado a cada disparo por [nextChangeAt], a partir do "agora" que o builder recebeu.
/// Um único [Timer] por vez — nada de ticker.
class OrganizerClock extends StatefulWidget {
  const OrganizerClock({
    super.key,
    required this.nextChangeAt,
    required this.builder,
    this.clock = DateTime.now,
  });

  /// Próximo instante depois de `now` em que a tela muda; `null` quando nada mais muda.
  final DateTime? Function(DateTime now) nextChangeAt;

  final Widget Function(BuildContext context, DateTime now) builder;

  /// Fonte do "agora", injetável para teste.
  final DateTime Function() clock;

  /// Teto de cada espera: timer de semanas estoura o limite de alguns motores (2^31 ms). Acordar
  /// uma vez por dia só recalcula.
  static const Duration maxWait = Duration(days: 1);

  @override
  State<OrganizerClock> createState() => _OrganizerClockState();
}

class _OrganizerClockState extends State<OrganizerClock> {
  Timer? _timer;
  DateTime? _scheduledFor;

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _schedule(DateTime now, DateTime? next) {
    if (next == _scheduledFor && _timer != null) return;
    _timer?.cancel();
    _timer = null;
    _scheduledFor = next;
    if (next == null) return;
    var wait = next.difference(now);
    if (wait <= Duration.zero) wait = Duration.zero;
    if (wait > OrganizerClock.maxWait) wait = OrganizerClock.maxWait;
    // +1 ms: o disparo cai depois do instante, e a decisão comparada com `<=` já muda.
    _timer = Timer(wait + const Duration(milliseconds: 1), _onTick);
  }

  void _onTick() {
    if (!mounted) return;
    _timer = null;
    _scheduledFor = null;
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final now = widget.clock();
    _schedule(now, widget.nextChangeAt(now));
    return widget.builder(context, now);
  }
}
