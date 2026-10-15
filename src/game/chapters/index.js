import ch02 from './ch02.js';
import ch03 from './ch03.js';
import ch04 from './ch04.js';
import ch05 from './ch05.js';
import ch06 from './ch06.js';
import ch07 from './ch07.js';
import ch08 from './ch08.js';
import ch09 from './ch09.js';
import ch10 from './ch10.js';
import ch11 from './ch11.js';
import ch12 from './ch12.js';

// Os doze capítulos (o 1 é a missão original do chupacabras, em game/mission.js)
export const CHAPTERS = [null, { n: 1, key: 'chupa', title: 'O Chupacabras' }, ch02, ch03, ch04, ch05, ch06, ch07, ch08, ch09, ch10, ch11, ch12];
export const LAST_CHAPTER = CHAPTERS.length - 1;

// número do capítulo pela chave ('lua', 'asas'...): o que depende da história usa a chave,
// não o número (que muda quando entram capítulos novos no meio)
export const chapterNo = key => CHAPTERS.findIndex(c => c?.key === key);

// saves de antes dos capítulos 6 (A Linha Cruzada) e 9 (A Mulher da Fotografia):
// o número antigo vira o novo
export const OLD_TO_NEW = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 7, 7: 8, 8: 10, 9: 11, 10: 12 };
