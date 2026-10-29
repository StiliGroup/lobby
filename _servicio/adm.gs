/**
 * Stili Soft v3.4.3 · Clave ADM: los datos de Stili Group (Condo Ad Services) solo se ven con la clave ADM.
 *   - Protege: el módulo Empresa (Alegra: compras, conciliación, facturas a clientes, criterio y conexión), las claves propias de Stili
 *     en el Gestor de claves y, en la Nómina, el personal de Stili (la Nómina la valida aquí con la op «abrir»).
 *   - Para entrar hacen falta las DOS cosas: el permiso de esa sección y la clave ADM. Ni Gerencia entra sin la clave.
 *   - Abierta, dura 15 minutos desde el último uso y vale solo para esa sesión (ese equipo). «Cerrar» la cierra antes.
 *   - 5 intentos fallidos → el usuario espera 15 minutos. Cada apertura, intento fallido, bloqueo y cambio queda en Adm_Registro.
 *   - La crea y la cambia el Gerente General. Se guarda solo su huella (HMAC-SHA256 repetido con sal) en las propiedades del script,
 *     nunca la clave. Al cambiarla se cierran todas las aperturas.
 *
 * Archivo nuevo del servicio. Envuelve las acciones de empresa.gs y claves.gs cargue antes o después de ellos (falla cerrado si faltan). Usa de Código.gs: conAdmin_, usuarioDeSolicitud_,
 * vistaUsuario_, error_, s_, agregar_, leerSiExiste_, leer_, olvidar_, iguales_, HOJAS, ACCIONES_CENTRAL, ACCESO_ACCION, SECCIONES.
 */

HOJAS.Adm_Registro = ['fecha', 'usuario', 'accion', 'origen', 'detalle'];
const ADM_MINUTOS = 15, ADM_INTENTOS = 5, ADM_BLOQUEO_MIN = 15, ADM_VUELTAS = 1000, ADM_MIN_LARGO = 10;
const ADM_TORRE_STILI = 'Stili Group (Condo Ad Services)';   // «torre» de las claves propias de Stili en el Gestor de claves

// ================================================================== huella (pura: se prueba en node)
/** hmac(bytes, llaveBytes) → bytes. Huella = HMAC repetido ADM_VUELTAS veces con sal. */
function AdmHuella(hmac, b64e, b64d) {
  const u8 = a => Array.from(a, x => x & 255);
  const utf8 = t => u8(unescape(encodeURIComponent(String(t))).split('').map(c => c.charCodeAt(0)));
  function huella(clave, sal, vueltas) {
    const k = utf8(clave), s = u8(b64d(sal));
    let h = u8(hmac(s.concat(utf8('stili-adm-v1')), k));
    for (let i = 1; i < vueltas; i++) h = u8(hmac(h, k));
    return b64e(h);
  }
  function iguales(a, b) { a = String(a); b = String(b); if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
  function validaNueva(c) {
    c = String(c == null ? '' : c);
    if (c.length < ADM_MIN_LARGO) return 'La clave ADM debe tener al menos ' + ADM_MIN_LARGO + ' caracteres.';
    if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(c) || !/\d/.test(c)) return 'La clave ADM debe combinar letras y números.';
    if (/^(.)\1+$/.test(c) || /^(0123456789|1234567890|abcdefghij)/i.test(c)) return 'Esa clave es demasiado fácil de adivinar.';
    return '';
  }
  return { huella, iguales, validaNueva };
}
function admHuella_() { return AdmHuella((v, k) => Utilities.computeHmacSha256Signature(v, k), b => Utilities.base64Encode(b), t => Utilities.base64Decode(t)); }

// ================================================================== estado
function admProp_() { return PropertiesService.getScriptProperties(); }
function admGuardada_() { try { return JSON.parse(admProp_().getProperty('ADM_CLAVE') || 'null'); } catch (e) { return null; } }
function admConfigurada_() { const g = admGuardada_(); return !!(g && g.h && g.s); }
function admSesionClave_(sesion) {
  return 'adm|' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s_(sesion))).slice(0, 40);
}
function admAnotar_(nombre, accion, origen, detalle) {
  try { agregar_('Adm_Registro', { fecha: new Date().toISOString(), usuario: s_(nombre), accion: accion, origen: s_(origen || 'portal').slice(0, 20), detalle: s_(detalle).slice(0, 200) }); }
  catch (e) { if (accion === 'abrir') throw error_('No se pudo anotar la apertura; por seguridad no se abre.'); }
}
/** ¿Está abierta para esta sesión? Si lo está, renueva los 15 minutos. */
function admAbierta_(req) {
  const sesion = s_(req && req.sesion); if (!sesion) return false;
  const g = admGuardada_(); if (!g) return false;
  const c = CacheService.getScriptCache(), k = admSesionClave_(sesion), v = c.get(k);
  if (!v) return false;
  let d; try { d = JSON.parse(v); } catch (e) { return false; }
  if (Number(d.gen) !== Number(g.gen || 1)) { c.remove(k); return false; }
  c.put(k, v, ADM_MINUTOS * 60);
  return true;
}
function admExigir_(req) {
  if (admAbierta_(req)) return true;
  throw error_(admConfigurada_() ? 'Los datos de Stili (Condo Ad Services) piden la clave ADM.' : 'Los datos de Stili piden la clave ADM, y todavía no está creada. El Gerente General la crea la primera vez que entra.', admConfigurada_() ? 'ADM' : 'ADM_SIN_CONFIGURAR');
}
/** ¿Tiene alguna sección que la clave ADM protege? (Empresa, Gestor de claves o Nómina) */
function admTienePermiso_(admin) {
  if (admin.gerente) return true;
  const p = admin.permisos || {};
  const nom = (typeof SECCIONES !== 'undefined' ? SECCIONES : []).filter(x => x[1] === 'nomina').map(x => x[0]);
  return ['emp_contabilidad', 'tor_claves'].concat(nom).some(k => Number(p[k] || 0) > 0);
}

// ================================================================== acciones
function admAccion_(req, admin) {
  const op = s_(req.op || 'estado'), origen = s_(req.origen) === 'nomina' ? 'nomina' : 'portal';
  const c = CacheService.getScriptCache(), kFallos = 'admfallos|' + s_(admin.id), kBloqueo = 'admbloq|' + s_(admin.id);
  const estado = () => ({ configurada: admConfigurada_(), abierta: admAbierta_(req), minutos: ADM_MINUTOS, puede_configurar: !!admin.general,
    puede_abrir: admTienePermiso_(admin), bloqueado: !!c.get(kBloqueo) });
  switch (op) {
    case 'estado': return estado();
    case 'abrir': {
      if (!admTienePermiso_(admin)) throw error_('Su usuario no tiene ninguna sección con datos de Stili. Pídala al Gerente General.', 'SIN_PERMISO');
      if (!admConfigurada_()) throw error_('La clave ADM todavía no está creada. El Gerente General la crea la primera vez.', 'ADM_SIN_CONFIGURAR');
      // un intento a la vez por todo el servicio: así el contador de fallos no se puede saltar con intentos en paralelo
      const lock = LockService.getScriptLock(); if (!lock.tryLock(15000)) throw error_('Hay otro intento en curso. Pruebe en un momento.');
      try {
      if (c.get(kBloqueo)) throw error_('Demasiados intentos. Espere ' + ADM_BLOQUEO_MIN + ' minutos o pida ayuda al Gerente General.', 'ADM_BLOQUEADO');
      const g = admGuardada_(), H = admHuella_();
      if (!H.iguales(H.huella(String(req.clave == null ? '' : req.clave), g.s, Number(g.v) || ADM_VUELTAS), g.h)) {
        const n = Number(c.get(kFallos) || 0) + 1;
        c.put(kFallos, String(n), ADM_BLOQUEO_MIN * 60);
        admAnotar_(admin.nombre, 'fallo', origen, 'Intento ' + n);
        if (n >= ADM_INTENTOS) { c.put(kBloqueo, '1', ADM_BLOQUEO_MIN * 60); c.remove(kFallos); admAnotar_(admin.nombre, 'bloqueo', origen, ADM_BLOQUEO_MIN + ' minutos'); throw error_('Demasiados intentos. Su usuario espera ' + ADM_BLOQUEO_MIN + ' minutos.', 'ADM_BLOQUEADO'); }
        throw error_('Clave ADM incorrecta. Le quedan ' + (ADM_INTENTOS - n) + ' intentos.', 'ADM_CLAVE');
      }
      c.remove(kFallos);
      admAnotar_(admin.nombre, 'abrir', origen, '');
      c.put(admSesionClave_(req.sesion), JSON.stringify({ u: s_(admin.id), gen: Number(g.gen || 1) }), ADM_MINUTOS * 60);
      return Object.assign(estado(), { abierta: true, aviso: 'Datos de Stili abiertos. Se cierran solos tras ' + ADM_MINUTOS + ' minutos sin uso.' });
      } finally { lock.releaseLock(); }
    }
    case 'cerrar': c.remove(admSesionClave_(req.sesion)); admAnotar_(admin.nombre, 'cerrar', origen, ''); return Object.assign(estado(), { abierta: false });
    case 'configurar': {
      if (!admin.general) throw error_('La clave ADM la crea y la cambia el Gerente General.', 'SOLO_GERENTE');
      const lockC = LockService.getScriptLock(); if (!lockC.tryLock(15000)) throw error_('Hay otro intento en curso. Pruebe en un momento.');
      try {
      const H = admHuella_(), g = admGuardada_();
      if (g) {
        if (c.get(kBloqueo)) throw error_('Demasiados intentos. Espere ' + ADM_BLOQUEO_MIN + ' minutos.', 'ADM_BLOQUEADO');
        if (!H.iguales(H.huella(String(req.actual == null ? '' : req.actual), g.s, Number(g.v) || ADM_VUELTAS), g.h)) {
          const n = Number(c.get(kFallos) || 0) + 1; c.put(kFallos, String(n), ADM_BLOQUEO_MIN * 60);
          admAnotar_(admin.nombre, 'fallo', origen, 'Cambio de clave, intento ' + n);
          if (n >= ADM_INTENTOS) { c.put(kBloqueo, '1', ADM_BLOQUEO_MIN * 60); c.remove(kFallos); }
          throw error_('La clave ADM actual no es correcta.', 'ADM_CLAVE');
        }
      }
      const nueva = String(req.nueva == null ? '' : req.nueva), malo = H.validaNueva(nueva);
      if (malo) throw error_(malo);
      if (nueva !== String(req.repetir == null ? '' : req.repetir)) throw error_('Las dos claves no coinciden.');
      const sal = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Date.now() + Math.random()).slice(0, 16));
      const gen = (g ? Number(g.gen || 1) : 0) + 1;    // al cambiarla se cierran todas las aperturas
      admProp_().setProperty('ADM_CLAVE', JSON.stringify({ h: H.huella(nueva, sal, ADM_VUELTAS), s: sal, v: ADM_VUELTAS, gen: gen, fecha: new Date().toISOString() }));
      c.remove(kFallos);
      admAnotar_(admin.nombre, g ? 'cambiar' : 'crear', origen, '');
      c.put(admSesionClave_(req.sesion), JSON.stringify({ u: s_(admin.id), gen: gen }), ADM_MINUTOS * 60);
      return Object.assign(estado(), { abierta: true, aviso: g ? 'Clave ADM cambiada. Las demás aperturas se cerraron.' : 'Clave ADM creada. Guárdela en un lugar seguro: no se puede recuperar, solo cambiar.' });
      } finally { lockC.releaseLock(); }
    }
    case 'registro': {
      if (!admin.general) throw error_('El registro de la clave ADM lo ve el Gerente General.', 'SOLO_GERENTE');
      const filas = (typeof leerSiExiste_ === 'function' ? leerSiExiste_('Adm_Registro') : leer_('Adm_Registro').filas) || [];
      return Object.assign(estado(), { registro: filas.slice(-500).reverse().map(r => ({ fecha: s_(r.fecha), usuario: s_(r.usuario), accion: s_(r.accion), origen: s_(r.origen), detalle: s_(r.detalle) })) });
    }
    default: throw error_('Operación desconocida.');
  }
}
Object.assign(ACCIONES_CENTRAL, { adm: req => conAdmin_(req, admAccion_) });
// Cualquier usuario con sesión llega a la acción; adentro se exige el permiso (nivel 0 = solo sesión válida).
Object.assign(ACCESO_ACCION, { adm: [['emp_contabilidad'], 0] });

// ================================================================== candados
// Se instalan sin depender del orden de los archivos: si empresa.gs o claves.gs cargan DESPUÉS, su acción se envuelve al asignarse
// (propiedad con «set»); si cargan antes, se envuelve la que ya está. Si falta el módulo, la acción falla cerrada (no sirve datos).
function admProteger_(nombre, envolver) {
  let interna = null;
  const poner = v => { interna = typeof v === 'function' ? (v._adm ? v : Object.assign(envolver(v), { _adm: true })) : null; };
  poner(ACCIONES_CENTRAL[nombre]);
  Object.defineProperty(ACCIONES_CENTRAL, nombre, { configurable: true, enumerable: true,
    get: () => interna || (() => { throw error_('Ese módulo no está instalado en el servicio.'); }), set: poner });
}

// 1) Empresa (Alegra): todo pide la clave ADM.
admProteger_('emp', origEmpAdm => req => conAdmin_(Object.assign({}, req, { accion: 'emp' }), (r, admin) => {
  if (!(admin.gerente || Number((admin.permisos || {}).emp_contabilidad || 0) > 0)) throw error_('Su usuario no tiene acceso a «Stili Group · Empresa». Pídalo al Gerente General.', 'SIN_PERMISO');
  admExigir_(req);
  return origEmpAdm(req);
}));

// 2) Gestor de claves: las cuentas propias de Stili (torre «Stili Group (Condo Ad Services)») piden la clave ADM.
function admEsStili_(torre) { return typeof mismaTorre_ === 'function' ? mismaTorre_(torre, ADM_TORRE_STILI) : s_(torre).toLowerCase() === ADM_TORRE_STILI.toLowerCase(); }
admProteger_('claves', origClavesAdm => req => {
  const op = s_(req.op || 'lista');
  const abierta = admAbierta_(req);
  // ver, guardar o eliminar una clave de Stili: exige la clave ADM
  if (['ver', 'eliminar', 'guardar'].indexOf(op) >= 0) {
    const id = op === 'guardar' ? s_((req.datos || {}).id) : s_(req.id);
    const fila = id ? (clavesFilas_('Claves_Boveda').find(x => s_(x.id) === id) || {}) : {};
    const torre = op === 'guardar' ? s_((req.datos || {}).torre) : '';
    if ((admEsStili_(fila.torre) || admEsStili_(torre)) && !abierta) admExigir_(req);
  }
  // la «torre» de Stili no existe en Torres: se pide la lista completa y se deja solo Stili
  const soloStili = admEsStili_(req.torre);
  if (soloStili && !abierta) admExigir_(req);
  const r = origClavesAdm(soloStili ? Object.assign({}, req, { torre: '' }) : req);
  if (r && Array.isArray(r.registro) && !abierta) r.registro = r.registro.filter(x => !admEsStili_(x.torre));
  if (r && Array.isArray(r.claves)) {
    const ocultas = r.claves.filter(x => admEsStili_(x.torre)).length;
    if (!abierta) r.claves = r.claves.filter(x => !admEsStili_(x.torre));
    if (soloStili) r.claves = r.claves.filter(x => admEsStili_(x.torre));
    if (Array.isArray(r.pendientes)) r.pendientes = r.pendientes.filter(x => abierta ? (!soloStili || admEsStili_(x.torre)) : !admEsStili_(x.torre));
    r.stili = { torre: ADM_TORRE_STILI, ocultas: abierta ? 0 : ocultas, abierta: abierta };
    if (abierta && Array.isArray(r.torres) && r.torres.indexOf(ADM_TORRE_STILI) < 0) r.torres = r.torres.concat([ADM_TORRE_STILI]);
  }
  return r;
});
