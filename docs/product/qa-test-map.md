# NexaGO — Mapa de Teste (QA) — App Flutter

> Checklist de teste manual para validação do app Flutter (`nexago_app/`) antes do lançamento, organizado pelos três papéis do produto: **Atleta**, **Organizador** e **Gestor de Arena**. Não cobre o site web nem o backoffice.
>
> Gerado por análise de código em 08/07/2026, a partir do levantamento de funcionalidades em [`docs/product/features-by-role.md`](./features-by-role.md), com verificação adicional direto no código-fonte atual (o levantamento original tinha alguns pontos desatualizados — ver seção "Achados" ao final).

## Como usar este documento

- Cada caso de teste tem um ID único (ex. `AT-AUTH-01`) para referência em bugs/relatórios.
- `[ ]` é uma checkbox — marque ao validar. Pode ser usado direto no editor ou copiado para uma planilha/ferramenta de QA.
- Itens marcados **"Não testar (não implementado)"** ao final de cada subseção são funcionalidades placeholder — não abra bug se o botão só mostrar "em breve" ou não fizer nada; isso é esperado hoje.
- Casos marcados com "*(validar com produto)*", "*(gap identificado)*" ou "*(discrepância de código)*" são pontos que os agentes de pesquisa encontraram no código atual e que merecem atenção extra — não são necessariamente bugs, mas comportamentos que vale confirmar com o time antes de reportar.
- Prefixos de ID por área — **Atleta**: AUTH, HUB, PERFIL, AGENDA, RESERVA, TORNEIO, INSCR, LIGA, DUPLA, PARTIDA, GAM, RANK, NOTIF, CONF, COMUN · **Organizador**: OR-HOME, OR-CTORN, OR-CLIGA, OR-HUB, OR-CAT, OR-PART, OR-UNIF, OR-FIN, OR-COMUNIC · **Gestor de Arena**: AR-DASH, AR-QUADRA, AR-AGENDA, AR-RESERVA, AR-COMANDA, AR-ESTOQUE, AR-FIN, AR-PLANO, AR-PERFIL, AR-AVAL.

## Sumário

1. [Papel: Atleta](#1-papel-atleta) — 2.1 a 2.15
2. [Papel: Organizador](#2-papel-organizador) — 3.1 a 3.9
3. [Papel: Gestor de Arena](#3-papel-gestor-de-arena) — 4.1 a 4.10
4. [Achados durante a geração deste mapa](#4-achados-durante-a-geração-deste-mapa-para-triagem-do-time)

---

# 1. Papel: Atleta

Entrada: **`/discover`** (`AthleteShellPage`), abas Início · Agenda · Reservar · Competir · Comunidade.

## 2.1 Autenticação e Onboarding

### Login (rota `/login`)
**Objetivo:** validar entrada por e-mail/senha e o roteamento pós-login.
**Pré-condições:** app deslogado; conta de teste com e-mail/senha já cadastrados.

- [ ] **AT-AUTH-01** — Preencher e-mail e senha válidos, tocar "Entrar" → **Esperado:** login OK; navega para seleção de papel (se multi-role) ou direto para `/discover`.
- [ ] **AT-AUTH-02** — Deixar e-mail vazio e tocar "Entrar" → **Esperado:** erro no campo "Informe o e-mail", não navega.
- [ ] **AT-AUTH-03** — Digitar e-mail sem formato válido (ex. "abc") → **Esperado:** erro "E-mail inválido".
- [ ] **AT-AUTH-04** — Deixar senha vazia → **Esperado:** erro "Informe a senha".
- [ ] **AT-AUTH-05** — E-mail não cadastrado → **Esperado:** erro no campo e-mail "Não encontramos uma conta com este e-mail."
- [ ] **AT-AUTH-06** — Senha incorreta para e-mail válido → **Esperado:** erro no campo senha "Senha incorreta." (ou "Credenciais inválidas. Verifique e-mail e senha.").
- [ ] **AT-AUTH-07** — Após erro, digitar novamente em qualquer campo → **Esperado:** o erro daquele campo desaparece.
- [ ] **AT-AUTH-08** — Tentar login sem conexão de rede → **Esperado:** snackbar "Falha de rede. Verifique sua conexão."
- [ ] **AT-AUTH-09** — Errar a senha repetidas vezes seguidas → **Esperado:** "Muitas tentativas. Tente novamente mais tarde."
- [ ] **AT-AUTH-10** — Tocar "Esqueceu a senha?" → **Esperado:** navega para `/forgot-password`.
- [ ] **AT-AUTH-11** — Tocar "Criar conta" → **Esperado:** navega para `/register`.

### Login social — Google/Apple (rota `/login`)
**Objetivo:** validar entrada via provedores sociais, com atenção redobrada ao Apple Sign-In (P0 de lançamento).
**Pré-condições:** conta Google/Apple de teste válida; testar em Android e em iOS/macOS separadamente.

- [ ] **AT-AUTH-12** — Tocar "Continuar com Google" com conta válida → **Esperado:** login OK, segue fluxo pós-login normal.
- [ ] **AT-AUTH-13** — Cancelar o fluxo do Google no meio (voltar/fechar popup) → **Esperado:** volta para a tela de login sem erro visível e sem loading travado.
- [ ] **AT-AUTH-14** — (iOS/macOS) Tocar "Continuar com Apple" com conta válida → **Esperado:** login OK.
- [ ] **AT-AUTH-15** — (Android) Verificar a tela de login → **Esperado:** botão "Continuar com Apple" **não aparece** (só e-mail/senha e Google).
- [ ] **AT-AUTH-16** — (iOS) Cancelar o Apple Sign-In no meio do fluxo → **Esperado:** volta para login sem erro nem loading travado (mesmo comportamento do Google).

### Cadastro (rota `/register`)
**Objetivo:** validar criação de conta nova com e-mail/senha.
**Pré-condições:** deslogado; e-mail de teste ainda não cadastrado.

- [ ] **AT-AUTH-17** — Preencher e-mail válido, senha forte (8+ caracteres, maiúscula+minúscula, dígito e caractere especial — indicador "FORTE"), confirmar senha igual, marcar aceite dos termos, tocar "Criar conta" → **Esperado:** conta criada, e-mail de verificação enviado, navega para tela "Conta criada!".
- [ ] **AT-AUTH-18** — Cadastrar com e-mail já existente → **Esperado:** erro "Este e-mail já está em uso."
- [ ] **AT-AUTH-19** — Digitar senha fraca (ex. só letras minúsculas) → **Esperado:** indicador "FRACA"; ao tentar enviar, erro "A senha não atende todos os requisitos".
- [ ] **AT-AUTH-20** — Confirmar senha diferente da senha digitada → **Esperado:** erro "Senhas ainda não conferem." (aparece reativamente ao digitar).
- [ ] **AT-AUTH-21** — Preencher tudo corretamente mas deixar o checkbox de termos desmarcado e tocar "Criar conta" → **Esperado:** snackbar "Aceite os termos para continuar."; cadastro não é criado.
- [ ] **AT-AUTH-22** — Tocar em "Termos de uso" / "Política de privacidade" → **Esperado:** abre o link externo correspondente; se falhar, "Não foi possível abrir o link."
- [ ] **AT-AUTH-23** — Na tela de sucesso, tocar "Completar perfil de atleta" → **Esperado:** vai para o onboarding (Boas-vindas), sem resquício de rascunho anterior.
- [ ] **AT-AUTH-24** — Na tela de sucesso, tocar "Entrar depois" → **Esperado:** faz signOut e volta para o login.
- [ ] **AT-AUTH-25** — (iOS) Verificar botão "Continuar com Apple" na tela de **cadastro** → **Esperado:** aparece **desabilitado** (cinza, sem ação) mesmo em iOS — hoje não é possível criar conta nova via Apple, só logar depois se a conta já existir.
- [ ] **AT-AUTH-26** — Observar o badge "PASSO 1 / 5" no topo da tela → **Esperado:** aparece fixo mesmo não havendo wizard de 5 passos visível; confirmar com produto se é esperado manter esse texto (não bloqueia o fluxo).

### Recuperar senha (rota `/forgot-password`)
**Objetivo:** validar o envio do link de redefinição de senha.
**Pré-condições:** deslogado.

- [ ] **AT-AUTH-27** — Preencher e-mail cadastrado válido e enviar → **Esperado:** banner inline "E-mail enviado! Verifique sua caixa de entrada." + modal "E-mail enviado" / "Se o e-mail estiver cadastrado, você receberá um link em instantes." com ação "Voltar ao login"; aviso fixo da tela menciona validade de 15 minutos.
- [ ] **AT-AUTH-28** — Deixar e-mail vazio → **Esperado:** erro "Informe o e-mail".
- [ ] **AT-AUTH-29** — E-mail em formato inválido → **Esperado:** erro "E-mail inválido".
- [ ] **AT-AUTH-30** — E-mail **não** cadastrado → **Esperado:** mesmo feedback de sucesso genérico do caso AT-AUTH-27 (Firebase não revela se o e-mail existe — não deve haver mensagem diferenciando).
- [ ] **AT-AUTH-31** — Forçar erro do Firebase (ex. limite de envios excedido) → **Esperado:** modal "Não foi possível enviar o link" com "Tente novamente em instantes." e ação "Tentar novamente".

### Seleção de papel multi-role (rota `/auth/role-selection`)
**Objetivo:** validar a escolha de papel quando o usuário acumula mais de um.
**Pré-condições:** usuário de teste com 2+ papéis válidos (ex. atleta + organizador, ou atleta + arena).

- [ ] **AT-AUTH-32** — Logar com usuário multi-role sem preferência salva → **Esperado:** tela aparece com "Olá, {nome}." e um card por papel disponível.
- [ ] **AT-AUTH-33** — Selecionar "Atleta" e tocar "Continuar como atleta" → **Esperado:** navega para `/discover`, preferência de papel salva localmente.
- [ ] **AT-AUTH-34** — Deslogar e logar de novo com o mesmo usuário → **Esperado:** pula a seleção de papel e vai direto para o papel escolhido anteriormente.
- [ ] **AT-AUTH-35** — Logar com usuário de papel único (só atleta) → **Esperado:** tela de seleção **não** aparece; vai direto para `/discover`.
- [ ] **AT-AUTH-36** — Verificar o rodapé do card "Atleta" → **Esperado:** mostra "RANKING #N" quando o atleta tem posição no ranking.

### Troca de papel (dentro de Configurações → rota `/auth/role-selection`)
**Objetivo:** validar a troca de papel a partir do shell do atleta já logado.
**Pré-condições:** usuário multi-role logado como atleta.

- [ ] **AT-AUTH-37** — Abrir Configurações do atleta com usuário multi-role → **Esperado:** item "Trocar papel" (seção ACESSO) visível, subtítulo "Entrar como gestor, organizador ou atleta".
- [ ] **AT-AUTH-38** — Tocar "Trocar papel" → **Esperado:** navega para a tela de seleção de papel novamente, mesmo já havendo preferência salva.
- [ ] **AT-AUTH-39** — Repetir com usuário single-role (só atleta) → **Esperado:** item "Trocar papel" **não aparece** nas Configurações.

### Onboarding — Boas-vindas (rota `/athlete/onboarding/welcome`)
**Objetivo:** validar a tela inicial do funil obrigatório pós-cadastro.
**Pré-condições:** conta recém-criada com `onboardingCompleted = false`.

- [ ] **AT-AUTH-40** — Abrir a tela → **Esperado:** sem barra de progresso/botão voltar; CTA "→ Começar" leva ao passo "Esporte principal".
- [ ] **AT-AUTH-41** — Tentar sair do funil antes de completar (deep link para `/discover`, botão voltar do sistema) → **Esperado:** o guard do router redireciona de volta para o onboarding — não é possível escapar.

### Onboarding — Esporte principal (rota `/athlete/onboarding/primary-sport`)
**Pré-condições:** dentro do funil de onboarding.

- [ ] **AT-AUTH-42** — Não selecionar nenhum esporte → **Esperado:** botão "Continuar" permanece desabilitado.
- [ ] **AT-AUTH-43** — Selecionar "Vôlei de praia" e tocar "Continuar" → **Esperado:** avança para o passo "Nível".
- [ ] **AT-AUTH-44** — Tocar "Voltar" → **Esperado:** retorna à tela de Boas-vindas.

### Onboarding — Nível (rota `/athlete/onboarding/level`)
**Pré-condições:** esporte principal já selecionado no passo anterior.

- [ ] **AT-AUTH-45** — Esporte = Vôlei de praia ou Vôlei de quadra → **Esperado:** exibe 5 opções (Iniciante 1, Iniciante 2, Intermediário 1, Intermediário 2, Open).
- [ ] **AT-AUTH-46** — Esporte = qualquer outro (ex. Tênis) → **Esperado:** exibe 3 opções (Iniciante, Intermediário, Open).
- [ ] **AT-AUTH-47** — Selecionar um nível e continuar → **Esperado:** avança para o passo "Perfil básico".

### Onboarding — Perfil básico (rota `/athlete/onboarding/profile`)
**Pré-condições:** esporte e nível já selecionados.

- [ ] **AT-AUTH-48** — Deixar Nome, WhatsApp, Data de nascimento e Gênero vazios e tocar "Concluir cadastro" → **Esperado:** todos os erros aparecem juntos: "Informe seu nome", "WhatsApp inválido", "Data inválida (dd/mm/aaaa)", "Selecione o gênero".
- [ ] **AT-AUTH-49** — Preencher todos os campos obrigatórios corretamente (sem foto) e concluir → **Esperado:** perfil salvo, `onboardingCompleted = true`, navega para `/discover`.
- [ ] **AT-AUTH-50** — Adicionar foto, recortar, concluir com falha simulada de upload → **Esperado:** cadastro conclui mesmo assim; snackbar não bloqueante "Cadastro concluído. A foto não foi enviada — você pode adicionar depois no perfil."
- [ ] **AT-AUTH-51** — Data de nascimento com ano implausível (ex. 1850) → **Esperado:** erro "Data inválida (dd/mm/aaaa)".
- [ ] **AT-AUTH-52** — WhatsApp com menos de 10 dígitos → **Esperado:** erro "WhatsApp inválido".
- [ ] **AT-AUTH-53** — Verificar os 3 passos do onboarding → **Esperado:** não existe botão "Pular" em nenhum deles; único caminho é preencher cada passo.

## 2.2 Hub principal (Início)

### Início — Home do atleta (aba índice 0 de `/discover`)
**Objetivo:** validar o hub inicial do atleta (saudação, destaque, convites, competições, torneios e missões).
**Pré-condições:** logado como atleta, papel ativo = atleta.

- [ ] **AT-HUB-01** — Abrir a aba Início → **Esperado:** header com "Olá, {primeiroNome}", avatar com badge de nível, chip de XP "N/100" e sino de notificações.
- [ ] **AT-HUB-02** — Usuário sem nome cadastrado → **Esperado:** saudação usa fallback "Olá, Atleta".
- [ ] **AT-HUB-03** — Tocar no avatar → **Esperado:** navega para o perfil próprio (`/athlete/profile`).
- [ ] **AT-HUB-04** — Tocar no chip de XP → **Esperado:** navega para a tela Quest (`/athlete/quest`).
- [ ] **AT-HUB-05** — Ter mais de 99 notificações não lidas → **Esperado:** badge do sino mostra "99+"; toque abre a caixa de entrada.
- [ ] **AT-HUB-06** — Usuário com reserva confirmada futura e sem torneio inscrito → **Esperado:** card em destaque mostra a reserva com badge "CONFIRMADA", contagem regressiva e botão "Como chegar".
- [ ] **AT-HUB-07** — Tocar "Como chegar" → **Esperado:** abre o Google Maps; se falhar ao abrir, mostra snackbar de erro sem travar o app.
- [ ] **AT-HUB-08** — Usuário com torneio inscrito e sem reserva confirmada → **Esperado:** card mostra o torneio com badge "INSCRITO" e botão "Ver torneio".
- [ ] **AT-HUB-09** — Usuário com torneio e reserva quase no mesmo horário → **Esperado:** exibe o evento que ocorre primeiro (regra de prioridade por proximidade de horário).
- [ ] **AT-HUB-10** — Usuário sem reserva e sem torneio → **Esperado:** card "Nenhuma reserva confirmada" com botão "Reservar quadra" que leva à aba Reservar.
- [ ] **AT-HUB-11** — Usuário com convites de parceiro de torneio pendentes (enviados por ele) → **Esperado:** banner "Inscrições em andamento" lista até 3, status "Aguardando {nome}" ou "Pagar inscrição".
- [ ] **AT-HUB-12** — Usuário sem convites pendentes → **Esperado:** o banner não aparece.
- [ ] **AT-HUB-13** — Tocar em um card de convite pendente → **Esperado:** navega para a inscrição do torneio no passo de espera/pagamento correspondente.
- [ ] **AT-HUB-14** — Carrossel "Torneios e ligas" com eventos disponíveis → **Esperado:** ordenado por proximidade de data (futuros antes de passados); "VER TODOS" muda para a aba Competir.
- [ ] **AT-HUB-15** — Sem torneios nem ligas disponíveis → **Esperado:** a seção inteira desaparece (sem empty state visível).
- [ ] **AT-HUB-16** — Falha ao carregar torneios **e** ligas ao mesmo tempo (sem rede) → **Esperado:** mensagem "Não foi possível carregar torneios e ligas."
- [ ] **AT-HUB-17** — "Meus torneios" com inscrições ativas → **Esperado:** até 3 com badges de status; "VER TODOS" leva a `/competir/meus-torneios`.
- [ ] **AT-HUB-18** — Sem inscrições em torneios → **Esperado:** a seção "Meus torneios" desaparece.
- [ ] **AT-HUB-19** — Preview de missões diárias com progresso parcial → **Esperado:** cabeçalho "X/Y HOJE"; tocar em missão não concluída navega ao fluxo correspondente; "VER TUDO" leva à tela Quest.
- [ ] **AT-HUB-20** — Forçar erro geral ao carregar o resumo de gamificação → **Esperado:** mensagem "Não foi possível carregar sua evolução." sem botão de retry (só saindo e voltando à aba).
- [ ] **AT-HUB-21** — Trocar de aba e voltar para Início → **Esperado:** estado da tela é preservado (não recarrega do zero).

**Não testar (não implementado):** seção "Vaga em ~1h" (slots), "Joga com você" (parceiros online) e atalhos rápidos (Reservar/Convidar/Torneios) no topo do Início — estão comentados no código atual e não aparecem na tela.

## 2.3 Perfil do Atleta

### Perfil próprio (rota `/athlete/profile`)
**Objetivo:** validar a visualização do perfil do próprio atleta.
**Pré-condições:** logado como atleta.

- [ ] **AT-PERFIL-01** — Abrir o perfil próprio → **Esperado:** mostra XP/nível, stats (Jogos/Vitórias/Sequência/Ranking), próxima reserva (ou empty state), tira de conquistas, histórico e "Joga com".
- [ ] **AT-PERFIL-02** — Perfil incompleto → **Esperado:** card "Complete seu perfil" no topo com % e XP pendente; badge laranja no ícone de configurações.
- [ ] **AT-PERFIL-03** — Perfil 100% completo → **Esperado:** card "Complete seu perfil" some; badge do ícone de configurações some.
- [ ] **AT-PERFIL-04** — Sem próxima reserva → **Esperado:** empty state "Nenhuma reserva próxima" / "Reserve uma quadra e ela aparece aqui."
- [ ] **AT-PERFIL-05** — Tocar na tira de conquistas → **Esperado:** navega para `/athlete/achievements`.
- [ ] **AT-PERFIL-06** — Procurar botões de compartilhar/editar no cabeçalho do perfil → **Esperado:** **não aparecem** (removidos da UI atual); único acesso a editar é via ícone de configurações ou card "Complete seu perfil" — confirmar com produto se é o comportamento esperado.
- [ ] **AT-PERFIL-07** — Acessar `/athlete/profile?userId=<outroUid>` → **Esperado:** abre o perfil **público** desse outro atleta, mesmo na rota de "meu perfil".

### Editar perfil (rota `/athlete/profile/edit`)
**Pré-condições:** logado como atleta.

- [ ] **AT-PERFIL-08** — Editar Nome, Apelido, Esporte, WhatsApp, Estado/Cidade e Bio (até 160 caracteres) e salvar → **Esperado:** dados persistidos, volta ao perfil atualizado.
- [ ] **AT-PERFIL-09** — Deixar Nome vazio e salvar → **Esperado:** erro "Informe seu nome".
- [ ] **AT-PERFIL-10** — Deixar Estado ou Cidade vazios → **Esperado:** erro "Selecione o estado" / "Selecione a cidade".
- [ ] **AT-PERFIL-11** — Digitar bio além de 160 caracteres → **Esperado:** contador "X / 160" limita a digitação (ou trunca ao salvar).
- [ ] **AT-PERFIL-12** — Tocar no campo "Nível" (com ícone de cadeado) → **Esperado:** navega para "Esportes e níveis" em vez de editar o nível ali mesmo.
- [ ] **AT-PERFIL-13** — Verificar o campo E-mail → **Esperado:** somente leitura, "Vinculado à sua conta. Não pode ser alterado aqui."
- [ ] **AT-PERFIL-14** — Salvar com erro de permissão simulado → **Esperado:** "Sem permissão para salvar o perfil. Se você já definiu níveis em Esportes e níveis, não é possível rebaixá-los por aqui."
- [ ] **AT-PERFIL-15** — Chegar à tela via "Completar perfil" com foco em foto (`?focus=photo`) → **Esperado:** tela abre com scroll automático até a seção de foto.

### Completar perfil com XP (rota `/athlete/profile/complete`)
**Pré-condições:** perfil com passos pendentes.

- [ ] **AT-PERFIL-16** — Abrir com perfil parcialmente completo → **Esperado:** anel de progresso e "FALTAM N PASSOS"; passos concluídos têm check verde e não são mais clicáveis.
- [ ] **AT-PERFIL-17** — Completar o último passo pendente → **Esperado:** texto muda para "PERFIL COMPLETO"; sheet de XP aparece; badge "Perfil completo" desbloqueado.
- [ ] **AT-PERFIL-18** — Preencher cidade sem UF → **Esperado:** passo "Cidade" **não** é considerado concluído (exige cidade + UF).
- [ ] **AT-PERFIL-19** — Preencher WhatsApp com número incompleto (9 dígitos) → **Esperado:** passo "WhatsApp" não conta como concluído.

### Esportes e níveis — regra "nível só sobe" (rota `/athlete/profile/sports-levels`)
**Objetivo:** validar que o atleta nunca consegue reduzir o próprio nível declarado.
**Pré-condições:** atleta com esporte principal e nível já salvos (ex. Intermediário 1 em Vôlei de praia).

- [ ] **AT-PERFIL-20** — Abrir a tela → **Esperado:** chips de nível abaixo do salvo (Iniciante 1, Iniciante 2) aparecem com ícone de cadeado e cor esmaecida; chips no nível atual ou acima ficam normais.
- [ ] **AT-PERFIL-21** — Tocar em um chip **abaixo** do nível salvo (tentar reduzir) → **Esperado:** nenhum sheet abre; snackbar "Seu nível não pode ser reduzido. Se precisar corrigir, fale com o suporte." e o nível não muda.
- [ ] **AT-PERFIL-22** — Tocar em um chip **acima** do salvo (ex. subir para Intermediário 2) → **Esperado:** abre bottom sheet "Confirmar novo nível" — "{Esporte}: seu nível passará a Intermediário 2." + aviso "O nível só pode subir. Para reduzir depois, será preciso falar com o suporte. Em torneios, você disputa apenas categorias do seu nível ou acima."; botões "Confirmar nível" / "Cancelar".
- [ ] **AT-PERFIL-23** — No sheet, tocar "Cancelar" → **Esperado:** nível não muda, sheet fecha.
- [ ] **AT-PERFIL-24** — No sheet, tocar "Confirmar nível" → **Esperado:** nível atualizado; chips abaixo do novo nível passam a ficar bloqueados.
- [ ] **AT-PERFIL-25** — Tocar no nível já selecionado → **Esperado:** nenhuma ação ocorre (sem sheet, sem chamada de salvar).
- [ ] **AT-PERFIL-26** — Adicionar um segundo esporte → **Esperado:** entra com nível padrão "Iniciante", salva imediatamente.
- [ ] **AT-PERFIL-27** — Tocar "Tornar principal" em esporte secundário → **Esperado:** sheet "Tornar esporte principal" / "{Esporte} será seu esporte principal."; confirmar troca o principal.
- [ ] **AT-PERFIL-28** — Esporte = Vôlei de praia/quadra → **Esperado:** 5 chips de nível (Iniciante 1/2, Intermediário 1/2, Open).
- [ ] **AT-PERFIL-29** — Esporte = qualquer outro (ex. Tênis, Futebol) → **Esperado:** 3 chips de nível (Iniciante, Intermediário, Open).
- [ ] **AT-PERFIL-30** — Simular falha de rede ao salvar nível → **Esperado:** snackbar "Não foi possível salvar. Tente novamente."; nível volta ao valor salvo anteriormente.

### Perfil público de outro atleta (rota `/athlete/profile?userId=...`)
**Pré-condições:** acessar via ranking, "Descobrir atletas" ou link direto.

- [ ] **AT-PERFIL-31** — Abrir perfil de atleta com visibilidade "Público" → **Esperado:** header completo, stats, esportes, aba "Partidas", botão "Seguir"/"Seguindo", botão compartilhar.
- [ ] **AT-PERFIL-32** — Abrir perfil de atleta com visibilidade "Privado" → **Esperado:** tela mostra só "Este perfil é privado." e botão voltar.
- [ ] **AT-PERFIL-33** — Tocar na aba "Conquistas" → **Esperado:** placeholder "Conquistas públicas em breve."
- [ ] **AT-PERFIL-34** — Aba "Partidas" sem histórico → **Esperado:** "Nenhuma partida de torneio registrada."
- [ ] **AT-PERFIL-35** — Procurar botão "Convidar" no perfil de outro atleta → **Esperado:** **não aparece** nenhum botão de convite (removido da UI).
- [ ] **AT-PERFIL-36** — Tocar em compartilhar no perfil de outro atleta → **Esperado:** abre share sheet nativo com "Confira o perfil de {nome} no NexaGO."

### Descobrir atletas (rota `/competir/descobrir`)
**Pré-condições:** logado como atleta.

- [ ] **AT-PERFIL-37** — Buscar por nome com 2+ caracteres → **Esperado:** resultados filtram após debounce (~350ms).
- [ ] **AT-PERFIL-38** — Buscar termo sem resultados → **Esperado:** "Nenhum atleta encontrado."
- [ ] **AT-PERFIL-39** — Aplicar filtro de nível via chips rápidos (Iniciante/Intermediário/Open/Pro) → **Esperado:** lista filtra corretamente.
- [ ] **AT-PERFIL-40** — Abrir filtros completos (bottom sheet), aplicar Gênero + Esporte + "Procurando dupla" → **Esperado:** botão mostra preview "Ver N atletas" antes de aplicar; lista atualiza após aplicar.
- [ ] **AT-PERFIL-41** — Simular falha ao carregar (sem rede) → **Esperado:** "Não foi possível carregar atletas." com detalhe do erro.

### Seguir atletas
**Pré-condições:** logado; atleta-alvo com conta ativa.

- [ ] **AT-PERFIL-42** — Tocar "Seguir" (card de Descobrir ou perfil público) → **Esperado:** muda para "Seguindo" com atualização otimista imediata; contador de seguidores do outro atleta aumenta.
- [ ] **AT-PERFIL-43** — Tocar "Seguindo" para deixar de seguir → **Esperado:** volta para "Seguir", contador diminui.
- [ ] **AT-PERFIL-44** — Simular falha de rede ao seguir → **Esperado:** estado reverte e snackbar "Não foi possível atualizar o follow."
- [ ] **AT-PERFIL-45** — Tentar seguir estando deslogado (ex. via link público) → **Esperado:** snackbar "Faça login para seguir atletas."

### Compartilhar perfil
- [ ] **AT-PERFIL-46** — Procurar como compartilhar o **próprio** perfil a partir do cabeçalho → **Esperado:** hoje **não há** botão visível de compartilhar no perfil próprio (removido da UI); validar com produto se isso bloqueia a missão diária "Compartilhe seu perfil" (ver 2.11 Gamificação), já que a Quest orienta "Toque em compartilhar no topo do seu perfil."

**Não testar (não implementado):** convite de dupla a partir do perfil público (removido da UI, só resíduo de callback no código).

## 2.4 Agenda unificada

### Aba Agenda — visão dia/mês, filtros, timeline unificada (dentro de `/discover`)
**Objetivo:** Validar a listagem cronológica única de reservas de quadra e compromissos de torneio, com alternância de visão e filtros.
**Pré-condições:** Atleta logado com pelo menos 1 reserva de quadra futura e 1 torneio inscrito com jogo agendado.

- [ ] **AT-AGENDA-01** — Abrir aba Agenda → **Esperado:** timeline mostra reserva (badge "ALUGUEL") e jogo de torneio (badge "TORNEIO") juntos, ordenados por data/hora.
- [ ] **AT-AGENDA-02** — Tocar no ícone de calendário para alternar para visão mês → **Esperado:** título muda para "Seu mês", aparece grid mensal, a tira de dias (day strip) some.
- [ ] **AT-AGENDA-03** — Trocar para a aba "Passados" → **Esperado:** lista mostra itens concluídos/cancelados em ordem decrescente (mais recente primeiro).
- [ ] **AT-AGENDA-04** — Aplicar chip de filtro "Aluguéis" → **Esperado:** só itens de reserva aparecem; contador no chip reflete a quantidade.
- [ ] **AT-AGENDA-05** — Aplicar chip "Torneios" → **Esperado:** só itens de torneio aparecem, com badge "AO VIVO" quando aplicável e botões "Bracket"/"Ver torneio".
- [ ] **AT-AGENDA-06** — Aplicar chip "Desafios" → **Esperado:** lista fica vazia sem erro (não há desafios reais implementados hoje).
- [ ] **AT-AGENDA-07** *(regressão)* — Procurar o ícone de busca (lupa) no cabeçalho da Agenda → **Esperado:** ícone **não aparece** (botão está comentado no código); confirmar que não há campo de busca acessível hoje.
- [ ] **AT-AGENDA-08** — Selecionar um dia sem nenhum compromisso (aba "Próximos", filtro "Tudo") → **Esperado:** estado vazio "Sem jogos marcados." com botão único "Reservar agora" — **sem** opções de "Drop-in" ou "Marcar como descanso" (ambas comentadas no código).
- [ ] **AT-AGENDA-09** — Filtro "Torneios" num dia sem torneios (mas com aluguéis) → **Esperado:** "Nenhum torneio neste dia" com botão "Ver torneios".
- [ ] **AT-AGENDA-10** — Puxar para atualizar (pull-to-refresh) → **Esperado:** lista recarrega sem erros.
- [ ] **AT-AGENDA-11** — Simular falha de rede ao carregar a Agenda → **Esperado:** "Não foi possível carregar agenda" com botão de tentar novamente.

**Não testar (não implementado):** busca por texto (campo implementado mas botão de abrir está comentado), "Drop-in"/"Dia de descanso" (botões comentados, callbacks levam a snackbars "Drop-in em breve no app."/"Dia marcado como descanso." mas são inalcançáveis pela UI), filtro de desafios com dados reais.

### Seção "Precisa de você" (dentro da aba Agenda)
**Objetivo:** Confirmar se convites de parceiro de torneio pendentes aparecem na Agenda.
**Pré-condições:** Atleta logado com um convite de parceiro de torneio pendente recebido.

- [ ] **AT-AGENDA-12** *(achado de código — validar com produto)* — Com convite de parceiro pendente, abrir a aba Agenda → **Esperado hoje:** a seção "Precisa de você" **não aparece em lugar nenhum** da tela — o widget existe e o provider tem dados reais, mas nunca é instanciado em nenhuma tela do app. Reportar como possível regressão/feature incompleta.
- [ ] **AT-AGENDA-13** — Confirmar que o mesmo convite de parceiro continua acessível por outro caminho → **Esperado:** aparece no hub Competir, seção "Inscrições em andamento" (card "Aguardando {nome}" ou "Pagar inscrição").

### Minhas reservas (tela real `MyBookingsPage`, rota `myBookings` → `/my-bookings`)
**Objetivo:** Validar listagem, abas, cancelamento, pagamento pendente e streak de reservas.
**Pré-condições:** Atleta logado com reservas em estados variados (agendada, PIX pendente, cancelada, mensalista).

> Nota de QA: o arquivo `athlete_bookings_page.dart` citado no mapeamento original de funcionalidades é código morto (nenhum import no app); a tela real acessada pelo usuário é `MyBookingsPage`.

- [ ] **AT-AGENDA-14** — Abrir "Minhas reservas" a partir do Início → **Esperado:** abas "Próximas" e "Histórico", cada uma com contador correto.
- [ ] **AT-AGENDA-15** — Tocar num card de reserva → **Esperado:** abre um **bottom sheet** de detalhes (não uma página cheia) com status badge correto (AGENDADA/PENDENTE/CHECK-IN/CANCELADA).
- [ ] **AT-AGENDA-16** — Cancelar reserva dentro de 6h antes do início → **Esperado:** botão "Cancelar reserva" habilitado; cancela **imediatamente, sem diálogo de confirmação**; snackbar "Reserva cancelada com sucesso."
- [ ] **AT-AGENDA-17** — Tentar cancelar reserva com menos de 6h para o início → **Esperado:** botão "Cancelar reserva" aparece desabilitado (política: grátis até 6h antes; depois disso a arena retém 50%).
- [ ] **AT-AGENDA-18** — Abrir reserva de horário fixo/mensalista → **Esperado:** card mostra chip "Horário fixo"; não há opção de cancelar pelo app para essa reserva.
- [ ] **AT-AGENDA-19** *(gap confirmado)* — Reserva com PIX pendente, tocar em "Pagar agora" nesta tela → **Esperado:** snackbar **"Fluxo de pagamento em breve."** — o botão não abre nenhum fluxo real de pagamento a partir de Minhas Reservas.
- [ ] **AT-AGENDA-20** — Atleta com reservas em 3+ semanas consecutivas → **Esperado:** banner "Você está em uma sequência de {N} semanas!" no topo da aba "Próximas".
- [ ] **AT-AGENDA-21** — Nenhuma reserva cadastrada → **Esperado:** estado vazio "Hora de pisar na areia." mencionando XP da primeira reserva, com arenas próximas sugeridas.
- [ ] **AT-AGENDA-22** — Sessão expira/desloga no meio do cancelamento → **Esperado:** "Faça login para cancelar."

### Detalhe de reserva (`booking_details_page.dart`)
**Objetivo:** Validar pagamento, local, equipe, check-in e presença no detalhe completo de uma reserva.
**Pré-condições:** Reserva futura confirmada, dentro da janela de check-in/confirmação de presença.

- [ ] **AT-AGENDA-23** — Abrir detalhe de reserva confirmada → **Esperado:** hero com badge CONFIRMADA e contador "Começa em Xh Ymin"; seções Equipe/Localização/Pagamento/Confirmação de presença/Ações visíveis.
- [ ] **AT-AGENDA-24** *(placeholder confirmado)* — Na seção "Sua equipe" ("{confirmados}/4 confirmados"), tocar em "Convidar jogadores" → **Esperado:** snackbar "Convidar jogadores em breve no app."
- [ ] **AT-AGENDA-25** — Dentro da janela de check-in (20 min antes até 15 min após o fim) → **Esperado:** aparece switch "Estou próximo da arena" e botão "Fazer check-in"; **não há QR code** nesta tela.
- [ ] **AT-AGENDA-26** — Fazer check-in → **Esperado:** snackbar "Check-in realizado com sucesso!"
- [ ] **AT-AGENDA-27** — Dentro da janela de confirmação, antes do check-in → **Esperado:** botão "Confirmar presença"; ao confirmar, snackbar "Presença confirmada com sucesso! +5 XP".
- [ ] **AT-AGENDA-28** — Cancelar pelo ícone do AppBar ou pela seção Ações → **Esperado:** cancela **imediatamente, sem diálogo de confirmação**; snackbar "Reserva cancelada."; tela fecha.
- [ ] **AT-AGENDA-29** — Reserva com pagamento parcial (50%) → **Esperado:** seção Pagamento mostra card "Rachar com a equipe" com valor por pessoa (dividido por 4 vagas); toque no card não executa ação real (decorativo).

## 2.5 Descoberta e Reserva de Arenas

### Busca de horários (aba Reservar, dentro de `/discover`)
**Objetivo:** Validar filtros, ordenação e localização na busca de arenas/horários.
**Pré-condições:** Atleta logado.

- [ ] **AT-RESERVA-01** — Abrir aba Reservar → **Esperado:** lista de arenas próximas carregada, esporte padrão pré-selecionado conforme perfil, ordenação padrão por distância.
- [ ] **AT-RESERVA-02** — Filtrar por data e hora específicas → **Esperado:** lista mostra só arenas com disponibilidade naquele horário.
- [ ] **AT-RESERVA-03** — Filtrar por faixa de preço "até R$ 60" → **Esperado:** arenas fora da faixa somem.
- [ ] **AT-RESERVA-04** — Ordenar por "Menor preço" → **Esperado:** lista reordena do mais barato ao mais caro.
- [ ] **AT-RESERVA-05** — Negar permissão de GPS no diálogo do sistema → **Esperado:** app cai silenciosamente para a cidade/UF do perfil (ou mostra "Arenas disponíveis" sem localização) — **sem** nenhum banner/erro visível de permissão negada.
- [ ] **AT-RESERVA-06** — Filtros ativos ocultam todas as arenas existentes na base → **Esperado:** banner "Filtros ocultaram as arenas" / "Temos N arena(s) na base, mas nenhuma passou nos filtros atuais." com botões "Ajustar filtros"/"Ver todas".
- [ ] **AT-RESERVA-07** — Nenhuma arena cadastrada na região → **Esperado:** "Nenhuma arena encontrada" / "Ajuste filtros, data ou horário para ver mais opções."
- [ ] **AT-RESERVA-08** — Falha de rede ao carregar → **Esperado:** "Não foi possível carregar horários" com retry.

**Não testar (não implementado):** faixa de "arenas favoritas" na busca, banner de horário flexível, chips de período do dia (manhã/tarde/noite) — todos comentados no código.

### Favoritar arena / Arenas favoritas (rota `favoriteArenas` → `/reservar/favoritas`)
**Objetivo:** Validar toggle de favorito e a lista dedicada.
**Pré-condições:** Atleta logado.

- [ ] **AT-RESERVA-09** — Tocar no coração de uma arena → **Esperado:** ícone preenche; aparece tela de sucesso "Agora voce segue essa arena!" que fecha sozinha em ~1,5s.
- [ ] **AT-RESERVA-10** — Tocar no coração deslogado → **Esperado:** snackbar "Faça login para seguir arenas." (não favorita).
- [ ] **AT-RESERVA-11** — Abrir "Arenas favoritas" com 1+ favoritos → **Esperado:** card por arena, com "próximo horário"/botão "Reservar" quando há disponibilidade.
- [ ] **AT-RESERVA-12** — Nenhuma arena favoritada → **Esperado:** "Nenhuma arena favorita" / "Toque no coração nas arenas que você mais joga para vê-las aqui." com botão "Buscar arenas".

### Detalhe da arena (rota `arenaDetail` → `/arena/:arenaId`)
**Objetivo:** Validar hero, métricas, quadras e avaliações embutidas.
**Pré-condições:** Arena com pelo menos 1 quadra e algumas avaliações.

- [ ] **AT-RESERVA-13** — Abrir detalhe da arena → **Esperado:** hero com imagem de capa única (**sem galeria/carrossel**), métricas (Score NexaGO, Avaliação, Quadras), lista de quadras com status (livre/lotada/manutenção), comodidades, até 5 avaliações recentes.
- [ ] **AT-RESERVA-14** — Tocar em "ver todas" nas avaliações → **Esperado:** navega para `/arena/:arenaId/reviews`.
- [ ] **AT-RESERVA-15** — Tocar em "Ver horários disponíveis" → **Esperado:** abre seleção de horários na data de hoje.
- [ ] **AT-RESERVA-16** — Arena sem avaliações → **Esperado:** "Ainda não há avaliações para esta arena."

### Seleção de horários (`SlotsPage`, rota `arenaSlots` → `/arena/:arenaId/slots`)
**Objetivo:** Validar calendário, seleção de duração, sugestões e alerta de vaga.
**Pré-condições:** Arena com grade de horários configurada.

- [ ] **AT-RESERVA-17** — Selecionar quadra + horário + duração 1h → **Esperado:** slot marcado "SELECIONADO", barra inferior mostra total calculado.
- [ ] **AT-RESERVA-18** — Usar seletor de duração "2h" → **Esperado:** seleciona automaticamente 2 slots contíguos livres a partir da âncora.
- [ ] **AT-RESERVA-19** — Verificar badge "MAIS POPULAR" → **Esperado:** aparece no primeiro horário livre entre 08:00–10:00 (ou no slot mais concorrido).
- [ ] **AT-RESERVA-20** — Tentar selecionar slot ocupado → **Esperado:** slot com etiqueta "OCUPADO", opacidade reduzida, não selecionável.
- [ ] **AT-RESERVA-21** — Dia totalmente lotado para a quadra → **Esperado:** "{Dia da semana} lotou." / "A {quadra} não tem horários abertos neste dia." com sugestões (quadra alternativa, próximo dia, arenas próximas).
- [ ] **AT-RESERVA-22** — Quadra sem grade cadastrada no dia → **Esperado:** "Sem horários neste dia" / "Não há horários cadastrados para {quadra} neste dia."
- [ ] **AT-RESERVA-23** — No bloco de dia lotado, ativar "Avisar quando liberar" (logado, sem tópico de push ativo) → **Esperado:** diálogo "Ativar notificações de vagas?" antes de ativar; ao confirmar, botão muda para "Ativo".
- [ ] **AT-RESERVA-24** — Ativar "Avisar quando liberar" deslogado → **Esperado:** snackbar "Entre na conta para ativar alertas."
- [ ] **AT-RESERVA-25** — Slot 5 min após o horário de início → **Esperado:** não pode mais ser selecionado (aparece como passado).

### Confirmar reserva (rota `arenaBookingConfirm` → `/arena/:arenaId/book/confirm`)
**Objetivo:** Validar resumo de preço, política de cancelamento e escolha de pagamento.
**Pré-condições:** Horário selecionado.

- [ ] **AT-RESERVA-26** — Confirmar pagando na arena → **Esperado:** resumo "Quadra (Nh)" + "Taxa de plataforma: Grátis"; card de política "Cancelamento grátis até 6h antes" / "Depois disso, a {arena} retém 50% do valor pago."; CTA "Confirmar reserva".
- [ ] **AT-RESERVA-27** — Escolher pagamento PIX → **Esperado:** CTA muda para "Confirmar e pagar", navega para tela de PIX ao confirmar.
- [ ] **AT-RESERVA-28** — Horário acabou de ser ocupado por outro usuário (conflito) → **Esperado:** erro "Esse horário acabou de ser reservado. Escolha outro."
- [ ] **AT-RESERVA-29** — Atleta bloqueado pela arena tenta confirmar → **Esperado:** redireciona para "Reserva indisponível" com "Sua conta está bloqueada para reservar nesta arena." e botão único "Buscar arenas".
- [ ] **AT-RESERVA-30** — Reabrir a confirmação já havendo reserva PIX pendente para o mesmo horário/quadra → **Esperado:** snackbar "Retomando pagamento PIX da sua reserva." (não duplica a reserva).

### Pagamento PIX (rota `arenaBookingPix` → `/arena/:arenaId/book/pix`)
**Objetivo:** Validar geração de QR, expiração e comportamento ao sair/voltar da tela.
**Pré-condições:** Reserva pendente aguardando pagamento.

- [ ] **AT-RESERVA-31** — Gerar PIX com CPF válido, pagar 100% → **Esperado:** QR code exibido, código copia-e-cola disponível, contador regressivo de expiração iniciado.
- [ ] **AT-RESERVA-32** — Tocar em copiar código → **Esperado:** snackbar "Código PIX copiado."
- [ ] **AT-RESERVA-33** — Tentar gerar QR sem CPF válido → **Esperado:** botão de gerar permanece desabilitado.
- [ ] **AT-RESERVA-34** — Deixar o PIX expirar sem pagar (padrão 5 min se backend não informar) → **Esperado:** tela muda automaticamente para "Pagamento não concluído" / "A reserva foi cancelada e o horário voltou a ficar disponível.", botão "Escolher outro horário"; o slot volta a aparecer livre.
- [ ] **AT-RESERVA-35** — Sair da tela de PIX sem pagar e reabrir a reserva do mesmo horário → **Esperado:** app retoma o mesmo pagamento pendente (mesmo `bookingId`), sem duplicar reserva.
- [ ] **AT-RESERVA-36** — Pagar o PIX em outro app e voltar ao NexaGO → **Esperado:** listener em tempo real detecta a confirmação e navega automaticamente para a tela de sucesso.
- [ ] **AT-RESERVA-37** — Tocar em "Desistir do pagamento" → **Esperado:** cancela a reserva pendente e libera o horário.

### Sucesso da reserva (rota `arenaBookingSuccess` → `/arena/:arenaId/book/success`)
**Objetivo:** Validar ticket e ações pós-reserva.
**Pré-condições:** Reserva confirmada com sucesso.

- [ ] **AT-RESERVA-38** — Reserva confirmada → **Esperado:** confete animado, ticket com data/horário/local; botões "Compartilhar" e "Como chegar" **apenas** — **sem** QR code no ticket, **sem** botão de adicionar ao calendário e **sem** botão de convite nesta tela.
- [ ] **AT-RESERVA-39** — Tocar em "Compartilhar" → **Esperado:** abre share sheet nativo com mensagem pré-formatada.
- [ ] **AT-RESERVA-40** — Tocar em "Como chegar" → **Esperado:** abre Google Maps com endereço da arena.
- [ ] **AT-RESERVA-41** — Tocar em "Ver na agenda" → **Esperado:** navega para a tela de reservas do atleta.

### Avaliações da arena / Avaliar após jogo (rota `arenaReviews` → `/arena/:arenaId/reviews`)
**Objetivo:** Validar lista de avaliações e o diálogo pós-jogo.
**Pré-condições:** Arena com avaliações existentes; reserva concluída há mais de 5 minutos sem avaliação prévia.

- [ ] **AT-RESERVA-42** — Abrir lista completa de avaliações → **Esperado:** resumo com nota média/distribuição por estrela; filtros "Todas/Recentes/Mais úteis/5★.../3★ ou menos"; paginação de 10 em 10 com "Carregar mais".
- [ ] **AT-RESERVA-43** — Curtir uma avaliação ("Útil") → **Esperado:** contador incrementa, botão destaca.
- [ ] **AT-RESERVA-44** *(confirmar ausência)* — Procurar botões "Editar" (review própria) e "Denunciar" → **Esperado:** **não aparecem** na UI (comentados no código, mesmo a lógica existindo no backend).
- [ ] **AT-RESERVA-45** — Abrir a aba Agenda com reserva elegível para avaliação → **Esperado:** diálogo "Como foi o jogo na {arena}?" aparece automaticamente, com selo "+10 XP", 5 estrelas, tags de destaque e comentário opcional; `barrierDismissible: false` mas tem botão "Agora não".
- [ ] **AT-RESERVA-46** — Tocar em "Agora não" → **Esperado:** fecha sem enviar; pode reaparecer em sessões futuras enquanto não for avaliada.
- [ ] **AT-RESERVA-47** — Enviar avaliação → **Esperado:** snackbar "Obrigado! +10 XP no seu progresso."; avaliação passa a existir na lista da arena.
- [ ] **AT-RESERVA-48** — Tentar avaliar a mesma reserva duas vezes → **Esperado:** erro "Esta reserva já foi avaliada."
- [ ] **AT-RESERVA-49** — Tentar avaliar reserva cancelada → **Esperado:** erro "Avaliação não permitida para reserva cancelada."

### Convite para jogar — link de reserva (rota pública `bookingInvite` → `/convite/:inviteId`)
**Objetivo:** Validar o fluxo de convite via link, incluindo estados deslogado/expirado/já aceito.
**Pré-condições:** Link de convite válido gerado para uma reserva.

- [ ] **AT-RESERVA-50** — Abrir o link **deslogado** → **Esperado:** rota é pública (`/convite/*` está na allowlist do router); a tela abre normalmente mostrando os dados do jogo, sem forçar login.
- [ ] **AT-RESERVA-51** — No mesmo cenário deslogado, tocar em "Quero jogar!" → **Esperado:** snackbar "Faça login para aceitar o convite."; **atenção:** o app **não** redireciona para login nem oferece caminho claro de autenticação a partir daqui — validar como fricção de UX.
- [ ] **AT-RESERVA-52** — Abrir link expirado (mais de 48h) → **Esperado:** "Este convite expirou."
- [ ] **AT-RESERVA-53** — Abrir link inexistente/removido → **Esperado:** "Convite não encontrado ou expirado."
- [ ] **AT-RESERVA-54** *(gap de concorrência — validar manualmente)* — Dois usuários diferentes tentam aceitar o mesmo link em sequência → **Esperado hoje:** não há aviso de "convite já aceito"; ambos conseguem tocar em "Quero jogar!" (sem transação Firestore protegendo a operação) — confirmar qual fica de fato vinculado à reserva.
- [ ] **AT-RESERVA-55** *(gap — validar manualmente)* — Criar convite, cancelar a reserva original, depois abrir o link → **Esperado hoje:** a tela continua mostrando os dados antigos (arena/data/hora) como válidos, pois não relê o status atual da reserva.
- [ ] **AT-RESERVA-56** — Aceitar convite válido logado → **Esperado:** snackbar "Convite aceito! Escolha um horário." e navegação para a tela de horários da arena (validar se esse redirecionamento faz sentido de produto, já que o convite deveria vincular à reserva existente).
- [ ] **AT-RESERVA-57** *(placeholder confirmado)* — No detalhe de reserva do dono, tocar em "Convidar jogadores" → **Esperado:** snackbar "Convidar jogadores em breve no app." — **não existe** hoje nenhuma tela para o dono gerar/compartilhar um novo link de convite.

**Não testar (não implementado):** campo de observações na confirmação (não persiste no backend), reserva recorrente/mensalista do lado do atleta (não há tela de gestão — só o badge/aviso já coberto em AT-AGENDA-18).

## 2.6 Torneios — Descoberta e visualização

### Hub Competir (aba do shell do atleta)
**Objetivo:** Validar seções do hub e o gate de acesso.
**Pré-condições:** Atleta logado.

- [ ] **AT-TORNEIO-01** — Abrir hub Competir → **Esperado:** seções Torneios (carrossel), Ranking (preview), Atletas, Equipes carregam; convite de parceiro pendente enviado pelo próprio atleta aparece em "Inscrições em andamento" ("Aguardando {nome}" ou "Pagar inscrição").
- [ ] **AT-TORNEIO-02** — Perfil incompleto, abrir hub Competir → **Esperado:** banner de acesso bloqueado no topo (ver casos de gate abaixo).

### Listagem completa (rota `tournamentDiscoveryList` → `/competir/torneios`)
**Objetivo:** Validar busca, segmentação e filtros.

- [ ] **AT-TORNEIO-03** — Buscar por nome de torneio → **Esperado:** lista filtra em tempo real (debounce ~350ms).
- [ ] **AT-TORNEIO-04** — Aplicar segmento "Ligas" → **Esperado:** só ligas aparecem, indicando se o atleta já está inscrito em algum estágio.
- [ ] **AT-TORNEIO-05** — Marcar "Só com inscrição aberta" → **Esperado:** torneios fechados somem da lista.
- [ ] **AT-TORNEIO-06** — Nenhum torneio corresponde aos filtros → **Esperado:** "Nenhum torneio encontrado com esses filtros."

### Detalhe do torneio (rota `tournamentDetail` → `/torneios/:tournamentId`)
**Objetivo:** Validar hero, navegação para subtelas e CTA de inscrição.
**Pré-condições:** Torneio com inscrições abertas.

- [ ] **AT-TORNEIO-07** — Abrir detalhe de torneio aberto → **Esperado:** hero com status/prêmio/taxa; seção "Explorar o torneio" com cards Categorias/Chave e Jogos/Grupos/Premiações (Pódio sempre desabilitado, "Definido após o torneio"); barra inferior "Inscrever minha dupla" com "a partir de {preço}".
- [ ] **AT-TORNEIO-08** — Tocar em "Categorias" → **Esperado:** lista categorias com contagem de inscritos e badges de elegibilidade quando bloqueada.
- [ ] **AT-TORNEIO-09** — Tocar em "Grupos" (torneio com fase de grupos) → **Esperado:** mostra standings dos grupos.
- [ ] **AT-TORNEIO-10** — Tocar em "Premiações" → **Esperado:** mostra prêmios por categoria.
- [ ] **AT-TORNEIO-11** — Chave ainda não gerada, abrir "Chave e Jogos" → **Esperado:** "Chave ainda não publicada" / "Quando o organizador gerar os jogos eliminatórios desta categoria, eles aparecerão aqui."

### Chave dupla eliminação interativa (rota `tournamentDoubleEliminationBracket` → `/torneios/:tournamentId/chave/:categoryId`)
**Objetivo:** Validar renderização, ordem dos jogos e estado de partidas ainda não decididas.
**Pré-condições:** Categoria com chave DE publicada, com jogos em diferentes estados (agendado, ao vivo, concluído).

- [ ] **AT-TORNEIO-12** — Abrir a chave DE → **Esperado:** trilha WB em cima, LB embaixo, coluna Final centralizada à direita; zoom por pinça funcionando (0.35x–2.5x).
- [ ] **AT-TORNEIO-13** — Verificar conexões entre rodadas → **Esperado:** cabeçalhos "WB · RODADA N" / "LB · RODADA N" / "FINAL" conectam corretamente fase a fase.
- [ ] **AT-TORNEIO-14** *(validar com produto)* — Semifinal ainda não concluída, abrir/tocar no card da final → **Esperado hoje:** card **continua tocável** (não há bloqueio/cadeado); mostra nomes placeholder ("Equipe A"/"Equipe B" ou descrição do backend, ex. "Vencedor Jogo 3") e placar "A definir" — validar se esse comportamento é o desejado.
- [ ] **AT-TORNEIO-15** — Partida concluída → **Esperado:** badge "FINALIZADO", vencedor em destaque (negrito+cor), placar de sets exibido.
- [ ] **AT-TORNEIO-16** — Partida em andamento → **Esperado:** badge "AO VIVO" destacado.
- [ ] **AT-TORNEIO-17** — Tocar numa partida concluída na chave → **Esperado:** abre detalhe da partida com `fromTournament=1` (botão "Ir ao torneio" oculto no rodapé).

### Transmissão ao vivo pública (rota `publicMatchLive` → `/torneios/:tournamentId/ao-vivo/:matchId`)
**Objetivo:** Validar placar público read-only e compartilhamento.
**Pré-condições:** Partida em andamento ou já finalizada.

- [ ] **AT-TORNEIO-18** — Abrir link logado → **Esperado:** placar ao vivo (times, sets, quadra), badge "AO VIVO" se em andamento, botão de compartilhar gera link público.
- [ ] **AT-TORNEIO-19** *(discrepância de código — validar manualmente)* — Abrir o mesmo link **deslogado** → **Esperado documentado:** funcionar sem login (placar público); **porém** a rota não está na allowlist de rotas públicas do router (só `/convite/*` está) — validar se o app redireciona para `/login` em vez de mostrar o placar, e reportar a discrepância se confirmada.

### Gate de acesso a torneios (onboarding/perfil completo)
**Objetivo:** Validar bloqueio de acesso a inscrição para perfil incompleto.
**Pré-condições:** Perfil do atleta com onboarding incompleto e/ou sem WhatsApp/cidade.

- [ ] **AT-TORNEIO-20** — Perfil sem onboarding concluído, abrir hub Competir → **Esperado:** banner "Conclua o cadastro inicial para competir em torneios oficiais." com CTA "Continuar cadastro" → onboarding.
- [ ] **AT-TORNEIO-21** — Onboarding concluído mas faltando WhatsApp e cidade, tocar em "Inscrever minha dupla" → **Esperado:** não abre o wizard; mostra "Falta completar no perfil: WhatsApp e cidade." com CTA "Completar perfil".
- [ ] **AT-TORNEIO-22** — Completar os 3 requisitos (onboarding + WhatsApp válido + cidade) → **Esperado:** banner de bloqueio desaparece; "Inscrever minha dupla" funciona normalmente.

**Não testar (não implementado):** botão de favoritar torneio no hero (snackbar "Favoritos em breve."); cards de categoria/info do torneio comentados na tela de detalhe (inativos hoje).

## 2.7 Inscrição em Torneios

### Verificação de elegibilidade por nível — anti-sandbagging (dentro do wizard de inscrição)
**Objetivo:** Confirmar que o atleta não consegue se inscrever em categoria de nível abaixo do seu.
**Pré-condições:** Atleta com nível declarado por esporte (ex.: Intermediário 2); torneio com categorias em múltiplos níveis (Iniciante 1/2, Intermediário 1/2, Open).

- [ ] **AT-INSCR-01** *(caso principal — anti-sandbagging)* — Atleta "Intermediário 2" tenta selecionar categoria "Iniciante 1" ou "Iniciante 2" → **Esperado:** card aparece **visível mas desabilitado**, com rótulo **"ABAIXO DO SEU NÍVEL"** no lugar do subtítulo; se a seleção for forçada, snackbar de erro: **"Seu nível (Intermediário 2) não permite categorias inferiores. Escolha uma categoria igual ou superior."**
- [ ] **AT-INSCR-02** — Mesmo atleta seleciona categoria "Intermediário 2" (igual) ou "Open" (acima) → **Esperado:** seleção permitida normalmente, sem bloqueio.
- [ ] **AT-INSCR-03** — Atleta sem data de nascimento tenta categoria com restrição de idade → **Esperado:** badge **"COMPLETE SUA DATA DE NASCIMENTO"**; snackbar "Informe sua data de nascimento no perfil para se inscrever nesta categoria."
- [ ] **AT-INSCR-04** — Atleta fora da faixa etária (ex.: categoria Sub-18, atleta com 25 anos) → **Esperado:** badge **"FORA DA FAIXA ETÁRIA"**; snackbar "Você está fora da faixa etária desta categoria ({faixa})."
- [ ] **AT-INSCR-05** — Atleta masculino tenta categoria feminina → **Esperado:** badge **"GÊNERO INCOMPATÍVEL"**; snackbar "Esta categoria é Feminino. Você só pode se inscrever em categorias do seu gênero ou Misto."
- [ ] **AT-INSCR-06** — Atleta sem gênero cadastrado tenta categoria não-Misto → **Esperado:** snackbar "Informe seu gênero no perfil para se inscrever em categorias {gênero}."
- [ ] **AT-INSCR-07** — Categoria com vagas esgotadas → **Esperado:** badge "CATEGORIA LOTADA", não selecionável.
- [ ] **AT-INSCR-08** — Categoria com prazo de inscrição encerrado → **Esperado:** badge "INSCRIÇÕES ENCERRADAS", não selecionável.

### Wizard de inscrição — categoria → uniforme/parceiro → pagamento (rota `tournamentRegistration` → `/torneios/:tournamentId/inscricao`)
**Objetivo:** Validar o fluxo completo de inscrição solo e com dupla.
**Pré-condições:** Perfil completo e elegível (ver gate em 2.6) para pelo menos uma categoria.

- [ ] **AT-INSCR-09** — Selecionar categoria elegível → **Esperado:** card selecionado, resumo de preço aparece, avança no wizard.
- [ ] **AT-INSCR-10** — Categoria exige uniforme: escolher tamanho, número e nome na camisa → **Esperado:** campos aparecem conforme configuração (regata sempre; shorts só se `uniformType=full`; número/nome só se habilitados na categoria); tentar avançar sem preencher gera "Selecione o tamanho da regata." (ou equivalente).
- [ ] **AT-INSCR-11** — Inscrição solo: tocar em "Reserve agora" → **Esperado:** snackbar "Vaga garantida! Pague a metade ou o total — pagando o total, seu parceiro entra sem taxa.", avança para pagamento com card "Convidar parceiro" disponível.
- [ ] **AT-INSCR-12** — A partir de "Convidar parceiro", buscar e convidar um atleta → **Esperado:** convite enviado; tela de espera "Aguardando confirmação" / "{nome} recebeu seu convite." com botões "Reenviar convite"/"Cancelar inscrição".

### PIX da inscrição (rota `tournamentRegistrationPix` → `/torneios/:tournamentId/inscricao/pix`)
**Objetivo:** Validar geração/expiração do PIX no contexto de inscrição (reaproveita os mesmos componentes da reserva de quadra).
**Pré-condições:** Categoria selecionada, inscrição pendente de pagamento.

- [ ] **AT-INSCR-13** — Gerar QR com CPF válido → **Esperado:** QR code, copia-e-cola e contador de expiração, iguais ao fluxo de reserva de quadra.
- [ ] **AT-INSCR-14** — Deixar o PIX expirar → **Esperado:** "PIX expirado" / "Gere um novo código na tela de inscrição.", botão "Voltar à inscrição".
- [ ] **AT-INSCR-15** — Pagamento confirmado (dupla completa e paga) → **Esperado:** snackbar "Inscrição confirmada!" e navegação para a tela de sucesso.
- [ ] **AT-INSCR-16** — Apenas a parcela do atleta paga (aguardando parceiro) → **Esperado:** snackbar "Parcela paga. Aguarde seu parceiro pagar a dele."

### Convite de parceiro — aceitar/recusar (rota pública `tournamentPartnerInvite` → `/torneios-convite/:inviteId`)
**Objetivo:** Validar todos os estados do convite de dupla para torneio.
**Pré-condições:** Convite de parceiro gerado por outro atleta.

- [ ] **AT-INSCR-17** — Abrir link válido, logado, perfil completo → **Esperado:** avatares convidador/convidado, prêmio/taxa, dados do torneio; botão "Continuar"/"Aceitar e formar dupla".
- [ ] **AT-INSCR-18** — Aceitar convite → **Esperado:** "Convite aceito!" / "Sua dupla está formada. Conclua o pagamento da inscrição."; navega para a inscrição em andamento.
- [ ] **AT-INSCR-19** — Recusar convite → **Esperado:** "Convite recusado" / "O organizador será notificado."
- [ ] **AT-INSCR-20** — Abrir link expirado → **Esperado:** "Convite expirado" / "Peça um novo convite ao seu parceiro."
- [ ] **AT-INSCR-21** — Abrir link já aceito anteriormente → **Esperado:** "Convite já aceito." com botão "Ir para inscrição".
- [ ] **AT-INSCR-22** — Abrir link recusado/cancelado → **Esperado:** "Convite indisponível" / "Este convite não está mais disponível."
- [ ] **AT-INSCR-23** *(discrepância de código — validar manualmente)* — Abrir o link **deslogado** → **Esperado documentado:** a própria tela trata esse caso ("Faça login para aceitar o convite."); **porém** `/torneios-convite/` não está na allowlist de rotas públicas do router — validar se o app redireciona direto para `/login` antes de mostrar a tela.
- [ ] **AT-INSCR-24** — Perfil incompleto tenta aceitar convite → **Esperado:** banner de bloqueio aparece, botões de aceitar/recusar desabilitados.

### Meus torneios (rota `myTournaments` → `/competir/meus-torneios`)
**Objetivo:** Validar abas e estados vazios da tela de inscrições do atleta.
**Pré-condições:** Atleta com pelo menos uma inscrição.

- [ ] **AT-INSCR-25** — Abrir com inscrições ativas → **Esperado:** aba "Em andamento" com contador; banner "CHAMADA DE QUADRA" se houver partida sendo chamada agora, senão "PRÓXIMA PARTIDA".
- [ ] **AT-INSCR-26** — Nenhum torneio em andamento → **Esperado:** "Nenhum torneio em andamento" / "Você não está inscrito em nenhum torneio ativo..." com botão "Explorar torneios" e sugestões de torneios abertos perto.
- [ ] **AT-INSCR-27** — Aba "Concluídos" com torneios finalizados → **Esperado:** lista com estatísticas de temporada (títulos/pódios hoje aparecem como "—"; pontos de ranking reais).

**Não testar (não implementado):** edição de inscrição (trocar parceiro/nível/cidade) — não existe do lado do atleta.

## 2.8 Ligas (visão do atleta)

### Detalhe da liga (rota `leagueDetail` → `/ligas/:leagueId`)
**Objetivo:** Validar as 4 abas e a navegação para torneios-etapa.
**Pré-condições:** Liga publicada com pelo menos 1 etapa vinculada a um torneio.

- [ ] **AT-LIGA-01** — Abrir detalhe da liga → **Esperado:** hero com badge de status (ex. "EM ANDAMENTO"/"INSCRIÇÕES ABERTAS"), abas "Visão geral", "Etapas", "Ranking", "Regulamento".
- [ ] **AT-LIGA-02** — Aba "Visão geral" → **Esperado:** preview do ranking (top 5) com "Ver ranking completo →" pulando direto para a aba Ranking.
- [ ] **AT-LIGA-03** — Aba "Etapas" → **Esperado:** lista das etapas com nome/data e os torneios vinculados a cada uma.
- [ ] **AT-LIGA-04** — Liga sem etapas publicadas → **Esperado:** "As etapas desta liga ainda não foram publicadas."
- [ ] **AT-LIGA-05** — Etapa sem torneio vinculado → **Esperado:** "Torneios desta etapa em breve."
- [ ] **AT-LIGA-06** — Tocar num torneio-etapa → **Esperado:** navega para o detalhe normal do torneio (`/torneios/:tournamentId`), mesma tela usada fora do contexto de liga.
- [ ] **AT-LIGA-07** *(confirmação de arquitetura)* — Tentar encontrar um wizard de inscrição específico da liga → **Esperado:** **não existe**; a inscrição é feita normalmente pelo botão "Inscrever minha dupla" dentro de cada torneio-etapa (mesmo fluxo de 2.7).

### Ranking da temporada (aba "Ranking" da liga)
**Objetivo:** Validar cálculo/exibição de pontos e destaque do próprio atleta.
**Pré-condições:** Liga com pelo menos 1 etapa encerrada e resultados.

- [ ] **AT-LIGA-08** — Abrir aba Ranking → **Esperado:** tabela posição/nome/pontos; toggle "Duplas"/"Atletas"; filtros de gênero por chip; linha do próprio atleta destacada com badge "VOCÊ".
- [ ] **AT-LIGA-09** — Verificar indicador do critério de pontuação → **Esperado:** rótulo (ex. "4 melhores de 6 etapas") aparece no cabeçalho do ranking e no resumo do regulamento, refletindo a configuração do organizador.
- [ ] **AT-LIGA-10** — Nenhuma etapa encerrada ainda → **Esperado:** "O ranking aparece aqui conforme as etapas forem encerradas."

### Regulamento e status da liga
- [ ] **AT-LIGA-11** — Aba "Regulamento" com descrição preenchida → **Esperado:** resumo (modo de contagem, nº de etapas, vagas na Grande Final se houver) + texto livre do organizador.
- [ ] **AT-LIGA-12** — Liga sem descrição de regulamento → **Esperado:** "O organizador ainda não publicou o regulamento completo. Entre em contato com [organizador] para mais detalhes sobre pontuação, desempates e classificação."
- [ ] **AT-LIGA-13** — Liga cancelada/encerrada → **Esperado:** banner vermelho no topo com a mensagem correspondente ("Este circuito foi cancelado." / "Temporada encerrada — novas inscrições não estão disponíveis." / "Circuito encerrado." / "Temporada concluída.").
- [ ] **AT-LIGA-14** — Tocar no ícone de favoritar/bookmark no hero → **Esperado:** snackbar "Em breve." (não implementado).
- [ ] **AT-LIGA-15** — Tocar em compartilhar → **Esperado:** share sheet com "Confira a liga {nome} no NexaGO!"

## 2.9 Duplas e equipes

### Descobrir duplas (rota `teamDiscover` → `/competir/duplas`)
**Objetivo:** Validar busca, filtros e ordenação do catálogo de duplas.
**Pré-condições:** Existem duplas cadastradas na base.

- [ ] **AT-DUPLA-01** — Abrir "Descobrir duplas" → **Esperado:** lista com busca, chips de gênero, ordenação (Ranking/Proximidade/Em alta).
- [ ] **AT-DUPLA-02** — Buscar por nome de dupla/atleta/cidade → **Esperado:** lista filtra com debounce (~350ms).
- [ ] **AT-DUPLA-03** — Abrir filtros avançados e aplicar "Status da parceria: Procura dupla" → **Esperado:** lista mostra só duplas com badge "PROCURA DUPLA"; botão de aplicar mostra "Ver N duplas".
- [ ] **AT-DUPLA-04** — Nenhuma dupla encontrada com os filtros → **Esperado:** "Nenhuma dupla encontrada."

### Perfil público da dupla (rota `teamProfile` → `/competir/duplas/:teamId`)
**Objetivo:** Validar seções de estatísticas, histórico e confrontos.
**Pré-condições:** Dupla com campanhas registradas.

- [ ] **AT-DUPLA-05** — Tocar num card de dupla → **Esperado:** abre o perfil público.
- [ ] **AT-DUPLA-06** — Verificar seções → **Esperado:** header com avatares/ranking, estatísticas (Jogos/Vitória%/Títulos/Pts), atletas da dupla, abas "Visão geral"/"Histórico"/"Confrontos".
- [ ] **AT-DUPLA-07** — Dupla sem campanhas registradas → **Esperado:** "Nenhuma campanha registrada ainda." (Visão geral); "Histórico vazio por enquanto." (Histórico); "Ainda não há confrontos registrados." (Confrontos).

### Seguir dupla
**Objetivo:** Validar toggle de follow/unfollow.
**Pré-condições:** Atleta logado, visualizando dupla que não é a sua.

- [ ] **AT-DUPLA-08** — Seguir uma dupla → **Esperado:** botão muda de "Seguir dupla" para "Seguindo".
- [ ] **AT-DUPLA-09** — Tentar seguir deslogado → **Esperado:** snackbar "Faça login para seguir duplas."
- [ ] **AT-DUPLA-10** — Abrir o perfil da própria dupla → **Esperado:** botão de seguir **não aparece**.
- [ ] **AT-DUPLA-11** — Verificar se há contador de seguidores → **Esperado:** **não existe** nenhum contador exibido, apenas o estado Seguir/Seguindo.
- [ ] **AT-DUPLA-12** — Verificar se há botão "Desafiar dupla" no perfil → **Esperado:** **não aparece** hoje (infraestrutura existe no código, mas o botão foi removido da UI atual) — confirmar ausência, não reportar como bug.

**Não testar (não implementado):** "Desafiar dupla" (botão não renderizado; se reativado, o texto esperado é snackbar "Desafiar dupla — em breve.").

## 2.10 Partidas e Histórico

### Histórico de partidas/torneios (rota `athleteMatchHistory` → `/athlete/history`)
**Objetivo:** Validar abas, filtros e estatísticas de temporada.
**Pré-condições:** Atleta com partidas e torneios concluídos em diferentes resultados.

- [ ] **AT-PARTIDA-01** — Abrir "Histórico" → **Esperado:** abas "Partidas (N)" e "Torneios (N)"; card de temporada com % de aproveitamento e gráfico de barras mensal.
- [ ] **AT-PARTIDA-02** — Aplicar filtro "Vitórias" → **Esperado:** lista mostra só partidas vencidas, agrupadas por mês com "N JOGOS · XV YD".
- [ ] **AT-PARTIDA-03** — Filtro sem nenhuma partida correspondente → **Esperado:** "Nenhuma partida neste filtro."
- [ ] **AT-PARTIDA-04** — Aba "Torneios" → **Esperado:** linha de estatísticas (Torneios/Ouros/Prata/Bronze) + cards de torneios com posição final.
- [ ] **AT-PARTIDA-05** *(gap identificado)* — Atleta sem nenhum torneio concluído, abrir aba "Torneios" → **Esperado hoje:** linha de estatísticas zerada, **sem** mensagem de estado vazio dedicada — validar se é aceitável.

### Detalhe da partida (rota `athleteMatchDetail` → `/athlete/history/match/:matchId`)
**Objetivo:** Validar placar, momentum, head-to-head e XP.
**Pré-condições:** Partidas em cada fase (agendada, ao vivo, concluída, cancelada).

- [ ] **AT-PARTIDA-06** — Abrir detalhe de partida concluída (vitória) → **Esperado:** placar por set, card de XP "+{xp} XP • você subiu para {nível}", seções Momentum, Set a set, Ponto a ponto (resumo), Head-to-head, Onde & Quando.
- [ ] **AT-PARTIDA-07** — Abrir detalhe de partida concluída (derrota) → **Esperado:** card de XP **não aparece** (só exibido em vitória, para o participante).
- [ ] **AT-PARTIDA-08** — Set com menos de 4 pontos registrados → **Esperado:** seção Momentum inteira **não aparece**.
- [ ] **AT-PARTIDA-09** — Arrastar o dedo pelo gráfico de momentum → **Esperado:** card de detalhe do ponto mais próximo atualiza ("Início do set" ou "Ponto de {horário}" + placar).
- [ ] **AT-PARTIDA-10** — Seção Head-to-head contra adversário com histórico → **Esperado:** até 3 confrontos passados com resultado (V/D) e placar de sets; barra de proporção vitórias/derrotas.
- [ ] **AT-PARTIDA-11** — Abrir detalhe de partida cancelada → **Esperado:** apenas hero + "Esta partida foi cancelada." (demais seções ocultas).
- [ ] **AT-PARTIDA-12** — Abrir detalhe de partida agendada (futura) → **Esperado:** countdown, forma recente, head-to-head, "Onde & Quando" — sem placar/momentum.
- [ ] **AT-PARTIDA-13** — Tocar em "Ver ponto a ponto →" → **Esperado:** abre a tela cheia de play-by-play.
- [ ] **AT-PARTIDA-17** — Abrir detalhe a partir da chave do torneio ou da campanha (`fromTournament=1`) → **Esperado:** botão "Ir ao torneio" **não aparece** no rodapé.
- [ ] **AT-PARTIDA-18** — Abrir o mesmo detalhe a partir do Histórico geral → **Esperado:** botão "Ir ao torneio" **aparece** normalmente.
- [ ] **AT-PARTIDA-21** *(confirmar ausência)* — Procurar botões "Revanche" e "Perfil deles" no rodapé de partida concluída → **Esperado:** **não aparecem** (código comentado); se reativados, o texto esperado seria snackbar "Em breve." em ambos.
- [ ] **AT-PARTIDA-22** — Simular falha de rede ao carregar o histórico → **Esperado:** "Não foi possível carregar o histórico."

### Play-by-play (rota `athleteMatchPlayByPlay` → `/athlete/history/match/:matchId/play-by-play`)
**Objetivo:** Validar navegação entre sets e a timeline de pontos.
**Pré-condições:** Partida concluída com pontos registrados em pelo menos 2 sets.

- [ ] **AT-PARTIDA-14** — Tocar num chip de set diferente (ex. "SET 2") → **Esperado:** timeline rola para os pontos daquele set.
- [ ] **AT-PARTIDA-15** — Set sem pontos registrados → **Esperado:** "Sem pontos registrados neste set."
- [ ] **AT-PARTIDA-16** — Verificar badge "★ MAIOR SEQUÊNCIA DO SET" → **Esperado:** aparece no bloco com mais pontos consecutivos.

### Detalhe do torneio — campanha do atleta (rota `athleteTournamentDetail` → `/athlete/history/tournament/:tournamentId`)
**Objetivo:** Validar a visão de progressão pessoal do atleta no torneio (diferente do detalhe geral do torneio).
**Pré-condições:** Atleta com campanha registrada em um torneio concluído.

- [ ] **AT-PARTIDA-19** — Abrir campanha de torneio em que o atleta foi campeão → **Esperado:** badge "CAMPEÃO • 1º LUGAR", estatísticas (Jogos/V/D/XP, XP = vitórias × 40), timeline de partidas com bolinha dourada + troféu na final.
- [ ] **AT-PARTIDA-20** — Atleta invicto no torneio (0 derrotas, ao menos 1 vitória) → **Esperado:** cabeçalho da campanha mostra tag "INVICTO".

**Não testar (não implementado):** botões "Revanche"/"Perfil deles" (comentados, não renderizados), botões "Lembrar-me"/"Ver chave" na seção "Onde & Quando" (comentados).

## 2.11 Gamificação

### XP e níveis (cross-cutting, sem tela própria)
**Objetivo:** validar a concessão de XP e o cálculo de nível.
**Pré-condições:** atleta logado com histórico de reservas/jogos.

- [ ] **AT-GAM-01** — Concluir uma reserva/jogo → **Esperado:** +50 XP creditado após o término (processado no servidor), refletido no app ao atualizar.
- [ ] **AT-GAM-02** — Verificar cálculo de nível em diferentes faixas de XP → **Esperado:** nível = XP ÷ 100; nomes: 1 "Iniciante", 2 "Estreante", 3 "Bola na rede", 4 "Veterano", 5 "Elite", 6+ "Nível N".
- [ ] **AT-GAM-03** — Completar a missão "Jogue 1x hoje" (reserva encerrada + até 5 min de tolerância) → **Esperado:** +40 XP e streak +1.
- [ ] **AT-GAM-04** — Completar "Reserve uma quadra hoje" → **Esperado:** +35 XP e streak +1.
- [ ] **AT-GAM-05** — Favoritar uma arena → **Esperado:** missão "Favorite uma arena" concluída automaticamente (via trigger server), +15 XP — pode levar alguns segundos para refletir.
- [ ] **AT-GAM-06** — Abrir o detalhe de um torneio → **Esperado:** missão "Explore um torneio" concluída, +20 XP.
- [ ] **AT-GAM-07** — Completar a mesma missão duas vezes no mesmo dia → **Esperado:** XP **não** é duplicado na segunda vez.
- [ ] **AT-GAM-08** — Ficar 2+ dias sem nenhuma atividade elegível a streak → **Esperado:** streak reseta para 1 na próxima atividade.
- [ ] **AT-GAM-09** — Virar o dia (meia-noite local) → **Esperado:** novo conjunto de missões "0/5" aparece.

### Tela Quest (rota `/athlete/quest`)
**Pré-condições:** logado como atleta.

- [ ] **AT-GAM-10** — Abrir a tela → **Esperado:** hero de streak (dots seg-dom), card de nível com barra de progresso, missões do dia com texto "RESETA 24:00".
- [ ] **AT-GAM-11** — Tocar em missão incompleta "Favorite uma arena" → **Esperado:** navega à aba Reservar com snackbar "Abra uma arena e toque no coração para favoritar."
- [ ] **AT-GAM-12** — Tocar em missão incompleta "Compartilhe seu perfil" → **Esperado:** navega ao perfil com snackbar "Toque em compartilhar no topo do seu perfil." — **validar se esse botão realmente existe** (ver observação AT-PERFIL-46; se não existir, a missão fica impossível de concluir por esse caminho).
- [ ] **AT-GAM-13** — Puxar a lista para atualizar → **Esperado:** **não existe** pull-to-refresh nesta tela; é preciso sair e voltar para atualizar os dados.

### Conquistas (rota `/athlete/achievements`)
**Pré-condições:** logado como atleta.

- [ ] **AT-GAM-14** — Abrir a tela → **Esperado:** exatamente 24 conquistas em 3 categorias (Primeiros Passos, Constância, Social), 8 cada.
- [ ] **AT-GAM-15** — Tocar em uma conquista (bloqueada ou desbloqueada) → **Esperado:** nenhuma ação ocorre — os cards não são clicáveis, é comportamento atual esperado, não bug.
- [ ] **AT-GAM-16** — Desbloquear uma conquista nova (ex. completar 5 jogos) e reabrir a tela → **Esperado:** card muda de estado silenciosamente, sem sheet de feedback automático ao entrar na tela.

### Feedback de XP (sheet animado)
**Pré-condições:** qualquer ação que gere XP.

- [ ] **AT-GAM-17** — Completar uma missão diária → **Esperado:** sheet animado com "+N XP" e nome da missão; fecha só ao arrastar/tocar fora (sem timer automático).
- [ ] **AT-GAM-18** — Completar missão que também aumenta o streak → **Esperado:** sheet mostra "🔥 Streak aumentado para N dias!"
- [ ] **AT-GAM-19** — Desbloquear conquista junto com XP de missão → **Esperado:** sheet mostra o chip da conquista desbloqueada.
- [ ] **AT-GAM-20** — Completar um passo em "Completar perfil" → **Esperado:** sheet de XP também aparece a partir dessa tela.

**Não testar (não implementado):** Big Quest / Liga semanal (dados mock, UI comentada, sem forma de acesso); missão diária "Convide 1 jogador" (comentada no catálogo, não ativa).

## 2.12 Ranking

### Ranking geral (rota `/competir/ranking`)
**Objetivo:** validar pódio, busca, filtros de ano/gênero/nível e o modo atleta/dupla — **atenção máxima ao filtro de nível, área mais recentemente alterada do app**.
**Pré-condições:** logado como atleta; existir ao menos alguns atletas/duplas ranqueados com níveis diferentes, e pelo menos um atleta sem esporte principal/nível definido.

- [ ] **AT-RANK-01** — Abrir o Ranking → **Esperado:** pódio top 3 + lista a partir do 4º, modo "Atletas" selecionado, ano atual como filtro padrão, chip "Todos os níveis".
- [ ] **AT-RANK-02** — Trocar para o modo "Duplas" → **Esperado:** pódio/lista mudam para o ranking de duplas.
- [ ] **AT-RANK-03** — Tocar no chip de nível (padrão "Todos os níveis") → **Esperado:** abre bottom sheet "Filtrar por nível" com "Todos os níveis" (marcado), "Iniciante 1", "Iniciante 2", "Intermediário 1", "Intermediário 2", "Open".
- [ ] **AT-RANK-04** — Selecionar "Intermediário 1" → **Esperado:** sheet fecha, chip passa a mostrar "Intermediário 1", lista/pódio recalculam mostrando só atletas com esse nível resolvido no esporte principal.
- [ ] **AT-RANK-05** — Reabrir o filtro e selecionar "Todos os níveis" → **Esperado:** o filtro desmarca corretamente e a lista volta ao ranking completo (este é exatamente o bug corrigido no commit `7d9784c` — confirmar que não regrediu).
- [ ] **AT-RANK-06** — Abrir o filtro e fechar arrastando para baixo sem escolher nada → **Esperado:** filtro permanece no valor anterior, sem mudança.
- [ ] **AT-RANK-07** — Aplicar um filtro de nível que resulte em só 1 atleta qualificado → **Esperado:** pódio mostra apenas a coluna central (1º lugar); colunas 2º/3º aparecem vazias sem quebrar o layout.
- [ ] **AT-RANK-08** — Aplicar um filtro de nível sem nenhum atleta qualificado → **Esperado:** "Nenhum atleta no ranking para este filtro." (no modo duplas: "Nenhuma dupla no ranking para este filtro.").
- [ ] **AT-RANK-09** — Combinar filtro de nível + filtro de gênero (ícone no app bar) + um ano específico → **Esperado:** os três filtros se combinam corretamente (interseção).
- [ ] **AT-RANK-10** — No modo "Duplas", aplicar filtro de nível numa dupla com parceiros de níveis diferentes (ex. Iniciante 1 e Open) → **Esperado:** a dupla é classificada pelo nível **maior** dos dois (Open) — regra "vale o mais forte".
- [ ] **AT-RANK-11** — Com um filtro de nível aplicado, abrir o perfil de um atleta da lista e voltar → **Esperado:** o filtro de nível continua aplicado (estado preservado durante a sessão).
- [ ] **AT-RANK-12** — Fechar o app completamente, reabrir e voltar ao Ranking → **Esperado:** filtro de nível volta ao padrão "Todos os níveis" (não é persistido em disco).
- [ ] **AT-RANK-13** — Localizar um atleta sem esporte principal (ou sem nível salvo nele) com filtro "Todos os níveis" → **Esperado:** aparece normalmente na lista, mas sem rótulo de nível na linha.
- [ ] **AT-RANK-14** — Mesmo atleta do caso anterior, agora com um filtro de nível específico (ex. "Open") aplicado → **Esperado:** o atleta **não aparece** (excluído por não ter nível resolvido).
- [ ] **AT-RANK-15** — Buscar por nome com um filtro de nível ativo → **Esperado:** busca opera sobre o conjunto já filtrado; sem resultado mostra "Nenhum resultado para "{termo}"." (mensagem diferente da de filtro vazio).
- [ ] **AT-RANK-16** — Trocar o ano da temporada com filtro de nível ativo → **Esperado:** ambos os filtros continuam combinados corretamente.
- [ ] **AT-RANK-17** — Puxar para atualizar (pull-to-refresh) → **Esperado:** recarrega os dados (invalida cache).
- [ ] **AT-RANK-18** — Simular falha ao carregar (sem rede) → **Esperado:** "Não foi possível carregar o ranking."
- [ ] **AT-RANK-19** — Como usuário logado fora do top 3, rolar a lista e depois trocar o filtro de nível (mantendo modo/ano/gênero) → **Esperado:** o card do próprio atleta, que fica "flutuando" perto do rodapé, recalcula corretamente sem duplicar/sobrepor — atenção especial aqui: há uma fragilidade conhecida no código onde a troca de filtro de nível pode não resetar esse estado "flutuante" quando a posição do usuário coincide entre os dois filtros.
- [ ] **AT-RANK-20** — Tocar no ícone de informação ("Como funciona") → **Esperado:** abre sheet explicando o cálculo de pontos.
- [ ] **AT-RANK-21** — Aplicar um filtro de nível na tela de Ranking, depois abrir o preview de ranking na aba Competir → **Esperado:** o preview sempre mostra o ranking **geral**, sem herdar o filtro de nível aplicado na tela completa.
- [ ] **AT-RANK-22** — Com o mesmo filtro aplicado, conferir a posição exibida no perfil próprio → **Esperado:** também é sempre a posição geral, independente do filtro usado no Ranking.

## 2.13 Notificações

### Push (FCM)
**Objetivo:** validar permissões, entrega e navegação por deep link.
**Pré-condições:** dispositivo físico ou emulador com Google Play Services/APNs configurado.

- [ ] **AT-NOTIF-01** — Abrir o app pela primeira vez → **Esperado:** solicitação de permissão de notificação do sistema aparece.
- [ ] **AT-NOTIF-02** — Negar a permissão → **Esperado:** token do dispositivo não é salvo (ou é removido); pushes não chegam.
- [ ] **AT-NOTIF-03** — Receber push com o app em primeiro plano → **Esperado:** banner local aparece (canal "NexaGO", importância alta).
- [ ] **AT-NOTIF-04** — Receber push com o app em segundo plano/fechado e tocar na notificação → **Esperado:** abre o app navegando direto para a tela correspondente; testar ao menos convite de torneio, chave publicada, slot disponível.
- [ ] **AT-NOTIF-05** — (iOS) Simular demora no registro do token APNs → **Esperado:** token eventualmente é registrado (até ~12 tentativas), sem travar o app.

### Caixa de entrada (rota `/athlete/notifications`)
**Pré-condições:** conta com histórico de notificações.

- [ ] **AT-NOTIF-06** — Abrir com notificações não lidas → **Esperado:** chip "Não lidas" com contador; itens agrupados por "HOJE"/"ONTEM"/data.
- [ ] **AT-NOTIF-07** — Tocar "Ler tudo" → **Esperado:** todas marcadas como lidas; ação fica desabilitada com contagem zerada.
- [ ] **AT-NOTIF-08** — Filtrar por "Não lidas" sem nenhuma pendente → **Esperado:** "Nenhuma notificação não lida."
- [ ] **AT-NOTIF-09** — Caixa totalmente vazia → **Esperado:** "Você não tem notificações."
- [ ] **AT-NOTIF-10** — Tocar no "X" de dispensar uma notificação → **Esperado:** anima a remoção (fade + slide) e a remove definitivamente.
- [ ] **AT-NOTIF-11** — Notificação de convite de torneio com ações "Aceitar"/"Recusar" → **Esperado:** recusar aciona a function e atualiza o estado; aceitar navega ao fluxo de inscrição/aceite.
- [ ] **AT-NOTIF-12** — Notificação de convite de reserva → **Esperado:** tocar "Recusar" apenas orienta "Abra o convite para recusar na tela de detalhes." (não recusa direto na lista).
- [ ] **AT-NOTIF-13** — Notificação de "slot disponível" → **Esperado:** destaque visual (chama vermelha) com ação "Entrar".

### Preferências de notificação (rota `/athlete/settings/notifications`)
**Pré-condições:** logado como atleta.

- [ ] **AT-NOTIF-14** — Procurar a entrada "Notificações" no menu de Configurações → **Esperado:** hoje **não há** item visível no menu (comentado no código, "TODO: adicionar quando implementado na próxima versão"); a tela só é acessível navegando diretamente à rota. Validar com produto se isso é aceitável para o lançamento, já que a funcionalidade em si funciona.
- [ ] **AT-NOTIF-15** — Desativar o canal "Push" → **Esperado:** token de push local é removido; notificações push param de chegar.
- [ ] **AT-NOTIF-16** — Tentar ativar o canal "WhatsApp" sem telefone válido no perfil → **Esperado:** opção desabilitada com snackbar "Cadastre seu WhatsApp no perfil."
- [ ] **AT-NOTIF-17** — Ativar "Não perturbe" e configurar horário via bottom sheet → **Esperado:** label mostra "Das {início} às {fim}"; validar (com apoio de backend) que pushes realmente são suprimidos nesse intervalo.
- [ ] **AT-NOTIF-18** — Desmarcar um tópico específico (ex. "Promoções e novidades") → **Esperado:** notificações desse tópico param de chegar; os demais continuam normalmente.

## 2.14 Configurações e conta

### Configurações gerais (rota `/athlete/settings`)
**Objetivo:** validar a navegação geral e as ações de conta.
**Pré-condições:** logado como atleta.

- [ ] **AT-CONF-01** — Abrir Configurações → **Esperado:** seções CONTA, ACESSO (só se multi-role), PREFERÊNCIAS, SOBRE, e ações "Sair da conta"/"Excluir conta"; rodapé "nexaGO · v1.0.0 · build 1".
- [ ] **AT-CONF-02** — Tocar "Termos e privacidade" → **Esperado:** bottom sheet com links "Termos de uso"/"Política de privacidade" abrindo em navegador externo.
- [ ] **AT-CONF-03** — Tocar "Convidar amigos" → **Esperado:** abre compartilhamento; validar se a recompensa de +50 XP é realmente creditada ao completar.
- [ ] **AT-CONF-04** — Tocar "Ajuda e suporte" → **Esperado:** navega/abre o canal de suporte esperado sem travar o app.

### Privacidade e segurança (rota `/athlete/settings/privacy`)
**Pré-condições:** logado como atleta.

- [ ] **AT-CONF-05** — Selecionar visibilidade "Privado" → **Esperado:** salva automaticamente (debounce); ao visitar o próprio perfil como outro usuário, aparece "Este perfil é privado."
- [ ] **AT-CONF-06** — Selecionar "Público"/"Apenas amigos" → **Esperado:** salva e reflete a descrição correta de cada opção.
- [ ] **AT-CONF-07** — Ativar "Face ID" em dispositivo com biometria cadastrada → **Esperado:** toggle liga; próxima abertura do app pede biometria antes de mostrar conteúdo, com fallback "Entrar com senha".
- [ ] **AT-CONF-08** — Ativar "Face ID" em dispositivo sem biometria cadastrada/sem suporte → **Esperado:** erro "Cadastre Face ID ou impressão digital nas configurações do aparelho."; o toggle reverte para desligado.
- [ ] **AT-CONF-09** — Com biometria ativada, reabrir o app numa conta sem e-mail (login só social sem e-mail) → **Esperado:** diálogo "Conta sem e-mail" orientando logout (fallback de senha não se aplica).

### Alterar senha (rota `/athlete/settings/privacy/change-password`)
**Pré-condições:** conta de teste com login por e-mail/senha.

- [ ] **AT-CONF-10** — Preencher senha atual correta + nova senha forte + confirmação igual → **Esperado:** sucesso, tela de feedback "Senha atualizada".
- [ ] **AT-CONF-11** — Senha atual incorreta → **Esperado:** erro "Senha incorreta." (ou "Credenciais inválidas. Verifique e-mail e senha.").
- [ ] **AT-CONF-12** — Nova senha fraca → **Esperado:** erro "A nova senha não atende aos requisitos mínimos."
- [ ] **AT-CONF-13** — Confirmação diferente da nova senha → **Esperado:** erro "As senhas não coincidem."
- [ ] **AT-CONF-14** — Repetir com conta logada só via Google/Apple (sem provider de senha) → **Esperado:** tela mostra aviso + botão "Enviar link de redefinição" em vez dos 3 campos.

### Sessões ativas (rota `/athlete/settings/privacy/sessions`)
**Pré-condições:** conta logada em 2+ dispositivos.

- [ ] **AT-CONF-15** — Abrir a tela → **Esperado:** lista por plataforma (iPhone/Android/Web/Mac) com "Ativo em DD/MM/AAAA HH:mm"; dispositivo atual marcado "(este dispositivo)" sem botão de revogar.
- [ ] **AT-CONF-16** — Tocar "Revogar" em outro dispositivo → **Esperado:** remove o token push daquele dispositivo — atenção: isso **não** invalida uma sessão de autenticação real, só o push; validar com produto se o rótulo "sessões ativas" não gera expectativa equivocada de logout remoto.
- [ ] **AT-CONF-17** — Procurar um botão "Encerrar todas as sessões" → **Esperado:** **não existe** — só revogação individual.

### Sair da conta
- [ ] **AT-CONF-18** — Tocar "Sair da conta" → **Esperado:** desloga imediatamente **sem pedir confirmação** (token FCM local removido, Firebase + Google signOut), volta à tela de login.

### Exclusão de conta (P0 de lançamento)
**Objetivo:** validar o fluxo completo de exclusão de conta, com atenção redobrada a erros e cancelamento.
**Pré-condições:** usar uma conta de teste descartável (a exclusão é irreversível).

- [ ] **AT-CONF-19** — Tocar "Excluir conta" → **Esperado:** dialog "Excluir conta?" com corpo "Esta ação é permanente. Seus dados de perfil, preferências e notificações serão apagados e você perderá o acesso à conta. Registros de torneios e pagamentos podem ser retidos por exigência legal. Não é possível desfazer." e botões "Cancelar" / "Excluir minha conta" (vermelho).
- [ ] **AT-CONF-20** — Tocar "Cancelar" no dialog → **Esperado:** nada acontece, a conta permanece intacta.
- [ ] **AT-CONF-21** — Tocar "Excluir minha conta" com backend disponível → **Esperado:** loading bloqueante em tela cheia durante a chamada; ao concluir, sessão local é limpa e o app volta ao login automaticamente (sem tela de despedida).
- [ ] **AT-CONF-22** — Simular falha de rede durante a exclusão → **Esperado:** loading fecha, snackbar "Não foi possível excluir a conta agora. Tente novamente."; conta permanece intacta.
- [ ] **AT-CONF-23** — EDGE CASE CRÍTICO — simular falha apenas na remoção do login (Auth) depois de os dados já terem sido apagados no backend → **Esperado documentado no backend:** mensagens diferenciadas ("dados apagados, mas conta de acesso não pôde ser removida — contate o suporte"); **porém hoje o app mostra sempre a mesma mensagem genérica** do AT-CONF-22 para qualquer erro — reportar como gap: o usuário pode tentar excluir de novo achando que nada ocorreu, quando os dados já foram apagados.
- [ ] **AT-CONF-24** — Verificar se é pedida reautenticação (senha) antes da exclusão → **Esperado:** **não há** reautenticação client-side — só a confirmação do dialog; validar com produto se isso é aceitável dado o tema sensível (LGPD).
- [ ] **AT-CONF-25** — Após excluir com sucesso, tentar logar de novo com as mesmas credenciais → **Esperado:** login falha (conta não existe mais).

**Não testar (não implementado):** "Idioma" (mostra só "Português", ação "Em breve."); "Pagamentos" (ação "Em breve."); "Aparência" como item do menu principal (comentado/oculto).

## 2.15 Comunidade

### Aba Comunidade (rota `/discover`, aba índice 4)
**Objetivo:** validar o feed automático (ranking em destaque + eventos gerados pelo sistema) — confirmar que **não há** criação manual de post. Esta seção estava marcada como placeholder/órfã no levantamento original (`features-by-role.md`), mas está **confirmadamente ativa** no código atual (`athlete_shell_page.dart`, aba índice 4).
**Pré-condições:** logado como atleta; existir ao menos um torneio recém-aberto ou com campeões definidos para popular o feed.

- [ ] **AT-COMUN-01** — Abrir a aba Comunidade → **Esperado:** header "Comunidade", card de posição do usuário (se ranqueado), seção "Ranking em destaque" com label "TOP 10 · TEMPORADA {ano}" ou "TOP 10 · RANKING GERAL", lista de até 10 posições, botão "Ver ranking completo".
- [ ] **AT-COMUN-02** — Usuário sem posição no ranking → **Esperado:** o card de posição do usuário simplesmente não aparece; resto da tela funciona normalmente.
- [ ] **AT-COMUN-03** — Procurar qualquer botão de "criar post", FAB ("+") ou campo de composição de texto na tela inteira → **Esperado:** **não existe nenhum** — a aba é 100% automática, sem UGC.
- [ ] **AT-COMUN-04** — Rolar até "Últimas da comunidade" com itens disponíveis → **Esperado:** cards mostram badge "INSCRIÇÕES ABERTAS" (ícone de megafone) ou "CAMPEÕES" (ícone de troféu), nome do torneio, cidade/data e, para campeões, a lista de duplas/categorias vencedoras.
- [ ] **AT-COMUN-05** — Tocar em um card do feed → **Esperado:** navega para o detalhe do torneio relacionado.
- [ ] **AT-COMUN-06** — Nenhum evento recente (feed vazio) → **Esperado:** a seção "Últimas da comunidade" desaparece silenciosamente, sem mensagem de vazio.
- [ ] **AT-COMUN-07** — Tentar curtir/comentar/compartilhar um item do feed → **Esperado:** nenhuma dessas ações existe — os cards são somente leitura, só tocáveis para navegar.
- [ ] **AT-COMUN-08** — Temporada sem nenhum resultado oficial ainda → **Esperado:** "O ranking aparece aqui após os primeiros resultados oficiais da temporada."
- [ ] **AT-COMUN-09** — Simular falha ao carregar o ranking (sem rede) → **Esperado:** "Não foi possível carregar o ranking."
- [ ] **AT-COMUN-10** — Tocar "VER COMPLETO" ou "Ver ranking completo" → **Esperado:** navega para a tela de Ranking completa (`/competir/ranking`).

---

# 2. Papel: Organizador

Entrada: **`/organizer`**. Painel operacional é 100% mobile; não há painel web equivalente.

## 3.1 Acesso e Home

### Home do organizador (rota `organizerHome` — `/organizer`)
**Objetivo:** Listar eventos do organizador (torneios/ligas), mostrar KPIs e dar acesso a criação/rascunhos.
**Pré-condições:** Logado como organizador; ter ao menos 1 torneio/liga publicado e 1 em rascunho para cobertura completa.

- [ ] **OR-HOME-01** — Abrir `/organizer` com torneios e ligas publicados → **Esperado:** cards listados ordenados por `updatedAt` desc, badge "TORNEIO"/"LIGA" no hero, badge de status (Publicado/Rascunho/Encerrada/Cancelada) e, se evento começa em ≤14 dias e está com inscrições abertas, badge live "Inscrições abertas".
- [ ] **OR-HOME-02** — Conferir os 3 KPIs no topo ("Eventos ativos", "Inscritos no total", "Arrecadado") → **Esperado:** "Eventos ativos" conta status `open`/`draft`; "Arrecadado" soma `collectedCents` só de torneios (formata compacto ex. "R$ 1,2K" acima de R$1000).
- [ ] **OR-HOME-03** — Tocar filtro "Ligas" → **Esperado:** só cards com `_kind == league`. Tocar "Torneios" → **Esperado:** só torneios que não pertencem a uma liga (`leagueId == null`); etapas de liga ficam de fora desse filtro. Tocar "Tudo" → volta a listar todos.
- [ ] **OR-HOME-04** — Estado vazio: filtrar "Ligas" sem nenhuma liga → **Esperado:** texto "Nenhuma liga ainda. Crie um circuito para começar."; no filtro "Tudo"/"Torneios" vazio → "Nenhum evento ainda. Toque em criar evento para começar."
- [ ] **OR-HOME-05** — Card de torneio publicado: botão "Gerenciar inscrições" → **Esperado:** navega para o hub do torneio (`organizerTournamentDetail`). Card de liga publicada: botão "Ver circuito" → **Esperado:** navega para `leagueDetail`.
- [ ] **OR-HOME-06** — No card `⋮` (mais) de uma liga com status `open` → **Esperado:** abre sheet de ações da liga (ver 3.3); em torneio, abre direto o hub.
- [ ] **OR-HOME-07** — Tocar "Criar" (ação central da bottom bar) → **Esperado:** abre `organizerCreate` (chooser torneio vs. liga), a menos que haja rascunho local significativo (nome preenchido) — nesse caso mostra diálogo "Cadastro em andamento" com "Continuar cadastro" / "Começar do zero".
- [ ] **OR-HOME-08** — Rascunho local de torneio em andamento (nome preenchido, ainda não salvo) → **Esperado:** banner "Torneio em andamento" com nome e "passo X/6"; botão "Continuar" retoma no passo certo; "Descartar" apaga o rascunho local (e remoto, se veio de lá) sem confirmação adicional além do botão.
- [ ] **OR-HOME-09** — Rascunho remoto (Firestore, `listingStatus=draft`) na lista de eventos → **Esperado:** botão "Continuar rascunho" (em vez de "Gerenciar inscrições") e link "Descartar rascunho" abaixo, que pede confirmação em diálogo ("O rascunho será removido permanentemente do banco de dados.").
- [ ] **OR-HOME-10** — Trocar de papel: ícone de engrenagem (topo) ou aba "Ajustes" (bottom nav) abre sheet de organizador → tocar "Trocar papel" (só aparece se o usuário tem múltiplos papéis) → **Esperado:** vai para seleção de papel; usuário só-organizador não vê a opção.
- [ ] **OR-HOME-11** — No sheet de ajustes, "Carteira e saques" → **Esperado:** abre `organizerWallet` (ver 3.8). "Sair da conta" → confirma diálogo "Sair da conta?" e desloga.

## 3.2 Criação de Torneio (wizard)

### Identidade (rota `organizerTournamentCreateIdentity` — passo 1/6)
**Objetivo:** Definir esporte, nome, capa e descrição do torneio.
**Pré-condições:** Logado como organizador, wizard iniciado via "Criar" → torneio.

- [ ] **OR-CTORN-01** — Selecionar esporte (Vôlei de praia/Vôlei de quadra/Futevôlei), digitar nome "Open Goiânia Beach", tocar "Continuar" → **Esperado:** avança para "Local e datas"; botão fica desabilitado enquanto nome está vazio.
- [ ] **OR-CTORN-02** — Tocar "Imagem de capa" (opcional) e escolher foto da galeria → **Esperado:** preview 16:9 substitui o placeholder; campo é opcional, "Continuar" segue habilitado sem capa.
- [ ] **OR-CTORN-03** — Fechar o wizard (X) com nome/categoria já preenchidos → **Esperado:** diálogo de saída com destaque de categorias e aviso "Apaga a(s) N categoria(s) e os dados preenchidos." nas opções Sair/Descartar/Continuar editando.

### Local e datas (rota `organizerTournamentCreateLocation` — passo 2/6)
**Objetivo:** Local do evento, cidade/UF, quadras disponíveis e datas.

- [ ] **OR-CTORN-04** — Selecionar uma "Arena cadastrada" no dropdown (se o organizador tiver arenas) → **Esperado:** autopreenche nome do local, endereço, cidade e UF.
- [ ] **OR-CTORN-05** — Preencher manualmente nome do local, estado/cidade (BrStateCityFields), quadras (stepper, mínimo 1), data de início e fim, horário do 1º jogo → **Esperado:** "Continuar" só habilita com local, cidade, início, fim (fim ≥ início) e quadras > 0 preenchidos.
- [ ] **OR-CTORN-06** — Escolher data de fim anterior à de início → **Esperado:** botão "Continuar" permanece desabilitado (regra `!endAt.isBefore(startAt)`).
- [ ] **OR-CTORN-07** — Trocar o estado depois de já ter escolhido uma cidade → **Esperado:** cidade é limpa automaticamente (lista de cidades muda com a UF).

### Categorias (rota `organizerTournamentCreateCategories` — passo 3/6)
**Objetivo:** Cadastrar 1+ categorias com formato de chave, nível, gênero e vagas.

- [ ] **OR-CTORN-08** — Tocar "Adicionar categoria" → preencher nome (ou deixar sugestão automática por gênero/faixa/nível), gênero, faixa etária, nível (chips: Iniciante 1/2, Intermediário 1/2, Open para vôlei), vagas e preço → salvar → **Esperado:** card da categoria aparece na lista com resumo "formato · sets"; "Continuar" mostra "Continuar · N Categoria(s)".
- [ ] **OR-CTORN-09** — Em "Sistema de disputa" escolher "Grupos + mata-mata", "Mata-mata (chave simples)" ou "Dupla eliminatória" → **Esperado:** os 3 aparecem como cards selecionáveis normais; ao escolher "Grupos + mata-mata" aparece "Configuração dos grupos" (duplas por grupo / quantas classificam).
- [ ] **OR-CTORN-10** — Simular seleção de "Pontos corridos" ou "Grupos + repescagem" (se acessível via categoria antiga/edição) → **Esperado:** banner de aviso amarelo aparece: "Pontos corridos estará disponível em breve. Use grupos + mata-mata, chave simples ou dupla eliminatória." (ou texto equivalente para grupos+repescagem); a categoria fica marcada como formato não suportado e bloqueia a publicação do torneio (ver OR-CTORN-29). **Não testar geração de chave para esses 2 formatos — não implementada no backend.**
- [ ] **OR-CTORN-11** — Personalizar restrição de idade: ativar "Personalizar restrição de idade" e informar idade mínima/máxima + referência (início do torneio / 31/dez / inscrição) → **Esperado:** sobrepõe o preset de faixa etária.
- [ ] **OR-CTORN-12** — Testar elegibilidade por nível: criar categoria com nível "Intermediário 2" → **Esperado:** um atleta com nível "Open" configurado no perfil NÃO consegue se inscrever nela (bloqueado com "ABAIXO DO SEU NÍVEL" / mensagem "Seu nível (...) não permite categorias inferiores. Escolha uma categoria igual ou superior."), mas um atleta "Iniciante 1" consegue (regra é "joga a própria categoria ou acima", nunca abaixo). Validar do lado do atleta na tela de inscrição (ver AT-INSCR-01).
- [ ] **OR-CTORN-13** — Remover uma categoria já adicionada → **Esperado:** diálogo "Remover categoria? A categoria "X" será removida do rascunho do torneio." com Cancelar/Remover.
- [ ] **OR-CTORN-14** — Tentar continuar sem nenhuma categoria → **Esperado:** botão "Continuar" desabilitado.

### Inscrições (rota `organizerTournamentCreateRegistration` — passo 4/6)
**Objetivo:** Janela de inscrição, forma de pagamento, lista de espera.

- [ ] **OR-CTORN-15** — Definir "Fecham em" antes de "Abrem em" → **Esperado:** aviso "O fechamento das inscrições não pode ser antes da abertura." e "Continuar" bloqueado.
- [ ] **OR-CTORN-16** — Definir fechamento das inscrições depois do início do torneio (data de "Local e datas") → **Esperado:** aviso "As inscrições não podem fechar depois do início do torneio."
- [ ] **OR-CTORN-17** — Escolher "Direto com o organizador" como forma de pagamento → **Esperado:** aparecem campos obrigatórios de chave PIX do organizador (tipo, chave, nome do recebedor; cidade opcional); "Continuar" só habilita com chave + nome preenchidos.
- [ ] **OR-CTORN-18** — Escolher "Pelo app — Pix e cartão" → **Esperado:** badge "taxa 6%" ao lado da opção; nenhum campo PIX extra exigido.
- [ ] **OR-CTORN-19** — Alternar "Lista de espera" e "Confirmar dupla por convite" → **Esperado:** togglam livremente, sem bloquear avanço.

### Regras e premiação (rota `organizerTournamentCreateRules`/`...Prizes` — passo 5/6)
**Objetivo:** Premiação em dinheiro, regulamento (PDF), uniforme e ranking.

- [ ] **OR-CTORN-20** — Ligar "Premiação em dinheiro" e não definir valores para todas as categorias → **Esperado:** "Continuar" bloqueado (regra: toda categoria precisa ter prêmios definidos quando `cashPrizesEnabled=true`).
- [ ] **OR-CTORN-21** — Desligar "Premiação em dinheiro" → **Esperado:** seção de premiação por categoria some; "Continuar" libera mesmo sem prêmios (revisão mostra "Troféus/brindes (sem premiação em dinheiro)").
- [ ] **OR-CTORN-22** — Anexar regulamento em PDF → **Esperado:** nome do arquivo some no lugar de "Anexar regulamento em PDF", texto muda para "PDF anexado"; botão vira "Trocar".
- [ ] **OR-CTORN-23** — Ligar "Kit do torneio na inscrição" → **Esperado:** aparecem sub-opções aninhadas "Solicitar número na inscrição" (1–99) e "Solicitar nome na inscrição"; desligando o kit as duas somem.
- [ ] **OR-CTORN-24** — Desligar "Vale pontos no ranking" → **Esperado:** some a prévia "Padrão nexaGO · Etapa avulsa" e a grade de pontos por colocação.

### Revisão e publicação (rota `organizerTournamentCreateReview` — passo 6/6)
**Objetivo:** Revisar tudo, escolher visibilidade e publicar ou salvar rascunho.

- [ ] **OR-CTORN-25** — Tocar "Editar" em qualquer seção (Esporte/Local & datas/Categorias & formato/Inscrições/Premiação/Uniforme/Ranking) → **Esperado:** volta para o passo correspondente do wizard mantendo os dados já preenchidos.
- [ ] **OR-CTORN-26** — Escolher visibilidade "Público" vs. "Por link" → **Esperado:** muda a descrição ("Aparece na busca..." vs. "Só quem tem o link...").
- [ ] **OR-CTORN-27** — Publicar torneio válido (fluxo feliz) → **Esperado:** tela de sucesso "{nome} está publicado!" com compartilhar/copiar link/QR code, "Ver página do torneio →" e "Voltar ao painel".
- [ ] **OR-CTORN-28** — "Salvar como rascunho" com dados válidos → **Esperado:** tela de sucesso "{nome} está salvo!" ("RASCUNHO SALVO"), sem "inscrições abertas".
- [ ] **OR-CTORN-29** — Torneio com categoria em formato não suportado (pontos corridos/grupos+repescagem) → **Esperado:** botão "Publicar torneio" fica desabilitado mesmo com todos os outros passos completos (bloqueio central via `isValidForPublish`).

### Criação expressa (rota `organizerTournamentCreateExpress`)
**Objetivo:** Publicar torneio simples em 1 tela.

- [ ] **OR-CTORN-30** — Preencher nome, local, estado/cidade e data de início; deixar gênero padrão (Masculino) e vagas padrão (16 duplas) → tocar "Publicar torneio" → **Esperado:** publica direto (sem premiação em dinheiro, inscrições abrindo hoje e fechando no início do evento, categoria única em "Grupos + mata-mata"); banner informativo azul avisa "Inscrições abrem agora e fecham no início... você ajusta depois".
- [ ] **OR-CTORN-31** — Tentar publicar sem UF/cidade ou sem data de início → **Esperado:** botão "Publicar torneio" desabilitado.

### Edição pós-publicação (via sheet "Gerenciar torneio", ver 3.4)
- [ ] **OR-CTORN-32** — Tocar "Editar identidade" / "Local & datas" / "Categorias & vagas" no sheet do torneio já publicado → **Esperado:** reabre o wizard só no passo escolhido, com "Publicar torneio" da revisão virando "Salvar alterações" (sem opção "Salvar como rascunho").

**Não testar (não implementado):** nenhum item ⚪ nesta subseção — todos os itens listados existem e são funcionais no código atual.

## 3.3 Criação de Liga (wizard)

### Identidade e temporada (rotas `organizerLeagueCreateIdentity`/`...Season` — passos 1–2/6)
**Objetivo:** Nome, capa, organização, cidade/UF, período da temporada e nº de etapas planejadas.

- [ ] **OR-CLIGA-01** — Preencher esporte, "Nome do circuito", organização, cidade/UF (opcional) → **Esperado:** "Continuar" habilita só com nome preenchido.
- [ ] **OR-CLIGA-02** — Em "Temporada", escolher mês/ano de início e fim (date picker limitado a mês/ano) e ajustar "Etapas planejadas" (stepper 2–12) → **Esperado:** "Continuar" exige início, fim (fim ≥ início) e ≥2 etapas planejadas; mudar o range recalcula automaticamente `syncStagesWithPlan`.
- [ ] **OR-CLIGA-03** — Alternar "Grande Final" (etapa extra com melhores do ranking) → **Esperado:** liga a etapa "Grande Final" que aparece depois no planejamento de etapas.

### Categorias da liga (rota `organizerLeagueCreateCategories` — passo 3/6)
**Objetivo:** Categorias herdadas por todas as etapas.

- [ ] **OR-CLIGA-04** — Adicionar categoria via mesmo editor da criação de torneio (gênero, faixa, nível, formato, vagas, preço padrão) → **Esperado:** card mostra badge extra "Herdado"; "Continuar" exige ≥1 categoria.

### Regras de ranking (rota `organizerLeagueCreateRanking` — passo 4/6)
**Objetivo:** Contagem de etapas, tabela de pontos, vagas da Grande Final e wildcards.

- [ ] **OR-CLIGA-05** — Selecionar "Como somam os pontos": "4 melhores de 6 etapas" / "3 melhores de 5 etapas" / "Todas as etapas contam" → **Esperado:** descrição muda ("Descarta os 2 piores resultados..." vs. "Cada etapa soma integralmente...").
- [ ] **OR-CLIGA-06** — Escolher tabela de pontos "Padrão circuito estadual" vs. "Padrão nexaGO · Etapa avulsa" → **Esperado:** grade de pontos por colocação (1º–4º, Quartas, Grupos) é meramente informativa por enquanto (usa `defaultLeagueRankingPoints`).
- [ ] **OR-CLIGA-07** — Ajustar "Grande Final" vagas (stepper de 2 em 2, mínimo 4) e ligar "Wildcards" (stepper de vagas extras, mínimo 1) → **Esperado:** "Continuar" exige vagas > 0 e, se wildcards ligado, `wildcardSpots > 0`.

### Planejamento de etapas (rota `organizerLeagueCreateStages` — passo 5/6)
**Objetivo:** Definir cada etapa (ou deixar "pendente" para completar depois).

- [ ] **OR-CLIGA-08** — Abrir wizard nesse passo → **Esperado:** etapas são geradas automaticamente ("Etapa 1"…"Etapa N" + "Grande Final" se ligada), todas como "Pendente" inicialmente; contador "X de Y definidas" no topo.
- [ ] **OR-CLIGA-09** — Tocar uma etapa pendente → sheet mostra só "Mês previsto" e botão "Definir etapa completa" → **Esperado:** ao definir mês e salvar sem completar, etapa permanece "Pendente" com subtítulo "Local a definir · {mês}".
- [ ] **OR-CLIGA-10** — Tocar "Definir etapa completa" numa etapa pendente → **Esperado:** sheet expande para nome, local, data de início e fim; salvar muda status para "Definida".
- [ ] **OR-CLIGA-11** — Tentar avançar sem nenhuma etapa definida → **Esperado:** "Continuar" desabilitado (`draft.stages.isNotEmpty` só checa existência, mas publicação exige ≥1 etapa "Definida" — ver OR-CLIGA-13).

### Revisão e publicação (rota `organizerLeagueCreateReview` — passo 6/6)
- [ ] **OR-CLIGA-12** — Publicar liga com ≥1 etapa definida, categorias válidas e todas as outras seções completas → **Esperado:** tela de sucesso "{nome} está publicado!"/salvo, com compartilhar/link/QR.
- [ ] **OR-CLIGA-13** — Tentar publicar liga sem nenhuma etapa marcada como "Definida" (todas pendentes) → **Esperado:** "Publicar" desabilitado mesmo com o resto completo (`isValidLeagueForPublish` exige ≥1 etapa `defined`).
- [ ] **OR-CLIGA-14** — Liga com categoria em formato não suportado (pontos corridos/grupos+repescagem) → **Esperado:** publicação bloqueada, mesma regra do torneio.

### Adicionar etapa (pós-publicação) — wizard de 3 passos (rotas `organizerLeagueStageCreate...`)
**Pré-condições:** Liga já publicada (status `open`).

- [ ] **OR-CLIGA-15** — Na home ou no sheet de ações da liga, tocar "Adicionar etapa" → **Esperado:** abre wizard com passo 1 "Local e datas" mostrando um chip de contexto com nome da liga; campo "ETAPA" pré-numerado com dica de ordem (`stageOrderHint`); permite selecionar arena cadastrada (autopreenche cidade/local/endereço), quadras disponíveis, datas de início/fim.
- [ ] **OR-CLIGA-16** — Passo 2 "Categorias ativas / Inscrições" → **Esperado:** permite escolher quais categorias herdadas da liga ficam ativas nessa etapa específica.
- [ ] **OR-CLIGA-17** — Passo 3 "Revisão" → publicar etapa → **Esperado:** tela de sucesso dedicada (`organizerLeagueStagePublished`); banner verde na revisão avisa "Duplas inscritas no circuito serão avisadas quando a etapa for publicada."; botão "Salvar rascunho" também disponível.
- [ ] **OR-CLIGA-18** — No sheet de ações da liga (⋮ no card), com liga `open`, tocar "Adicionar etapa" → **Esperado:** mesmo wizard acima é aberto.

### Encerrar / cancelar temporada (via sheet de ações da liga)
- [ ] **OR-CLIGA-19** — Tocar "Encerrar temporada" numa liga `open` → diálogo "Encerrar temporada?" ("A liga sai do modo ativo. O ranking permanece visível, mas novas etapas não podem ser adicionadas.") → confirmar → **Esperado:** snackbar "Temporada encerrada."; opções "Adicionar etapa"/"Encerrar"/"Cancelar liga" somem do sheet (status deixa de ser `open`).
- [ ] **OR-CLIGA-20** — Tocar "Cancelar liga" → diálogo destrutivo "Cancelar liga?" ("A liga deixa de aparecer no catálogo público. Etapas já publicadas permanecem no histórico.") → confirmar → **Esperado:** snackbar "Liga cancelada."

**Não testar (não implementado):** Painel operacional dedicado da liga — não existe; a operação do dia a dia acontece dentro de cada torneio-etapa (hub normal de torneio).

## 3.4 Painel / Hub do Torneio

### Hub operacional (rota `organizerTournamentDetail`)
**Objetivo:** Tela central do torneio publicado: header, KPIs, atalhos e navegação para as áreas de gestão.
**Pré-condições:** Torneio publicado com pelo menos 1 categoria.

- [ ] **OR-HUB-01** — Abrir o hub de um torneio → **Esperado:** título "TORNEIO · GERENCIAR" + nome; KPIs no topo (financeiro só aparece para o dono, `showFinancial: isOwner`); botão "Compartilhar inscrição" sempre visível.
- [ ] **OR-HUB-02** — Se `startAt` do torneio está próximo (mesmo dia/dias do evento), botão "Dia do jogo" aparece ao lado de "Compartilhar inscrição" → **Esperado:** leva direto para a Central de Partidas.
- [ ] **OR-HUB-03** — Rodapé "Programação do dia" → **Esperado:** habilitado só se `organizerTournamentDayScheduleEnabled` (torneio com categorias já com chave/jogos elegíveis); some inteiramente para staff `scorer`.
- [ ] **OR-HUB-04** — Cards em "GERENCIAR TORNEIO": "Categorias", "Financeiro" (só dono), "Partidas", "Equipe" (só dono), "Uniformes" (só se `uniformRequired`) → **Esperado:** cada card mostra subtítulo dinâmico (ex.: "N categorias", contagem de jogos ao vivo) e navega para a subtela correta.
- [ ] **OR-HUB-05** — Acessar o hub como membro de staff `scorer` (mesário, sem papel organizador) → **Esperado:** vê só o card "Partidas" (`matchesOnly`), sem "Categorias"/"Financeiro"/"Equipe"/"Uniformes", sem menu `⋮` de ações e sem botão "Programação do dia" no rodapé.
- [ ] **OR-HUB-06** — Acessar como membro de staff `manager` (gestor, sem papel organizador) → **Esperado:** consegue acessar Categorias, Partidas, Uniformes e Financeiro normalmente (regra: staff sem papel "organizador" formal ainda opera o torneio), mas NÃO vê o menu `⋮` (ações exclusivas do dono) nem o card "Equipe".

### Editar/gerenciar torneio (sheet `⋮` — só dono)
- [ ] **OR-HUB-07** — Tocar `⋮` no hub → **Esperado:** sheet "Gerenciar torneio" com "Editar identidade", "Local & datas", "Categorias & vagas" (cada um reabre o wizard no passo certo — ver OR-CTORN-32), "Compartilhar torneio", "Uniformes" (se aplicável), "Encerrar inscrições" e "Cancelar torneio" (destrutivo).
- [ ] **OR-HUB-08** — "Encerrar inscrições" → diálogo "Encerrar inscrições? Novas inscrições serão bloqueadas em todas as categorias." → confirmar → **Esperado:** snackbar "Inscrições encerradas."; nova tentativa de inscrição pelo app do atleta deve falhar/mostrar categoria fechada.
- [ ] **OR-HUB-09** — "Cancelar torneio" sem nenhuma dupla paga → diálogo "Cancelar torneio? ... Reembolsos automáticos não estão disponíveis nesta versão." → confirmar → **Esperado:** snackbar "Torneio cancelado."; volta para a tela anterior (home).
- [ ] **OR-HUB-10** — "Cancelar torneio" com duplas já pagas (canal app ou direto) → **Esperado:** backend bloqueia com `has_paid_registrations`; app mostra diálogo extra "Reembolso manual necessário — N dupla(s) já pagou/pagaram a inscrição. Não há estorno automático..." → confirmar novamente ("Cancelar e reembolsar") reenvia com `force: true` e cancela.

### Visão geral
**Não testar (não implementado/inacessível):** o card "Visão geral" está comentado no código (`organizer_tournament_explore_section.dart`) e nenhuma outra tela chama `pushOrganizerTournamentOverview` — a rota existe mas é inalcançável pela UI atual. Não criar caso de teste de navegação; se testado por URL profunda, a tela em si só mostra 3 infos estáticas (Formato/Quadras/Inscrições).

## 3.5 Gestão de Categorias

### Shell da categoria (rota `organizerCategoryShell`)
**Objetivo:** Hub da categoria com KPIs e atalhos de operação.

- [ ] **OR-CAT-01** — Abrir uma categoria com ≥2 duplas confirmadas e chave ainda não publicada → **Esperado:** KPIs (confirmadas/pendentes/lista de espera/arrecadado) no topo; pill "Gerar chave" e "Cabeças de chave" visíveis.
- [ ] **OR-CAT-02** — Categoria com apenas 1 dupla confirmada, tocar "Gerar chave" → **Esperado:** snackbar de erro com o hint de bloqueio (mínimo de 2 duplas confirmadas para publicar qualquer formato de chave — `minTeamsToGenerateBracket = 2`).
- [ ] **OR-CAT-03** — Categoria com formato "Pontos corridos" ou "Grupos + repescagem", tocar "Gerar chave" → **Esperado:** snackbar de erro com o aviso "...estará disponível em breve..." e NÃO navega para nenhuma tela de geração.
- [ ] **OR-CAT-04** — Categoria já com chave publicada → **Esperado:** pill "Gerar chave" some (mantém só "Cabeças de chave", se ainda fizer sentido); card "Chave" no explorador mostra "Chave publicada".

### Lista de duplas com filtros e busca (rota `organizerCategoryTeams`)
- [ ] **OR-CAT-05** — Digitar no campo "Buscar dupla ou atleta..." → **Esperado:** filtra por nome de exibição da dupla ou de qualquer um dos 2 atletas, em tempo real.
- [ ] **OR-CAT-06** — Aplicar chips "Todas" / "Cabeças" / "Pendentes" / "Lista de esp." → **Esperado:** filtra a lista corretamente; chips "Pendentes" e "Lista de esp." desaparecem automaticamente depois que a chave é publicada.
- [ ] **OR-CAT-07** — Trocar ordenação (menu "Ordem de inscrição" ↔ "Ranking") → **Esperado:** reordena a lista sem perder o filtro/busca ativos.
- [ ] **OR-CAT-08** — Categoria sem duplas cadastradas → **Esperado:** texto "Nenhuma dupla encontrada."

### Pagamentos por categoria (rota `organizerCategoryPayments`)
- [ ] **OR-CAT-09** — Ver card "ARRECADADO NESTA CATEGORIA" → **Esperado:** total, valor previsto, barra de progresso, breakdown "Pelo app" vs. "Direto com você" quando aplicável, e "X em aberto" se houver saldo pendente.
- [ ] **OR-CAT-10** — Seção "PENDENTES", tocar "Cobrar" numa dupla → **Esperado:** snackbar "Cobrança enviada." (reenvio individual de PIX).
- [ ] **OR-CAT-11** — Tocar "Cobrar todas" com ≥2 pendentes → **Esperado:** reenvia a cobrança para todas as pendentes em lote e mostra "Cobranças reenviadas." mesmo se alguma falhar individualmente (falhas são engolidas silenciosamente por design).
- [ ] **OR-CAT-12** — Seção "RECEBIDAS" com mais de 5 pagas → **Esperado:** mostra só as 5 primeiras + botão "Ver todas" que expande a lista completa.

### Cabeças de chave — seeding (rota `organizerCategorySeeding`)
- [ ] **OR-CAT-13** — Abrir tela com "Semear pelo ranking nexaGO" ligado (padrão) → **Esperado:** lista já ordenada por pontuação combinada da dupla; banner explica "As N primeiras cabeças são distribuídas em grupos diferentes."
- [ ] **OR-CAT-14** — Arrastar uma dupla para reordenar manualmente → **Esperado:** toggle "Semear pelo ranking" desliga automaticamente (`_seedByRanking = false`); ordem é salva com debounce de 500ms.
- [ ] **OR-CAT-15** — Tocar "Salvar cabeças de chave" → **Esperado:** snackbar "Cabeças de chave salvas." e volta para a tela anterior.

### Sorteio de grupos — snake draft (rota `organizerCategoryGenerateGroupsPage`, formato "grupos + mata-mata")
- [ ] **OR-CAT-16** — Abrir geração de chave de uma categoria "Grupos + mata-mata" com 12 duplas confirmadas, `teamsPerGroup=4` → **Esperado:** nº de grupos sugerido automaticamente (3), duplas distribuídas em snake draft respeitando as cabeças de chave se "Usar cabeças de chave" estiver ligado.
- [ ] **OR-CAT-17** — Ajustar "Nº de grupos" no stepper para um valor que gere classificados totais que não sejam potência de 2 (ex.: 3 grupos × 2 classificados = 6) → **Esperado:** banner de aviso amarelo sobre mata-mata desbalanceado aparece e o botão "Publicar" fica desabilitado (`_knockoutBalanced` = false).
- [ ] **OR-CAT-18** — Ajustar para um nº de grupos balanceado (ex.: 4 grupos × 2 classificados = 8) → **Esperado:** aviso some, "Publicar" habilita.
- [ ] **OR-CAT-19** — Tocar "Sortear novamente" → **Esperado:** re-embaralha as duplas não-cabeça mantendo cabeças fixas nos respectivos grupos.
- [ ] **OR-CAT-20** — Publicar grupos com sucesso → **Esperado:** feedback de sucesso "Chave publicada! Os jogos já aparecem na categoria."; jogos de fase de grupos aparecem na Central de Partidas.
- [ ] **OR-CAT-21** — Publicar novamente sobre uma chave que já tem resultados lançados → **Esperado:** diálogo de confirmação para regenerar (`confirmRegenerateBracket`); confirmando, republica com `force: true`.

### Geração de chave SE/DE (rotas `organizerCategoryGenerateBracket`, `organizerCategoryFormat` + `...GenerateDe`)
- [ ] **OR-CAT-22** — Categoria "Mata-mata (chave simples)" com 6 duplas confirmadas → gerar chave → **Esperado:** prévia mostra "6 duplas · chave de 8 · 2 byes (top 2 avançam direto)"; publicar cria os jogos SE sem partidas órfãs.
- [ ] **OR-CAT-23** — Categoria "Dupla eliminatória" com 4 duplas confirmadas → tocar "Gerar chave" → **Esperado:** abre primeiro a tela "Formato — dupla eliminatória" (radio único "Dupla eliminatória / Chave principal + repescagem") → "Continuar para gerar chave" → tela "Gerar chave — dupla eliminatória" com prévia de seeds → "Publicar chave".
- [ ] **OR-CAT-24** — Repetir OR-CAT-23 com 8 duplas, depois com 16 duplas e depois com 24 duplas (plantas estáticas cobrindo 4 a 27 duplas) → **Esperado:** em todos os casos a chave é publicada sem erro; ao abrir a visualização da chave publicada (rota `organizerCategoryBracket`), confirmar visualmente que não há partidas órfãs e que o Losers Bracket (LB) está conectado corretamente às quedas do Winners Bracket em cada rodada (regressão da correção recente de fiação do LB — validar especialmente em 5, 6, 7, 9, 10, 11, 13 duplas, que tiveram planta corrigida).
- [ ] **OR-CAT-25** — Categoria DE com apenas 3 duplas confirmadas (abaixo do mínimo de planta estática, 4) → **Esperado:** geração deve ser bloqueada ou tratada com erro amigável do backend (validar mensagem, não deve travar/gerar chave quebrada).
- [ ] **OR-CAT-26** — Categoria DE com mais de 27 duplas confirmadas (acima do teto das plantas estáticas) → **Esperado:** mesma verificação — geração deve falhar com mensagem clara em vez de gerar chave incompleta.

### Confirmação manual de pagamento / lista de espera / remoção de dupla (sheet de ações da dupla)
- [ ] **OR-CAT-27** — Tocar em uma dupla na lista → sheet de ações → "Confirmar pagamento" numa dupla pendente → **Esperado:** vira "Pagamento confirmado" com check verde; snackbar "Pagamento confirmado."; ação desabilita depois de já paga.
- [ ] **OR-CAT-28** — "Mover para lista de espera" numa dupla confirmada (categoria lotada) → **Esperado:** snackbar "Dupla movida para fila."; opção some para duplas que já estão na lista de espera.
- [ ] **OR-CAT-29** — "Remover da categoria" numa dupla que já pagou → diálogo mostra valor pago e aviso "...o reembolso é manual e o atleta será avisado." → confirmar → **Esperado:** snackbar "Dupla removida."; vaga é liberada (promove próxima da fila, se houver lista de espera).
- [ ] **OR-CAT-30** — "Remover da categoria" numa dupla que não pagou → **Esperado:** diálogo mais simples, sem menção a reembolso.
- [ ] **OR-CAT-31** — "Definir cabeça de chave" no sheet → **Esperado:** navega para a tela de seeding (ver OR-CAT-13).

**Não testar (não implementado):**
- "Editar inscrição" (trocar parceiro/nível/cidade) no sheet de ações da dupla — ao tocar, mostra apenas snackbar "Edição em breve." e não abre nenhuma tela.
- "Enviar mensagem" (push + WhatsApp) no sheet de ações da dupla — o toque apenas fecha o sheet, sem enviar nada (placeholder puro, sem ação associada).
- "Comunicar categoria" (push + WhatsApp por categoria) — a tela existe e está funcional (`organizerCategoryCommunicate`: escolher público-alvo, mensagem, canais push/WhatsApp, prévia, envio via Cloud Function), mas **nenhum botão ou card em nenhuma tela navega até ela** (confirmado por busca no código — a função de navegação `pushOrganizerCategoryCommunicate` não é chamada em lugar nenhum). Não é possível alcançá-la via fluxo normal do app; não testar até que uma entrada de UI seja adicionada (ver 3.9).

## 3.6 Central de Partidas

### Central de Partidas (rota `organizerMatchCenter`)
**Objetivo:** Visão operacional do dia com seções ao vivo / a seguir / encerradas.

- [ ] **OR-PART-01** — Abrir a Central com jogos em diferentes estados → **Esperado:** 3 seções em ordem: "ACONTECENDO AGORA" (com contador "N ao vivo"), "A SEGUIR · PRÓXIMAS A ENTRAR", "ENCERRADAS"; chips de filtro "Tudo N / Ao vivo N / Em quadra N" no topo.
- [ ] **OR-PART-02** — Filtrar por categoria (chips horizontais abaixo do status) → **Esperado:** só jogos daquela categoria aparecem nas 3 seções.
- [ ] **OR-PART-03** — Tocar um jogo "ao vivo" → **Esperado:** abre a Mesa ao vivo (`organizerMatchLive`); um jogo "a seguir" → abre Check-in; um jogo "encerrado" → abre Súmula.
- [ ] **OR-PART-04** — Botões do rodapé "Fila" e "Programação" → **Esperado:** navegam para Fila de Chamada e Grade do dia respectivamente.
- [ ] **OR-PART-05** — Nenhum jogo no dia/filtro selecionado → **Esperado:** texto "Nenhuma partida encontrada."

### Fila de chamada (rota `organizerMatchQueue`)
- [ ] **OR-PART-06** — Abrir com jogos "próxima a chamar" (on deck) e "na fila" → **Esperado:** 2 seções com contadores; KPI de quadras no topo.
- [ ] **OR-PART-07** — Jogo com check-in pendente → **Esperado:** badge "Check-in pendente" e botão "Fazer check-in" (em vez de "Chamar para quadra").
- [ ] **OR-PART-08** — Jogo com check-in completo, tocar "Chamar para quadra" → **Esperado:** libera a partida para a quadra; snackbar "Partida chamada para a quadra."
- [ ] **OR-PART-09** — Fila vazia → **Esperado:** estado vazio "Nenhuma partida na fila" com explicação.

### Painel de quadras (rota `organizerMatchCourts`)
- [ ] **OR-PART-10** — Abrir com quadras livres e ocupadas → **Esperado:** badge "LIVRE" (verde) ou "AO VIVO" (laranja) por quadra; quadra ocupada mostra o confronto atual + próximo; botões "Mesa" (vai para mesa ao vivo) e "Check-in" (para o próximo jogo) aparecem condicionalmente.

### Programação — grade dia × quadra (rota `organizerMatchSchedule`)
- [ ] **OR-PART-11** — Abrir a grade de um dia com quadras configuradas → **Esperado:** cabeçalho com seletor de dia, colunas por quadra, badge de alerta com quantidade de jogos ainda sem horário.
- [ ] **OR-PART-12** — Arrastar (drag-and-drop) um jogo para outro horário/quadra livre → **Esperado:** snackbar "Horário atualizado."; jogo se move visualmente sem conflito.
- [ ] **OR-PART-13** — Tentar soltar um jogo num horário/quadra já ocupado por outro jogo → **Esperado:** erro amigável (conflito de quadra) — não deve sobrescrever o jogo existente.
- [ ] **OR-PART-14** — Tocar um jogo na grade → **Esperado:** abre sheet de agendamento (`organizer_schedule_match_sheet`) para ajustar detalhes.
- [ ] **OR-PART-15** — Botão flutuante "Auto" e "Agendar" na base → **Esperado:** "Auto" leva à Auto-programação; "Agendar" (habilitado só se houver jogo sem horário) leva a "Escolher partida" (`organizerMatchSchedulePick`).
- [ ] **OR-PART-16** — Trocar de dia no seletor de dias do torneio → **Esperado:** grade recarrega só com os jogos daquele dia.

### Escolher partida / horário (rotas `organizerMatchSchedulePick`, `...Time`)
- [ ] **OR-PART-17** — Abrir "Escolher partida" com jogos prontos (times já definidos) e jogos "aguardando chave" (placeholders tipo "Vencedor Jogo #7") → **Esperado:** só os jogos prontos são selecionáveis; contadores por aba refletem a separação.
- [ ] **OR-PART-18** — Selecionar um jogo pronto → **Esperado:** avança para escolher quadra/horário com sugestões de slot; avisos aparecem se o horário sugerido viola o descanso mínimo entre partidas da mesma dupla.

### Auto-programação do dia (rota `organizerMatchAutoSchedule`)
**Objetivo:** Aplicar grade automática respeitando conflitos e dependências de chave.

- [ ] **OR-PART-19** — Abrir com uma categoria de dupla eliminação com múltiplas rodadas (WB + LB + 3º lugar + final) tendo jogos sem horário → **Esperado:** prévia é gerada automaticamente ao abrir a tela ("PRÉVIA • N PARTIDAS"), cada card mostra quadra e horário sugeridos.
- [ ] **OR-PART-20** — Conferir a ordem dos cards da prévia → **Esperado:** a partida FINAL da categoria aparece agendada por último na prévia/grade, depois de todas as demais partidas (WB, LB, 3º lugar) — correção da regressão em que a final podia ser agendada cedo demais só por número de partida (`matchNumber`).
- [ ] **OR-PART-21** — Desligar "Respeitar dependências da chave" → **Esperado:** recalcula a prévia (pode tentar agendar jogos cujo lado ainda é um placeholder "Vencedor Jogo #N" — usar com cautela; jogos de grupo nunca são afetados por esse toggle).
- [ ] **OR-PART-22** — Desligar "Evitar conflito de atletas" → **Esperado:** recalcula sem respeitar o descanso mínimo entre jogos da mesma dupla.
- [ ] **OR-PART-23** — Trocar o horário "COMEÇAR A PARTIR DAS" → **Esperado:** prévia recalcula a partir do novo horário base.
- [ ] **OR-PART-24** — Tocar "Recalcular" → **Esperado:** apenas atualiza a prévia local (não grava nada ainda). Tocar "Aplicar" (habilitado só com prévia não vazia) → **Esperado:** grava a grade de verdade, snackbar "Grade aplicada com sucesso.", e a prévia é recarregada a partir dos dados atualizados.
- [ ] **OR-PART-25** — Rodar auto-programação num dia sem nenhum jogo pendente (todos já agendados/concluídos) → **Esperado:** "Nenhuma partida sem horário para este dia. Partidas já agendadas ou concluídas não entram na prévia."; botão "Aplicar" desabilitado.

### Insights de atraso (rota `organizerMatchInsights`)
- [ ] **OR-PART-26** — Abrir com jogos atrasados e no horário → **Esperado:** 3 tiles ("Atraso médio", "Atrasadas", "No horário"), card de sugestão textual (se houver) e lista "Ritmo por quadra".

### Check-in de partida (rota `organizerMatchCheckIn`)
- [ ] **OR-PART-27** — Abrir check-in de um jogo agendado → **Esperado:** card de tolerância mostra minutos restantes até liberar W.O.; ao esgotar, muda para "Prazo de tolerância esgotado — Sem comparecimento? Você já pode declarar W.O."
- [ ] **OR-PART-28** — Tocar "Check-In" nas duas duplas → **Esperado:** cada card vira pill verde "Presente · desfazer" (clicável para reverter); contador "2 / 2 prontas".
- [ ] **OR-PART-29** — Sem quadra definida ainda → **Esperado:** botão do rodapé mostra "Defina a quadra" (desabilitado) mesmo com check-in completo; selecionar quadra no seletor → botão libera para "Liberar partida".
- [ ] **OR-PART-30** — Tocar "Liberar partida" com check-in completo + quadra definida → **Esperado:** snackbar "Partida liberada." e volta para a tela anterior.
- [ ] **OR-PART-31** — Declarar W.O. numa das duplas (ícone de bandeira) → **Esperado:** snackbar "W.O. declarado."; card daquela dupla vira pill vermelha "W.O."

### Mesa ao vivo — placar ponto a ponto (rota `organizerMatchLive`)
- [ ] **OR-PART-32** — Abrir mesa ao vivo de um jogo em andamento e lançar pontos alternados para os dois lados → **Esperado:** placar do set atual incrementa em tempo real; ao fechar o set/match conforme regras (21 pts, 2 de vantagem; 3º set decisivo até 15), o status vira "completed" automaticamente e vencedor é definido.
- [ ] **OR-PART-33** — Verificar sincronização com a transmissão pública (`publicMatchLive`) — abrir em paralelo pelo app do atleta/site → **Esperado:** placar aparece atualizado quase em tempo real do lado público, read-only.

### Placar rápido (rota `organizerMatchQuickScore`)
- [ ] **OR-PART-34** — Lançar direto o resultado final por set (ex.: 21-15, 21-18) sem passar ponto a ponto, confirmar → **Esperado:** rodapé mostra "Confirmar · {vencedor} venceu" com cor de vitória; salvar propaga avanço de chave e ranking; snackbar "Placar salvo."
- [ ] **OR-PART-35** — Trocar "Formato da partida" de MD3 para "Set único" já com sets pontuados além do permitido → **Esperado:** bloqueado com snackbar "Não dá para mudar para Set único: há sets já pontuados."
- [ ] **OR-PART-36** — Declarar W.O. direto pelo placar rápido (ícone "Encerrar por W.O. ou abandono" → escolher a equipe que não compareceu) → **Esperado:** snackbar "W.O. registrado."

### Validação de resultado (rota `organizerMatchValidate`)
- [ ] **OR-PART-37** — Abrir jogo com resultado reportado pela mesa, tocar "Validar" → **Esperado:** feedback "Resultado validado — O placar foi confirmado e a chave foi atualizada."; navega para a súmula.
- [ ] **OR-PART-38** — Tocar "Corrigir" (ou ação equivalente) antes de validar → **Esperado:** abre o Placar rápido pré-preenchido para ajustar o resultado antes de confirmar.

### Súmula / resumo (rota `organizerMatchSummary`)
- [ ] **OR-PART-39** — Abrir súmula de um jogo encerrado → **Esperado:** card com placar por set, duração, total de pontos, badge "VALIDADA" se aplicável, e "Histórico da súmula" (audit log: partida iniciada, resultado reportado, correções, validação, check-in).
- [ ] **OR-PART-40** — Tentar compartilhar a súmula → **Esperado:** NÃO há botão de compartilhar visível na tela — o botão está comentado no código atual (`// TODO: Add share button`); só existe o botão "Avançar" (volta para a Central de Partidas). Isto diverge do levantamento inicial (que descrevia "compartilhar" como implementado) — confirmar visualmente que o botão realmente não aparece.

## 3.7 Uniformes

### Gestão de uniformes por torneio (rota `organizerTournamentUniforms`, também embutida como card no hub)
**Pré-condições:** Torneio com "Kit do torneio na inscrição" ligado (ver OR-CTORN-23); se desligado, tela mostra vazio.

- [ ] **OR-UNIF-01** — Torneio SEM kit configurado, abrir a tela de uniformes (por deep link ou se algum atleta comprou antes de desligar) → **Esperado:** estado vazio "Este torneio não usa uniforme na inscrição."
- [ ] **OR-UNIF-02** — Torneio COM kit, abrir a tela → **Esperado:** KPIs de resumo, painel de tamanhos, chips de categoria, lista de atletas com colunas "TAMANHO · NOME · Nº" (ou só "TAMANHO · Nº" se nenhuma categoria pediu nome na camisa) e contador "N DE M UNIFORMES".
- [ ] **OR-UNIF-03** — Tocar um tamanho no painel (ex. "M") → **Esperado:** filtra a lista só para aquele tamanho; tocar de novo desmarca o filtro.
- [ ] **OR-UNIF-04** — Tocar o KPI "Pendentes" → **Esperado:** filtra só atletas sem tamanho informado ainda.
- [ ] **OR-UNIF-05** — Filtrar por categoria via chips → **Esperado:** lista e contadores recalculam para a categoria escolhida; "Todos" limpa o filtro de categoria.
- [ ] **OR-UNIF-06** — Tocar o ícone de download (tooltip "Exportar CSV") → **Esperado:** abre o compartilhamento nativo com um CSV contendo o resumo de uniformes do torneio (esta exportação é real/funcional, ao contrário do botão de relatório financeiro — ver OR-FIN-03).
- [ ] **OR-UNIF-07** — Nenhum atleta no filtro aplicado → **Esperado:** "Nenhum atleta neste filtro."

### Configuração no wizard de criação
- [ ] **OR-UNIF-08** — Reconferir OR-CTORN-23: desligar "Kit do torneio na inscrição" já com o torneio publicado (via editar categorias) e visitar a tela de Uniformes → **Esperado:** passa a mostrar o estado vazio descrito em OR-UNIF-01 mesmo que já existissem uniformes cadastrados antes (dados antigos não somem, mas a tela trata como "não usa uniforme").

## 3.8 Financeiro

### Painel financeiro do torneio (rota `organizerTournamentFinancial`)
**Objetivo:** Ver arrecadação total, breakdown por canal e por categoria.

- [ ] **OR-FIN-01** — Abrir com inscrições pagas via app e direto com o organizador → **Esperado:** card hero "TOTAL ARRECADADO" com "Pagas"/"Pendentes"/"Taxa nexaGO"; card "Direto com você" (badge "SEM TAXA") e card "Pelo app" (badge "6% TAXA", mostrando "Repasse líquido") aparecem só quando há valor em cada canal.
- [ ] **OR-FIN-02** — Rolar até "POR CATEGORIA" → **Esperado:** um card por categoria com valor arrecadado, contagem "N pagas"/"N pend." e barra de progresso de % pago.
- [ ] **OR-FIN-03** — Tocar o ícone de documento no topo direito (sem tooltip) — "Exportar relatório financeiro" → **Esperado:** NÃO acontece nada (o `onTap` está vazio no código atual, `onTap: () {}`) — nenhum diálogo, nenhum download, nenhum feedback visual. Confirmar que o app não trava e nenhum arquivo é gerado; **não** criar caso de teste de exportação real além de confirmar esse não-comportamento.

### Confirmação manual de pagamento
- [ ] **OR-FIN-04** — Repetir OR-CAT-27 a partir do contexto financeiro (mesma ação "Confirmar pagamento" no sheet de dupla) → **Esperado:** reflete imediatamente nos totais do painel financeiro (categoria e torneio).

### Reenvio de cobrança PIX (individual / lote)
- [ ] **OR-FIN-05** — Repetir OR-CAT-10/OR-CAT-11 (Cobrar / Cobrar todas) confirmando que os valores refletidos no card "ARRECADADO NESTA CATEGORIA" (previsto vs. arrecadado vs. em aberto) permanecem consistentes antes e depois do reenvio (reenviar cobrança não deve alterar o "em aberto" até o pagamento efetivamente cair).

### Carteira do organizador (rota `organizerWallet`, acessível via sheet de ajustes)
- [ ] **OR-FIN-06** — Abrir "Carteira e saques" → **Esperado:** saldo disponível, chave PIX de repasse (editável via sheet, com validação por tipo CPF/CNPJ/e-mail/telefone/aleatória), campo de valor de saque com botão "Tudo", histórico de saques e de recebimentos.
- [ ] **OR-FIN-07** — Tentar sacar valor abaixo de R$ 20 (mínimo) → **Esperado:** erro inline "Mínimo: R$ 20,00." e botão "Solicitar saque" desabilitado.
- [ ] **OR-FIN-08** — Tentar sacar valor acima do disponível → **Esperado:** erro "Máximo disponível: R$ X,XX."
- [ ] **OR-FIN-09** — Solicitar saque válido sem chave PIX cadastrada → **Esperado:** botão desabilitado com aviso "Cadastre uma chave PIX acima para sacar."
- [ ] **OR-FIN-10** — Solicitar saque de até R$ 500 com tudo válido → **Esperado:** processamento automático — mensagem "PIX enviado. O valor deve cair em instantes na sua chave." (se autoprocessado) ou "Saque solicitado. Aguarde aprovação." conforme resposta do backend.

## 3.9 Comunicação com atletas

### Comunicado por categoria (push + WhatsApp)
**Não testar (não implementado na UI):** a tela `OrganizerCategoryCommunicatePage` existe e é funcional no código (seleção de público "Todas as duplas/Somente pagas/Somente pendentes", mensagem, switches de push/WhatsApp, prévia, envio via Cloud Function), mas **não há nenhum botão, card ou link em nenhuma tela do app que navegue até ela** — confirmado por busca de todas as chamadas a `pushOrganizerCategoryCommunicate` no código (só a própria definição da função aparece, nenhuma chamada). Reconfirme rapidamente no app atual (procurar por algum atalho "Comunicar" na Central de Partidas, no shell da categoria ou no menu `⋮`) antes de descartar — se ainda não existir entrada visível, registrar como não testável e não como bug de fluxo quebrado.

### Notificação automática de chave publicada
- [ ] **OR-COMUNIC-01** — Publicar uma chave (SE, DE ou grupos) para uma categoria com duplas confirmadas com push habilitado → **Esperado:** as duplas participantes recebem notificação push automática avisando que a chave foi publicada (verificar na caixa de entrada de notificações do app do atleta, não requer nenhuma ação manual do organizador).

**Não testar (não implementado):** Mensagem individual por dupla — no sheet de ações da dupla, a linha "Enviar mensagem — Push + WhatsApp para a dupla" existe visualmente mas seu `onTap` apenas fecha o sheet (`Navigator.pop(context)`), sem nenhuma ação de envio associada.

---

# 3. Papel: Gestor de Arena

Entrada: **`/arena`** (`ArenaShellPage`), abas Painel · Agenda · Comandas · Reservas · Ajustes.

## 4.1 Dashboard / Métricas

### Painel com KPIs (rota `arenaDashboard`)
**Objetivo:** Validar que o painel carrega e recalcula KPIs por período.
**Pré-condições:** Logado como gestor de uma arena com reservas e faturamento recentes.

- [ ] **AR-DASH-01** — Abrir aba Painel → **Esperado:** header "GESTOR • {ARENA}", título "Visão geral", ações rápidas (Abrir comanda / Bloquear horário / Reservas de hoje), chips de período (Hoje/Semana/Mês) e grid de KPIs (Faturamento, Ocupação, Reservas, Pico) preenchido.
- [ ] **AR-DASH-02** — Tocar chip "Semana" e depois "Mês" → **Esperado:** os 4 KPIs recalculam para 7 e 30 dias respectivamente, sem travar.
- [ ] **AR-DASH-03** — Forçar erro de carregamento (ex.: sem rede) → **Esperado:** mensagem "Não foi possível carregar o painel. Tente de novo." em vez de crash/tela branca.
- [ ] **AR-DASH-04** — Tocar "Abrir comanda" / "Bloquear horário" / "Reservas de hoje" → **Esperado:** navega respectivamente para o wizard de nova comanda, aba Agenda e aba Reservas.

### Gráfico de receita e Insights heurísticos
**Objetivo:** Validar gráfico de 7 dias e cards de insight.
**Pré-condições:** Arena com histórico de reservas variando ao longo da semana.

- [ ] **AR-DASH-05** — Conferir gráfico de receita dos últimos 7 dias → **Esperado:** renderiza com rótulos de dia e valores condizentes com o resumo do período.
- [ ] **AR-DASH-06** — Arena com dados suficientes → **Esperado:** seção "Insights" aparece com cards horizontais roláveis e rótulo "IA • ATUALIZADO HH:MM".
- [ ] **AR-DASH-07** — Arena nova / sem dado suficiente para gerar insight → **Esperado:** a seção "Insights" inteira fica oculta (não aparece mensagem de estado vazio nem espaço em branco quebrado) — comportamento esperado, não é bug.

### Card de seguidores e Reputação
**Objetivo:** Validar métricas de seguidores/reputação e a resposta a avaliações a partir do painel.
**Pré-condições:** Arena com seguidores e ao menos 1 avaliação pendente de resposta.

- [ ] **AR-DASH-08** — Conferir card "Seguidores": total, "+N essa semana", "% ativos recentemente" e badge "X% já reservaram" (se houver) → **Esperado:** valores batem com a lista real de seguidores.
- [ ] **AR-DASH-09** — Tocar "Promoções" no card de seguidores → **Esperado:** abre o bottom sheet de promoções da arena (ver 4.10).
- [ ] **AR-DASH-10** — Tocar "Criar torneio" no card de seguidores → **Esperado:** snackbar "Criar torneio em breve." (placeholder documentado, não deve abrir nada).
- [ ] **AR-DASH-11** — Conferir seção "Reputação": nota média em estrelas, "% respondidas", tempo médio de resposta (ou "—") e "meta 6h" → **Esperado:** valores condizem com as avaliações reais.
- [ ] **AR-DASH-12** — Com avaliações pendentes → tocar "Responder" numa delas, digitar texto e enviar → **Esperado:** navega para tela de sucesso "Resposta enviada", avaliação some da lista de pendentes e o badge de contagem decresce.
- [ ] **AR-DASH-13** — Tocar o atalho-raio (resposta rápida) → **Esperado:** abre o mesmo diálogo já preenchido com "Obrigado pelo feedback! Estamos sempre melhorando." pronto para editar ou enviar direto.
- [ ] **AR-DASH-14** — Sem avaliações pendentes → **Esperado:** texto "Nenhuma avaliação pendente de resposta."
- [ ] **AR-DASH-15** — Tocar "VER TODAS" → **Esperado:** navega para a tela de gestão de avaliações (rota `arenaManagerReviews`).

**Não testar (não implementado):** Notificações (sino no topo do painel) — toque abre apenas snackbar "Notificações em breve.", sem tela real por trás.

## 4.2 Gestão de Quadras

### Listagem, criar/editar e excluir quadra (rota `arenaCourts`)
**Objetivo:** Validar CRUD de quadras e o resumo da listagem.
**Pré-condições:** Logado como gestor; ter ao menos 1 arena vinculada.

- [ ] **AR-QUADRA-01** — Ajustes → Quadras, com quadras cadastradas → **Esperado:** resumo "N quadra(s) · X ativa(s)" (mais "· Y em manutenção" só se houver alguma), cada card com nome, esportes, preço/hora e "N reservas no mês".
- [ ] **AR-QUADRA-02** — Arena sem quadras → **Esperado:** estado vazio "Nenhuma quadra cadastrada" com CTA "Adicionar nova quadra".
- [ ] **AR-QUADRA-03** — Tocar "Adicionar nova quadra", preencher nome, selecionar 1+ esportes, escolher preço-base pré-definido → "Criar quadra" → **Esperado:** snackbar "Quadra criada.", quadra nova aparece na lista.
- [ ] **AR-QUADRA-04** — Tentar criar sem nenhum esporte selecionado → **Esperado:** erro "Selecione ao menos um esporte na quadra."
- [ ] **AR-QUADRA-05** — Escolher preço "Custom" e deixar o valor vazio/zero → **Esperado:** erro "Informe um preço válido."
- [ ] **AR-QUADRA-06** — Editar uma quadra existente (nome/esportes/preço) → "Salvar alterações" → **Esperado:** snackbar "Quadra atualizada.", card reflete os novos dados.
- [ ] **AR-QUADRA-07** — Excluir uma quadra → confirmar "Remover" no diálogo "Remover quadra?" → **Esperado:** quadra some da lista, snackbar "Quadra removida." (exclusão direta, sem opção de desfazer).
- [ ] **AR-QUADRA-08** — No mesmo diálogo, tocar "Cancelar" → **Esperado:** quadra permanece na lista, nada é removido.

### Limite de quadras por plano (gate Essencial × Pro/Parceiro)
**Objetivo:** Validar o bloqueio de novas quadras no plano Essencial.
**Pré-condições:** Uma arena de teste no plano Essencial com exatamente 2 quadras cadastradas (limite do Essencial); outra arena no plano Pro/Parceiro.

- [ ] **AR-QUADRA-09** — Arena Essencial com 2 quadras (limite) → tocar "Adicionar nova quadra" → **Esperado:** NÃO abre o formulário; abre bottom sheet "Limite de quadras atingido" com o texto "O plano atual permite até 2 quadras. Assine o Pro para adicionar quantas precisar." e botão "Ver planos".
- [ ] **AR-QUADRA-10** — No sheet de bloqueio, tocar "Ver planos" → **Esperado:** navega para a tela de Plano da arena (rota `arenaPlan`).
- [ ] **AR-QUADRA-11** — Arena Pro ou Parceiro com mais de 2 quadras → adicionar mais uma → **Esperado:** cria normalmente, sem nenhum bloqueio (limite ilimitado nesses planos).

**Não testar (não implementado):** Modo de manutenção por quadra ("flag por quadra"). O campo `status`/`isMaintenance` existe no modelo de dados e a listagem até exibe um badge "MANUTENÇÃO" e a contagem "X em manutenção" quando presente, mas não há nenhum controle de UI (switch/botão/menu) em nenhuma tela do app para o gestor ativar essa flag na quadra inteira — hoje só existe o bloqueio de horários individuais na Agenda com motivo "Manutenção" (ver 4.3). Reportar como gap se o requisito for realmente uma flag por quadra.

## 4.3 Agenda / Horários

### Grade por dia e quadra (rota `arenaSchedule`)
**Objetivo:** Validar navegação e filtros da grade da agenda.
**Pré-condições:** Arena com quadras e disponibilidade configurada.

- [ ] **AR-AGENDA-01** — Abrir aba Agenda → **Esperado:** grade do dia atual agrupada por horário/quadra, chips "Todas N / Disponível N / Reservado N" (e "Bloqueado N" só se houver algum).
- [ ] **AR-AGENDA-02** — Tocar o ícone de calendário e escolher outra data → **Esperado:** grade atualiza para a data escolhida.
- [ ] **AR-AGENDA-03** — Aplicar filtro "Disponível" → **Esperado:** só aparecem horários livres; contador do chip bate com a lista.
- [ ] **AR-AGENDA-04** — Dia sem nenhum horário para os filtros atuais → **Esperado:** estado vazio "Agenda vazia — Nenhum horário neste dia para os filtros atuais."

### Detalhe do horário (rota `arenaSlotDetail`)
**Objetivo:** Validar as ações rápidas disponíveis no detalhe de um slot.
**Pré-condições:** Ter ao menos um horário disponível e um bloqueado na agenda.

- [ ] **AR-AGENDA-05** — Tocar um horário disponível → **Esperado:** abre detalhe com data/quadra e grid de ações (Criar reserva, Bloquear, Ajustar preço, Horário fixo).
- [ ] **AR-AGENDA-06** — Tocar "Criar reserva" → **Esperado:** snackbar "Criar reserva em breve." (placeholder, não cria nada).
- [ ] **AR-AGENDA-07** — Tocar "Ajustar preço" → **Esperado:** snackbar "Ajustar preço em breve." (placeholder).
- [ ] **AR-AGENDA-08** — Tocar "Horário fixo" a partir de um slot disponível → **Esperado:** abre o formulário de novo horário fixo já pré-preenchido com quadra, dia da semana e horário daquele slot (ver AR-RESERVA-23).

### Bloquear / desbloquear horário
**Objetivo:** Validar o fluxo de bloqueio de horário com motivo e nota.
**Pré-condições:** Ter um horário disponível.

- [ ] **AR-AGENDA-09** — Toque longo num horário disponível (ou "Bloquear" no detalhe) → escolher motivo (Manutenção/Evento privado/Aula/Outro), nota opcional → "Bloquear horário" → **Esperado:** snackbar "Horário bloqueado.", slot passa a aparecer como bloqueado e some da busca pública do atleta.
- [ ] **AR-AGENDA-10** — No sheet de bloqueio, ativar "Repetir todo {dia da semana}" → **Esperado:** snackbar "Bloqueio recorrente em breve." — o switch não persiste nada (placeholder).
- [ ] **AR-AGENDA-11** — Abrir detalhe de um horário já bloqueado → tocar "Desbloquear" → **Esperado:** horário volta a ficar disponível na agenda e na busca do atleta.
- [ ] **AR-AGENDA-12** — Toque longo num horário já reservado ou já bloqueado → **Esperado:** ação de bloqueio não é oferecida (não abre o sheet).

### Configurar disponibilidade padrão e gerar horários (rota `arenaAvailabilitySettings`)
**Objetivo:** Validar configuração de horário padrão por dia e aplicação do template em todas as quadras.
**Pré-condições:** Arena com ao menos 1 quadra cadastrada.

- [ ] **AR-AGENDA-13** — Ajustes → Disponibilidade → alterar ABERTURA/FECHAMENTO padrão e duração do slot (30 min/1h/2h) → "Salvar alterações" → **Esperado:** navega para tela de sucesso "Horários gerados" com botão "Ir aos ajustes"; grade da Agenda passa a refletir os novos horários em **todas** as quadras.
- [ ] **AR-AGENDA-14** — Configurar fechamento antes da abertura (fora da exceção de virada de dia) → salvar → **Esperado:** erro "Abertura deve ser antes do fechamento (00:00 no fechamento = meia-noite do fim do dia, ex.: 23:00–00:00)."
- [ ] **AR-AGENDA-15** — Marcar um dia da semana como "FECHADO" (switch) → salvar → **Esperado:** aquele dia não gera horários; demais dias seguem normalmente.
- [ ] **AR-AGENDA-16** — Num dia customizado, tocar "USAR PADRÃO" → **Esperado:** volta a usar o horário padrão global para aquele dia.
- [ ] **AR-AGENDA-17** — Tentar gerar horários numa arena sem nenhuma quadra cadastrada → **Esperado:** erro "Cadastre ao menos uma quadra antes de gerar horários."

**Não testar (não implementado):** "Bloqueio recorrente" (switch no sheet de bloqueio) e "Criar reserva manual" / "Ajustar preço" nas ações rápidas do horário — todos mostram apenas snackbar "em breve" e não persistem nada.

## 4.4 Reservas (visão do gestor)

### Lista de reservas por período (rota `arenaBookings`)
**Objetivo:** Validar os 4 modos de visualização de reservas.
**Pré-condições:** Arena com reservas hoje, amanhã, futuras e passadas.

- [ ] **AR-RESERVA-01** — Abrir aba Reservas (modo padrão "Hoje") → **Esperado:** insight do dia (se houver) no topo + lista de reservas de hoje.
- [ ] **AR-RESERVA-02** — Alternar "Amanhã" / "Futuras" / "Passadas" → **Esperado:** "Futuras" e "Passadas" aparecem agrupadas por dia; listas mostram só reservas do período certo.
- [ ] **AR-RESERVA-03** — Filtro sem nenhuma reserva → **Esperado:** estado vazio específico (ex.: "Nenhuma reserva hoje").

### Detalhe da reserva e check-in (rota `arenaBookingDetail`)
**Objetivo:** Validar timeline, pagamento, atletas, histórico e check-in.
**Pré-condições:** Reserva ativa (não cancelada/concluída) com atleta identificado.

- [ ] **AR-RESERVA-04** — Tocar uma reserva na lista → **Esperado:** detalhe com timeline de eventos, pagamento, atletas participantes, histórico do atleta na arena e ações (contato/bloqueio/cancelamento).
- [ ] **AR-RESERVA-05** — Reserva pendente de check-in → tocar "Check-in" → **Esperado:** snackbar "Check-in registrado.", botão de check-in some do detalhe.
- [ ] **AR-RESERVA-06** — Reserva já com check-in feito ou marcada no-show → **Esperado:** botão "Check-in" não aparece mais.
- [ ] **AR-RESERVA-07** — Reserva já cancelada/concluída → **Esperado:** botão "Cancelar reserva" não aparece.

### Contato via WhatsApp/telefone
**Objetivo:** Validar o fallback de contato do atleta.
**Pré-condições:** Um atleta com telefone, outro só com e-mail, outro sem nenhum dos dois.

- [ ] **AR-RESERVA-08** — Tocar "Falar com atleta" com telefone cadastrado → **Esperado:** abre WhatsApp (wa.me) com número formatado (DDI 55 + DDD + número).
- [ ] **AR-RESERVA-09** — Atleta sem telefone mas com e-mail → **Esperado:** abre app de e-mail com assunto "Reserva — Nexago".
- [ ] **AR-RESERVA-10** — Atleta sem telefone e sem e-mail → **Esperado:** snackbar "Contato do atleta indisponível."

### Cancelar reserva (com motivo) e tela pós-cancelamento (undo)
**Objetivo:** Validar cancelamento com motivo e a janela de desfazer.
**Pré-condições:** Reserva ativa; uma com pagamento online e outra com pagamento direto.

- [ ] **AR-RESERVA-11** — "Cancelar reserva" → escolher motivo (A pedido do atleta / Conflito de agenda / Manutenção urgente / Outro motivo) → confirmar → **Esperado:** navega para "Reserva cancelada." com aviso de notificação ao atleta e card de undo contando 30 segundos.
- [ ] **AR-RESERVA-12** — Reserva com pagamento direto (no local) → abrir sheet de cancelamento → **Esperado:** aviso "Pagamento direto · não há reembolso online a processar. Resolva com o atleta presencialmente." antes de confirmar.
- [ ] **AR-RESERVA-13** — No sheet, tocar "Voltar" → **Esperado:** nada é cancelado, reserva segue ativa.
- [ ] **AR-RESERVA-14** — Na tela pós-cancelamento, tocar "Desfazer" dentro dos 30s → **Esperado:** snackbar "Reserva restaurada.", volta para a lista com a reserva ativa de novo.
- [ ] **AR-RESERVA-15** — Deixar os 30s expirarem → **Esperado:** contador chega a 0s, botão "Desfazer" desabilita (cancelamento vira definitivo).
- [ ] **AR-RESERVA-16** — Na mesma tela, tocar "Criar reserva" ou "Promo flash" no card "Slot liberado" → **Esperado:** snackbar "Criar reserva em breve." / "Promo flash em breve." (placeholders).

### Bloquear / desbloquear atleta
**Objetivo:** Validar bloqueio de atleta para novas reservas na arena.
**Pré-condições:** Reserva com atleta identificado, não bloqueado.

- [ ] **AR-RESERVA-17** — No detalhe, "Bloquear atleta" → digitar motivo → "Confirmar bloqueio" → **Esperado:** snackbar "Atleta bloqueado com sucesso.", detalhe passa a mostrar aviso de bloqueio e botão "Desbloquear atleta".
- [ ] **AR-RESERVA-18** — Tentar confirmar bloqueio com motivo vazio → **Esperado:** botão "Confirmar bloqueio" permanece desabilitado.
- [ ] **AR-RESERVA-19** — "Desbloquear atleta" → confirmar → **Esperado:** tela "Atleta desbloqueado" com botão "Voltar para a reserva"; atleta volta a poder reservar na arena.

### Horários fixos / mensalistas (rotas `arenaRecurring`, `arenaRecurringNew`, `arenaRecurringCreated`, `arenaRecurringDetail`)
**Objetivo:** Validar criação, cancelamento de ocorrência/série e materialização das reservas.
**Pré-condições:** Arena com ao menos 1 quadra.

- [ ] **AR-RESERVA-20** — Na aba Reservas, tocar "Horários fixos (mensalistas)" → **Esperado:** lista de séries ativas (ou estado vazio "Nenhum horário fixo").
- [ ] **AR-RESERVA-21** — "Novo" → preencher quadra, dia da semana, horário de início, duração (1h/2h/3h), nome do mensalista, valor por semana, data de início → "Criar horário fixo" → **Esperado:** navega para tela de sucesso com o resumo (dia/quadra/horário/mensalista) e quantidade de datas criadas.
- [ ] **AR-RESERVA-22** — Criar num dia/horário/quadra com conflito em alguma data futura próxima → **Esperado:** diálogo "N data(s) com conflito" listando as datas que ficaram de fora, antes de seguir para a tela de sucesso.
- [ ] **AR-RESERVA-23** — Tentar criar sem nome do mensalista → **Esperado:** erro "Informe o nome do mensalista."
- [ ] **AR-RESERVA-24** — Tentar criar com valor zerado/vazio → **Esperado:** erro "Informe um valor válido."
- [ ] **AR-RESERVA-25** — Abrir detalhe de uma série ativa → **Esperado:** mostra dia/horário/valor semanal, mensalista, data de início e lista de próximas ocorrências materializadas (dentro do horizonte de 35 dias).
- [ ] **AR-RESERVA-26** — Cancelar apenas uma ocorrência futura da série → confirmar → **Esperado:** snackbar "Reserva de {data} cancelada.", ocorrência some da lista; série continua ativa nas demais semanas.
- [ ] **AR-RESERVA-27** — "Encerrar horário fixo" → confirmar → **Esperado:** snackbar "Horário fixo encerrado.", todas as reservas futuras da série são canceladas e os horários liberados; reservas passadas são preservadas.

### Limite de horários fixos por plano (Essencial = 3 séries ativas)
**Objetivo:** Validar o gate de plano na criação de mensalistas.
**Pré-condições:** Uma arena de teste no plano Essencial com exatamente 3 séries recorrentes **ativas**; outra no Pro/Parceiro.

- [ ] **AR-RESERVA-28** — Arena Essencial no limite (3 ativas) → tocar "Novo" na lista de horários fixos → **Esperado:** NÃO abre o formulário; abre sheet "Limite de horários fixos atingido" — "O plano atual permite até 3 horários fixos ativos. Assine o Pro para criar quantos precisar."
- [ ] **AR-RESERVA-29** — Mesma arena, entrar direto no formulário (ex.: via "Horário fixo" no detalhe de um slot) → **Esperado:** banner de somente-leitura já visível no topo do formulário ("Limite de 3 horários fixos do plano atual atingido. Assine o Pro para criar mais.") e, ao tentar submeter, o mesmo sheet de upsell aparece em vez de chamar o backend.
- [ ] **AR-RESERVA-30** — Arena Essencial com 2 séries ativas (dentro do limite) → criar a 3ª série → **Esperado:** cria normalmente, sem bloqueio.
- [ ] **AR-RESERVA-31** — A partir do cenário no limite (3 ativas), encerrar uma série → **Esperado:** contagem cai para 2 e passa a ser possível criar uma nova série normalmente.
- [ ] **AR-RESERVA-32** — Arena no plano Pro ou Parceiro → criar mais de 3 séries simultâneas → **Esperado:** nenhum bloqueio (limite ilimitado nesses planos).

## 4.5 Comandas (PDV / vendas)

### Lista de comandas com KPIs (rota `arenaComandas`)
**Objetivo:** Validar listagem, KPIs e busca de comandas.
**Pré-condições:** Arena no plano Pro/Parceiro com comandas abertas.

- [ ] **AR-COMANDA-01** — Abrir aba Comandas → **Esperado:** KPIs no topo (comandas abertas, faturamento do dia), chips de filtro, lista de comandas com número, cliente/quadra e valor.
- [ ] **AR-COMANDA-02** — Sem comandas abertas → **Esperado:** estado vazio "Nenhuma comanda aberta" com dica "Toque em Nova para abrir a primeira comanda."
- [ ] **AR-COMANDA-03** — Tocar o ícone de busca (lupa) → **Esperado:** snackbar "Busca em breve." — não filtra nada (placeholder).

### Nova comanda — vincular reserva ou avulsa (rotas `arenaComandaNewType`, `arenaComandaNewLink`)
**Objetivo:** Validar o wizard de abertura de comanda.
**Pré-condições:** Ter uma reserva ativa "agora" na arena.

- [ ] **AR-COMANDA-04** — Tocar "Nova" → **Esperado:** como só há o tipo "Individual" disponível, a etapa "Que tipo?" é pulada automaticamente e o wizard abre direto em "Vincular reserva".
- [ ] **AR-COMANDA-05** — Selecionar uma reserva ativa em "RESERVAS ATIVAS AGORA" → Continuar → preencher dados do cliente → revisar → Abrir → **Esperado:** comanda criada vinculada à reserva, com o valor de locação já lançado como item inicial.
- [ ] **AR-COMANDA-06** — Escolher "Abrir sem vínculo" → Continuar → **Esperado:** segue o wizard sem nenhuma reserva/locação atrelada (comanda avulsa).
- [ ] **AR-COMANDA-07** — Nenhuma reserva ativa no momento → **Esperado:** mensagem "Nenhuma reserva em andamento agora."; ainda é possível seguir com "Abrir sem vínculo".
- [ ] **AR-COMANDA-08** — Não selecionar nem reserva nem "sem vínculo" → **Esperado:** botão "Continuar" permanece desabilitado.

### Adicionar produtos — quick-add com baixa de estoque (rota `arenaComandaQuickAdd`)
**Objetivo:** Validar lançamento rápido de produtos e integração com estoque.
**Pré-condições:** Comanda aberta; catálogo de produtos com estoque > 0.

- [ ] **AR-COMANDA-09** — Na comanda, "Lançamento rápido" → filtrar por categoria (Rápido/Bebidas/Comida/Equip.) e/ou buscar → incrementar quantidade de 1+ produtos → "Lançar na comanda · R$X" → **Esperado:** volta ao detalhe com os itens lançados e total atualizado; no catálogo de Estoque, a quantidade desses produtos diminuiu na mesma proporção.
- [ ] **AR-COMANDA-10** — Buscar por um produto inexistente → **Esperado:** grade fica vazia.
- [ ] **AR-COMANDA-11** — Carrinho de rascunho vazio (nenhum produto incrementado) → **Esperado:** painel "A lançar" e botão de lançamento ficam ocultos.

### Receber pagamento (rota `arenaComandaPayment`)
**Objetivo:** Validar registro de pagamento e fechamento automático da comanda.
**Pré-condições:** Comanda com saldo em aberto.

- [ ] **AR-COMANDA-12** — Ir em "Pagamento" → escolher forma (Pix/Crédito/Débito/Dinheiro/Carteira/Mais) → "Receber R$X em {forma}" → confirmar nome do pagador → **Esperado:** pagamento registrado; se cobrir o total, a comanda fecha automaticamente e navega para "Comanda fechada" com valor total e cashback (se houver).
- [ ] **AR-COMANDA-13** — Na tela "Comanda fechada", tocar "Comprovante" → **Esperado:** snackbar "Comprovante em breve." (placeholder).
- [ ] **AR-COMANDA-14** — *[Gap a confirmar]* Tentar registrar um pagamento **parcial** (menor que o saldo devedor) → **Esperado hoje:** não é possível pela UI — a tela de pagamento não tem campo de valor; o botão "Receber" sempre envia o saldo total pendente de uma só vez. O status "parcialmente pago" existe no modelo de dados, mas não há caminho na UI do gestor para gerar esse estado manualmente. Reportar como gap se pagamento parcial for requisito do produto.

### Gate de plano (PDV/Comandas exclusivo Pro/Parceiro)
**Objetivo:** Validar o comportamento em downgrade e no Essencial puro.
**Pré-condições:** Arena de teste no plano Essencial, sem histórico de comandas; outra arena Essencial que já teve comandas quando era Pro (downgrade).

- [ ] **AR-COMANDA-15** — Arena Essencial sem nenhuma comanda no histórico → abrir aba Comandas → **Esperado:** tela inteira substituída pelo paywall "PDV e comandas" com botão "Ver planos" (sem lista, sem KPIs).
- [ ] **AR-COMANDA-16** — Arena Essencial com comandas herdadas de quando era Pro → abrir aba Comandas → **Esperado:** lista aparece em modo somente leitura, com banner "Somente leitura. Você pode fechar as comandas abertas, mas não abrir novas."; tocar "Nova" abre o sheet de upsell em vez do wizard.

**Não testar (não implementado):** Tipos de comanda "Mesa", "Evento" e "Compartilhada" — só "Individual" está ativo; a etapa de escolha de tipo é pulada automaticamente e, se forçada, as demais opções só mostram "Em breve."; busca de comandas (ícone de lupa mostra "Busca em breve."); comprovante ao fechar comanda ("Comprovante em breve.").

## 4.6 Estoque / Produtos

### Catálogo de produtos (rota `arenaProducts`)
**Objetivo:** Validar listagem, filtros e resumo do catálogo.
**Pré-condições:** Arena no plano Pro/Parceiro com produtos cadastrados.

- [ ] **AR-ESTOQUE-01** — Ajustes → Produtos e estoque → **Esperado:** resumo (contagem/alertas), chips de categoria, lista com nome, preço e estoque de cada produto.
- [ ] **AR-ESTOQUE-02** — Filtrar por categoria → **Esperado:** lista mostra só produtos da categoria selecionada.
- [ ] **AR-ESTOQUE-03** — Categoria sem produtos → **Esperado:** estado vazio "Nenhum produto nesta categoria."

### Criar / editar produto com upload de imagem (rotas `arenaProductNew`, `arenaProductEdit`)
**Objetivo:** Validar cadastro e edição de produto, incluindo imagem.
**Pré-condições:** Arena no plano Pro/Parceiro.

- [ ] **AR-ESTOQUE-04** — "+" → preencher nome, categoria, preço, estoque inicial, estoque mínimo, foto (upload) ou emoji → Salvar → **Esperado:** produto criado e listado com a imagem/emoji escolhido.
- [ ] **AR-ESTOQUE-05** — Editar produto existente, trocar a foto por upload de nova imagem → Salvar → **Esperado:** nova imagem substitui a anterior no card.
- [ ] **AR-ESTOQUE-06** — Tentar salvar sem nome ou sem preço → **Esperado:** validação bloqueia o salvamento e sinaliza o campo obrigatório.

### Excluir produto com desfazer
**Objetivo:** Validar exclusão, desativação e a janela de undo.
**Pré-condições:** Produto cadastrado com estoque > 0.

- [ ] **AR-ESTOQUE-07** — No card do produto, excluir → sheet "Excluir produto?" → "Excluir produto" (não "Desativar") → **Esperado:** navega para "Produto excluído." com card de undo contando **5 segundos**.
- [ ] **AR-ESTOQUE-08** — Dentro dos 5s, tocar "Desfazer" → **Esperado:** snackbar "Produto restaurado.", volta ao catálogo com o mesmo estoque de antes.
- [ ] **AR-ESTOQUE-09** — Deixar os 5s expirarem → **Esperado:** botão "Desfazer" desabilita; exclusão vira definitiva.
- [ ] **AR-ESTOQUE-10** — No mesmo sheet, tocar "Desativar" em vez de excluir → **Esperado:** produto some do cardápio de vendas mas continua no catálogo/estoque (reversível depois), sem passar pela tela de undo.

### Alertas de estoque baixo e reposição (rotas `arenaProductStock`, `arenaProductRestock`)
**Objetivo:** Validar alertas de giro e movimentações de estoque.
**Pré-condições:** Ao menos 1 produto com estoque abaixo do mínimo configurado.

- [ ] **AR-ESTOQUE-11** — Abrir "Estoque" (ícone no topo da lista de produtos) com produto abaixo do mínimo → **Esperado:** aparece na lista de alertas com giro de 7 dias.
- [ ] **AR-ESTOQUE-12** — Nenhum produto com estoque baixo → **Esperado:** seção de alertas vazia/oculta.
- [ ] **AR-ESTOQUE-13** — Num produto, "Repor estoque" → tipo "Compra", quantidade N → confirmar → **Esperado:** tela de sucesso do movimento; estoque aumenta em N.
- [ ] **AR-ESTOQUE-14** — Repetir com tipo "Perda" → **Esperado:** estoque reduz (delta negativo); conferir preview do novo total antes de salvar.
- [ ] **AR-ESTOQUE-15** — Repetir com tipo "Ajuste" → **Esperado:** preview mostra o efeito do ajuste sobre o total corretamente antes de confirmar.

### Integração automática com comandas
**Objetivo:** Confirmar baixa automática de estoque na venda.
**Pré-condições:** Produto com estoque conhecido.

- [ ] **AR-ESTOQUE-16** — Lançar um produto numa comanda (ver AR-COMANDA-09) e conferir o catálogo de Estoque em seguida → **Esperado:** quantidade em estoque caiu exatamente a quantidade vendida.

### Gate de plano (Estoque exclusivo Pro/Parceiro)
**Objetivo:** Validar bloqueio/modo leitura no Essencial.
**Pré-condições:** Arena Essencial sem produtos; arena Essencial com produtos herdados de quando era Pro.

- [ ] **AR-ESTOQUE-17** — Arena Essencial sem produtos cadastrados → abrir Produtos e estoque → **Esperado:** paywall "Controle de estoque" no lugar da lista, com "Ver planos".
- [ ] **AR-ESTOQUE-18** — Arena Essencial com produtos herdados → abrir Produtos e estoque → **Esperado:** lista em modo somente leitura com banner "Somente leitura. Assine o Pro para criar, editar ou repor produtos."; tocar "+" ou no ícone de estoque abre o sheet de upsell em vez do formulário.

## 4.7 Financeiro e Pagamentos

### Saldo da carteira e histórico (rota `arenaPayments`)
**Objetivo:** Validar exibição de saldo e histórico de movimentações.
**Pré-condições:** Arena com créditos de reservas na carteira.

- [ ] **AR-FIN-01** — Ajustes → Pagamentos → **Esperado:** card de saldo (disponível/pendente), seletor de período, histórico de movimentações (créditos de reservas e saques).
- [ ] **AR-FIN-02** — Filtrar histórico por tipo de movimento → **Esperado:** lista filtra corretamente.

### Solicitar saque PIX (automático até R$500, acima disso aprovação manual)
**Objetivo:** Validar os dois caminhos de processamento de saque.
**Pré-condições:** Saldo disponível ≥ R$600; chave PIX cadastrada e válida.

- [ ] **AR-FIN-03** — Solicitar saque de valor **até R$500** (ex.: R$300) com saldo suficiente → **Esperado:** processamento automático; em caso de sucesso, mensagem "PIX enviado. O valor deve cair em instantes na sua chave."
- [ ] **AR-FIN-04** — Solicitar saque **acima de R$500** (ex.: R$600) → **Esperado:** mensagem "Saque acima de R$ 500. Aguardando aprovação da plataforma." — fica pendente para aprovação manual no backoffice, não tenta envio automático.
- [ ] **AR-FIN-05** — Tentar solicitar abaixo do mínimo (R$20), ex.: R$10 → **Esperado:** erro "Mínimo: R$ 20,00." e botão "Solicitar saque" desabilitado.
- [ ] **AR-FIN-06** — Tentar solicitar valor maior que o saldo disponível → **Esperado:** erro "Máximo disponível: R$X."
- [ ] **AR-FIN-07** — Tocar "Sacar tudo" → **Esperado:** campo de valor preenchido automaticamente com o saldo disponível total.
- [ ] **AR-FIN-08** — Solicitar um novo saque enquanto já existe outro pendente → **Esperado:** erro do tipo "Já existe um saque pendente para esta arena. Aguarde a conclusão ou contate o suporte."

### Chave PIX de repasse (validação por tipo)
**Objetivo:** Validar validação de formato por tipo de chave.
**Pré-condições:** Estar na tela de edição da chave PIX (Pagamentos → editar chave).

- [ ] **AR-FIN-09** — Tipo "CPF" com dígito verificador inválido → **Esperado:** erro "CPF inválido."
- [ ] **AR-FIN-10** — Tipo "CPF" com menos de 11 dígitos → **Esperado:** erro "CPF deve ter 11 dígitos."
- [ ] **AR-FIN-11** — Tipo "CNPJ" inválido → **Esperado:** erro "CNPJ inválido." (ou "CNPJ deve ter 14 dígitos" se incompleto).
- [ ] **AR-FIN-12** — Tipo "E-mail" sem "@" → **Esperado:** erro "E-mail inválido."
- [ ] **AR-FIN-13** — Tipo "Celular (com DDD)" com menos de 10 dígitos → **Esperado:** erro "Telefone com DDD: 10 ou 11 dígitos (ex.: 62999853983)."
- [ ] **AR-FIN-14** — Tipo "Chave aleatória" com valor que não é um UUID válido → **Esperado:** erro "Chave aleatória inválida."
- [ ] **AR-FIN-15** — Preencher corretamente uma chave válida para o tipo selecionado → salvar → **Esperado:** chave aceita e disponível para uso no próximo saque.

**Não testar (não implementado):** Extrato exportável (botão de relatório mostra apenas "Extrato completo em breve."); integração visual com Mercado Pago (o widget `ArenaMercadoPagoConnectCard` existe no código-fonte, mas não está referenciado em nenhuma tela do app — inalcançável pela navegação normal).

## 4.8 Plano / Assinatura da Arena

### Catálogo de planos e status da assinatura (rota `arenaPlan`)
**Objetivo:** Validar exibição dos planos e do status atual.
**Pré-condições:** Uma arena em cada status: sem assinatura, ativa, em atraso.

- [ ] **AR-PLANO-01** — Ajustes → Plano → **Esperado:** banner de status no topo, toggle Mensal/Anual, 3 cards (Essencial grátis, Pro, Parceiro) com benefícios e aviso "Valores ilustrativos — a tabela oficial de planos será confirmada em breve."
- [ ] **AR-PLANO-02** — Alternar para "Anual" → **Esperado:** preços mudam para o valor anual e badge "2 MESES GRÁTIS" aparece na opção.
- [ ] **AR-PLANO-03** — Arena sem assinatura paga → **Esperado:** banner "Plano Essencial — Você está no plano gratuito. Assine para liberar mais."
- [ ] **AR-PLANO-04** — Arena com assinatura ativa → **Esperado:** banner "Plano {Pro/Parceiro} ativo" com badge "ATIVO" e "Renova em DD/MM/AAAA".
- [ ] **AR-PLANO-05** — Arena com pagamento em atraso → **Esperado:** banner "Pagamento em atraso — Regularize para manter os benefícios do plano." (a arena mantém os benefícios Pro durante a carência de 7 dias, mesmo com o aviso).

### Assinar via PIX in-app / via cartão
**Objetivo:** Validar os dois métodos de assinatura.
**Pré-condições:** Arena no Essencial querendo subir de tier.

- [ ] **AR-PLANO-06** — "Assinar" no Pro (ou Parceiro) → confirmar CNPJ válido → "PIX" → **Esperado:** "Gerando cobrança PIX…" e depois tela de pendência com QR/copia-e-cola, com polling até a ativação.
- [ ] **AR-PLANO-07** — Informar CNPJ com formato inválido → **Esperado:** campo com erro de validação; botões "PIX"/"Cartão" ficam desabilitados até corrigir.
- [ ] **AR-PLANO-08** — Completar o pagamento PIX → **Esperado:** tela "Plano ativado!" com destaques específicos do tier (PDV e comandas / Dashboard e Insights / Torneios e etapas no Pro; Múltiplas unidades / Liga nexaGO / Gerente dedicado no Parceiro).
- [ ] **AR-PLANO-09** — "Assinar" → CNPJ válido → "Cartão" → **Esperado:** "Preparando checkout do cartão…" e abertura do checkout hospedado Asaas fora do app; ao concluir, retorna para a tela de pendência.

### Cancelar assinatura
**Objetivo:** Validar downgrade para Essencial mantendo benefícios até o fim do período pago.
**Pré-condições:** Arena com assinatura Pro/Parceiro ativa.

- [ ] **AR-PLANO-10** — No card Essencial, tocar "Downgrade" → confirmar "Cancelar plano" no diálogo "Cancelar assinatura?" → **Esperado:** snackbar "Assinatura cancelada."; banner muda para "Plano {X} cancelado — Benefícios até DD/MM/AAAA".
- [ ] **AR-PLANO-11** — No mesmo diálogo, tocar "Voltar" → **Esperado:** nada muda, assinatura continua ativa.

## 4.9 Perfil e Configurações da Arena

### Perfil público editável (rota `arenaProfileEdit`)
**Objetivo:** Validar edição do perfil público visto pelos atletas.
**Pré-condições:** Arena com perfil já preenchido.

- [ ] **AR-PERFIL-01** — Ajustes → tocar no card com nome/logo da arena → Editar perfil → alterar nome, bio, contato, endereço, esportes, comodidades → Salvar → **Esperado:** tela de sucesso e os dados refletem no perfil público visto pelo atleta.
- [ ] **AR-PERFIL-02** — Alternar comodidades (switches em "COMODIDADES") → Salvar → **Esperado:** mudanças refletem nos badges de comodidade do perfil público.
- [ ] **AR-PERFIL-03** — Ajustar "PAGAMENTOS" (pagamento online/local habilitado, chave PIX) → Salvar → **Esperado:** resumo em Ajustes atualiza (ex.: "Pix • pagamento direto") e reflete na tela de reserva do atleta.

### Hub de ajustes (rota `arenaSettings`)
**Objetivo:** Validar navegação central e logout.
**Pré-condições:** Logado como gestor.

- [ ] **AR-PERFIL-04** — Abrir aba Ajustes → **Esperado:** seção "ARENA" (perfil, disponibilidade, quadras, produtos e estoque com badge de alerta se houver) e "PREFERÊNCIAS" (notificações, plano, pagamentos, equipe); seção "ACESSO" com "Trocar papel" só se o usuário tiver mais de um papel; botão "Sair".
- [ ] **AR-PERFIL-05** — Tocar "Sair" → confirmar "Sair" no diálogo → **Esperado:** sessão encerrada, volta para a tela de login.
- [ ] **AR-PERFIL-06** — (Se disponível) tocar "Trocar papel" → **Esperado:** abre o sheet de seleção de papel (atleta/organizador/arena).

**Não testar (não implementado):** Equipe/staff (Ajustes → Equipe mostra apenas snackbar "Equipe em breve.", nenhuma tela de gestão abre); notificações configuráveis (Ajustes → Notificações mostra apenas "Notificações em breve.").

## 4.10 Avaliações, Seguidores e Promoções

### Gestão de avaliações — responder (rota `arenaManagerReviews`)
**Objetivo:** Validar resposta a avaliações e paginação.
**Pré-condições:** Arena com avaliações, algumas sem resposta.

- [ ] **AR-AVAL-01** — Painel → "VER TODAS" em Reputação → **Esperado:** lista completa de avaliações, carregando 10 por vez com opção de carregar mais.
- [ ] **AR-AVAL-02** — "Responder" numa avaliação sem resposta → digitar texto → enviar → **Esperado:** tela de sucesso "Resposta enviada", avaliação passa a exibir a resposta para o atleta.
- [ ] **AR-AVAL-03** — Usar o atalho-raio (resposta rápida) → **Esperado:** diálogo abre já preenchido com "Obrigado pelo feedback! Estamos sempre melhorando." pronto para editar/enviar.
- [ ] **AR-AVAL-04** — Arena sem nenhuma avaliação → **Esperado:** "Ainda não há avaliações registradas."

### Lista de seguidores + insights (rota `arenaFollowers`)
**Objetivo:** Validar listagem de seguidores e acesso ao perfil.
**Pré-condições:** Arena com ao menos 1 seguidor.

- [ ] **AR-AVAL-05** — Abrir lista de seguidores ("Atletas interessados") → **Esperado:** cada item com badge "⭐ Novo seguidor" ou "🔥 Frequente" conforme o comportamento do atleta.
- [ ] **AR-AVAL-06** — Tocar num seguidor da lista → **Esperado:** abre o perfil público daquele atleta.
- [ ] **AR-AVAL-07** — Arena sem seguidores → **Esperado:** "Ainda não há seguidores para esta arena."

### Promoções de horário (sheet a partir do card Seguidores)
**Objetivo:** Validar criação, edição, pausa e exclusão de promoções.
**Pré-condições:** Arena no plano Pro/Parceiro (capability `promocoes`).

- [ ] **AR-AVAL-08** — No card "Seguidores", tocar "Promoções" → **Esperado:** sheet lista promoções ativas/pausadas com botão de criar nova.
- [ ] **AR-AVAL-09** — Criar promoção: nome, horário início/fim (HH:MM), desconto %, dias da semana, "Todas as quadras" ou quadras específicas → "Ativar promoção" → **Esperado:** snackbar "Promoção ativada na agenda."; desconto passa a valer nos horários/quadras configurados.
- [ ] **AR-AVAL-10** — Tentar criar sem nome → **Esperado:** erro "Informe um nome para a promoção."
- [ ] **AR-AVAL-11** — Informar desconto 0% ou acima de 100% → **Esperado:** erro "Desconto entre 1% e 100%."
- [ ] **AR-AVAL-12** — Desmarcar todos os dias da semana → **Esperado:** erro "Selecione ao menos um dia da semana."
- [ ] **AR-AVAL-13** — Desligar "Todas as quadras" sem selecionar nenhuma quadra específica → salvar → **Esperado:** confirmar o comportamento observado (deveria bloquear o salvamento ou não aplicar desconto a nenhuma quadra) — reportar se salvar silenciosamente sem quadra nenhuma associada.
- [ ] **AR-AVAL-14** — Desativar o switch de uma promoção ativa na lista → **Esperado:** snackbar "Promoção pausada.", desconto para de valer na agenda imediatamente, sem diálogo de confirmação.
- [ ] **AR-AVAL-15** — Reativar uma promoção pausada → **Esperado:** snackbar "Promoção ativada na agenda."
- [ ] **AR-AVAL-16** — Excluir uma promoção → confirmar "Excluir" no diálogo "Excluir promoção?" → **Esperado:** snackbar "Promoção excluída.", desconto some da agenda.

### Gate de plano (Promoções exclusivo Pro/Parceiro)
**Objetivo:** Validar bloqueio no Essencial.
**Pré-condições:** Arena no plano Essencial.

- [ ] **AR-AVAL-17** — Arena Essencial → tocar "Promoções" no card de seguidores → **Esperado:** sheet mostra o paywall "Promoções de horário" em vez da lista, com CTA para ver planos.

**Não testar (não implementado):** Desconto tipo "preço fixo" nas promoções — o modelo de dados (`ArenaPromotion.fixedPricePerHourReais`) suporta esse tipo, mas o formulário de criação/edição de promoção só expõe o campo "Desconto (%)"; não há nenhum controle na UI para configurar um preço fixo por quadra/dia/horário.

---

# 4. Achados durante a geração deste mapa (para triagem do time)

Ao pesquisar o código para escrever os casos de teste, foram encontrados pontos que não são necessariamente bugs, mas que merecem uma decisão consciente do time (corrigir, aceitar como está, ou remover da UI) antes do lançamento. Muitos já aparecem marcados inline nas seções acima com *(gap identificado)*, *(discrepância de código)*, *(validar com produto)* etc. — aqui estão agrupados para facilitar a triagem.

## Possíveis bugs / regressões reais (vale investigar primeiro)

- **Seção "Precisa de você" nunca aparece na Agenda do atleta** (AT-AGENDA-12) — o widget e o provider de convites de parceiro pendentes existem e têm dados reais, mas não são instanciados em nenhuma tela do app. Convites continuam acessíveis pelo hub Competir, então não é um bloqueador, mas pode ser uma regressão de UI perdida em refatoração.
- **Exclusão de conta sempre mostra a mesma mensagem genérica de erro** (AT-CONF-23), mesmo no cenário em que os dados do atleta já foram apagados no backend mas só a remoção do login falhou. O usuário pode tentar excluir de novo achando que nada ocorreu.
- **Convite de link de reserva (`/convite/:id`) tem uma corrida (race) sem proteção transacional** (AT-RESERVA-54) — dois usuários podem aceitar o mesmo convite em sequência sem aviso de "já aceito".
- **Convite de reserva continua mostrando dados de uma reserva já cancelada** (AT-RESERVA-55) como se ainda fosse válida, pois a tela não relê o status atual antes de exibir.
- **Rotas públicas de convite de torneio (`/torneios-convite/:id`) e transmissão ao vivo (`/torneios/:id/ao-vivo/:matchId`) não estão na allowlist de rotas públicas do router** (AT-INSCR-23, AT-TORNEIO-19), enquanto `/convite/:id` está. Se o guard de autenticação redirecionar essas duas para `/login` antes mesmo de a própria tela tratar o caso "deslogado", o fluxo de convite de parceiro de torneio e a transmissão pública ficam quebrados para quem não está logado — validar com prioridade, pois transmissão pública sem exigir login é uma funcionalidade anunciada.
- **Súmula de partida (Organizador) perdeu o botão de compartilhar** (OR-PART-40) — está comentado no código (`// TODO: Add share button`), divergindo do levantamento de funcionalidades original que descrevia a ação como implementada.
- **Card da final na chave de dupla eliminação continua clicável antes das semifinais serem concluídas** (AT-TORNEIO-14), mostrando placeholders — validar se o comportamento esperado é bloquear/desabilitar esse card até a chave resolver os lados.

## Funcionalidades sem entrada de UI (o backend funciona, mas ninguém alcança a tela)

- **"Comunicar categoria"** (push + WhatsApp por categoria, Organizador) — tela e Cloud Function prontas, mas nenhum botão em nenhuma tela navega até ela (ver 3.5 e 3.9).
- **Visão geral do torneio** (Organizador) — card está comentado, rota inalcançável pela UI.
- **Preferências de notificação do atleta** (AT-NOTIF-14) — item "Notificações" não aparece no menu de Configurações (comentado como "TODO: adicionar quando implementado na próxima versão"), mas a tela funciona se acessada direto pela rota.
- **Botão de compartilhar no próprio perfil do atleta** (AT-PERFIL-06, AT-PERFIL-46) — não existe mais na UI, o que pode travar a missão diária "Compartilhe seu perfil" (AT-GAM-12), já que a Quest orienta o usuário a tocar num botão que não está mais lá.

## Placeholders "em breve" — não abrir bug, mas validar com produto se algum é P0

- **Atleta:** convidar jogadores na reserva/detalhe de reserva, pagar PIX pendente a partir de "Minhas reservas", busca na Agenda, drop-in/dia de descanso, editar/denunciar avaliação, desafiar dupla, revanche/perfil do adversário no histórico.
- **Organizador:** editar inscrição (trocar parceiro/nível/cidade), enviar mensagem individual por dupla, exportar relatório financeiro, formatos "pontos corridos" e "grupos + repescagem" (UI existe, geração de chave não).
- **Gestor de Arena:** modo de manutenção por quadra (só existe bloqueio de horário individual), criar reserva manual, ajustar preço de slot, bloqueio recorrente, tipos de comanda mesa/evento/compartilhada, busca de comandas, comprovante ao fechar comanda, pagamento parcial de comanda pela UI, extrato financeiro exportável, integração visual Mercado Pago, equipe/staff da arena, notificações configuráveis da arena, desconto "preço fixo" em promoções.

## Discrepância confirmada com `docs/product/features-by-role.md`

- **Aba Comunidade do atleta** (2.15) estava marcada como placeholder/órfã ("em breve") no levantamento original de 01–02/07/2026. No código atual ela está **ativa e funcional** (aba índice 4 do shell do atleta, ranking em destaque + feed automático, sem criação manual de post). Recomenda-se atualizar `features-by-role.md` depois desta rodada de QA.

## Área de atenção prioritária (mudança mais recente do app)

- **Filtro de nível no Ranking geral** (2.12, casos AT-RANK-03 a AT-RANK-22) — foi a área modificada pelos 3 commits mais recentes do repositório (troca de `PopupMenuButton` nativo por bottom sheet, uso de sentinela inteiro para "todos os níveis" em vez de `null`). Recomenda-se que os testadores executem essa subseção primeiro e com atenção redobrada, incluindo o caso de regressão específico AT-RANK-05 (selecionar "todos os níveis" depois de um filtro específico) e a fragilidade conhecida do card flutuante da posição do usuário (AT-RANK-19).

