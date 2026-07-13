# Plano de evolução & Lesões (mock) — Portal do Treinador — design

## Contexto

Segunda rodada de implementação das telas restantes do protótipo Claude Design (`NexaGO Treinador - Telas.html`, projeto `nexago`, id `2936d12d-662f-4ad7-a36d-0760b0b95a86`) — ver [[coach-portal-mvp]] pro histórico completo (MVP de 19 tarefas + rodada "Comparar atletas" já mergeados). Esta rodada cobre o restante do grupo "Avaliação & evolução" do protótipo: **Plano de evolução**, **Novo objetivo**, **Lesões** e **Registro de lesão** — as outras duas telas do grupo (Avaliações — listagem e Avaliações dos atletas) já foram implementadas no MVP original.

Diferente da rodada anterior (Comparar atletas, 100% dado real), o dono do produto pediu explicitamente **só as telas mockadas por enquanto** — UI estática com dado de exemplo, sem Firestore, sem persistência, mesmo padrão que o projeto `arena` usou no início (ver `docs/superpowers/specs/2026-07-09-arena-painel-web-design.md`). Motivo: nenhuma das duas automações que o protótipo sugere tem uma resposta óbvia ainda —
- **Progresso do objetivo (%)**: o protótipo mostra uma porcentagem por objetivo (65%, 40%, 90%) sem nenhuma fórmula ou meta numérica visível por trás. Decisão tomada em brainstorming: quando isso virar dado real, vai ser **o treinador ajustando manualmente**, não uma derivação automática da nota do fundamento — mas essa decisão só importa quando a persistência for implementada, não nesta rodada.
- **Sincronização lesão↔status do atleta**: descartada por ora — a pergunta nem chegou a ser respondida porque o usuário decidiu ir pro mock primeiro. Fica em aberto pra quando (se) esta feature ganhar dado real.

Portanto **esta rodada não mexe em Firestore, rules, ou Cloud Functions** — é puramente `frontend/projects/coach`.

## Decisões

- **4 telas, sem service, sem persistência.** Cada componente carrega seu próprio array de dado de exemplo hardcoded (mesmo espírito do `TR_ATHLETES`/`TR_INJURIES` do protótipo) — não há leitura nem escrita no Firestore. Botões de "salvar" (`Criar objetivo`, `Salvar registro`) apenas navegam de volta pra tela de listagem correspondente; não persistem nada.
- **Plano de evolução mantém o atleta fixo do protótipo ("Ana Beatriz").** Decisão em brainstorming: como a tela inteira é mock, não vale a pena plugar o atleta selecionado na tela Atletas — mantém o texto exatamente como o protótipo mostra.
- **Lesões ganha item próprio na sidebar** (depois de "Histórico"), diferente de Comparar atletas (que foi só um botão dentro de Atletas) — porque Lesões é uma tela de primeiro nível sobre o time todo (mesmo escopo de Avaliações/Convocações), não uma ação secundária de outra tela.
- **Plano de evolução é acessado por um botão na tela Atletas** (cabeçalho, ao lado de "Comparar atletas"), já que — como nas telas do protótipo — o conceito é "ver o plano de um atleta", mesmo que nesta rodada mockada o atleta mostrado seja sempre o mesmo.
- **Novo ícone `medical`** em `icon.component.ts` (cruz dentro de um quadrado arredondado, 24×24, mesmo stroke width 1.8–1.9 dos demais) — nenhum ícone existente representa saúde/lesão; `plus` já é usado para ações de "adicionar".
- **Formulários usam os componentes de form reativos já existentes** (`co-form-field`, `co-form-select`, `co-form-textarea`) para manter a fidelidade visual e a interatividade do protótipo (o treinador pode digitar/mudar valores), mesmo sem persistir — só o clique em "salvar" não grava nada, apenas navega.
- **O painel lateral "Novo registro" da tela Lesões replica a ficha da 1ª lesão da lista** (mesmos valores: "Entorse de tornozelo grau I", "01/07/2026", "13/07/2026", "Dr. Felipe Aguiar"), reproduzindo o protótipo tal como ele é — o rótulo "Novo registro" do protótipo é, na prática, uma prévia estática dos dados de uma ficha (não um formulário funcional); a criação de verdade é a tela separada "Registro de lesão". Não corrigido aqui porque a tela é mock e o objetivo é fidelidade ao protótipo, não redesenho.

## Telas

### Plano de evolução (`painel/atletas/plano-evolucao`)
- `co-page-header` título "Plano de evolução", subtítulo "Ana Beatriz · 3 objetivos ativos", ação "Novo objetivo" (routerLink pra tela seguinte).
- Grid de 3 `co-panel-card` (um por objetivo), cada um com: título, pill de progresso (tom verde ≥80%, laranja caso contrário — mesmo critério do protótipo `TrGoalCard`), `co-progress-bar`, prazo, texto de observação.
- Dado de exemplo (idêntico ao protótipo): "Melhorar saque" 65% prazo 15/08/2026; "Aumentar impulsão" 40% prazo 01/09/2026; "Melhorar recepção" 90% prazo 30/07/2026.

### Novo objetivo (`painel/atletas/plano-evolucao/novo`)
- `co-page-header` título "Novo objetivo", subtítulo "Ana Beatriz · Plano de evolução", ação "Criar objetivo" (só navega de volta pra `painel/atletas/plano-evolucao`).
- `co-panel-card` "Detalhes do objetivo": `co-form-field` (Título, wide), `co-form-select` (Fundamento relacionado: Saque/Recepção/Ataque/Bloqueio/Físico), `co-form-field` (Prazo), `co-form-textarea` (Observações).
- `co-panel-card` lateral "Objetivos ativos": 2 `co-row` estáticos (Aumentar impulsão 40%, Melhorar recepção 90%).

### Lesões (`painel/lesoes`, novo item de sidebar)
- `co-page-header` título "Lesões", subtítulo "3 registros ativos", ação "Registrar lesão" (routerLink pra tela seguinte).
- `co-panel-card` "Registros": 3 `co-row` com `co-athlete-avatar` (status `lesionado`), título "Nome · Tipo", sub "Desde DD/MM · Previsão: X", `co-pill` de status (tom amarelo=Recuperação, verde=Liberado, vermelho=Restrição) — dado de exemplo: Lucas Ramos/Entorse de tornozelo/recuperação, Pedro Silva/Tendinite no ombro/restrição, Rafael Nunes/Lombalgia/liberado (mesmos atletas de exemplo do protótipo `TR_ATHLETES`/`TR_INJURIES`).
- `co-panel-card` lateral "Novo registro" (ficha estática, ver Decisões acima).

### Registro de lesão (`painel/lesoes/novo`)
- `co-page-header` título "Registrar lesão", subtítulo "Nova ficha de lesão", ação "Salvar registro" (só navega de volta pra `painel/lesoes`).
- `co-panel-card` "Dados da lesão": `co-form-field` (Atleta, valor fixo "Lucas Ramos"; Tipo de lesão; Data da ocorrência; Previsão de retorno; Médico responsável), `co-form-select` (Status: Recuperação/Liberado/Restrição), `co-form-textarea` (Observações).
- `co-panel-card` lateral "Histórico de lesões": 2 `co-row` estáticos (Tendinite no joelho — Resolvida, Contusão no antebraço — Resolvida).

## Arquitetura de arquivos

```
painel/evolucao/
  panel-plano-evolucao.component.ts   (novo)
  panel-novo-objetivo.component.ts    (novo)
painel/lesoes/
  panel-lesoes.component.ts           (novo)
  panel-registro-lesao.component.ts   (novo)
painel/ui/
  icon.component.ts                   (alterado — novo case 'medical')
  panel-shell.component.ts            (alterado — novo item de NAV_ITEMS)
painel/atletas/
  panel-atletas.component.ts          (alterado — botão "Plano de evolução" no cabeçalho)
app.routes.ts                         (alterado — 4 rotas novas)
```

Nenhum arquivo de serviço (`*.service.ts`) é criado nesta rodada — não há dado real pra buscar ou persistir.

## Fora de escopo desta entrega

Qualquer persistência real (Firestore, rules, Cloud Functions) para objetivos ou lesões; sincronização automática entre status do atleta e registro de lesão; derivação automática do progresso do objetivo a partir da nota do fundamento; extensão da tela Histórico pra incluir eventos de lesão (o protótipo já prevê o tom `lesao` em `TrHistItem`, mas isso depende de dado real de lesão existir primeiro); as ~19 telas restantes do protótipo fora deste grupo (competição, financeiro, comunicação, permissões, Inteligência NexaGO) — ficam para rodadas futuras.

## Testes

Nenhuma lógica de negócio nova (sem funções puras, sem services) — nada a cobrir com spec unitário. Verificação é `ng build coach` + revisão do código + walkthrough manual no navegador, mesmo padrão de toda tela puramente visual deste projeto.
