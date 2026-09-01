# Wizard de inscrição no app — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a tela única de inscrição do app por um passo a passo de 7 etapas, uma rota por
etapa, cobrindo dupla, vaga solo e equipes trio+.

**Architecture:** `/torneios/:tournamentId/inscricao` deixa de ser tela e vira redirecionador.
Uma função pura (`resolveRegistrationStep`) decide a etapa a partir do estado derivado do
Firestore — nunca de estado de sessão. Cada etapa é uma rota irmã sob `/inscricao`. Os query
params de hoje continuam valendo, então os ~10 pontos de entrada existentes não são tocados.

**Tech Stack:** Flutter, Riverpod, go_router, Firestore, `flutter_test`.

**Spec:** `docs/superpowers/specs/2026-09-01-app-registration-wizard-design.md` — leia antes de
começar. Ela tem a seção "Decisões que se perdem se não estiverem escritas", que explica por que
várias coisas aqui parecem inconsistentes e não são.

## Global Constraints

- **Português na UI, inglês no código.** Strings visíveis em pt-BR; nomes de classe, método e
  arquivo em inglês.
- **`kSearchMinPrefixLength` continua `2`.** A regra das 3 letras é **local** à busca de
  parceiro. Não tocar em `lib/core/search/search_keywords.dart`.
- **Nenhuma mudança em Cloud Function, `firestore.rules` ou no painel do organizador.** O aceite
  LGPD continua sendo o booleano `lgpdAccepted` de hoje.
- **Nada de controller de sessão do wizard.** Nenhuma tela guarda o passo. Estado derivado do
  Firestore. Exceções permitidas: rascunho do uniforme antes de existir inscrição, e os
  checkboxes do consentimento antes da callable.
- **O app tem que continuar inscrevendo a cada commit.** A tela única só é apagada na Task 13,
  depois que o porteiro estiver de pé.
- **Datas:** sempre `.toLocal()` antes de formatar. `DateFormat` cru sobre o instante do
  Firestore devolve +3h. Mês abreviado é montado à mão (o `DateFormat` do Dart põe ponto:
  `mai.`).
- **Testes:** `flutter test` na raiz de `nexago_app/`. Em teste de widget com ponto ao vivo,
  `pumpAndSettle` trava — use `pump(Duration(...))`. Tamanho de tela em teste vai por
  `tester.view.physicalSize`, não `setSurfaceSize`.

---

## File Structure

**Criados** (todos em `nexago_app/lib/features/tournaments/`):

| Arquivo | Responsabilidade |
|---|---|
| `domain/registration_wizard_step.dart` | O enum das etapas e `resolveRegistrationStep` — o porteiro, função pura |
| `presentation/widgets/registration_wizard/registration_wizard_scaffold.dart` | Casca comum das telas: header, corpo rolável, sticky bar |
| `presentation/widgets/registration_wizard/registration_wizard_spec_row.dart` | Linha rótulo→valor das telas 1 e 3 |
| `presentation/widgets/registration_wizard/registration_wizard_notice.dart` | Caixa de aviso âmbar dos protótipos |
| `presentation/registration_wizard/registration_category_page.dart` | Tela 1 — detalhe da categoria |
| `presentation/registration_wizard/registration_consent_page.dart` | Tela do consentimento LGPD |
| `presentation/registration_wizard/registration_terms_page.dart` | Tela 3 — condições da inscrição |
| `presentation/registration_wizard/registration_partner_page.dart` | Tela 4 — casca do parceiro/elenco |
| `presentation/registration_wizard/registration_uniform_page.dart` | Tela 5 — casca do uniforme |
| `presentation/registration_wizard/registration_gate_page.dart` | O redirecionador de `/inscricao` |

**Modificados:**

| Arquivo | Mudança |
|---|---|
| `domain/tournament_detail_model.dart` | campo `registrationClosesAt` |
| `data/tournament_document_mapper.dart` | ler `registrationClosesAt` |
| `domain/tournament_discovery_labels.dart` | rótulo `tournamentRegistrationClosesLabel` |
| `domain/registration_progress_logic.dart` | ordem da trilha: Dupla antes de Uniforme |
| `data/partner_search_service.dart` | mínimo de 3 letras, `max` 15, sem fallback de navegação |
| `presentation/widgets/tournament_registration/tournament_registration_partner_step.dart` | tira últimas duplas e o browse inicial |
| `features/athlete/data/athlete_profile_repository.dart` | `saveMarketingOptIn` |
| `core/router/routes.dart` e `core/router/app_router.dart` | rotas novas + porteiro |

**Apagados** (só na Task 13): `presentation/tournament_registration_page.dart`,
`presentation/widgets/tournament_registration/registration_shell_card.dart`,
`.../registration_shell_category_card.dart`, `.../registration_shell_summary_card.dart`.

---

## Fase A — fundação

O app continua na tela única durante toda esta fase.

### Task 1: `registrationClosesAt` no app

O campo existe no Firestore, nas Cloud Functions (`tournament-registration-guards.ts`) e no
painel do organizador. O app nunca leu.

**Files:**
- Modify: `nexago_app/lib/features/tournaments/domain/tournament_detail_model.dart`
- Modify: `nexago_app/lib/features/tournaments/data/tournament_document_mapper.dart:136`
- Modify: `nexago_app/lib/features/tournaments/domain/tournament_discovery_labels.dart`
- Test: `nexago_app/test/features/tournaments/tournament_document_mapper_test.dart`
- Test: `nexago_app/test/features/tournaments/tournament_discovery_labels_test.dart` (criar se não existir)

**Interfaces:**
- Produces: `TournamentDetail.registrationClosesAt` (`DateTime?`) e
  `String tournamentRegistrationClosesLabel(DateTime closesAt)` → `"qua, 08 jul · 23h59"`.
  As telas 1, 3 e 5 consomem os dois.

- [ ] **Step 1: Escrever os testes que falham**

Em `tournament_document_mapper_test.dart`, adicione:

```dart
  test('fromMap lê registrationClosesAt', () {
    final t = TournamentDocumentMapper.fromMap('t-prazo', {
      'name': 'Copa Aparecida',
      'registrationClosesAt': Timestamp.fromDate(DateTime.utc(2026, 7, 8, 23, 59)),
    });
    expect(t.registrationClosesAt, DateTime.utc(2026, 7, 8, 23, 59));
  });

  test('fromMap sem registrationClosesAt devolve null', () {
    final t = TournamentDocumentMapper.fromMap('t-sem-prazo', {'name': 'Copa'});
    expect(t.registrationClosesAt, isNull);
  });
```

Crie `nexago_app/test/features/tournaments/tournament_discovery_labels_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_labels.dart';

void main() {
  test('rótulo do prazo usa a parede local, dia da semana e mês sem ponto', () {
    // Instante escolhido para cair numa quarta-feira na parede local.
    final closesAt = DateTime(2026, 7, 8, 23, 59);
    expect(tournamentRegistrationClosesLabel(closesAt), 'qua, 08 jul · 23h59');
  });

  test('rótulo do prazo zera minutos com dois dígitos', () {
    final closesAt = DateTime(2026, 7, 12, 8, 5);
    expect(tournamentRegistrationClosesLabel(closesAt), 'dom, 12 jul · 08h05');
  });
}
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd nexago_app && flutter test test/features/tournaments/tournament_document_mapper_test.dart test/features/tournaments/tournament_discovery_labels_test.dart`
Expected: FAIL — `registrationClosesAt` não existe em `TournamentDetail`;
`tournamentRegistrationClosesLabel` não está definida.

- [ ] **Step 3: Implementar**

Em `tournament_detail_model.dart`, no construtor (logo depois de `this.registrationOpensAt,`):

```dart
    this.registrationClosesAt,
```

e no corpo da classe, logo depois do campo `registrationOpensAt`:

```dart
  /// Instante em que as inscrições fecham (`registrationClosesAt` no
  /// Firestore). O guard do servidor (`assertTournamentAcceptsRegistration`)
  /// recusa inscrição depois dele; o app só passou a LER o campo no wizard.
  /// `null` = sem prazo declarado, e aí nenhuma tela mostra a linha.
  final DateTime? registrationClosesAt;
```

Em `tournament_document_mapper.dart`, logo abaixo da linha do `registrationOpensAt`:

```dart
      registrationClosesAt: _timestamp(data['registrationClosesAt']),
```

Em `tournament_discovery_labels.dart`, no fim do arquivo:

```dart
/// Meses abreviados escritos à mão de propósito: `DateFormat('MMM', 'pt_BR')`
/// devolve `jul.` (com ponto), e o portal web escreve sem. Duas superfícies
/// com grafias diferentes para a mesma data leem como bug.
const _shortMonths = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

const _shortWeekdays = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

/// "qua, 08 jul · 23h59" — parede LOCAL do instante gravado em
/// `registrationClosesAt`. Formatar o instante cru adianta 3h no Brasil.
String tournamentRegistrationClosesLabel(DateTime closesAt) {
  final local = closesAt.toLocal();
  String two(int v) => v.toString().padLeft(2, '0');
  final weekday = _shortWeekdays[local.weekday - 1];
  final month = _shortMonths[local.month - 1];
  return '$weekday, ${two(local.day)} $month · ${two(local.hour)}h${two(local.minute)}';
}
```

- [ ] **Step 4: Rodar para ver passar**

Run: `cd nexago_app && flutter test test/features/tournaments/tournament_document_mapper_test.dart test/features/tournaments/tournament_discovery_labels_test.dart`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/features/tournaments/domain/tournament_detail_model.dart nexago_app/lib/features/tournaments/data/tournament_document_mapper.dart nexago_app/lib/features/tournaments/domain/tournament_discovery_labels.dart nexago_app/test/features/tournaments/tournament_document_mapper_test.dart nexago_app/test/features/tournaments/tournament_discovery_labels_test.dart
git commit -m "feat(inscrição): app passa a ler registrationClosesAt"
```

---

### Task 2: O porteiro — `resolveRegistrationStep`

O coração do wizard. Função pura, sem Flutter e sem Firestore.

**Files:**
- Create: `nexago_app/lib/features/tournaments/domain/registration_wizard_step.dart`
- Test: `nexago_app/test/features/tournaments/registration_wizard_step_test.dart`

**Interfaces:**
- Produces: `enum RegistrationWizardStep`, `class RegistrationStepInput`,
  `RegistrationWizardStep resolveRegistrationStep(RegistrationStepInput input)`.
  A Task 12 (o porteiro de rota) e todas as telas consomem.

- [ ] **Step 1: Escrever o teste que falha**

Crie `nexago_app/test/features/tournaments/registration_wizard_step_test.dart`:

```dart
// O porteiro do wizard de inscrição. A ORDEM das checagens é o contrato —
// ver docs/superpowers/specs/2026-09-01-app-registration-wizard-design.md.
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/registration_wizard_step.dart';

RegistrationStepInput input({
  bool categoryResolved = true,
  bool hasReceivedInvite = false,
  bool hasRegistration = false,
  bool lgpdAccepted = false,
  bool partnerPending = false,
  bool uniformRequired = false,
  bool uniformComplete = true,
  bool isPaid = false,
  RegistrationWizardStep? requestedStep,
}) {
  return RegistrationStepInput(
    categoryResolved: categoryResolved,
    hasReceivedInvite: hasReceivedInvite,
    hasRegistration: hasRegistration,
    lgpdAccepted: lgpdAccepted,
    partnerPending: partnerPending,
    uniformRequired: uniformRequired,
    uniformComplete: uniformComplete,
    isPaid: isPaid,
    requestedStep: requestedStep,
  );
}

void main() {
  group('ordem das checagens', () {
    test('sem categoria resolvida abre a categoria', () {
      expect(
        resolveRegistrationStep(input(categoryResolved: false)),
        RegistrationWizardStep.categoria,
      );
    });

    test('categoria vence tudo: nem convite recebido passa na frente', () {
      expect(
        resolveRegistrationStep(
          input(categoryResolved: false, hasReceivedInvite: true),
        ),
        RegistrationWizardStep.categoria,
      );
    });

    test('convite recebido pendente abre as condições', () {
      expect(
        resolveRegistrationStep(input(hasReceivedInvite: true)),
        RegistrationWizardStep.condicoes,
      );
    });

    test('sem inscrição e sem aceite abre o consentimento', () {
      expect(
        resolveRegistrationStep(input()),
        RegistrationWizardStep.consentimento,
      );
    });

    test('sem inscrição com aceite abre as condições', () {
      expect(
        resolveRegistrationStep(input(lgpdAccepted: true)),
        RegistrationWizardStep.condicoes,
      );
    });

    test('inscrição com parceiro pendente abre o parceiro', () {
      expect(
        resolveRegistrationStep(
          input(hasRegistration: true, partnerPending: true),
        ),
        RegistrationWizardStep.parceiro,
      );
    });

    test('uniforme exigido e incompleto abre o uniforme', () {
      expect(
        resolveRegistrationStep(
          input(
            hasRegistration: true,
            uniformRequired: true,
            uniformComplete: false,
          ),
        ),
        RegistrationWizardStep.uniforme,
      );
    });

    test('uniforme incompleto NÃO segura quem nem tem uniforme na categoria', () {
      expect(
        resolveRegistrationStep(
          input(hasRegistration: true, uniformComplete: false),
        ),
        RegistrationWizardStep.pagamento,
      );
    });

    test('tudo resolvido menos o pagamento abre o pagamento', () {
      expect(
        resolveRegistrationStep(input(hasRegistration: true)),
        RegistrationWizardStep.pagamento,
      );
    });

    test('pago e completo abre o sucesso', () {
      expect(
        resolveRegistrationStep(input(hasRegistration: true, isPaid: true)),
        RegistrationWizardStep.sucesso,
      );
    });
  });

  group('o step pedido é preferência, nunca ordem', () {
    test('pedido de passo JÁ liberado é obedecido', () {
      // Inscrição só devendo pagamento; o atleta quer rever o uniforme.
      expect(
        resolveRegistrationStep(
          input(
            hasRegistration: true,
            uniformRequired: true,
            requestedStep: RegistrationWizardStep.uniforme,
          ),
        ),
        RegistrationWizardStep.uniforme,
      );
    });

    test('pedido de passo AINDA pendente é ignorado', () {
      // "Continuar inscrição" manda step=payment sempre; quem deve o parceiro
      // tem que cair no parceiro, não no pagamento.
      expect(
        resolveRegistrationStep(
          input(
            hasRegistration: true,
            partnerPending: true,
            requestedStep: RegistrationWizardStep.pagamento,
          ),
        ),
        RegistrationWizardStep.parceiro,
      );
    });

    test('solo que pagou o integral e espera parceiro cai no parceiro', () {
      expect(
        resolveRegistrationStep(
          input(
            hasRegistration: true,
            partnerPending: true,
            isPaid: true,
            requestedStep: RegistrationWizardStep.pagamento,
          ),
        ),
        RegistrationWizardStep.parceiro,
      );
    });

    test('pedido não fura o consentimento', () {
      expect(
        resolveRegistrationStep(
          input(requestedStep: RegistrationWizardStep.pagamento),
        ),
        RegistrationWizardStep.consentimento,
      );
    });
  });
}
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd nexago_app && flutter test test/features/tournaments/registration_wizard_step_test.dart`
Expected: FAIL — `registration_wizard_step.dart` não existe.

- [ ] **Step 3: Implementar**

Crie `nexago_app/lib/features/tournaments/domain/registration_wizard_step.dart`:

```dart
/// O porteiro do wizard de inscrição: dado o estado DERIVADO da inscrição,
/// devolve em qual etapa o atleta deve estar.
///
/// Puro de propósito — sem Flutter, sem Firestore, sem providers. É onde a
/// regra mora e o que os testes exercitam; a rota só obedece.
///
/// O passo NÃO é estado de sessão. Guardá-lo em `setState` foi exatamente o
/// beco sem saída da vaga solo pendente: quem reservava sem parceiro entrava
/// sem o id na rota, caía no passo de categoria e não achava mais o convite.
library;

/// Etapas na ORDEM do fluxo. A ordem do enum é contrato: `resolveRegistrationStep`
/// compara `index` para decidir se um passo pedido já está liberado.
enum RegistrationWizardStep {
  categoria,
  consentimento,
  condicoes,
  parceiro,
  uniforme,
  pagamento,
  sucesso,
}

/// Entradas do porteiro, todas já resolvidas pela camada de dados.
class RegistrationStepInput {
  const RegistrationStepInput({
    required this.categoryResolved,
    required this.hasReceivedInvite,
    required this.hasRegistration,
    required this.lgpdAccepted,
    required this.partnerPending,
    required this.uniformRequired,
    required this.uniformComplete,
    required this.isPaid,
    this.requestedStep,
  });

  /// A categoria da rota existe no torneio.
  final bool categoryResolved;

  /// Existe convite de parceiro pendente PARA o atleta nesta categoria.
  final bool hasReceivedInvite;

  final bool hasRegistration;

  /// Aceite do termo já dado — pela inscrição existente ou pelo parâmetro que
  /// atravessa o fluxo antes de a inscrição existir.
  final bool lgpdAccepted;

  final bool partnerPending;
  final bool uniformRequired;
  final bool uniformComplete;
  final bool isPaid;

  /// Passo pedido na rota (`?step=`). PREFERÊNCIA, nunca ordem.
  final RegistrationWizardStep? requestedStep;
}

/// Etapa em que o atleta deve estar.
///
/// A ordem das checagens é o contrato — ver a spec. O passo pedido na rota só
/// é obedecido quando aponta para uma etapa **já liberada** (índice menor ou
/// igual ao natural): assim "voltar para rever o uniforme" funciona e "pular
/// direto para o pagamento" não.
RegistrationWizardStep resolveRegistrationStep(RegistrationStepInput input) {
  final natural = _naturalStep(input);
  final requested = input.requestedStep;
  if (requested != null && requested.index <= natural.index) return requested;
  return natural;
}

RegistrationWizardStep _naturalStep(RegistrationStepInput input) {
  if (!input.categoryResolved) return RegistrationWizardStep.categoria;
  if (input.hasReceivedInvite) return RegistrationWizardStep.condicoes;
  if (!input.hasRegistration) {
    return input.lgpdAccepted
        ? RegistrationWizardStep.condicoes
        : RegistrationWizardStep.consentimento;
  }
  if (input.partnerPending) return RegistrationWizardStep.parceiro;
  if (input.uniformRequired && !input.uniformComplete) {
    return RegistrationWizardStep.uniforme;
  }
  if (!input.isPaid) return RegistrationWizardStep.pagamento;
  return RegistrationWizardStep.sucesso;
}

/// Nome do passo no query param `?step=`, e o caminho inverso.
///
/// `waiting` é aceito na leitura porque rotas antigas ainda o mandam (o app
/// instalado na loja continua gerando esses links por um tempo): ele significa
/// "esperando o parceiro", que no wizard é a tela do parceiro.
const _stepNames = <String, RegistrationWizardStep>{
  'categoria': RegistrationWizardStep.categoria,
  'consentimento': RegistrationWizardStep.consentimento,
  'condicoes': RegistrationWizardStep.condicoes,
  'partner': RegistrationWizardStep.parceiro,
  'parceiro': RegistrationWizardStep.parceiro,
  'waiting': RegistrationWizardStep.parceiro,
  'uniform': RegistrationWizardStep.uniforme,
  'uniforme': RegistrationWizardStep.uniforme,
  'payment': RegistrationWizardStep.pagamento,
  'pagamento': RegistrationWizardStep.pagamento,
};

RegistrationWizardStep? registrationStepFromParam(String? raw) {
  final value = raw?.trim().toLowerCase() ?? '';
  if (value.isEmpty) return null;
  return _stepNames[value];
}
```

- [ ] **Step 4: Rodar para ver passar**

Run: `cd nexago_app && flutter test test/features/tournaments/registration_wizard_step_test.dart`
Expected: PASS (14 testes)

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/features/tournaments/domain/registration_wizard_step.dart nexago_app/test/features/tournaments/registration_wizard_step_test.dart
git commit -m "feat(inscrição): porteiro do wizard como função pura"
```

---

### Task 3: Trilha da Home na ordem do wizard

`buildRegistrationProgress` monta `Categoria → Uniforme → Dupla → Pagamento`. O wizard vai
`Parceiro → Uniforme`. As duas superfícies têm que concordar sobre "qual é o próximo passo",
senão a Home diz uma coisa e o porteiro leva para outra.

**Files:**
- Modify: `nexago_app/lib/features/tournaments/domain/registration_progress_logic.dart:180-200`
- Test: `nexago_app/test/features/tournaments/registration_progress_logic_test.dart`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `buildRegistrationProgress` com os passos na ordem
  `Categoria → Dupla|Equipe → [Uniforme] → Pagamento → Confirmada`. `RegistrationProgress`
  mantém a mesma forma; só a ordem de `steps` e o `currentStep` mudam.

- [ ] **Step 1: Escrever o teste que falha**

Adicione em `registration_progress_logic_test.dart`, dentro do `main()`:

```dart
  test('trilha segue a ordem do wizard: dupla antes do uniforme', () {
    final progress = buildRegistrationProgress(
      makeRegistration(category: uniformCategory, partnerPending: true),
      myUid: kMe,
      myName: 'Rafael Torres',
    );

    expect(
      progress!.steps.map((s) => s.label).toList(),
      ['Categoria', 'Dupla', 'Uniforme', 'Pagamento', 'Confirmada'],
    );
  });

  test('dupla pendente é o passo atual mesmo com uniforme pendente', () {
    final progress = buildRegistrationProgress(
      makeRegistration(category: uniformCategory, partnerPending: true),
      myUid: kMe,
      myName: 'Rafael Torres',
    );

    expect(progress!.currentStep, 2);
    expect(progress.pendingLabel, 'Falta fechar a dupla');
  });
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd nexago_app && flutter test test/features/tournaments/registration_progress_logic_test.dart`
Expected: FAIL — a ordem sai `['Categoria', 'Uniforme', 'Dupla', ...]` e `pendingLabel` vem
`'Falta escolher o uniforme'`. **Outros testes do arquivo também vão falhar** — eles fixam a
ordem antiga. Isso é esperado: corrija-os no Step 3.

- [ ] **Step 3: Implementar**

Em `registration_progress_logic.dart`, na lista `drafts` de `buildRegistrationProgress`, mova o
bloco do uniforme para DEPOIS do bloco da dupla/equipe, e troque o comentário:

```dart
  // Ordem do wizard de inscrição (parceiro antes do uniforme). A Home e o
  // porteiro (`resolveRegistrationStep`) precisam concordar sobre qual é o
  // próximo passo — se divergirem, a Home diz "falta o uniforme" e o toque
  // leva para a tela do parceiro.
  final drafts = <_StepDraft>[
    _StepDraft(label: 'Categoria', caption: category.name, done: true),
    _StepDraft(
      label: registration.teamSize != null ? 'Equipe' : 'Dupla',
      caption: _partnerCaption(registration, myName, partnerName),
      done: partnerDone,
    ),
    if (categoryRequiresUniform(category))
      _StepDraft(
        label: 'Uniforme',
        caption: uniformDone ? 'Salvo' : 'Pendente',
        done: uniformDone,
      ),
    _StepDraft(
      label: 'Pagamento',
      caption: _paymentCaption(registration, category),
      done: paymentDone,
    ),
    _StepDraft(
      label: 'Confirmada',
      caption: 'Vaga garantida',
      done: paymentDone && partnerDone,
    ),
  ];
```

Depois, ajuste os testes existentes do arquivo que fixavam a ordem antiga: onde eles esperam
`'Uniforme'` no índice 1, passa a ser índice 2; onde esperam `currentStep` do uniforme, o número
sobe em 1 quando a dupla também está pendente.

- [ ] **Step 4: Rodar para ver passar**

Run: `cd nexago_app && flutter test test/features/tournaments/registration_progress_logic_test.dart`
Expected: PASS — arquivo inteiro.

- [ ] **Step 5: Rodar a suíte para pegar quem mais dependia da ordem**

Run: `cd nexago_app && flutter test test/features/tournaments/ test/features/athlete/`
Expected: PASS. Se algum teste de widget da Home fixava a ordem, corrija junto neste commit.

- [ ] **Step 6: Commit**

```bash
git add nexago_app/lib/features/tournaments/domain/registration_progress_logic.dart nexago_app/test/
git commit -m "fix(inscrição): trilha da Home na mesma ordem do wizard"
```

---

## Fase B — busca de parceiro

Entrega valor sozinha e é reversível: mesmo que o wizard atrase, o custo cai.

### Task 4: 3 letras, teto de 10, sem varredura

Hoje: abrir a tela lê **100 perfis** (`listPartners`) **mais** a coleção `inscriptions` inteira
(últimas duplas). Cada busca lê **100 documentos** (`max: 25` × multiplicador 4).
Depois: abrir custa **0**; cada busca lê **60**.

**Files:**
- Modify: `nexago_app/lib/features/tournaments/data/partner_search_service.dart`
- Modify: `nexago_app/lib/features/tournaments/presentation/widgets/tournament_registration/tournament_registration_partner_step.dart`
- Test: `nexago_app/test/features/tournaments/partner_search_service_test.dart` (criar)

**Interfaces:**
- Produces: `PartnerSearchService.kMinQueryLength = 3`,
  `PartnerSearchService.kDisplayLimit = 10`, `PartnerSearchService.kFetchLimit = 15`,
  `bool isPartnerQueryLongEnough(String raw)`. `searchPartners` devolve **no máximo 10** e
  devolve **lista vazia** abaixo do mínimo. `listPartners` continua existindo (a substituição
  de parceiro usa), mas a tela de inscrição não chama mais.

- [ ] **Step 1: Escrever o teste que falha**

Crie `nexago_app/test/features/tournaments/partner_search_service_test.dart`:

```dart
// Regras de custo da busca de parceiro. Ver a spec: o mínimo de 3 letras é
// LOCAL — `kSearchMinPrefixLength` global continua 2 por causa do gerador de
// `keywords`, cujo backfill nunca rodou.
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/data/partner_search_service.dart';

void main() {
  group('mínimo de 3 letras', () {
    test('duas letras não busca', () {
      expect(isPartnerQueryLongEnough('ra'), isFalse);
    });

    test('três letras busca', () {
      expect(isPartnerQueryLongEnough('raf'), isTrue);
    });

    test('conta sobre o termo normalizado: pontuação não vale letra', () {
      expect(isPartnerQueryLongEnough('j.r'), isFalse);
    });

    test('acento não atrapalha a contagem', () {
      expect(isPartnerQueryLongEnough('joã'), isTrue);
    });

    test('espaços em volta não contam', () {
      expect(isPartnerQueryLongEnough('  ra  '), isFalse);
    });
  });

  group('tetos', () {
    test('a tela mostra no máximo 10', () {
      expect(PartnerSearchService.kDisplayLimit, 10);
    });

    test('pede 15 ao repositório para o filtro de gênero ter folga', () {
      expect(PartnerSearchService.kFetchLimit, 15);
    });
  });
}
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd nexago_app && flutter test test/features/tournaments/partner_search_service_test.dart`
Expected: FAIL — `isPartnerQueryLongEnough` e as constantes não existem.

- [ ] **Step 3: Implementar o serviço**

Substitua o conteúdo de `partner_search_service.dart` por:

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';
import 'package:nexago_app/core/profiles/users_repository.dart';

import '../../../core/search/search_keywords.dart';
import '../../../core/auth/user_roles.dart';
import '../domain/partner_search_logic.dart';

/// Mínimo de letras para a busca de parceiro disparar.
///
/// LOCAL de propósito: `kSearchMinPrefixLength` (2) vale para arena, ligas,
/// equipes e torneios, e é o mesmo número que o gerador de `keywords` usa para
/// montar os prefixos gravados nos perfis. Subir a constante global quebraria
/// o índice, cujo backfill em `users` nunca rodou.
const int kPartnerSearchMinQueryLength = 3;

/// Conta sobre o termo NORMALIZADO: acento e pontuação não valem letra, então
/// `J.R` vira `jr` e continua insuficiente.
bool isPartnerQueryLongEnough(String raw) {
  return normalizeSearchTerm(raw).length >= kPartnerSearchMinQueryLength;
}

class PartnerSearchService {
  PartnerSearchService(this._users);

  final UsersRepository _users;

  /// Sugestões iniciais: página única e enxuta. A tela de INSCRIÇÃO não usa
  /// mais (abre sem listar nada); quem chama é a substituição de parceiro.
  static const int initialBrowseLimit = 100;

  /// Quantos a tela mostra. O pedido de produto é "no máximo 10 por pesquisa".
  static const int kDisplayLimit = 10;

  /// Quantos o repositório devolve. Pedir 15 para exibir 10 dá folga ao filtro
  /// de gênero da categoria, que roda DEPOIS: cortar em 10 antes do filtro
  /// deixava 4 ou 5 numa categoria de gênero fixo. O repositório lê
  /// `max × 4` documentos (teto 100) — 15 significa 60, contra os 100 de antes.
  static const int kFetchLimit = 15;

  Future<List<AppUserProfile>> listPartners({
    required String currentUserId,
    required String? categoryGenderType,
    int browseLimit = initialBrowseLimit,
  }) async {
    var users = await _users.listAthleteProfiles(maxResults: browseLimit);
    users = users.where((user) => user.uid != currentUserId).toList();
    users = filterPartnersByCategoryGender(users, categoryGenderType);
    return sortPartnersForDisplay(users);
  }

  /// Busca por nome ou @. Abaixo de [kPartnerSearchMinQueryLength] devolve
  /// VAZIO — antes caía em [listPartners] e lia 100 perfis a cada tecla curta.
  Future<List<AppUserProfile>> searchPartners({
    required String currentUserId,
    required String? categoryGenderType,
    required String query,
    int max = kFetchLimit,
  }) async {
    final trimmed = query.trim();
    if (!isPartnerQueryLongEnough(trimmed)) return const [];

    var users = await _users.searchUsersByNicknameOrName(
      trimmed,
      max: max,
      roleFilter: kAthleteAppRole,
    );
    users = users.where((user) => user.uid != currentUserId).toList();
    users = filterPartnersByCategoryGender(users, categoryGenderType);
    final sorted = sortPartnersForDisplay(users);
    return sorted.length > kDisplayLimit
        ? sorted.sublist(0, kDisplayLimit)
        : sorted;
  }
}

final partnerSearchServiceProvider = Provider<PartnerSearchService>((ref) {
  return PartnerSearchService(ref.watch(usersRepositoryProvider));
});
```

- [ ] **Step 4: Rodar para ver passar**

Run: `cd nexago_app && flutter test test/features/tournaments/partner_search_service_test.dart`
Expected: PASS

- [ ] **Step 5: Tirar a varredura e o browse do passo do parceiro**

Em `tournament_registration_partner_step.dart`:

Remova os imports `'../../../data/recent_partners_repository.dart'` e
`'tournament_registration_recent_partners_chips.dart'` (os arquivos **continuam existindo** — a
substituição de parceiro e o perfil público usam).

Troque o import de `search_keywords.dart` por nada: `isSearchTermLongEnough` sai daqui, quem
manda agora é `isPartnerQueryLongEnough` do serviço.

Remova o campo `List<AppUserProfile> _recentPartners = const [];` e troque
`bool _loadingPartners = true;` por `bool _loadingPartners = false;` — a tela não carrega nada
ao abrir.

Em `initState`, remova a chamada `_loadInitialPartners();`.

Apague o método `_loadInitialPartners()` inteiro e substitua `_runPartnerSearch()` por:

```dart
  Future<void> _runPartnerSearch() async {
    final uid = ref.read(authProvider).valueOrNull?.uid ?? '';
    if (uid.isEmpty || !mounted) return;

    final query = _searchController.text.trim();
    // Abaixo do mínimo a tela volta ao estado vazio SEM ir ao servidor.
    if (!isPartnerQueryLongEnough(query)) {
      setState(() {
        _displayPartners = const [];
        _loadingPartners = false;
      });
      return;
    }

    setState(() => _loadingPartners = true);

    try {
      final service = ref.read(partnerSearchServiceProvider);
      final results = await service.searchPartners(
        currentUserId: uid,
        categoryGenderType: categoryGenderForPartnerFilter(widget.category),
        query: query,
      );
      if (!mounted) return;
      setState(() {
        _displayPartners = results;
        _loadingPartners = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loadingPartners = false);
    }
  }
```

No `build`, troque `final isFiltering = isSearchTermLongEnough(query);` por
`final isFiltering = isPartnerQueryLongEnough(query);`, remova o bloco
`if (!isFiltering && !_loadingPartners && _recentPartners.isNotEmpty) ...[ … ]` inteiro, e troque
o `hintText` para `'Buscar atleta por nome ou @'`.

No cálculo de `resultsHeader`, o ramo não-filtrando some:

```dart
    final resultsHeader = isFiltering
        ? partnerResultsHeader(
            count: displayProfiles.length,
            category: widget.category,
          )
        : '';
```

No `tagLabel` do candidato, o "Jogou com você" sai junto com as últimas duplas:

```dart
              final candidate = partnerCandidateFromProfile(
                profile,
                tagLabel: partnerGenderPendencyLabel(profile, requiredGender),
              );
```

E o estado vazio passa a distinguir "ainda não digitou o bastante" de "não achei":

```dart
        else if (displayProfiles.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 24),
            child: Text(
              isFiltering
                  ? 'Nenhum atleta encontrado.'
                  : 'Digite ao menos 3 letras do nome ou do @ para buscar.',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: context.themeColors.onSurfaceMuted,
              ),
            ),
          )
```

- [ ] **Step 6: Rodar a suíte de inscrição**

Run: `cd nexago_app && flutter test test/features/tournaments/`
Expected: PASS. `tournament_registration_page_test.dart` pode ter um caso que esperava a lista
inicial de atletas ao abrir — ajuste para o estado vazio.

- [ ] **Step 7: Commit**

```bash
git add nexago_app/lib/features/tournaments/data/partner_search_service.dart nexago_app/lib/features/tournaments/presentation/widgets/tournament_registration/tournament_registration_partner_step.dart nexago_app/test/
git commit -m "perf(inscrição): busca de parceiro a partir de 3 letras, teto de 10

Abrir a tela custava ~100 perfis mais a varredura da coleção de inscrições
das últimas duplas; agora custa zero. Cada busca cai de 100 para 60
documentos lidos."
```

---

## Fase C — as telas novas

Cada tela nasce em rota própria e **alcançável**, mas `/inscricao` continua entregando a tela
única. O app inscreve normalmente durante toda a fase.

### Task 5: Casca do wizard e os dois widgets compartilhados

**Files:**
- Create: `nexago_app/lib/features/tournaments/presentation/widgets/registration_wizard/registration_wizard_scaffold.dart`
- Create: `nexago_app/lib/features/tournaments/presentation/widgets/registration_wizard/registration_wizard_spec_row.dart`
- Create: `nexago_app/lib/features/tournaments/presentation/widgets/registration_wizard/registration_wizard_notice.dart`
- Test: `nexago_app/test/features/tournaments/registration_wizard_scaffold_test.dart`

**Interfaces:**
- Consumes: `TournamentRegistrationHeader` e `TournamentRegistrationStickyBar`, que já existem em
  `presentation/widgets/tournament_registration/`.
- Produces:
  - `RegistrationWizardScaffold({required String title, String? subtitle, required VoidCallback onBack, required List<Widget> children, Widget? stickyBar})`
  - `RegistrationWizardSpecRow({required String label, required String value, bool highlight = false})`
  - `RegistrationWizardNotice({required Widget child, IconData icon = Icons.lock_outline_rounded})`
  As tasks 6 a 10 montam todas as telas em cima destes três.

- [ ] **Step 1: Escrever o teste que falha**

Crie `nexago_app/test/features/tournaments/registration_wizard_scaffold_test.dart`:

```dart
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
    expect(find.text('Copa Aparecida'), findsOneWidget);
    expect(find.text('corpo da tela'), findsOneWidget);
    expect(find.text('barra'), findsOneWidget);

    await tester.tap(find.byIcon(Icons.arrow_back_ios_new_rounded));
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
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd nexago_app && flutter test test/features/tournaments/registration_wizard_scaffold_test.dart`
Expected: FAIL — os três arquivos não existem.

- [ ] **Step 3: Implementar**

`registration_wizard_scaffold.dart`:

```dart
import 'package:flutter/material.dart';

import '../../../../../core/theme/app_spacing.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../tournament_registration/tournament_registration_header.dart';

/// Casca comum das telas do wizard de inscrição: cabeçalho com voltar,
/// corpo rolável e barra fixa opcional.
///
/// Todas as telas do fluxo usam esta casca para o cabeçalho e o espaçamento
/// não divergirem tela a tela — foi o que aconteceu com a tela única, que
/// acumulou 1656 linhas justamente por ser a dona de tudo.
class RegistrationWizardScaffold extends StatelessWidget {
  const RegistrationWizardScaffold({
    super.key,
    required this.title,
    required this.onBack,
    required this.children,
    this.subtitle,
    this.stickyBar,
  });

  final String title;
  final String? subtitle;
  final VoidCallback onBack;
  final List<Widget> children;
  final Widget? stickyBar;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            TournamentRegistrationHeader(
              onBack: onBack,
              title: title,
              tournamentName: subtitle,
              showTournamentInfo: subtitle != null,
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenH,
                  AppSpacing.lg,
                  AppSpacing.screenH,
                  AppSpacing.xxl,
                ),
                children: children,
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: stickyBar,
    );
  }
}
```

`registration_wizard_spec_row.dart`:

```dart
import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_spacing.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Linha "rótulo → valor" das telas 1 e 3 (preço, prazo, formato).
///
/// [highlight] pinta o valor na cor de atenção — usado no prazo, que é a
/// informação que muda a decisão do atleta.
class RegistrationWizardSpecRow extends StatelessWidget {
  const RegistrationWizardSpecRow({
    super.key,
    required this.label,
    required this.value,
    this.highlight = false,
  });

  final String label;
  final String value;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Text(
              label,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: context.themeColors.onSurfaceMuted,
              ),
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: highlight
                    ? AppColors.warning
                    : context.themeColors.onSurface,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
```

> Se `AppColors.warning` não existir, use o token âmbar que o projeto já tiver
> (`grep -n "warning\|amber" nexago_app/lib/core/theme/app_colors.dart`) e mantenha o mesmo
> token nas tasks 6 a 10.

`registration_wizard_notice.dart`:

```dart
import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_spacing.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Caixa de aviso âmbar do wizard: a regra que o atleta precisa ler antes de
/// seguir (dupla obrigatória, prazo do uniforme, relógio da vaga).
class RegistrationWizardNotice extends StatelessWidget {
  const RegistrationWizardNotice({
    super.key,
    required this.child,
    this.icon = Icons.lock_outline_rounded,
  });

  final Widget child;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.warning.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.warning.withValues(alpha: 0.35)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: AppColors.warning),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: DefaultTextStyle.merge(
              style: Theme.of(context).textTheme.bodyMedium!.copyWith(
                color: context.themeColors.onSurface,
                height: 1.45,
              ),
              child: child,
            ),
          ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 4: Rodar para ver passar**

Run: `cd nexago_app && flutter test test/features/tournaments/registration_wizard_scaffold_test.dart`
Expected: PASS. Se o ícone do voltar no `TournamentRegistrationHeader` não for
`Icons.arrow_back_ios_new_rounded`, ajuste o `find.byIcon` do teste para o ícone real em vez de
mudar o header.

- [ ] **Step 5: Declarar TODAS as constantes de rota do wizard**

As telas apontam umas para as outras (a 1 empurra para o consentimento, o consentimento para as
condições, e assim por diante). Se cada task declarasse só a sua constante, a task anterior não
compilaria. Declare as cinco de uma vez agora; cada task registra depois o seu `GoRoute`.

Em `AppRoutes` (`nexago_app/lib/core/router/routes.dart`), junto das outras rotas de inscrição:

```dart
  /// Passo 1 do wizard: `/torneios/:tournamentId/inscricao/categoria`
  static const String tournamentRegistrationCategory =
      '/torneios/:tournamentId/inscricao/categoria';

  /// Consentimento LGPD: `/torneios/:tournamentId/inscricao/consentimento`
  static const String tournamentRegistrationConsent =
      '/torneios/:tournamentId/inscricao/consentimento';

  /// Condições da inscrição: `/torneios/:tournamentId/inscricao/condicoes`
  static const String tournamentRegistrationTerms =
      '/torneios/:tournamentId/inscricao/condicoes';

  /// Parceiro/elenco: `/torneios/:tournamentId/inscricao/parceiro`
  static const String tournamentRegistrationPartner =
      '/torneios/:tournamentId/inscricao/parceiro';

  /// Uniforme: `/torneios/:tournamentId/inscricao/uniforme`
  static const String tournamentRegistrationUniform =
      '/torneios/:tournamentId/inscricao/uniforme';
```

E em `AppRouteNames`, no mesmo arquivo:

```dart
  static const String tournamentRegistrationCategory =
      'tournamentRegistrationCategory';
  static const String tournamentRegistrationConsent =
      'tournamentRegistrationConsent';
  static const String tournamentRegistrationTerms =
      'tournamentRegistrationTerms';
  static const String tournamentRegistrationPartner =
      'tournamentRegistrationPartner';
  static const String tournamentRegistrationUniform =
      'tournamentRegistrationUniform';
```

> **Entre as tasks 6 e 12 as rotas do wizard existem mas ninguém chega nelas:** `/inscricao`
> continua entregando a tela única até a Task 12. Um `pushNamed` para uma rota ainda não
> registrada só estoura para quem digitar o deep link à mão — nenhum caminho do app leva lá
> ainda. Nos testes o harness registra rotas falsas com esses nomes, então cada task fecha
> sozinha.

- [ ] **Step 6: Commit**

```bash
git add nexago_app/lib/features/tournaments/presentation/widgets/registration_wizard/ nexago_app/lib/core/router/routes.dart nexago_app/test/features/tournaments/registration_wizard_scaffold_test.dart
git commit -m "feat(inscrição): casca, widgets e rotas do wizard"
```

---

### Task 6: Tela 1 — detalhe da categoria

Substitui o card seletor de categoria. A categoria vem da ROTA, não de um seletor.

**Files:**
- Create: `nexago_app/lib/features/tournaments/presentation/registration_wizard/registration_category_page.dart`
- Modify: `nexago_app/lib/core/router/routes.dart`
- Modify: `nexago_app/lib/core/router/app_router.dart`
- Test: `nexago_app/test/features/tournaments/registration_category_page_test.dart`

**Interfaces:**
- Consumes: `RegistrationWizardScaffold`, `RegistrationWizardSpecRow`, `RegistrationWizardNotice`
  (Task 5); `tournamentRegistrationClosesLabel` e `TournamentDetail.registrationClosesAt`
  (Task 1); `registrationCategoryStatus` e `RegistrationEligibilityInput`
  (`domain/registration_shell_logic.dart`, já existem).
- Produces: `RegistrationCategoryPage({required String tournamentId, required String categoryId})`
  e a rota `AppRouteNames.tournamentRegistrationCategory`.

- [ ] **Step 1: Escrever o teste que falha**

Crie `nexago_app/test/features/tournaments/registration_category_page_test.dart`. Copie o
cabeçalho de helpers (`dupla`, `torneio`, `perfil`, `abrirTela`) de
`tournament_registration_page_test.dart:31-250` e troque o corpo do `GoRoute` inicial por
`RegistrationCategoryPage(tournamentId: 't1', categoryId: 'masc')`. Os casos:

```dart
  testWidgets('mostra vagas, nível e o prazo de inscrição', (tester) async {
    await abrirTela(
      tester,
      tournament: torneio(
        [dupla(entryFee: 220, maxTeams: 16)],
        registrationClosesAt: DateTime(2026, 7, 8, 23, 59),
      ),
      inscritosPorCategoria: const {'masc': 11},
    );

    expect(find.text('VAGAS'), findsOneWidget);
    expect(find.text('5 de 16'), findsOneWidget);
    expect(find.text('Inscrições até'), findsOneWidget);
    expect(find.text('qua, 08 jul · 23h59'), findsOneWidget);
  });

  testWidgets('sem registrationClosesAt a linha do prazo não aparece', (tester) async {
    await abrirTela(tester, tournament: torneio([dupla()]));

    expect(find.text('Inscrições até'), findsNothing);
  });

  testWidgets('dupla obrigatória mostra o aviso e o CTA de inscrever', (tester) async {
    await abrirTela(
      tester,
      tournament: torneio([dupla()], requireFormedPair: true),
    );

    expect(find.textContaining('só aceita inscrição em dupla'), findsOneWidget);
    expect(find.text('Inscrever-se'), findsOneWidget);
  });

  testWidgets('categoria lotada bloqueia o CTA', (tester) async {
    await abrirTela(
      tester,
      tournament: torneio([dupla(maxTeams: 8)]),
      inscritosPorCategoria: const {'masc': 8},
    );

    final botao = tester.widget<FilledButton>(find.byType(FilledButton));
    expect(botao.onPressed, isNull);
    expect(find.text('LOTADO'), findsOneWidget);
  });

  testWidgets('já inscrito leva para o passo pendente em vez de inscrever de novo', (tester) async {
    await abrirTela(
      tester,
      tournament: torneio([dupla()]),
      registrations: const {
        'masc': UserCategoryRegistration(
          registrationId: 'reg-1',
          partnerPending: true,
          isPaid: false,
        ),
      },
    );

    expect(find.text('JÁ INSCRITO'), findsOneWidget);
    expect(find.text('Continuar inscrição'), findsOneWidget);
  });
```

Adicione o parâmetro `registrationClosesAt` ao helper `torneio` que você copiou, repassando para
o `TournamentDetail`.

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd nexago_app && flutter test test/features/tournaments/registration_category_page_test.dart`
Expected: FAIL — `RegistrationCategoryPage` não existe.

- [ ] **Step 3: Implementar a tela**

Crie `registration_category_page.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/ui/nexa_async_view.dart';
import '../../../../core/ui/app_status_views.dart';
import '../../../athlete/domain/athlete_profile_providers.dart';
import '../../../athlete/domain/tournament_access_providers.dart';
import '../../../athlete/presentation/widgets/tournament_access_banner.dart';
import '../../data/tournament_inscriptions_repository.dart';
import '../../domain/category_age_eligibility.dart';
import '../../domain/category_gender_eligibility.dart';
import '../../domain/category_level_eligibility.dart';
import '../../domain/registration_shell_logic.dart';
import '../../domain/tournament_category_spots.dart';
import '../../domain/tournament_detail_model.dart';
import '../../domain/tournament_discovery_labels.dart';
import '../../domain/tournament_discovery_models.dart';
import '../../domain/tournament_discovery_providers.dart';
import '../../domain/tournament_registration_logic.dart';
import '../../domain/tournament_registration_providers.dart';
import '../widgets/registration_wizard/registration_wizard_notice.dart';
import '../widgets/registration_wizard/registration_wizard_scaffold.dart';
import '../widgets/registration_wizard/registration_wizard_spec_row.dart';
import '../widgets/tournament_registration/level_confirmation_sheet.dart';
import '../widgets/tournament_registration/tournament_registration_sticky_bar.dart';

/// Passo 1 do wizard: o detalhe da categoria.
///
/// A categoria vem da ROTA, não de um seletor: a escolha acontece na lista do
/// torneio, antes de entrar no fluxo. "Ver outras categorias" volta para lá.
///
/// A folha de confirmação de nível (anti-sandbagging) abre na SAÍDA desta
/// tela: é uma pergunta sobre caber na categoria, então vem junto da
/// categoria.
class RegistrationCategoryPage extends ConsumerStatefulWidget {
  const RegistrationCategoryPage({
    super.key,
    required this.tournamentId,
    required this.categoryId,
  });

  final String tournamentId;
  final String categoryId;

  @override
  ConsumerState<RegistrationCategoryPage> createState() =>
      _RegistrationCategoryPageState();
}

class _RegistrationCategoryPageState
    extends ConsumerState<RegistrationCategoryPage> {
  bool _advancing = false;

  void _exit() {
    if (context.canPop()) {
      context.pop();
      return;
    }
    context.goNamed(
      AppRouteNames.tournamentDetail,
      pathParameters: {'tournamentId': widget.tournamentId},
    );
  }

  /// Sai para o consentimento. Antes disso, a folha de nível quando devida —
  /// recusar ali cancela a saída e o atleta continua na categoria.
  Future<void> _advance(TournamentDetail tournament) async {
    if (_advancing) return;
    setState(() => _advancing = true);
    try {
      final prompt = await CategoryLevelEligibility.resolveLevelConfirmationPrompt(
        ref.read(athleteProfileProvider).valueOrNull,
        tournamentSport: tournament.sport,
      );
      if (!mounted) return;
      if (prompt != null) {
        final confirmed = await showLevelConfirmationSheet(context, prompt);
        if (!mounted || confirmed != true) return;
      }
      if (!mounted) return;
      context.pushNamed(
        AppRouteNames.tournamentRegistrationConsent,
        pathParameters: {'tournamentId': widget.tournamentId},
        queryParameters: {'categoryId': widget.categoryId},
      );
    } finally {
      if (mounted) setState(() => _advancing = false);
    }
  }

  /// Já inscrito: o CTA retoma pelo porteiro em vez de tentar inscrever de novo.
  void _resume(String registrationId) {
    context.pushNamed(
      AppRouteNames.tournamentRegistration,
      pathParameters: {'tournamentId': widget.tournamentId},
      queryParameters: {
        'categoryId': widget.categoryId,
        'registrationId': registrationId,
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final tournamentAsync = ref.watch(
      tournamentDetailProvider(widget.tournamentId),
    );
    final access = ref.watch(tournamentAccessStateProvider);

    return NexaAsyncView<TournamentDetail?>(
      value: tournamentAsync,
      onRetry: () =>
          ref.invalidate(tournamentDetailProvider(widget.tournamentId)),
      errorTitle: 'Não foi possível carregar',
      errorMessage: 'Não foi possível carregar o torneio.',
      emptyWhen: (value) =>
          value == null ||
          !value.categoryOffers.any((c) => c.id == widget.categoryId),
      empty: AppEmptyView(
        icon: Icons.category_outlined,
        title: 'Categoria não encontrada',
        subtitle: 'Ela pode ter sido removida ou o link está desatualizado.',
        actionLabel: 'Voltar',
        onAction: _exit,
      ),
      data: (value) {
        final tournament = value!;
        final category = tournament.categoryOffers
            .firstWhere((c) => c.id == widget.categoryId);

        final enrollmentAsync = ref.watch(
          tournamentCategoryEnrollmentCountsProvider(widget.tournamentId),
        );
        final enrollmentResolved = enrollmentAsync.hasValue;
        final enrollment = enrollmentAsync.valueOrNull ?? const <String, int>{};
        final inscriptionCount = resolveInscriptionCountForOffer(
          enrollment,
          category,
          countsResolved: enrollmentResolved,
        );
        final capacity = categoryMaxTeams(category);
        final spotsLeft = capacity > 0
            ? categorySpotsLeft(category, inscriptionCount: inscriptionCount)
            : null;

        final registrations = ref
                .watch(
                  tournamentUserRegistrationsByCategoryProvider(
                    widget.tournamentId,
                  ),
                )
                .valueOrNull ??
            const <String, UserCategoryRegistration>{};
        final registration = registrations[category.id];

        final profile = ref.watch(athleteProfileProvider).valueOrNull;
        final levelRank = CategoryLevelEligibility.athleteLevelRank(
          profile,
          tournamentSport: tournament.sport,
        );
        final status = registrationCategoryStatus(
          offer: category,
          alreadyRegistered: registration != null,
          spotsLeft: spotsLeft,
          registrationOpensAt: tournament.registrationOpensAt,
          eligibility: RegistrationEligibilityInput(
            levelBlocked: !CategoryLevelEligibility.isCategoryEligibleForLevel(
              category,
              levelRank,
            ),
            belowMinLevel:
                CategoryLevelEligibility.categoryLevelRank(category) >=
                        levelRank &&
                    levelRank <
                        CategoryLevelEligibility.categoryMinLevelRank(category),
            ageEligibility: CategoryAgeEligibility.evaluate(
              category,
              profile,
              tournamentStart: tournament.startDate,
            ),
            genderBlocked:
                !CategoryGenderEligibility.isCategoryEligibleForAthlete(
              category,
              profile,
            ),
          ),
        );

        final closesAt = tournament.registrationClosesAt;
        final pairRequired =
            tournament.requireFormedPair && !category.isTeamCategory;
        final canAdvance = access.canAccess && !status.blocked;

        return RegistrationWizardScaffold(
          title: category.name,
          subtitle: tournament.name,
          onBack: _exit,
          stickyBar: TournamentRegistrationStickyBar(
            enabled: registration != null || canAdvance,
            submitting: _advancing,
            ctaLabel: registration != null
                ? 'Continuar inscrição'
                : 'Inscrever-se',
            ctaSubtitle: status.message,
            onConfirm: () => registration != null
                ? _resume(registration.registrationId)
                : _advance(tournament),
          ),
          children: [
            if (!access.canAccess) ...[
              TournamentAccessBanner(
                onboardingCompleted: access.onboardingCompleted,
                blockMessage: access.blockMessage,
                missingStepTitles: access.missingStepTitles,
              ),
              const SizedBox(height: AppSpacing.lg),
            ],
            if (status.badge != null) ...[
              _Badge(status.badge!),
              const SizedBox(height: AppSpacing.lg),
            ],
            _StatTiles(
              spotsLeft: spotsLeft,
              capacity: capacity,
              levelLabel: categoryLevelRangeLabel(category),
            ),
            const SizedBox(height: AppSpacing.lg),
            RegistrationWizardSpecRow(
              label: 'Inscrição por ${category.unitSingular}',
              value: formatRegistrationMoney(category.entryFee),
            ),
            if (closesAt != null)
              RegistrationWizardSpecRow(
                label: 'Inscrições até',
                value: tournamentRegistrationClosesLabel(closesAt),
                highlight: true,
              ),
            RegistrationWizardSpecRow(
              label: 'Formato',
              value: categoryBracketFormatLabel(category),
            ),
            // O protótipo tinha também "Sorteio da chave · 09 jul". NÃO existe
            // campo de data de sorteio — nem no app, nem nas functions, nem no
            // painel do organizador. A linha fica de fora. Ver a spec.
            if (pairRequired) ...[
              const SizedBox(height: AppSpacing.lg),
              const RegistrationWizardNotice(
                child: Text(
                  'Esta categoria só aceita inscrição em dupla — você vai '
                  'precisar informar o parceiro no próximo passo.',
                ),
              ),
            ],
          ],
        );
      },
    );
  }
}
```

No fim do mesmo arquivo, os dois widgets privados:

```dart
class _Badge extends StatelessWidget {
  const _Badge(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: AppColors.brand.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: AppColors.brand.withValues(alpha: 0.4)),
        ),
        child: Text(
          label,
          style: AppTypography.mono(
            fontSize: 10,
            fontWeight: FontWeight.w700,
            color: AppColors.brand,
            letterSpacing: 1.2,
          ),
        ),
      ),
    );
  }
}

/// VAGAS e NÍVEL lado a lado. `spotsLeft` nulo = capacidade desconhecida
/// (categoria sem teto ou contagem ainda não resolvida): mostra travessão em
/// vez de inventar um número.
class _StatTiles extends StatelessWidget {
  const _StatTiles({
    required this.spotsLeft,
    required this.capacity,
    required this.levelLabel,
  });

  final int? spotsLeft;
  final int capacity;
  final String levelLabel;

  @override
  Widget build(BuildContext context) {
    final spots = spotsLeft;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Expanded(
          child: _Tile(
            label: 'VAGAS',
            value: spots == null || capacity <= 0
                ? '—'
                : '$spots de $capacity',
            emphasis: spots != null && spots > 0,
          ),
        ),
        const SizedBox(width: AppSpacing.md),
        Expanded(child: _Tile(label: 'NÍVEL', value: levelLabel)),
      ],
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({
    required this.label,
    required this.value,
    this.emphasis = false,
  });

  final String label;
  final String value;
  final bool emphasis;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: AppTypography.mono(
              fontSize: 10,
              fontWeight: FontWeight.w600,
              color: context.themeColors.onSurfaceMuted,
              letterSpacing: 1.4,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            value,
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
              color: emphasis ? AppColors.brand : context.themeColors.onSurface,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}
```

Os imports de `AppColors` e `AppTypography` entram no topo do arquivo.

`categoryLevelRangeLabel` e `categoryBracketFormatLabel` já existem em
`domain/tournament_registration_logic.dart` ou `domain/tournament_detail_logic.dart` — confirme
com `grep -rn "levelRangeLabel\|bracketFormatLabel" nexago_app/lib` e use os nomes reais.

- [ ] **Step 4: Registrar a rota**

As constantes já foram declaradas na Task 5. Em `app_router.dart`, logo antes da rota
`tournamentRegistrationPayment`:

```dart
      GoRoute(
        path: AppRoutes.tournamentRegistrationCategory,
        name: AppRouteNames.tournamentRegistrationCategory,
        builder: (context, state) {
          final tournamentId =
              state.pathParameters['tournamentId']?.trim() ?? '';
          final categoryId =
              state.uri.queryParameters['categoryId']?.trim() ?? '';
          return RegistrationCategoryPage(
            tournamentId: tournamentId,
            categoryId: categoryId,
          );
        },
      ),
```

- [ ] **Step 5: Rodar para ver passar**

Run: `cd nexago_app && flutter test test/features/tournaments/registration_category_page_test.dart`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add nexago_app/lib/features/tournaments/presentation/registration_wizard/ nexago_app/lib/core/router/ nexago_app/test/features/tournaments/registration_category_page_test.dart
git commit -m "feat(inscrição): tela 1 do wizard — detalhe da categoria"
```

---

### Task 7: Tela do consentimento LGPD

Três caixas: duas obrigatórias (dados e imagem, que juntas são o termo que já existe) e uma
opcional (marketing, que grava no perfil).

**Files:**
- Create: `nexago_app/lib/features/tournaments/presentation/registration_wizard/registration_consent_page.dart`
- Modify: `nexago_app/lib/features/athlete/data/athlete_profile_repository.dart`
- Modify: `nexago_app/lib/core/router/routes.dart` e `app_router.dart`
- Test: `nexago_app/test/features/tournaments/registration_consent_page_test.dart`

**Interfaces:**
- Consumes: `lgpdTermTitle`, `lgpdTermParagraphs` (`domain/lgpd_term.dart`);
  `RegistrationWizardScaffold` (Task 5).
- Produces: `RegistrationConsentPage({required String tournamentId, required String categoryId})`;
  `AthleteProfileRepository.saveMarketingOptIn({required String uid, required bool optIn})`.
  Ao concluir, navega para as condições com `lgpd=1` no query param — é assim que o aceite
  atravessa o fluxo até a callable.

- [ ] **Step 1: Escrever o teste que falha**

```dart
  testWidgets('as duas obrigatórias vêm marcadas e o CTA já libera', (tester) async {
    await abrirTela(tester, tournament: torneio([dupla()]));

    expect(find.text('Autorizo o uso dos meus dados para esta inscrição'), findsOneWidget);
    expect(find.text('Autorizo o uso da minha imagem nos jogos'), findsOneWidget);
    expect(find.text('Quero receber avisos de novos torneios'), findsOneWidget);

    final botao = tester.widget<FilledButton>(find.byType(FilledButton));
    expect(botao.onPressed, isNotNull);
  });

  testWidgets('desmarcar uma obrigatória trava o CTA', (tester) async {
    await abrirTela(tester, tournament: torneio([dupla()]));

    await tester.tap(find.text('Autorizo o uso da minha imagem nos jogos'));
    await tester.pump();

    final botao = tester.widget<FilledButton>(find.byType(FilledButton));
    expect(botao.onPressed, isNull);
  });

  testWidgets('a lista descreve o que o organizador RECEBE de fato', (tester) async {
    await abrirTela(tester, tournament: torneio([dupla()]));

    expect(find.text('Nome completo e apelido'), findsOneWidget);
    expect(find.text('Telefone para avisos do torneio'), findsOneWidget);
    expect(find.text('Nível, categoria e histórico de resultados'), findsOneWidget);
    // O protótipo dizia CPF e cartão; nenhum dos dois chega ao organizador.
    expect(find.textContaining('CPF'), findsNothing);
    expect(find.textContaining('cartão'), findsNothing);
  });

  testWidgets('concordar leva às condições carregando o aceite', (tester) async {
    await abrirTela(tester, tournament: torneio([dupla()]));

    await tester.tap(find.text('Concordar e continuar'));
    await tester.pumpAndSettle();

    expect(rotasAbertas, contains('condicoes'));
  });
```

Use o mesmo harness das tasks anteriores, com uma rota falsa nomeada
`AppRouteNames.tournamentRegistrationTerms` que empurra `'condicoes'` em `rotasAbertas`.

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd nexago_app && flutter test test/features/tournaments/registration_consent_page_test.dart`
Expected: FAIL — `RegistrationConsentPage` não existe.

- [ ] **Step 3: Implementar o save do opt-in**

Em `athlete_profile_repository.dart`, ao lado de `savePrivacyPreferences`:

```dart
  /// Opt-in de comunicações de marketing, dado na tela de consentimento da
  /// inscrição.
  ///
  /// É consentimento de PLATAFORMA, não do torneio — por isso mora no perfil e
  /// não na inscrição (o aceite do termo do evento continua sendo
  /// `lgpdAccepted`, carimbado pela callable em `lgpdAcceptedUids`).
  ///
  /// O campo é gravado pelo próprio dono: a regra de update de `users` é uma
  /// lista de PROIBIÇÕES (roles, superAdmin, reputation, sandRank, referredBy,
  /// phoneVerified, níveis), não um allow-list — campo novo do dono passa. Ele
  /// também não está em `PUBLIC_PROFILE_FIELDS`, então não vai para o espelho
  /// público.
  Future<void> saveMarketingOptIn({
    required String uid,
    required bool optIn,
  }) async {
    await _users.doc(uid).set(
      <String, dynamic>{
        'marketingOptIn': optIn,
        'updatedAt': FieldValue.serverTimestamp(),
      },
      SetOptions(merge: true),
    );
  }
```

- [ ] **Step 4: Implementar a tela**

Crie `registration_consent_page.dart`. Estrutura: `ConsumerStatefulWidget` com três `bool`
(`_dataConsent = true`, `_imageConsent = true`, `_marketing = false`), a casca do wizard, e:

1. Título grande `'Como usamos\nseus dados'` em `AppTypography.soraRegular` 26/w800.
2. Parágrafo: `'Para te inscrever, a nexaGO compartilha alguns dados com o organizador do
   ${tournament.name}. Você decide o que é opcional.'`
3. Cartão `O ORGANIZADOR RECEBE` com três linhas (ícone + texto), **corrigidas** contra o
   protótipo:

```dart
  static const _organizerReceives = <(IconData, String)>[
    (Icons.person_outline_rounded, 'Nome completo e apelido'),
    (Icons.notifications_none_rounded, 'Telefone para avisos do torneio'),
    (Icons.emoji_events_outlined, 'Nível, categoria e histórico de resultados'),
  ];
```

   e o rodapé: `'O pagamento é processado pela nexaGO — o organizador vê a baixa da inscrição,
   não seus dados de pagamento.'`

   > O protótipo listava "data de nascimento e CPF" e falava em cartão. Nenhum dos três chega ao
   > organizador, e não existe pagamento por cartão. Ver a spec: descrever errado numa
   > declaração de tratamento de dados é o pior lugar para errar. **Não "corrigir" de volta.**

4. Três `_ConsentTile` (checkbox + título + descrição + selo `OBRIGATÓRIO` nos dois primeiros):

```dart
  static const _dataTitle = 'Autorizo o uso dos meus dados para esta inscrição';
  static const _dataBody = 'Inclui cadastro na chave, súmulas e ranking da competição.';
  static const _imageTitle = 'Autorizo o uso da minha imagem nos jogos';
  static const _imageBody = 'Fotos e vídeos da competição em canais do organizador e da nexaGO.';
  static const _marketingTitle = 'Quero receber avisos de novos torneios';
  static const _marketingBody = 'Comunicações de marketing. Pode desativar quando quiser.';
```

5. Um `TextButton` `'Ler termo completo'` que expande `lgpdTermTitle` + `lgpdTermParagraphs`.
6. Sticky bar com `'Concordar e continuar'`, habilitada só com as duas obrigatórias marcadas, e
   um `TextButton` `'Cancelar inscrição'` abaixo, que faz `_exit()`.

O `onConfirm`:

```dart
  Future<void> _confirm() async {
    setState(() => _saving = true);
    final uid = ref.read(authServiceProvider).currentUser?.uid ?? '';
    if (uid.isNotEmpty) {
      try {
        await ref
            .read(athleteProfileRepositoryProvider)
            .saveMarketingOptIn(uid: uid, optIn: _marketing);
      } catch (_) {
        // O opt-in de marketing não pode travar a inscrição: falhou, segue.
        // O aceite que IMPORTA é o do termo, e ele viaja na callable.
      }
    }
    if (!mounted) return;
    setState(() => _saving = false);
    context.pushNamed(
      AppRouteNames.tournamentRegistrationTerms,
      pathParameters: {'tournamentId': widget.tournamentId},
      queryParameters: {'categoryId': widget.categoryId, 'lgpd': '1'},
    );
  }
```

- [ ] **Step 5: Declarar a rota**

Mesmo padrão da Task 6, com `tournamentRegistrationConsent` =
`'/torneios/:tournamentId/inscricao/consentimento'`.

- [ ] **Step 6: Rodar para ver passar**

Run: `cd nexago_app && flutter test test/features/tournaments/registration_consent_page_test.dart`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add nexago_app/lib/features/tournaments/presentation/registration_wizard/registration_consent_page.dart nexago_app/lib/features/athlete/data/athlete_profile_repository.dart nexago_app/lib/core/router/ nexago_app/test/features/tournaments/registration_consent_page_test.dart
git commit -m "feat(inscrição): tela de consentimento LGPD do wizard"
```

---

### Task 8: Tela 3 — condições da inscrição

Três variantes: **dupla obrigatória**, **dupla com reserva solo permitida** e **equipe trio+**.
Os protótipos desenharam só a primeira; as outras duas seguem a mesma estrutura, trocando o texto
e o rótulo do CTA. É também a tela onde cai quem RECEBEU um convite.

**Files:**
- Create: `nexago_app/lib/features/tournaments/presentation/registration_wizard/registration_terms_page.dart`
- Create: `nexago_app/lib/features/tournaments/domain/registration_terms_copy.dart`
- Modify: `nexago_app/lib/core/router/routes.dart` e `app_router.dart`
- Test: `nexago_app/test/features/tournaments/registration_terms_copy_test.dart`
- Test: `nexago_app/test/features/tournaments/registration_terms_page_test.dart`

**Interfaces:**
- Consumes: `RegistrationWizardScaffold`, `RegistrationWizardNotice`,
  `RegistrationWizardSpecRow` (Task 5); `tournamentRegistrationClosesLabel` (Task 1).
- Produces: `RegistrationTermsCopy` e
  `RegistrationTermsCopy registrationTermsCopy({required TournamentCategoryOffer category, required bool requireFormedPair, required bool hasReceivedInvite, String? inviterName})`;
  `RegistrationTermsPage({required String tournamentId, required String categoryId, required bool lgpdAccepted})`.

- [ ] **Step 1: Escrever o teste da cópia**

Crie `registration_terms_copy_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/registration_terms_copy.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';

TournamentCategoryOffer categoria({int? teamSize}) => TournamentCategoryOffer(
      id: 'c1',
      name: 'Masc. Intermediário',
      entryFee: 220,
      teamSize: teamSize,
    );

void main() {
  test('dupla obrigatória: não oferece seguir sem parceiro', () {
    final copy = registrationTermsCopy(
      category: categoria(),
      requireFormedPair: true,
      hasReceivedInvite: false,
    );

    expect(copy.eyebrow, 'DUPLA OBRIGATÓRIA');
    expect(copy.title, 'Este torneio só aceita inscrição com dupla');
    expect(copy.ctaLabel, 'Definir meu parceiro');
    expect(copy.allowsSolo, isFalse);
  });

  test('dupla com reserva solo: oferece guardar a vaga sozinho', () {
    final copy = registrationTermsCopy(
      category: categoria(),
      requireFormedPair: false,
      hasReceivedInvite: false,
    );

    expect(copy.allowsSolo, isTrue);
    expect(copy.ctaLabel, 'Escolher meu parceiro');
    expect(copy.secondaryLabel, 'Guardar minha vaga sem parceiro');
  });

  test('equipe trio+: fala em elenco, não em dupla', () {
    final copy = registrationTermsCopy(
      category: categoria(teamSize: 4),
      requireFormedPair: false,
      hasReceivedInvite: false,
    );

    expect(copy.title, 'Esta categoria é disputada em equipe de 4');
    expect(copy.ctaLabel, 'Montar meu elenco');
    expect(copy.allowsSolo, isFalse);
  });

  test('convite recebido: a tela vira o aceite', () {
    final copy = registrationTermsCopy(
      category: categoria(),
      requireFormedPair: true,
      hasReceivedInvite: true,
      inviterName: 'Bia Souza',
    );

    expect(copy.eyebrow, 'CONVITE RECEBIDO');
    expect(copy.title, 'Bia Souza quer jogar com você');
    expect(copy.ctaLabel, 'Aceitar convite');
  });
}
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd nexago_app && flutter test test/features/tournaments/registration_terms_copy_test.dart`
Expected: FAIL — `registration_terms_copy.dart` não existe.

- [ ] **Step 3: Implementar a cópia**

Crie `nexago_app/lib/features/tournaments/domain/registration_terms_copy.dart`:

```dart
import 'tournament_discovery_models.dart';

/// Textos do passo 3 (condições da inscrição) por variante.
///
/// Puro de propósito: as quatro variantes (dupla obrigatória, dupla com
/// reserva solo, equipe trio+, convite recebido) são regra de produto, e regra
/// testada em módulo puro não some quando alguém mexe no layout.
class RegistrationTermsCopy {
  const RegistrationTermsCopy({
    required this.eyebrow,
    required this.title,
    required this.body,
    required this.ctaLabel,
    required this.allowsSolo,
    this.secondaryLabel,
  });

  final String eyebrow;
  final String title;
  final String body;
  final String ctaLabel;

  /// A categoria aceita guardar a vaga sem parceiro definido.
  final bool allowsSolo;

  /// Rótulo da ação secundária (`null` = sem ação secundária).
  final String? secondaryLabel;
}

RegistrationTermsCopy registrationTermsCopy({
  required TournamentCategoryOffer category,
  required bool requireFormedPair,
  required bool hasReceivedInvite,
  String? inviterName,
}) {
  if (hasReceivedInvite) {
    final who = (inviterName ?? '').trim();
    return RegistrationTermsCopy(
      eyebrow: 'CONVITE RECEBIDO',
      title: who.isEmpty
          ? 'Você foi convidado para esta categoria'
          : '$who quer jogar com você',
      body: 'Ao aceitar, vocês ficam com a vaga reservada e o pagamento abre '
          'em seguida.',
      ctaLabel: 'Aceitar convite',
      allowsSolo: false,
    );
  }

  final teamSize = category.teamSize;
  if (teamSize != null && teamSize > 2) {
    return RegistrationTermsCopy(
      eyebrow: 'EQUIPE',
      title: 'Esta categoria é disputada em equipe de $teamSize',
      body: 'Você monta o elenco e convida os integrantes. A inscrição fecha '
          'quando o elenco estiver completo.',
      ctaLabel: 'Montar meu elenco',
      allowsSolo: false,
    );
  }

  if (requireFormedPair) {
    return const RegistrationTermsCopy(
      eyebrow: 'DUPLA OBRIGATÓRIA',
      title: 'Este torneio só aceita inscrição com dupla',
      body: 'O organizador não abre vaga individual nesta categoria. Defina o '
          'parceiro para seguir com a inscrição.',
      ctaLabel: 'Definir meu parceiro',
      allowsSolo: false,
    );
  }

  return const RegistrationTermsCopy(
    eyebrow: 'DUPLA',
    title: 'Escolha com quem você joga',
    body: 'Você pode convidar o parceiro agora ou guardar sua vaga e definir '
        'depois, enquanto as inscrições estiverem abertas.',
    ctaLabel: 'Escolher meu parceiro',
    allowsSolo: true,
    secondaryLabel: 'Guardar minha vaga sem parceiro',
  );
}
```

- [ ] **Step 4: Rodar a cópia para ver passar**

Run: `cd nexago_app && flutter test test/features/tournaments/registration_terms_copy_test.dart`
Expected: PASS

- [ ] **Step 5: Escrever o teste da tela**

Em `registration_terms_page_test.dart`, com o mesmo harness das tasks anteriores (rota inicial
construindo `RegistrationTermsPage(tournamentId: 't1', categoryId: 'masc', lgpdAccepted: true)`):

```dart
  testWidgets('mostra as três garantias e o preço por atleta', (tester) async {
    await abrirTela(
      tester,
      tournament: torneio([dupla(entryFee: 220)], requireFormedPair: true),
    );

    expect(find.text('Este torneio só aceita inscrição com dupla'), findsOneWidget);
    expect(find.text('Parceiro definido antes de pagar'), findsOneWidget);
    expect(find.text(r'R$ 220'), findsOneWidget);
    expect(find.text(r'R$ 110'), findsOneWidget);
  });

  testWidgets('dupla obrigatória não oferece guardar a vaga sozinho', (tester) async {
    await abrirTela(
      tester,
      tournament: torneio([dupla()], requireFormedPair: true),
    );

    expect(find.text('Guardar minha vaga sem parceiro'), findsNothing);
  });

  testWidgets('CTA leva ao parceiro carregando o aceite adiante', (tester) async {
    await abrirTela(
      tester,
      tournament: torneio([dupla()], requireFormedPair: true),
    );

    await tester.tap(find.text('Definir meu parceiro'));
    await tester.pumpAndSettle();

    expect(rotasAbertas, contains('parceiro'));
  });
```

- [ ] **Step 6: Implementar a tela e a rota**

`RegistrationTermsPage` usa `RegistrationWizardScaffold`, chama `registrationTermsCopy` com
`tournament.requireFormedPair`, a categoria da rota e o convite recebido resolvido por
`receivedInviteForCategory` (já existe em `domain/tournament_registration_logic.dart`), e monta:

1. `RegistrationWizardNotice` com o `eyebrow` + `title` + `body` da cópia.
2. Três linhas de garantia com ícone: `'Parceiro definido antes de pagar'` / `'Nenhum valor é
   cobrado enquanto a dupla não estiver formada'`; `'Inscrições até <prazo>'` (só quando
   `registrationClosesAt != null`) / `'Depois desse prazo a chave é sorteada'`; `'Os dois
   precisam caber na categoria'` / `'Nível compatível com ${category.name}'`.
3. Cartão de preço: total (`formatRegistrationMoney(category.entryFee)`), `'Metade e metade'`
   com `entryFee / 2` e selo `POR ATLETA`, `'Ou tudo por você'` com o total e selo `INTEGRAL`.
   Em equipe trio+, troque por `entryFee / teamSize` e o selo `POR ATLETA`.
4. Sticky bar com `copy.ctaLabel`, empurrando para `AppRouteNames.tournamentRegistrationPartner`
   com `categoryId` e `lgpd: '1'` quando `widget.lgpdAccepted`. Quando `copy.secondaryLabel !=
   null`, um `TextButton` abaixo que dispara a reserva solo pela mesma callable que a tela única
   usa hoje (`TournamentRegistrationService`), e um `TextButton` `'Ver outras categorias'` que
   volta para o detalhe do torneio.

Registre o `GoRoute` de `AppRoutes.tournamentRegistrationTerms` (a constante já existe desde a
Task 5), lendo `categoryId` e `lgpd` dos query params
(`lgpdAccepted: state.uri.queryParameters['lgpd'] == '1'`).

- [ ] **Step 7: Rodar para ver passar**

Run: `cd nexago_app && flutter test test/features/tournaments/registration_terms_page_test.dart test/features/tournaments/registration_terms_copy_test.dart`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add nexago_app/lib/features/tournaments/domain/registration_terms_copy.dart nexago_app/lib/features/tournaments/presentation/registration_wizard/registration_terms_page.dart nexago_app/lib/core/router/ nexago_app/test/
git commit -m "feat(inscrição): tela 3 do wizard — condições da inscrição"
```

---

### Task 9: Tela 4 — parceiro e elenco

Casca nova em volta do passo que já existe. **Não reescreva** o
`TournamentRegistrationPartnerStep`: ele já tem a busca (com as regras da Task 4), o filtro de
gênero, o convite por link e o cartão de vaga solo.

**Files:**
- Create: `nexago_app/lib/features/tournaments/presentation/registration_wizard/registration_partner_page.dart`
- Modify: `nexago_app/lib/core/router/routes.dart` e `app_router.dart`
- Test: `nexago_app/test/features/tournaments/registration_partner_page_test.dart`

**Interfaces:**
- Consumes: `TournamentRegistrationPartnerStep` (existente, com `compact: false`);
  `RegistrationWizardScaffold` (Task 5); `TournamentRegistrationRosterCard` (existente, para
  equipe trio+).
- Produces: `RegistrationPartnerPage({required String tournamentId, required String categoryId, String? registrationId, bool lgpdAccepted = false})`.

- [ ] **Step 1: Escrever o teste que falha**

```dart
  testWidgets('abre sem listar atletas e pede 3 letras', (tester) async {
    await abrirTela(tester, tournament: torneio([dupla()]));

    expect(
      find.text('Digite ao menos 3 letras do nome ou do @ para buscar.'),
      findsOneWidget,
    );
  });

  testWidgets('CTA fica travado enquanto nenhum atleta é escolhido', (tester) async {
    await abrirTela(tester, tournament: torneio([dupla()]));

    final botao = tester.widget<FilledButton>(find.byType(FilledButton));
    expect(botao.onPressed, isNull);
  });

  testWidgets('equipe trio+ mostra o elenco em vez do convite único', (tester) async {
    await abrirTela(
      tester,
      tournament: torneio([equipe(teamSize: 4)]),
      initialCategoryId: 'quarteto',
    );

    expect(find.textContaining('Elenco'), findsOneWidget);
  });
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd nexago_app && flutter test test/features/tournaments/registration_partner_page_test.dart`
Expected: FAIL — `RegistrationPartnerPage` não existe.

- [ ] **Step 3: Implementar**

A tela resolve torneio + categoria + inscrição como a Task 6, e então:

- Categoria de **dupla**: `TournamentRegistrationPartnerStep(category: category, selectedUserId:
  _selectedUserId, onSelected: (c) => setState(() => _selected = c), onInviteByLink: _shareLink,
  onRegisterSolo: allowsSolo ? _registerSolo : null, currentGenders: _currentGenders)`, com a
  sticky bar mostrando `'Convidar ${primeiroNome}'` e o subtítulo `'o pagamento abre quando ele
  aceitar'`. O `onConfirm` dispara a mesma callable de convite que a tela única usa
  (`tournamentPartnerInviteServiceProvider`), passando `lgpdAccepted: widget.lgpdAccepted`.
- Categoria de **equipe** (`teamSize != null && teamSize > 2`): acrescente
  `TournamentRegistrationRosterCard` acima do passo, com o elenco atual e os convites pendentes,
  e o CTA vira `'Convidar para a equipe'`. O elenco fecha sozinho quando os aceites chegam — a
  tela não trava esperando.

Ao voltar da callable com sucesso, navegue para o uniforme quando a categoria pedir uniforme, e
para o pagamento quando não pedir:

```dart
    final next = categoryRequiresUniform(category)
        ? AppRouteNames.tournamentRegistrationUniform
        : AppRouteNames.tournamentRegistrationPayment;
    if (!mounted) return;
    context.pushNamed(
      next,
      pathParameters: {'tournamentId': widget.tournamentId},
      queryParameters: {
        'categoryId': widget.categoryId,
        'registrationId': registrationId,
      },
    );
```

Registre o `GoRoute` de `AppRoutes.tournamentRegistrationPartner` (constante da Task 5), lendo
`categoryId`, `registrationId` e `lgpd` dos query params.

- [ ] **Step 4: Rodar para ver passar**

Run: `cd nexago_app && flutter test test/features/tournaments/registration_partner_page_test.dart`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/features/tournaments/presentation/registration_wizard/registration_partner_page.dart nexago_app/lib/core/router/ nexago_app/test/features/tournaments/registration_partner_page_test.dart
git commit -m "feat(inscrição): tela 4 do wizard — parceiro e elenco"
```

---

### Task 10: Tela 5 — uniforme

Casca nova em volta do `TournamentRegistrationUniformStep`, que já existe com autosave.

**Files:**
- Create: `nexago_app/lib/features/tournaments/presentation/registration_wizard/registration_uniform_page.dart`
- Modify: `nexago_app/lib/core/router/routes.dart` e `app_router.dart`
- Test: `nexago_app/test/features/tournaments/registration_uniform_page_test.dart`

**Interfaces:**
- Consumes: `TournamentRegistrationUniformStep`, `UniformAutoSaver`,
  `validateUniformSelection`, `defaultUniformSelectionForCategory` (todos existentes);
  `RegistrationWizardScaffold` (Task 5); `tournamentRegistrationClosesLabel` (Task 1).
- Produces: `RegistrationUniformPage({required String tournamentId, required String categoryId, required String registrationId})`.

- [ ] **Step 1: Escrever o teste que falha**

```dart
  testWidgets('CTA trava enquanto o uniforme está incompleto', (tester) async {
    await abrirTela(
      tester,
      tournament: torneio([dupla(uniformType: 'top_only')]),
      snap: snapshot(),
    );

    // A categoria exige tamanho; sem escolha gravada o passo não fecha.
    final botao = tester.widget<FilledButton>(find.byType(FilledButton));
    expect(botao.onPressed, isNull);
  });

  testWidgets('mostra o prazo de alteração quando o torneio tem prazo', (tester) async {
    await abrirTela(
      tester,
      tournament: torneio(
        [dupla(uniformType: 'top_only')],
        registrationClosesAt: DateTime(2026, 7, 8, 23, 59),
      ),
      snap: snapshot(),
    );

    expect(
      find.textContaining('podem ser alterados até qua, 08 jul · 23h59'),
      findsOneWidget,
    );
  });

  testWidgets('mostra a pendência do uniforme do parceiro', (tester) async {
    await abrirTela(
      tester,
      tournament: torneio([dupla(uniformType: 'top_only')]),
      snap: snapshot(partnerPending: true),
    );

    expect(find.text('PENDENTE'), findsOneWidget);
  });
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd nexago_app && flutter test test/features/tournaments/registration_uniform_page_test.dart`
Expected: FAIL — `RegistrationUniformPage` não existe.

- [ ] **Step 3: Implementar**

Copie o bloco de estado do uniforme da tela única (`tournament_registration_page.dart:253-370`):
`_uniform`, `_uniformSaveState`, `_uniformSaver`, `_applyUniformDefaults`, `_hydrateUniform`,
`_onUniformChanged`, `_writeUniform`. Ele já resolve os dois problemas difíceis — hidratar uma
vez por inscrição e não gravar meia escolha — e **não** deve ser reescrito do zero.

Monte com a casca do wizard: o passo do uniforme (`compact: false`), a
`RegistrationWizardNotice` do prazo (`'Tamanho, número e nome podem ser alterados até
${tournamentRegistrationClosesLabel(closesAt)}. Depois disso a produção das camisas é
fechada.'`, só quando `registrationClosesAt != null`), a linha do uniforme do parceiro derivada
do snapshot, e a sticky bar `'Salvar e continuar'` habilitada só quando
`validateUniformSelection(category: category, selection: _uniform) == null`, empurrando para o
pagamento.

Registre o `GoRoute` de `AppRoutes.tournamentRegistrationUniform` (constante da Task 5), lendo
`categoryId` e `registrationId` dos query params.

**Não** acrescente o link "Ver tabela de medidas" do protótipo: não existe tabela de medidas para
linkar. Ver a spec.

- [ ] **Step 4: Rodar para ver passar**

Run: `cd nexago_app && flutter test test/features/tournaments/registration_uniform_page_test.dart`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/features/tournaments/presentation/registration_wizard/registration_uniform_page.dart nexago_app/lib/core/router/ nexago_app/test/features/tournaments/registration_uniform_page_test.dart
git commit -m "feat(inscrição): tela 5 do wizard — uniforme"
```

---

## Fase D — a virada

### Task 11: Re-skin do pagamento e da confirmação

As duas telas já existem e funcionam. Aqui só o visual entra na linguagem do wizard — e o
toggle Pix\|Cartão do protótipo **não** entra.

**Files:**
- Modify: `nexago_app/lib/features/tournaments/presentation/tournament_registration_payment_page.dart`
- Modify: `nexago_app/lib/features/tournaments/presentation/tournament_registration_success_page.dart`
- Test: `nexago_app/test/features/tournaments/tournament_registration_payment_step_test.dart`

**Interfaces:**
- Consumes: `RegistrationWizardScaffold`, `RegistrationWizardNotice` (Task 5).
- Produces: nada novo. As assinaturas das duas páginas ficam iguais.

- [ ] **Step 1: Escrever o teste que falha**

```dart
  testWidgets('pagamento não oferece cartão', (tester) async {
    await abrirPagamento(tester, tournament: torneio([dupla(entryFee: 220)]));

    expect(find.text('Cartão'), findsNothing);
    expect(find.text('Pix'), findsOneWidget);
  });

  testWidgets('pagamento avisa o relógio da vaga', (tester) async {
    await abrirPagamento(tester, tournament: torneio([dupla()]));

    expect(find.textContaining('a vaga volta pro geral'), findsOneWidget);
  });
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd nexago_app && flutter test test/features/tournaments/tournament_registration_payment_step_test.dart`
Expected: FAIL no segundo caso (o aviso do relógio ainda não está nesse texto). O primeiro caso
já passa — cartão nunca existiu, e o teste está aí para **impedir** que alguém o adicione ao
copiar o protótipo.

- [ ] **Step 3: Implementar**

Troque o `Scaffold` + `TournamentRegistrationHeader` das duas telas pela
`RegistrationWizardScaffold`, mantendo todo o resto do corpo. Na de pagamento, acrescente a
`RegistrationWizardNotice` com o texto do relógio:

```dart
            RegistrationWizardNotice(
              icon: Icons.notifications_active_outlined,
              child: Text(
                'A dupla fica reservada por $holdMinutes minutos a partir do '
                'aceite. Sem o pagamento nesse prazo, a inscrição é cancelada '
                'e a vaga volta pro geral.',
              ),
            ),
```

usando o prazo real que a tela já deriva de `holdExpiresAt` (`registrationHoldNotice`), não um
número fixo.

**Não adicione o toggle Pix\|Cartão.** Não existe integração de cartão; o botão levaria a lugar
nenhum. Ver a spec.

- [ ] **Step 4: Rodar para ver passar**

Run: `cd nexago_app && flutter test test/features/tournaments/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/features/tournaments/presentation/tournament_registration_payment_page.dart nexago_app/lib/features/tournaments/presentation/tournament_registration_success_page.dart nexago_app/test/
git commit -m "feat(inscrição): pagamento e confirmação na linguagem do wizard"
```

---

### Task 12: `/inscricao` vira o porteiro

O commit que liga tudo. Depois dele o app inscreve **pelo wizard**.

**Files:**
- Create: `nexago_app/lib/features/tournaments/presentation/registration_wizard/registration_gate_page.dart`
- Modify: `nexago_app/lib/core/router/app_router.dart:1240-1265`
- Test: `nexago_app/test/features/tournaments/registration_gate_page_test.dart`

**Interfaces:**
- Consumes: `resolveRegistrationStep`, `RegistrationStepInput`, `registrationStepFromParam`
  (Task 2); todas as telas das tasks 6 a 10.
- Produces: `RegistrationGatePage({required String tournamentId, String? categoryId, String? registrationId, String? inviteId, RegistrationWizardStep? requestedStep})`.

- [ ] **Step 1: Escrever o teste que falha**

```dart
  testWidgets('sem categoria na rota abre a categoria', (tester) async {
    await abrirPorteiro(tester, tournament: torneio([dupla(), dupla(id: 'fem')]));
    await tester.pumpAndSettle();

    expect(rotasAbertas, contains('categoria'));
  });

  testWidgets('convite recebido abre as condições', (tester) async {
    await abrirPorteiro(
      tester,
      tournament: torneio([dupla()]),
      categoryId: 'masc',
      convitesRecebidos: [convite()],
    );
    await tester.pumpAndSettle();

    expect(rotasAbertas, contains('condicoes'));
  });

  testWidgets('inscrição com parceiro pendente ignora step=payment', (tester) async {
    await abrirPorteiro(
      tester,
      tournament: torneio([dupla()]),
      categoryId: 'masc',
      registrations: const {
        'masc': UserCategoryRegistration(
          registrationId: 'reg-1',
          partnerPending: true,
          isPaid: false,
        ),
      },
      requestedStep: RegistrationWizardStep.pagamento,
    );
    await tester.pumpAndSettle();

    expect(rotasAbertas, contains('parceiro'));
    expect(rotasAbertas, isNot(contains('pagamento')));
  });

  testWidgets('inscrição só devendo pagamento abre o pagamento', (tester) async {
    await abrirPorteiro(
      tester,
      tournament: torneio([dupla()]),
      categoryId: 'masc',
      registrations: const {
        'masc': UserCategoryRegistration(
          registrationId: 'reg-1',
          partnerPending: false,
          isPaid: false,
        ),
      },
    );
    await tester.pumpAndSettle();

    expect(rotasAbertas, contains('pagamento'));
  });

  testWidgets('não decide enquanto as inscrições não resolveram', (tester) async {
    // Stream que nunca emite: o porteiro tem que esperar, não chutar.
    await abrirPorteiro(
      tester,
      tournament: torneio([dupla()]),
      categoryId: 'masc',
      registrationsStream: const Stream<Map<String, UserCategoryRegistration>>.empty(),
    );
    await tester.pump();

    expect(rotasAbertas, isEmpty);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });
```

O último caso é o que evita o bug antigo: decidir antes de o stream voltar fazia "retomar a
inscrição começada" perder para "primeira categoria livre".

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd nexago_app && flutter test test/features/tournaments/registration_gate_page_test.dart`
Expected: FAIL — `RegistrationGatePage` não existe.

- [ ] **Step 3: Implementar o porteiro**

```dart
/// Redirecionador de `/torneios/:tournamentId/inscricao`.
///
/// Não tem UI própria além do loader: lê torneio, inscrições e convites, chama
/// `resolveRegistrationStep` e substitui a si mesmo pela tela da etapa.
///
/// Espera os streams RESOLVEREM antes de decidir. Decidir no primeiro build,
/// com as inscrições ainda vazias, fazia "retomar o que já começou" perder
/// para "primeira categoria livre" — o beco sem saída da vaga solo pendente.
class RegistrationGatePage extends ConsumerStatefulWidget {
  const RegistrationGatePage({
    super.key,
    required this.tournamentId,
    this.categoryId,
    this.registrationId,
    this.inviteId,
    this.lgpdAccepted = false,
    this.requestedStep,
  });

  final String tournamentId;
  final String? categoryId;
  final String? registrationId;
  final String? inviteId;
  final bool lgpdAccepted;
  final RegistrationWizardStep? requestedStep;

  @override
  ConsumerState<RegistrationGatePage> createState() =>
      _RegistrationGatePageState();
}

class _RegistrationGatePageState extends ConsumerState<RegistrationGatePage> {
  /// Uma decisão só por entrada. Sem esta guarda, cada snapshot novo do
  /// Firestore reempurraria a rota por cima da tela que o atleta está usando.
  bool _navigated = false;

  /// Categoria a considerar, em ordem de prioridade: a da rota; a da inscrição
  /// indicada; a de um convite pendente; a única categoria do torneio.
  /// `null` = não dá para resolver, e o destino é a tela 1.
  String? _resolveCategoryId({
    required TournamentDetail tournament,
    required Map<String, UserCategoryRegistration> registrations,
    required List<TournamentPartnerInvite> pending,
  }) {
    final offers = tournament.categoryOffers;
    final wanted = widget.categoryId?.trim() ?? '';
    if (wanted.isNotEmpty && offers.any((c) => c.id == wanted)) return wanted;

    final regId = widget.registrationId?.trim() ?? '';
    if (regId.isNotEmpty) {
      for (final entry in registrations.entries) {
        if (entry.value.registrationId == regId) return entry.key;
      }
    }

    final inviteId = widget.inviteId?.trim() ?? '';
    for (final invite in pending) {
      if (invite.tournamentId != widget.tournamentId) continue;
      if (inviteId.isNotEmpty && invite.id != inviteId) continue;
      if (!offers.any((c) => c.id == invite.categoryId)) continue;
      return invite.categoryId;
    }

    if (offers.length == 1) return offers.first.id;
    return null;
  }

  void _go(RegistrationWizardStep step, String? categoryId, String? registrationId) {
    if (_navigated) return;
    _navigated = true;

    final params = <String, String>{
      if (categoryId != null && categoryId.isNotEmpty) 'categoryId': categoryId,
      if (registrationId != null && registrationId.isNotEmpty)
        'registrationId': registrationId,
      if (widget.lgpdAccepted) 'lgpd': '1',
    };

    final name = switch (step) {
      RegistrationWizardStep.categoria =>
        AppRouteNames.tournamentRegistrationCategory,
      RegistrationWizardStep.consentimento =>
        AppRouteNames.tournamentRegistrationConsent,
      RegistrationWizardStep.condicoes =>
        AppRouteNames.tournamentRegistrationTerms,
      RegistrationWizardStep.parceiro =>
        AppRouteNames.tournamentRegistrationPartner,
      RegistrationWizardStep.uniforme =>
        AppRouteNames.tournamentRegistrationUniform,
      RegistrationWizardStep.pagamento =>
        AppRouteNames.tournamentRegistrationPayment,
      RegistrationWizardStep.sucesso =>
        AppRouteNames.tournamentRegistrationDetail,
    };

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      context.pushReplacementNamed(
        name,
        pathParameters: {'tournamentId': widget.tournamentId},
        queryParameters: params,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final loader = Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: const Center(child: CircularProgressIndicator()),
    );

    final tournamentAsync =
        ref.watch(tournamentDetailProvider(widget.tournamentId));
    final registrationsAsync = ref.watch(
      tournamentUserRegistrationsByCategoryProvider(widget.tournamentId),
    );
    final invitesAsync = ref.watch(pendingTournamentPartnerInvitesProvider);

    // Enquanto QUALQUER um dos três não resolveu, o porteiro espera. Chutar
    // aqui é o bug antigo: sem as inscrições, "retomar" perde para "começar".
    final tournament = tournamentAsync.valueOrNull;
    if (tournament == null ||
        !registrationsAsync.hasValue ||
        !invitesAsync.hasValue) {
      return loader;
    }

    final registrations = registrationsAsync.value!;
    final pending = invitesAsync.value!;

    final categoryId = _resolveCategoryId(
      tournament: tournament,
      registrations: registrations,
      pending: pending,
    );
    if (categoryId == null) {
      _go(RegistrationWizardStep.categoria, null, null);
      return loader;
    }

    final category =
        tournament.categoryOffers.firstWhere((c) => c.id == categoryId);
    final registration = registrations[categoryId];
    final snap = registration != null
        ? ref
            .watch(
              tournamentRegistrationSnapshotProvider(
                registration.registrationId,
              ),
            )
            .valueOrNull
        : null;

    final myUid = ref.watch(authServiceProvider).currentUser?.uid ?? '';
    final uniformRequired = categoryRequiresUniform(category);

    final step = resolveRegistrationStep(
      RegistrationStepInput(
        categoryResolved: true,
        hasReceivedInvite: receivedInviteForCategory(
              pending: pending,
              tournamentId: widget.tournamentId,
              categoryId: categoryId,
            ) !=
            null,
        hasRegistration: registration != null,
        // Inscrição existente já teve o aceite carimbado pela callable.
        lgpdAccepted: widget.lgpdAccepted || registration != null,
        partnerPending: registration?.partnerPending ?? false,
        uniformRequired: uniformRequired,
        uniformComplete: !uniformRequired ||
            (snap != null &&
                isUniformSelectionComplete(
                  category: category,
                  selection: uniformSlotFor(
                    uid: myUid,
                    teamSize: category.teamSize,
                    uniformByUid: snap.uniformByUid,
                    player1Id: snap.player1Id,
                    participantUids: snap.participantUids,
                  ),
                )),
        isPaid: registration?.isPaid ?? false,
        requestedStep: widget.requestedStep,
      ),
    );

    _go(step, categoryId, registration?.registrationId);
    return loader;
  }
}
```

> Confira as assinaturas reais de `uniformSlotFor` e `isUniformSelectionComplete` com
> `grep -n "uniformSlotFor\|isUniformSelectionComplete" nexago_app/lib/features/tournaments/domain/tournament_uniform_selection.dart`
> e ajuste os argumentos nomeados — o snapshot pode expor os uniformes com nomes diferentes de
> `MyTournamentRegistration`.

- [ ] **Step 4: Trocar o builder da rota**

Em `app_router.dart`, a rota `AppRoutes.tournamentRegistration` passa a construir
`RegistrationGatePage` em vez de `TournamentRegistrationPage`. Faça o mesmo no fallback da rota
de pagamento (linha ~1277), que hoje devolve `TournamentRegistrationPage` quando falta
`registrationId`.

- [ ] **Step 5: Rodar a suíte inteira**

Run: `cd nexago_app && flutter test`
Expected: PASS. `tournament_registration_page_test.dart` **ainda passa** — a tela única existe
até a Task 13.

- [ ] **Step 6: Verificar as entradas de verdade no app**

Rode o app e percorra, uma a uma: notificação de convite, "Continuar inscrição" na Home, aba
"Minha inscrição", card de categoria no detalhe do torneio, link externo de convite, e uma
inscrição solo pendente. Cada uma tem que cair na etapa certa.

- [ ] **Step 7: Commit**

```bash
git add nexago_app/lib/features/tournaments/presentation/registration_wizard/registration_gate_page.dart nexago_app/lib/core/router/app_router.dart nexago_app/test/features/tournaments/registration_gate_page_test.dart
git commit -m "feat(inscrição): /inscricao vira o porteiro do wizard"
```

---

### Task 13: Aposentar a tela única

Só depois da Task 12 verificada no app rodando. **Se a Task 12 não foi validada à mão, pare
aqui.**

**Files:**
- Delete: `nexago_app/lib/features/tournaments/presentation/tournament_registration_page.dart`
- Delete: `nexago_app/lib/features/tournaments/presentation/widgets/tournament_registration/registration_shell_card.dart`
- Delete: `.../registration_shell_category_card.dart`
- Delete: `.../registration_shell_summary_card.dart`
- Delete: `nexago_app/test/features/tournaments/tournament_registration_page_test.dart`
- Delete: `nexago_app/test/features/tournaments/registration_shell_widgets_test.dart`
- Modify: `nexago_app/lib/features/tournaments/domain/registration_shell_logic.dart` (só o comentário do topo)

**Interfaces:**
- Consumes: o wizard inteiro, de pé.
- Produces: nada. É remoção.

- [ ] **Step 1: Confirmar que ninguém mais importa a tela única**

Run: `cd nexago_app && grep -rn "TournamentRegistrationPage\|RegistrationShellCard\|RegistrationShellCategoryCard\|RegistrationShellSummaryCard" lib test`
Expected: nenhuma ocorrência fora dos próprios arquivos a apagar. Se aparecer alguma, resolva
antes de apagar.

- [ ] **Step 2: Apagar**

```bash
cd nexago_app
rm lib/features/tournaments/presentation/tournament_registration_page.dart
rm lib/features/tournaments/presentation/widgets/tournament_registration/registration_shell_card.dart
rm lib/features/tournaments/presentation/widgets/tournament_registration/registration_shell_category_card.dart
rm lib/features/tournaments/presentation/widgets/tournament_registration/registration_shell_summary_card.dart
rm test/features/tournaments/tournament_registration_page_test.dart
rm test/features/tournaments/registration_shell_widgets_test.dart
```

`registration_shell_logic.dart` **fica**: `registrationCategoryStatus` é usado pela tela 1. Só
troque o comentário do topo, que hoje fala em espelhar o shell do portal do atleta:

```dart
/// Estado de uma categoria no passo 1 do wizard de inscrição.
///
/// Nasceu como porte fiel de `categoryStatusOf` do shell do portal do atleta.
/// **A paridade com a web está quebrada de propósito** desde que o app virou
/// passo a passo (2026-09-01) e o portal seguiu em tela única — não "restaure"
/// a paridade sem decisão nova. A ordem das checagens continua sendo contrato:
/// já inscrito > encerrada > lotada > elegibilidade.
```

- [ ] **Step 3: Rodar a suíte inteira**

Run: `cd nexago_app && flutter test`
Expected: PASS

- [ ] **Step 4: Analisar o projeto**

Run: `cd nexago_app && flutter analyze`
Expected: sem erro novo. Imports órfãos dos arquivos apagados aparecem aqui.

- [ ] **Step 5: Commit**

```bash
git add -A nexago_app/
git commit -m "refactor(inscrição): aposenta a tela única

O wizard é o único caminho de inscrição do app. registration_shell_logic
fica (a tela 1 usa), com o comentário atualizado: a paridade com o portal
web está quebrada de propósito."
```

---

## Depois deste plano

Dois trabalhos que a spec registra e este plano **não** faz:

1. **Filtro de gênero no servidor** — campo `genderTag` normalizado no espelho
   `publicProfiles`, índice composto, backfill e sentinela para quem não declarou. Derruba a
   busca de 60 para ~40 documentos em todas as telas de busca de atleta.
2. **Índice de duplas por Cloud Function** — mata a varredura de `inscriptions` nos dois
   chamadores restantes de `RecentPartnersRepository` (substituição de parceiro e perfil
   público) e permitiria "últimas duplas" voltar barata.
