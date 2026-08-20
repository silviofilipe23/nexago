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

  /// Agenda a gravação da escolha atual.
  void schedule(TournamentUniformSelection value) {
    if (_disposed) return;
    _timer?.cancel();
    if (_sameAsPersisted(value)) {
      _emit(UniformSaveState.saved);
      return;
    }
    _timer = Timer(_debounce, () => _run(value));
  }

  /// Grava agora, sem esperar o debounce (ex.: logo depois de criar a vaga).
  void saveNow(TournamentUniformSelection value) {
    if (_disposed) return;
    _timer?.cancel();
    if (_sameAsPersisted(value)) {
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
    _emit(UniformSaveState.idle);
  }

  void dispose() {
    _disposed = true;
    _timer?.cancel();
    _timer = null;
  }

  Future<void> _run(TournamentUniformSelection value) async {
    if (_disposed) return;
    _inFlight = value;
    _emit(UniformSaveState.saving);
    try {
      await _save(value);
      if (_disposed) return;
      // Outra escolha entrou enquanto esta gravava: quem manda é a última, e
      // ela já tem a própria gravação agendada.
      if (!identical(_inFlight, value) && !_sameSelection(_inFlight, value)) {
        return;
      }
      _persisted = value;
      _inFlight = null;
      _emit(UniformSaveState.saved);
    } catch (_) {
      if (_disposed) return;
      _emit(UniformSaveState.failed);
    }
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
