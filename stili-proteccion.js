/* Stili · protección de pantalla (v2.3 · v2.8.1 sin difuminado)
 * Ningún navegador puede impedir del todo una captura (ni una foto con el celular). Esto la disuade:
 *  - marca de agua con el nombre de quien mira y la hora (si alguien filtra una captura, se sabe de quién salió);
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
    '.stili-marca{position:fixed;inset:0;pointer-events:none;z-index:2147483000;background-repeat:repeat}' +
    '.stili-velo{position:fixed;inset:0;z-index:2147483001;display:none;align-items:center;justify-content:center;background:rgba(0,43,87,.92);color:#fff;font:600 16px Montserrat,system-ui,sans-serif;text-align:center;padding:24px}' +
    'html.stili-tapado .stili-velo{display:flex}' +
    'body{-webkit-user-select:none;user-select:none}input,textarea,select,[contenteditable="true"],.permite-copiar{-webkit-user-select:text;user-select:text}' +
    '@media print{html:not([data-imprimir]) body>*{display:none!important}html:not([data-imprimir]) body::before{content:"Esta pantalla no se puede imprimir. Use los reportes de impresión del sistema.";display:block;padding:40px;font:16px sans-serif}}';
  (document.head || html).appendChild(css);

  function marca() {
    const quien = [cfg.quien, cfg.correo].filter(Boolean).join(' · ') || 'Stili Group · uso interno';
    const ahora = new Date().toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' });
    const c = document.createElement('canvas'); c.width = 420; c.height = 220;
    const x = c.getContext('2d');
    x.translate(210, 110); x.rotate(-0.42);
    x.fillStyle = 'rgba(120,132,145,0.13)'; x.textAlign = 'center';
    x.font = '600 14px Montserrat, Segoe UI, sans-serif'; x.fillText(quien, 0, -6);
    x.font = '12px Montserrat, Segoe UI, sans-serif'; x.fillText('Confidencial · ' + ahora, 0, 14);
    let d = document.querySelector('.stili-marca');
    if (!d) { d = document.createElement('div'); d.className = 'stili-marca'; d.setAttribute('aria-hidden', 'true'); document.body.appendChild(d); }
    d.style.backgroundImage = 'url(' + c.toDataURL() + ')';
  }
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
  function listo() { marca(); velo(); setInterval(marca, 60000); }
  if (document.body) listo(); else document.addEventListener('DOMContentLoaded', listo);
  window.stiliMarca = q => { Object.assign(cfg, q || {}); if (document.body) marca(); };

  // Tecla Imprimir pantalla y atajos de captura (los que el navegador alcanza a ver)
  const esCaptura = e => e.key === 'PrintScreen' || e.code === 'PrintScreen' ||
    ((e.metaKey || e.ctrlKey) && e.shiftKey && /^(s|3|4|5)$/i.test(e.key));
  document.addEventListener('keydown', e => { if (esCaptura(e)) { tapar(); registrar('captura_tecla'); if (e.key !== 'PrintScreen') e.preventDefault(); } }, true);
  document.addEventListener('keyup', e => { if (e.key === 'PrintScreen' || e.code === 'PrintScreen') { tapar(); registrar('captura_tecla'); } }, true);

  // v2.8.1 · La pantalla ya no se difumina cuando la ventana pierde el foco o usted se aleja (lo pidió el Gerente General).
  // Siguen la marca de agua, el velo con la tecla Imprimir pantalla y los bloqueos de copiar e imprimir.

  // Clic derecho, copiar e imprimir
  document.addEventListener('contextmenu', e => { if (!enCampo(e.target)) e.preventDefault(); });
  ['copy', 'cut'].forEach(t => document.addEventListener(t, e => { if (!enCampo(e.target)) { e.preventDefault(); registrar('copiar'); } }));
  window.addEventListener('beforeprint', () => { if (!permiteImprimir()) registrar('imprimir'); });
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && /^p$/i.test(e.key) && !permiteImprimir()) { e.preventDefault(); registrar('imprimir'); } }, true);
})();
