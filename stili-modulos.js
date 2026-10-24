/* Stili Group · barra común de módulos (v2.1)
 * Seis puertas, por tarea: Inicio · Torres · Lobby · Finanzas · Nómina · Administración.
 * Cada página la monta con:  StiliModulos.montar(elemento, 'torres')
 * Los botones que no caben en la pantalla pasan al desplegable «Más ▾» (StiliModulos.mas(nav)).
 * Usa la misma sesión del Portal y del Panel (localStorage 'stili-admin').
 */
(function () {
  const LS = 'stili-admin';
  const leer = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch (e) { return {}; } };
  const guardar = c => { try { localStorage.setItem(LS, JSON.stringify(Object.assign(leer(), c))); } catch (e) { /* sin almacenamiento */ } };
  const script = document.currentScript;
  const BASE = script ? script.src.replace(/stili-modulos\.js.*$/, '') : '';
  const servicio = () => leer().url || (window.STILI && window.STILI.servicio) || '';
  const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const MODULOS = [
    { k: 'inicio', t: 'Inicio', href: 'portal/', siempre: true },
    { k: 'torres', t: 'Torres', href: 'torres.html' },
    { k: 'lobby', t: 'Lobby', href: 'admin.html?m=lobby', antes: 'invitados' },
    { k: 'finanzas', t: 'Finanzas', href: 'presupuesto.html', antes: 'presupuesto' },
    { k: 'nomina', t: 'Nómina', externo: true },
    { k: 'admin', t: 'Administración', href: 'admin.html?m=admin', antes: 'usuarios' },
  ];
  // Páginas que viven dentro de otra puerta (marcan esa puerta como activa)
  const DENTRO_DE = { invitados: 'lobby', presupuesto: 'finanzas', usuarios: 'admin', cumpleanos: 'inicio', recursos: 'inicio', tareas: 'torres' };

  const CSS = `
.sm-barra { background: #003A75; color: #fff; border-bottom: 3px solid #DCB40C; font-family: Montserrat, "Segoe UI", system-ui, sans-serif; }
.sm-fila { max-width: 1360px; margin: 0 auto; display: flex; align-items: center; gap: 4px; padding: 0 max(16px, env(safe-area-inset-left, 0px)); min-height: 46px; }
.sm-logo { display: flex; align-items: center; gap: 8px; color: #fff; text-decoration: none; margin-right: 10px; flex: 0 0 auto; }
.sm-logo img { width: 28px; height: 28px; border-radius: 6px; }
.sm-logo b { font-size: 14px; letter-spacing: .14em; }
.sm-nav { display: flex; align-items: stretch; gap: 2px; flex: 1 1 auto; min-width: 0; overflow: visible; }
.sm-nav > a, .sm-mas > button { color: #DCE6F2; text-decoration: none; font-size: 14px; font-weight: 600; padding: 13px 12px 11px; border-bottom: 3px solid transparent;
  margin-bottom: -3px; white-space: nowrap; background: none; border-top: 0; border-left: 0; border-right: 0; cursor: pointer; font-family: inherit; }
.sm-nav > a:hover, .sm-mas > button:hover { color: #fff; }
.sm-nav > a[aria-current="page"] { color: #fff; border-bottom-color: #DCB40C; }
.sm-mas { position: relative; flex: 0 0 auto; }
.sm-menu { position: absolute; right: 0; top: calc(100% + 3px); background: #fff; color: #13293D; border-radius: 10px; min-width: 220px; padding: 6px;
  box-shadow: 0 10px 30px rgba(19,41,61,.22); z-index: 60; }
.sm-menu a, .sm-menu button { display: block; width: 100%; text-align: left; padding: 10px 12px; border-radius: 8px; color: #13293D; text-decoration: none; font: 600 14px Montserrat, system-ui, sans-serif;
  background: none; border: 0; cursor: pointer; }
.sm-menu a:hover, .sm-menu button:hover, .sm-menu [aria-selected="true"], .sm-menu [aria-current="page"] { background: #E3E8F4; color: #003A75; }
.sm-usuario { flex: 0 0 auto; color: #C9D3DF; font-size: 13px; margin-left: 8px; white-space: nowrap; }
.sm-salir { flex: 0 0 auto; background: transparent; border: 1px solid rgba(255,255,255,.3); color: #fff; border-radius: 999px; padding: 5px 12px; font: 600 13px Montserrat, system-ui, sans-serif; cursor: pointer; margin-left: 8px; }
@media (max-width: 640px) { .sm-logo b, .sm-usuario { display: none; } }
.sm-oculto { display: none !important; }
`;
  function estilo() {
    if (document.getElementById('sm-css')) return;
    const s = document.createElement('style'); s.id = 'sm-css'; s.textContent = CSS; document.head.appendChild(s);
  }

  const texto = el => Array.from(el.childNodes).map(n => n.textContent.trim()).filter(Boolean).join(' · ');

  /** Mueve al desplegable «Más ▾» los elementos de `nav` que no caben. Sirve para la barra de módulos y para las pestañas de cada módulo. */
  function mas(nav, opciones) {
    opciones = opciones || {};
    const sel = opciones.items || ':scope > a, :scope > button:not(.sm-mas-btn)';
    let cont = nav.querySelector(':scope > .sm-mas');
    if (!cont) {
      cont = document.createElement('div'); cont.className = 'sm-mas';
      cont.innerHTML = '<button type="button" class="sm-mas-btn ' + (opciones.claseBoton || '') + '" aria-haspopup="true" aria-expanded="false">Más ▾</button><div class="sm-menu" role="menu" hidden></div>';
      nav.appendChild(cont);
      const btn = cont.firstChild, menu = cont.lastChild;
      btn.addEventListener('click', e => { e.stopPropagation(); menu.hidden = !menu.hidden; btn.setAttribute('aria-expanded', String(!menu.hidden)); });
      document.addEventListener('click', e => { if (!cont.contains(e.target)) { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); } });
      document.addEventListener('keydown', e => { if (e.key === 'Escape') { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); } });
      menu.addEventListener('click', e => { const it = e.target.closest('[data-origen]'); if (!it) return; menu.hidden = true;
        const o = nav.querySelector('[data-sm-id="' + it.dataset.origen + '"]'); if (o && o.tagName === 'BUTTON') o.click(); });
      let espera; new ResizeObserver(() => { clearTimeout(espera); espera = setTimeout(() => mas(nav, opciones), 60); }).observe(nav);
    }
    const btn = cont.firstChild, menu = cont.lastChild;
    const items = Array.from(nav.querySelectorAll(sel)).filter(el => !el.hidden);
    items.forEach((el, i) => { el.classList.remove('sm-oculto'); if (!el.dataset.smId) el.dataset.smId = 'i' + Math.random().toString(36).slice(2, 8); });
    cont.hidden = false;
    const disponible = nav.clientWidth - cont.offsetWidth - 4;
    let usado = 0, fuera = [];
    const activo = items.find(el => el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-current') === 'page');
    items.forEach(el => { usado += el.offsetWidth + 2; if (usado > disponible) fuera.push(el); });
    if (!fuera.length) { cont.hidden = true; menu.hidden = true; return; }
    // La pestaña activa siempre queda a la vista: se le reserva su espacio y las demás entran en orden mientras quepan
    if (activo && fuera.includes(activo)) {
      let espacio = disponible - activo.offsetWidth - 2, lleno = false;
      const visibles = items.filter(el => { if (el === activo || lleno) return false; if (el.offsetWidth + 2 <= espacio) { espacio -= el.offsetWidth + 2; return true; } lleno = true; return false; });
      fuera = items.filter(el => el !== activo && !visibles.includes(el));
    }
    fuera.forEach(el => el.classList.add('sm-oculto'));
    menu.innerHTML = fuera.map(el => el.tagName === 'A'
      ? '<a role="menuitem" href="' + esc(el.getAttribute('href')) + '"' + (el.target ? ' target="' + esc(el.target) + '" rel="noopener"' : '') + ' data-origen="' + el.dataset.smId + '">' + esc(texto(el)) + '</a>'
      : '<button role="menuitem" type="button" data-origen="' + el.dataset.smId + '" aria-selected="' + (el.getAttribute('aria-selected') || 'false') + '">' + esc(texto(el)) + '</button>').join('');
    btn.textContent = 'Más (' + fuera.length + ') ▾';
  }

  async function api(accion, datos) {
    const c = leer();
    const r = await fetch(servicio(), { method: 'POST', body: JSON.stringify(Object.assign({ accion, sesion: c.sesion || '' }, datos || {})) });
    const j = await r.json();
    if (!j.ok) { const e = new Error(j.error || 'Error del servicio'); e.codigo = j.codigo; throw e; }
    return j;
  }

  // v2.4 · una sola pantalla: la Nómina se abre en la misma ventana (con «← Inicio del Portal» en su menú)
  async function abrirNomina(ir) {
    try {
      const r = await api('sso_ticket');
      if (!r.url_nomina) throw new Error('La dirección de la Nómina no está configurada (URL_NOMINA en la pestaña Config).');
      location.href = r.url_nomina.replace(/\/$/, '') + '/sso?ticket=' + encodeURIComponent(r.ticket) + (ir ? '&ir=' + encodeURIComponent(ir) : '');
    } catch (err) { alert(err.message); }
  }

  function pintar(cont, actual) {
    const c = leer(), a = c.modulos || {}, u = c.usuario || {};
    const ve = m => m.siempre || (a[m.k] !== undefined ? a[m.k] : a[m.antes]);
    actual = DENTRO_DE[actual] || actual;
    const nav = cont.querySelector('.sm-nav');
    nav.innerHTML = MODULOS.filter(m => c.sesion && ve(m) || m.k === 'inicio').map(m =>
      '<a href="' + (m.externo ? '#' : BASE + m.href) + '" data-mod="' + m.k + '"' + (m.k === actual ? ' aria-current="page"' : '') + '>' + esc(m.t) + '</a>').join('');
    nav.querySelectorAll('[data-mod="nomina"]').forEach(x => x.addEventListener('click', e => { e.preventDefault(); abrirNomina(); }));
    cont.querySelector('.sm-usuario').textContent = c.sesion && u.nombre ? u.nombre + ' · ' + (u.segmento_nombre || '') : '';
    cont.querySelector('.sm-salir').hidden = !c.sesion;
    mas(nav, { items: ':scope > a' });
  }

  /** Monta la barra en `donde` (al inicio) y la mantiene al día con la sesión. */
  function montar(donde, actual) {
    estilo();
    const cont = document.createElement('div'); cont.className = 'sm-barra'; cont.setAttribute('role', 'navigation'); cont.setAttribute('aria-label', 'Módulos de Stili');
    cont.innerHTML = '<div class="sm-fila"><a class="sm-logo" href="' + BASE + 'portal/"><img src="' + BASE + 'portal/icono-192.png" alt=""><b>STILI SOFT</b></a>' +
      '<nav class="sm-nav"></nav><span class="sm-usuario"></span><button type="button" class="sm-salir" hidden>Salir</button></div>';
    donde.insertBefore(cont, donde.firstChild);
    cont.querySelector('.sm-salir').addEventListener('click', () => { guardar({ sesion: '', modulos: {}, usuario: {} }); location.href = BASE + 'portal/'; });
    pintar(cont, actual);
    StiliModulos.refrescar().then(() => pintar(cont, actual)).catch(() => {});
    window.addEventListener('storage', e => { if (e.key === LS) pintar(cont, actual); });
    return cont;
  }

  /** Pide al servicio qué módulos ve el usuario y lo guarda para todas las páginas. */
  async function refrescar() {
    if (!leer().sesion || !servicio()) return null;
    const r = await api('portal');
    guardar({ modulos: r.accesos, usuario: r.usuario });
    return r;
  }

  // ---------------------------------------------------------------- v2.4 · una sola pantalla
  // Los módulos cambian dentro de la misma ventana con una transición suave; los archivos (Drive, PDF) se ven en un visor encima.
  (function () {
    const s = document.createElement('style'); s.id = 'sm-una-pantalla';
    s.textContent = '@view-transition{navigation:auto}::view-transition-old(root),::view-transition-new(root){animation-duration:.18s}' +
      '#sm-visor{position:fixed;inset:0;z-index:9000;background:rgba(10,20,32,.72);display:flex;flex-direction:column;padding:14px}#sm-visor[hidden]{display:none}' +
      '#sm-visor .b{display:flex;justify-content:space-between;align-items:center;gap:10px;color:#fff;margin-bottom:8px;font:600 14px Montserrat,system-ui,sans-serif}' +
      '#sm-visor iframe{flex:1;border:0;border-radius:10px;background:#fff;width:100%}#sm-visor a,#sm-visor button{background:#fff;color:#003A75;border:0;border-radius:8px;padding:7px 14px;font:600 13px Montserrat,system-ui,sans-serif;cursor:pointer;text-decoration:none}';
    (document.head || document.documentElement).appendChild(s);
  })();
  function visor(src, titulo, original) {
    let v = document.getElementById('sm-visor');
    if (!v) {
      v = document.createElement('div'); v.id = 'sm-visor'; v.hidden = true; v.setAttribute('role', 'dialog'); v.setAttribute('aria-modal', 'true');
      v.innerHTML = '<div class="b"><span class="t"></span><span><a class="o" href="#" rel="noopener" target="_blank">Abrir aparte</a> <button type="button">Cerrar ✕</button></span></div><iframe title="Documento"></iframe>';
      document.body.appendChild(v);
      const cerrar = () => { v.hidden = true; v.querySelector('iframe').src = 'about:blank'; };
      v.querySelector('button').addEventListener('click', cerrar);
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && !v.hidden) cerrar(); });
    }
    v.querySelector('.t').textContent = (titulo || 'Documento').replace(/\s*↗\s*$/, '').trim();
    v.querySelector('.o').href = original || src;
    v.querySelector('iframe').src = src; v.hidden = false;
  }
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.button || e.ctrlKey || e.metaKey || e.shiftKey || a.closest('#sm-visor') || a.hasAttribute('download')) return;
    let u; try { u = new URL(a.getAttribute('href'), location.href); } catch (err) { return; }
    const drive = /(^|\.)(drive|docs)\.google\.com$/.test(u.hostname) && u.pathname.match(/\/(?:file|document|spreadsheets|presentation)\/d\/([\w-]+)/);
    if (drive) { e.preventDefault(); return visor(u.origin + u.pathname.replace(/\/(edit|view)$/, '').replace(/\/$/, '') + '/preview', a.textContent, a.href); }
    if (a.hasAttribute('data-visor')) { e.preventDefault(); return visor(u.href, a.textContent, a.href); }
    if (a.target === '_blank' && u.origin === location.origin) a.removeAttribute('target');      // páginas del Portal: en la misma ventana
  }, true);

  window.StiliModulos = { montar, mas, refrescar, api, abrirNomina, leer, guardar, visor, BASE, MODULOS };
})();

// v2.3 · protección de pantalla en todas las páginas del Portal (marca de agua con el nombre, sin capturas ni copias)
(function () {
  let cfg = {}; try { cfg = JSON.parse(localStorage.getItem('stili-admin') || '{}'); } catch (e) { /* sin almacenamiento */ }
  const u = cfg.usuario || {};
  window.STILI_PROTECCION = Object.assign({ quien: u.nombre || '', correo: u.correo || '',
    registrar: tipo => {
      const url = cfg.url || (window.STILI && window.STILI.servicio);
      if (!url || !cfg.sesion) return;
      try { navigator.sendBeacon(url, JSON.stringify({ accion: 'captura', sesion: cfg.sesion, tipo: tipo, pagina: location.pathname + location.hash })); } catch (e) { /* nada */ }
    } }, window.STILI_PROTECCION || {});
  const actual = document.currentScript && document.currentScript.src;
  const s = document.createElement('script');
  s.src = actual ? actual.replace(/stili-modulos\.js.*$/, 'stili-proteccion.js?v=23') : 'stili-proteccion.js?v=23';
  (document.head || document.documentElement).appendChild(s);
})();
