/**
 * Nexo · instalar.js
 * ---------------------------------------------------------------------------
 * "Baixar o app" = instalar o PWA. O botão só aparece quando o navegador
 * realmente pode instalar, e desaparece depois que a instalação acontece
 * (evento `appinstalled`) ou quando o app já está rodando instalado.
 *
 * A decisão de mostrar fica numa função pura — o resto é ligação com o DOM.
 */

/** Chave SEM prefixo: `salvarPreferencia` grava em `nexo_instalado`. */
export const CHAVE_INSTALADO = 'instalado';

/**
 * @param {{ emModoApp:boolean, marcadoInstalado:boolean, temPrompt:boolean }} ctx
 * @returns {boolean}
 */
export function deveMostrarBotao({ emModoApp, marcadoInstalado, temPrompt }) {
  if (emModoApp) return false; // já está instalado, rodando como app
  if (marcadoInstalado) return false; // instalou antes neste navegador
  return temPrompt === true; // sem prompt nativo não há o que baixar
}

/** Está rodando como app instalado (tela cheia)? */
export function emModoApp(win = typeof window !== 'undefined' ? window : null) {
  if (!win) return false;
  try {
    if (win.navigator && win.navigator.standalone === true) return true; // iOS
    if (win.matchMedia && win.matchMedia('(display-mode: standalone)').matches) return true;
    if (win.matchMedia && win.matchMedia('(display-mode: fullscreen)').matches) return true;
  } catch {
    /* navegador sem matchMedia: trata como navegador normal */
  }
  return false;
}
