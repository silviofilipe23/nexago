import 'dart:async';

import 'tournament_uniform_selection.dart';

/// Estado da gravação automática — é o que o selo do cartão mostra.
enum UniformSaveState { idle, saving, saved, failed }

/// Grava a escolha do uniforme sozinha, sem botão.
///
/// Porte de `uniform-autosave.ts` do portal do atleta. O botão "Salvar
/// uniforme" existia porque a gravação era manual; com a escolha valendo por
/// si, o que resta é o selo dizendo em que pé está.
///
/// Regras que não são óbvias:
///
/// - **Debounce**: mexer no seletor não dispara uma chamada por toque.
/// - **Mesmo valor não regrava**: reabrir a tela e não mexer em nada não gera
///   escrita.
/// - **Falha não some**: o estado vira [UniformSaveState.failed] e guarda o
///   valor, para [retry] regravar exatamente o que o atleta escolheu.
/// - **Uma gravação por vez**: com uma no ar, a escolha mais nova espera numa
///   fila de UM lugar e sai assim que ela termina — a última sempre vence.
///   Sem isso, "SIL" e "SILVIO" viajavam juntos numa rede lenta e o que
///   chegasse por último no servidor ficava, às vezes o nome pela metade.
class UniformAutoSaver {
  UniformAutoSaver({
    required Future<void> Function(TournamentUniformSelection) save,
    required void Function(UniformSaveState) onStateChange,
    Duration debounce = const Duration(milliseconds: 600),
  })  : _save = save,
        _onStateChange = onStateChange,
        _debounce = debounce;

  final Future<void> Function(TournamentUniformSelection) _save;
  final void Function(UniformSaveState) _onStateChange;
  final Duration _debounce;

  Timer? _timer;
  bool _disposed = false;

  /// Último valor confirmado no servidor — o que evita regravar igual.
  TournamentUniformSelection? _persisted;

  /// Valor da gravação em voo ou da que falhou (alvo do [retry]).
  TournamentUniformSelection? _inFlight;

  /// Há uma chamada ao servidor no ar.
  bool _saving = false;

  /// Escolha que chegou com uma gravação no ar — sai quando ela terminar.
  TournamentUniformSelection? _queued;

  /// Quem espera não haver gravação no ar ([whenIdle]).
  final List<Completer<void>> _idleWaiters = [];

  /// Resolve quando nada estiver no ar — nem a gravação atual, nem a da fila.
  /// Quem grava por fora do autosave (o "Salvar e continuar") espera isto
  /// antes, para o valor velho não chegar ao servidor depois do confirmado.
  /// Falha da gravação também libera: quem espera decide o que fazer.
  Future<void> whenIdle() {
    if (!_saving) return Future<void>.value();
    final waiter = Completer<void>();
    _idleWaiters.add(waiter);
    return waiter.future;
  }

  void _releaseIdleWaiters() {
    final waiters = List.of(_idleWaiters);
    _idleWaiters.clear();
    for (final waiter in waiters) {
      waiter.complete();
    }
  }

  /// Agenda a gravação da escolha atual.
  void schedule(TournamentUniformSelection value) {
    if (_disposed) return;
    _timer?.cancel();
    // Com uma gravação no ar, "igual ao gravado" não basta: ela vai
    // sobrescrever o servidor com outro valor, então este precisa ir depois.
    if (!_saving && _sameAsPersisted(value)) {
      _emit(UniformSaveState.saved);
      return;
    }
    _timer = Timer(_debounce, () => _run(value));
  }

  /// Grava agora, sem esperar o debounce (ex.: logo depois de criar a vaga).
  void saveNow(TournamentUniformSelection value) {
    if (_disposed) return;
    _timer?.cancel();
    if (!_saving && _sameAsPersisted(value)) {
      _emit(UniformSaveState.saved);
      return;
    }
    _run(value);
  }

  /// Desiste do que estava agendado — escolha pela metade não vira gravação
  /// nem erro enquanto o atleta ainda está decidindo.
  void cancelPending() {
    _timer?.cancel();
    _timer = null;
    _queued = null;
    _emit(UniformSaveState.idle);
  }

  /// Semeia o que já está gravado na inscrição, sem chamar o servidor.
  void markSaved(TournamentUniformSelection value) {
    _persisted = value;
    _emit(UniformSaveState.saved);
  }

  /// Regrava o valor que falhou.
  void retry() {
    final value = _inFlight;
    if (value == null || _disposed) return;
    _run(value);
  }

  /// Trocou de categoria: o que estava gravado não vale mais.
  void reset() {
    _timer?.cancel();
    _timer = null;
    _persisted = null;
    _inFlight = null;
    _queued = null;
    _emit(UniformSaveState.idle);
  }

  void dispose() {
    _disposed = true;
    _timer?.cancel();
    _timer = null;
    _queued = null;
    _releaseIdleWaiters();
  }

  Future<void> _run(TournamentUniformSelection value) async {
    if (_disposed) return;
    if (_saving) {
      _queued = value;
      return;
    }
    _saving = true;
    _inFlight = value;
    _emit(UniformSaveState.saving);
    var failed = false;
    try {
      await _save(value);
      _persisted = value;
    } catch (_) {
      failed = true;
    }
    _saving = false;
    if (_disposed) {
      _releaseIdleWaiters();
      return;
    }

    final next = _queued;
    _queued = null;
    // Escolha mais nova na fila: vale mais gravá-la do que insistir na velha
    // (que, se falhou, só volta pelo [retry] caso a nova também falhe).
    if (next != null && !_sameAsPersisted(next)) {
      await _run(next);
      return;
    }
    _releaseIdleWaiters();
    if (failed) {
      _emit(UniformSaveState.failed);
      return;
    }
    _inFlight = null;
    _emit(UniformSaveState.saved);
  }

  bool _sameAsPersisted(TournamentUniformSelection value) =>
      _sameSelection(_persisted, value);

  static bool _sameSelection(
    TournamentUniformSelection? a,
    TournamentUniformSelection? b,
  ) {
    if (a == null || b == null) return false;
    return a.sizeTop == b.sizeTop &&
        a.sizeShorts == b.sizeShorts &&
        a.jerseyNumber == b.jerseyNumber &&
        (a.jerseyName?.trim() ?? '') == (b.jerseyName?.trim() ?? '');
  }

  void _emit(UniformSaveState state) {
    if (_disposed) return;
    _onStateChange(state);
  }
}
