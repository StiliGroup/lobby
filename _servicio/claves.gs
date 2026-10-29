/**
 * Stili Soft v3.4.2 · Gestor de claves de las torres (v3.4.3: las claves propias de Stili piden la clave ADM, ver adm.gs).
 * Las contraseñas de las cuentas de cada torre (DGII, TSS, EDESUR, CAASD, banca en línea, correos…) en un solo lugar:
 *   - CIFRADAS en la hoja: quien abra la hoja de cálculo ve solo texto ilegible. La llave vive en las propiedades del script.
 *   - Se ven con un clic, una a la vez, y cada vista queda anotada (quién, cuándo, qué clave). Gerencia ve el registro.
 *   - Permiso propio «Torres · Gestor de claves»: Ver = lista sin claves · Profundizar = ver y copiar claves · Editar = agregar y cambiar.
 *     Por defecto: Contabilidad con Editar; Gerente General y Asistente Administrativo, todo. Gestores de cuenta y RRHH, nada (Gerencia lo cambia en Usuarios).
 *   - Cada usuario ve solo las torres que tiene asignadas. Hay un tope de vistas por hora para frenar una descarga masiva.
 * Cifrado: flujo HMAC-SHA256 en modo contador con autenticación (cifrar y luego firmar, HMAC-SHA256), llaves derivadas de una llave maestra
 * de 256 bits. Apps Script no trae AES; esta construcción usa solo HMAC-SHA256, que sí trae, y es estándar (PRF en modo contador + MAC).
 *
 * Archivo nuevo del servicio; se registra solo. Usa de Código.gs: leer_, leerSiExiste_, agregar_, actualizar_, olvidar_, s_, error_, idNuevo_,
 * mismaTorre_, exigirTorre_, enAlcance_, conAdmin_, vistaUsuario_, usuarioDeSolicitud_, torresActivas_, SECCIONES, SECCIONES_TORRES.
 */

const CLAVES_TABLAS = {
  Claves_Boveda: ['id', 'torre', 'entidad', 'usuario', 'clave', 'enlace', 'notas', 'estado', 'creado_por', 'creado_en', 'actualizado_por', 'actualizado_en'],
  Claves_Registro: ['fecha', 'usuario', 'accion', 'torre', 'entidad', 'clave_id', 'detalle'],
};
Object.keys(CLAVES_TABLAS).forEach(k => { HOJAS[k] = CLAVES_TABLAS[k]; });
const CLAVES_VISTAS_HORA = 60;

// ================================================================== cifrado (puro: se prueba en node con un HMAC de prueba)
/**
 * Boveda(hmac, b64e, b64d): hmac(valorBytes, llaveBytes) → 32 bytes. Formato guardado: v1.<iv>.<cifrado>.<firma> en base64.
 */
function BovedaCripto(hmac, b64e, b64d) {
  const u8 = a => Array.from(a, x => x & 255);
  const utf8 = t => u8(unescape(encodeURIComponent(String(t))).split('').map(c => c.charCodeAt(0)));
  const deUtf8 = b => decodeURIComponent(escape(String.fromCharCode.apply(null, u8(b))));
  const cat = (...xs) => [].concat(...xs.map(u8));
  const iguales = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= (a[i] & 255) ^ (b[i] & 255); return d === 0; };
  const llaves = maestra => ({ enc: u8(hmac(utf8('stili-claves-cifrar-v1'), maestra)), mac: u8(hmac(utf8('stili-claves-firmar-v1'), maestra)) });
  function flujo(k, iv, n) {
    const out = []; for (let c = 0; out.length < n; c++) out.push(...u8(hmac(cat(iv, [c >>> 24, (c >>> 16) & 255, (c >>> 8) & 255, c & 255]), k)));
    return out.slice(0, n);
  }
  function cifrar(texto, maestra, iv) {
    const L = llaves(maestra), p = utf8(texto), ks = flujo(L.enc, iv, p.length), c = p.map((b, i) => b ^ ks[i]);
    const firma = u8(hmac(cat(utf8('v1'), iv, c), L.mac));
    return ['v1', b64e(iv), b64e(c), b64e(firma)].join('.');
  }
  function descifrar(guardado, maestra) {
    const partes = String(guardado || '').split('.');
    if (partes.length !== 4 || partes[0] !== 'v1') throw new Error('Formato de clave desconocido.');
    const iv = u8(b64d(partes[1])), c = u8(b64d(partes[2])), firma = u8(b64d(partes[3])), L = llaves(maestra);
    if (!iguales(firma, u8(hmac(cat(utf8('v1'), iv, c), L.mac)))) throw new Error('La clave guardada fue alterada o la llave no corresponde.');
    const ks = flujo(L.enc, iv, c.length);
    return deUtf8(c.map((b, i) => b ^ ks[i]));
  }
  return { cifrar, descifrar };
}

// ================================================================== llave y utilidades del servicio
function clavesLlave_() {
  const p = PropertiesService.getScriptProperties();
  let k = p.getProperty('CLAVES_LLAVE');
  if (!k) {
    const lock = LockService.getScriptLock(); lock.waitLock(20000);
    try {
      k = p.getProperty('CLAVES_LLAVE');
      if (!k) {
        const semilla = Utilities.getUuid() + Utilities.getUuid() + Date.now() + Math.random();
        k = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, semilla + Utilities.getUuid()));
        p.setProperty('CLAVES_LLAVE', k);
      }
    } finally { lock.releaseLock(); }
  }
  return Utilities.base64Decode(k);
}
function clavesCripto_() { return BovedaCripto((v, k) => Utilities.computeHmacSha256Signature(v, k), b => Utilities.base64Encode(b), t => Utilities.base64Decode(t)); }
function clavesIv_() { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Date.now() + Math.random()).slice(0, 16); }
const clavesSinFormula_ = v => { const t = s_(v); return /^[=+\-@]/.test(t) ? "'" + t : t; };
function clavesFilas_(h) { if (typeof olvidar_ === 'function') olvidar_(h); return (typeof leerSiExiste_ === 'function' ? leerSiExiste_(h) : leer_(h).filas) || []; }
function clavesNivel_(admin) { return admin.gerente ? 3 : Number((admin.permisos || {}).tor_claves || 0); }
function clavesExigir_(admin, n, que) { if (clavesNivel_(admin) < n) throw error_('Necesita el nivel «' + que + '» del Gestor de claves.', 'SIN_PERMISO'); }
function clavesAnotar_(admin, accion, fila, detalle) {
  try { agregar_('Claves_Registro', { fecha: new Date().toISOString(), usuario: s_(admin.nombre), accion, torre: s_(fila && fila.torre), entidad: s_(fila && fila.entidad), clave_id: s_(fila && fila.id), detalle: clavesSinFormula_(s_(detalle).slice(0, 200)) }); }
  catch (e) { throw error_('No se pudo anotar el acceso; por seguridad la clave no se muestra.'); }
}
/** Tope de vistas por usuario y hora (frena que alguien copie todas las claves de golpe). */
function clavesTope_(admin) {
  const cache = CacheService.getScriptCache(), k = 'claves|vistas|' + s_(admin.id || admin.nombre) + '|' + new Date().toISOString().slice(0, 13);
  const n = Number(cache.get(k) || 0);
  if (n >= CLAVES_VISTAS_HORA && !admin.general) throw error_('Llegó al tope de ' + CLAVES_VISTAS_HORA + ' claves vistas en una hora. Intente más tarde o pida ayuda a Gerencia.');
  cache.put(k, String(n + 1), 3700);
}

// ================================================================== acciones
function clavesLista_(req, admin) {
  clavesExigir_(admin, 1, 'Ver');
  const sola = s_(req.torre) ? exigirTorre_(admin, req.torre).torre : '';
  const filas = clavesFilas_('Claves_Boveda').filter(r => s_(r.estado) !== 'eliminada' && enAlcance_(admin, s_(r.torre)) && (!sola || mismaTorre_(r.torre, sola)));
  const lista = filas.map(r => ({ id: s_(r.id), torre: s_(r.torre), entidad: s_(r.entidad), usuario: s_(r.usuario), tiene_clave: !!s_(r.clave), enlace: s_(r.enlace), notas: s_(r.notas),
    actualizado_por: s_(r.actualizado_por), actualizado_en: s_(r.actualizado_en) })).sort((a, b) => (a.torre + a.entidad).localeCompare(b.torre + b.entidad, 'es'));
  // accesos de «Accesos y servicios» que todavía no tienen su clave aquí (para completarlos con un clic)
  const ya = new Set(filas.map(r => (s_(r.torre) + '|' + s_(r.entidad) + '|' + s_(r.usuario)).toLowerCase()));
  const pendientes = (typeof leerSiExiste_ === 'function' ? leerSiExiste_('Torres_Accesos') || [] : []).filter(a => s_(a.entidad) && enAlcance_(admin, s_(a.torre)) && (!sola || mismaTorre_(a.torre, sola)))
    .filter(a => !ya.has((s_(a.torre) + '|' + s_(a.entidad) + '|' + s_(a.usuario)).toLowerCase())).map(a => ({ torre: s_(a.torre), entidad: s_(a.entidad), usuario: s_(a.usuario) })).slice(0, 500);
  const torres = (typeof torresActivas_ === 'function' ? torresActivas_() : []).map(t => t.torre).filter(t => enAlcance_(admin, t));
  return { claves: lista, pendientes, torres, nivel: clavesNivel_(admin), puede_ver: clavesNivel_(admin) >= 2, puede_editar: clavesNivel_(admin) >= 3, ve_registro: !!admin.gerente };
}
function clavesVer_(req, admin) {
  clavesExigir_(admin, 2, 'Profundizar');
  const r = clavesFilas_('Claves_Boveda').find(x => s_(x.id) === s_(req.id) && s_(x.estado) !== 'eliminada');
  if (!r) throw error_('No encuentro esa clave.');
  if (!enAlcance_(admin, s_(r.torre))) throw error_('Su usuario no tiene acceso a ' + s_(r.torre) + '.', 'SIN_PERMISO');
  if (!s_(r.clave)) return { id: s_(r.id), clave: '' };
  clavesTope_(admin);
  clavesAnotar_(admin, s_(req.motivo) === 'copiar' ? 'copiar' : 'ver', r, '');   // primero se anota; si no se puede anotar, no se muestra
  return { id: s_(r.id), clave: clavesCripto_().descifrar(s_(r.clave), clavesLlave_()) };
}
function clavesGuardar_(req, admin) {
  clavesExigir_(admin, 3, 'Editar');
  const d = req.datos || {};
  // v3.4.3 · las cuentas propias de Stili van con la «torre» Stili Group (Condo Ad Services) y piden la clave ADM (adm.gs)
  const esStili = typeof admEsStili_ === 'function' && admEsStili_(d.torre) && (admin.gerente || admin.torres == null);   // solo quien ve todas las torres (null = todas)
  const torre = esStili ? ADM_TORRE_STILI : exigirTorre_(admin, d.torre).torre;
  const entidad = clavesSinFormula_(s_(d.entidad).slice(0, 80)), usuario = clavesSinFormula_(s_(d.usuario).slice(0, 120));
  if (!entidad) throw error_('Escriba la entidad (por ejemplo DGII, TSS, EDESUR, Banco Popular).');
  const enlace = s_(d.enlace); if (enlace && !/^https:\/\/[^\s"'<>]+$/i.test(enlace)) throw error_('El enlace debe empezar con https://');
  const nueva = d.clave === undefined || d.clave === null ? null : String(d.clave);
  if (nueva !== null && nueva.length > 500) throw error_('La clave es demasiado larga.');
  const lock = LockService.getScriptLock(); if (!lock.tryLock(20000)) throw error_('Otra operación está en curso. Intente en un momento.');
  try {
    const ahora = new Date().toISOString();
    const cambios = { torre, entidad, usuario, enlace, notas: clavesSinFormula_(s_(d.notas).slice(0, 300)), actualizado_por: s_(admin.nombre), actualizado_en: ahora };
    if (nueva !== null && nueva !== '') cambios.clave = clavesCripto_().cifrar(nueva, clavesLlave_(), clavesIv_());
    if (nueva === '' && d.borrar_clave) cambios.clave = '';
    if (s_(d.id)) {
      const r = clavesFilas_('Claves_Boveda').find(x => s_(x.id) === s_(d.id) && s_(x.estado) !== 'eliminada');
      if (!r) throw error_('No encuentro esa clave.');
      if (!enAlcance_(admin, s_(r.torre))) throw error_('Su usuario no tiene acceso a ' + s_(r.torre) + '.', 'SIN_PERMISO');
      actualizar_('Claves_Boveda', r._fila, cambios);
      clavesAnotar_(admin, cambios.clave !== undefined ? 'cambiar_clave' : 'editar', Object.assign({}, r, cambios), cambios.clave !== undefined ? 'Clave nueva' : 'Datos');
      return s_(r.id);
    }
    const id = idNuevo_('CLV');
    agregar_('Claves_Boveda', Object.assign({ id, estado: 'activa', creado_por: s_(admin.nombre), creado_en: ahora, clave: '' }, cambios));
    clavesAnotar_(admin, 'crear', Object.assign({ id }, cambios), '');
    return id;
  } finally { if (typeof olvidar_ === 'function') olvidar_('Claves_Boveda'); lock.releaseLock(); }
}
function clavesEliminar_(req, admin) {
  clavesExigir_(admin, 3, 'Editar');
  const r = clavesFilas_('Claves_Boveda').find(x => s_(x.id) === s_(req.id) && s_(x.estado) !== 'eliminada');
  if (!r) throw error_('No encuentro esa clave.');
  if (!enAlcance_(admin, s_(r.torre))) throw error_('Su usuario no tiene acceso a ' + s_(r.torre) + '.', 'SIN_PERMISO');
  actualizar_('Claves_Boveda', r._fila, { estado: 'eliminada', clave: '', actualizado_por: s_(admin.nombre), actualizado_en: new Date().toISOString() });   // la clave se borra de verdad
  clavesAnotar_(admin, 'eliminar', r, s_(req.motivo));
  return true;
}
function clavesRegistro_(req, admin) {
  if (!admin.gerente) throw error_('El registro de accesos lo ve Gerencia.', 'SOLO_GERENTE');
  return { registro: clavesFilas_('Claves_Registro').slice(-1000).reverse().map(r => ({ fecha: s_(r.fecha), usuario: s_(r.usuario), accion: s_(r.accion), torre: s_(r.torre), entidad: s_(r.entidad), detalle: s_(r.detalle) })) };
}
function clavesAccion_(req, admin) {
  switch (s_(req.op || 'lista')) {
    case 'lista': return clavesLista_(req, admin);
    case 'ver': return clavesVer_(req, admin);
    case 'guardar': { clavesGuardar_(req, admin); return Object.assign(clavesLista_({ torre: req.torre }, admin), { aviso: 'Guardado.' }); }
    case 'eliminar': { clavesEliminar_(req, admin); return Object.assign(clavesLista_({ torre: req.torre }, admin), { aviso: 'Clave eliminada.' }); }
    case 'registro': return clavesRegistro_(req, admin);
    default: throw error_('Operación desconocida.');
  }
}
Object.assign(ACCIONES_CENTRAL, { claves: req => conAdmin_(req, clavesAccion_) });
Object.assign(ACCESO_ACCION, { claves: ['tor_claves', 1] });
if (typeof SECCIONES !== 'undefined' && !SECCIONES.some(x => x[0] === 'tor_claves')) SECCIONES.push(['tor_claves', 'torres', 'Torres · Gestor de claves',
  'Ver: lista de cuentas de cada torre (entidad y usuario), sin las claves. Profundizar: ver y copiar las claves (cada vista queda anotada). Editar: agregar, cambiar y eliminar claves.', [0, 0, 3]]);
if (typeof SECCIONES_TORRES !== 'undefined' && SECCIONES_TORRES.indexOf('tor_claves') < 0) SECCIONES_TORRES.push('tor_claves');
if (ACCIONES_CENTRAL.portal && !ACCIONES_CENTRAL.portal._claves) {
  const origPortalClaves = ACCIONES_CENTRAL.portal;
  const envPortalClaves = req => {
    const r = origPortalClaves(req);
    try { const v = vistaUsuario_(usuarioDeSolicitud_(req)); if (r && r.accesos) r.accesos.claves = !!(v.gerente || ((v.permisos || {}).tor_claves || 0) > 0); } catch (e) { /* el menú sigue como estaba */ }
    return r;
  };
  envPortalClaves._claves = true; ACCIONES_CENTRAL.portal = envPortalClaves;
}
