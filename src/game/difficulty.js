import { settings } from '../config.js';

// Dificuldade (opção DIFICULDADE): o quanto os bichos machucam, o quanto eles
// aguentam, a chance de largarem alguma coisa e a munição que volta depois de cair.
//   hurt   multiplica o dano que o jogador recebe
//   foe    multiplica o dano que as criaturas recebem
//   drop   chance de uma criatura derrotada largar munição ou comida
//   refill multiplica a munição mínima devolvida ao voltar de uma queda
const LEVELS = [
  { name: 'FÁCIL', hurt: 0.55, foe: 1.35, drop: 0.6, refill: 1.5 },
  { name: 'NORMAL', hurt: 1, foe: 1, drop: 0.4, refill: 1 },
  { name: 'DIFÍCIL', hurt: 1.4, foe: 0.85, drop: 0.28, refill: 0.6 },
];

export const DIFFICULTY_NAMES = LEVELS.map(l => l.name);

export function difficulty() { return LEVELS[settings.difficulty] || LEVELS[1]; }
