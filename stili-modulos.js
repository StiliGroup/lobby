/* Stili Group · barra común de módulos (v1.9)
 * Una sola navegación para Inicio, Invitados y Huéspedes, Torres, Nómina, Usuarios y Recursos.
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
    { k: 'invitados', t: 'Invitados y Huéspedes', href: 'admin.html?m=invitados' },
    { k: 'torres', t: 'Torres', href: 'torres.html' },
    { k: 'presupuesto', t: 'Presupuesto', href: 'presupuesto.html' },
    { k: 'cumpleanos', t: 'Cumpleaños', href: 'cumpleanos.html' },
    { k: 'nomina', t: 'Nómina', externo: true },
    { k: 'usuarios', t: 'Usuarios', href: 'admin.html?m=usuarios' },
    { k: 'recursos', t: 'Recursos', href: 'portal/#descargables', siempre: true },
  ];

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
    // La pestaña activa siempre queda a la vista: se cambia por la última visible
    if (activo && fuera.includes(activo)) {
      const visibles = items.filter(el => !fuera.includes(el));
      const ultima = visibles[visibles.length - 1];
      if (ultima) { fuera = fuera.filter(el => el !== activo); fuera.unshift(ultima); }
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

  async function abrirNomina() {
    const ventana = window.open('', '_blank');
    try {
      const r = await api('sso_ticket');
      if (!r.url_nomina) throw new Error('La dirección de la Nómina no está configurada (URL_NOMINA en la pestaña Config).');
      const url = r.url_nomina.replace(/\/$/, '') + '/sso?ticket=' + encodeURIComponent(r.ticket);
      if (ventana) ventana.location = url; else location.href = url;
    } catch (err) { if (ventana) ventana.close(); alert(err.message); }
  }

  function pintar(cont, actual) {
    const c = leer(), a = c.modulos || {}, u = c.usuario || {};
    const ve = m => m.siempre || (m.k === 'nomina' ? a.nomina : a[m.k]);
    const nav = cont.querySelector('.sm-nav');
    nav.innerHTML = MODULOS.filter(m => c.sesion && ve(m) || m.k === 'inicio').map(m =>
      '<a href="' + (m.externo ? '#' : BASE + m.href) + '" data-mod="' + m.k + '"' + (m.k === actual ? ' aria-current="page"' : '') + '>' + esc(m.t) + (m.externo ? ' ↗' : '') + '</a>').join('');
    nav.querySelectorAll('[data-mod="nomina"]').forEach(x => x.addEventListener('click', e => { e.preventDefault(); abrirNomina(); }));
    cont.querySelector('.sm-usuario').textContent = c.sesion && u.nombre ? u.nombre + ' · ' + (u.segmento_nombre || '') : '';
    cont.querySelector('.sm-salir').hidden = !c.sesion;
    mas(nav, { items: ':scope > a' });
  }

  /** Monta la barra en `donde` (al inicio) y la mantiene al día con la sesión. */
  function montar(donde, actual) {
    estilo();
    const cont = document.createElement('div'); cont.className = 'sm-barra'; cont.setAttribute('role', 'navigation'); cont.setAttribute('aria-label', 'Módulos de Stili');
    cont.innerHTML = '<div class="sm-fila"><a class="sm-logo" href="' + BASE + 'portal/"><img src="' + BASE + 'portal/icono-192.png" alt=""><b>STILI</b></a>' +
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

  window.StiliModulos = { montar, mas, refrescar, api, abrirNomina, leer, guardar, BASE, MODULOS };
})();
