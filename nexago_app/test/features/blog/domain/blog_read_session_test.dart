import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/blog/domain/blog_read_session.dart';

void main() {
  late DateTime now;
  DateTime clock() => now;
  void advance(int seconds) => now = now.add(Duration(seconds: seconds));

  BlogReadSession session({String categoryKey = 'treino'}) =>
      BlogReadSession(postId: 'p1', categoryKey: categoryKey, clock: clock);

  setUp(() => now = DateTime(2026, 11, 5, 10));

  test('conta só o tempo ativo: pausa e retoma', () {
    final s = session();
    advance(20);
    s.pause();
    advance(300); // segundo plano / outra tela: não conta
    s.resume();
    advance(10);
    expect(s.seconds, 30);
    // Pausar duas vezes ou retomar rodando não muda nada.
    s
      ..pause()
      ..pause();
    advance(50);
    s
      ..resume()
      ..resume();
    advance(5);
    expect(s.seconds, 35);
  });

  test('arredonda e respeita o teto de 3600 s', () {
    final s = session();
    now = now.add(const Duration(milliseconds: 7600));
    expect(s.seconds, 8);
    advance(5000);
    expect(s.seconds, blogReadMaxSeconds);
    expect(s.close(uid: 'u1')!['seconds'], 3600);
  });

  test('menos de 5 s não grava', () {
    final s = session();
    advance(4);
    expect(s.close(uid: 'u1'), isNull);
    expect(s.isClosed, isTrue);
  });

  test('payload com exatamente as chaves da rule (sem `at`)', () {
    final s = session()
      ..reportProgress(0.4)
      ..reportProgress(0.2);
    advance(42);
    final payload = s.close(uid: 'u1')!;
    expect(payload.keys.toSet(), {
      'postId',
      'uid',
      'category',
      'seconds',
      'progress',
      'finished',
      'ctaClicked',
    });
    expect(payload, {
      'postId': 'p1',
      'uid': 'u1',
      'category': 'treino',
      'seconds': 42,
      'progress': 0.4,
      'finished': false,
      'ctaClicked': false,
    });
    expect(payload['seconds'], isA<int>());
  });

  test('finished a partir de 0,95 nesta sessão; chamada tocada', () {
    final s = session(categoryKey: 'torneios')
      ..reportProgress(0.96)
      ..markCtaClicked();
    advance(60);
    final payload = s.close(uid: 'u1')!;
    expect(payload['finished'], isTrue);
    expect(payload['ctaClicked'], isTrue);
    expect(payload['progress'], 0.96);
  });

  test('progresso inicial da sessão nova e limites 0..1', () {
    final s = BlogReadSession(
      postId: 'p1',
      categoryKey: 'treino',
      clock: clock,
      startProgress: 0.5,
    )..reportProgress(3);
    expect(s.progress, 1);
  });

  test('fecha uma vez só; depois não muda nem grava', () {
    final s = session();
    advance(10);
    expect(s.close(uid: 'u1'), isNotNull);
    s
      ..resume()
      ..markCtaClicked();
    advance(100);
    expect(s.seconds, 10);
    expect(s.ctaClicked, isFalse);
    expect(s.close(uid: 'u1'), isNull);
  });

  test('sem sessão logada ou sem categoria válida não grava; criada grava', () {
    final a = session();
    advance(30);
    expect(a.close(uid: ''), isNull);
    final b = session(categoryKey: '');
    advance(30);
    expect(b.close(uid: 'u1'), isNull);
    final c = session(categoryKey: 'saude-corpo');
    advance(30);
    expect(c.close(uid: 'u1')!['category'], 'saude-corpo');
  });
}
