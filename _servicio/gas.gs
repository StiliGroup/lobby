/**
 * Stili Soft v3.5 · Gas: lecturas de medidores, tanque y cobro en el recibo.
 * Diseño propio de Stili (no copia de ningún otro sistema). Por torre y por suministro (una torre puede tener varios tanques):
 *   1. LECTURAS del mes por apartamento, con foto del contador. La IA lee el número de la foto y lo propone; una persona confirma.
 *      Consumo = lectura actual − lectura anterior (la anterior sale sola del mes pasado). Si la actual es menor, se avisa (¿cambio de medidor?).
 *   2. ALERTA de consumo alto: compara con el promedio de los últimos N meses; avisa si sube más del % fijado.
 *   3. TANQUE: compras del mes (galones), consumo del mes convertido a galones con el factor de conversión, disponibilidad acumulada.
 *      Una disponibilidad negativa avisa que faltan compras por registrar.
 *   4. COBRO: por precio fijo, por tabla de rangos (si el consumo no cae en un rango se cobra al precio mayor) o repartiendo la compra
 *      del tanque según el consumo de cada apartamento. Con un clic se crea el concepto «Consumo de gas» (clase gas, separado de las
 *      cuotas ordinarias) en la Contabilidad de la torre. Si ya hay recibos emitidos con ese concepto, las lecturas quedan bloqueadas.
 *   5. REPORTE ANUAL: lectura y consumo de cada apartamento de enero a diciembre, con totales por mes. Sin nombres de residentes.
 *
 * Archivo nuevo del servicio; se registra solo. Requiere contabilidad.gs (Ctb_Conceptos, ctbLeer_, ctbAgregar_, ctbActualizar_, ctbCerrado_).
 * Usa de Código.gs: leer_, leerSiExiste_, agregar_, actualizar_, olvidar_, s_, error_, idNuevo_, mismaTorre_, exigirTorre_, conAdmin_, claude_, partirRespuesta_, TZ.
 */

const GAS_TABLAS = {
  Gas_Suministros: ['id', 'torre', 'nombre', 'activo', 'unidad', 'factor_galon', 'metodo', 'precio', 'rangos', 'alerta_meses', 'alerta_pct',
    'tanque_inicial', 'tanque_desde', 'rubro', 'creado_en', 'actualizado_en'],
  Gas_Lecturas: ['id', 'torre', 'suministro_id', 'periodo', 'apartamento', 'fecha', 'lectura', 'anterior', 'consumo', 'foto_id', 'foto_url', 'ia', 'origen',
    'estado', 'por', 'actualizado_en'],
  Gas_Compras: ['id', 'torre', 'suministro_id', 'periodo', 'fecha', 'galones', 'monto', 'suplidor', 'cxp_id', 'nota', 'estado', 'por', 'creado_en'],
};
Object.keys(GAS_TABLAS).forEach(k => { HOJAS[k] = GAS_TABLAS[k]; });

// ================================================================== reglas (funciones puras, se prueban en node)
const Gas = (() => {
  const n = v => { const x = Number(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(x) ? x : 0; };
  const r3 = v => Math.round(n(v) * 1000) / 1000;
  const r2 = v => Math.round(n(v) * 100) / 100;
  const vacio = v => v === null || v === undefined || String(v).trim() === '';
  /** Número de una lectura: acepta 1,234.567 (miles) y 1234,567 (coma decimal). Lo que no es número da NaN (no 0). */
  function lectura(v) {
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    let t = String(v == null ? '' : v).trim().replace(/\s/g, '');
    if (!t) return NaN;
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, '');
    else if (/^\d+,\d{1,3}$/.test(t)) t = t.replace(',', '.');
    return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
  }
  const periodoAnterior = per => { const m = String(per).match(/^(\d{4})-(\d{2})$/); if (!m) return ''; const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 2, 1)); return d.toISOString().slice(0, 7); };
  const mesesAtras = (per, k) => { let p = per; const out = []; for (let i = 0; i < k; i++) { p = periodoAnterior(p); out.push(p); } return out; };

  /** Consumo del mes. Si la lectura actual es menor que la anterior, no se inventa un consumo: se avisa. */
  function consumo(actual, anterior) {
    if (vacio(actual)) return { consumo: null, problema: '' };
    if (vacio(anterior)) return { consumo: null, problema: 'sin_anterior' };
    const c = r3(n(actual) - n(anterior));
    return c < 0 ? { consumo: null, problema: 'menor' } : { consumo: c, problema: '' };
  }
  const aGalones = (m3, factor) => r3(n(m3) * n(factor) / 100);
  /**
   * Precio por tabla de rangos. Cada rango va desde su «desde» hasta el «desde» del siguiente (así 10.5 entre 0–10 y 11–20 cae en el primero).
   * Por encima del último rango (si tiene tope) o por debajo del primero, se cobra el precio mayor.
   */
  function precioRango(c, rangos) {
    const lista = (rangos || []).map(x => ({ desde: n(x.desde), hasta: vacio(x.hasta) ? Infinity : n(x.hasta), precio: n(x.precio) })).filter(x => x.precio > 0).sort((a, b) => a.desde - b.desde);
    if (!lista.length) return 0;
    let i = -1; lista.forEach((x, k) => { if (c >= x.desde) i = k; });
    const mayor = Math.max.apply(null, lista.map(x => x.precio));
    if (i < 0) return mayor;
    if (i === lista.length - 1 && c > lista[i].hasta) return mayor;
    return lista[i].precio;
  }
  /** Reparte un total en centavos exactos según pesos (los centavos sobrantes van a los residuos mayores). */
  function repartir(total, pesos) {
    const t = Math.round(n(total) * 100), suma = pesos.reduce((a, b) => a + b, 0);
    if (!suma || !t) return pesos.map(() => 0);
    const partes = pesos.map(w => Math.floor(t * w / suma)); let usado = partes.reduce((a, b) => a + b, 0);
    const resto = pesos.map((w, i) => [t * w / suma - partes[i], i]).sort((a, b) => b[0] - a[0]);
    for (let j = 0; usado < t; j++, usado++) partes[resto[j % resto.length][1]]++;
    return partes.map(x => x / 100);
  }
  /**
   * Cargo de cada apartamento. sum = suministro; lect = [{apartamento, consumo}] (consumo en m³); compraMes = monto comprado en el período.
   * metodo: precio (consumo × precio) · rangos (consumo × precio del rango) · disponibilidad (la compra del mes se reparte según el consumo).
   * unidad 'gal': el consumo se convierte a galones con factor_galon antes de multiplicar.
   */
  function cargos(sum, lect, compraMes) {
    const base = l => (sum.unidad === 'gal' ? aGalones(l.consumo, sum.factor_galon) : r3(l.consumo));
    const validas = (lect || []).filter(l => l.consumo != null && n(l.consumo) >= 0);
    const out = {};
    if (sum.metodo === 'disponibilidad') {
      const partes = repartir(compraMes, validas.map(l => n(l.consumo)));
      validas.forEach((l, i) => { out[l.apartamento] = { base: base(l), precio: null, monto: partes[i] }; });
    } else {
      const rangos = typeof sum.rangos === 'string' ? (() => { try { return JSON.parse(sum.rangos || '[]'); } catch (e) { return []; } })() : (sum.rangos || []);
      validas.forEach(l => { const b = base(l), p = sum.metodo === 'rangos' ? precioRango(b, rangos) : n(sum.precio); out[l.apartamento] = { base: b, precio: p, monto: r2(b * p) }; });
    }
    return out;
  }
  /** Alerta de consumo alto: promedio de los últimos `meses` (solo meses con dato) y % de aumento. */
  function alerta(c, historial, meses, pct) {
    const h = (historial || []).filter(x => x != null && n(x) > 0).slice(0, Math.max(1, n(meses) || 3));
    if (c == null || !h.length || !(n(pct) > 0)) return null;
    const prom = h.reduce((a, b) => a + n(b), 0) / h.length;
    const aumento = Math.round((c - prom) / prom * 100);
    return aumento > n(pct) ? { nivel: 'alerta', aumento, promedio: r3(prom), meses: h.length } : { nivel: 'normal', aumento, promedio: r3(prom), meses: h.length };
  }
  /** Tanque mes a mes desde `desde`: compras (gal), consumo (m³ → gal con el factor) y disponibilidad acumulada. */
  function tanque(sum, compras, consumoPorMes, hasta) {
    const desde = String(sum.tanque_desde || ''), out = [];
    if (!/^\d{4}-\d{2}$/.test(desde)) return out;
    let disp = n(sum.tanque_inicial), p = desde;
    for (let i = 0; i < 120 && p <= hasta; i++) {
      const compra = r3((compras || []).filter(x => x.periodo === p && x.estado !== 'anulada').reduce((a, x) => a + n(x.galones), 0));
      const cons = aGalones(consumoPorMes[p] || 0, n(sum.factor_galon) || 100);
      disp = r3(disp + compra - cons);
      out.push({ periodo: p, compra_gal: compra, consumo_gal: cons, disponible: disp, negativo: disp < 0 });
      const d = new Date(Date.UTC(Number(p.slice(0, 4)), Number(p.slice(5, 7)), 1)); p = d.toISOString().slice(0, 7);
    }
    return out;
  }
  /** Reporte anual: por apartamento, lectura y consumo de enero a diciembre, y totales de consumo por mes. */
  function reporteAnual(lecturas, aptos, anio) {
    const meses = Array.from({ length: 12 }, (_, i) => anio + '-' + String(i + 1).padStart(2, '0'));
    const filas = (aptos || []).map(a => {
      const de = meses.map(m => (lecturas || []).find(l => l.apartamento === a && l.periodo === m && l.estado !== 'anulada'));
      return { apartamento: a, lecturas: de.map(l => l && !vacio(l.lectura) ? r3(l.lectura) : null), consumos: de.map(l => l && !vacio(l.consumo) ? r3(l.consumo) : null) };
    });
    const totales = meses.map((m, i) => r3(filas.reduce((s, f) => s + n(f.consumos[i]), 0)));
    return { anio: String(anio), meses, filas, totales, total: r3(totales.reduce((a, b) => a + b, 0)) };
  }
  /** Lee un CSV o texto pegado de Excel: apartamento; lectura; (fecha). Acepta coma, punto y coma o tabulador. */
  function leerCsv(texto) {
    const out = [], errores = [];
    String(texto || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean).forEach((linea, i) => {
      let c = (/[\t;]/.test(linea) ? linea.split(/[\t;]/) : linea.split(',')).map(x => x.trim());
      if (!/[\t;]/.test(linea) && c.length === 3 && /^\d{1,3}$/.test(c[2])) c = [c[0], c[1] + ',' + c[2]];   // «A03,1234,56» = coma decimal
      const apto = String(c[0] || '').toUpperCase().replace(/^(APTO|APARTAMENTO|DEPARTAMENTO|DPTO)\.?\s*/i, '');
      const lect = lectura(c[1]);
      if (i === 0 && !/\d/.test(c[1] || '')) return;            // encabezado
      if (!apto || !(lect >= 0)) { errores.push('Línea ' + (i + 1) + ': «' + linea.slice(0, 40) + '»'); return; }
      out.push({ apartamento: apto, lectura: lect, fecha: /^\d{4}-\d{2}-\d{2}$/.test(c[2] || '') ? c[2] : '' });
    });
    return { filas: out, errores };
  }
  return { n, r2, r3, lectura, periodoAnterior, mesesAtras, consumo, aGalones, precioRango, repartir, cargos, alerta, tanque, reporteAnual, leerCsv };
})();

// ================================================================== utilidades del servicio
const gasSinFormula_ = v => { const t = s_(v); return /^[=+\-@]/.test(t) ? "'" + t : t; };
function gasFilas_(hoja) { if (typeof olvidar_ === 'function') olvidar_(hoja); return (typeof leerSiExiste_ === 'function' ? leerSiExiste_(hoja) : leer_(hoja).filas) || []; }
function gasActualizar_(hoja, id, cambios) {
  const r = gasFilas_(hoja).find(x => s_(x.id) === s_(id)); if (!r) return null;
  const c = {}; Object.keys(cambios).forEach(k => { c[k] = typeof cambios[k] === 'number' ? cambios[k] : gasSinFormula_(cambios[k]); });
  if (GAS_TABLAS[hoja].indexOf('actualizado_en') >= 0) c.actualizado_en = new Date().toISOString();
  actualizar_(hoja, r._fila, c); if (typeof olvidar_ === 'function') olvidar_(hoja);
  return Object.assign(r, c);
}
function gasActualizarFila_(hoja, fila, cambios) {   // fila ya conocida: sin releer la hoja (para guardar muchas de una vez)
  const c = {}; Object.keys(cambios).forEach(k => { c[k] = typeof cambios[k] === 'number' ? cambios[k] : gasSinFormula_(cambios[k]); });
  if (GAS_TABLAS[hoja].indexOf('actualizado_en') >= 0) c.actualizado_en = new Date().toISOString();
  actualizar_(hoja, fila, c);
}
function gasConLock_(fn) { const l = LockService.getScriptLock(); if (!l.tryLock(25000)) throw error_('Otra operación está en curso. Intente en un momento.'); try { return fn(); } finally { l.releaseLock(); } }
function gasAptos_(torre) { return leer_('Apartamentos').filas.filter(a => mismaTorre_(a.torre, torre) && !(typeof esNo_ === 'function' && esNo_(a.activo))).map(a => s_(a.apartamento).toUpperCase()).filter(Boolean).sort((a, b) => a.localeCompare(b, 'es', { numeric: true })); }
function gasPuede_(admin, nivel) { return !!(admin.gerente || ((admin.permisos || {}).tor_gas || 0) >= nivel); }
function gasPeriodo_(p) { const t = s_(p); if (!/^\d{4}-\d{2}$/.test(t)) throw error_('Elija el mes.'); return t; }
function gasSuministro_(torre, id) {
  const s = gasFilas_('Gas_Suministros').find(x => s_(x.id) === s_(id) && mismaTorre_(x.torre, torre));
  if (!s) throw error_('Elija el suministro de gas.');
  return gasNormSum_(s);
}
function gasNormSum_(s) {
  let rangos = []; try { rangos = JSON.parse(s_(s.rangos) || '[]'); } catch (e) { rangos = []; }
  return { id: s_(s.id), torre: s_(s.torre), nombre: s_(s.nombre), activo: s_(s.activo) !== 'no', unidad: s_(s.unidad) === 'gal' ? 'gal' : 'm3', factor_galon: Gas.n(s.factor_galon),
    metodo: ['precio', 'rangos', 'disponibilidad'].indexOf(s_(s.metodo)) >= 0 ? s_(s.metodo) : 'precio', precio: Gas.n(s.precio), rangos,
    alerta_meses: Gas.n(s.alerta_meses) || 3, alerta_pct: Gas.n(s.alerta_pct), tanque_inicial: Gas.n(s.tanque_inicial), tanque_desde: s_(s.tanque_desde), rubro: s_(s.rubro) || 'I1.2' };
}
function gasLecturasDe_(torre, sumId) {
  return gasFilas_('Gas_Lecturas').filter(l => mismaTorre_(l.torre, torre) && s_(l.suministro_id) === s_(sumId) && s_(l.estado) !== 'anulada').map(l => ({
    id: s_(l.id), periodo: s_(l.periodo), apartamento: s_(l.apartamento).toUpperCase(), fecha: l.fecha instanceof Date ? Utilities.formatDate(l.fecha, TZ, 'yyyy-MM-dd') : s_(l.fecha),
    lectura: s_(l.lectura) === '' ? '' : Gas.r3(l.lectura), anterior: s_(l.anterior) === '' ? '' : Gas.r3(l.anterior), consumo: s_(l.consumo) === '' ? '' : Gas.r3(l.consumo),
    foto_url: s_(l.foto_url), ia: (() => { try { return JSON.parse(s_(l.ia) || 'null'); } catch (e) { return null; } })(), origen: s_(l.origen), estado: s_(l.estado), por: s_(l.por), _fila: l._fila }));
}
/** Lectura anterior de un apartamento: la última registrada antes del período. */
function gasAnterior_(lecturas, apto, periodo) {
  const prev = lecturas.filter(l => l.apartamento === apto && l.periodo < periodo && s_(l.lectura) !== '').sort((a, b) => b.periodo.localeCompare(a.periodo))[0];
  return prev ? prev.lectura : '';
}
/**
 * La anterior de cada lectura se calcula siempre de la lectura del mes previo (así, si se corrige o se carga tarde un mes, el siguiente se entera).
 * Solo cuando se cambió el medidor se guarda la anterior escrita a mano (columna «anterior»), y esa manda.
 * Devuelve las lecturas con anterior y consumo recalculados.
 */
function gasConConsumos_(todas) {
  return todas.map(l => {
    const ant = s_(l.anterior) !== '' ? l.anterior : gasAnterior_(todas, l.apartamento, l.periodo);
    const cs = Gas.consumo(l.lectura, ant);
    return Object.assign({}, l, { anterior: ant, anterior_manual: s_(l.anterior) !== '', consumo: cs.consumo == null ? '' : cs.consumo, problema: cs.problema });
  });
}
/** Clave fija del concepto de gas en la Contabilidad (no depende del nombre, que se puede editar). */
const gasClave_ = sumId => 'gas:' + sumId;
function gasConcepto_(torre, periodo, sumId) {
  return ctbLeer_('conceptos', torre).find(c => c.periodo === periodo && c.estado !== 'anulado' && (s_(c.parametro) === gasClave_(sumId) || String(c.nombre || '').indexOf('[gas:' + sumId + ']') >= 0));
}
/** ¿El concepto de gas de ese mes ya está en recibos emitidos? Entonces las lecturas no se tocan. */
function gasFacturado_(torre, periodo, sumId) {
  if (typeof ctbLeer_ !== 'function') return false;
  const k = gasConcepto_(torre, periodo, sumId);
  if (!k) return false;
  return ctbLeer_('recibos', torre).some(r => r.periodo === periodo && r.estado !== 'anulado' && (r.lineas || []).some(l => l.concepto_id === k.id));
}

// ================================================================== datos para la pantalla
function gasDatos_(req, admin) {
  const torre = exigirTorre_(admin, req.torre).torre, periodo = gasPeriodo_(req.periodo);
  const sums = gasFilas_('Gas_Suministros').filter(s => mismaTorre_(s.torre, torre)).map(gasNormSum_);
  const sum = sums.find(s => s.id === s_(req.suministro_id)) || sums.find(s => s.activo) || null;
  const aptos = gasAptos_(torre);
  const out = { torre, periodo, aptos, suministros: sums, suministro: sum, puede_editar: gasPuede_(admin, 3), lecturas: [], tanque: [], compras: [], reporte: null, facturado: false, cargos: {} };
  if (!sum) return out;
  const todas = gasConConsumos_(gasLecturasDe_(torre, sum.id));
  const delMes = {}; todas.filter(l => l.periodo === periodo).forEach(l => { delMes[l.apartamento] = l; });
  // historial de consumo por apartamento para la alerta (meses anteriores al período)
  const atras = Gas.mesesAtras(periodo, Math.max(1, sum.alerta_meses));
  out.lecturas = aptos.concat(Object.keys(delMes).filter(a => aptos.indexOf(a) < 0)).map(a => {
    const l = delMes[a] || {}, anterior = delMes[a] ? l.anterior : gasAnterior_(todas, a, periodo);
    const cs = Gas.consumo(l.lectura, anterior);
    const hist = atras.map(p => { const x = todas.find(y => y.apartamento === a && y.periodo === p); return x && s_(x.consumo) !== '' ? Number(x.consumo) : null; });
    return { apartamento: a, id: l.id || '', fecha: l.fecha || '', lectura: s_(l.lectura) === '' ? '' : l.lectura, anterior, anterior_manual: !!l.anterior_manual, consumo: cs.consumo, problema: cs.problema,
      foto_url: l.foto_url || '', ia: l.ia || null, origen: l.origen || '', por: l.por || '', alerta: Gas.alerta(cs.consumo, hist, sum.alerta_meses, sum.alerta_pct), fuera_de_lista: aptos.indexOf(a) < 0 };
  });
  out.compras = gasFilas_('Gas_Compras').filter(c => mismaTorre_(c.torre, torre) && s_(c.suministro_id) === sum.id).map(c => ({ id: s_(c.id), periodo: s_(c.periodo), fecha: c.fecha instanceof Date ? Utilities.formatDate(c.fecha, TZ, 'yyyy-MM-dd') : s_(c.fecha),
    galones: Gas.n(c.galones), monto: Gas.n(c.monto), suplidor: s_(c.suplidor), cxp_id: s_(c.cxp_id), nota: s_(c.nota), estado: s_(c.estado) || 'activa' })).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const porMes = {}; todas.forEach(l => { if (s_(l.consumo) !== '') porMes[l.periodo] = Gas.r3((porMes[l.periodo] || 0) + Number(l.consumo)); });
  out.consumo_por_mes = porMes;
  out.tanque = Gas.tanque(sum, out.compras, porMes, periodo);
  const compraMes = out.compras.filter(c => c.periodo === periodo && c.estado !== 'anulada').reduce((a, c) => a + c.monto, 0);
  out.compra_mes = Gas.r2(compraMes);
  out.cargos = Gas.cargos(sum, out.lecturas, compraMes);
  out.facturado = gasFacturado_(torre, periodo, sum.id);
  out.reporte = Gas.reporteAnual(todas, aptos, periodo.slice(0, 4));
  return out;
}

// ================================================================== acciones
function gasGuardarSuministro_(req, admin) {
  const torre = exigirTorre_(admin, req.torre).torre, d = req.datos || {};
  const nombre = gasSinFormula_(s_(d.nombre).slice(0, 60)) || 'Gas';
  const rangos = (Array.isArray(d.rangos) ? d.rangos : []).map(r => ({ desde: Gas.n(r.desde), hasta: s_(r.hasta) === '' ? '' : Gas.n(r.hasta), precio: Gas.n(r.precio) })).filter(r => r.precio > 0).slice(0, 20);
  const metodo = ['precio', 'rangos', 'disponibilidad'].indexOf(s_(d.metodo)) >= 0 ? s_(d.metodo) : 'precio';
  if (metodo === 'precio' && !(Gas.n(d.precio) > 0)) throw error_('Escriba el precio por unidad.');
  if (metodo === 'rangos' && !rangos.length) throw error_('Agregue al menos un rango con su precio.');
  if (s_(d.unidad) === 'gal' && !(Gas.n(d.factor_galon) > 0)) throw error_('Para cobrar en galones escriba el factor de conversión.');
  if (s_(d.tanque_desde) && !/^\d{4}-\d{2}$/.test(s_(d.tanque_desde))) throw error_('El mes inicial del tanque no es válido.');
  const campos = { torre, nombre, activo: d.activo === 'no' ? 'no' : 'si', unidad: s_(d.unidad) === 'gal' ? 'gal' : 'm3', factor_galon: Gas.n(d.factor_galon), metodo, precio: Gas.n(d.precio),
    rangos: JSON.stringify(rangos), alerta_meses: Math.min(12, Math.max(1, Gas.n(d.alerta_meses) || 3)), alerta_pct: Math.min(500, Math.max(0, Gas.n(d.alerta_pct))), tanque_inicial: Gas.n(d.tanque_inicial),
    tanque_desde: s_(d.tanque_desde) };
  if (/^I\d+(\.\d+)?$/.test(s_(d.rubro))) campos.rubro = s_(d.rubro); else if (!s_(d.id)) campos.rubro = 'I1.2';   // al editar sin rubro, se conserva el que tenía
  return gasConLock_(() => {
    if (s_(d.id)) { const s = gasFilas_('Gas_Suministros').find(x => s_(x.id) === s_(d.id) && mismaTorre_(x.torre, torre)); if (!s) throw error_('No encuentro ese suministro.'); gasActualizar_('Gas_Suministros', d.id, campos); return s_(d.id); }
    const id = idNuevo_('GAS'); agregar_('Gas_Suministros', Object.assign({ id, creado_en: new Date().toISOString(), actualizado_en: new Date().toISOString() }, campos)); if (typeof olvidar_ === 'function') olvidar_('Gas_Suministros'); return id;
  });
}
/** Guarda las lecturas del mes (una o muchas). Valida cada una; las que no pasan se devuelven con su motivo. */
function gasGuardarLecturas_(req, admin) {
  const torre = exigirTorre_(admin, req.torre).torre, periodo = gasPeriodo_(req.periodo), sum = gasSuministro_(torre, req.suministro_id);
  const aptos = gasAptos_(torre), lista = Array.isArray(req.lecturas) ? req.lecturas.slice(0, 600) : [];
  if (typeof ctbCerrado_ === 'function' && ctbCerrado_(torre, periodo)) throw error_('El mes ' + periodo + ' de ' + torre + ' está cerrado.');
  return gasConLock_(() => {
    if (gasFacturado_(torre, periodo, sum.id)) throw error_('Las lecturas de ' + periodo + ' ya se cobraron en recibos emitidos. Para cambiarlas, anule primero esos recibos.');
    const todas = gasConConsumos_(gasLecturasDe_(torre, sum.id)), hechos = [], rechazos = [];
    const unicas = {}; lista.forEach(x => { const a = s_(x.apartamento).toUpperCase(); if (a) unicas[a] = x; });   // si un apartamento viene dos veces, vale la última
    Object.keys(unicas).forEach(apto => {
      const x = unicas[apto];
      if (aptos.length && aptos.indexOf(apto) < 0) { rechazos.push({ apartamento: apto, motivo: 'No está en la lista de apartamentos de la torre.' }); return; }
      const borrar = s_(x.lectura) === '';
      const lect = borrar ? '' : Gas.r3(Gas.lectura(x.lectura));
      if (!borrar && !(Gas.lectura(x.lectura) >= 0)) { rechazos.push({ apartamento: apto, motivo: 'Lectura no válida: «' + s_(x.lectura).slice(0, 20) + '».' }); return; }
      const actual = todas.find(l => l.apartamento === apto && l.periodo === periodo);
      // el mes siguiente usa esta lectura como anterior: si ya se cobró, no se puede cambiar
      const sig = todas.filter(l => l.apartamento === apto && l.periodo > periodo && s_(l.lectura) !== '' && !l.anterior_manual).sort((a, b) => a.periodo.localeCompare(b.periodo))[0];
      if (sig && gasFacturado_(torre, sig.periodo, sum.id)) { rechazos.push({ apartamento: apto, motivo: 'Cambiaría el consumo de ' + sig.periodo + ', que ya se cobró en recibos emitidos.' }); return; }
      const manual = s_(x.anterior) !== '' ? Gas.lectura(x.anterior) : (actual && actual.anterior_manual ? actual.anterior : NaN);
      if (s_(x.anterior) !== '' && !(manual >= 0)) { rechazos.push({ apartamento: apto, motivo: 'La lectura anterior del medidor nuevo no es válida.' }); return; }
      const anterior = manual >= 0 ? Gas.r3(manual) : gasAnterior_(todas, apto, periodo);
      const cs = Gas.consumo(lect, anterior);
      if (!borrar && cs.problema === 'menor') { rechazos.push({ apartamento: apto, menor: true, lectura: lect, anterior, motivo: 'La lectura (' + lect + ') es menor que la anterior (' + anterior + '). Si cambiaron el medidor, escriba la lectura con la que empezó el medidor nuevo.' }); return; }
      const fila = { torre, suministro_id: sum.id, periodo, apartamento: apto, fecha: /^\d{4}-\d{2}-\d{2}$/.test(s_(x.fecha)) ? s_(x.fecha) : (actual && actual.fecha) || Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'),
        lectura: lect, anterior: manual >= 0 ? Gas.r3(manual) : '', consumo: cs.consumo == null ? '' : cs.consumo, origen: gasSinFormula_(s_(x.origen).slice(0, 20)) || 'pantalla', por: s_(admin.nombre), estado: borrar ? 'anulada' : 'registrada' };
      if (actual) gasActualizarFila_('Gas_Lecturas', actual._fila, fila);
      else if (!borrar) agregar_('Gas_Lecturas', Object.assign({ id: idNuevo_('GLE'), foto_id: '', foto_url: '', ia: '', actualizado_en: new Date().toISOString() }, fila));
      hechos.push(apto);
    });
    if (typeof olvidar_ === 'function') olvidar_('Gas_Lecturas');
    return { guardadas: hechos.length, rechazos };
  });
}
/** Foto del contador: se guarda en Drive y la IA propone el número (una persona lo confirma en la pantalla). */
function gasFoto_(req, admin) {
  const torre = exigirTorre_(admin, req.torre).torre, periodo = gasPeriodo_(req.periodo), sum = gasSuministro_(torre, req.suministro_id);
  const apto = s_(req.apartamento).toUpperCase(), mime = s_(req.mime);
  if (!apto) throw error_('Falta el apartamento.');
  if (!/^image\/(jpeg|png|webp)$/.test(mime)) throw error_('Use una foto JPG o PNG.');
  const bytes = Utilities.base64Decode(s_(req.contenido)); if (bytes.length > 8 * 1024 * 1024) throw error_('La foto pasa de 8 MB.');
  const carpeta = gasCarpeta_(torre, periodo), f = carpeta.createFile(Utilities.newBlob(bytes, mime, apto + ' ' + periodo + ' ' + sum.nombre + '.' + mime.split('/')[1]));
  let ia = null;
  try {
    const r = claude_('Usted lee contadores de gas con exactitud.', [{ type: 'image', source: { type: 'base64', media_type: mime, data: Utilities.base64Encode(bytes) } },
      { type: 'text', text: 'Lea el número del contador (medidor de gas) de esta foto, en m³ con sus decimales si se ven (los dígitos rojos o después de la coma son decimales). Responda SOLO ```json {"lectura": número o null, "confianza": "alta|media|baja", "nota": "una frase"}```' }], 300);
    const d = partirRespuesta_(r.texto).datos || {};
    ia = { lectura: d.lectura === null || d.lectura === undefined || d.lectura === '' ? null : Gas.r3(d.lectura), confianza: ['alta', 'media', 'baja'].indexOf(s_(d.confianza)) >= 0 ? s_(d.confianza) : 'baja', nota: s_(d.nota).slice(0, 140) };
  } catch (e) { ia = { lectura: null, confianza: 'baja', nota: 'La IA no pudo leer la foto.' }; }
  gasConLock_(() => {
    const actual = gasLecturasDe_(torre, sum.id).find(l => l.apartamento === apto && l.periodo === periodo);
    if (actual) gasActualizar_('Gas_Lecturas', actual.id, { foto_id: f.getId(), foto_url: f.getUrl(), ia: JSON.stringify(ia) });
    else { agregar_('Gas_Lecturas', { id: idNuevo_('GLE'), torre, suministro_id: sum.id, periodo, apartamento: apto, fecha: Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'), lectura: '', anterior: '', consumo: '',
      foto_id: f.getId(), foto_url: f.getUrl(), ia: JSON.stringify(ia), origen: 'foto', estado: 'registrada', por: s_(admin.nombre), actualizado_en: new Date().toISOString() }); if (typeof olvidar_ === 'function') olvidar_('Gas_Lecturas'); }
  });
  return { apartamento: apto, foto_url: f.getUrl(), ia };
}
function gasCarpeta_(torre, periodo) {
  const props = PropertiesService.getScriptProperties(); let raiz = null; const id = props.getProperty('GAS_CARPETA_ID');
  if (id) try { raiz = DriveApp.getFolderById(id); } catch (e) { raiz = null; }
  if (!raiz) { const it = DriveApp.getFoldersByName('Gas · fotos de lecturas'); raiz = it.hasNext() ? it.next() : DriveApp.createFolder('Gas · fotos de lecturas'); props.setProperty('GAS_CARPETA_ID', raiz.getId()); }
  const sub = (p, nombre) => { const it = p.getFoldersByName(nombre); return it.hasNext() ? it.next() : p.createFolder(nombre); };
  return sub(sub(raiz, torre), periodo);
}
function gasExigirCompraLibre_(torre, sum, periodo) {
  if (typeof ctbCerrado_ === 'function' && ctbCerrado_(torre, periodo)) throw error_('El mes ' + periodo + ' de ' + torre + ' está cerrado.');
  if (sum.metodo === 'disponibilidad' && gasFacturado_(torre, periodo, sum.id)) throw error_('El gas de ' + periodo + ' ya se cobró repartiendo las compras de ese mes: no se pueden cambiar.');
}
function gasGuardarCompra_(req, admin) {
  const torre = exigirTorre_(admin, req.torre).torre, sum = gasSuministro_(torre, req.suministro_id), d = req.datos || {};
  if (d.anular) return gasConLock_(() => { const c = gasFilas_('Gas_Compras').find(x => s_(x.id) === s_(d.id) && mismaTorre_(x.torre, torre)); if (!c) throw error_('No encuentro esa compra.'); gasExigirCompraLibre_(torre, sum, s_(c.periodo)); gasActualizar_('Gas_Compras', d.id, { estado: 'anulada', nota: (s_(c.nota) + ' · anulada por ' + s_(admin.nombre)).slice(0, 200) }); return true; });
  const fecha = s_(d.fecha); if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw error_('Escriba la fecha de la compra.');
  if (!(Gas.n(d.galones) > 0)) throw error_('Escriba los galones comprados.');
  return gasConLock_(() => {
    gasExigirCompraLibre_(torre, sum, fecha.slice(0, 7));
    agregar_('Gas_Compras', { id: idNuevo_('GCO'), torre, suministro_id: sum.id, periodo: fecha.slice(0, 7), fecha, galones: Gas.r3(d.galones), monto: Gas.r2(d.monto), suplidor: gasSinFormula_(s_(d.suplidor).slice(0, 80)),
      cxp_id: gasSinFormula_(s_(d.cxp_id).slice(0, 40)), nota: gasSinFormula_(s_(d.nota).slice(0, 200)), estado: 'activa', por: s_(admin.nombre), creado_en: new Date().toISOString() });
    if (typeof olvidar_ === 'function') olvidar_('Gas_Compras');
    return true;
  });
}
/** Crea o actualiza el concepto «Consumo de gas» del mes en la Contabilidad de la torre (reparto por apartamento, clase gas). */
function gasCobrar_(req, admin) {
  if (typeof ctbLeer_ !== 'function') throw error_('Falta la Contabilidad de las torres en el servicio.');
  const torre = exigirTorre_(admin, req.torre).torre, periodo = gasPeriodo_(req.periodo), sum = gasSuministro_(torre, req.suministro_id);
  if (typeof ctbCerrado_ === 'function' && ctbCerrado_(torre, periodo)) throw error_('El mes ' + periodo + ' de ' + torre + ' está cerrado.');
  return gasConLock_(() => {
    if (gasFacturado_(torre, periodo, sum.id)) throw error_('El gas de ' + periodo + ' ya está en recibos emitidos.');
    const d = gasDatos_(req, admin), montos = {};
    const sinLeer = d.lecturas.filter(l => !l.fuera_de_lista && (l.consumo == null)).map(l => l.apartamento);
    if (sinLeer.length && sum.metodo === 'disponibilidad') throw error_('Para repartir la compra del tanque hacen falta todas las lecturas (si falta alguna, los demás pagarían su parte). Faltan: ' + sinLeer.slice(0, 15).join(', ') + '.');
    if (sinLeer.length && !req.confirmar) throw error_('Faltan lecturas (o hay lecturas con problema) en: ' + sinLeer.slice(0, 15).join(', ') + (sinLeer.length > 15 ? '…' : '') + '. Complételas o confirme para cobrar solo a los demás.', 'FALTAN_LECTURAS');
    if (sum.metodo === 'disponibilidad' && !(d.compra_mes > 0)) throw error_('No hay compras de gas registradas en ' + periodo + ' para repartir.');
    const enLista = new Set(d.aptos);   // los recibos solo cobran a los apartamentos activos de la torre
    Object.keys(d.cargos).forEach(a => { if (enLista.has(a) && d.cargos[a].monto > 0) montos[a] = d.cargos[a].monto; });
    const total = Gas.r2(Object.keys(montos).reduce((s, a) => s + montos[a], 0));
    if (!(total > 0)) throw error_('No hay nada que cobrar: revise las lecturas y el precio.');
    const nombre = 'Consumo de gas · ' + sum.nombre + ' [gas:' + sum.id + ']';
    const existe = gasConcepto_(torre, periodo, sum.id);
    const datos = { nombre, rubro: sum.rubro, reparto: 'unidad', tipo: 'ordinaria', clase: 'gas', monto: total, montos, parametro: gasClave_(sum.id), precio: '', lecturas: {} };
    if (existe) { ctbActualizar_('conceptos', existe._fila, datos); if (typeof ctbAuditar_ === 'function') ctbAuditar_(torre, admin, 'editar', 'conceptos', existe.id, { monto: existe.monto }, { monto: total, origen: 'gas' }); }
    else { const id = idNuevo_('CON'); ctbAgregar_('conceptos', Object.assign({ id, torre, periodo, estado: 'activo', creado_por: s_(admin.nombre), creado_en: new Date().toISOString() }, datos)); if (typeof ctbAuditar_ === 'function') ctbAuditar_(torre, admin, 'crear', 'conceptos', id, null, { monto: total, origen: 'gas' }); }
    if (typeof olvidar_ === 'function') olvidar_(CTB_TABLAS.conceptos[0]);
    return { total, apartamentos: Object.keys(montos).length, actualizado: !!existe };
  });
}
function gasAccion_(req, admin) {
  const op = s_(req.op || 'datos'), editar = () => { if (!gasPuede_(admin, 3)) throw error_('Necesita el nivel «Editar» de Gas.', 'SIN_PERMISO'); };
  switch (op) {
    case 'datos': return gasDatos_(req, admin);
    case 'suministro': editar(); { const id = gasGuardarSuministro_(req, admin); return Object.assign(gasDatos_(Object.assign({}, req, { suministro_id: id }), admin), { aviso: 'Suministro guardado.' }); }
    case 'lecturas': editar(); { const r = gasGuardarLecturas_(req, admin); return Object.assign(gasDatos_(req, admin), { resultado: r, aviso: r.guardadas + ' lectura(s) guardadas.' + (r.rechazos.length ? ' ' + r.rechazos.length + ' con problema.' : '') }); }
    case 'importar': editar(); { const p = Gas.leerCsv(req.texto); const r = gasGuardarLecturas_(Object.assign({}, req, { lecturas: p.filas.map(f => Object.assign(f, { origen: 'importar' })) }), admin); r.rechazos = r.rechazos.concat(p.errores.map(e => ({ apartamento: '', motivo: 'No se entendió: ' + e }))); return Object.assign(gasDatos_(req, admin), { resultado: r, aviso: r.guardadas + ' lectura(s) importadas.' + (r.rechazos.length ? ' ' + r.rechazos.length + ' con problema.' : '') }); }
    case 'foto': editar(); return gasFoto_(req, admin);
    case 'compra': editar(); gasGuardarCompra_(req, admin); return Object.assign(gasDatos_(req, admin), { aviso: 'Compra guardada.' });
    case 'cobrar': editar(); { const r = gasCobrar_(req, admin); return Object.assign(gasDatos_(req, admin), { cobro: r, aviso: 'Gas de ' + s_(req.periodo) + ' ' + (r.actualizado ? 'actualizado' : 'agregado') + ' a los recibos: ' + r.apartamentos + ' apartamentos, total RD$ ' + r.total.toLocaleString('en-US', { minimumFractionDigits: 2 }) + '.' }); }
    default: throw error_('Operación desconocida: ' + op);
  }
}
Object.assign(ACCIONES_CENTRAL, { gas: req => conAdmin_(req, gasAccion_) });
Object.assign(ACCESO_ACCION, { gas: ['tor_gas', 1] });
if (typeof SECCIONES !== 'undefined' && !SECCIONES.some(x => x[0] === 'tor_gas')) SECCIONES.push(['tor_gas', 'torres', 'Torres · Gas: lecturas, tanque y cobro',
  'Ver: lecturas, consumo, tanque y reporte anual de cada torre. Editar: registrar lecturas y fotos, compras del tanque, ajustes del suministro y pasar el gas a los recibos.', [3, 0, 3]]);
if (typeof SECCIONES_TORRES !== 'undefined' && SECCIONES_TORRES.indexOf('tor_gas') < 0) SECCIONES_TORRES.push('tor_gas');
// El menú (accionPortal_) muestra «Gas» a quien tenga el permiso
if (ACCIONES_CENTRAL.portal && !ACCIONES_CENTRAL.portal._gas) {
  const origPortalGas = ACCIONES_CENTRAL.portal;
  const envPortalGas = req => {
    const r = origPortalGas(req);
    try { const v = vistaUsuario_(usuarioDeSolicitud_(req)); if (r && r.accesos) r.accesos.gas = !!(v.gerente || ((v.permisos || {}).tor_gas || 0) > 0); } catch (e) { /* el menú sigue como estaba */ }
    return r;
  };
  envPortalGas._gas = true; ACCIONES_CENTRAL.portal = envPortalGas;
}
