# NexaGO — Funcionalidades por Papel

> Levantamento estruturado de todas as funcionalidades existentes no app Flutter (`nexago_app/`), Cloud Functions (`functions/`) e site web (`frontend/projects/site/`), organizado pelos três papéis do produto: **Atleta**, **Organizador** e **Gestor de Arena**.
>
> Status inferido diretamente do código-fonte:
> - ✅ **Implementado** — fluxo funcional, com persistência real (Firestore/Cloud Functions).
> - 🟡 **Parcial** — existe UI/lógica, mas com lacunas relevantes ou dependências pendentes.
> - ⚪ **Placeholder** — tela/ação existe apenas como esqueleto, mock ou aviso "em breve".
>
> Última atualização: gerado por análise de código em 01/07/2026.

---

## Sumário

1. [Visão geral da plataforma](#1-visão-geral-da-plataforma)
2. [Papel: Atleta](#2-papel-atleta)
3. [Papel: Organizador](#3-papel-organizador)
4. [Papel: Gestor de Arena](#4-papel-gestor-de-arena)
5. [Funcionalidades transversais](#5-funcionalidades-transversais)
6. [Lacunas e itens pendentes (consolidado)](#6-lacunas-e-itens-pendentes-consolidado)

---

## 1. Visão geral da plataforma

O NexaGO é um app Flutter mobile (`nexago_app/lib/`) com backend em Firebase (Firestore, Auth, Cloud Functions, Storage) para gestão e participação em torneios e ligas de esportes de quadra na areia (beach tennis e vôlei de praia). Um mesmo usuário pode acumular múltiplos papéis (**multi-role**), alternando entre eles via seleção de papel (`/auth/role-selection`) e um sheet de troca de papel dentro de cada shell.

| Papel | Shell / entrada | Persona |
|---|---|---|
| **Atleta** | `/discover` (5 abas) | Joga, reserva quadras, se inscreve em torneios/ligas |
| **Organizador** | `/organizer` | Cria e opera torneios e ligas |
| **Gestor de Arena** | `/arena` (5 abas) | Administra uma ou mais arenas (quadras, agenda, PDV, financeiro) |

O site web (`frontend/projects/site/`) é **landing page + hub público** (marketing, `/torneios`, `/ligas`, `/rankings`, captura de leads de organizadores/arenas). **Não existe painel gestor web** — toda operação de organizador e arena acontece no app mobile. Há também um backoffice interno (Angular, `frontend/projects/backoffice`) para operações administrativas (ex.: aprovação de saques, criação de contas).

---

## 2. Papel: Atleta

Entrada: **`/discover`** (`AthleteShellPage`), com abas Início · Agenda · Reservar · Competir · Comunidade.

### 2.1 Autenticação e Onboarding

| Funcionalidade | Descrição | Status |
|---|---|---|
| Login | E-mail/senha, Google e Apple (iOS/macOS) | ✅ |
| Cadastro | Criação de conta com e-mail/senha ou social | ✅ |
| Recuperar senha | Link de redefinição por e-mail | ✅ |
| Seleção de papel | Multi-role: atleta, organizador, arena | ✅ |
| Onboarding pós-cadastro | 4 passos: boas-vindas → esporte principal → nível → dados do perfil | ✅ |

### 2.2 Hub principal (Início)

| Funcionalidade | Descrição | Status |
|---|---|---|
| Home do atleta | Saudação, avatar, XP, atalhos a notificações e Quest | ✅ |
| Card em destaque | Próximo torneio inscrito ou próxima reserva | ✅ |
| Convites de parceiro pendentes | Banner de convites de torneio | ✅ |
| Competições em destaque | Carrossel de torneios/ligas | ✅ |
| Resumo "Meus torneios" | Preview com link para lista completa | ✅ |
| Missões diárias (preview) | Atalho para tela Quest | ✅ |

### 2.3 Perfil do Atleta

| Funcionalidade | Descrição | Status |
|---|---|---|
| Perfil próprio | Stats, XP, badges, próxima reserva, parceiros | ✅ |
| Editar perfil | Nome, foto, capa, bio, esporte, nível, contato, gênero, objetivos | ✅ |
| Completar perfil (checklist com XP) | Passos guiados com recompensa de XP | ✅ |
| Esportes e níveis | Multi-esporte, nível por esporte, esporte principal | ✅ |
| Perfil público de outro atleta | Header, stats, esportes, follow, compartilhar | 🟡 (conquistas públicas e convite de dupla "em breve") |
| Descobrir atletas | Catálogo com busca e filtros (gênero, nível, cidade) | ✅ |
| Seguir atletas | Follow/unfollow com contadores | ✅ |
| Compartilhar perfil | Share sheet + missão diária | ✅ |
| Convidar jogador direto do perfil | — | ⚪ (removido) |

### 2.4 Agenda unificada

| Funcionalidade | Descrição | Status |
|---|---|---|
| Agenda (aba) | Visão dia/mês, futuro/passado, busca, filtros | ✅ |
| Itens de aluguel e torneio | Unifica reservas e compromissos de torneio | ✅ |
| Seção "Precisa de você" | Convites de parceiro reais | 🟡 (itens de desafio são mock) |
| Filtro de desafios | — | ⚪ ("em breve") |
| Drop-in / dia de descanso | Empty states informativos | ⚪ |
| Minhas reservas | Lista com abas, cancelamento, PIX, streak | ✅ |
| Detalhe de reserva | Pagamento, local, equipe, check-in, presença | 🟡 (convidar jogadores na equipe = "em breve") |

### 2.5 Descoberta e Reserva de Arenas

| Funcionalidade | Descrição | Status |
|---|---|---|
| Busca de horários (aba Reservar) | Filtros de esporte, data, hora, duração, preço, distância, GPS | ✅ |
| Favoritar arena | Toggle com XP e conquista | ✅ |
| Arenas favoritas | Lista dedicada | ✅ |
| Detalhe da arena | Hero, quadras, comodidades, métricas, avaliações | ✅ |
| Seleção de horários | Calendário, duração, sugestões, alerta de vaga | ✅ |
| Alerta "avise quando liberar" | Push quando slot lotado libera | ✅ |
| Confirmar reserva | Resumo de preço, política de cancelamento | ✅ |
| Pagamento PIX | QR/copia-e-cola via Asaas | ✅ |
| Sucesso da reserva | Ticket, confete, calendário, compartilhar, convite | ✅ |
| Reserva bloqueada | Feedback quando bloqueado pela arena | ✅ |
| Avaliações da arena | Lista, curtir, denunciar, respostas do gestor | ✅ |
| Avaliar após jogo | Dialog pós-reserva concluída, com XP | ✅ |
| Convite para jogar (link de reserva) | Aceitar convite público, vincular ao booking | ✅ |
| Convidar jogadores na reserva | — | ⚪ ("em breve") |

### 2.6 Torneios — Descoberta e visualização

| Funcionalidade | Descrição | Status |
|---|---|---|
| Hub Competir (aba) | Ranking preview, torneios, atletas, duplas, convites | ✅ |
| Listagem completa | Busca, filtros, segmentos torneio/liga | ✅ |
| Detalhe do torneio | Hero, categorias, chave, grupos, prêmios, inscrição | ✅ |
| Categorias, chave, grupos, premiação | Telas dedicadas por seção | ✅ |
| Chave dupla eliminação (interativa) | Visualização de bracket DE | ✅ |
| Transmissão ao vivo pública | Placar read-only compartilhável | ✅ |
| Gate de acesso a torneios | Exige onboarding/perfil completo | ✅ |

### 2.7 Inscrição em Torneios

| Funcionalidade | Descrição | Status |
|---|---|---|
| Wizard de inscrição | Categoria → parceiro → uniforme → pagamento | ✅ |
| Verificação de elegibilidade | Idade, gênero, nível vs categoria | ✅ |
| Inscrição solo com convite de parceiro | Link para parceiro completar | ✅ |
| PIX da inscrição | Pagamento via Asaas | ✅ |
| Convite de parceiro (aceitar/recusar) | Rota pública dedicada | ✅ |
| Meus torneios | Em andamento/concluídos, partidas do dia | ✅ |

### 2.8 Ligas (visão do atleta)

| Funcionalidade | Descrição | Status |
|---|---|---|
| Detalhe da liga | Abas: visão geral, etapas, ranking, regulamento | ✅ |
| Ranking da temporada | Posições acumuladas | ✅ |
| Inscrição em liga | Via torneios das etapas (sem wizard próprio) | 🟡 |

### 2.9 Duplas e equipes

| Funcionalidade | Descrição | Status |
|---|---|---|
| Descobrir duplas | Catálogo com busca e filtros | ✅ |
| Perfil público da dupla | Stats, histórico, follow | ✅ |
| Seguir dupla | — | ✅ |
| Desafiar dupla | — | ⚪ ("em breve") |

### 2.10 Partidas e Histórico

| Funcionalidade | Descrição | Status |
|---|---|---|
| Histórico de partidas/torneios | Abas, filtros, stats de temporada | ✅ |
| Detalhe da partida | Placar, sets, momentum, head-to-head, XP | ✅ |
| Play-by-play | Timeline ponto a ponto | ✅ |
| Detalhe do torneio (campanha) | Visão da campanha do atleta no evento | ✅ |
| Rematch / perfil do adversário | — | ⚪ ("em breve") |

### 2.11 Gamificação

| Funcionalidade | Descrição | Status |
|---|---|---|
| XP e níveis | Progressão com streak e eventos | ✅ |
| Missões diárias | Jogar, reservar, favoritar, explorar, compartilhar | ✅ |
| Tela Quest | Streak, nível, missões contextuais | ✅ |
| Conquistas (24 badges) | Catálogo sincronizado com métricas reais | ✅ |
| Feedback de XP | Sheet animado ao ganhar XP/streak/badge | ✅ |
| Big Quest / Liga semanal | — | ⚪ (mock, UI comentada) |

### 2.12 Ranking

| Funcionalidade | Descrição | Status |
|---|---|---|
| Ranking de atletas | Pódio, busca, filtros ano/gênero, modo atleta/dupla | ✅ |
| Preview no hub Competir | Top entradas + atalho | ✅ |
| Posição no perfil | Ranking público exibido no perfil | ✅ |

### 2.13 Notificações

| Funcionalidade | Descrição | Status |
|---|---|---|
| Push (FCM) | Permissões, foreground, background | ✅ |
| Caixa de entrada | Lista, filtros, marcar lida, deep links | ✅ |
| Preferências de notificação | Canais, tópicos, horário silencioso | ✅ |

### 2.14 Configurações e conta

| Funcionalidade | Descrição | Status |
|---|---|---|
| Configurações gerais | Atalhos, tema, legal, sair, excluir conta | ✅ |
| Privacidade e segurança | Visibilidade do perfil, biometria | ✅ |
| Alterar senha / sessões ativas | Gestão de segurança da conta | ✅ |
| Exclusão de conta | Fluxo com confirmação | ✅ |

### 2.15 Comunidade e social

| Funcionalidade | Descrição | Status |
|---|---|---|
| Aba Comunidade | — | ⚪ ("em breve") |
| Feed social | Existe no código, sem rota ativa | ⚪ (órfão) |

---

## 3. Papel: Organizador

Entrada: **`/organizer`**. Painel operacional é **100% mobile**; não há painel web equivalente.

### 3.1 Acesso e Home

| Funcionalidade | Descrição | Status |
|---|---|---|
| Home do organizador | Lista de torneios/ligas, KPIs (eventos ativos, inscritos, arrecadado) | ✅ |
| Filtros Todos/Ligas/Torneios | — | ✅ |
| Rascunhos locais e remotos | Retomar/descartar wizard interrompido | ✅ |
| Troca de papel | Sheet de ajustes | ✅ |

### 3.2 Criação de Torneio (wizard)

| Funcionalidade | Descrição | Status |
|---|---|---|
| Identidade | Nome, capa, esporte, descrição | ✅ |
| Local e datas | Arena/local, cidade/UF, período | ✅ |
| Categorias | Gênero, faixa etária, nível, vagas, taxa, formato, sets, uniforme | ✅ |
| Inscrições | Modo de pagamento, chave PIX, visibilidade, janela de inscrição | ✅ |
| Regras e premiação | Regulamento, PDF, prêmios por categoria | ✅ |
| Revisão e publicação | Salvar rascunho ou publicar | ✅ |
| Criação expressa | Fluxo de 1 tela para publicar rápido | ✅ |
| Edição pós-publicação | Reabre wizard nos passos principais | ✅ |
| Formatos "pontos corridos" / "grupos + repescagem" | Aparecem no wizard | 🟡 (UI existe, sem geração de chave) |

**Formatos operacionais suportados:** grupos + mata-mata, mata-mata simples, dupla eliminatória.

### 3.3 Criação de Liga (wizard)

| Funcionalidade | Descrição | Status |
|---|---|---|
| Identidade e temporada | Nome, capa, esporte, período, cidade/UF base | ✅ |
| Categorias da liga | Replicadas nas etapas | ✅ |
| Regras de ranking | Contagem de etapas (ex. melhor 4 de 6), tabela de pontos | ✅ |
| Planejamento de etapas | Lista com editor (datas, local, Grande Final) | ✅ |
| Revisão e publicação | — | ✅ |
| Adicionar etapa (pós-publicação) | Wizard de 3 passos gera novo torneio vinculado | ✅ |
| Encerrar / cancelar temporada | Atualiza status da liga | ✅ |
| Painel operacional dedicado da liga | — | ⚪ (operação ocorre via cada torneio-etapa) |

### 3.4 Painel / Hub do Torneio

| Funcionalidade | Descrição | Status |
|---|---|---|
| Hub operacional | Header, ações rápidas, navegação inteligente no dia do evento | ✅ |
| Categorias (lista) | Status de inscrição/chave, atalho para gerar chave | ✅ |
| Financeiro | Totais, breakdown app vs. direto, por categoria | ✅ |
| Uniformes | Card quando kit configurado | ✅ |
| Visão geral (formato, quadras, status) | Tela existe, pouco visível no hub | 🟡 |
| Editar/gerenciar torneio | Reabrir identidade/local/categorias, compartilhar | ✅ |
| Encerrar inscrições / Cancelar torneio | — | 🟡 (cancela; sem reembolso automático) |

### 3.5 Gestão de Categorias

| Funcionalidade | Descrição | Status |
|---|---|---|
| Shell da categoria | KPIs, CTAs de chave/seeding | ✅ |
| Lista de duplas com filtros e busca | — | ✅ |
| Pagamentos por categoria | Reenvio de cobrança individual/lote | ✅ |
| Cabeças de chave (seeding) | Manual ou automático por ranking | ✅ |
| Sorteio de grupos | Snake draft, validação de equilíbrio | ✅ |
| Geração de chave (SE, DE, grupos) | Publicação e visualização de bracket | ✅ |
| Confirmação manual de pagamento | Inclui pagamento direto | ✅ |
| Lista de espera / remoção de dupla | — | ✅ |
| Editar inscrição (trocar parceiro/nível/cidade) | — | ⚪ ("em breve") |
| Comunicar categoria (push + WhatsApp) | Backend pronto | 🟡 (sem entrada visível na UI) |

### 3.6 Central de Partidas (operação do dia)

| Funcionalidade | Descrição | Status |
|---|---|---|
| Central de Partidas | Filtros, seções ao vivo/a seguir/encerradas | ✅ |
| Fila de chamada | Check-in pendente, chamar para quadra | ✅ |
| Painel de quadras | KPIs por quadra, partida atual | ✅ |
| Programação (grade dia × quadra) | Drag-and-drop, linha "agora" | ✅ |
| Escolher partida / horário | Sugestões de slot, avisos de descanso | ✅ |
| Auto-programação do dia | Aplica grade automática com validação de conflitos | ✅ |
| Insights de atraso | Estatísticas e sugestões | ✅ |
| Check-in de partida | Presença, definir quadra, W.O. | ✅ |
| Mesa ao vivo (placar ponto a ponto) | Sync ao vivo, share público | ✅ |
| Placar rápido | Resultado final ou W.O. direto | ✅ |
| Validação de resultado | Confirmação de placar submetido | ✅ |
| Súmula / resumo da partida | Audit log, compartilhar | ✅ |

### 3.7 Uniformes

| Funcionalidade | Descrição | Status |
|---|---|---|
| Gestão de uniformes por torneio | Tamanhos, número/nome na camisa | ✅ |
| Configuração no wizard de criação | Tipo e opções por categoria | ✅ |

### 3.8 Financeiro

| Funcionalidade | Descrição | Status |
|---|---|---|
| Painel financeiro do torneio | Arrecadado, pago/pendente, taxas, split | ✅ |
| Confirmação manual de pagamento | — | ✅ |
| Reenvio de cobrança PIX | Individual ou em lote | ✅ |
| Exportar relatório financeiro | — | ⚪ (botão sem ação) |

### 3.9 Comunicação com atletas

| Funcionalidade | Descrição | Status |
|---|---|---|
| Comunicado por categoria (push + WhatsApp) | Backend + tela existente | 🟡 (não descoberta na UI) |
| Notificação automática de chave publicada | — | ✅ |
| Mensagem individual por dupla | — | ⚪ (placeholder no sheet) |

---

## 4. Papel: Gestor de Arena

Entrada: **`/arena`** (`ArenaShellPage`), abas Painel · Agenda · Comandas · Reservas · Ajustes.

### 4.1 Dashboard / Métricas

| Funcionalidade | Descrição | Status |
|---|---|---|
| Painel com KPIs | Faturamento, ocupação, reservas, horário de pico, por período | ✅ |
| Gráfico de receita (7 dias) | — | ✅ |
| Insights heurísticos | Cards derivados do resumo do dia | ✅ |
| Card de seguidores | Total, crescimento, % que reservaram | 🟡 ("criar torneio" a partir daqui é "em breve") |
| Reputação no painel | Média de avaliações, pendentes de resposta | ✅ |
| Notificações (sino) | — | ⚪ ("em breve") |

### 4.2 Gestão de Quadras

| Funcionalidade | Descrição | Status |
|---|---|---|
| Listagem de quadras | Status ativa/manutenção, reservas do mês | ✅ |
| Criar / editar quadra | Nome, esportes, superfície, preço, duração | ✅ |
| Excluir quadra | Com confirmação | ✅ |
| Modo manutenção | Flag por quadra | ✅ |

### 4.3 Agenda / Horários

| Funcionalidade | Descrição | Status |
|---|---|---|
| Grade por dia e quadra | Filtros de status (disponível/reservado/bloqueado) | ✅ |
| Detalhe do horário | — | 🟡 |
| Bloquear / desbloquear horário | Com motivo e nota | ✅ |
| Configurar disponibilidade padrão | Dias, horários, duração do slot | ✅ |
| Gerar horários (aplicar template) | Propaga para todas as quadras | ✅ |
| Criar reserva manual | — | ⚪ ("em breve") |
| Ajustar preço / bloqueio recorrente | — | ⚪ ("em breve") |

### 4.4 Reservas (visão do gestor)

| Funcionalidade | Descrição | Status |
|---|---|---|
| Lista por período (hoje/amanhã/futuras/passadas) | — | ✅ |
| Detalhe da reserva | Timeline, pagamento, atletas, histórico | ✅ |
| Check-in do atleta | — | ✅ |
| Contato via WhatsApp/telefone | — | ✅ |
| Cancelar reserva (com motivo) | — | ✅ |
| Bloquear / desbloquear atleta | — | ✅ |
| Tela pós-cancelamento (undo) | — | 🟡 (algumas ações "em breve") |

### 4.5 Comandas (PDV / vendas)

| Funcionalidade | Descrição | Status |
|---|---|---|
| Lista de comandas com KPIs | Abertas, faturamento do dia | ✅ |
| Nova comanda (vincular reserva ou avulsa) | Dados do cliente, revisão, abertura | ✅ |
| Tipos de comanda (mesa, evento, compartilhada) | Só "individual" ativo | 🟡 |
| Adicionar produtos (quick-add) | Catálogo, busca, baixa de estoque automática | ✅ |
| Receber pagamento (PIX, cartão, dinheiro, carteira) | Suporta pagamento parcial | ✅ |
| Busca de comandas | — | ⚪ ("em breve") |
| Comprovante ao fechar comanda | — | ⚪ ("em breve") |

### 4.6 Estoque / Produtos

| Funcionalidade | Descrição | Status |
|---|---|---|
| Catálogo de produtos | Filtros por categoria | ✅ |
| Criar / editar produto (com upload de imagem) | — | ✅ |
| Excluir produto (com desfazer) | — | ✅ |
| Alertas de estoque baixo | Giro de 7 dias | ✅ |
| Repor estoque (movimentações) | Compra, ajuste, perda | ✅ |
| Integração automática com comandas | Venda debita estoque | ✅ |

### 4.7 Financeiro e Pagamentos

| Funcionalidade | Descrição | Status |
|---|---|---|
| Saldo da carteira (disponível/pendente) | — | ✅ |
| Solicitar saque PIX | Automático até R$ 500; acima disso, aprovação manual no backoffice | ✅ |
| Chave PIX de repasse | Validação por tipo (CPF/CNPJ/e-mail/etc.) | ✅ |
| Histórico financeiro | Créditos de reservas e saques | ✅ |
| Extrato exportável | — | ⚪ (placeholder) |
| Integração Mercado Pago | Widget existe no código | ⚪ (não plugado em nenhuma tela) |

### 4.8 Plano / Assinatura da Arena

| Funcionalidade | Descrição | Status |
|---|---|---|
| Catálogo de planos (Essencial/Pro/Parceiro) | Mensal/anual | 🟡 (valores ainda placeholder) |
| Status da assinatura | Ativo/em atraso/tier atual | ✅ |
| Assinar via PIX (in-app) | QR + polling até ativação | ✅ |
| Assinar via cartão | Checkout hospedado Asaas | ✅ |
| Cancelar assinatura | — | ✅ |

### 4.9 Perfil e Configurações da Arena

| Funcionalidade | Descrição | Status |
|---|---|---|
| Perfil público editável | Identidade, contato, endereço, esportes, comodidades, pagamentos | ✅ |
| Hub de ajustes | Navegação para todas as áreas de configuração | ✅ |
| Equipe / staff | — | ⚪ (placeholder) |
| Notificações configuráveis | — | ⚪ (placeholder) |

### 4.10 Avaliações, Seguidores e Promoções

| Funcionalidade | Descrição | Status |
|---|---|---|
| Gestão de avaliações (responder) | — | ✅ |
| Lista de seguidores + insights | Crescimento, % que reservaram | ✅ |
| Promoções de horário | Desconto %, preço fixo, por quadra/dia/horário | ✅ |
| Pausar / excluir promoção | — | ✅ |

---

## 5. Funcionalidades transversais

Elementos que atendem múltiplos papéis simultaneamente:

| Funcionalidade | Papéis atendidos | Descrição |
|---|---|---|
| Autenticação e seleção de papel | Todos | Login único, troca de papel entre atleta/organizador/arena |
| Notificações push (FCM) | Todos | Infra comum de push com navegação por deep link |
| Pagamentos PIX via Asaas | Atleta (reservas/inscrições), Arena (assinatura/saques) | Gateway único de pagamento |
| Sistema de avaliações | Atleta (avalia), Arena (responde) | Avaliação de arenas pós-reserva |
| Perfil de conta / tema / privacidade | Todos | Configurações compartilhadas de conta |
| Transmissão pública de partidas | Organizador (opera), Atleta (assiste) | Placar ao vivo compartilhável sem login |

---

## 6. Lacunas e itens pendentes (consolidado)

### Atleta
- Aba Comunidade / feed social (placeholder / código órfão)
- Convites sociais entre jogadores (jogar junto, formar dupla, rematch)
- Desafios e drop-in na agenda
- Big Quest e "liga semanal" na gamificação

### Organizador
- Formatos de chave "pontos corridos" e "grupos + repescagem" (UI existe, sem geração/operação)
- Edição de inscrição (trocar parceiro/nível/cidade)
- Descoberta de "Comunicar categoria" na UI (backend pronto, sem entrada visível)
- Exportação de relatório financeiro
- Reembolso automático ao cancelar torneio
- Painel dedicado de operação de liga (hoje via torneios-etapa)
- Painel gestor web (só existe mobile)

### Gestor de Arena
- Reserva manual, ajuste de preço por slot e bloqueio recorrente na agenda
- Tipos de comanda mesa/evento/compartilhada, busca de comandas, comprovante ao fechar
- Extrato financeiro exportável
- Integração visual do Mercado Pago (widget existe, não plugado)
- Tabela oficial de preços do plano de assinatura (hoje placeholder)
- Gestão de equipe/staff e notificações configuráveis

---

## Apêndice — Referências de código

| Área | Diretório principal |
|---|---|
| Atleta | `nexago_app/lib/features/athlete/`, `features/arenas/`, `features/tournaments/`, `features/auth/`, `features/ranking/` |
| Organizador | `nexago_app/lib/features/organizer/` |
| Gestor de Arena | `nexago_app/lib/features/arena/` |
| Rotas | `nexago_app/lib/core/router/routes.dart`, `app_router.dart` |
| Cloud Functions | `functions/src/` |
| Site público | `frontend/projects/site/` |
| Backoffice interno | `frontend/projects/backoffice` |
