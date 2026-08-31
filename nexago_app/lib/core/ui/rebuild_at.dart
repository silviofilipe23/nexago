import 'dart:async';

import 'package:flutter/widgets.dart';

/// Constrói a subárvore com o instante que valeu para a decisão.
typedef RebuildAtBuilder = Widget Function(BuildContext context, DateTime now);

/// Reconstrói a subárvore no instante em que o relógio cruza [instant].
///
/// Decisão tomada comparando o relógio com uma data futura (abertura de
/// inscrição, por exemplo) congela no build: quem está parado na tela às 09:59
/// continua vendo "em breve" às 10:00 até que outra coisa reconstrua o widget.
/// Aqui um único [Timer] até [instant] desfaz isso — nada de ticker por
/// segundo, que custaria um rebuild a cada tique só para acertar um relógio.
///
/// O [now] entregue ao builder é o mesmo que agendou o disparo: quem decide
/// deve usá-lo, e não `DateTime.now()`, para a decisão e o agendamento não
/// discordarem.
class RebuildAt extends StatefulWidget {
  const RebuildAt({
    super.key,
    required this.instant,
    required this.builder,
    this.clock = DateTime.now,
  });

  /// Instante do disparo. `null` (ou já passado) não agenda nada.
  final DateTime? instant;

  final RebuildAtBuilder builder;

  /// Fonte do "agora", injetável para teste.
  final DateTime Function() clock;

  @override
  State<RebuildAt> createState() => _RebuildAtState();
}

class _RebuildAtState extends State<RebuildAt> {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _schedule();
  }

  @override
  void didUpdateWidget(covariant RebuildAt oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.instant != widget.instant) _schedule();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _schedule() {
    _timer?.cancel();
    _timer = null;

    final instant = widget.instant;
    if (instant == null) return;

    final remaining = instant.difference(widget.clock());
    if (remaining <= Duration.zero) return;

    _timer = Timer(remaining, _onInstantReached);
  }

  void _onInstantReached() {
    if (!mounted) return;
    setState(() {});
    // O timer conta tempo decorrido, não hora de parede: se o relógio do
    // aparelho foi ajustado no meio do caminho, o instante pode não ter
    // chegado. Reagendar cobre isso sem margem chutada — e não agenda nada
    // quando o instante enfim passou.
    _schedule();
  }

  @override
  Widget build(BuildContext context) {
    return widget.builder(context, widget.clock());
  }
}
