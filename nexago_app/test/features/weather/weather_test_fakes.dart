import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';

/// Fake de [FirebaseFunctions]: registra nome + payload de cada callable e
/// devolve a resposta (ou lança o erro) configurado por nome.
class FakeWeatherFunctions implements FirebaseFunctions {
  FakeWeatherFunctions({
    Map<String, Object?>? responses,
    Map<String, FirebaseFunctionsException>? errors,
  })  : responses = responses ?? {},
        errors = errors ?? {};

  final Map<String, Object?> responses;
  final Map<String, FirebaseFunctionsException> errors;
  final List<({String name, Map<String, dynamic>? payload})> calls = [];

  Map<String, dynamic>? payloadOf(String name) =>
      calls.lastWhere((c) => c.name == name).payload;

  @override
  HttpsCallable httpsCallable(String name, {HttpsCallableOptions? options}) {
    return _FakeCallable(this, name);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeCallable implements HttpsCallable {
  _FakeCallable(this._owner, this._name);

  final FakeWeatherFunctions _owner;
  final String _name;

  @override
  Future<HttpsCallableResult<T>> call<T>([dynamic parameters]) async {
    _owner.calls.add((
      name: _name,
      payload: parameters is Map ? Map<String, dynamic>.from(parameters) : null,
    ));
    final error = _owner.errors[_name];
    if (error != null) throw error;
    return _FakeResult<T>(_owner.responses[_name]);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeResult<T> implements HttpsCallableResult<T> {
  _FakeResult(this._data);

  final Object? _data;

  @override
  T get data => _data as T;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// Os testes de callable nunca tocam no Firestore.
class UnusedFirestore implements FirebaseFirestore {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

// Fake escrito à mão (padrão do repo); `DocumentSnapshot` é sealed.
// ignore: subtype_of_sealed_class
/// Snapshot mínimo de `arenaBookings/{id}` para os providers de doc vivo.
class FakeBookingSnapshot implements DocumentSnapshot<Map<String, dynamic>> {
  FakeBookingSnapshot(this.id, this._data);

  @override
  final String id;
  final Map<String, dynamic>? _data;

  @override
  Map<String, dynamic>? data() => _data;

  @override
  bool get exists => _data != null;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
