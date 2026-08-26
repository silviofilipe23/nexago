import type { Metadata } from 'next';
import Link from 'next/link';
import { Reveal } from '@/components/motion/Reveal';

export const metadata: Metadata = {
  title: 'Política de Privacidade',
  description:
    'Como o nexaGO coleta, usa, compartilha e protege seus dados pessoais no site, no app e na Liga nexaGO, em conformidade com a LGPD.',
  alternates: { canonical: '/privacidade' },
  openGraph: {
    title: 'Política de Privacidade · nexaGO',
    description: 'Como tratamos seus dados pessoais no ecossistema nexaGO, em conformidade com a LGPD.',
    url: '/privacidade',
  },
};

// TODO: revisar com o jurídico e preencher os campos entre [colchetes] antes de publicar.
const LAST_UPDATE = '29 de junho de 2026';
const CONTACT_EMAIL = 'contato@nexago.com.br'; // TODO: confirmar canal oficial

const SECTIONS = [
  { id: 'controlador', title: '1. Quem é o controlador' },
  { id: 'dados', title: '2. Dados que coletamos' },
  { id: 'uso', title: '3. Como usamos seus dados' },
  { id: 'bases', title: '4. Bases legais' },
  { id: 'compartilhamento', title: '5. Compartilhamento' },
  { id: 'cookies', title: '6. Cookies e tecnologias' },
  { id: 'seguranca', title: '7. Armazenamento e segurança' },
  { id: 'retencao', title: '8. Retenção dos dados' },
  { id: 'direitos', title: '9. Seus direitos' },
  { id: 'internacional', title: '10. Transferência internacional' },
  { id: 'menores', title: '11. Crianças e adolescentes' },
  { id: 'alteracoes', title: '12. Alterações desta política' },
  { id: 'contato', title: '13. Contato e Encarregado (DPO)' },
];

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28">
      <h2 className="font-display text-xl font-700 tracking-tight text-fg sm:text-2xl">{title}</h2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-text-mute sm:text-base">{children}</div>
    </section>
  );
}

export default function PrivacidadePage() {
  return (
    <main className="mx-auto max-w-3xl px-5 pb-24 pt-28 sm:px-6 sm:pt-32">
      <Reveal>
        <p className="mb-3 font-mono text-sm font-600 uppercase tracking-[0.2em] text-brand">Legal</p>
        <h1 className="font-display text-[clamp(2rem,6vw,3.25rem)] font-800 leading-tight tracking-tight text-fg">
          Política de Privacidade
        </h1>
        <p className="mt-4 text-sm text-text-dim">Última atualização: {LAST_UPDATE}</p>
        <p className="mt-6 text-balance text-base leading-relaxed text-text-mute">
          Esta política explica como o nexaGO coleta, usa, compartilha e protege seus dados pessoais
          no site, no aplicativo e na Liga nexaGO, em conformidade com a Lei Geral de Proteção de
          Dados (Lei nº 13.709/2018 — LGPD). Ao usar nossos serviços, você concorda com as práticas
          descritas aqui.
        </p>
      </Reveal>

      {/* Aviso de rascunho — remover quando o jurídico validar. */}
      <div className="mt-8 rounded-4 border border-pending/30 bg-surface-1 p-5 text-sm leading-relaxed text-text-mute">
        <strong className="font-600 text-fg">Documento em revisão.</strong> Este texto é um modelo
        inicial alinhado à LGPD. Os campos entre colchetes ([…]) devem ser preenchidos e o conteúdo
        validado pelo jurídico antes da publicação oficial.
      </div>

      {/* Índice */}
      <nav aria-label="Índice" className="mt-10 rounded-4 border border-line bg-surface-1 p-5">
        <h2 className="mb-3 font-mono text-xs font-600 uppercase tracking-[0.2em] text-text-dim">Nesta página</h2>
        <ol className="grid gap-2 sm:grid-cols-2">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="text-sm text-text-mute transition-colors hover:text-brand focus-visible:text-brand focus-visible:outline-none"
              >
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-12 space-y-12">
        <Section id="controlador" title="1. Quem é o controlador">
          <p>
            O tratamento dos seus dados é realizado por <strong className="font-600 text-fg">Nrs Desenvolvimento De Programas De Computador Sob Encomenda Ltda </strong>, inscrita no CNPJ sob nº <strong className="font-600 text-fg">66.753.240/0001-75</strong>,
            com sede em <strong className="font-600 text-fg">RUA PAIS LEME, 215, CONJ 1713, PINHEIROS, SÃO PAULO, SP, 05424-150</strong> (“nexaGO”, “nós”).
          </p>
          <p>
            O nexaGO é uma plataforma de gestão e participação em torneios e ligas de esportes de
            areia, conectando atletas, organizadores e arenas.
          </p>
        </Section>

        <Section id="dados" title="2. Dados que coletamos">
          <p>Coletamos apenas os dados necessários para operar a plataforma:</p>
          <ul className="ml-5 list-disc space-y-2 marker:text-brand">
            <li>
              <strong className="font-600 text-fg">Cadastro e perfil:</strong> nome, e-mail, telefone,
              foto, categoria/nível esportivo e gênero (quando informado).
            </li>
            <li>
              <strong className="font-600 text-fg">Participação:</strong> inscrições em torneios e
              etapas, resultados, histórico de partidas e ranking.
            </li>
            <li>
              <strong className="font-600 text-fg">Contato pelo site:</strong> e-mail enviado em
              listas de interesse e dados de formulários de organizadores e arenas (nome, e-mail,
              telefone, organização e mensagem).
            </li>
            <li>
              <strong className="font-600 text-fg">Pagamentos:</strong> dados necessários para
              processar inscrições, tratados por provedores de pagamento (não armazenamos dados
              completos de cartão).
            </li>
            <li>
              <strong className="font-600 text-fg">Dados técnicos:</strong> informações de
              dispositivo, navegador, endereço IP e dados de uso, coletados de forma automática.
            </li>
          </ul>
        </Section>

        <Section id="uso" title="3. Como usamos seus dados">
          <ul className="ml-5 list-disc space-y-2 marker:text-brand">
            <li>Criar e manter sua conta e seu perfil público de atleta, arena ou organizador.</li>
            <li>Operar inscrições, chaveamento, resultados e rankings de torneios e da Liga nexaGO.</li>
            <li>Processar pagamentos e enviar comunicações sobre suas partidas e etapas.</li>
            <li>Responder a contatos comerciais de organizadores e arenas.</li>
            <li>Melhorar a plataforma, prevenir fraudes e garantir a segurança.</li>
            <li>Cumprir obrigações legais e regulatórias.</li>
          </ul>
        </Section>

        <Section id="bases" title="4. Bases legais">
          <p>
            Tratamos seus dados com base nas hipóteses da LGPD (art. 7º), conforme o caso: execução
            de contrato e procedimentos preliminares, cumprimento de obrigação legal, legítimo
            interesse, e consentimento — que pode ser revogado a qualquer momento.
          </p>
        </Section>

        <Section id="compartilhamento" title="5. Compartilhamento">
          <p>Não vendemos seus dados. Podemos compartilhá-los com:</p>
          <ul className="ml-5 list-disc space-y-2 marker:text-brand">
            <li>
              <strong className="font-600 text-fg">Provedores de infraestrutura</strong> (ex.: Google
              Firebase) que hospedam e processam dados em nosso nome.
            </li>
            <li>
              <strong className="font-600 text-fg">Processadores de pagamento</strong>, para concluir
              transações de inscrição.
            </li>
            <li>
              <strong className="font-600 text-fg">Organizadores e arenas</strong>, quando você se
              inscreve em seus torneios, na medida necessária para a operação do evento.
            </li>
            <li>
              <strong className="font-600 text-fg">Autoridades</strong>, quando exigido por lei ou
              ordem judicial.
            </li>
          </ul>
          <p>
            Informações públicas (como nome de exibição e ranking) podem aparecer em páginas abertas
            de torneios e classificações.
          </p>
        </Section>

        <Section id="cookies" title="6. Cookies e tecnologias">
          <p>
            Usamos cookies e tecnologias semelhantes para manter sua sessão, lembrar preferências e
            medir o uso do site. Você pode gerenciar cookies nas configurações do seu navegador;
            alguns recursos podem não funcionar corretamente se desativados.
          </p>
        </Section>

        <Section id="seguranca" title="7. Armazenamento e segurança">
          <p>
            Adotamos medidas técnicas e organizacionais para proteger seus dados contra acesso não
            autorizado, perda ou alteração. O acesso público a dados na plataforma é controlado por
            regras de segurança; ainda assim, nenhum sistema é 100% imune a incidentes.
          </p>
        </Section>

        <Section id="retencao" title="8. Retenção dos dados">
          <p>
            Mantemos seus dados pelo tempo necessário para as finalidades descritas e para cumprir
            obrigações legais. Encerrada a finalidade, os dados são eliminados ou anonimizados,
            ressalvadas as hipóteses de guarda previstas em lei.
          </p>
        </Section>

        <Section id="direitos" title="9. Seus direitos">
          <p>Nos termos da LGPD (art. 18), você pode, a qualquer momento:</p>
          <ul className="ml-5 list-disc space-y-2 marker:text-brand">
            <li>Confirmar a existência de tratamento e acessar seus dados.</li>
            <li>Corrigir dados incompletos, inexatos ou desatualizados.</li>
            <li>Solicitar anonimização, bloqueio ou eliminação de dados desnecessários.</li>
            <li>Solicitar a portabilidade e revogar o consentimento.</li>
            <li>
              <strong className="font-600 text-fg">Excluir sua conta</strong> e os dados associados,
              diretamente no app ou pelos nossos canais de contato. Veja o passo a passo em{' '}
              <Link href="/excluir-conta" className="text-brand underline-offset-2 hover:underline">
                Excluir Conta
              </Link>
              .
            </li>
          </ul>
          <p>
            Para exercer seus direitos, fale com nosso Encarregado pelo e-mail{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand underline-offset-2 hover:underline">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </Section>

        <Section id="internacional" title="10. Transferência internacional">
          <p>
            Alguns provedores podem processar dados em servidores fora do Brasil. Nesses casos,
            adotamos salvaguardas adequadas para garantir um nível de proteção compatível com a LGPD.
          </p>
        </Section>

        <Section id="menores" title="11. Crianças e adolescentes">
          <p>
            O tratamento de dados de crianças e adolescentes observa o seu melhor interesse e, quando
            aplicável, o consentimento de pelo menos um dos pais ou responsável legal.
          </p>
        </Section>

        <Section id="alteracoes" title="12. Alterações desta política">
          <p>
            Podemos atualizar esta política periodicamente. Mudanças relevantes serão comunicadas
            pelos nossos canais, e a data de “última atualização” no topo será revisada.
          </p>
        </Section>

        <Section id="contato" title="13. Contato e Encarregado (DPO)">
          <p>
            Dúvidas ou solicitações sobre privacidade e proteção de dados podem ser enviadas ao nosso
            Encarregado (DPO),
            pelo e-mail{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand underline-offset-2 hover:underline">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </Section>
      </div>
    </main>
  );
}
