/**
 * Entrypoint do Worker. O runtime exige que todo export deste módulo seja um
 * handler — por isso a lógica, as constantes e os utilitários vivem em `borda.mjs`.
 */
import { atender } from './borda.mjs';

export default {
  fetch: atender,
};
