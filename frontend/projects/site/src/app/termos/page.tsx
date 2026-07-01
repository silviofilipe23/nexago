import type { Metadata } from 'next';
import Link from 'next/link';
import { Reveal } from '@/components/motion/Reveal';

export const metadata: Metadata = {
  title: 'Termos de Uso',
  description:
    'Termos e condições de uso do nexaGO — site, aplicativo e Liga nexaGO — para atletas, organizadores e arenas de esportes de areia.',
  alternates: { canonical: '/termos' },
  openGraph: {
    title: 'Termos de Uso · nexaGO',
    description: 'Regras de uso do ecossistema nexaGO para atletas, organizadores e arenas.',
    url: '/termos',
  },
};

// TODO: revisar com o jurídico antes de publicar (remover o aviso de rascunho ao final).
const LAST_UPDATE = '29 de junho de 2026';
const CONTACT_EMAIL = 'contato@nexago.com.br';
const COMPANY =
  'Nrs Desenvolvimento De Programas De Computador Sob Encomenda Ltda';
const CNPJ = '66.753.240/0001-75';
const ADDRESS = 'Rua Pais Leme, 215, Conj 1713, Pinheiros, São Paulo, SP, 05424-150';

const SECTIONS = [
  { id: 'aceitacao', title: '1. Aceitação dos termos' },
  { id: 'definicoes', title: '2. Definições' },
  { id: 'cadastro', title: '3. Elegibilidade e cadastro' },
  { id: 'conta', title: '4. Sua conta e responsabilidades' },
  { id: 'uso', title: '5. Regras de uso da plataforma' },
  { id: 'pagamentos', title: '6. Inscrições, pagamentos e reembolsos' },
  { id: 'eventos', title: '7. Torneios, ligas e resultados' },
  { id: 'conteudo', title: '8. Conteúdo do usuário' },
  { id: 'propriedade', title: '9. Propriedade intelectual' },
  { id: 'encerramento', title: '10. Suspensão e encerramento' },
  { id: 'responsabilidade', title: '11. Limitação de responsabilidade' },
  { id: 'alteracoes', title: '12. Alterações dos termos' },
  { id: 'foro', title: '13. Lei aplicável e foro' },
  { id: 'contato', title: '14. Contato' },
];

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28">
      <h2 className="font-display text-xl font-700 tracking-tight text-fg sm:text-2xl">{title}</h2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-text-mute sm:text-base">{children}</div>
    </section>
  );
}

export default function TermosPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 pb-24 pt-28 sm:px-6 sm:pt-32">
      <Reveal>
        <p className="mb-3 font-mono text-sm font-600 uppercase tracking-[0.2em] text-brand">Legal</p>
        <h1 className="font-display text-[clamp(2rem,6vw,3.25rem)] font-800 leading-tight tracking-tight text-fg">
          Termos de Uso
        </h1>
        <p className="mt-4 text-sm text-text-dim">Última atualização: {LAST_UPDATE}</p>
        <p className="mt-6 text-balance text-base leading-relaxed text-text-mute">
          Estes Termos de Uso regem o acesso e a utilização do site, do aplicativo e da Liga nexaGO
          (em conjunto, a “Plataforma”), operados por {COMPANY}. Ao criar uma conta ou usar a
          Plataforma, você declara que leu, entendeu e concorda com estes termos e com a nossa{' '}
          <Link href="/privacidade" className="text-brand underline-offset-2 hover:underline">
            Política de Privacidade
          </Link>
          .
        </p>
      </Reveal>

      {/* Aviso de rascunho — remover quando o jurídico validar. */}
      <div className="mt-8 rounded-4 border border-pending/30 bg-surface-1 p-5 text-sm leading-relaxed text-text-mute">
        <strong className="font-600 text-fg">Documento em revisão.</strong> Este texto é um modelo
        inicial e deve ser validado pelo jurídico antes da publicação oficial.
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
        <Section id="aceitacao" title="1. Aceitação dos termos">
          <p>
            A Plataforma é operada por <strong className="font-600 text-fg">{COMPANY}</strong>,
            inscrita no CNPJ sob nº <strong className="font-600 text-fg">{CNPJ}</strong>, com sede em{' '}
            <strong className="font-600 text-fg">{ADDRESS}</strong> (“nexaGO”, “nós”).
          </p>
          <p>
            Se você não concorda com estes termos, não utilize a Plataforma. Podemos exigir aceite
            expresso em determinados fluxos (por exemplo, ao se inscrever em um torneio).
          </p>
        </Section>

        <Section id="definicoes" title="2. Definições">
          <ul className="ml-5 list-disc space-y-2 marker:text-brand">
            <li><strong className="font-600 text-fg">Atleta:</strong> usuário que participa de torneios e etapas.</li>
            <li><strong className="font-600 text-fg">Organizador:</strong> usuário que cria e gerencia torneios e etapas.</li>
            <li><strong className="font-600 text-fg">Arena:</strong> estabelecimento que disponibiliza quadras e sedia eventos.</li>
            <li><strong className="font-600 text-fg">Conteúdo do usuário:</strong> dados, textos, imagens e informações enviados por você.</li>
          </ul>
        </Section>

        <Section id="cadastro" title="3. Elegibilidade e cadastro">
          <p>
            Para usar recursos que exigem conta, você deve fornecer informações verdadeiras, completas
            e atualizadas. Menores de idade só podem utilizar a Plataforma com consentimento e
            supervisão de um responsável legal, quando aplicável.
          </p>
        </Section>

        <Section id="conta" title="4. Sua conta e responsabilidades">
          <p>
            Você é responsável por manter a confidencialidade das suas credenciais e por todas as
            atividades realizadas na sua conta. Notifique-nos imediatamente em caso de uso não
            autorizado. Você concorda em não:
          </p>
          <ul className="ml-5 list-disc space-y-2 marker:text-brand">
            <li>Fornecer informações falsas ou se passar por outra pessoa.</li>
            <li>Usar a Plataforma para fins ilícitos, fraudulentos ou que violem direitos de terceiros.</li>
            <li>Interferir na segurança, integridade ou desempenho da Plataforma.</li>
            <li>Coletar dados de outros usuários sem autorização.</li>
          </ul>
        </Section>

        <Section id="uso" title="5. Regras de uso da plataforma">
          <p>
            A Plataforma conecta atletas, organizadores e arenas. Cada perfil possui funcionalidades
            específicas (inscrição, gestão de torneios, divulgação de arena). Você se compromete a
            usar esses recursos de boa-fé e de acordo com as regras de cada evento e com a legislação
            esportiva aplicável.
          </p>
        </Section>

        <Section id="pagamentos" title="6. Inscrições, pagamentos e reembolsos">
          <p>
            Inscrições em torneios podem ser pagas pela Plataforma por meio de provedores de
            pagamento. Os valores, prazos e condições de cada etapa são definidos pelo respectivo
            organizador. Políticas de cancelamento e reembolso seguem as regras divulgadas no evento
            e a legislação consumerista aplicável.
          </p>
        </Section>

        <Section id="eventos" title="7. Torneios, ligas e resultados">
          <p>
            Os organizadores são os responsáveis pela criação, realização, arbitragem e resultados de
            seus torneios e etapas. O nexaGO fornece as ferramentas (chaveamento, inscrições, ranking),
            mas não é responsável pela condução dos eventos nem por disputas entre participantes e
            organizadores. Resultados e rankings refletem as informações registradas pelos
            organizadores.
          </p>
        </Section>

        <Section id="conteudo" title="8. Conteúdo do usuário">
          <p>
            Você mantém a titularidade do conteúdo que envia. Ao publicá-lo, concede ao nexaGO uma
            licença não exclusiva, gratuita e mundial para hospedar, exibir e reproduzir esse conteúdo
            com a finalidade de operar e divulgar a Plataforma e seus eventos. Você é responsável pelo
            conteúdo que publica e garante possuir os direitos necessários.
          </p>
        </Section>

        <Section id="propriedade" title="9. Propriedade intelectual">
          <p>
            A marca nexaGO, o logotipo, o software, o design e os demais elementos da Plataforma são de
            titularidade do nexaGO ou de seus licenciadores e são protegidos por lei. É vedado copiar,
            modificar, distribuir ou explorar tais elementos sem autorização prévia e por escrito.
          </p>
        </Section>

        <Section id="encerramento" title="10. Suspensão e encerramento">
          <p>
            Podemos suspender ou encerrar o acesso de usuários que violem estes termos, a legislação
            ou as regras dos eventos. Você pode encerrar sua conta a qualquer momento pelo aplicativo
            ou pelos nossos canais de contato; algumas informações podem ser retidas conforme exigido
            por lei (ver a Política de Privacidade).
          </p>
        </Section>

        <Section id="responsabilidade" title="11. Limitação de responsabilidade">
          <p>
            A Plataforma é fornecida “no estado em que se encontra”. Na máxima extensão permitida pela
            lei, o nexaGO não se responsabiliza por danos indiretos, lucros cessantes, indisponibilidades
            temporárias, nem por atos de organizadores, arenas ou outros usuários. Nada nestes termos
            exclui responsabilidades que não possam ser limitadas pela legislação aplicável.
          </p>
        </Section>

        <Section id="alteracoes" title="12. Alterações dos termos">
          <p>
            Podemos atualizar estes termos periodicamente. Mudanças relevantes serão comunicadas pelos
            nossos canais, e a data de “última atualização” no topo será revisada. O uso continuado da
            Plataforma após a vigência das alterações representa concordância com os novos termos.
          </p>
        </Section>

        <Section id="foro" title="13. Lei aplicável e foro">
          <p>
            Estes termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro
            da Comarca de São Paulo/SP para dirimir quaisquer controvérsias, salvo competência diversa
            prevista em lei (por exemplo, foro do domicílio do consumidor).
          </p>
        </Section>

        <Section id="contato" title="14. Contato">
          <p>
            Dúvidas sobre estes Termos de Uso podem ser enviadas para{' '}
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
