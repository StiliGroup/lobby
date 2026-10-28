/* Stili Group · barra común de módulos (v2.8)
 * Ocho módulos: Inicio · Condominios · Finanzas · Personal · Operaciones · Lobby · Ajustes · DEMO.
 * Cada módulo abre un menú desplegable con sus temas agrupados por categoría; debajo, la ruta «Módulo › Categoría › Tema».
 * Cada página la monta con:  StiliModulos.montar(elemento, 'torres')
 * Los botones que no caben en la pantalla pasan al desplegable «Más ▾» (StiliModulos.mas(nav)).
 * Usa la misma sesión del Portal y del Panel (localStorage 'stili-admin').
 */
// v2.7.2 · tema de pantalla: claro por defecto (también con el teléfono o la PC en modo oscuro); se puede cambiar en la barra
(function () {
  let tema = 'claro'; try { tema = localStorage.getItem('stili-tema') || 'claro'; } catch (e) { /* sin almacenamiento */ }
  if (tema !== 'auto') document.documentElement.setAttribute('data-theme', tema === 'oscuro' ? 'dark' : 'light');
})();
(function () {
  const LS = 'stili-admin';
  const leer = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch (e) { return {}; } };
  const guardar = c => { try { localStorage.setItem(LS, JSON.stringify(Object.assign(leer(), c))); } catch (e) { /* sin almacenamiento */ } };
  const script = document.currentScript;
  const BASE = script ? script.src.replace(/stili-modulos\.js.*$/, '') : '';
  // v2.8.1 · La Nómina (en la PC) carga este mismo archivo con data-nomina: la misma barra arriba y sin el menú viejo de la izquierda
  const EN_NOMINA = !!(script && script.hasAttribute('data-nomina'));
  const VERSION_BARRA = '3.0';
  const servicio = () => leer().url || (window.STILI && window.STILI.servicio) || '';
  const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // v2.8 · cada módulo abre un menú desplegable con sus temas agrupados por categoría.
  // `ve` = clave de acceso que da el servicio (accionPortal_); `viejo` = la clave de antes de la v2.7.
  // Enlaces de torres.html: «#/seccion» abre la sección en la torre que se usó la última vez; «#/cxp/pagos» abre también la pestaña.
  // `nomina` = ruta dentro de la Nómina (se abre en la misma ventana con un boleto de un solo uso).
  // Regla de coherencia: cada tema vive en UN módulo; Condominios muestra la ficha completa de la torre (todo lo de esa torre en un lugar).
  const MODULOS = [
    { k: 'inicio', t: 'Inicio', siempre: true, grupos: [
      { t: 'Mi espacio', items: [
        { t: 'Mi inicio', d: 'Avisos, pendientes y accesos rápidos', href: 'portal/', siempre: true },
        { t: 'Mi tarjeta, display y firma', d: 'Piezas con la marca Stili', href: 'portal/#mi', siempre: true },
        { t: 'Cumpleaños', d: 'Junta, empleados de torres y equipo Stili', href: 'cumpleanos.html', ve: 'cumpleanos' }] }] },
    { k: 'condominios', t: 'Condominios', ve: 'torres', grupos: [
      { t: 'La torre', items: [
        { t: 'Tablero del condominio', d: 'Todo de la torre en un vistazo', href: 'torres.html?m=inicio#/tablero', ve: 'torres' },
        { t: 'Generales y legales', d: 'RNC, dirección, registro TSS', href: 'torres.html?m=inicio#/general', ve: 'torres' },
        { t: 'Junta Directiva', href: 'torres.html?m=inicio#/junta', ve: 'torres' },
        { t: 'Notas e historial', href: 'torres.html?m=inicio#/historial', ve: 'torres' }] },
      { t: 'Unidades y personas', items: [
        { t: 'Apartamentos y residentes', href: 'torres.html?m=inicio#/apartamentos', ve: 'torres' },
        { t: 'Personal de la torre', d: 'Empleados que vienen de Nómina', href: 'torres.html?m=inicio#/personal', ve: 'torres' }] },
      { t: 'Contratos y documentos', items: [
        { t: 'Proveedores y contratos', href: 'torres.html?m=inicio#/proveedores', ve: 'torres' },
        { t: 'Reglamentos y documentos', href: 'torres.html?m=inicio#/documentos', ve: 'torres' },
        { t: 'Accesos y servicios', d: 'EDESUR, CAASD, banca en línea', href: 'torres.html?m=inicio#/accesos', ve: 'torres' }] },
      { t: 'Clientes', items: [
        { t: 'Opinión de los clientes', d: 'Encuesta por QR, recomendación y comentarios', href: 'opiniones.html', ve: 'torres' },
        { t: 'Códigos QR del lobby', d: 'Un cartel por torre para imprimir', href: 'opiniones.html#qr', ve: 'torres' }] }] },
    { k: 'finanzas', t: 'Finanzas', ve: 'finanzas', grupos: [
      { t: 'Resumen', items: [
        { t: 'Semáforo de las torres', d: 'Liquidez, por cobrar y por pagar', href: 'presupuesto.html', ve: 'presupuesto' },
        { t: 'Estados y presupuesto', d: 'Estados financieros leídos con IA', href: 'torres.html?m=finanzas#/finanzas', ve: 'cuentas', viejo: 'torres' }] },
      { t: 'Contabilidad de la torre', items: [
        { t: 'Inicio de Contabilidad', d: 'Saldos, cartera, Vigía de cobros y caja a 90 días', href: 'contabilidad.html#inicio', ve: 'contabilidad', viejo: 'torres' },
        { t: 'Cuotas y recibos', d: 'Conceptos del mes, reparto y recibos', href: 'contabilidad.html#cuotas', ve: 'contabilidad', viejo: 'torres' },
        { t: 'Cobros', d: 'Cobrar, avisos de pago y depósitos sin identificar', href: 'contabilidad.html#cobros', ve: 'contabilidad', viejo: 'torres' },
        { t: 'Cobranza y acuerdos', d: 'Cartera por antigüedad y seguimiento', href: 'contabilidad.html#cobranza', ve: 'contabilidad', viejo: 'torres' },
        { t: 'Pagos y bancos', d: 'Rubros, Junta, caja chica y transferencias', href: 'contabilidad.html#bancos', ve: 'contabilidad', viejo: 'torres' },
        { t: 'Conciliación y cierre', d: 'Estado del banco y cierre de mes', href: 'contabilidad.html#conciliacion', ve: 'contabilidad', viejo: 'torres' },
        { t: 'Reportes', d: 'Liquidación, informe a la Junta y más', href: 'contabilidad.html#reportes', ve: 'contabilidad', viejo: 'torres' },
        { t: 'Contabilidad formal', d: 'Libro diario, balance y resultados', href: 'contabilidad.html#formal', ve: 'contabilidad', viejo: 'torres' },
        { t: 'Configuración contable', d: 'Reglas, rubros, reparto y presupuesto', href: 'contabilidad.html#config', ve: 'contabilidad', viejo: 'torres' },
        { t: 'Todas las torres', href: 'contabilidad.html#global', ve: 'contabilidad', viejo: 'torres' }] },
      { t: 'Ingresos · por cobrar', items: [
        { t: 'Cuentas por cobrar', d: 'Cargar el listado semanal y ver saldos', href: 'cobros.html', ve: 'cobros' },
        { t: 'Por cobrar de la torre', d: 'Detalle por apartamento', href: 'torres.html?m=finanzas#/cxc', ve: 'cobros' }] },
      { t: 'Egresos · por pagar (3 pasos)', items: [
        { t: '1 · Bandeja', d: 'Facturas, nómina y Vigía de pagos', href: 'torres.html?m=finanzas#/cxp/bandeja', ve: 'cuentas', viejo: 'torres' },
        { t: '2 · Armar y aprobar', d: 'Balance del banco y relación', href: 'torres.html?m=finanzas#/cxp/armar', ve: 'cuentas', viejo: 'torres' },
        { t: '3 · Pagar y confirmar', d: 'Forma de pago y confirmación con el banco', href: 'torres.html?m=finanzas#/cxp/pagar', ve: 'cuentas', viejo: 'torres' },
        { t: 'Pagos recurrentes', href: 'torres.html?m=finanzas#/cxp/recurrentes', ve: 'cuentas', viejo: 'torres' },
        { t: 'Historial de pagos', d: 'Por mes y por suplidor', href: 'torres.html?m=finanzas#/cxp/historial', ve: 'cuentas', viejo: 'torres' }] },
      { t: 'Bancos', items: [
        { t: 'Cuentas y confirmación con el banco', d: 'Cuentas de cada torre y sus estados', href: 'torres.html?m=finanzas#/cxp/banco', ve: 'cuentas', viejo: 'torres' },
        { t: 'Chequeras', href: 'torres.html?m=finanzas#/cxp/cheques', ve: 'cuentas', viejo: 'torres' }] }] },
    { k: 'personal', t: 'Personal', ve: 'personal', viejo: 'nomina_permiso', grupos: [
      { t: 'Empleados', items: [
        { t: 'Expedientes', d: 'Ficha, salario, contrato e historial', nomina: '/empleados', ve: 'nomina' },
        { t: 'Personal por torre', href: 'torres.html?m=personal#/personal', ve: 'torres' }] },
      { t: 'Nómina', items: [
        { t: 'Nóminas quincenales', d: 'Novedades, cálculo, aprobación y banco', nomina: '/nominas', ve: 'nomina' },
        { t: 'Cubre turnos', nomina: '/turnos', ve: 'nomina' },
        { t: 'Empleadores', d: 'RNC, TSS, banco y tamaño de cada torre', nomina: '/empleadores', ve: 'nomina' }] },
      { t: 'Asistencia y ausencias', items: [
        { t: 'Ponchador', d: 'Empleados del lobby y su PIN', href: 'admin.html?m=personal#personal', ve: 'personal', viejo: 'panel' },
        { t: 'Horas por quincena', href: 'admin.html?m=personal#quincena', ve: 'personal', viejo: 'panel' },
        { t: 'Vacaciones', nomina: '/vacaciones', ve: 'nomina' },
        { t: 'Licencias médicas', nomina: '/licencias', ve: 'nomina' }] },
      { t: 'Reclutamiento', items: [
        { t: 'Candidatos', d: 'Solicitudes ordenadas por puntaje', href: 'reclutamiento.html', ve: 'personal', viejo: 'nomina_permiso' },
        { t: 'Vacantes', href: 'reclutamiento.html#vacantes', ve: 'personal', viejo: 'nomina_permiso' },
        { t: 'Avisos y canales', d: 'Textos con enlace, QR y alcance por canal', href: 'reclutamiento.html#canales', ve: 'personal', viejo: 'nomina_permiso' },
        { t: 'Página pública de empleos', href: 'empleo.html', siempre: true }] },
      { t: 'Cumplimiento', items: [
        { t: 'Reportes legales', d: 'TSS, ISR, IR-13, DGT', nomina: '/reportes', ve: 'nomina' },
        { t: 'Calculadoras', d: 'Neto y prestaciones', nomina: '/calculadoras', ve: 'nomina' },
        { t: 'Empleadores y parámetros', nomina: '/parametros', ve: 'nomina' }] }] },
    { k: 'operaciones', t: 'Operaciones', ve: 'operaciones', viejo: 'torres', grupos: [
      { t: 'Tareas', items: [
        { t: 'Tareas de la torre', d: 'Levantamientos, estatus y comentarios', href: 'torres.html?m=operaciones#/tareas', ve: 'operaciones', viejo: 'torres' },
        { t: 'Tareas por gestor', href: 'tareas.html', ve: 'operaciones', viejo: 'torres' },
        { t: 'Tareas por oficio', href: 'tareas.html#oficios', ve: 'operaciones', viejo: 'torres' },
        { t: 'KPI de gestoras', d: 'Tareas a tiempo y opinión de sus torres', href: 'opiniones.html#gestoras', ve: 'operaciones', viejo: 'torres' }] },
      { t: 'Suplidores', items: [
        { t: 'Suplidores', d: 'Registro e invitación a Telegram', href: 'tareas.html#suplidores', ve: 'operaciones', viejo: 'torres' },
        { t: 'Órdenes de trabajo y facturas', href: 'tareas.html#ordenes', ve: 'operaciones', viejo: 'torres' },
        { t: 'Proveedores y contratos', href: 'torres.html?m=operaciones#/proveedores', ve: 'operaciones', viejo: 'torres' }] },
      { t: 'Comunidad', items: [
        { t: 'Reclamaciones y comunicados', href: 'torres.html?m=operaciones#/reclamaciones', ve: 'operaciones', viejo: 'torres' },
        { t: 'Pedidos de limpieza', href: 'torres.html?m=operaciones#/pedidos', ve: 'operaciones', viejo: 'torres' }] }] },
    { k: 'lobby', t: 'Lobby', ve: 'lobby', grupos: [
      { t: 'En vivo', items: [
        { t: 'Tablero de portería', d: 'Quién está adentro en cada torre', href: 'admin.html?m=lobby#tablero', ve: 'lobby' },
        { t: 'Buscar apartamento', href: 'admin.html?m=lobby#apto', ve: 'lobby' }] },
      { t: 'Control de acceso', items: [
        { t: 'Por revisar', d: 'Encuestas y conflictos', href: 'admin.html?m=lobby#revisar', ve: 'lobby' },
        { t: 'Hosts y renta corta', href: 'admin.html?m=lobby#hosts', ve: 'lobby' },
        { t: 'Lista negra', href: 'admin.html?m=lobby#negra', ve: 'lobby' }] },
      { t: 'Configuración', items: [
        { t: 'Apartamentos', d: 'Cargar torre y residentes', href: 'admin.html?m=lobby#torres', ve: 'lobby' },
        { t: 'Apartamentos y accesos por torre', href: 'torres.html?m=lobby#/apartamentos', ve: 'torres' },
        { t: 'Reglamentos en portería', href: 'admin.html?m=lobby#documentos', ve: 'lobby' },
        { t: 'Parámetros y tabletas', href: 'admin.html?m=lobby#parametros', ve: 'lobby' }] }] },
    { k: 'ajustes', t: 'Ajustes', ve: 'ajustes', viejo: 'admin', grupos: [
      { t: 'Usuarios y seguridad', items: [
        { t: 'Usuarios y permisos', d: 'Aprobación, segmentos y torres', href: 'admin.html?m=admin#usuarios', ve: 'ajustes', viejo: 'admin' },
        { t: 'Ajustes y políticas', href: 'admin.html?m=admin#ajustes', ve: 'ajustes', viejo: 'admin' },
        { t: 'Papelera', d: 'Lo eliminado, 30 días', href: 'admin.html?m=admin#papelera', ve: 'ajustes', viejo: 'admin' }] }] },
    { k: 'demo', t: 'DEMO', ve: 'demo', href: 'demo.html', grupos: [] },
  ];
  MODULOS.forEach(m => { m.sub = [].concat(...(m.grupos || []).map(g => g.items)); });   // lista plana (compatibilidad)
  // Páginas viejas o internas y su módulo
  const DENTRO_DE = { invitados: 'lobby', presupuesto: 'finanzas', usuarios: 'ajustes', admin: 'ajustes', cumpleanos: 'inicio', recursos: 'inicio', tareas: 'operaciones', torres: 'condominios', nomina: 'personal', cobros: 'finanzas', contabilidad: 'finanzas' };

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
.sm-tema { flex: 0 0 auto; background: transparent; border: 1px solid rgba(255,255,255,.3); color: #fff; border-radius: 999px; width: 30px; height: 28px; margin-left: 8px; cursor: pointer; font-size: 14px; line-height: 1; }
.sm-salir { flex: 0 0 auto; background: transparent; border: 1px solid rgba(255,255,255,.3); color: #fff; border-radius: 999px; padding: 5px 12px; font: 600 13px Montserrat, system-ui, sans-serif; cursor: pointer; margin-left: 8px; }
@media (max-width: 640px) { .sm-logo b, .sm-usuario { display: none; } }
.sm-oculto { display: none !important; }
.sm-sub { background: #F1F4F9; border-bottom: 1px solid #DCE3EC; font-family: Montserrat, "Segoe UI", system-ui, sans-serif; }
.sm-sub .sm-nav { max-width: 1360px; margin: 0 auto; padding: 0 max(16px, env(safe-area-inset-left, 0px)); min-height: 38px; }
.sm-sub .sm-nav > a { color: #3D5168; font-size: 13px; font-weight: 600; padding: 10px 10px 8px; border-bottom: 2px solid transparent; text-decoration: none; white-space: nowrap; }
.sm-sub .sm-nav > a:hover { color: #003A75; }
.sm-sub .sm-nav > a[aria-current="page"] { color: #003A75; border-bottom-color: #DCB40C; }
.sm-sub .sm-mas > button { color: #3D5168; font-size: 13px; padding: 10px 10px 8px; }
.sm-nav > a[data-mod="demo"] { color: #FFE48A; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .sm-sub { background: #16212E; border-bottom-color: #26364A; }
  :root:not([data-theme="light"]) .sm-sub .sm-nav > a, :root:not([data-theme="light"]) .sm-sub .sm-mas > button { color: #B9C6D6; }
  :root:not([data-theme="light"]) .sm-sub .sm-nav > a[aria-current="page"] { color: #fff; } }
:root[data-theme="dark"] .sm-sub { background: #16212E; border-bottom-color: #26364A; }
:root[data-theme="dark"] .sm-sub .sm-nav > a { color: #B9C6D6; }
/* v2.8 · menús desplegables por módulo */
.sm-mod { position: relative; display: flex; }
.sm-mod-btn { color: #DCE6F2; background: none; border: 0; border-bottom: 3px solid transparent; margin-bottom: -3px; padding: 13px 12px 11px; font: 600 14px Montserrat, "Segoe UI", system-ui, sans-serif;
  white-space: nowrap; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
.sm-mod-btn::after { content: ""; width: 6px; height: 6px; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: rotate(45deg) translateY(-2px); opacity: .7; }
.sm-mod-btn.sin-menu::after { display: none; }
.sm-mod-btn:hover, .sm-mod-btn[aria-expanded="true"] { color: #fff; }
.sm-mod-btn[aria-current="page"] { color: #fff; border-bottom-color: #DCB40C; }
.sm-mod-btn[data-mod="demo"] { color: #FFE48A; }
.sm-panel { position: absolute; left: 0; top: calc(100% + 3px); z-index: 70; background: #fff; color: #13293D; border-radius: 12px; padding: 14px; box-shadow: 0 14px 40px rgba(19,41,61,.24);
  display: grid; grid-auto-flow: column; grid-auto-columns: minmax(200px, 240px); gap: 6px 14px; max-width: calc(100vw - 32px); }
.sm-panel[hidden] { display: none; }
.sm-mod.derecha .sm-panel { left: auto; right: 0; }
.sm-grupo h3 { margin: 2px 8px 6px; font: 700 11px Montserrat, system-ui, sans-serif; letter-spacing: .1em; text-transform: uppercase; color: #8A6D00; }
.sm-grupo a { display: block; padding: 8px 10px; border-radius: 8px; color: #13293D; text-decoration: none; font: 600 14px Montserrat, system-ui, sans-serif; line-height: 1.3; }
.sm-grupo a small { display: block; font-weight: 500; font-size: 12px; color: #5A6B78; margin-top: 2px; }
.sm-grupo a:hover, .sm-grupo a:focus-visible { background: #E3E8F4; color: #003A75; outline: none; }
.sm-grupo a[aria-current="page"] { background: #FFF6D6; color: #003A75; box-shadow: inset 3px 0 0 #DCB40C; }
.sm-menu-btn { display: none; flex: 0 0 auto; background: transparent; border: 1px solid rgba(255,255,255,.35); color: #fff; border-radius: 8px; padding: 6px 12px; font: 600 14px Montserrat, system-ui, sans-serif; cursor: pointer; }
.sm-cajon { background: #fff; color: #13293D; border-bottom: 1px solid #DCE3EC; max-height: calc(100vh - 60px); overflow-y: auto; padding: 6px max(16px, env(safe-area-inset-left, 0px)) 14px; }
.sm-cajon[hidden] { display: none; }
.sm-cajon details { border-bottom: 1px solid #E6EBF2; }
.sm-cajon summary { list-style: none; cursor: pointer; padding: 13px 4px; font: 700 15px Montserrat, system-ui, sans-serif; color: #003A75; display: flex; justify-content: space-between; }
.sm-cajon summary::-webkit-details-marker { display: none; }
.sm-cajon summary::after { content: "+"; font-weight: 600; }
.sm-cajon details[open] summary::after { content: "–"; }
.sm-cajon .sm-grupo { padding: 0 0 8px; }
.sm-ruta { background: #F1F4F9; border-bottom: 1px solid #DCE3EC; font: 500 13px Montserrat, "Segoe UI", system-ui, sans-serif; color: #5A6B78; }
.sm-ruta div { max-width: 1360px; margin: 0 auto; padding: 7px max(16px, env(safe-area-inset-left, 0px)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sm-ruta b { color: #003A75; font-weight: 700; }
.sm-ruta span + span::before { content: "›"; margin: 0 8px; color: #9AA8B6; }
@media (max-width: 1080px) { .sm-usuario { display: none; } .sm-mod-btn { padding-left: 9px; padding-right: 9px; } }
@media (max-width: 900px) { .sm-barra .sm-nav { display: none; } .sm-menu-btn { display: inline-block; margin-left: auto; } }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .sm-panel, :root:not([data-theme="light"]) .sm-cajon { background: #13222F; color: #E6EEF2; }
  :root:not([data-theme="light"]) .sm-grupo a, :root:not([data-theme="light"]) .sm-cajon summary { color: #E6EEF2; }
  :root:not([data-theme="light"]) .sm-grupo a small { color: #93A6B4; } :root:not([data-theme="light"]) .sm-grupo h3 { color: #D9B45E; }
  :root:not([data-theme="light"]) .sm-grupo a:hover { background: #1E3346; color: #fff; } :root:not([data-theme="light"]) .sm-grupo a[aria-current="page"] { background: #33291A; color: #fff; }
  :root:not([data-theme="light"]) .sm-ruta { background: #16212E; border-bottom-color: #26364A; color: #93A6B4; } :root:not([data-theme="light"]) .sm-ruta b { color: #E6EEF2; } }
:root[data-theme="dark"] .sm-panel, :root[data-theme="dark"] .sm-cajon { background: #13222F; color: #E6EEF2; }
:root[data-theme="dark"] .sm-grupo a, :root[data-theme="dark"] .sm-cajon summary { color: #E6EEF2; }
:root[data-theme="dark"] .sm-grupo a small { color: #93A6B4; } :root[data-theme="dark"] .sm-grupo h3 { color: #D9B45E; }
:root[data-theme="dark"] .sm-grupo a:hover { background: #1E3346; color: #fff; } :root[data-theme="dark"] .sm-grupo a[aria-current="page"] { background: #33291A; color: #fff; }
:root[data-theme="dark"] .sm-ruta { background: #16212E; border-bottom-color: #26364A; color: #93A6B4; } :root[data-theme="dark"] .sm-ruta b { color: #E6EEF2; }
`;

  // v2.8 · capa visual minimalista común (Torres, Finanzas, Operaciones, Lobby, Personal, Ajustes, Portal).
  // Menos carga visual: letra de datos más pequeña y pareja, alertas compactas que conservan su color, tarjetas sin sombra,
  // indicadores en rojo sin fondo relleno. Va al final del documento para quedar por encima del estilo de cada página.
  const CSS_MINIMAL = `
body { font-size: 14px; }
.card { padding: 14px 16px; box-shadow: none; border-radius: 10px; }
h2 { font-size: 11.5px; letter-spacing: .09em; margin-bottom: 10px; }
h3 { font-size: 15px; }
.nota { font-size: 13px; }
.resumen h1 { font-size: 20px; }
/* cabecera de página: más baja (el menú y la ruta ya dicen dónde está uno) */
.cabecera .fila { padding-block: 8px; }
.cabecera .titulo small { display: none; }
.cabecera .titulo b { font-size: 17px; }
.barra .fila { padding-block: 6px; }
.marca small { display: none; }
.marca b { font-size: 17px; }
.tab, .secciones button { font-size: 13.5px; }
/* datos */
table { font-size: 13px; }
th { font-size: 10.5px; padding: 6px 10px; border-bottom-width: 1px; }
td { padding: 7px 10px; }
.campos dt, label.campo, .form label { font-size: 12px; }
.kpis { gap: 8px; }
.kpi { padding: 9px 12px; border-radius: 8px; }
.kpi span { font-size: 10.5px; letter-spacing: .07em; }
.kpi b { font-size: 21px; line-height: 1.15; }
.kpis.anchos .kpi b { font-size: 19px; }
.kpi small { font-size: 11.5px; }
/* indicadores en alerta: el color queda en el número y en una línea fina, sin fondo relleno */
.kpi.malo, .kpi.kpi-alerta { background: var(--panel); border-color: var(--line); box-shadow: inset 2px 0 0 var(--crit); }
.kpi.malo b, .kpi.malo span { color: var(--crit); }
/* chips: más pequeños, el color se mantiene */
.chip { font-size: 11.5px; padding: 2px 8px; font-weight: 600; gap: 3px; }
.chips { gap: 5px; }
/* alertas compactas: letra pequeña, conservan su color, sin bloque de color */
.alertas-cxp { gap: 2px; }
.alertas-cxp li { font-size: 12px; padding: 2px 0 2px 9px; background: none; border-left-width: 2px; border-radius: 0; line-height: 1.4; }
.alertas-cxp li.al-rojo { background: none; color: var(--crit); }
.alertas-cxp li.al-ambar { background: none; color: var(--warn); }
.alertas-cxp li.al-azul { background: none; color: var(--titulo, var(--fg)); }
.demo-aviso, .aviso-edicion { font-size: 12px; padding: 6px 12px; font-weight: 600; }
/* botones */
.btn { font-size: 13px; padding: 7px 12px; border-radius: 8px; }
.btn.chico { font-size: 12px; padding: 5px 10px; }
/* tarjetas de torre del Lobby */
.torre { border-left-width: 3px; gap: 10px; }
.torre .total { font-size: 22px; }
.leyenda { font-size: 12px; }
.feed li { font-size: 13px; }
/* campos de formulario más livianos (en el teléfono se quedan en 16 px para que no se acerque la pantalla al escribir) */
main input:not([type=checkbox]):not([type=radio]), main select, main textarea, .card input:not([type=checkbox]):not([type=radio]), .card select, .card textarea { font-size: 13px; padding: 6px 9px; }
@media (max-width: 640px) { main input:not([type=checkbox]):not([type=radio]), main select, main textarea, .card input:not([type=checkbox]):not([type=radio]), .card select, .card textarea { font-size: 16px; } }
@media print { .cabecera, .barra { display: none; } }
`;
  function estilo() {
    if (document.getElementById('sm-css')) return;
    const s = document.createElement('style'); s.id = 'sm-css'; s.textContent = CSS; document.head.appendChild(s);
    const m = document.createElement('style'); m.id = 'sm-minimal'; m.textContent = CSS_MINIMAL; (document.body || document.head).appendChild(m);
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
  // v2.8 · Las rutas internas de la Nómina (/empleados, /nominas…) se activan cuando se verifiquen contra nomina/web.py en la PC.
  // Mientras tanto, cada tema de Nómina abre la Nómina en su inicio (como en la v2.7.8): nada queda roto.
  const NOMINA_RUTAS_VERIFICADAS = true;   // verificadas el 28-oct-2026 en nomina/templates/base.html
  async function abrirNomina(ir) {
    try {
      const r = await api('sso_ticket');
      if (!r.url_nomina) throw new Error('La dirección de la Nómina no está configurada (URL_NOMINA en la pestaña Config).');
      location.href = r.url_nomina.replace(/\/$/, '') + '/sso?ticket=' + encodeURIComponent(r.ticket) + (ir ? '&ir=' + encodeURIComponent(ir) : '');
    } catch (err) { alert(err.message); }
  }

  // ¿Esta página es la de este enlace? Mismo archivo, mismo ?m= y el mismo tema (#hash).
  // En torres.html el hash es «#TORRE/seccion/pestaña»: se compara la sección (y la pestaña si el enlace la trae).
  function esActual(href) {
    let u; try { u = new URL(BASE + href, location.href); } catch (e) { return false; }
    const archivo = p => (p.replace(/\/index\.html$/, '/').split('/').pop() || 'portal/');
    const aquí = new URL(location.href);
    if (archivo(u.pathname) !== archivo(aquí.pathname)) return false;
    if ((u.searchParams.get('m') || '') !== (aquí.searchParams.get('m') || '')) return false;
    const h = x => decodeURIComponent((x || '').replace(/^#/, ''));
    if (/torres\.html$/.test(u.pathname)) {
      const [, sec, sub] = h(u.hash).split('/'), [, sec2] = h(aquí.hash).split('/');
      const actualSec = sec2 || paginaTorre.seccion, actualSub = paginaTorre.cxpTab;
      return !!sec && sec === actualSec && (!sub || sub === actualSub);
    }
    if (/admin\.html$/.test(u.pathname)) return h(u.hash) === (h(aquí.hash) || paginaAdmin.vista || '');
    return h(u.hash) === h(aquí.hash);
  }
  // Las páginas avisan qué sección o pestaña tienen abierta (para marcarla en el menú aunque el hash no la diga)
  const paginaTorre = { seccion: '', cxpTab: '' }, paginaAdmin = { vista: '' };
  function marcar(datos) { datos = datos || {}; Object.assign(paginaTorre, datos.torre || {}); Object.assign(paginaAdmin, datos.admin || {}); document.querySelectorAll('.sm-barra').forEach(b => b._pintar && b._pintar()); }

  // En la sala DEMO (?demo=1) los enlaces siguen en demostración
  const conDemo = href => { if (!/[?&]demo=1\b/.test(location.search) || /^portal\//.test(href)) return href; const [ruta, hash] = href.split('#'); return ruta + (ruta.includes('?') ? '&' : '?') + 'demo=1' + (hash !== undefined ? '#' + hash : ''); };
  const enlaceItem = it => it.url ? it.url : it.nomina !== undefined ? '#' : BASE + conDemo(it.href);
  const itemHtml = it => '<a href="' + esc(enlaceItem(it)) + '"' + (it.nomina !== undefined ? ' data-nomina="' + esc(it.nomina) + '"' : '') + (it.href && esActual(it.href) ? ' aria-current="page"' : '') +
    (it.url && esActualUrl(it.url) ? ' aria-current="page"' : '') + '>' + esc(it.t) + (it.nomina !== undefined && !EN_NOMINA ? ' <span aria-hidden="true">↗</span>' : '') + (it.d ? '<small>' + esc(it.d) + '</small>' : '') + '</a>';

  const esActualUrl = url => { try { const u = new URL(url, location.href); return u.origin === location.origin && u.pathname.replace(/\/$/, '') === location.pathname.replace(/\/$/, ''); } catch (e) { return false; } };
  // Temas de la Nómina leídos de su propio menú (solo dentro de la Nómina): rutas reales, sin adivinar
  let temasNomina = null, salirNomina = '', usuarioNomina = '';
  function pintar(cont, actual) {
    const c = leer(), a = c.modulos || {}, u = c.usuario || {};
    if (EN_NOMINA) return pintarEnNomina(cont, actual);
    // Con el servicio de antes de la v2.7 (sin las claves nuevas) se usa la clave vieja
    const ve = m => m.siempre || (a[m.ve] !== undefined ? !!a[m.ve] : m.viejo ? !!a[m.viejo] : m.k === 'demo' ? !!c.sesion : false);
    actual = DENTRO_DE[actual] || actual;
    const visibles = MODULOS.filter(m => (c.sesion && ve(m)) || m.k === 'inicio').map(m => Object.assign({}, m, {
      grupos: (m.grupos || []).map(g => ({ t: g.t, items: g.items.filter(it => c.sesion ? ve(it) : it.siempre) })).filter(g => g.items.length) }));
    const nav = cont.querySelector('.sm-nav');
    nav.innerHTML = visibles.map((m, i) => {
      const directo = m.href && !m.grupos.length;
      return '<div class="sm-mod' + (i >= visibles.length - 2 ? ' derecha' : '') + '">' +
        (directo ? '<a class="sm-mod-btn sin-menu" href="' + BASE + m.href + '" data-mod="' + m.k + '"' + (m.k === actual ? ' aria-current="page"' : '') + '>' + esc(m.t) + '</a>'
          : '<button type="button" class="sm-mod-btn" data-mod="' + m.k + '" aria-haspopup="true" aria-expanded="false"' + (m.k === actual ? ' aria-current="page"' : '') + '>' + esc(m.t) + '</button>' +
            '<div class="sm-panel" role="menu" aria-label="' + esc(m.t) + '" hidden>' + m.grupos.map(g => '<section class="sm-grupo"><h3>' + esc(g.t) + '</h3>' + g.items.map(itemHtml).join('') + '</section>').join('') + '</div>') +
        '</div>';
    }).join('');
    // Cajón para teléfonos y pantallas angostas: los mismos menús en acordeón
    const cajon = cont.querySelector('.sm-cajon');
    cajon.innerHTML = visibles.map(m => m.href && !m.grupos.length ? '<div class="sm-grupo" style="padding:8px 0"><a href="' + BASE + m.href + '">' + esc(m.t) + '</a></div>'
      : '<details' + (m.k === actual ? ' open' : '') + '><summary>' + esc(m.t) + '</summary>' + m.grupos.map(g => '<div class="sm-grupo"><h3>' + esc(g.t) + '</h3>' + g.items.map(itemHtml).join('') + '</div>').join('') + '</details>').join('');
    cont.querySelector('.sm-usuario').textContent = c.sesion && u.nombre ? u.nombre + ' · ' + (u.segmento_nombre || '') : '';
    cont.querySelector('.sm-salir').hidden = !c.sesion;
    // Ruta: Módulo › Categoría › Tema (dónde estoy)
    const ruta = cont.querySelector('.sm-ruta');
    const mod = visibles.find(m => m.k === actual);
    let grupo = null, item = null;
    if (mod) mod.grupos.some(g => g.items.some(it => { if (it.href && esActual(it.href)) { grupo = g; item = it; return true; } return false; }));
    ruta.hidden = !mod || !c.sesion || mod.k === 'demo';
    ruta.firstChild.innerHTML = mod ? '<span>' + esc(mod.t) + '</span>' + (grupo ? '<span>' + esc(grupo.t) + '</span><span><b>' + esc(item.t) + '</b></span>' : '') : '';
  }

  // Dentro de la Nómina no hay sesión del Portal en este navegador: se muestran todos los módulos (cada página revisa los permisos al abrir).
  function pintarEnNomina(cont, actual) {
    const mods = MODULOS.filter(m => m.k !== 'demo').map(m => {
      if (m.k !== 'personal' || !temasNomina || !temasNomina.length) return Object.assign({}, m, { grupos: m.grupos.map(g => ({ t: g.t, items: g.items.filter(it => !it.nomina) })).filter(g => g.items.length) });
      const otros = m.grupos.map(g => ({ t: g.t, items: g.items.filter(it => !it.nomina) })).filter(g => g.items.length);
      return Object.assign({}, m, { grupos: temasNomina.concat(otros) });
    });
    const nav = cont.querySelector('.sm-nav');
    nav.innerHTML = mods.map((m, i) => '<div class="sm-mod' + (i >= mods.length - 2 ? ' derecha' : '') + '"><button type="button" class="sm-mod-btn" data-mod="' + m.k + '" aria-haspopup="true" aria-expanded="false"' + (m.k === 'personal' ? ' aria-current="page"' : '') + '>' + esc(m.t) + '</button>' +
      '<div class="sm-panel" role="menu" aria-label="' + esc(m.t) + '" hidden>' + m.grupos.map(g => '<section class="sm-grupo"><h3>' + esc(g.t) + '</h3>' + g.items.map(itemHtml).join('') + '</section>').join('') + '</div></div>').join('');
    cont.querySelector('.sm-cajon').innerHTML = mods.map(m => '<details' + (m.k === 'personal' ? ' open' : '') + '><summary>' + esc(m.t) + '</summary>' + m.grupos.map(g => '<div class="sm-grupo"><h3>' + esc(g.t) + '</h3>' + g.items.map(itemHtml).join('') + '</div>').join('') + '</details>').join('');
    cont.querySelector('.sm-salir').hidden = !salirNomina;
    cont.querySelector('.sm-usuario').textContent = usuarioNomina;
    const ruta = cont.querySelector('.sm-ruta'), per = mods.find(m => m.k === 'personal');
    let g0 = null, i0 = null; (per ? per.grupos : []).some(g => g.items.some(it => { if (it.url && esActualUrl(it.url)) { g0 = g; i0 = it; return true; } return false; }));
    ruta.hidden = false;
    ruta.firstChild.innerHTML = '<span>Personal</span>' + (g0 ? '<span>' + esc(g0.t) + '</span><span><b>' + esc(i0.t) + '</b></span>' : '<span><b>Nómina</b></span>');
  }
  /** Lee el menú viejo de la Nómina (grupos y enlaces), lo quita de la pantalla y deja el contenido a todo el ancho. */
  function absorberMenuNomina() {
    const enlaces = Array.from(document.querySelectorAll('aside a[href], nav a[href], .sidebar a[href], .lateral a[href], .menu a[href]')).filter(a => !a.closest('.sm-barra'));
    const caja = enlaces.length ? enlaces.reduce((acc, a) => { let el = a.parentElement; while (el && el !== document.body && !el.contains(acc)) el = el.parentElement; return el || acc; }, enlaces[0].parentElement) : null;
    let lateral = document.querySelector('aside, .sidebar, .lateral');
    if (!lateral && caja) { lateral = caja; while (lateral.parentElement && lateral.parentElement !== document.body && lateral.parentElement.children.length === 1) lateral = lateral.parentElement; }
    if (!lateral) return;
    // Su «Salir» y el nombre del usuario pasan a la barra de arriba
    const sal = lateral.querySelector('a[href*="logout"], a[href*="salir"]');
    if (sal) { salirNomina = sal.href; const prev = sal.previousElementSibling; if (prev && !prev.querySelector('a')) usuarioNomina = prev.textContent.replace(/\s+/g, ' ').trim(); }
    const grupos = []; let g = null;
    const titulo = el => /^(h\d|p|div|span|small|li|strong|b)$/i.test(el.tagName) && !el.querySelector('a') && !el.closest('a') && el.textContent.trim().length > 2 && el.textContent.trim().length < 40 && el.children.length === 0;
    lateral.querySelectorAll('*').forEach(el => {
      if (el.tagName === 'A' && el.getAttribute('href') && !/^#/.test(el.getAttribute('href'))) {
        const t = el.textContent.replace(/[←↗]/g, '').trim(); if (!t) return;
        if (!g) { g = { t: 'Nómina', items: [] }; grupos.push(g); }
        g.items.push({ t, url: el.href });
      } else if (titulo(el)) {
        const t = el.textContent.trim();
        if (/stili soft|nómina y rrhh|^stili/i.test(t)) { if (grupos.some(x => x.items.length)) { g = { t: 'fuera', items: [] }; grupos.push(g); } return; }   // el logo de arriba no corta; la sección «Stili Soft» de abajo sí
        if (g && g.t === 'fuera') return;   // después de «Stili Soft» solo viene el usuario y Salir: ya están en la barra
        g = { t: t.charAt(0) + t.slice(1).toLowerCase(), items: [] }; grupos.push(g);
      }
    });
    // Lo que lleva de vuelta al Portal (Inicio del Portal, Torres, Lobby…) ya está en la barra de arriba
    // «Inicio» de la Nómina (antes de la primera sección) va al comienzo del primer grupo
    if (grupos.length > 1 && grupos[0].t === 'Nómina') { const ini = grupos.shift(); grupos[0].items = ini.items.map(it => Object.assign(it, { t: /^inicio$/i.test(it.t) ? 'Inicio de la Nómina' : it.t })).concat(grupos[0].items); }
    temasNomina = grupos.filter(x => x.t !== 'fuera' && x.items.length).map(x => ({ t: 'Nómina · ' + x.t.replace(/^Nómina · /, ''), items: x.items.filter(it => !/portal|github\.io/i.test(it.url) && !/inicio del portal/i.test(it.t)) })).filter(x => x.items.length);
    // Quitar el menú viejo y devolver su espacio al contenido
    const ancho = lateral.getBoundingClientRect().width;
    lateral.style.display = 'none';
    const padre = lateral.parentElement;
    if (padre && /grid/.test(getComputedStyle(padre).display)) { padre.style.gridTemplateColumns = 'minmax(0, 1fr)'; padre.style.gridTemplateAreas = 'none'; }
    [document.body].concat(Array.from(document.body.children), padre ? Array.from(padre.children) : []).forEach(el => {
      const cs = getComputedStyle(el);
      if (ancho > 80 && Math.abs(parseFloat(cs.marginLeft) - ancho) < 40) el.style.marginLeft = '0';
      if (ancho > 80 && Math.abs(parseFloat(cs.paddingLeft) - ancho) < 40) el.style.paddingLeft = '0';
    });
  }
  function arrancarEnNomina() {
    const ir = () => { absorberMenuNomina(); montar(document.body, 'personal'); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ir); else ir();
  }

  function cerrarMenus(excepto) {
    document.querySelectorAll('.sm-mod-btn[aria-expanded="true"]').forEach(b => { if (b !== excepto) { b.setAttribute('aria-expanded', 'false'); b.nextElementSibling.hidden = true; } });
  }
  function abrirMenu(btn, enfocar) {
    cerrarMenus(btn);
    const panel = btn.nextElementSibling, abierto = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', String(!abierto)); panel.hidden = abierto;
    if (!abierto) {
      // que el panel no se salga de la pantalla
      panel.style.left = ''; panel.style.right = '';
      const r = panel.getBoundingClientRect();
      if (r.right > innerWidth - 8) { panel.style.left = 'auto'; panel.style.right = '0'; }
      if (panel.getBoundingClientRect().left < 8) { panel.style.right = 'auto'; panel.style.left = (8 - btn.parentElement.getBoundingClientRect().left) + 'px'; }
      if (enfocar) { const a = panel.querySelector('a'); if (a) a.focus(); }
    }
  }

  /** Monta la barra en `donde` (al inicio) y la mantiene al día con la sesión. */
  function montar(donde, actual) {
    estilo();
    const cont = document.createElement('div'); cont.className = 'sm-barra'; cont.setAttribute('role', 'navigation'); cont.setAttribute('aria-label', 'Módulos de Stili');
    cont.innerHTML = '<div class="sm-fila"><a class="sm-logo" href="' + BASE + 'portal/"><img src="' + BASE + 'portal/icono-192.png" alt=""><b>STILI SOFT</b></a>' +
      '<nav class="sm-nav"></nav><button type="button" class="sm-menu-btn" aria-expanded="false">☰ Menú</button><span class="sm-usuario"></span><button type="button" class="sm-tema" title="Cambiar el tema de la pantalla"></button><button type="button" class="sm-salir" hidden>Salir</button></div>' +
      '<div class="sm-cajon" hidden></div><div class="sm-ruta" hidden><div></div></div>';
    donde.insertBefore(cont, donde.firstChild);
    const TEMAS = { claro: ['☀', 'Tema claro'], oscuro: ['☾', 'Tema oscuro'], auto: ['◐', 'Tema automático (como el equipo)'] }, ORDEN = ['claro', 'oscuro', 'auto'];
    const bt = cont.querySelector('.sm-tema');
    const pintarTema = () => { let x = 'claro'; try { x = localStorage.getItem('stili-tema') || 'claro'; } catch (e) { /* nada */ } bt.textContent = TEMAS[x][0]; bt.setAttribute('aria-label', TEMAS[x][1]); bt.title = TEMAS[x][1] + ' · clic para cambiar'; };
    bt.addEventListener('click', () => {
      let x = 'claro'; try { x = localStorage.getItem('stili-tema') || 'claro'; } catch (e) { /* nada */ }
      x = ORDEN[(ORDEN.indexOf(x) + 1) % ORDEN.length];
      try { localStorage.setItem('stili-tema', x); } catch (e) { /* nada */ }
      if (x === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', x === 'oscuro' ? 'dark' : 'light');
      pintarTema();
    });
    pintarTema();
    cont.querySelector('.sm-salir').addEventListener('click', () => { if (EN_NOMINA) { location.href = salirNomina || '/logout'; return; } guardar({ sesion: '', modulos: {}, usuario: {} }); location.href = BASE + 'portal/'; });
    // Menús: clic (o Enter / flecha abajo) abre; Escape o clic afuera cierra; con el ratón, pasar de un módulo a otro cambia de menú
    const nav = cont.querySelector('.sm-nav'), cajon = cont.querySelector('.sm-cajon'), mb = cont.querySelector('.sm-menu-btn');
    nav.addEventListener('click', e => { const b = e.target.closest('button.sm-mod-btn'); if (!b) return; e.stopPropagation();
      if (b.getAttribute('aria-expanded') === 'true' && Date.now() - (b._porRaton || 0) < 600) return;   // se acaba de abrir al pasar el ratón: el clic no lo cierra
      abrirMenu(b, e.detail === 0); });
    nav.addEventListener('mouseover', e => { const b = e.target.closest('button.sm-mod-btn'); if (b && nav.querySelector('.sm-mod-btn[aria-expanded="true"]') && b.getAttribute('aria-expanded') !== 'true') { abrirMenu(b); b._porRaton = Date.now(); } });
    nav.addEventListener('keydown', e => {
      const b = e.target.closest('.sm-mod-btn'), enPanel = e.target.closest('.sm-panel');
      if (b && e.key === 'ArrowDown' && b.tagName === 'BUTTON') { e.preventDefault(); if (b.getAttribute('aria-expanded') !== 'true') abrirMenu(b, true); else { const a = b.nextElementSibling.querySelector('a'); if (a) a.focus(); } }
      if (b && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { const bs = Array.from(nav.querySelectorAll('.sm-mod-btn')); const n = bs[(bs.indexOf(b) + (e.key === 'ArrowRight' ? 1 : bs.length - 1)) % bs.length]; n.focus(); }
      if (enPanel && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); const as = Array.from(enPanel.querySelectorAll('a')); const i = as.indexOf(document.activeElement); const n = as[(i + (e.key === 'ArrowDown' ? 1 : as.length - 1)) % as.length]; if (n) n.focus(); }
      if (e.key === 'Escape') { const abierto = nav.querySelector('.sm-mod-btn[aria-expanded="true"]'); cerrarMenus(); if (abierto) abierto.focus(); }
    });
    document.addEventListener('click', e => { if (!nav.contains(e.target)) cerrarMenus(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { cerrarMenus(); if (!cajon.hidden) { cajon.hidden = true; mb.setAttribute('aria-expanded', 'false'); } } });
    mb.addEventListener('click', () => { cajon.hidden = !cajon.hidden; mb.setAttribute('aria-expanded', String(!cajon.hidden)); });
    // Los temas de la Nómina se abren en la misma ventana con un boleto de un solo uso
    cont.addEventListener('click', e => { const a = e.target.closest('a[data-nomina]'); if (!a) return; e.preventDefault(); cerrarMenus(); abrirNomina(NOMINA_RUTAS_VERIFICADAS ? a.dataset.nomina : ''); });
    // Al elegir un tema de esta misma página solo cambia el #hash: se cierra el menú y la página cambia de sección sola
    cont.addEventListener('click', e => { const a = e.target.closest('.sm-panel a, .sm-cajon a'); if (a && !a.dataset.nomina) { cerrarMenus(); cajon.hidden = true; mb.setAttribute('aria-expanded', 'false'); } });
    cont._pintar = () => pintar(cont, actual);
    pintar(cont, actual);
    if (!EN_NOMINA) StiliModulos.refrescar().then(() => pintar(cont, actual)).catch(() => {});
    window.addEventListener('storage', e => { if (e.key === LS) pintar(cont, actual); });
    window.addEventListener('hashchange', () => pintar(cont, actual));
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

  window.StiliModulos = { montar, mas, refrescar, api, abrirNomina, leer, guardar, visor, marcar, BASE, MODULOS, VERSION: VERSION_BARRA };
  if (EN_NOMINA) arrancarEnNomina();
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
  s.src = actual ? actual.replace(/stili-modulos\.js.*$/, 'stili-proteccion.js?v=3.0') : 'stili-proteccion.js?v=3.0';
  (document.head || document.documentElement).appendChild(s);
})();
