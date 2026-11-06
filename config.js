// Configuración compartida de las páginas de Stili Soft (panel, portal, lobby, host, huésped, encuestas…).
//
// ─── CAMBIO DE SERVIDOR: cambie SOLO la línea de abajo ────────────────────────────────────────────────
//   'apps_script' = servicio de Google (Apps Script)      'api' = servidor nuevo de Stili (stilisoft.stili.com.do)
var STILI_ACTIVO = 'api';
// ──────────────────────────────────────────────────────────────────────────────────────────────────────
//
// Probar en UN solo equipo sin cambiar a los demás: abrir cualquier página con ?servicio=api (o ?servicio=apps_script).
// Queda guardado en ese navegador y se ve una franja arriba. Para quitarlo: abrir una página con ?servicio=normal
(function () {
  var SERVICIOS = {
    apps_script: 'https://script.google.com/macros/s/AKfycbyWIj0gZi5yi988y6_FFDO_Kdh88NZ8qUmP2_coSjJwIDa_0NNc_k404wGi1CWcZK1D/exec',
    api: 'https://stilisoft.stili.com.do/api'
  };
  var LS_FORZADO = 'stili-servicio-forzado';
  var forzado = null;
  try {
    var q = new URLSearchParams(location.search).get('servicio');
    if (q === 'normal') localStorage.removeItem(LS_FORZADO);
    else if (q && SERVICIOS.hasOwnProperty(q)) localStorage.setItem(LS_FORZADO, q);
    forzado = localStorage.getItem(LS_FORZADO);
    if (forzado && !SERVICIOS.hasOwnProperty(forzado)) forzado = null;
  } catch (e) { forzado = null; }
  var activo = forzado || (SERVICIOS.hasOwnProperty(STILI_ACTIVO) ? STILI_ACTIVO : 'apps_script');
  var url = SERVICIOS[activo];

  // Equipos que guardaron la dirección del servicio a mano (tabletas del lobby, panel, portal): se cambia a la activa.
  // Solo se tocan valores que son EXACTAMENTE una de las dos direcciones de arriba.
  var conocida = function (v) { return v === SERVICIOS.apps_script || v === SERVICIOS.api; };
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (!k || k.indexOf('stili') !== 0 || k === LS_FORZADO) continue;
      var v = localStorage.getItem(k);
      if (conocida(v)) { if (v !== url) localStorage.setItem(k, url); continue; }
      if (!v || v.charAt(0) !== '{') continue;
      var o; try { o = JSON.parse(v); } catch (e) { continue; }
      if (!o || typeof o !== 'object') continue;
      var cambio = false;
      for (var c in o) if (Object.prototype.hasOwnProperty.call(o, c) && conocida(o[c]) && o[c] !== url) { o[c] = url; cambio = true; }
      if (cambio) localStorage.setItem(k, JSON.stringify(o));
    }
  } catch (e) { /* sin almacenamiento */ }

  window.STILI = { servicio: url, activo: activo, prueba: !!forzado };

  // Franja visible mientras el equipo está en prueba
  if (forzado) {
    var franja = function () {
      try {
        var d = document.createElement('div');
        d.textContent = 'PRUEBA · ' + (forzado === 'api' ? 'servidor nuevo' : 'Apps Script') + ' · para salir abra la página con ?servicio=normal';
        d.setAttribute('style', 'position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#b45309;color:#fff;font:600 12px/1.8 system-ui,sans-serif;text-align:center;pointer-events:none');
        document.body.appendChild(d);
      } catch (e) { /* nada */ }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', franja); else franja();
  }

  // Páginas abiertas mucho tiempo (tabletas del lobby): si se publica otro STILI_ACTIVO, se recargan solas
  // cuando llevan 2 minutos sin que nadie las toque. Se revisa cada 10 minutos.
  var script = document.currentScript, ultimoUso = Date.now();
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
    try { window.addEventListener(ev, function () { ultimoUso = Date.now(); }, true); } catch (e) { /* nada */ }
  });
  if (script && script.src && !forzado && window.fetch) {
    var fuente = script.src.split('?')[0].split('#')[0];
    setInterval(function () {
      if (Date.now() - ultimoUso < 120000) return;
      fetch(fuente, { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : ''; }).then(function (t) {
        var m = /var STILI_ACTIVO = '([a-z_]+)'/.exec(t || '');
        if (m && m[1] !== activo && SERVICIOS.hasOwnProperty(m[1]) && Date.now() - ultimoUso >= 120000) location.reload();
      }).catch(function () { /* sin internet: se revisa en la próxima vuelta */ });
    }, 10 * 60000);
  }
})();
