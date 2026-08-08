import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/ui/app_status_views.dart';
import 'package:nexago_app/core/ui/nexa_async_view.dart';
import 'package:nexago_app/core/ui/nexa_skeleton.dart';

void main() {
  Widget wrap(Widget child) =>
      MaterialApp(theme: AppTheme.dark, home: Scaffold(body: child));

  testWidgets('data renderiza o builder', (tester) async {
    await tester.pumpWidget(wrap(NexaAsyncView<int>(
      value: const AsyncValue.data(7),
      data: (v) => Text('valor $v'),
    )));
    expect(find.text('valor 7'), findsOneWidget);
  });

  testWidgets('loading usa o skeleton quando fornecido', (tester) async {
    await tester.pumpWidget(wrap(NexaAsyncView<int>(
      value: const AsyncValue.loading(),
      skeleton: const NexaSkeleton(height: 40),
      data: (v) => const SizedBox(),
    )));
    expect(find.byType(NexaSkeleton), findsOneWidget);
    expect(find.byType(AppLoadingView), findsNothing);
  });

  testWidgets('loading sem skeleton cai no AppLoadingView', (tester) async {
    await tester.pumpWidget(wrap(NexaAsyncView<int>(
      value: const AsyncValue.loading(),
      data: (v) => const SizedBox(),
    )));
    await tester.pump(Duration.zero);
    expect(find.byType(AppLoadingView), findsOneWidget);
  });

  testWidgets('erro com onRetry mostra AppErrorView e dispara o callback',
      (tester) async {
    var retried = false;
    await tester.pumpWidget(wrap(NexaAsyncView<int>(
      value: AsyncValue.error(Exception('x'), StackTrace.empty),
      onRetry: () => retried = true,
      data: (v) => const SizedBox(),
    )));
    await tester.pump(Duration.zero);
    expect(find.byType(AppErrorView), findsOneWidget);
    await tester.tap(find.text('Tentar novamente'));
    expect(retried, isTrue);
  });

  testWidgets('erro sem onRetry mostra AppInlineErrorView', (tester) async {
    await tester.pumpWidget(wrap(NexaAsyncView<int>(
      value: AsyncValue.error(Exception('x'), StackTrace.empty),
      data: (v) => const SizedBox(),
    )));
    await tester.pump(Duration.zero);
    expect(find.byType(AppInlineErrorView), findsOneWidget);
  });

  testWidgets('emptyWhen desvia para empty', (tester) async {
    await tester.pumpWidget(wrap(NexaAsyncView<List<int>>(
      value: const AsyncValue.data([]),
      emptyWhen: (list) => list.isEmpty,
      empty: const Text('nada aqui'),
      data: (v) => const Text('lista'),
    )));
    expect(find.text('nada aqui'), findsOneWidget);
    expect(find.text('lista'), findsNothing);
  });

  testWidgets('reload mantém dados na tela', (tester) async {
    await tester.pumpWidget(wrap(NexaAsyncView<int>(
      value: const AsyncValue.data(7)
          .copyWithPrevious(const AsyncValue.data(7), isRefresh: false),
      data: (v) => Text('valor $v'),
    )));
    expect(find.text('valor 7'), findsOneWidget);
    expect(find.byType(NexaSkeleton), findsNothing);
  });

  testWidgets('refresh mantém dados na tela', (tester) async {
    await tester.pumpWidget(wrap(NexaAsyncView<int>(
      value: const AsyncValue.data(7)
          .copyWithPrevious(const AsyncValue.data(7), isRefresh: true),
      data: (v) => Text('valor $v'),
    )));
    expect(find.text('valor 7'), findsOneWidget);
    expect(find.byType(NexaSkeleton), findsNothing);
  });
}
