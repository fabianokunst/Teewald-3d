// Idiomas do site: os mesmos do jogo (OPÇÕES → IDIOMA). O português fica em site/ e é a fonte;
// os outros são gerados por npm run site em site/<idioma>/ a partir dele e dos dicionários de
// tools/site/i18n/<idioma>.json.
//   html       atributo lang da página
//   hreflang   código nos links alternativos (buscadores)
//   og         og:locale (redes sociais)
//   nome       como o idioma se chama nele mesmo (seletor de idioma)
//   pasta      onde ficam as páginas
import { ENDERECO, PAGINAS } from './paginas.mjs';

export const IDIOMAS = {
  pt: { html: 'pt-BR', hreflang: 'pt', og: 'pt_BR', nome: 'Português', sigla: 'PT', pasta: '' },
  en: { html: 'en', hreflang: 'en', og: 'en_US', nome: 'English', sigla: 'EN', pasta: 'en/' },
  es: { html: 'es', hreflang: 'es', og: 'es_LA', nome: 'Español', sigla: 'ES', pasta: 'es/' },
  de: { html: 'de', hreflang: 'de', og: 'de_DE', nome: 'Deutsch', sigla: 'DE', pasta: 'de/' },
};
export const TRADUZIDOS = Object.keys(IDIOMAS).filter(l => l !== 'pt');
// quem fala um idioma que o site não tem cai no inglês (como no jogo)
export const PADRAO = 'en';

// páginas que existem em todos os idiomas (as que vão para os buscadores)
export const traduzida = arq => !!PAGINAS[arq] && PAGINAS[arq].indexar !== false;
export const urlEm = (arq, idioma = 'pt') => ENDERECO + IDIOMAS[idioma].pasta + (arq === 'index.html' ? '' : arq);
