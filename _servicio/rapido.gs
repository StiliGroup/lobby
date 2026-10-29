/**
 * Stili Soft v3.5.1 · Velocidad.
 *   - Tablero del Lobby: tardaba ~10 s porque leía las últimas 6.000 visitas una vez por torre (26 veces).
 *     Ahora se leen una sola vez por consulta, y el resultado se guarda 60 s en la caché: todos los que abren el
 *     Lobby en ese minuto lo reciben al instante. La página se refresca sola cada minuto, así que el dato nunca
 *     tiene más de un minuto.
 *   - Lista de torres de la barra (torres_lista): 60 s en caché por usuario.
 * Archivo nuevo del servicio; va al final. No cambia ningún dato: solo evita lecturas repetidas.
 */
const RAPIDO_SEG_TABLERO = 60, RAPIDO_SEG_TORRES = 60;
let _rapidoMemo = null;

// Dentro de una misma consulta, «leer las últimas N filas» de una hoja se hace una sola vez (solo mientras corre el tablero).
const _rapidoLeer = leer_;
leer_ = function (nombre, ultimas) {
  if (ultimas && _rapidoMemo) {
    const k = nombre + '|' + ultimas;
    return _rapidoMemo[k] || (_rapidoMemo[k] = _rapidoLeer(nombre, ultimas));
  }
  return _rapidoLeer(nombre, ultimas);
};

function rapidoCache_(clave, segundos, calcular) {
  const c = CacheService.getScriptCache();
  try { const g = c.get(clave); if (g) return JSON.parse(g); } catch (e) { /* se calcula */ }
  const r = calcular();
  try { const t = JSON.stringify(r); if (t.length < 95000) c.put(clave, t, segundos); } catch (e) { /* sin caché */ }
  return JSON.parse(JSON.stringify(r));   // mismo formato venga o no de la caché (fechas como texto, como llegan a la página)
}

const _rapidoTablero = accionTablero_;
accionTablero_ = function () {
  const args = arguments, self = this;
  return rapidoCache_('rapido|tablero|v1', RAPIDO_SEG_TABLERO, () => {
    _rapidoMemo = {};
    try { return _rapidoTablero.apply(self, args); } finally { _rapidoMemo = null; }
  });
};

if (typeof accionTorresLista_ === 'function') {
  const _rapidoTorresLista = accionTorresLista_;
  accionTorresLista_ = function (req, admin) {
    const quien = rapidoGen_() + '|' + s_(admin && admin.id) + '|' + JSON.stringify((admin && admin.torres) || null) + '|' + JSON.stringify((admin && admin.permisos) || {});
    return rapidoCache_('rapido|torres|' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, quien)).slice(0, 32),
      RAPIDO_SEG_TORRES, () => _rapidoTorresLista(req, admin));
  };
}

// Cualquier cambio (guardar, crear, eliminar, cargar una torre…) invalida la caché: la siguiente consulta se recalcula.
function rapidoGen_() { try { return CacheService.getScriptCache().get('rapido|gen') || '0'; } catch (e) { return '0'; } }
function rapidoOlvidar_() {
  try { const c = CacheService.getScriptCache(); c.put('rapido|gen', String(Date.now()), 21600); c.remove('rapido|tablero|v1'); } catch (e) { /* nada */ }
}
const RAPIDO_LECTURAS = /^(tablero|torres_lista|portal|acceso|sistema|documentos|torres_nombres|adm|emp|claves|gas)$/;
Object.keys(ACCIONES_CENTRAL).forEach(nombre => {
  if (RAPIDO_LECTURAS.test(nombre)) return;
  const d = Object.getOwnPropertyDescriptor(ACCIONES_CENTRAL, nombre);
  if (!d || typeof d.value !== 'function') return;          // las acciones protegidas con «get/set» (adm.gs) no se tocan
  const orig = d.value;
  ACCIONES_CENTRAL[nombre] = function (req) { const r = orig.apply(this, arguments); rapidoOlvidar_(); return r; };
});
