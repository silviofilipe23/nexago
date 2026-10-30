# Agente Nexa (assistente com IA para atletas, organizadores, arenas e CTs)

Um chat dentro do nexaGO que responde **como o app funciona** ("como cancelo minha inscrição?",
"o que é categoria até B?") e **o que está acontecendo na minha conta** ("quantas duplas faltam
pagar na etapa de sábado?", "qual horário fica mais vazio na minha arena?").

Não é um RAG clássico com busca vetorial. São duas peças:

1. **Pacote de conhecimento** curado (Central de ajuda + regras de negócio reescritas para o
   usuário), inteiro no prompt de sistema e em cache. Hoje o material relevante tem uns 54 mil
   palavras (`docs/business-rules/`, `docs/product/`, glossário, `appConfig/appGuide`), o que
   cabe com folga; separado por persona, cada pacote fica bem menor.
2. **Ferramentas somente leitura**, escolhidas pelo papel de quem pergunta, que consultam o
   Firestore com o `uid` do Auth e devolvem números **já agregados**. O modelo explica e compara;
   quem calcula é o código.

## Problema

Hoje a dúvida do atleta vira mensagem no WhatsApp do organizador ou da arena, e o gestor que quer
saber "como foi o mês" precisa abrir várias telas e fazer a conta de cabeça. A Central de ajuda cobre o "como usar", mas só para quem acha o guia certo; ela não responde nada sobre
a situação de cada um. O custo de não resolver é suporte manual para organizadores e arenas, que
são justamente os clientes pagantes, e insights que ficam escondidos nos dados.

## Decisões

| Tema | Decisão |
|---|---|
| Nome na UI | **Nexa**. Trocar é só string. |
| Onde aparece (v1) | App Flutter: card no topo da Central de ajuda + item no menu Conta. Portais web na fase 2. |
| Persona da conversa | Cada conversa tem **uma** persona fixa (`athlete`, `organizer`, `arena`, `coach`), a do modo em que a pessoa está no app. Quem tem vários papéis troca de modo e abre outra conversa. Isso mantém o conjunto de ferramentas e o cache estáveis (ver "Cache"). |
| Escrita | **Nenhuma ferramenta escreve na v1.** O Nexa não cancela, não inscreve, não reserva. Quando a resposta pede uma ação, ele indica a tela (P1: botão de atalho). |
| Modelo | `claude-opus-5-5` com `effort: "low"`. O Haiku 5.5 sai mais de 20x mais barato por pergunta; a troca é decisão do dono, com base no conjunto de avaliação (ver "Custo"). O modelo fica em `appConfig/assistant.model`, sem precisar de deploy para trocar. |
| Fonte da verdade dos números | Todo número na resposta vem de um resultado de ferramenta ou do pacote. O prompt proíbe estimar e a avaliação confere. |
| Dados de terceiros | As ferramentas nunca devolvem telefone, e-mail, CPF nem nascimento de outra pessoa. Nome de atleta só onde ele já é público (ranking; equipes inscritas quando o torneio as exibe). |
| Texto do Firestore | Nome de equipe, descrição de torneio e afins entram como **dado**, delimitados no resultado da ferramenta. O prompt de sistema diz que instruções dentro deles não valem. |
| Limite de uso | 30 perguntas/dia por uid (`appConfig/assistant.dailyLimit`). Ao bater o limite: "Você chegou ao limite de hoje, volta amanhã." |
| Desligar | `appConfig/assistant.enabled` + `rolesEnabled[]`, valendo ao vivo. Com a flag desligada, o card some do app. |
| Histórico | Guardado 90 dias (varredura diária). Atleta vê e apaga as próprias conversas. |
| Streaming | v1 devolve a resposta inteira, com indicador de "digitando". Streaming fica em P1 (ver perguntas abertas). |
| Formato da resposta | Texto puro com parágrafos curtos e listas com "•". O app não renderiza Markdown hoje e não vale trazer um pacote para isso. |
| Região | `CLIENT_FACING_REGIONS`, como as demais callables do app. |

## Metas

1. **Adoção:** 10% dos atletas ativos no mês fazem pelo menos 1 pergunta em 30 dias (meta
   ambiciosa: 20%).
2. **Qualidade:** ≥ 75% de 👍 nas respostas avaliadas, e ≥ 90% de acerto no conjunto de
   avaliação antes de cada release.
3. **Resposta sem saída:** < 15% das perguntas terminam em "não sei / não tenho esse dado".
4. **Organizador/arena:** 30% dos organizadores com torneio aberto usam o Nexa pelo menos uma vez
   por semana durante as inscrições (fase 2).
5. **Custo:** custo médio por pergunta medido e dentro do teto definido pelo dono (ver "Custo").

## Fora do escopo (v1)

- **Ações** (cancelar, inscrever, reservar, sacar). O risco de erro é alto e já existem telas
  boas para isso. Pode virar v2 com confirmação explícita na UI.
- **Busca vetorial / embeddings.** O pacote cabe no prompt. Só entra quando houver conteúdo que
  cresce sem limite, como regulamentos enviados por organizadores (P2).
- **Atendimento humano / transbordo** para o suporte nexaGO. É outra iniciativa.
- **Voz e imagem** (mandar print, foto do placar). Por enquanto não há demanda.
- **Backoffice/admin.** O backoffice já tem consultas próprias, e o admin não é público-alvo.

## Histórias de usuário

**Atleta**
- Como atleta, quero perguntar como funciona uma regra (substituição de parceiro, cancelamento,
  modo chuva) e receber a resposta da regra do nexaGO, não um palpite.
- Como atleta, quero saber a situação das minhas inscrições ("minha dupla já pagou?", "falta
  quanto?") sem procurar tela por tela.
- Como atleta, quero que ele me sugira torneios abertos perto de mim, no meu nível e esporte.
- Como atleta, quero entender meu nível e minha posição no ranking e o que falta para subir.
- Como atleta sem nenhuma inscrição, quero uma resposta útil ("você ainda não tem inscrições;
  os torneios abertos em Goiânia são…") e não um erro.

**Organizador**
- Como organizador, quero o resumo das inscrições por categoria (vagas, pagas, pendentes, solo
  esperando dupla) para decidir se abro vaga extra ou adio o fechamento.
- Como organizador, quero comparar esta etapa com a anterior da liga.
- Como gestor convidado de um torneio, quero ver só os torneios em que sou gestor ativo.

**Arena**
- Como dono de arena, quero ver ocupação por dia da semana e por horário para montar promoção nos
  horários vazios.
- Como recepção, quero perguntar a agenda de hoje, **sem** ver o financeiro (o cargo não tem
  leitura na área `financeiro`).

**CT / professor**
- Como professor, quero saber quais alunos estão com frequência caindo e quais cobranças estão
  em aberto.

## Requisitos

### P0: sem isso não lança

**R1. Callable `askNexa`**
- Entrada: `{threadId?: string, persona: 'athlete'|'organizer'|'arena'|'coach', message: string}`
  (mensagem de até 1.000 caracteres).
- Saída: `{threadId, messageId, answer: string, usedTools: string[]}`.
- Exige Auth. A `persona` precisa ser compatível com os papéis do token (`rolesFromClaims`); se não
  for, `permission-denied`. Thread existente precisa ser do mesmo uid e da mesma persona.
- Limite diário checado e incrementado numa transação antes de chamar o modelo.
- Erros chegam ao app via `friendlyErrorMessage`, nunca crus.
- Critério de aceite: atleta sem papel `arena` que manda `persona: 'arena'` recebe
  `permission-denied` e não gasta cota.

**R2. Pacote de conhecimento**
- Arquivos em `functions/knowledge/{comum,atleta,organizador,arena,ct}.md`, versionados no repo e
  revisados por gente. **Não é cópia de `docs/`**: as regras de negócio têm detalhe interno (taxas
  internas, nomes de script, decisões de implementação) que não vai para o usuário.
- Script `functions/scripts/build-knowledge-pack.js` junta os guias publicados de
  `appConfig/appGuide` (que mudam pelo backoffice) com os `.md` curados e grava
  `functions/knowledge/dist/{persona}.md`. O deploy leva o `dist`.
- Cada trecho tem um id estável (`[guia:cancelar-inscricao]`) para a resposta citar a fonte (P1:
  link para `/athlete/ajuda/:topicId`).
- Critério de aceite: o pacote de cada persona tem menos de 60 mil tokens (medido com
  `count_tokens`), e nenhum arquivo do `dist` contém nome de script, nome de coleção ou id de
  documento.

**R3. Ferramentas por persona (somente leitura)**

Toda ferramenta recebe `uid` do servidor, **nunca** do modelo, e reaproveita o guarda de acesso que
já existe. Os parâmetros que o modelo escolhe (torneio, arena, período) são validados contra o que o
uid pode ver. Os resultados vêm agregados, com no máximo 50 linhas e período de até 366 dias.

| Persona | Ferramenta | O que devolve | Guarda |
|---|---|---|---|
| atleta | `minhas_inscricoes` | Inscrições do uid: torneio, categoria, parceiro (nome público), pago/pendente, prazo da vaga | uid no time da inscrição |
| atleta | `torneios_abertos` | Torneios com inscrição aberta por cidade/esporte/nível; **não** lista torneio "por link" | só `listingStatus: open` público |
| atleta | `meu_nivel_e_ranking` | Nível por esporte (`levelsBySport`), pontos, posição, distância para o próximo nível | uid |
| atleta | `minhas_reservas_e_aulas` | Próximas reservas e aulas, créditos de chuva | uid participante |
| organizador | `meus_torneios` | Torneios em que é dono ou gestor ativo | `listAccessibleOrganizerIds` / espelho `tournamentStaff` |
| organizador | `resumo_inscricoes` | Por categoria: vagas, pagas, pendentes, solo aguardando dupla, cancelamentos | torneio ∈ `meus_torneios` |
| organizador | `resumo_financeiro_torneio` | Arrecadado, taxas, a receber, por forma de pagamento | dono ou gestor com acesso à carteira (`assertCanAccessOrganizerWallet`) |
| arena | `minhas_arenas` | Arenas em que é dono ou equipe ativa, com o cargo | `managerUserId` / `arenas/{id}/staff/{uid}` |
| arena | `ocupacao_por_horario` | Ocupação % por dia da semana × faixa de hora, por quadra | `assertArenaAreaAccess(…, 'agenda', 'read')` |
| arena | `faturamento_periodo` | Receita por origem (reserva, aula, comanda, loja), comparada com o período anterior | `assertArenaAreaAccess(…, 'financeiro', 'read')` |
| arena | `resumo_aulas` | Turmas, alunos ativos, ocupação das turmas | área da arena equivalente (definir no plano) |
| coach | `agenda_da_semana` | Aulas/treinos da semana | professor/CT vinculado |
| coach | `alunos_frequencia` | Alunos com frequência caindo (últimas 4 semanas vs 4 anteriores) | guarda do CT (`training-center-*`) |
| coach | `cobrancas_em_aberto` | Cobranças vencidas/a vencer | idem |

- Ferramenta negada devolve `tool_result` com `is_error: true` e uma frase ("sem acesso a esta
  área"), e o modelo explica. Não vira exceção para o app.
- Critério de aceite: a recepção pergunta "quanto faturamos em outubro?" e a resposta diz que o
  cargo não tem acesso ao financeiro, sem número nenhum.

**R4. Prompt de sistema**
- Persona e tom (português, direto, sem jargão técnico), o que pode e o que não pode fazer
  ("não executo ações; indico a tela"), regra dos números ("só cite números vindos das
  ferramentas ou do guia"), regra dos dados de terceiros e regra do texto do Firestore como dado.
- Pergunta fora do domínio (dever de casa, política, outro app): recusa curta e volta ao nexaGO.
- Texto fixo (sem data/hora nem uid) para não quebrar o cache. A data de hoje vai na mensagem do
  usuário.

**R5. Persistência**
- `assistantThreads/{threadId}`: `{uid, persona, title, createdAt, updatedAt, messageCount}`.
- `assistantThreads/{threadId}/messages/{id}`: `{role, text, usedTools, usage: {input, output,
  cacheRead, cacheWrite}, model, feedback?: 'up'|'down', createdAt}`.
- O histórico **completo** da API (blocos de ferramenta, thinking) fica em
  `assistantThreads/{threadId}/state/apiHistory`, só servidor, para manter a conversa append-only
  (exigência do modelo para pensamento preservado).
- Rules: o dono lê as próprias threads e mensagens e grava só `feedback`; o resto é escrito só
  pela callable.
- Varredura diária apaga threads com `updatedAt` > 90 dias.

**R6. Tela no app** (`nexago_app/lib/features/assistant/`, em
presentation/application/domain/infrastructure)
- Lista de conversas, tela de chat, sugestões de pergunta por persona no estado vazio,
  👍/👎 por resposta, esqueleto enquanto carrega, erro via `friendlyErrorMessage`.
- Aviso fixo discreto: "O Nexa pode errar. Confira na tela antes de decidir."

**R7. Conjunto de avaliação**
- `functions/test/assistant-eval/{persona}.json`: 15 perguntas por persona (60 no total), cada uma
  com o cenário de dados (seed do emulador) e os critérios do que a resposta precisa conter e
  **não** pode conter.
- Script que roda o conjunto contra o emulador e dá nota. Roda **à mão** antes de cada release do
  Nexa, porque cada execução custa dinheiro de API.
- Inclui casos de ataque: injeção no nome da equipe, pedido de dados de outro atleta, persona
  trocada, pergunta fora do domínio.

**R8. Observabilidade**
- Log estruturado por pergunta: persona, ferramentas usadas, tokens (incluindo
  `cache_read_input_tokens`), latência, `stop_reason`. **Sem o texto da pergunta** no log; o texto
  fica só na thread do usuário.
- Painel simples no backoffice: perguntas/dia, custo/dia, % 👍 (P1; na v1 vale consulta por script).

### P1: logo depois

- **Streaming** da resposta (callable com streaming, se o `cloud_functions` do app suportar).
- **Atalhos de ação:** a ferramenta devolve `routes[]` permitidas (ex.: tela da inscrição) e o app
  mostra botões. O modelo não inventa rota: só repete uma que veio da ferramenta.
- **Citação da fonte** com link para o guia da Central de ajuda.
- **Portal do organizador e portal da arena** (Angular) com a mesma callable.
- Comparação entre etapas da liga (`comparar_etapas`).
- Painel de uso e custo no backoffice.

### P2: futuro (a arquitetura não pode impedir)

- **Ações com confirmação** (o modelo propõe, a UI mostra um cartão "Confirmar", a callable de
  sempre executa).
- **Busca vetorial** para conteúdo dos usuários (regulamento do torneio, regras da arena):
  Firestore Vector Search + serviço de embeddings, exposta como mais uma ferramenta
  (`buscar_regulamento`). Por isso o conhecimento dinâmico já nasce como ferramenta.
- Nexa como benefício de plano (arena/organizador): o `dailyLimit` por plano já cobre.
- Resumo proativo semanal ("sua arena esta semana") por push.

## Arquitetura

```
App (features/assistant)
  └─ askNexa (onCall, CLIENT_FACING_REGIONS, secret ANTHROPIC_API_KEY)
       1. Auth → papéis → valida persona → cota (transação)
       2. carrega apiHistory da thread
       3. tool runner do SDK (@anthropic-ai/sdk):
            tools  = ferramentas da persona (ordem fixa)
            system = prompt fixo + pacote da persona   ← cache_control 1h
            messages = histórico + "Hoje é 30/10/2026. <pergunta>"
       4. grava mensagem + usage, devolve texto
```

Código em `functions/src/assistant/`: `ask-nexa.ts` (callable), `nexa-tools/{athlete,organizer,
arena,coach}.ts` (cada ferramenta é uma função pura sobre o `db`, testável com o `FakeFirestore`
como as outras), `nexa-knowledge.ts`, `nexa-quota.ts`.

**Cache.** A ordem renderizada é ferramentas → sistema → mensagens; qualquer mudança no começo
invalida o resto. Com ferramentas e pacote fixos por persona, o cache tem no máximo 4 variantes,
reaproveitadas por todo mundo daquela persona. O TTL de 1h se renova a cada leitura, então com
tráfego contínuo a escrita (mais cara) é rara. `usage.cache_read_input_tokens` igual a zero em
perguntas seguidas = algo no prefixo está variando, e isso é bug.

**Recusas do modelo.** Conferir `stop_reason` antes de ler o conteúdo. `refusal` vira uma frase
amigável. Usar o parâmetro de fallback do servidor (`fallbacks: "default"`) para que uma recusa
falsa seja refeita automaticamente.

## Custo (estimativa para o dono decidir)

Por pergunta típica: pacote de ~40 mil tokens lido do cache **duas vezes** (a chamada de
ferramenta é uma ida e volta), ~3 mil tokens novos (pergunta + resultado da ferramenta) e ~1.500
tokens de saída somando raciocínio e resposta:

| Modelo | Custo aproximado por pergunta | 1.000 perguntas/dia, por mês |
|---|---|---|
| Opus 5.5, effort low | US$ 0,03–0,06 | US$ 900–1.800 |
| Haiku 5.5 | ~US$ 0,002 | ~US$ 60 |

Os números são estimativas pelos preços de tabela e serão medidos na fase 1. A recomendação é
rodar o conjunto de avaliação nos dois. Se o Haiku acertar o mesmo nas perguntas de atleta (a
maioria é FAQ + 1 ferramenta), usar Haiku para atleta e Opus para organizador e arena, onde a
pergunta de insight é mais difícil.

## Métricas

**Indicadores rápidos (1–2 semanas):** % de quem abre o Nexa e envia pergunta; perguntas por
usuário; % 👍/👎; % de "não sei"; latência p50/p95 (meta p95 < 8 s sem streaming); custo por
pergunta; taxa de acerto do cache.

**Indicadores lentos (1–3 meses):** mensagens de suporte recebidas pelo nexaGO; retorno de
organizadores e arenas nas conversas comerciais; retenção de quem usou contra quem não usou
(com cuidado: quem usa já tende a ser mais engajado).

Medição: eventos de analytics no app (`assistant_open`, `assistant_ask`, `assistant_feedback`) +
log da callable.

## Perguntas em aberto

| # | Pergunta | Quem responde | Bloqueia? |
|---|---|---|---|
| 1 | Política de privacidade/termos: incluir o envio de dados da conta para um processador de IA (Anthropic) e o propósito. Basta aviso, ou precisa de aceite na primeira vez? | Jurídico/dono | **Sim**, antes de abrir para usuários reais |
| 2 | Teto de custo mensal e o modelo por persona (ver "Custo"). | Dono | Não (começa no DEV) |
| 3 | O Nexa é para todos ou vira benefício de plano para arena/organizador? | Dono/produto | Não |
| 4 | O `cloud_functions ^5.2.0` do app suporta callable com streaming, ou precisa subir a versão? | Engenharia | Não (P1) |
| 5 | Usar App Check na callable para reduzir abuso fora do app? | Engenharia | Não |
| 6 | Qual guarda exato da área de aulas da arena e do CT usar em `resumo_aulas` e nas ferramentas de coach. | Engenharia (no plano) | Não |
| 7 | Nome "Nexa": conflita com alguma marca ou com o NexaSquad? | Dono | Não |

## Fases

1. **Fase 1, atleta no app (DEV):** callable, pacote comum + atleta, 4 ferramentas de atleta, tela,
   avaliação de atleta, cota, kill switch. Release interno, medir custo real e qualidade.
2. **Fase 2, organizador:** ferramentas de organizador, pacote, tela no portal do organizador
   (onde ele já trabalha) e no app.
3. **Fase 3, arena:** ocupação e faturamento, respeitando a matriz de cargos. É a fase mais
   valiosa e a que mais exige teste de autorização.
4. **Fase 4, CT/professor.**
5. **Depois:** streaming, atalhos de ação, busca vetorial de regulamentos, ações com confirmação.

Cada fase é um PR (ou uma pilha pequena) e só começa com a avaliação da anterior verde.
