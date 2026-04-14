import 'package:flutter/material.dart';

/// Layout base com [Scaffold] e [AppBar] alinhados ao tema do app.
class AppScaffold extends StatelessWidget {
  const AppScaffold({
    super.key,
    required this.title,
    required this.body,
    this.actions,
    this.leading,
    this.appBarTitle,
    this.centerTitle,
    this.floatingActionButton,
    this.bottomNavigationBar,
    this.resizeToAvoidBottomInset,
  });

  final String title;
  /// Se não nulo, substitui o [Text] do título na AppBar (ex.: cabeçalho da arena).
  final Widget? appBarTitle;
  /// Quando nulo: com [appBarTitle] usa `false`; caso contrário segue o tema.
  final bool? centerTitle;
  final Widget body;
  final List<Widget>? actions;
  final Widget? leading;
  final Widget? floatingActionButton;
  final Widget? bottomNavigationBar;
  final bool? resizeToAvoidBottomInset;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: appBarTitle ?? Text(title),
        centerTitle: centerTitle ?? (appBarTitle != null ? false : null),
        leading: leading,
        actions: actions,
      ),
      body: body,
      floatingActionButton: floatingActionButton,
      bottomNavigationBar: bottomNavigationBar,
      resizeToAvoidBottomInset: resizeToAvoidBottomInset,
    );
  }
}
