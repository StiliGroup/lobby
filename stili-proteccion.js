/* Stili · protección de pantalla (v2.3 · v2.8.1 sin difuminado · v3.0 sin marca de agua)
 * Ningún navegador puede impedir del todo una captura (ni una foto con el celular). Esto la disuade:
 *  - la tecla «Imprimir pantalla» borra el portapapeles y oculta la pantalla un momento;
 *  - sin clic derecho, sin copiar y sin imprimir (salvo páginas hechas para imprimir).
 * Cada intento queda en la bitácora. Configuración: window.STILI_PROTECCION = { quien, correo, registrar(tipo) }.
 */
(function () {
  if (window.__stiliProteccion) return; window.__stiliProteccion = true;
  const cfg = window.STILI_PROTECCION || {};
  const html = document.documentElement;
  const permiteImprimir = () => html.hasAttribute('data-imprimir') || document.body && document.body.hasAttribute('data-imprimir');
  const enCampo = el => el && el.closest && el.closest('input, textarea, select, [contenteditable="true"], .permite-copiar');
  const registrar = tipo => { try { cfg.registrar && cfg.registrar(tipo); } catch (e) { /* nada */ } };

  // Estilos: marca de agua, difuminado, sin selección, sin impresión
  const css = document.createElement('style');
  css.textContent =
    '.stili-marca{display:none!important}' +
    '.stili-velo{position:fixed;inset:0;z-index:2147483001;display:none;align-items:center;justify-content:center;background:rgba(0,43,87,.92);color:#fff;font:600 16px Montserrat,system-ui,sans-serif;text-align:center;padding:24px}' +
    'html.stili-tapado .stili-velo{display:flex}' +
    'body{-webkit-user-select:none;user-select:none}input,textarea,select,[contenteditable="true"],.permite-copiar{-webkit-user-select:text;user-select:text}' +
    '@media print{html:not([data-imprimir]) body>*{display:none!important}html:not([data-imprimir]) body::before{content:"Esta pantalla no se puede imprimir. Use los reportes de impresión del sistema.";display:block;padding:40px;font:16px sans-serif}}';
  (document.head || html).appendChild(css);

  // v3.0 · Sin marca de agua (lo pidió el Gerente General el 28-oct-2026). Se quita también la que hubiera quedado de una versión anterior.
  function marca() { const d = document.querySelector('.stili-marca'); if (d) d.remove(); }
  function velo() {
    if (document.querySelector('.stili-velo')) return;
    const v = document.createElement('div'); v.className = 'stili-velo';
    v.textContent = 'Capturas de pantalla no permitidas. El intento quedó registrado.';
    document.body.appendChild(v);
  }
  function tapar(ms) {
    html.classList.add('stili-tapado');
    try { navigator.clipboard && navigator.clipboard.writeText('Captura no permitida · Stili Group'); } catch (e) { /* nada */ }
    setTimeout(() => html.classList.remove('stili-tapado'), ms || 2500);
  }
  function listo() { marca(); velo(); }
  if (document.body) listo(); else document.addEventListener('DOMContentLoaded', listo);
  window.stiliMarca = q => { Object.assign(cfg, q || {}); }; // compatibilidad: ya no pinta nada

  // Tecla Imprimir pantalla y atajos de captura (los que el navegador alcanza a ver)
  const esCaptura = e => e.key === 'PrintScreen' || e.code === 'PrintScreen' ||
    ((e.metaKey || e.ctrlKey) && e.shiftKey && /^(s|3|4|5)$/i.test(e.key));
  document.addEventListener('keydown', e => { if (esCaptura(e)) { tapar(); registrar('captura_tecla'); if (e.key !== 'PrintScreen') e.preventDefault(); } }, true);
  document.addEventListener('keyup', e => { if (e.key === 'PrintScreen' || e.code === 'PrintScreen') { tapar(); registrar('captura_tecla'); } }, true);

  // v2.8.1 · La pantalla ya no se difumina cuando la ventana pierde el foco o usted se aleja (lo pidió el Gerente General).
  // Siguen el velo con la tecla Imprimir pantalla y los bloqueos de copiar e imprimir.

  // Clic derecho, copiar e imprimir
  document.addEventListener('contextmenu', e => { if (!enCampo(e.target)) e.preventDefault(); });
  ['copy', 'cut'].forEach(t => document.addEventListener(t, e => { if (!enCampo(e.target)) { e.preventDefault(); registrar('copiar'); } }));
  window.addEventListener('beforeprint', () => { if (!permiteImprimir()) registrar('imprimir'); });
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && /^p$/i.test(e.key) && !permiteImprimir()) { e.preventDefault(); registrar('imprimir'); } }, true);
})();
