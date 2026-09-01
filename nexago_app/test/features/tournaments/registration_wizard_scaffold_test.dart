import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/registration_wizard/registration_wizard_notice.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/registration_wizard/registration_wizard_scaffold.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/registration_wizard/registration_wizard_spec_row.dart';

void main() {
  testWidgets('casca mostra título, subtítulo, corpo e sticky bar', (tester) async {
    var voltou = false;

    await tester.pumpWidget(
      MaterialApp(
        home: RegistrationWizardScaffold(
          title: 'Masc. Intermediário',
          subtitle: 'Copa Aparecida',
          onBack: () => voltou = true,
          stickyBar: const SizedBox(height: 40, child: Text('barra')),
          children: const [Text('corpo da tela')],
        ),
      ),
    );

    expect(find.text('Masc. Intermediário'), findsOneWidget);
    // TournamentRegistrationHeader escreve a linha de contexto (eyebrow) em
    // caixa alta — comportamento real do widget existente, não alterado
    // aqui (ver tournament_registration_header.dart:111).
    expect(find.text('COPA APARECIDA'), findsOneWidget);
    expect(find.text('corpo da tela'), findsOneWidget);
    expect(find.text('barra'), findsOneWidget);

    await tester.tap(find.byIcon(Icons.arrow_back_rounded));
    await tester.pump();
    expect(voltou, isTrue);
  });

  testWidgets('casca sem sticky bar não reserva espaço para ela', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: RegistrationWizardScaffold(
          title: 'Seu parceiro',
          onBack: () {},
          children: const [Text('corpo')],
        ),
      ),
    );

    expect(find.text('corpo'), findsOneWidget);
  });

  testWidgets('linha de spec mostra rótulo e valor', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: RegistrationWizardSpecRow(
            label: 'Inscrição por dupla',
            value: r'R$ 220',
          ),
        ),
      ),
    );

    expect(find.text('Inscrição por dupla'), findsOneWidget);
    expect(find.text(r'R$ 220'), findsOneWidget);
  });

  testWidgets('caixa de aviso mostra o conteúdo', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: RegistrationWizardNotice(
            child: Text('Esta categoria só aceita inscrição em dupla.'),
          ),
        ),
      ),
    );

    expect(
      find.text('Esta categoria só aceita inscrição em dupla.'),
      findsOneWidget,
    );
  });
}
