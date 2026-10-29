/**
 * Stili Soft v3.0 · Contabilidad de las torres (lado del servicio).
 *
 * Archivo nuevo del proyecto de Apps Script «Servicio Stili», junto a Código.gs. Se registra solo al cargar
 * (HOJAS, ACCIONES_CENTRAL, ACCESO_ACCION, SECCIONES): no hay que tocar Código.gs.
 * Después de pegarlo: ejecutar instalar() una vez (crea las hojas Ctb_*) e implementar una versión nueva.
 *
 * Reglas que se cumplen aquí, aunque la página falle:
 *  - Nada se borra: recibos, cobros, gastos e ingresos se ANULAN con motivo (hoja Ctb_Anulaciones).
 *  - Cada cambio queda en Ctb_Auditoria con el valor anterior y el nuevo.
 *  - Un mes cerrado no acepta movimientos; solo el Gerente General lo reabre, con motivo.
 *  - Un cobro no puede aplicar más que el saldo de cada recibo.
 *  - Un pago por encima del umbral de la Junta no se aprueba ni se paga sin la aprobación de la Junta.
 *
 * Usa de Código.gs: leer_, leerSiExiste_, agregar_, actualizar_, config_, registrar_, s_, esNo_, error_, ahora_, aleatorio_, idNuevo_,
 * exigirTorre_, torresActivas_, mismaTorre_, igualTorre_, enAlcance_, TZ, LARGO_COLUMNA, HOJAS, ACCIONES_CENTRAL, ACCESO_ACCION, SECCIONES, SECCIONES_TORRES.
 * Usa de opiniones.gs (v2.8): torrePorCodigoOpinion_ (el mismo código QR de la torre sirve para notificar pagos).
 */

const CTB_TABLAS = {
  rubros: ['Ctb_Rubros', ['id', 'torre', 'codigo', 'nombre', 'tipo', 'padre', 'activo', 'orden']],
  config: ['Ctb_Config', ['id', 'torre', 'clave', 'valor']],
  parametros: ['Ctb_Parametros', ['id', 'torre', 'nombre', 'tipo', 'valores', 'estado']],
  conceptos: ['Ctb_Conceptos', ['id', 'torre', 'periodo', 'nombre', 'rubro', 'reparto', 'tipo', 'monto', 'parametro', 'precio', 'montos', 'lecturas', 'estado', 'creado_por', 'creado_en', 'clase']],
  recibos: ['Ctb_Recibos', ['id', 'torre', 'numero', 'periodo', 'apartamento', 'emision', 'vence', 'tipo', 'lineas', 'total', 'ncf', 'estado', 'enviado_en', 'creado_por', 'creado_en', 'anulado_por', 'anulado_en', 'motivo']],
  cobros: ['Ctb_Cobros', ['id', 'torre', 'fecha', 'apartamento', 'monto', 'forma', 'cuenta_id', 'referencia', 'origen', 'origen_id', 'aplicaciones', 'descuento', 'a_favor', 'estado', 'creado_por', 'creado_en', 'anulado_por', 'anulado_en', 'motivo']],
  notificados: ['Ctb_Notificados', ['id', 'torre', 'fecha', 'fecha_aviso', 'apartamento', 'monto', 'banco', 'referencia', 'nombre', 'comprobante_url', 'canal', 'estado', 'motivo', 'cobro_id', 'revisado_por', 'revisado_en', 'destino', 'chat_id', 'ia', 'anunciado_en']],
  sin_identificar: ['Ctb_SinIdentificar', ['id', 'torre', 'fecha', 'monto', 'cuenta_id', 'referencia', 'descripcion', 'estado', 'cobro_id', 'creado_por', 'creado_en', 'anulado_por', 'anulado_en', 'motivo']],
  ingresos: ['Ctb_Ingresos', ['id', 'torre', 'fecha', 'rubro', 'monto', 'cuenta_id', 'detalle', 'referencia', 'estado', 'creado_por', 'creado_en', 'anulado_por', 'anulado_en', 'motivo']],
  gastos: ['Ctb_Gastos', ['id', 'torre', 'tipo', 'fecha', 'cuenta_id', 'destino_id', 'rubro', 'monto', 'detalle', 'cheque', 'comprobante_url', 'estado', 'creado_por', 'creado_en', 'anulado_por', 'anulado_en', 'motivo']],
  cuentas: ['Ctb_Cuentas', ['id', 'torre', 'nombre', 'banco', 'numero', 'tipo', 'saldo_inicial', 'fecha_inicial', 'tope', 'activa']],
  extracto: ['Ctb_Extracto', ['id', 'torre', 'cuenta_id', 'fecha', 'descripcion', 'referencia', 'monto', 'carga', 'estado', 'conciliacion_id']],
  conciliaciones: ['Ctb_Conciliaciones', ['id', 'torre', 'cuenta_id', 'periodo', 'saldo_banco', 'saldo_libros', 'transito', 'no_cobrados', 'claves', 'extracto_ids', 'estado', 'creado_por', 'creado_en', 'anulado_por', 'anulado_en', 'motivo']],
  cierres: ['Ctb_Cierres', ['id', 'torre', 'periodo', 'estado', 'archivos', 'por', 'en', 'motivo']],
  gestiones: ['Ctb_Gestiones', ['id', 'torre', 'fecha', 'apartamento', 'tipo', 'nota', 'proxima', 'creado_por', 'creado_en', 'estado',
    'canal', 'direccion', 'resultado', 'duracion_seg', 'promesa_fecha', 'promesa_monto', 'mensaje_id', 'encuesta_id', 'anunciado_en']],   // v3.2 · seguimiento de cobranza
  acuerdos: ['Ctb_Acuerdos', ['id', 'torre', 'fecha', 'apartamento', 'total', 'cuotas', 'nota', 'estado', 'creado_por', 'creado_en', 'anulado_por', 'anulado_en', 'motivo']],
  presupuesto: ['Ctb_Presupuesto', ['id', 'torre', 'anio', 'rubro', 'monto']],
  cxp_rubro: ['Ctb_CxpRubro', ['id', 'torre', 'cxp_id', 'rubro', 'cuenta_id']],
  aprobaciones: ['Ctb_Aprobaciones', ['id', 'torre', 'cxp_id', 'suplidor', 'monto', 'concepto', 'token', 'estado', 'pedida_por', 'pedida_en', 'decidida_por', 'decidida_en', 'nota']],
  anulaciones: ['Ctb_Anulaciones', ['fecha', 'torre', 'tabla', 'registro', 'detalle', 'monto', 'motivo', 'usuario']],
  auditoria: ['Ctb_Auditoria', ['fecha', 'torre', 'usuario', 'accion', 'tabla', 'registro', 'antes', 'despues']],
};
const CTB_JSON = ['valores', 'montos', 'lecturas', 'lineas', 'aplicaciones', 'cuotas', 'claves', 'extracto_ids', 'archivos', 'destino', 'ia'];
// Qué se puede hacer con cada tabla desde ctb_guardar (lo demás tiene su propia acción con sus reglas)
const CTB_CREAR = ['rubros', 'parametros', 'conceptos', 'sin_identificar', 'ingresos', 'gastos', 'cuentas', 'acuerdos', 'presupuesto', 'cxp_rubro'];   // v3.2 · las gestiones van por ctb_gestion (cobros.gs)
const CTB_EDITAR = ['rubros', 'parametros', 'conceptos', 'cuentas', 'presupuesto', 'cxp_rubro'];
const CTB_ANULAR = ['recibos', 'cobros', 'sin_identificar', 'ingresos', 'gastos', 'acuerdos', 'conciliaciones', 'conceptos'];
// El campo de fecha que decide si el movimiento cae en un mes cerrado
const CTB_FECHA = { recibos: 'emision', cobros: 'fecha', sin_identificar: 'fecha', ingresos: 'fecha', gastos: 'fecha', conceptos: 'periodo', conciliaciones: 'periodo', acuerdos: 'fecha' };
const CTB_CONFIG_CLAVES = ['vence_dia', 'pp_porcentaje', 'pp_dia', 'mora_tipo', 'mora_valor', 'mora_dias_gracia', 'serie_prefijo', 'serie_siguiente', 'umbral_junta', 'junta_nombre', 'junta_contacto',
  'honorario_monto', 'honorario_dia', 'colchon_caja', 'pasarela_url', 'cuenta_pasarela', 'fondo_reserva_pct', 'recordar_antes', 'recordar_despues',
  'orden_clases', 'mora_clases', 'encuesta_dias', 'recibo_auto', 'banco_cuenta_texto'];   // v3.2
const CTB_TOPE = 20000; // filas por tabla y torre que se envían a la página (protege la respuesta)

// ------------------------------------------------------------------ ayudantes
function ctbHoja_(t) { return CTB_TABLAS[t][0]; }
function ctbIso_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  return s_(v);
}
function ctbNum_(v) { const n = Number(String(v === undefined || v === null ? '' : v).replace(/,/g, '')); return isFinite(n) ? Math.round(n * 100) / 100 : 0; }
function ctbFila_(t, r) {
  const o = {};
  CTB_TABLAS[t][1].forEach(k => {
    let v = r[k];
    if (CTB_JSON.indexOf(k) >= 0) { try { v = s_(v) ? JSON.parse(s_(v)) : (['aplicaciones', 'lineas', 'cuotas', 'claves', 'extracto_ids', 'destino'].indexOf(k) >= 0 ? [] : {}); } catch (e) { v = null; } }
    else if (v instanceof Date) v = /(_en|^en)$/.test(k) ? Utilities.formatDate(v, TZ, "yyyy-MM-dd'T'HH:mm") : ctbIso_(v);
    else if (['monto', 'total', 'descuento', 'a_favor', 'saldo_inicial', 'tope', 'precio', 'saldo_banco', 'saldo_libros', 'transito', 'no_cobrados'].indexOf(k) >= 0) v = v === '' ? '' : ctbNum_(v);
    else v = v === undefined ? '' : (typeof v === 'number' ? v : s_(v));
    o[k] = v;
  });
  o._fila = r._fila;
  return o;
}
function ctbLeer_(t, torre) {
  const h = ctbHoja_(t);
  const filas = (typeof leerSiExiste_ === 'function' ? leerSiExiste_(h) : leer_(h).filas) || [];
  return filas.filter(r => !torre || mismaTorre_(r.torre, torre)).map(r => ctbFila_(t, r));
}
function ctbCelda_(k, v) { return CTB_JSON.indexOf(k) >= 0 ? JSON.stringify(v === undefined ? null : v) : v; }
function ctbAgregar_(t, obj) {
  const fila = {};
  CTB_TABLAS[t][1].forEach(k => { if (obj[k] !== undefined) fila[k] = ctbCelda_(k, obj[k]); });
  agregar_(ctbHoja_(t), fila);
}
function ctbActualizar_(t, fila, cambios) {
  const c = {};
  Object.keys(cambios).forEach(k => { if (CTB_TABLAS[t][1].indexOf(k) >= 0) c[k] = ctbCelda_(k, cambios[k]); });
  actualizar_(ctbHoja_(t), fila, c);
}
function ctbAuditar_(torre, admin, accion, t, id, antes, despues) {
  try {
    const limpio = o => { if (!o) return ''; const x = Object.assign({}, o); delete x._fila; return JSON.stringify(x).slice(0, 2000); };
    agregar_(ctbHoja_('auditoria'), { fecha: ahora_(), torre: torre, usuario: admin ? admin.nombre : 'sistema', accion: accion, tabla: t, registro: s_(id), antes: limpio(antes), despues: limpio(despues) });
  } catch (e) { /* la auditoría nunca detiene una operación */ }
}
function ctbCerrado_(torre, periodo) {
  return ctbLeer_('cierres', torre).some(k => k.periodo === s_(periodo).slice(0, 7) && k.estado === 'cerrado');
}
function ctbExigirAbierto_(torre, fecha) {
  const per = s_(fecha).slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(per) && ctbCerrado_(torre, per)) throw error_('El mes ' + per + ' de ' + torre + ' está cerrado. Solo el Gerente General puede reabrirlo.', 'MES_CERRADO');
}
function ctbConfig_(torre) {
  const out = {};
  ctbLeer_('config', torre).forEach(r => { out[r.clave] = r.valor; });
  return out;
}
function ctbFijarConfig_(torre, clave, valor, admin) {
  const f = ctbLeer_('config', torre).find(r => r.clave === clave);
  if (f) { ctbActualizar_('config', f._fila, { valor: valor }); ctbAuditar_(torre, admin, 'editar', 'config', clave, { valor: f.valor }, { valor: valor }); }
  else { ctbAgregar_('config', { id: idNuevo_('CFG'), torre: torre, clave: clave, valor: valor }); ctbAuditar_(torre, admin, 'crear', 'config', clave, null, { valor: valor }); }
}
function ctbFechaOk_(f) { const t = s_(f); return /^\d{4}-\d{2}-\d{2}$/.test(t) && !isNaN(Date.parse(t + 'T12:00:00')) && new Date(t + 'T12:00:00').toISOString().slice(0, 10) === t; }
function ctbExigirFecha_(f, nombre) { if (!ctbFechaOk_(f)) throw error_('La ' + (nombre || 'fecha') + ' no es válida (use el calendario).'); }
function ctbConLock_(fn) { const l = LockService.getScriptLock(); l.waitLock(30000); try { return fn(); } finally { l.releaseLock(); } }
/** Datos de la torre en el formato de la librería stili-contabilidad (archivo stili-contabilidad.gs). */
function ctbDatosLib_(torre) {
  const d = {}; ['cuentas', 'recibos', 'cobros', 'sin_identificar', 'ingresos', 'gastos', 'conciliaciones', 'cierres'].forEach(k => { d[k] = ctbLeer_(k, torre); });
  d.pagos = ctbPagos_(torre); d.config = ctbConfig_(torre);
  return d;
}
function ctbLib_() { if (typeof StiliContab === 'undefined') throw error_('Falta el archivo stili-contabilidad.gs en el servicio.'); return StiliContab; }
function ctbPuedeCerrar_(admin) { return admin.gerente || admin.segmento === 'contabilidad'; }
function ctbIgualCent_(a, b) { return Math.round(Number(a) * 100) === Math.round(Number(b) * 100); }

/** Lo aplicado a cada recibo (cobros activos). */
function ctbAplicado_(cobros) {
  const ap = {};
  cobros.filter(k => k.estado !== 'anulado').forEach(k => (k.aplicaciones || []).forEach(x => {
    ap[x.recibo_id] = (ap[x.recibo_id] || 0) + Math.round(Number(x.monto || 0) * 100) + Math.round(Number(x.descuento || 0) * 100);
  }));
  return ap;
}

/** Cuentas por pagar de la torre (hoja de la v2.6+), con su rubro y cuenta de Contabilidad. */
function ctbPagos_(torre) {
  let filas = [];
  try { filas = (typeof leerSiExiste_ === 'function' ? leerSiExiste_('CxP_Partidas') : leer_('CxP_Partidas').filas) || []; } catch (e) { return []; }
  const mapa = {}; ctbLeer_('cxp_rubro', torre).forEach(m => { mapa[m.cxp_id] = m; });
  const ap = {}; ctbLeer_('aprobaciones', torre).forEach(a => { ap[a.cxp_id] = a; });
  return filas.filter(r => mismaTorre_(r.torre, torre)).map(r => {
    const id = s_(r.id), m = mapa[id] || {};
    return { id: id, suplidor: s_(r.suplidor || r.beneficiario || r.proveedor), concepto: s_(r.concepto || r.descripcion || r.detalle), monto: ctbNum_(r.monto),
      estado: s_(r.estado).toLowerCase(), fecha: ctbIso_(r.fecha_factura || r.fecha || r.creada_en || r.creado_en).slice(0, 10), periodo: s_(r.periodo),
      pagado_en: ctbIso_(r.pagado_en).slice(0, 10), cheque: s_(r.cheque || r.numero_cheque || ''), rubro: s_(m.rubro), cuenta_id: s_(m.cuenta_id),
      junta: ap[id] ? ap[id].estado : '' };
  });
}

// ------------------------------------------------------------------ lectura
function accionCtbDatos_(req, admin) {
  const t = exigirTorre_(admin, req.torre), torre = t.torre;
  const out = { torre: torre, hoy: Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'), config: ctbConfig_(torre),
    puede_editar: admin.gerente || (admin.permisos.tor_contabilidad || 0) >= 3, puede_cerrar: ctbPuedeCerrar_(admin), gerente: !!admin.gerente };
  ['rubros', 'parametros', 'conceptos', 'recibos', 'cobros', 'notificados', 'sin_identificar', 'ingresos', 'gastos', 'cuentas', 'extracto', 'conciliaciones', 'cierres', 'gestiones', 'acuerdos', 'presupuesto', 'aprobaciones']
    .forEach(k => { out[k] = ctbLeer_(k, torre).slice(-CTB_TOPE).map(r => { delete r._fila; return r; }); });
  // Los nombres del residente que notificó solo con nivel «profundizar»
  if (!admin.gerente && (admin.permisos.tor_contabilidad || 0) < 2) out.notificados.forEach(n => { n.nombre = ''; });
  out.notificados.forEach(n => { delete n.chat_id; delete n.ia; });   // v3.2 · el chat del residente no sale del servicio
  out.aprobaciones.forEach(a => { delete a.token; });
  // Control: lo anulado y la auditoría (la auditoría con nivel «profundizar»)
  out.anulaciones = ((typeof leerSiExiste_ === 'function' ? leerSiExiste_(ctbHoja_('anulaciones')) : []) || []).filter(r => mismaTorre_(r.torre, torre)).slice(-300)
    .map(r => ({ fecha: r.fecha instanceof Date ? Utilities.formatDate(r.fecha, TZ, 'yyyy-MM-dd HH:mm') : s_(r.fecha), tabla: s_(r.tabla), registro: s_(r.registro), detalle: s_(r.detalle), monto: r.monto, motivo: s_(r.motivo), usuario: s_(r.usuario) }));
  out.auditoria = admin.gerente || (admin.permisos.tor_contabilidad || 0) >= 2 ? ((typeof leerSiExiste_ === 'function' ? leerSiExiste_(ctbHoja_('auditoria')) : []) || []).filter(r => mismaTorre_(r.torre, torre)).slice(-300)
    .map(r => ({ fecha: r.fecha instanceof Date ? Utilities.formatDate(r.fecha, TZ, 'yyyy-MM-dd HH:mm') : s_(r.fecha), usuario: s_(r.usuario), accion: s_(r.accion), tabla: s_(r.tabla), registro: s_(r.registro), antes: s_(r.antes).slice(0, 600), despues: s_(r.despues).slice(0, 600) })) : [];
  out.pagos = ctbPagos_(torre);
  out.codigo_qr = typeof codigoOpinionDe_ === 'function' ? codigoOpinionDe_(torre) : '';
  out.ia = !!PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  out.aptos = leer_('Apartamentos').filas.filter(a => mismaTorre_(a.torre, torre) && !esNo_(a.activo)).map(a => s_(a.apartamento).toUpperCase())
    .filter((v, i, l) => v && l.indexOf(v) === i).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  if (typeof cobDatos_ === 'function') Object.assign(out, cobDatos_(torre, admin));   // v3.2 · contactos, mensajes, encuestas y bot (cobros.gs)
  return out;
}

// ------------------------------------------------------------------ escritura genérica
function accionCtbGuardar_(req, admin) {
  const t = exigirTorre_(admin, req.torre), torre = t.torre, tabla = s_(req.tabla), op = s_(req.operacion), d = req.datos || {};
  if (!CTB_TABLAS[tabla]) throw error_('Tabla no válida.');
  if (tabla === 'config') {
    const cambios = {};
    Object.keys(d).forEach(k => { if (CTB_CONFIG_CLAVES.indexOf(k) >= 0) cambios[k] = d[k]; });
    if (cambios.mora_tipo && ['ninguna', 'porcentaje', 'fijo'].indexOf(s_(cambios.mora_tipo)) < 0) throw error_('Tipo de mora no válido.');
    if (cambios.serie_siguiente !== undefined && Number(cambios.serie_siguiente) < (Number(ctbConfig_(torre).serie_siguiente) || 1)) throw error_('El próximo número de recibo no puede bajar (se repetirían números).');
    ['pp_porcentaje', 'mora_valor', 'umbral_junta', 'honorario_monto', 'colchon_caja', 'fondo_reserva_pct'].forEach(k => { if (cambios[k] !== undefined && (isNaN(Number(cambios[k])) || Number(cambios[k]) < 0)) throw error_('Revise el valor de ' + k + '.'); });
    Object.keys(cambios).forEach(k => ctbFijarConfig_(torre, k, s_(cambios[k]).slice(0, 300), admin));
    return accionCtbDatos_(req, admin);
  }
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    if (op === 'catalogo') {
      // Precarga el catálogo de rubros de una sola vez (la lista viene de stili-contabilidad.js)
      if (tabla !== 'rubros') throw error_('Operación no válida.');
      if (ctbLeer_('rubros', torre).length) throw error_('Esta torre ya tiene su catálogo de rubros.');
      (req.lista || []).slice(0, 300).forEach((r, i) => {
        const cod = s_(r.codigo).slice(0, 12); if (!/^[IE]\d+(\.\d+)?$/.test(cod)) return;
        ctbAgregar_('rubros', { id: idNuevo_('RUB') + '-' + i, torre: torre, codigo: cod, nombre: s_(r.nombre).slice(0, 80), tipo: s_(r.tipo) === 'egreso' ? 'egreso' : 'ingreso', padre: s_(r.padre).slice(0, 12), activo: 'si', orden: i + 1 });
      });
      ctbAuditar_(torre, admin, 'crear', 'rubros', 'catalogo', null, { cantidad: (req.lista || []).length });
    } else if (op === 'crear') {
      if (CTB_CREAR.indexOf(tabla) < 0) throw error_('Eso se registra desde su propia pantalla.');
      const campo = CTB_FECHA[tabla];
      if (campo === 'periodo') { if (!/^\d{4}-\d{2}$/.test(s_(d.periodo))) throw error_('Elija el mes.'); }
      else if (campo) ctbExigirFecha_(d[campo]);
      if (tabla === 'cuentas') ctbExigirFecha_(d.fecha_inicial, 'fecha del saldo inicial');
      if (tabla === 'gestiones' && s_(d.proxima)) ctbExigirFecha_(d.proxima, 'próxima gestión');
      if (tabla === 'acuerdos') (d.cuotas || []).forEach(q => { ctbExigirFecha_(q.vence, 'fecha de una cuota'); if (!(ctbNum_(q.monto) > 0)) throw error_('Las cuotas del acuerdo deben ser mayores que cero.'); });
      if (campo) ctbExigirAbierto_(torre, d[campo]);
      const obj = Object.assign({}, d, { id: idNuevo_('CTB'), torre: torre, estado: d.estado || (tabla === 'sin_identificar' ? 'pendiente' : tabla === 'acuerdos' ? 'vigente' : 'activo') });
      if (CTB_TABLAS[tabla][1].indexOf('creado_por') >= 0) { obj.creado_por = admin.nombre; obj.creado_en = ahora_(); }
      ['monto', 'saldo_inicial', 'tope', 'precio', 'total'].forEach(k => { if (obj[k] !== undefined && obj[k] !== '') obj[k] = ctbNum_(obj[k]); });
      if (['ingresos', 'gastos', 'sin_identificar'].indexOf(tabla) >= 0) {
        if (!(obj.monto > 0)) throw error_('El monto debe ser mayor que cero.');
        if (!s_(obj.cuenta_id)) throw error_('Elija la cuenta.');
        if (tabla === 'gastos' && obj.tipo === 'transferencia' && (!s_(obj.destino_id) || obj.destino_id === obj.cuenta_id)) throw error_('Elija una cuenta de destino distinta.');
        if (tabla === 'gastos' && obj.tipo !== 'transferencia' && !s_(obj.rubro)) throw error_('Elija el rubro del gasto.');
      }
      if (tabla === 'cxp_rubro') {
        const viejo = ctbLeer_('cxp_rubro', torre).find(m => m.cxp_id === s_(d.cxp_id));
        if (viejo) { ctbActualizar_('cxp_rubro', viejo._fila, { rubro: s_(d.rubro), cuenta_id: s_(d.cuenta_id) }); ctbAuditar_(torre, admin, 'editar', tabla, viejo.id, viejo, d); return accionCtbDatos_(req, admin); }
      }
      ctbAgregar_(tabla, obj);
      ctbAuditar_(torre, admin, 'crear', tabla, obj.id, null, obj);
    } else if (op === 'editar') {
      if (CTB_EDITAR.indexOf(tabla) < 0) throw error_('Eso no se edita: se anula y se registra de nuevo.');
      const f = ctbLeer_(tabla, torre).find(r => r.id === s_(req.id));
      if (!f) throw error_('Ese registro ya no existe.');
      const campo = CTB_FECHA[tabla]; if (campo) { ctbExigirAbierto_(torre, f[campo]); if (d[campo]) ctbExigirAbierto_(torre, d[campo]); }
      if (tabla === 'conceptos' && ctbLeer_('recibos', torre).some(r => r.periodo === f.periodo && r.estado !== 'anulado' && (r.lineas || []).some(l => l.concepto_id === f.id)))
        throw error_('Ese concepto ya está en recibos emitidos. Anule los recibos del mes para cambiarlo.');
      // Campos que nunca se editan: el estado se cambia anulando; el saldo inicial y su fecha mueven meses ya cerrados
      const fijos = ['id', 'torre', 'creado_por', 'creado_en', 'estado', 'anulado_por', 'anulado_en', 'motivo'].concat(tabla === 'cuentas' ? ['saldo_inicial', 'fecha_inicial', 'tipo'] : []).concat(tabla === 'conceptos' ? ['periodo'] : []);
      const cambios = {}; Object.keys(d).forEach(k => { if (fijos.indexOf(k) < 0) cambios[k] = d[k]; });
      if (tabla === 'cuentas' && (d.saldo_inicial !== undefined || d.fecha_inicial !== undefined) && !ctbLeer_('cierres', torre).some(k => k.estado === 'cerrado') && admin.gerente) {
        // sin meses cerrados, el Gerente General puede corregir el saldo inicial
        if (d.saldo_inicial !== undefined) cambios.saldo_inicial = ctbNum_(d.saldo_inicial);
        if (d.fecha_inicial !== undefined) { ctbExigirFecha_(d.fecha_inicial); cambios.fecha_inicial = s_(d.fecha_inicial); }
      }
      ctbActualizar_(tabla, f._fila, cambios);
      ctbAuditar_(torre, admin, 'editar', tabla, f.id, f, Object.assign({}, f, cambios));
    } else if (op === 'anular') {
      if (CTB_ANULAR.indexOf(tabla) < 0) throw error_('Eso no se anula.');
      const motivo = s_(req.motivo); if (motivo.length < 4) throw error_('Escriba el motivo de la anulación.');
      const f = ctbLeer_(tabla, torre).find(r => r.id === s_(req.id));
      if (!f) throw error_('Ese registro ya no existe.');
      if (f.estado === 'anulado') throw error_('Ya estaba anulado.');
      const campo = CTB_FECHA[tabla]; if (campo) ctbExigirAbierto_(torre, f[campo]);
      if (tabla === 'recibos' && (ctbAplicado_(ctbLeer_('cobros', torre))[f.id] || 0) > 0) throw error_('Ese recibo tiene cobros aplicados. Anule primero esos cobros.');
      if (tabla === 'sin_identificar' && f.estado === 'identificado') throw error_('Ese depósito ya se identificó. Anule primero el cobro.');
      if (tabla === 'cobros' && Number(f.a_favor) > 0) {
        // el saldo a favor de este cobro no puede estar ya cruzado con otros recibos
        const resto = ctbLeer_('cobros', torre).filter(x => x.apartamento === f.apartamento && x.estado !== 'anulado' && x.id !== f.id)
          .reduce((t, x) => t + (x.origen === 'cruce' ? -Math.round(x.monto * 100) : Math.round(Number(x.a_favor || 0) * 100)), 0);
        if (resto < 0) throw error_('El saldo a favor de este cobro ya se aplicó a otro recibo. Anule primero ese «saldo a favor aplicado».');
      }
      const cambio = { estado: 'anulado' };
      if (CTB_TABLAS[tabla][1].indexOf('anulado_por') >= 0) Object.assign(cambio, { anulado_por: admin.nombre, anulado_en: ahora_(), motivo: motivo });
      ctbActualizar_(tabla, f._fila, cambio);
      // Si se anula un cobro que vino de un depósito o de un aviso, ese depósito o aviso vuelve a quedar pendiente
      if (tabla === 'cobros' && f.origen === 'sin_identificar' && f.origen_id) { const s = ctbLeer_('sin_identificar', torre).find(x => x.id === f.origen_id); if (s) ctbActualizar_('sin_identificar', s._fila, { estado: 'pendiente', cobro_id: '' }); }
      if (tabla === 'cobros' && f.origen === 'notificado' && f.origen_id) { const n = ctbLeer_('notificados', torre).find(x => x.id === f.origen_id); if (n) ctbActualizar_('notificados', n._fila, { estado: 'pendiente', cobro_id: '' }); }
      if (tabla === 'conciliaciones') ctbLeer_('extracto', torre).filter(x => x.conciliacion_id === f.id).forEach(x => ctbActualizar_('extracto', x._fila, { estado: 'pendiente', conciliacion_id: '' }));
      agregar_(ctbHoja_('anulaciones'), { fecha: ahora_(), torre: torre, tabla: tabla, registro: f.id, detalle: s_(f.numero || f.detalle || f.apartamento || f.nombre || f.referencia).slice(0, 200), monto: f.monto || f.total || '', motivo: motivo, usuario: admin.nombre });
      ctbAuditar_(torre, admin, 'anular', tabla, f.id, f, Object.assign({}, f, cambio));
    } else throw error_('Operación no válida.');
  } finally { lock.releaseLock(); }
  registrar_({ nombre: 'contabilidad' }, admin.nombre, 'ctb_' + op, torre + ' · ' + tabla);
  return accionCtbDatos_(req, admin);
}

// ------------------------------------------------------------------ recibos
/** Guarda los recibos del mes (la página ya los revisó). El servicio les pone el número de la serie y cruza los anticipos que se indiquen. */
function accionCtbRecibos_(req, admin) {
  const t = exigirTorre_(admin, req.torre), torre = t.torre, periodo = s_(req.periodo);
  if (!/^\d{4}-\d{2}$/.test(periodo)) throw error_('Elija el mes.');
  const lista = (req.recibos || []).filter(r => r && s_(r.apartamento) && Number(r.total) > 0);
  if (!lista.length) throw error_('No hay recibos para generar.');
  const aptos = leer_('Apartamentos').filas.filter(a => mismaTorre_(a.torre, torre)).map(a => s_(a.apartamento).toUpperCase());
  return ctbConLock_(() => {
    lista.forEach(r => { ctbExigirFecha_(r.emision, 'fecha de emisión'); ctbExigirFecha_(r.vence, 'fecha de vencimiento'); ctbExigirAbierto_(torre, r.emision); });
    const existentes = ctbLeer_('recibos', torre).filter(r => r.estado !== 'anulado');
    const cfg = ctbConfig_(torre), pref = s_(cfg.serie_prefijo) || 'R';
    let n = Number(cfg.serie_siguiente) || 1;
    // nunca repetir un número ya usado, aunque la serie se haya tocado a mano
    existentes.concat(ctbLeer_('recibos', torre)).forEach(r => { const m = s_(r.numero).match(/(\d+)$/); if (m && s_(r.numero).indexOf(pref) === 0 && Number(m[1]) >= n) n = Number(m[1]) + 1; });
    const enLote = {};
    lista.forEach(r => {
      const apto = s_(r.apartamento).toUpperCase(), tipo0 = s_(r.tipo);
      if ((tipo0 === 'ordinaria' || tipo0 === 'mora' || !tipo0) && enLote[apto + '|' + (tipo0 || 'ordinaria')]) throw error_('El apto. ' + apto + ' aparece dos veces en este lote.');
      enLote[apto + '|' + (tipo0 || 'ordinaria')] = 1;
    });
    const mapa = {}, creados = [];
    lista.forEach(r => {
      const apto = s_(r.apartamento).toUpperCase();
      if (aptos.length && aptos.indexOf(apto) < 0) throw error_('El apartamento ' + apto + ' no está en la lista de ' + torre + '.');
      const tipo = ['ordinaria', 'extraordinaria', 'individual', 'mora', 'reserva', 'saldo_inicial'].indexOf(s_(r.tipo)) >= 0 ? s_(r.tipo) : 'ordinaria';
      if ((tipo === 'ordinaria' || tipo === 'mora') && existentes.some(x => x.apartamento === apto && x.periodo === periodo && x.tipo === tipo))
        throw error_('El apto. ' + apto + ' ya tiene recibo ' + (tipo === 'mora' ? 'de mora' : 'ordinario') + ' de ' + periodo + '. Anúlelo primero si quiere rehacerlo.');
      const lineas = (r.lineas || []).map(l => ({ concepto_id: s_(l.concepto_id), concepto: s_(l.concepto).slice(0, 120), rubro: s_(l.rubro), tipo: s_(l.tipo), clase: ctbLib_().claseDe(l), monto: ctbNum_(l.monto) }));   // v3.2 · cada línea con su clase
      if (lineas.some(l => !(l.monto > 0))) throw error_('Las líneas del recibo del apto. ' + apto + ' deben ser mayores que cero.');
      const total = Math.round(lineas.reduce((s, l) => s + l.monto * 100, 0)) / 100;
      if (!ctbIgualCent_(total, r.total)) throw error_('El total del recibo del apto. ' + apto + ' no cuadra con sus líneas.');
      creados.push({ id: idNuevo_('REC') + '-' + creados.length, torre: torre, numero: pref + ('000000' + n++).slice(-6), periodo: periodo, apartamento: apto, emision: s_(r.emision), vence: s_(r.vence), tipo: tipo,
        lineas: lineas, total: total, ncf: s_(r.ncf).slice(0, 30), estado: 'emitido', creado_por: admin.nombre, creado_en: ahora_() });
    });
    creados.forEach(o => { ctbAgregar_('recibos', o); mapa[o.apartamento + '|' + o.tipo] = o; });
    ctbFijarConfig_(torre, 'serie_siguiente', String(n), admin);
    // Cruces de anticipo: solo contra los recibos recién creados, con tope en el saldo a favor real y en el total del recibo
    const cobros = ctbLeer_('cobros', torre);
    (req.cruces || []).forEach(k => {
      const apto = s_(k.apartamento).toUpperCase(), fecha = s_(k.fecha);
      if (!ctbFechaOk_(fecha) || ctbCerrado_(torre, fecha.slice(0, 7))) return;
      let favor = cobros.filter(x => x.apartamento === apto && x.estado !== 'anulado').reduce((s, x) => s + (x.origen === 'cruce' ? -Math.round(x.monto * 100) : Math.round(Number(x.a_favor || 0) * 100)), 0);
      const pedido = (k.aplicaciones || []).reduce((t, x) => t + Math.max(0, Math.round(ctbNum_(x.monto) * 100)), 0);
      const nuevos = creados.filter(o => o.apartamento === apto);
      if (!nuevos.length || favor <= 0 || pedido <= 0) return;
      // v3.2 · el anticipo se aplica línea por línea a los recibos recién creados, con el mismo orden legal que un cobro
      const K = ctbLib_(), cr = K.cruzarAnticipo({ apartamento: apto, disponible: Math.min(favor, pedido) / 100, pendientes: K.conSaldo(nuevos, cobros, null, cfg), fecha: fecha, config: cfg });
      const aps = cr ? cr.aplicaciones : [];
      const total = aps.reduce((s, x) => s + Math.round(x.monto * 100), 0);
      if (!total) return;
      const obj = { id: idNuevo_('COB'), torre: torre, fecha: fecha, apartamento: apto, monto: total / 100, forma: 'anticipo', cuenta_id: '', referencia: '', origen: 'cruce', origen_id: '',
        aplicaciones: aps, descuento: 0, a_favor: 0, estado: 'activo', creado_por: admin.nombre, creado_en: ahora_() };
      ctbAgregar_('cobros', obj); cobros.push(obj);
    });
    ctbAuditar_(torre, admin, 'generar', 'recibos', periodo, null, { cantidad: creados.length, hasta: n - 1 });
    registrar_({ nombre: 'contabilidad' }, admin.nombre, 'ctb_recibos', torre + ' · ' + periodo + ' · ' + creados.length);
    return accionCtbDatos_(req, admin);
  });
}

// ------------------------------------------------------------------ cobros
/** Registra un cobro. Revisa que cada aplicación sea de un recibo del mismo apartamento y no pase de su saldo. */
function accionCtbCobrar_(req, admin) {
  const t = exigirTorre_(admin, req.torre), torre = t.torre, k = req.cobro || {};
  const apto = s_(k.apartamento).toUpperCase(), monto = ctbNum_(k.monto), fecha = s_(k.fecha);
  if (!apto) throw error_('Elija el apartamento.');
  if (!(monto > 0)) throw error_('El monto debe ser mayor que cero.');
  ctbExigirFecha_(fecha, 'fecha del pago');
  ctbExigirAbierto_(torre, fecha);
  const origen = ['directo', 'notificado', 'sin_identificar'].indexOf(s_(k.origen)) >= 0 ? s_(k.origen) : 'directo';
  if (origen !== 'sin_identificar' && !ctbLeer_('cuentas', torre).some(c => c.id === s_(k.cuenta_id) && !esNo_(c.activa))) throw error_('Elija la cuenta donde entró el dinero.');
  const K = ctbLib_();
  const hecho = ctbConLock_(() => {
    const cobros = ctbLeer_('cobros', torre), cfg = ctbConfig_(torre);
    const saldos = {}; K.conSaldo(ctbLeer_('recibos', torre), cobros, null, cfg).forEach(r => { saldos[r.id] = r; });
    // v3.2 · cada aplicación va a una línea (recibo + línea): así cada peso queda en su clase y nada se mezcla
    let suma = 0, desc = 0;
    const porLinea = {};
    (k.aplicaciones || []).forEach(x => {
      const id = s_(x.recibo_id), ln = Number(x.linea), m = Math.round(ctbNum_(x.monto) * 100), d = Math.round(ctbNum_(x.descuento) * 100);
      if (m < 0 || d < 0) throw error_('Los montos aplicados no pueden ser negativos.');
      if (!m && !d) return;
      if (!(ln >= 0) || Math.floor(ln) !== ln) throw error_('Cada monto aplicado debe decir a qué línea del recibo va. Recargue la página.');
      const key = id + '#' + ln;
      porLinea[key] = porLinea[key] || { id: id, ln: ln, m: 0, d: 0 }; porLinea[key].m += m; porLinea[key].d += d;
    });
    const descPorRecibo = {};
    const aps = Object.keys(porLinea).map(key => {
      const x = porLinea[key], r = saldos[x.id];
      if (!r) throw error_('Uno de los recibos ya no existe o está anulado.');
      if (r.apartamento !== apto) throw error_('El recibo ' + r.numero + ' no es del apto. ' + apto + '.');
      const l = r.lineas[x.ln];
      if (!l) throw error_('El recibo ' + r.numero + ' no tiene esa línea.');
      const saldo = Math.round(l.saldo * 100);
      if (x.m + x.d > saldo) throw error_('«' + l.concepto + '» del recibo ' + r.numero + ' solo tiene ' + (saldo / 100).toLocaleString('en-US') + ' pendiente.');
      if (x.d) {
        if (l.clase !== 'ordinaria') throw error_('El pronto pago solo se aplica a la cuota ordinaria.');
        if (x.m + x.d !== saldo) throw error_('El pronto pago exige pagar completa la cuota ordinaria del recibo ' + r.numero + '.');
        descPorRecibo[r.id] = (descPorRecibo[r.id] || 0) + x.d;
      }
      suma += x.m; desc += x.d;
      return { recibo_id: r.id, numero: r.numero, linea: x.ln, clase: l.clase, monto: x.m / 100, descuento: x.d / 100 };
    });
    // el pronto pago lo calcula el servicio con las reglas de la torre: todas las líneas ordinarias completas, a tiempo y sin abonos previos
    Object.keys(descPorRecibo).forEach(id => {
      const r = saldos[id], saldoOrd = r.lineas.filter(l => l.clase === 'ordinaria').reduce((t, l) => t + Math.round(l.saldo * 100), 0);
      const permitido = Math.min(saldoOrd, Math.round(K.descuentoProntoPago(r, fecha, cfg) * 100));   // si un anticipo ya cubrió casi todo, el descuento llega hasta lo que queda
      const ordOk = r.lineas.filter(l => l.clase === 'ordinaria').every(l => { const y = porLinea[id + '#' + l.linea]; return y && y.m + y.d === Math.round(l.saldo * 100); });
      if (!permitido || !ordOk || Math.abs(descPorRecibo[id] - permitido) > 1) throw error_('El descuento del recibo ' + r.numero + ' no corresponde a las reglas de pronto pago de la torre.');
    });
    const favor = Math.round(monto * 100) - suma;
    if (favor < 0) throw error_('Lo aplicado pasa del monto cobrado.');
    let origenId = s_(k.origen_id), cuenta = s_(k.cuenta_id);
    let sinId = null, notif = null;
    if (origen === 'sin_identificar') {
      sinId = ctbLeer_('sin_identificar', torre).find(x => x.id === origenId);
      if (!sinId || sinId.estado !== 'pendiente') throw error_('Ese depósito ya no está pendiente.');
      if (!ctbIgualCent_(sinId.monto, monto)) throw error_('El monto debe ser el del depósito (' + sinId.monto + ').');
      cuenta = sinId.cuenta_id;
    }
    if (origen === 'notificado') {
      notif = ctbLeer_('notificados', torre).find(x => x.id === origenId);
      if (!notif || notif.estado !== 'pendiente') throw error_('Ese aviso de pago ya se revisó.');
      if (notif.apartamento !== apto) throw error_('El aviso es del apto. ' + notif.apartamento + '.');
      const dest = (notif.destino || []).filter(key => { const [rid, ln] = key.split('#'); const r = saldos[rid]; return r && r.lineas[Number(ln)] && r.lineas[Number(ln)].saldo > 0; });
      if (dest.length && aps.some(x => dest.indexOf(x.recibo_id + '#' + x.linea) < 0)) throw error_('El residente dijo qué paga en su aviso (art. 1253 del Código Civil). Aplique el pago solo a esos cargos; lo demás queda a favor.');
    }
    const obj = { id: idNuevo_('COB'), torre: torre, fecha: fecha, apartamento: apto, monto: monto, forma: s_(k.forma).slice(0, 40), cuenta_id: cuenta, referencia: s_(k.referencia).slice(0, 80),
      origen: origen, origen_id: origenId, aplicaciones: aps, descuento: desc / 100, a_favor: favor / 100, estado: 'activo', creado_por: admin.nombre, creado_en: ahora_() };
    ctbAgregar_('cobros', obj);
    if (sinId) ctbActualizar_('sin_identificar', sinId._fila, { estado: 'identificado', cobro_id: obj.id });
    if (notif) ctbActualizar_('notificados', notif._fila, { estado: 'aprobado', cobro_id: obj.id, revisado_por: admin.nombre, revisado_en: ahora_() });
    ctbAuditar_(torre, admin, 'crear', 'cobros', obj.id, null, obj);
    registrar_({ nombre: 'contabilidad' }, admin.nombre, 'ctb_cobro', torre + ' · ' + apto + ' · ' + monto);
    return { obj: obj, notif: notif, cfg: cfg };
  });
  // v3.2 · el recibo sale solo por correo, Telegram y WhatsApp (cobros.gs), ya fuera del bloqueo; un fallo de envío nunca deshace el cobro
  let envio = null;
  if (typeof cobReciboAuto_ === 'function' && s_(hecho.cfg.recibo_auto || 'si') !== 'no') { try { envio = cobReciboAuto_(torre, hecho.obj, admin, hecho.notif); } catch (e) { envio = { error: e.message }; } }
  return Object.assign(accionCtbDatos_(req, admin), { envio_recibo: envio });
}

function accionCtbNotificadoRechazar_(req, admin) {
  const t = exigirTorre_(admin, req.torre), torre = t.torre, motivo = s_(req.motivo);
  if (motivo.length < 4) throw error_('Escriba por qué se rechaza (el residente lo verá).');
  const n = ctbLeer_('notificados', torre).find(x => x.id === s_(req.id));
  if (!n || n.estado !== 'pendiente') throw error_('Ese aviso ya se revisó.');
  ctbActualizar_('notificados', n._fila, { estado: 'rechazado', motivo: motivo, revisado_por: admin.nombre, revisado_en: ahora_() });
  ctbAuditar_(torre, admin, 'rechazar', 'notificados', n.id, n, { estado: 'rechazado', motivo: motivo });
  return accionCtbDatos_(req, admin);
}

// ------------------------------------------------------------------ banco y conciliación
function accionCtbExtracto_(req, admin) { return ctbConLock_(() => ctbExtracto_(req, admin)); }
function ctbExtracto_(req, admin) {
  const t = exigirTorre_(admin, req.torre), torre = t.torre, cuenta = s_(req.cuenta_id);
  if (!ctbLeer_('cuentas', torre).some(c => c.id === cuenta)) throw error_('Elija la cuenta del estado.');
  const ya = {}; ctbLeer_('extracto', torre).filter(x => x.cuenta_id === cuenta).forEach(x => { ya[x.fecha + '|' + Math.round(x.monto * 100) + '|' + x.referencia + '|' + x.descripcion] = (ya[x.fecha + '|' + Math.round(x.monto * 100) + '|' + x.referencia + '|' + x.descripcion] || 0) + 1; });
  const carga = idNuevo_('EXT'); let nuevos = 0, repetidos = 0;
  const visto = {};
  (req.movimientos || []).slice(0, 3000).forEach(m => {
    const fecha = s_(m.fecha), monto = ctbNum_(m.monto); if (!ctbFechaOk_(fecha) || !monto) return;
    const clave = fecha + '|' + Math.round(monto * 100) + '|' + s_(m.referencia).slice(0, 80) + '|' + s_(m.descripcion).slice(0, 200);
    visto[clave] = (visto[clave] || 0) + 1;
    if ((ya[clave] || 0) >= visto[clave]) { repetidos++; return; } // ya estaba cargado (subir el mismo estado dos veces no duplica)
    ctbAgregar_('extracto', { id: idNuevo_('MOV') + '-' + nuevos, torre: torre, cuenta_id: cuenta, fecha: fecha, descripcion: s_(m.descripcion).slice(0, 200), referencia: s_(m.referencia).slice(0, 80), monto: monto, carga: carga, estado: 'pendiente' });
    nuevos++;
  });
  ctbAuditar_(torre, admin, 'cargar', 'extracto', carga, null, { cuenta: cuenta, nuevos: nuevos, repetidos: repetidos });
  const r = accionCtbDatos_(req, admin); r.aviso = nuevos + ' movimientos nuevos' + (repetidos ? ', ' + repetidos + ' ya estaban cargados' : '') + '.';
  return r;
}
function accionCtbConciliar_(req, admin) {
  const t = exigirTorre_(admin, req.torre), torre = t.torre, cuenta = s_(req.cuenta_id), periodo = s_(req.periodo);
  if (!/^\d{4}-\d{2}$/.test(periodo)) throw error_('Elija el mes.');
  if (!ctbLeer_('cuentas', torre).some(c => c.id === cuenta)) throw error_('Elija la cuenta.');
  ctbExigirAbierto_(torre, periodo);
  const K = ctbLib_();
  return ctbConLock_(() => {
    const concs = ctbLeer_('conciliaciones', torre).filter(k => k.estado !== 'anulado');
    if (concs.some(k => k.cuenta_id === cuenta && k.periodo === periodo)) throw error_('Esa cuenta ya está conciliada en ' + periodo + '. Anule la conciliación para rehacerla.');
    // Se recalcula aquí: las cifras de la página no se usan
    const D = ctbDatosLib_(torre), ext = ctbLeer_('extracto', torre).filter(x => x.cuenta_id === cuenta && x.estado !== 'conciliado');
    const hechos = concs.filter(k => k.cuenta_id === cuenta).reduce((a, k) => a.concat(k.claves || []), []);
    const parejas = (req.parejas || []).filter(x => Array.isArray(x) && x.length === 2).map(x => [s_(x[0]), s_(x[1])]).slice(0, 2000);
    const r = K.conciliar({ cuentaId: cuenta, d: D, periodo: periodo, extracto: ext, saldoBanco: ctbNum_(req.saldo_banco), parejas: parejas, yaConciliados: hechos });
    if (!r.lista) throw error_('No cuadra: diferencia de ' + (r.diferencia === null ? '—' : r.diferencia.toLocaleString('en-US')) + (r.banco_creditos.length + r.banco_debitos.length ? ' y hay movimientos del banco sin registrar' : '') + '. Revise y vuelva a intentar.');
    const obj = { id: idNuevo_('CON'), torre: torre, cuenta_id: cuenta, periodo: periodo, saldo_banco: r.saldo_banco, saldo_libros: r.saldo_libros, transito: r.total_transito,
      no_cobrados: r.total_no_cobrados, claves: r.emparejados.map(e => e.libro.clave), extracto_ids: r.emparejados.filter(e => e.banco).map(e => e.banco.id), estado: 'conciliada', creado_por: admin.nombre, creado_en: ahora_() };
    ctbAgregar_('conciliaciones', obj);
    const ids = {}; obj.extracto_ids.forEach(i => { ids[i] = 1; });
    ctbLeer_('extracto', torre).filter(x => ids[x.id]).forEach(x => ctbActualizar_('extracto', x._fila, { estado: 'conciliado', conciliacion_id: obj.id }));
    ctbAuditar_(torre, admin, 'conciliar', 'conciliaciones', obj.id, null, { cuenta: cuenta, periodo: periodo, saldo_banco: obj.saldo_banco, arqueo: !!r.arqueo });
    return accionCtbDatos_(req, admin);
  });
}

// ------------------------------------------------------------------ cierre de mes
function ctbCarpeta_(torre) {
  const id = s_(config_().CARPETA_CONTABILIDAD_ID);
  let raiz = null;
  if (id) try { raiz = DriveApp.getFolderById(id); } catch (e) { raiz = null; }
  if (!raiz) { const it = DriveApp.getFoldersByName('Contabilidad Stili'); raiz = it.hasNext() ? it.next() : DriveApp.createFolder('Contabilidad Stili'); }
  const it2 = raiz.getFoldersByName(torre);
  return it2.hasNext() ? it2.next() : raiz.createFolder(torre);
}
/** Cierra el mes: todas las cuentas activas conciliadas; guarda en PDF la conciliación y la liquidación (la página envía el HTML). */
function accionCtbCerrar_(req, admin) { return ctbConLock_(() => ctbCerrar_(req, admin)); }
function ctbCerrar_(req, admin) {
  const t = exigirTorre_(admin, req.torre), torre = t.torre, periodo = s_(req.periodo);
  if (!ctbPuedeCerrar_(admin)) throw error_('El cierre de mes lo hace Contabilidad o el Gerente General.', 'SIN_PERMISO');
  if (!/^\d{4}-\d{2}$/.test(periodo)) throw error_('Elija el mes.');
  if (ctbCerrado_(torre, periodo)) throw error_('Ese mes ya está cerrado.');
  const cuentas = ctbLeer_('cuentas', torre).filter(c => !esNo_(c.activa)), conc = ctbLeer_('conciliaciones', torre).filter(k => k.periodo === periodo && k.estado !== 'anulado');
  const faltan = cuentas.filter(c => !conc.some(k => k.cuenta_id === c.id));
  if (faltan.length) throw error_('Faltan por conciliar: ' + faltan.map(c => c.nombre).join(', ') + '.');
  const archivos = [];
  try {
    const carpeta = ctbCarpeta_(torre);
    (req.documentos || []).slice(0, 4).forEach(doc => {
      const nombre = (torre + ' · ' + periodo + ' · ' + s_(doc.nombre)).slice(0, 120) + '.pdf';
      const pdf = Utilities.newBlob(s_(doc.html), 'text/html', 'x.html').getAs('application/pdf').setName(nombre);
      const f = carpeta.createFile(pdf); archivos.push({ nombre: s_(doc.nombre), url: f.getUrl() });
    });
  } catch (e) { archivos.push({ nombre: 'Aviso', url: '', error: 'No se pudieron guardar los PDF: ' + e.message }); }
  const previo = ctbLeer_('cierres', torre).find(k => k.periodo === periodo);
  if (previo) ctbActualizar_('cierres', previo._fila, { estado: 'cerrado', archivos: archivos, por: admin.nombre, en: ahora_(), motivo: '' });
  else ctbAgregar_('cierres', { id: idNuevo_('CIE'), torre: torre, periodo: periodo, estado: 'cerrado', archivos: archivos, por: admin.nombre, en: ahora_() });
  ctbAuditar_(torre, admin, 'cerrar', 'cierres', periodo, previo || null, { estado: 'cerrado', archivos: archivos.length });
  registrar_({ nombre: 'contabilidad' }, admin.nombre, 'ctb_cierre', torre + ' · ' + periodo);
  return accionCtbDatos_(req, admin);
}
function accionCtbReabrir_(req, admin) {
  const t = exigirTorre_(admin, req.torre), torre = t.torre, periodo = s_(req.periodo), motivo = s_(req.motivo);
  if (!admin.gerente) throw error_('Solo el Gerente General reabre un mes cerrado.', 'SOLO_GERENTE');
  if (motivo.length < 6) throw error_('Escriba el motivo para reabrir el mes.');
  const f = ctbLeer_('cierres', torre).find(k => k.periodo === periodo && k.estado === 'cerrado');
  if (!f) throw error_('Ese mes no está cerrado.');
  ctbActualizar_('cierres', f._fila, { estado: 'reabierto', motivo: motivo, por: admin.nombre, en: ahora_() });
  ctbAuditar_(torre, admin, 'reabrir', 'cierres', periodo, f, { estado: 'reabierto', motivo: motivo });
  registrar_({ nombre: 'contabilidad' }, admin.nombre, 'ctb_reabrir', torre + ' · ' + periodo + ' · ' + motivo);
  return accionCtbDatos_(req, admin);
}

// ------------------------------------------------------------------ Junta: aprobación de gastos
function ctbUmbral_(torre) { return ctbNum_(ctbConfig_(torre).umbral_junta); }
function ctbExigirJunta_(torre, cxpId, monto) {
  const u = ctbUmbral_(torre);
  if (!(u > 0) || !(Number(monto) >= u)) return;
  const a = ctbLeer_('aprobaciones', torre).filter(x => x.cxp_id === s_(cxpId)).pop();
  const vale = a && a.estado === 'aprobada' && Math.round(Number(monto) * 100) <= Math.round(Number(a.monto) * 100);
  if (!vale) throw error_('Este pago es de ' + Number(monto).toLocaleString('en-US') + ' y pasa el monto que fijó la Junta (' + u.toLocaleString('en-US') + '). ' +
    (a && a.estado === 'aprobada' ? 'La Junta aprobó ' + Number(a.monto).toLocaleString('en-US') + '; el monto cambió y hay que pedir la aprobación de nuevo.' :
      a && a.estado === 'pendiente' ? 'Está esperando la aprobación de la Junta.' : a && a.estado === 'rechazada' ? 'La Junta lo rechazó.' : 'Pídale la aprobación desde Contabilidad › Pagos y bancos.'), 'JUNTA');
}

function accionCtbAprobacionPedir_(req, admin) {
  const t = exigirTorre_(admin, req.torre), torre = t.torre;
  const p = ctbPagos_(torre).find(x => x.id === s_(req.cxp_id));
  if (!p) throw error_('Esa cuenta por pagar ya no existe.');
  if (p.estado === 'pagada') throw error_('Ese pago ya se hizo.');
  const viva = ctbLeer_('aprobaciones', torre).find(a => a.cxp_id === p.id && (a.estado === 'pendiente' || a.estado === 'aprobada') && Math.round(Number(a.monto) * 100) >= Math.round(p.monto * 100));
  let token = viva ? viva.token : '';
  if (!viva) {
    token = Utilities.getUuid().replace(/-/g, '') + aleatorio_(6);
    ctbAgregar_('aprobaciones', { id: idNuevo_('APR'), torre: torre, cxp_id: p.id, suplidor: p.suplidor, monto: p.monto, concepto: s_(p.concepto).slice(0, 200), token: token, estado: 'pendiente', pedida_por: admin.nombre, pedida_en: ahora_() });
    ctbAuditar_(torre, admin, 'pedir', 'aprobaciones', p.id, null, { monto: p.monto, suplidor: p.suplidor });
  }
  const r = accionCtbDatos_(req, admin);
  r.enlace_junta = 'https://stiligroup.github.io/lobby/aprobar.html?t=' + token;
  return r;
}
function ctbAprobacionPorToken_(token) {
  const tk = s_(token);
  if (tk.length < 30) throw error_('El enlace no es válido.', 'SIN_APROBACION');
  const a = ctbLeer_('aprobaciones').find(x => x.token === tk);
  if (!a) throw error_('El enlace no es válido o ya no existe.', 'SIN_APROBACION');
  return a;
}
function accionCtbAprobacionInfo_(req) { // público, con el enlace
  const a = ctbAprobacionPorToken_(req.t);
  return { torre: a.torre, suplidor: a.suplidor, monto: a.monto, concepto: a.concepto, estado: a.estado, pedida_por: a.pedida_por, pedida_en: a.pedida_en,
    decidida_por: a.decidida_por, decidida_en: a.decidida_en, nota: a.nota, umbral: ctbUmbral_(a.torre) };
}
function accionCtbAprobacionDecidir_(req) { // público, con el enlace
  const a = ctbAprobacionPorToken_(req.t), dec = s_(req.decision), nombre = s_(req.nombre).replace(/\s+/g, ' ').slice(0, 80);
  if (a.estado !== 'pendiente') throw error_('Esta solicitud ya se decidió (' + a.estado + ').');
  if (['aprobada', 'rechazada'].indexOf(dec) < 0) throw error_('Elija aprobar o rechazar.');
  if (nombre.length < 3) throw error_('Escriba su nombre.');
  if (dec === 'rechazada' && s_(req.nota).length < 4) throw error_('Escriba por qué la rechaza.');
  ctbActualizar_('aprobaciones', a._fila, { estado: dec, decidida_por: nombre, decidida_en: ahora_(), nota: s_(req.nota).slice(0, 300) });
  ctbAuditar_(a.torre, { nombre: nombre + ' (Junta)' }, dec, 'aprobaciones', a.cxp_id, { estado: 'pendiente' }, { estado: dec, nota: s_(req.nota) });
  registrar_({ nombre: 'contabilidad' }, nombre + ' (Junta)', 'ctb_junta_' + dec, a.torre + ' · ' + a.suplidor + ' · ' + a.monto);
  return accionCtbAprobacionInfo_(req);
}
/** Las acciones de Cuentas por Pagar que aprueban o pagan pasan antes por la regla de la Junta. */
function ctbEnvolverCxp_() {
  // La torre y el monto salen de la propia partida (no de lo que mande la página)
  const revisar = ids => {
    let filas = [];
    try { filas = (typeof leerSiExiste_ === 'function' ? leerSiExiste_('CxP_Partidas') : leer_('CxP_Partidas').filas) || []; } catch (e) { return; }
    (ids || []).forEach(id => { const f = filas.find(x => s_(x.id) === s_(id)); if (f && s_(f.estado).toLowerCase() !== 'pagada') ctbExigirJunta_(s_(f.torre), s_(f.id), ctbNum_(f.monto)); });
  };
  const sesion = req => typeof usuarioDeSolicitud_ !== 'function' || !!usuarioDeSolicitud_(req);
  if (ACCIONES_CENTRAL.cxp_partida && !ACCIONES_CENTRAL.cxp_partida._junta) {
    const orig = ACCIONES_CENTRAL.cxp_partida;
    const env = req => { if (sesion(req) && ['aprobar', 'pagada'].indexOf(s_(req.operacion)) >= 0 && s_(req.id)) revisar([req.id]); return orig(req); };
    env._junta = true; ACCIONES_CENTRAL.cxp_partida = env;
  }
  if (ACCIONES_CENTRAL.cxp_armar && !ACCIONES_CENTRAL.cxp_armar._junta) {
    const orig2 = ACCIONES_CENTRAL.cxp_armar;
    const env2 = req => { if (sesion(req)) revisar(req.ids || []); return orig2(req); };
    env2._junta = true; ACCIONES_CENTRAL.cxp_armar = env2;
  }
}

// ------------------------------------------------------------------ honorarios de Stili
function accionCtbHonorario_(req, admin) { return ctbConLock_(() => ctbHonorario_(req, admin)); }
function ctbHonorario_(req, admin) {
  const t = exigirTorre_(admin, req.torre), torre = t.torre, periodo = s_(req.periodo);
  const cfg = ctbConfig_(torre), monto = ctbNum_(cfg.honorario_monto);
  if (!(monto > 0)) throw error_('Escriba primero el monto de los honorarios en Configuración.');
  if (!/^\d{4}-\d{2}$/.test(periodo)) throw error_('Elija el mes.');
  const sh = leer_('CxP_Partidas'), enc = sh.enc;
  if (['id', 'torre', 'suplidor', 'monto', 'estado'].some(k => enc.indexOf(k) < 0)) throw error_('La hoja de Cuentas por Pagar no tiene las columnas esperadas. Avise a soporte.');
  const concepto = 'Honorarios de administración ' + periodo;
  if (sh.filas.some(r => mismaTorre_(r.torre, torre) && s_(r.concepto || r.descripcion || r.detalle).indexOf(concepto) >= 0 && s_(r.estado).toLowerCase() !== 'anulada'))
    throw error_('Los honorarios de ' + periodo + ' ya están en Cuentas por Pagar.');
  const id = idNuevo_('CXP'), fila = { id: id, torre: torre, suplidor: 'Stili Group · Honorarios de administración', monto: monto, estado: 'pendiente' };
  [['periodo', periodo], ['concepto', concepto], ['descripcion', concepto], ['detalle', concepto], ['creado_en', ahora_()], ['creada_en', ahora_()], ['creado_por', admin.nombre], ['creada_por', admin.nombre], ['origen', 'honorario'], ['fecha', ahora_()]]
    .forEach(([k, v]) => { if (enc.indexOf(k) >= 0 && fila[k] === undefined) fila[k] = v; });
  agregar_('CxP_Partidas', fila);
  ctbAgregar_('cxp_rubro', { id: idNuevo_('CTB'), torre: torre, cxp_id: id, rubro: 'E4.1', cuenta_id: '' });
  ctbAuditar_(torre, admin, 'crear', 'honorarios', id, null, fila);
  return accionCtbDatos_(req, admin);
}

// ------------------------------------------------------------------ residentes: notificar un pago (QR de la torre)
function ctbCarpetaComprobantes_() {
  const it = DriveApp.getFoldersByName('Comprobantes Stili');
  return it.hasNext() ? it.next() : DriveApp.createFolder('Comprobantes Stili');
}
function accionCtbPagoInfo_(req) { // público
  const t = torrePorCodigoOpinion_(req.codigo);
  return { torre: t.torre, empresa: configPublica_().NOMBRE_EMPRESA };
}
function accionCtbPagoNotificar_(req) { // público
  const t = torrePorCodigoOpinion_(req.codigo), torre = t.torre;
  const apto = s_(req.apartamento).toUpperCase().replace(/\s+/g, '').slice(0, 12), monto = ctbNum_(req.monto), fecha = s_(req.fecha);
  const aptos = leer_('Apartamentos').filas.filter(a => mismaTorre_(a.torre, torre) && !esNo_(a.activo)).map(a => s_(a.apartamento).toUpperCase());
  if (!apto || (aptos.length && aptos.indexOf(apto) < 0)) throw error_('El apartamento no está en la lista de ' + torre + '. Revise cómo lo escribió.');
  if (!(monto > 0) || monto > 5000000) throw error_('Escriba el monto que pagó.');
  if (!ctbFechaOk_(fecha)) throw error_('Escriba la fecha del pago.');
  const nombre = s_(req.nombre).replace(/\s+/g, ' ').slice(0, 80);
  if (nombre.length < 3) throw error_('Escriba su nombre.');
  // Freno contra abusos: máximo 5 avisos por apartamento en 24 horas
  const recientes = ctbLeer_('notificados', torre).filter(n => n.apartamento === apto && Date.now() - new Date(n.fecha_aviso).getTime() < 864e5);
  if (recientes.length >= 5) throw error_('Ya se recibieron varios avisos de este apartamento hoy. La administración los está revisando.');
  const deHoy = ctbLeer_('notificados', torre).filter(n => Date.now() - new Date(n.fecha_aviso).getTime() < 864e5).length;
  if (deHoy >= 60) throw error_('Recibimos muchos avisos hoy. Intente de nuevo mañana o comuníquese con la administración.');
  let url = '';
  const a = req.archivo;
  if (a && a.base64) {
    if (!/^(image\/(png|jpe?g|webp|heic)|application\/pdf)$/.test(s_(a.mime))) throw error_('El comprobante debe ser una foto o un PDF.');
    if (a.base64.length > 7000000) throw error_('El comprobante pesa demasiado (máximo 5 MB).');
    const f = ctbCarpetaComprobantes_().createFile(Utilities.newBlob(Utilities.base64Decode(a.base64), a.mime, (torre + ' · ' + apto + ' · ' + fecha + ' · ' + s_(a.nombre)).slice(0, 120)));
    url = f.getUrl();
  }
  const obj = { id: idNuevo_('NOT'), torre: torre, fecha: fecha, fecha_aviso: Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'), apartamento: apto, monto: monto, banco: s_(req.banco).slice(0, 60),
    referencia: s_(req.referencia).slice(0, 80), nombre: nombre, comprobante_url: url, canal: ['portal', 'bot', 'qr'].indexOf(s_(req.canal)) >= 0 ? s_(req.canal) : 'qr', estado: 'pendiente' };
  ctbAgregar_('notificados', obj);
  ctbAuditar_(torre, { nombre: 'Residente apto. ' + apto }, 'notificar', 'notificados', obj.id, null, { monto: monto, fecha: fecha });
  return { ok: true, torre: torre, mensaje: 'Recibimos su aviso de pago. La administración lo revisa y le confirma.' };
}

// ------------------------------------------------------------------ pago en línea (pasarela)
/** La pasarela confirma un pago. Necesita la clave CTB_CLAVE_PASARELA en Config; registra el cobro solo, contra el recibo indicado. */
function accionCtbPagoConfirmado_(req) {
  const clave = s_(config_().CTB_CLAVE_PASARELA);
  if (!clave || s_(req.clave) !== clave) throw error_('No autorizado.', 'SIN_ADMIN');
  const num = s_(req.recibo), monto = ctbNum_(req.monto), ref = s_(req.referencia).slice(0, 80);
  const fecha = s_(req.fecha) || Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  if (!s_(req.torre)) throw error_('Falta la torre del pago.');
  if (!(monto > 0)) throw error_('Monto no válido.');
  if (!ref) throw error_('Falta la referencia del pago.');
  if (!ctbFechaOk_(fecha)) throw error_('Fecha no válida.');
  const t = torresActivas_().find(x => igualTorre_(x.torre, req.torre) || mismaTorre_(x.torre, req.torre));
  if (!t) throw error_('Torre no encontrada.');
  return ctbConLock_(() => {
    const r = ctbLeer_('recibos', t.torre).find(x => x.numero === num && x.estado !== 'anulado');
    if (!r) throw error_('No encuentro el recibo ' + num + ' en ' + t.torre + '.');
    const cobros = ctbLeer_('cobros', t.torre);
    if (cobros.some(k => k.origen === 'en_linea' && k.referencia === ref && k.estado !== 'anulado')) return { ok: true, repetido: true };
    // si el mes del pago está cerrado, se registra el primer día del mes abierto siguiente
    let f = fecha; while (ctbCerrado_(t.torre, f.slice(0, 7))) { const d = new Date(f.slice(0, 7) + '-01T12:00:00'); d.setMonth(d.getMonth() + 1); f = Utilities.formatDate(d, TZ, 'yyyy-MM-dd'); }
    const cuenta = s_(ctbConfig_(t.torre).cuenta_pasarela) || ((ctbLeer_('cuentas', t.torre).find(c => c.tipo === 'banco' && !esNo_(c.activa)) || {}).id || '');
    // v3.2 · el pago en línea es del recibo indicado: se aplica línea por línea a ese recibo, con el orden legal, sin pronto pago automático
    const K = ctbLib_(), cfgT = Object.assign({}, ctbConfig_(t.torre), { pp_porcentaje: 0 });
    const ap = K.aplicarCobro({ monto: monto, fecha: f, pendientes: K.conSaldo(ctbLeer_('recibos', t.torre).filter(x => x.id === r.id), cobros, null, cfgT), config: cfgT, orden: [r.id] });
    const obj = { id: idNuevo_('COB'), torre: t.torre, fecha: f, apartamento: r.apartamento, monto: monto, forma: 'tarjeta', cuenta_id: cuenta, referencia: ref, origen: 'en_linea', origen_id: '',
      aplicaciones: ap.aplicaciones, descuento: 0, a_favor: ap.a_favor,
      estado: 'activo', creado_por: 'Pasarela de pago', creado_en: ahora_() };
    ctbAgregar_('cobros', obj);
    ctbAuditar_(t.torre, { nombre: 'Pasarela de pago' }, 'crear', 'cobros', obj.id, null, obj);
    return { ok: true };
  });
}

// ------------------------------------------------------------------ informe a la Junta (resumen con IA)
/** La página envía las cifras ya calculadas del mes; la IA redacta un resumen que la gestora revisa antes de enviarlo. */
function accionCtbInformeIa_(req, admin) {
  const t = exigirTorre_(admin, req.torre), torre = t.torre, cifras = req.cifras || {};
  if (typeof claude_ !== 'function') throw error_('La IA no está disponible en este servicio.');
  const texto = 'Torre: ' + torre + '. Mes: ' + s_(req.periodo) + '.\nCifras del mes (RD$, ya verificadas por el sistema; no las cambie ni invente otras):\n' + JSON.stringify(cifras).slice(0, 12000) +
    '\n\nRedacte en español dominicano, en tono profesional y claro, un resumen para la Junta de Condóminos de 150 a 250 palabras: ' +
    '1) resultado del mes (ingresos, egresos y saldo); 2) cobranza y cartera vencida; 3) gastos que más pesaron y cómo van contra el presupuesto; 4) lo que la Junta debe saber o decidir. ' +
    'No mencione nombres de residentes; use solo números de apartamento si hace falta. Sin títulos ni viñetas: tres o cuatro párrafos.';
  const sistema = typeof memoriaFinanzas_ === 'function' ? memoriaFinanzas_(torre) : 'Usted es el contador de una administradora de condominios en Santo Domingo.';
  const r = claude_(sistema, [{ type: 'text', text: texto }], 1500);
  ctbAuditar_(torre, admin, 'informe_ia', 'reportes', s_(req.periodo), null, { modelo: r.modelo });
  return { texto: r.texto, modelo: r.modelo };
}

// ------------------------------------------------------------------ resumen de todas las torres
function accionCtbGlobal_(req, admin) {
  const hoy = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'), per = hoy.slice(0, 7);
  const rec = ctbLeer_('recibos'), cob = ctbLeer_('cobros'), not = ctbLeer_('notificados'), cie = ctbLeer_('cierres'), ap = ctbAplicado_(cob);
  return { hoy: hoy, torres: torresActivas_().filter(t => enAlcance_(admin, t.torre)).map(t => {
    const rs = rec.filter(r => mismaTorre_(r.torre, t.torre) && r.estado !== 'anulado');
    const vencido = rs.filter(r => r.vence < hoy).reduce((s, r) => s + Math.max(0, Math.round(r.total * 100) - (ap[r.id] || 0)), 0);
    const emitido = rs.filter(r => r.periodo === per).reduce((s, r) => s + Math.round(r.total * 100), 0);
    const cobrado = cob.filter(k => mismaTorre_(k.torre, t.torre) && k.estado !== 'anulado' && k.origen !== 'cruce' && s_(k.fecha).slice(0, 7) === per).reduce((s, k) => s + Math.round(k.monto * 100), 0);
    const cerrados = cie.filter(k => mismaTorre_(k.torre, t.torre) && k.estado === 'cerrado').map(k => k.periodo).sort();
    return { torre: t.torre, emitido_mes: emitido / 100, cobrado_mes: cobrado / 100, vencido: vencido / 100, notificados: not.filter(n => mismaTorre_(n.torre, t.torre) && n.estado === 'pendiente').length,
      ultimo_cierre: cerrados.pop() || '', usa: rs.length > 0 };
  }) };
}

// ------------------------------------------------------------------ registro en Código.gs
Object.keys(CTB_TABLAS).forEach(k => { HOJAS[CTB_TABLAS[k][0]] = CTB_TABLAS[k][1]; });
CTB_JSON.concat(['antes', 'despues']).forEach(k => { LARGO_COLUMNA[k] = 45000; });
Object.assign(ACCIONES_CENTRAL, {
  ctb_datos: req => conAdmin_(req, accionCtbDatos_),
  ctb_guardar: req => conAdmin_(req, accionCtbGuardar_),
  ctb_recibos: req => conAdmin_(req, accionCtbRecibos_),
  ctb_cobrar: req => conAdmin_(req, accionCtbCobrar_),
  ctb_notificado_rechazar: req => conAdmin_(req, accionCtbNotificadoRechazar_),
  ctb_extracto: req => conAdmin_(req, accionCtbExtracto_),
  ctb_conciliar: req => conAdmin_(req, accionCtbConciliar_),
  ctb_cerrar: req => conAdmin_(req, accionCtbCerrar_),
  ctb_reabrir: req => conAdmin_(req, accionCtbReabrir_),
  ctb_aprobacion_pedir: req => conAdmin_(req, accionCtbAprobacionPedir_),
  ctb_honorario: req => conAdmin_(req, accionCtbHonorario_),
  ctb_global: req => conAdmin_(req, accionCtbGlobal_),
  ctb_informe_ia: req => conAdmin_(req, accionCtbInformeIa_),
  ctb_aprobacion_info: accionCtbAprobacionInfo_,         // público, con el enlace de la Junta
  ctb_aprobacion_decidir: accionCtbAprobacionDecidir_,   // público, con el enlace de la Junta
  ctb_pago_info: accionCtbPagoInfo_,                     // público, con el código QR de la torre
  ctb_pago_notificar: accionCtbPagoNotificar_,           // público, con el código QR de la torre
  ctb_pago_confirmado: accionCtbPagoConfirmado_,         // pasarela, con clave
});
Object.assign(ACCESO_ACCION, {
  ctb_datos: ['tor_contabilidad', 1], ctb_global: ['tor_contabilidad', 1],
  ctb_guardar: ['tor_contabilidad', 3], ctb_recibos: ['tor_contabilidad', 3], ctb_cobrar: ['tor_contabilidad', 3], ctb_notificado_rechazar: ['tor_contabilidad', 3],
  ctb_extracto: ['tor_contabilidad', 3], ctb_conciliar: ['tor_contabilidad', 3], ctb_cerrar: ['tor_contabilidad', 3], ctb_reabrir: 'GERENTE',
  ctb_aprobacion_pedir: [['tor_contabilidad', 'tor_finanzas'], 3], ctb_honorario: ['tor_contabilidad', 3], ctb_informe_ia: ['tor_contabilidad', 3],
});
if (!SECCIONES.some(x => x[0] === 'tor_contabilidad')) SECCIONES.splice(Math.max(0, SECCIONES.findIndex(x => x[0] === 'tor_finanzas')) + 1, 0,
  ['tor_contabilidad', 'torres', 'Finanzas · Contabilidad de las torres',
    'Ver: cuotas, cobros, bancos y reportes. Profundizar: nombre de quien notificó un pago. Editar: generar recibos, cobrar, conciliar y cerrar el mes (el cierre, solo Contabilidad o Gerencia).', [1, 0, 3]]);
if (SECCIONES_TORRES.indexOf('tor_contabilidad') < 0) SECCIONES_TORRES.push('tor_contabilidad');
ctbEnvolverCxp_();
// El menú (accionPortal_) muestra «Contabilidad» a quien tenga el permiso
if (ACCIONES_CENTRAL.portal && !ACCIONES_CENTRAL.portal._ctb) {
  const origPortal = ACCIONES_CENTRAL.portal;
  const envPortal = req => {
    const r = origPortal(req);
    try {
      const v = vistaUsuario_(usuarioDeSolicitud_(req));
      const si = !!(v.gerente || (v.permisos.tor_contabilidad || 0) > 0);
      if (r && r.accesos) { r.accesos.contabilidad = si; if (si) r.accesos.finanzas = true; }
    } catch (e) { /* el menú sigue como estaba */ }
    return r;
  };
  envPortal._ctb = true; ACCIONES_CENTRAL.portal = envPortal;
}
