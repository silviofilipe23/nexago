/**
 * Lista de cidades / regiões para autocompletar “Onde jogar”.
 * Formato de exibição: "Cidade, UF" (como no referencial tipo Airbnb).
 */
export interface CityListEntry {
  id: string;
  /** Texto aplicado ao filtro de busca — igual ao que o usuário vê. */
  label: string;
}

/** Opção especial (não é cidade). */
export const NEAR_ME_LOCATION_LABEL = 'Perto de você';

/**
 * Cidades e regiões para sugestão. Inclui capitais, hubs e bairros compostos.
 */
export const BR_CITIES_FOR_SEARCH: CityListEntry[] = [
  { id: 'goiania-go', label: 'Goiânia, GO' },
  { id: 'aparecida-goiania-go', label: 'Aparecida de Goiânia, GO' },
  { id: 'brasilia-df', label: 'Brasília, DF' },
  { id: 'sao-paulo-sp', label: 'São Paulo, SP' },
  { id: 'rio-rj', label: 'Rio de Janeiro, RJ' },
  { id: 'belo-horizonte-mg', label: 'Belo Horizonte, MG' },
  { id: 'curitiba-pr', label: 'Curitiba, PR' },
  { id: 'porto-alegre-rs', label: 'Porto Alegre, RS' },
  { id: 'florianopolis-sc', label: 'Florianópolis, SC' },
  { id: 'salvador-ba', label: 'Salvador, BA' },
  { id: 'fortaleza-ce', label: 'Fortaleza, CE' },
  { id: 'recife-pe', label: 'Recife, PE' },
  { id: 'manaus-am', label: 'Manaus, AM' },
  { id: 'belem-pa', label: 'Belém, PA' },
  { id: 'natal-rn', label: 'Natal, RN' },
  { id: 'joao-pessoa-pb', label: 'João Pessoa, PB' },
  { id: 'maceio-al', label: 'Maceió, AL' },
  { id: 'aracaju-se', label: 'Aracaju, SE' },
  { id: 'teresina-pi', label: 'Teresina, PI' },
  { id: 'sao-luis-ma', label: 'São Luís, MA' },
  { id: 'campo-grande-ms', label: 'Campo Grande, MS' },
  { id: 'cuiaba-mt', label: 'Cuiabá, MT' },
  { id: 'porto-velho-ro', label: 'Porto Velho, RO' },
  { id: 'rio-branco-ac', label: 'Rio Branco, AC' },
  { id: 'macapa-ap', label: 'Macapá, AP' },
  { id: 'boa-vista-rr', label: 'Boa Vista, RR' },
  { id: 'palmas-to', label: 'Palmas, TO' },
  { id: 'vitoria-es', label: 'Vitória, ES' },
  { id: 'campinas-sp', label: 'Campinas, SP' },
  { id: 'santos-sp', label: 'Santos, SP' },
  { id: 'guarulhos-sp', label: 'Guarulhos, SP' },
  { id: 'sorocaba-sp', label: 'Sorocaba, SP' },
  { id: 'ribeirao-preto-sp', label: 'Ribeirão Preto, SP' },
  { id: 'sao-jose-campos-sp', label: 'São José dos Campos, SP' },
  { id: 'uberlandia-mg', label: 'Uberlândia, MG' },
  { id: 'juiz-fora-mg', label: 'Juiz de Fora, MG' },
  { id: 'vitoria-da-conquista-ba', label: 'Vitória da Conquista, BA' },
  { id: 'itapua-salvador-ba', label: 'Itapuã, Salvador, BA' },
  { id: 'itapura-sp', label: 'Itapura, SP' },
  { id: 'itapuranga-go', label: 'Itapuranga, GO' },
  { id: 'itapoa-sc', label: 'Itapoá, SC' },
  { id: 'itapema-sc', label: 'Itapema, SC' },
  { id: 'anapolis-go', label: 'Anápolis, GO' },
  { id: 'rio-verde-go', label: 'Rio Verde, GO' },
  { id: 'londrina-pr', label: 'Londrina, PR' },
  { id: 'maringa-pr', label: 'Maringá, PR' },
  { id: 'joinville-sc', label: 'Joinville, SC' },
  { id: 'blumenau-sc', label: 'Blumenau, SC' },
  { id: 'balneario-sc', label: 'Balneário Camboriú, SC' },
  { id: 'chapeco-sc', label: 'Chapecó, SC' },
  { id: 'niteroi-rj', label: 'Niterói, RJ' },
  { id: 'nova-iguacu-rj', label: 'Nova Iguaçu, RJ' },
  { id: 'duque-caxias-rj', label: 'Duque de Caxias, RJ' },
  { id: 'sao-goncalo-rj', label: 'São Gonçalo, RJ' },
  { id: 'setor-bueno-go', label: 'Setor Bueno, Goiânia, GO' },
  { id: 'centro-goiania-go', label: 'Centro, Goiânia, GO' },
  { id: 'jardim-america-go', label: 'Jardim América, Goiânia, GO' },
];
