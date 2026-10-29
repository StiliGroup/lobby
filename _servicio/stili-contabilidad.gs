/**
 * Stili Soft v3.2 · Contabilidad: los cálculos.
 * v3.2 · Cobros segregados: cada línea del aviso tiene su clase (ordinaria, extraordinaria, fondo de reserva, reserva de áreas,
 *        gas, multa, mora…) y cada pago se aplica línea por línea. Nada se mezcla: la cartera, lo cobrado y los reportes salen por clase.
 * Una sola librería para la página (contabilidad.html), la demostración y las pruebas (node test_contabilidad.js).
 * Todo se calcula en centavos enteros para que los totales cuadren al peso.
 * Montos en RD$, fechas 'aaaa-mm-dd', periodos 'aaaa-mm'.
 */
(function (raiz, fabrica) {
  const m = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = m; else raiz.StiliContab = m;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------- utilidades
  const c = v => Math.round((Number(v) || 0) * 100);           // a centavos
  const p = v => Math.round(v) / 100;                           // a pesos
  const r2 = v => p(c(v));
  const hoyISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });
  const periodoDe = f => String(f || '').slice(0, 7);
  const finDe = per => { const [a, m] = per.split('-').map(Number); return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10); };
  const inicioDe = per => per + '-01';
  const sumarMeses = (per, n) => { const [a, m] = per.split('-').map(Number); const d = new Date(Date.UTC(a, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
  const dias = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5); // b − a
  const conDia = (per, dia) => { const fin = Number(finDe(per).slice(8)); return per + '-' + String(Math.min(Math.max(1, Number(dia) || 1), fin)).padStart(2, '0'); };
  const activo = x => x && x.estado !== 'anulado' && x.estado !== 'anulada';
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const nombreMes = per => { const [a, m] = per.split('-').map(Number); return MESES[m - 1] + ' de ' + a; };

  // ------------------------------------------------------- catálogo de rubros
  // Dos niveles: grupo › rubro. Se precarga y cada torre activa u oculta. La cuenta contable sale del rubro.
  const RUBROS_BASE = [
    ['I1', 'Ingresos ordinarios', 'ingreso', [['I1.1', 'Cuota de mantenimiento'], ['I1.2', 'Consumo de gas'], ['I1.3', 'Consumo de agua'], ['I1.4', 'Consumo de luz'], ['I1.5', 'Tarjetas y controles de acceso']]],
    ['I2', 'Ingresos extraordinarios', 'ingreso', [['I2.1', 'Cuota extraordinaria'], ['I2.2', 'Reserva de áreas comunes'], ['I2.3', 'Multas'], ['I2.4', 'Mora'], ['I2.5', 'Intereses bancarios'], ['I2.6', 'Otros ingresos']]],
    ['I3', 'Saldos iniciales', 'ingreso', [['I3.1', 'Saldo inicial de apartamentos']]],
    ['I4', 'Fondo de reserva', 'ingreso', [['I4.1', 'Aporte al fondo de reserva']]],
    ['E1', 'Servicios básicos', 'egreso', [['E1.1', 'Agua'], ['E1.2', 'Electricidad'], ['E1.3', 'Recogida de basura'], ['E1.4', 'Internet y teléfono'], ['E1.5', 'Gas'], ['E1.6', 'Gasoil']]],
    ['E2', 'Salarios y beneficios de ley', 'egreso', [['E2.1', 'Sueldos'], ['E2.2', 'Regalía pascual'], ['E2.3', 'Vacaciones'], ['E2.4', 'Seguridad social (TSS)'], ['E2.5', 'Horas extras'], ['E2.6', 'Prestaciones laborales'], ['E2.7', 'Uniformes']]],
    ['E3', 'Mantenimiento y reparaciones', 'egreso', [['E3.1', 'Ascensores'], ['E3.2', 'Bombas de agua'], ['E3.3', 'Sistema eléctrico'], ['E3.4', 'Planta eléctrica'], ['E3.5', 'Extintores'], ['E3.6', 'Piscina'], ['E3.7', 'Jardinería'],
      ['E3.8', 'Cámaras y CCTV'], ['E3.9', 'Puertas y portones'], ['E3.10', 'Pintura'], ['E3.11', 'Aire acondicionado'], ['E3.12', 'Fumigación'], ['E3.13', 'Plomería'], ['E3.14', 'Impermeabilización'], ['E3.15', 'Otras reparaciones']]],
    ['E4', 'Gastos administrativos', 'egreso', [['E4.1', 'Honorarios de administración'], ['E4.2', 'Contabilidad'], ['E4.3', 'Registro de actas'], ['E4.4', 'Papelería e impresiones']]],
    ['E5', 'Seguridad', 'egreso', [['E5.1', 'Vigilancia']]],
    ['E6', 'Prestación de servicios', 'egreso', [['E6.1', 'Servicios legales'], ['E6.2', 'Póliza de seguro'], ['E6.3', 'Limpieza']]],
    ['E7', 'Servicios bancarios', 'egreso', [['E7.1', 'Comisiones bancarias'], ['E7.2', 'Impuestos bancarios']]],
    ['E8', 'Caja chica', 'egreso', [['E8.1', 'Gastos menores']]],
    ['E9', 'Suministros y gastos operativos', 'egreso', [['E9.1', 'Materiales de limpieza'], ['E9.2', 'Ferretería'], ['E9.3', 'Combustible']]],
  ];
  function rubrosBase() {
    const out = []; let orden = 0;
    RUBROS_BASE.forEach(([cod, nom, tipo, hijos]) => {
      out.push({ codigo: cod, nombre: nom, tipo, padre: '', activo: 'si', orden: ++orden });
      hijos.forEach(([hc, hn]) => out.push({ codigo: hc, nombre: hn, tipo, padre: cod, activo: 'si', orden: ++orden }));
    });
    return out;
  }
  const nombreRubro = (rubros, cod) => { const x = (rubros || []).find(r => r.codigo === cod); return x ? x.nombre : (cod || 'Sin rubro'); };
  const grupoDe = cod => String(cod || '').split('.')[0];

  // ---------------------------------------------------------- reglas de la torre
  const CONFIG_BASE = {
    vence_dia: 15,            // día del mes en que vence el recibo
    pp_porcentaje: 0,         // descuento por pronto pago (%); 0 = no hay
    pp_dia: 5,                // pagando hasta este día del mes del recibo
    mora_tipo: 'ninguna',     // 'ninguna' | 'porcentaje' | 'fijo'
    mora_valor: 0,
    mora_dias_gracia: 0,
    serie_prefijo: 'R',
    serie_siguiente: 1,
    umbral_junta: 0,          // 0 = no pasa por la Junta
    honorario_monto: 0,
    honorario_dia: 1,
    colchon_caja: 0,          // la proyección avisa si el saldo baja de esto
    pasarela_url: '',         // plantilla del enlace de pago: {recibo} {monto} {torre}
    // v3.2 · orden en que se aplica un pago cuando el residente NO dice qué paga (art. 1256 del Código Civil: primero lo vencido,
    // y entre lo vencido lo más antiguo). Este orden solo desempata cargos con el mismo vencimiento; lo fija la Junta o el reglamento.
    orden_clases: 'ordinaria,extraordinaria,fondo_reserva,gas,otro,reserva_area,multa,mora',
    mora_clases: 'ordinaria,extraordinaria',   // sobre qué clases se calcula la mora (nunca sobre la mora)
    encuesta_dias: 30,        // no se manda la encuesta al mismo apartamento más de una vez en estos días
    recibo_auto: 'si',        // al aplicar un pago se envía el recibo (correo, WhatsApp y Telegram)
  };
  const reglas = cfg => Object.assign({}, CONFIG_BASE, cfg || {});

  // ----------------------------------------------------- v3.2 · clases de cargo
  // Cada línea de un aviso de cobro es de UNA clase y cada peso cobrado va a UNA línea. Así la cartera y lo cobrado salen por clase.
  const CLASES = [
    ['ordinaria', 'Cuota ordinaria'], ['extraordinaria', 'Cuota extraordinaria'], ['fondo_reserva', 'Fondo de reserva'],
    ['reserva_area', 'Reserva de áreas comunes'], ['gas', 'Consumo de gas'], ['multa', 'Multas'], ['mora', 'Mora'], ['otro', 'Otros cargos'],
  ];
  const CLASE_DE_RUBRO = { 'I1.1': 'ordinaria', 'I1.2': 'gas', 'I1.3': 'otro', 'I1.4': 'otro', 'I1.5': 'otro', 'I2.1': 'extraordinaria', 'I2.2': 'reserva_area', 'I2.3': 'multa', 'I2.4': 'mora', 'I4.1': 'fondo_reserva' };
  const esClase = k => CLASES.some(x => x[0] === k);
  const nombreClase = k => (CLASES.find(x => x[0] === k) || [k, 'Otros cargos'])[1];
  /** Clase de una línea (o de un concepto): la que trae; si no, la de su rubro; si no, su tipo viejo (ordinaria/extraordinaria/mora). */
  function claseDe(l) {
    const x = l || {};
    if (esClase(x.clase)) return x.clase;
    if (x.tipo === 'mora') return 'mora';
    if (CLASE_DE_RUBRO[x.rubro] && CLASE_DE_RUBRO[x.rubro] !== 'ordinaria') return CLASE_DE_RUBRO[x.rubro];
    if (x.tipo === 'extraordinaria') return 'extraordinaria';
    if (esClase(x.tipo)) return x.tipo;
    return CLASE_DE_RUBRO[x.rubro] || 'ordinaria';
  }
  const listaCfg = v => String(v || '').split(',').map(x => x.trim()).filter(Boolean);
  const ordenClases = config => { const o = listaCfg(reglas(config).orden_clases).filter(esClase); CLASES.forEach(([k]) => { if (o.indexOf(k) < 0) o.push(k); }); return o; };
  /** Las líneas de un recibo; un recibo viejo sin líneas cuenta como una sola línea con su tipo. */
  const lineasDe = r => (r.lineas && r.lineas.length ? r.lineas : [{ concepto: 'Recibo ' + (r.numero || ''), rubro: '', tipo: r.tipo, monto: r.total }]);

  // ------------------------------------------------------------ reparto de cuotas
  /**
   * Reparte un concepto entre los apartamentos.
   *  igual: el mismo monto a cada uno · unidad: montos[apto] · parametro: total × valor / suma · medidor: (lectura actual − anterior) × precio
   * Cuando se reparte un total, el último centavo se ajusta para que la suma dé exacto.
   */
  function repartir(concepto, aptos, valores) {
    const k = concepto || {}, out = {};
    const lista = (aptos || []).slice();
    if (k.reparto === 'igual') lista.forEach(a => { out[a] = r2(k.monto); });
    else if (k.reparto === 'unidad') lista.forEach(a => { out[a] = r2((k.montos || {})[a] || 0); });
    else if (k.reparto === 'medidor') lista.forEach(a => {
      const l = (k.lecturas || {})[a] || {}; const consumo = Math.max(0, (Number(l.actual) || 0) - (Number(l.anterior) || 0));
      out[a] = r2(consumo * (Number(k.precio) || 0));
    });
    else if (k.reparto === 'parametro') {
      const val = (valores || {})[k.parametro] || {};
      const pesos = lista.map(a => Math.max(0, Number(val[a]) || 0)), suma = pesos.reduce((x, y) => x + y, 0);
      const total = c(k.monto);
      if (!suma) lista.forEach(a => { out[a] = 0; });
      else {
        let usado = 0; const partes = pesos.map(w => Math.floor(total * w / suma));
        usado = partes.reduce((x, y) => x + y, 0);
        // los centavos que sobran van a los de mayor residuo, así la suma es exacta
        const resto = pesos.map((w, i) => [total * w / suma - partes[i], i]).sort((x, y) => y[0] - x[0]);
        for (let j = 0; j < total - usado; j++) partes[resto[j % resto.length][1]]++;
        lista.forEach((a, i) => { out[a] = p(partes[i]); });
      }
    }
    return out;
  }

  /** Vista previa de los recibos del mes: una línea por concepto con monto > 0. */
  function armarRecibos({ periodo, conceptos, aptos, valores, config, emision }) {
    const cfg = reglas(config), vence = conDia(periodo, cfg.vence_dia);
    const porApto = {};
    (conceptos || []).filter(k => k.periodo === periodo && activo(k)).forEach(k => {
      const rep = repartir(k, aptos, valores);
      Object.keys(rep).forEach(a => {
        if (!(rep[a] > 0)) return;
        (porApto[a] = porApto[a] || []).push({ concepto_id: k.id, concepto: k.nombre, rubro: k.rubro, tipo: k.tipo || 'ordinaria', clase: claseDe(k), monto: rep[a] });
      });
    });
    return (aptos || []).filter(a => porApto[a]).map(a => {
      const lineas = porApto[a], extra = lineas.every(l => claseDe(l) !== 'ordinaria');
      return { periodo, apartamento: a, emision: emision || hoyISO(), vence, tipo: extra ? 'extraordinaria' : 'ordinaria', lineas, total: p(lineas.reduce((s, l) => s + c(l.monto), 0)) };
    });
  }
  /** Numera los recibos con la serie de la torre. Devuelve los recibos y el próximo número. */
  function numerar(recibos, config) {
    const cfg = reglas(config); let n = Number(cfg.serie_siguiente) || 1;
    const out = recibos.map(r => Object.assign({}, r, { numero: cfg.serie_prefijo + String(n++).padStart(6, '0') }));
    return { recibos: out, siguiente: n };
  }

  // ---------------------------------------------------- saldos de los recibos (v3.2 · por línea)
  /**
   * Lleva cada aplicación de cada cobro a la línea exacta del recibo.
   * Las aplicaciones nuevas traen `linea`; las viejas (sin línea) se reparten entre las líneas del recibo en el orden de clases de la torre.
   * Devuelve [{ cobro, recibo_id, linea, clase, monto, descuento }] en orden de fecha.
   */
  function aplicacionesPorLinea(cobros, recibos, config) {
    const rec = {}; (recibos || []).forEach(r => { rec[r.id] = r; });
    const usado = {}, out = [], orden = ordenClases(config);
    const conLinea = x => x.linea !== undefined && x.linea !== null && x.linea !== '';
    const ks = (cobros || []).filter(activo).slice().sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || String(a.creado_en || '').localeCompare(String(b.creado_en || '')));
    // primera pasada: las aplicaciones que dicen su línea (nunca las mueve una aplicación vieja de fecha anterior)
    ks.forEach(k => (k.aplicaciones || []).filter(conLinea).forEach(x => {
      const r = rec[x.recibo_id], i = Number(x.linea), l = r ? lineasDe(r)[i] : null, key = x.recibo_id + '#' + i;
      usado[key] = (usado[key] || 0) + c(x.monto) + c(x.descuento || 0);
      out.push({ cobro: k, recibo_id: x.recibo_id, linea: i, clase: l ? claseDe(l) : (x.clase || 'otro'), rubro: l ? l.rubro : '', monto: r2(x.monto), descuento: r2(x.descuento || 0) });
    }));
    // segunda pasada: las viejas (sin línea) se reparten sobre lo que queda
    ks.forEach(k => (k.aplicaciones || []).filter(x => !conLinea(x)).forEach(x => {
      const r = rec[x.recibo_id];
      if (!r) { out.push({ cobro: k, recibo_id: x.recibo_id, linea: 0, clase: x.clase || 'otro', rubro: '', monto: r2(x.monto), descuento: r2(x.descuento || 0) }); return; }
      // aplicación vieja: se reparte entre las líneas con saldo, en el orden de clases
      const ls = lineasDe(r).map((l, i) => ({ l, i })).sort((a, b) => orden.indexOf(claseDe(a.l)) - orden.indexOf(claseDe(b.l)) || a.i - b.i);
      let m = c(x.monto), d = c(x.descuento || 0);
      ls.forEach(({ l, i }, n) => {
        const key = r.id + '#' + i, libre = Math.max(0, c(l.monto) - (usado[key] || 0)), ultima = n === ls.length - 1;
        let dd = ultima ? d : Math.min(d, libre); const mm = ultima ? m : Math.min(m, libre - dd);
        if (!mm && !dd) return;
        usado[key] = (usado[key] || 0) + mm + dd; m -= mm; d -= dd;
        out.push({ cobro: k, recibo_id: r.id, linea: i, clase: claseDe(l), rubro: l.rubro, monto: p(mm), descuento: p(dd) });
      });
    }));
    out.sort((a, b) => String(a.cobro.fecha).localeCompare(String(b.cobro.fecha)) || String(a.cobro.creado_en || '').localeCompare(String(b.cobro.creado_en || '')));
    return out;
  }
  /** Cuánto se ha aplicado a cada recibo (cobros, descuentos y cruces de anticipo). */
  function aplicadoPorRecibo(cobros, sinCruces) {
    const ap = {};
    (cobros || []).filter(activo).filter(k => !sinCruces || k.origen !== 'cruce').forEach(k => (k.aplicaciones || []).forEach(x => {
      ap[x.recibo_id] = (ap[x.recibo_id] || 0) + c(x.monto) + c(x.descuento || 0);
    }));
    return ap;
  }
  /** Recibos con su saldo pendiente; cada línea trae su clase, lo pagado y su saldo. */
  function conSaldo(recibos, cobros, corte, config) {
    const ks = (cobros || []).filter(k => !corte || k.fecha <= corte);
    const rs = (recibos || []).filter(activo).filter(r => !corte || r.emision <= corte);
    const apL = {}, apLReal = {};
    aplicacionesPorLinea(ks, recibos, config).forEach(x => {
      const key = x.recibo_id + '#' + x.linea, v = c(x.monto) + c(x.descuento);
      apL[key] = (apL[key] || 0) + v; if (x.cobro.origen !== 'cruce') apLReal[key] = (apLReal[key] || 0) + v;
    });
    return rs.map(r => {
      const lineas = lineasDe(r).map((l, i) => { const pag = apL[r.id + '#' + i] || 0; return Object.assign({}, l, { linea: i, clase: claseDe(l), pagado: p(pag), pagado_cobros: p(apLReal[r.id + '#' + i] || 0), saldo: p(Math.max(0, c(l.monto) - pag)) }); });
      const pag = lineas.reduce((s, l) => s + c(l.pagado), 0), real = lineas.reduce((s, l) => s + c(l.pagado_cobros), 0);
      return Object.assign({}, r, { lineas, pagado: p(pag), pagado_cobros: p(real), saldo: p(Math.max(0, c(r.total) - pag)) });
    });
  }
  /** Un recibo que no viene de conSaldo (sin saldo por línea): lo pagado se reparte entre sus líneas en el orden de clases. */
  function normalizarRecibo(r, config) {
    if (r.lineas && r.lineas.length && r.lineas.every(l => l.saldo !== undefined && l.linea !== undefined)) return r;
    const oc = ordenClases(config), base = lineasDe(r).map((l, i) => Object.assign({}, l, { linea: i, clase: claseDe(l) }));
    let pag = c(r.saldo !== undefined ? c(r.total) / 100 - Number(r.saldo) : r.pagado || 0), real = c(r.pagado_cobros !== undefined ? r.pagado_cobros : r.pagado || 0);
    base.slice().sort((a, b) => oc.indexOf(a.clase) - oc.indexOf(b.clase) || a.linea - b.linea).forEach(l => {
      const u = Math.min(pag, c(l.monto)), ur = Math.min(real, c(l.monto)); pag -= u; real -= ur;
      l.pagado = p(u); l.pagado_cobros = p(ur); l.saldo = p(c(l.monto) - u);
    });
    return Object.assign({}, r, { lineas: base });
  }
  /** Cada línea pendiente como una partida: { key, recibo_id, numero, periodo, apartamento, vence, linea, clase, concepto, monto, saldo }. */
  function partidas(recibosConSaldo) {
    const out = [];
    (recibosConSaldo || []).forEach(r => (r.lineas || []).forEach(l => out.push({ key: r.id + '#' + l.linea, recibo_id: r.id, numero: r.numero, periodo: r.periodo, apartamento: r.apartamento,
      emision: r.emision, vence: r.vence, tipo: r.tipo, linea: l.linea, clase: l.clase, concepto: l.concepto, rubro: l.rubro, monto: r2(l.monto), pagado: l.pagado, pagado_cobros: l.pagado_cobros, saldo: l.saldo })));
    return out;
  }
  /** Saldo a favor (anticipos) por apartamento: sobrantes de cobros menos lo ya cruzado. */
  function aFavor(cobros, corte) {
    const out = {};
    (cobros || []).filter(activo).filter(k => !corte || k.fecha <= corte).forEach(k => {
      const a = k.apartamento; if (!a) return;
      if (k.origen === 'cruce') out[a] = (out[a] || 0) - c(k.monto);
      else out[a] = (out[a] || 0) + c(k.a_favor || 0);
    });
    Object.keys(out).forEach(a => { out[a] = p(Math.max(0, out[a])); });
    return out;
  }

  // ------------------------------------------------------------- pronto pago
  /** v3.2 · El descuento es solo sobre las líneas de cuota ordinaria del recibo, pagadas completas, a tiempo y sin abonos previos. */
  function descuentoProntoPago(recibo, fechaPago, config) {
    const cfg = reglas(config);
    if (!(Number(cfg.pp_porcentaje) > 0) || !recibo) return 0;
    if (fechaPago > conDia(recibo.periodo, cfg.pp_dia)) return 0;
    const ord = lineasDe(recibo).filter(l => claseDe(l) === 'ordinaria');
    if (!ord.length) return 0;
    // el saldo a favor cruzado no cuenta como pago previo
    if (ord.some(l => c(l.pagado_cobros !== undefined ? l.pagado_cobros : l.pagado || 0) > 0)) return 0;
    if (!recibo.lineas && c(recibo.pagado_cobros !== undefined ? recibo.pagado_cobros : recibo.pagado || 0) > 0) return 0;
    return r2(ord.reduce((s, l) => s + c(l.monto), 0) / 100 * Number(cfg.pp_porcentaje) / 100);
  }
  /** Lo que se paga con el pronto pago (el mismo cálculo que exige el cobro): el total menos el descuento de la parte ordinaria. */
  const montoProntoPago = (recibo, config) => {
    const ord = lineasDe(recibo).filter(l => claseDe(l) === 'ordinaria').reduce((s, l) => s + c(l.monto), 0);
    return p(c(recibo.total) - c(r2(ord / 100 * Number(reglas(config).pp_porcentaje || 0) / 100)));
  };
  /**
   * Aplica un cobro línea por línea.
   * - Si el residente dijo qué paga (art. 1253 del Código Civil), `orden` trae esas partidas ('recibo#linea'), recibos o clases, y solo se aplica a eso.
   * - Si no lo dijo (art. 1256): primero lo vencido, lo más antiguo primero; con el mismo vencimiento, el orden de clases de la torre.
   * - El pronto pago aplica si se cubren completas las líneas ordinarias del recibo dentro del plazo. Lo que sobra queda a favor.
   * `pendientes` = recibos con saldo (conSaldo) o partidas.
   */
  function aplicarCobro({ monto, fecha, pendientes, config, orden }) {
    let resto = c(monto);
    const f = fecha || hoyISO(), oc = ordenClases(config);
    const rs = (pendientes || []).filter(x => x && !x.key).map(r => normalizarRecibo(r, config));   // recibos (con o sin saldo por línea)
    let ps = rs.length ? partidas(rs) : (pendientes || []).filter(x => x && x.key);
    ps = ps.filter(x => c(x.saldo) > 0);
    const sel = (orden || []).filter(Boolean);
    const elegida = x => !sel.length || sel.indexOf(x.key) >= 0 || sel.indexOf(x.recibo_id) >= 0 || sel.indexOf(x.clase) >= 0;
    const rango = x => { const i = sel.indexOf(x.key) >= 0 ? sel.indexOf(x.key) : sel.indexOf(x.recibo_id) >= 0 ? sel.indexOf(x.recibo_id) : sel.indexOf(x.clase); return i < 0 ? 1e9 : i; };
    ps = ps.filter(elegida).sort((a, b) => {
      if (sel.length && rango(a) !== rango(b)) return rango(a) - rango(b);
      const va = (a.vence || '') < f ? 0 : 1, vb = (b.vence || '') < f ? 0 : 1;
      return va - vb || String(a.vence || '').localeCompare(String(b.vence || '')) || oc.indexOf(a.clase) - oc.indexOf(b.clase) || String(a.numero || '').localeCompare(String(b.numero || '')) || a.linea - b.linea;
    });
    const recById = {}; rs.forEach(r => { recById[r.id] = r; });
    const aplicaciones = []; let descuentos = 0; const hecho = new Set();
    for (const x of ps) {
      if (resto <= 0) break;
      if (hecho.has(x.key)) continue;
      // pronto pago: todas las líneas ordinarias del recibo juntas, si están elegidas y alcanza
      const r = recById[x.recibo_id];
      if (x.clase === 'ordinaria' && r) {
        const grupo = ps.filter(y => y.recibo_id === x.recibo_id && y.clase === 'ordinaria');
        const todas = lineasDe(r).filter(l => claseDe(l) === 'ordinaria').length === grupo.length;
        let desc = todas ? c(descuentoProntoPago(r, f, config)) : 0;
        const saldoG = grupo.reduce((s, y) => s + c(y.saldo), 0);
        if (desc > saldoG) desc = saldoG;
        if (desc && resto < saldoG - desc && saldoG - desc - resto <= 1) desc = saldoG - resto;   // 1 centavo de tolerancia
        if (desc && resto >= saldoG - desc) {
          let dUsado = 0;
          grupo.forEach((y, i) => {
            const d = i === grupo.length - 1 ? Math.min(c(y.saldo), desc - dUsado) : Math.min(c(y.saldo), Math.round(desc * c(y.saldo) / saldoG)); dUsado += d;
            aplicaciones.push({ recibo_id: y.recibo_id, numero: y.numero, linea: y.linea, clase: y.clase, monto: p(c(y.saldo) - d), descuento: p(d) });
            resto -= c(y.saldo) - d; hecho.add(y.key);
          });
          descuentos += dUsado; continue;
        }
      }
      const falta = c(x.saldo), m = Math.min(resto, falta);
      aplicaciones.push({ recibo_id: x.recibo_id, numero: x.numero, linea: x.linea, clase: x.clase, monto: p(m), descuento: 0 });
      resto -= m; hecho.add(x.key);
    }
    return { aplicaciones, descuento: p(descuentos), a_favor: p(resto) };
  }
  /** Cruza el saldo a favor con lo pendiente (al emitir los recibos nuevos), con el mismo orden legal. */
  function cruzarAnticipo({ apartamento, disponible, pendientes, fecha, config }) {
    const r = aplicarCobro({ monto: disponible, fecha, pendientes, config: Object.assign({}, config || {}, { pp_porcentaje: 0 }) });
    const usado = r.aplicaciones.reduce((s, x) => s + c(x.monto), 0);
    if (!usado) return null;
    return { fecha, apartamento, monto: p(usado), origen: 'cruce', forma: 'anticipo', cuenta_id: '', aplicaciones: r.aplicaciones, a_favor: 0, descuento: 0 };
  }

  // ------------------------------------------------------------ estado de cuenta
  function estadoCuenta(apto, recibos, cobros, corte, config) {
    const rs = conSaldo((recibos || []).filter(r => r.apartamento === apto), cobros, corte, config);
    const ks = (cobros || []).filter(activo).filter(k => k.apartamento === apto && (!corte || k.fecha <= corte));
    const movs = rs.map(r => ({ fecha: r.emision, tipo: 'recibo', detalle: 'Recibo ' + (r.numero || '') + ' · ' + (r.tipo === 'mora' ? 'mora ' : '') + nombreMes(r.periodo), cargo: r.total, abono: 0, ref: r.id }))
      .concat(ks.map(k => ({ fecha: k.fecha, tipo: k.origen === 'cruce' ? 'cruce' : 'cobro',
        detalle: k.origen === 'cruce' ? 'Saldo a favor aplicado' : 'Pago ' + (k.forma || '') + (k.referencia ? ' · ref. ' + k.referencia : ''),
        cargo: 0, abono: k.origen === 'cruce' ? k.monto : p(c(k.monto) + c(k.descuento || 0)), ref: k.id })))
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.tipo === 'recibo' ? -1 : 1));
    let acum = 0;
    movs.forEach(m => { if (m.tipo !== 'cruce') acum += c(m.cargo) - c(m.abono); else acum += 0; m.saldo = p(acum); });
    // el cruce mueve dinero que ya estaba (el anticipo); el saldo real es deuda − a favor
    const deuda = rs.reduce((s, r) => s + c(r.saldo), 0), favor = c(aFavor(ks, corte)[apto] || 0);
    // v3.2 · lo que se debe de cada clase (vencido y por vencer), sin mezclar
    const f = corte || hoyISO(), ps = partidas(rs).filter(x => c(x.saldo) > 0);
    const porClase = CLASES.map(([k, n]) => {
      const de = ps.filter(x => x.clase === k);
      return { clase: k, nombre: n, deuda: p(de.reduce((s, x) => s + c(x.saldo), 0)), vencido: p(de.filter(x => x.vence < f).reduce((s, x) => s + c(x.saldo), 0)), partidas: de.length };
    }).filter(x => x.partidas);
    return { apartamento: apto, movimientos: movs, deuda: p(deuda), a_favor: p(favor), saldo: p(deuda - favor), pendientes: rs.filter(r => c(r.saldo) > 0), partidas: ps, por_clase: porClase };
  }

  // ------------------------------------------------------- cartera por antigüedad
  const TRAMOS = [['corriente', 'Al día'], ['d30', '1–30 días'], ['d60', '31–60'], ['d90', '61–90'], ['d120', '91–120'], ['mas', 'Más de 120']];
  function tramoDe(diasVencido) {
    if (diasVencido <= 0) return 'corriente';
    if (diasVencido <= 30) return 'd30'; if (diasVencido <= 60) return 'd60'; if (diasVencido <= 90) return 'd90'; if (diasVencido <= 120) return 'd120'; return 'mas';
  }
  /** Cartera por antigüedad. v3.2 · `clases` limita a esas clases (p. ej. ['ordinaria'] = morosidad solo de cuotas ordinarias). */
  function antiguedad(recibos, cobros, corte, clases, config) {
    const f = corte || hoyISO(), porApto = {}, cl = (clases || []).filter(esClase);
    partidas(conSaldo(recibos, cobros, f, config)).filter(x => c(x.saldo) > 0 && (!cl.length || cl.indexOf(x.clase) >= 0)).forEach(r => {
      const a = porApto[r.apartamento] = porApto[r.apartamento] || { apartamento: r.apartamento, total: 0, dias: 0 };
      TRAMOS.forEach(([k]) => { a[k] = a[k] || 0; });
      const d = dias(r.vence, f), t = tramoDe(d);
      a[t] = p(c(a[t]) + c(r.saldo)); a.total = p(c(a.total) + c(r.saldo)); a.dias = Math.max(a.dias, d);
    });
    const filas = Object.values(porApto).sort((x, y) => y.total - x.total);
    const tot = { apartamento: 'Total', total: 0, dias: 0 };
    TRAMOS.forEach(([k]) => { tot[k] = p(filas.reduce((s, x) => s + c(x[k] || 0), 0)); });
    tot.total = p(filas.reduce((s, x) => s + c(x.total), 0));
    return { filas, total: tot, vencido: p(c(tot.total) - c(tot.corriente)), clases: cl };
  }

  // ----------------------------------------------------------------------- mora
  /** Cargos de mora del periodo: uno por apartamento con recibos vencidos (después de los días de gracia). Nunca mora sobre mora. */
  function calcularMora({ recibos, cobros, config, periodo, fecha }) {
    const cfg = reglas(config); if (cfg.mora_tipo === 'ninguna' || !(Number(cfg.mora_valor) > 0)) return [];
    const f = fecha || hoyISO(), base_clases = listaCfg(cfg.mora_clases).filter(k => esClase(k) && k !== 'mora');
    const ya = new Set((recibos || []).filter(activo).filter(r => r.tipo === 'mora' && r.periodo === periodo).map(r => r.apartamento));
    const porApto = {};
    // v3.2 · la mora se calcula solo sobre las clases que dice la torre (por defecto ordinaria y extraordinaria); nunca mora sobre mora
    partidas(conSaldo(recibos, cobros, f, config)).filter(x => x.clase !== 'mora' && base_clases.indexOf(x.clase) >= 0 && c(x.saldo) > 0 && dias(x.vence, f) > Number(cfg.mora_dias_gracia || 0))
      .forEach(x => { (porApto[x.apartamento] = porApto[x.apartamento] || {})[x.recibo_id] = ((porApto[x.apartamento] || {})[x.recibo_id] || 0) + c(x.saldo); });
    return Object.keys(porApto).filter(a => !ya.has(a)).sort().map(a => {
      const n = Object.keys(porApto[a]).length, base = Object.values(porApto[a]).reduce((s, v) => s + v, 0);
      const monto = cfg.mora_tipo === 'porcentaje' ? p(Math.round(base * Number(cfg.mora_valor) / 100)) : r2(cfg.mora_valor);
      return { periodo, apartamento: a, emision: f, vence: conDia(periodo, cfg.vence_dia), tipo: 'mora', base: p(base),
        lineas: [{ concepto: 'Mora sobre ' + n + (n === 1 ? ' recibo vencido' : ' recibos vencidos'), rubro: 'I2.4', tipo: 'mora', clase: 'mora', monto }], total: monto };
    }).filter(r => r.total > 0);
  }

  // -------------------------------------------------------- libro de cada cuenta
  /**
   * Movimientos de una cuenta de banco o caja: cobros, depósitos sin identificar, otros ingresos, gastos, transferencias y pagos de cuentas por pagar.
   * Un cobro que viene de un depósito sin identificar no se cuenta dos veces (el dinero entró con el depósito).
   */
  function libro(cuentaId, d, hasta) {
    const D = d || {}, out = [];
    const add = (fecha, tipo, detalle, monto, ref, extra) => { if (!fecha || (hasta && fecha > hasta)) return; out.push(Object.assign({ fecha, tipo, detalle, monto: r2(monto), ref, clave: tipo + ':' + ref }, extra || {})); };
    (D.cobros || []).filter(activo).filter(k => k.cuenta_id === cuentaId && k.origen !== 'sin_identificar' && k.origen !== 'cruce')
      .forEach(k => add(k.fecha, 'cobro', 'Cobro apto. ' + k.apartamento + (k.referencia ? ' · ' + k.referencia : ''), k.monto, k.id, { referencia: k.referencia }));
    (D.sin_identificar || []).filter(activo).filter(x => x.cuenta_id === cuentaId)
      .forEach(x => add(x.fecha, 'deposito', 'Depósito ' + (x.estado === 'identificado' ? 'identificado' : 'sin identificar') + (x.referencia ? ' · ' + x.referencia : ''), x.monto, x.id, { referencia: x.referencia }));
    (D.ingresos || []).filter(activo).filter(x => x.cuenta_id === cuentaId).forEach(x => add(x.fecha, 'ingreso', x.detalle || 'Otro ingreso', x.monto, x.id));
    (D.gastos || []).filter(activo).forEach(x => {
      if (x.tipo === 'transferencia') {
        if (x.cuenta_id === cuentaId) add(x.fecha, 'transferencia', 'Transferencia enviada · ' + (x.detalle || ''), -x.monto, x.id);
        if (x.destino_id === cuentaId) add(x.fecha, 'transferencia', 'Transferencia recibida · ' + (x.detalle || ''), x.monto, x.id + '-in');
      } else if (x.cuenta_id === cuentaId) add(x.fecha, 'gasto', x.detalle || 'Gasto', -x.monto, x.id, { cheque: x.cheque });
    });
    // una factura pagada sin cuenta asignada se toma de la primera cuenta de banco de la torre
    const banco0 = ((D.cuentas || []).find(x => x.tipo === 'banco' && x.activa !== 'no') || {}).id;
    (D.pagos || []).filter(x => x.estado === 'pagada' && (x.cuenta_id || banco0) === cuentaId)
      .forEach(x => add(x.pagado_en, 'pago', 'Pago a ' + (x.suplidor || '') + (x.cheque ? ' · cheque ' + x.cheque : ''), -x.monto, x.id, { cheque: x.cheque }));
    out.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.clave.localeCompare(b.clave));
    const cta = (D.cuentas || []).find(x => x.id === cuentaId) || {};
    let acum = c(cta.saldo_inicial || 0);
    const conInicial = out.filter(m => !cta.fecha_inicial || m.fecha >= cta.fecha_inicial);
    conInicial.forEach(m => { acum += c(m.monto); m.saldo = p(acum); });
    return { cuenta: cta, movimientos: conInicial, saldo: p(acum), inicial: r2(cta.saldo_inicial || 0) };
  }
  const saldoCuenta = (cuentaId, d, hasta) => libro(cuentaId, d, hasta).saldo;

  // ---------------------------------------------------------------- conciliación
  /**
   * Empareja el estado del banco con el libro de la cuenta.
   * 1) las parejas que el usuario ya marcó; 2) misma referencia y monto; 3) mismo monto y fecha a ±5 días (la más cercana).
   * Resumen: saldo en libros − depósitos en tránsito + cheques/pagos no cobrados (+ lo que el banco tiene y el libro no) = saldo del banco.
   */
  function conciliar({ cuentaId, d, periodo, extracto, saldoBanco, parejas, yaConciliados }) {
    const fin = finDe(periodo);
    const lib = libro(cuentaId, d, fin);
    const hechos = new Set(yaConciliados || []);
    const libroP = lib.movimientos.filter(m => !hechos.has(m.clave));
    // Caja chica: no hay estado de banco; se cuenta el efectivo (arqueo) y se compara con los libros
    if (lib.cuenta && lib.cuenta.tipo === 'caja_chica') {
      const real = saldoBanco === '' || saldoBanco === null || saldoBanco === undefined ? null : c(saldoBanco);
      return { periodo, arqueo: true, saldo_libros: lib.saldo, emparejados: libroP.map(m => ({ banco: null, libro: m, como: 'arqueo' })), transito: [], no_cobrados: [], banco_creditos: [], banco_debitos: [],
        total_transito: 0, total_no_cobrados: 0, total_banco_solo: 0, saldo_calculado: lib.saldo, saldo_banco: real === null ? null : p(real),
        diferencia: real === null ? null : p(real - c(lib.saldo)), lista: real !== null && real === c(lib.saldo) };
    }
    const banco = (extracto || []).filter(x => x.cuenta_id === cuentaId && x.fecha <= fin && x.estado !== 'conciliado_antes');
    const usadosL = new Set(), usadosB = new Set(), emparejados = [];
    const pareja = (b, m, como) => { usadosB.add(b.id); usadosL.add(m.clave); emparejados.push({ banco: b, libro: m, como }); };
    (parejas || []).forEach(([bid, clave]) => { const b = banco.find(x => x.id === bid), m = libroP.find(x => x.clave === clave); if (b && m && !usadosB.has(b.id) && !usadosL.has(m.clave)) pareja(b, m, 'manual'); });
    banco.forEach(b => {
      if (usadosB.has(b.id) || !b.referencia) return;
      const m = libroP.find(x => !usadosL.has(x.clave) && c(x.monto) === c(b.monto) && x.referencia && String(x.referencia).trim() === String(b.referencia).trim());
      if (m) pareja(b, m, 'referencia');
    });
    banco.forEach(b => {
      if (usadosB.has(b.id)) return;
      let mejor = null;
      libroP.forEach(x => { if (usadosL.has(x.clave) || c(x.monto) !== c(b.monto)) return; const dd = Math.abs(dias(x.fecha, b.fecha)); if (dd <= 5 && (!mejor || dd < mejor.dd)) mejor = { x, dd }; });
      if (mejor) pareja(b, mejor.x, 'monto y fecha');
    });
    const libroSolo = libroP.filter(m => !usadosL.has(m.clave)), bancoSolo = banco.filter(b => !usadosB.has(b.id));
    const transito = libroSolo.filter(m => c(m.monto) > 0), noCobrados = libroSolo.filter(m => c(m.monto) < 0);
    const sum = l => l.reduce((s, x) => s + c(x.monto), 0);
    const calculado = c(lib.saldo) - sum(transito) - sum(noCobrados) + sum(bancoSolo); // − tránsito, + no cobrados (son negativos)
    const real = saldoBanco === '' || saldoBanco === null || saldoBanco === undefined ? null : c(saldoBanco);
    return {
      periodo, saldo_libros: lib.saldo, emparejados, transito, no_cobrados: noCobrados,
      banco_creditos: bancoSolo.filter(b => c(b.monto) > 0), banco_debitos: bancoSolo.filter(b => c(b.monto) < 0),
      total_transito: p(sum(transito)), total_no_cobrados: p(-sum(noCobrados)), total_banco_solo: p(sum(bancoSolo)),
      saldo_calculado: p(calculado), saldo_banco: real === null ? null : p(real), diferencia: real === null ? null : p(real - calculado),
      lista: real !== null && real === calculado && bancoSolo.length === 0,
    };
  }

  // --------------------------------------------------------------- liquidación
  function liquidacion(d, periodo) {
    const D = d || {}, fin = finDe(periodo);
    const cuentas = (D.cuentas || []).filter(x => x.activa !== 'no').map(cta => {
      const libros = saldoCuenta(cta.id, D, fin);
      const conc = (D.conciliaciones || []).filter(k => activo(k) && k.cuenta_id === cta.id && k.periodo === periodo).pop();
      const banco = conc ? Number(conc.saldo_banco) : libros, pend = conc ? Number(conc.no_cobrados || 0) : 0;
      return { id: cta.id, nombre: cta.nombre, tipo: cta.tipo, libros, banco: r2(banco), cheques: r2(pend), conciliada: !!conc };
    });
    const A = cuentas.reduce((s, x) => s + c(x.banco), 0), B = cuentas.reduce((s, x) => s + c(x.cheques), 0);
    const pendCxp = (D.pagos || []).filter(x => x.estado !== 'pagada' && activo(x) && (!x.fecha || x.fecha <= fin));
    const Dm = pendCxp.reduce((s, x) => s + c(x.monto), 0);
    const cxc = conSaldo(D.recibos, D.cobros, fin).reduce((s, r) => s + c(r.saldo), 0);
    const favor = Object.values(aFavor(D.cobros, fin)).reduce((s, v) => s + c(v), 0);
    const C = A - B, E = C - Dm;
    const ini = inicioDe(periodo);
    const ingresosMes = (D.cobros || []).filter(activo).filter(k => k.fecha >= ini && k.fecha <= fin && k.origen !== 'cruce').reduce((s, k) => s + c(k.monto), 0)
      + (D.ingresos || []).filter(activo).filter(x => x.fecha >= ini && x.fecha <= fin).reduce((s, x) => s + c(x.monto), 0);
    const egresosMes = (D.pagos || []).filter(x => x.estado === 'pagada' && x.pagado_en >= ini && x.pagado_en <= fin).reduce((s, x) => s + c(x.monto), 0)
      + (D.gastos || []).filter(activo).filter(x => x.tipo !== 'transferencia' && x.fecha >= ini && x.fecha <= fin).reduce((s, x) => s + c(x.monto), 0);
    return {
      periodo, cuentas, A: p(A), B: p(B), C: p(C), D: p(Dm), E: p(E), F: p(cxc), G: p(favor), saldo_financiero: p(E + cxc - favor),
      cxp_pendientes: pendCxp, ingresos_mes: p(ingresosMes), egresos_mes: p(egresosMes), resultado_mes: p(ingresosMes - egresosMes),
    };
  }

  // ---------------------------------------------------- ingresos y egresos por rubro
  function porRubro(d, desde, hasta) {
    const D = d || {}, t = {};
    const sum = (rubro, tipo, monto) => { const k = rubro || (tipo === 'ingreso' ? 'I?' : 'E?'); t[k] = t[k] || { rubro: k, tipo, monto: 0 }; t[k].monto += c(monto); };
    const en = f => f && f >= desde && f <= hasta;
    // v3.2 · ingresos cobrados: cada peso va al rubro de la línea exacta que pagó (sin prorrateos)
    aplicacionesPorLinea(D.cobros, D.recibos, D.config).filter(x => en(x.cobro.fecha) && x.cobro.origen !== 'cruce').forEach(x => sum(x.rubro || ({ mora: 'I2.4', multa: 'I2.3' }[x.clase]) || 'I?', 'ingreso', x.monto));
    (D.cobros || []).filter(activo).filter(k => en(k.fecha) && k.origen !== 'cruce' && c(k.a_favor) > 0).forEach(k => sum('ANT', 'ingreso', k.a_favor));
    (D.ingresos || []).filter(activo).filter(x => en(x.fecha)).forEach(x => sum(x.rubro, 'ingreso', x.monto));
    (D.gastos || []).filter(activo).filter(x => x.tipo !== 'transferencia' && en(x.fecha)).forEach(x => sum(x.rubro, 'egreso', x.monto));
    (D.pagos || []).filter(x => x.estado === 'pagada' && en(x.pagado_en)).forEach(x => sum(x.rubro, 'egreso', x.monto));
    const filas = Object.values(t).map(x => Object.assign(x, { monto: p(x.monto), nombre: x.rubro === 'ANT' ? 'Cuotas adelantadas' : nombreRubro(D.rubros, x.rubro), grupo: grupoDe(x.rubro) }))
      .sort((a, b) => a.rubro.localeCompare(b.rubro, 'es', { numeric: true }));
    const ing = filas.filter(x => x.tipo === 'ingreso').reduce((s, x) => s + c(x.monto), 0), egr = filas.filter(x => x.tipo === 'egreso').reduce((s, x) => s + c(x.monto), 0);
    return { filas, ingresos: p(ing), egresos: p(egr), resultado: p(ing - egr) };
  }
  function presupuestoVsReal(d, anio) {
    const D = d || {}, real = porRubro(D, anio + '-01-01', anio + '-12-31');
    const pres = (D.presupuesto || []).filter(x => String(x.anio) === String(anio));
    const cods = Array.from(new Set(pres.map(x => x.rubro).concat(real.filas.filter(x => x.tipo === 'egreso').map(x => x.rubro))));
    return cods.map(cod => {
      const pr = pres.filter(x => x.rubro === cod).reduce((s, x) => s + c(x.monto), 0);
      const re = c((real.filas.find(x => x.rubro === cod) || {}).monto || 0);
      return { rubro: cod, nombre: nombreRubro(D.rubros, cod), presupuesto: p(pr), real: p(re), diferencia: p(pr - re), usado: pr ? Math.round(re * 1000 / pr) / 10 : null };
    }).sort((a, b) => a.rubro.localeCompare(b.rubro, 'es', { numeric: true }));
  }
  function cuotasVsCobros(d, anio) {
    const D = d || {}, out = {};
    const meses = Array.from({ length: 12 }, (_, i) => anio + '-' + String(i + 1).padStart(2, '0'));
    (D.recibos || []).filter(activo).filter(r => r.periodo.slice(0, 4) === String(anio)).forEach(r => {
      const a = out[r.apartamento] = out[r.apartamento] || { apartamento: r.apartamento, meses: {} };
      const m = a.meses[r.periodo] = a.meses[r.periodo] || { cuota: 0, cobro: 0 }; m.cuota += c(r.total);
    });
    (D.cobros || []).filter(activo).filter(k => k.fecha.slice(0, 4) === String(anio) && k.apartamento).forEach(k => {
      const a = out[k.apartamento] = out[k.apartamento] || { apartamento: k.apartamento, meses: {} };
      const per = periodoDe(k.fecha), m = a.meses[per] = a.meses[per] || { cuota: 0, cobro: 0 }; m.cobro += c(k.monto) + c(k.descuento || 0);
    });
    return { meses, filas: Object.values(out).map(a => ({ apartamento: a.apartamento, meses: meses.map(per => { const m = a.meses[per] || { cuota: 0, cobro: 0 }; return { periodo: per, cuota: p(m.cuota), cobro: p(m.cobro) }; }) }))
      .sort((x, y) => x.apartamento.localeCompare(y.apartamento, 'es', { numeric: true })) };
  }

  // ------------------------------------------------------- proyección de caja (90 días)
  /**
   * Saldo de hoy + lo que se espera cobrar − lo que se espera pagar, mes a mes.
   * Cobros esperados = promedio emitido de los últimos 3 meses × la cobranza real de esos meses (cobrado ÷ emitido, máx. 100 %) + cuotas de acuerdos.
   * Pagos esperados = promedio pagado de los últimos 3 meses; en el primer mes se suma lo pendiente de cuentas por pagar que no esté en el promedio.
   */
  function proyeccion(d, hoy) {
    const D = d || {}, h = hoy || hoyISO(), per0 = periodoDe(h);
    const saldoHoy = (D.cuentas || []).filter(x => x.activa !== 'no').reduce((s, x) => s + c(saldoCuenta(x.id, D, h)), 0);
    const ult = [1, 2, 3].map(n => sumarMeses(per0, -n));
    const emitido = ult.map(per => (D.recibos || []).filter(activo).filter(r => r.periodo === per && r.tipo !== 'mora').reduce((s, r) => s + c(r.total), 0));
    const cobrado = ult.map(per => (D.cobros || []).filter(activo).filter(k => periodoDe(k.fecha) === per && k.origen !== 'cruce').reduce((s, k) => s + c(k.monto), 0));
    const pagado = ult.map(per => (D.pagos || []).filter(x => x.estado === 'pagada' && periodoDe(x.pagado_en) === per).reduce((s, x) => s + c(x.monto), 0)
      + (D.gastos || []).filter(activo).filter(x => x.tipo !== 'transferencia' && periodoDe(x.fecha) === per).reduce((s, x) => s + c(x.monto), 0));
    const sumE = emitido.reduce((a, b) => a + b, 0), sumC = cobrado.reduce((a, b) => a + b, 0);
    const tasa = sumE ? Math.min(1, sumC / sumE) : (sumC ? 1 : 0);
    const promE = sumE / 3, promP = pagado.reduce((a, b) => a + b, 0) / 3;
    const pendientes = (D.pagos || []).filter(x => x.estado !== 'pagada' && activo(x)).reduce((s, x) => s + c(x.monto), 0);
    const cfg = reglas(D.config);
    let saldo = saldoHoy; const meses = [];
    for (let i = 0; i < 3; i++) {
      const per = sumarMeses(per0, i);
      const acuerdos = (D.acuerdos || []).filter(a => a.estado === 'vigente').reduce((s, a) => s + (a.cuotas || []).filter(q => periodoDe(q.vence) === per).reduce((t, q) => t + c(q.monto), 0), 0);
      const entra = Math.round(promE * tasa) + acuerdos;
      const sale = Math.round(promP) + (i === 0 ? Math.max(0, pendientes - Math.round(promP)) : 0) + (i > 0 ? 0 : 0);
      const inicio = saldo; saldo = saldo + entra - sale;
      meses.push({ periodo: per, inicio: p(inicio), entra: p(entra), sale: p(sale), fin: p(saldo), alerta: saldo < c(cfg.colchon_caja || 0) });
    }
    return { saldo_hoy: p(saldoHoy), tasa_cobranza: Math.round(tasa * 1000) / 10, promedio_emitido: p(promE), promedio_pagado: p(promP), pendientes_cxp: p(pendientes), meses,
      alerta: meses.find(m => m.alerta) || null };
  }

  // ------------------------------------------------------------- acuerdos de pago
  function estadoAcuerdo(acuerdo, cobros, hoy) {
    const h = hoy || hoyISO(), a = acuerdo || {};
    if (a.estado === 'anulado') return { estado: 'anulado' };
    // con la lista de recibos del acuerdo, cuenta solo lo aplicado a esos recibos (no las cuotas corrientes)
    const pagado = Array.isArray(a.recibos) && a.recibos.length
      ? (cobros || []).filter(activo).filter(k => k.apartamento === a.apartamento && k.fecha >= a.fecha).reduce((s, k) => s + (k.aplicaciones || []).filter(x => a.recibos.indexOf(x.recibo_id) >= 0).reduce((t, x) => t + c(x.monto) + c(x.descuento || 0), 0), 0)
      : (cobros || []).filter(activo).filter(k => k.apartamento === a.apartamento && k.fecha >= a.fecha && k.origen !== 'cruce').reduce((s, k) => s + c(k.monto), 0);
    const cuotas = (a.cuotas || []).slice().sort((x, y) => x.vence.localeCompare(y.vence));
    let debido = 0, vencidas = 0;
    cuotas.forEach(q => { if (q.vence < h) { debido += c(q.monto); vencidas++; } });
    const total = cuotas.reduce((s, q) => s + c(q.monto), 0);
    if (pagado >= total && total > 0) return { estado: 'cumplido', pagado: p(pagado), total: p(total), atraso: 0 };
    if (pagado < debido) {
      const primera = (() => { let acum = 0; for (const q of cuotas) { acum += c(q.monto); if (acum > pagado) return q; } return null; })();
      return { estado: 'incumplido', pagado: p(pagado), total: p(total), atraso: p(debido - pagado), desde: primera && primera.vence, dias: primera ? dias(primera.vence, h) : 0 };
    }
    return { estado: 'vigente', pagado: p(pagado), total: p(total), atraso: 0, proxima: (cuotas.find(q => q.vence >= h) || {}).vence || null };
  }
  /** Divide una deuda en n cuotas mensuales iguales (el último centavo va en la última). */
  function planCuotas(total, n, primera) {
    const t = c(total), k = Math.max(1, Math.floor(n)), base = Math.floor(t / k), out = [];
    for (let i = 0; i < k; i++) out.push({ vence: conDia(sumarMeses(periodoDe(primera), i), Number(primera.slice(8))), monto: p(i === k - 1 ? t - base * (k - 1) : base) });
    return out;
  }

  // ------------------------------------------------------------- Vigía de cobros
  function vigiaCobros(d, hoy) {
    const D = d || {}, h = hoy || hoyISO(), al = [];
    const ks = (D.cobros || []).filter(activo).filter(k => k.origen !== 'cruce' && k.origen !== 'sin_identificar');
    // R1 · el mismo depósito registrado dos veces
    for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
      const a = ks[i], b = ks[j];
      if (c(a.monto) !== c(b.monto)) continue;
      const mismaRef = a.referencia && b.referencia && String(a.referencia).trim() === String(b.referencia).trim();
      const cerca = a.apartamento === b.apartamento && Math.abs(dias(a.fecha, b.fecha)) <= 3;
      if (mismaRef || cerca) al.push({ regla: 'C1', nivel: 'rojo', texto: 'Posible cobro repetido: apto. ' + a.apartamento + ' y apto. ' + b.apartamento + ', ' + p(c(a.monto)).toLocaleString('en-US') + ' el ' + a.fecha + ' y el ' + b.fecha + (mismaRef ? ', misma referencia ' + a.referencia : '') + '.', ids: [a.id, b.id] });
    }
    // R2 · un apartamento que pagaba y dejó de pagar
    const per0 = periodoDe(h), ult2 = [1, 2].map(n => sumarMeses(per0, -n)), antes = [3, 4, 5, 6, 7, 8].map(n => sumarMeses(per0, -n));
    const deuda = {}; conSaldo(D.recibos, D.cobros, h).forEach(r => { deuda[r.apartamento] = (deuda[r.apartamento] || 0) + c(r.saldo); });
    Array.from(new Set(ks.map(k => k.apartamento).filter(Boolean))).forEach(a => {
      const pago = per => ks.some(k => k.apartamento === a && periodoDe(k.fecha) === per);
      const antesN = antes.filter(pago).length;
      if (antesN >= 4 && !ult2.some(pago) && deuda[a] > 0) al.push({ regla: 'C2', nivel: 'ambar', texto: 'El apto. ' + a + ' pagaba casi todos los meses y no paga desde hace 2 meses. Debe ' + p(deuda[a]).toLocaleString('en-US') + '.', apartamento: a });
    });
    // R3 · recibo ordinario por debajo del mes anterior
    // v3.2 · se compara solo la parte de cuota ordinaria (una extraordinaria que terminó no es una baja)
    const ordM = r => p(lineasDe(r).filter(l => claseDe(l) === 'ordinaria').reduce((s, l) => s + c(l.monto), 0));
    const ord = (D.recibos || []).filter(activo).filter(r => r.tipo !== 'mora' && ordM(r) > 0);
    ord.forEach(r => {
      const ant = ord.find(x => x.apartamento === r.apartamento && x.periodo === sumarMeses(r.periodo, -1)), a = ant ? ordM(ant) : 0, b = ordM(r);
      if (ant && c(b) < c(a) * 0.95) al.push({ regla: 'C3', nivel: 'ambar', texto: 'La cuota ordinaria de ' + nombreMes(r.periodo) + ' del apto. ' + r.apartamento + ' bajó ' + Math.round((1 - b / a) * 100) + ' % frente al mes anterior (' + a.toLocaleString('en-US') + ' → ' + b.toLocaleString('en-US') + '). Confirme que la Junta lo aprobó.', ids: [r.id] });
    });
    // R4 · depósitos sin identificar viejos · R5 · pagos notificados sin revisar
    (D.sin_identificar || []).filter(activo).filter(x => x.estado !== 'identificado' && dias(x.fecha, h) > 15)
      .forEach(x => al.push({ regla: 'C4', nivel: 'ambar', texto: 'Depósito de ' + Number(x.monto).toLocaleString('en-US') + ' del ' + x.fecha + ' lleva ' + dias(x.fecha, h) + ' días sin identificar.', ids: [x.id] }));
    (D.notificados || []).filter(x => x.estado === 'pendiente' && dias(x.fecha_aviso || x.fecha, h) > 3)
      .forEach(x => al.push({ regla: 'C5', nivel: 'ambar', texto: 'Pago notificado del apto. ' + x.apartamento + ' lleva ' + dias(x.fecha_aviso || x.fecha, h) + ' días sin revisar.', ids: [x.id] }));
    return al;
  }

  // ------------------------------------------------------------ v3.2 · reporte a la medida
  /**
   * Un reporte filtrado por lo que se quiera. f = { tipo, clases, desde, hasta, corte, aptos, tramo_min, agrupar }
   *  tipo: 'morosidad' (lo vencido por antigüedad) · 'saldos' (todo lo pendiente) · 'emitido' (lo facturado en el rango) · 'cobrado' (lo cobrado en el rango)
   *  clases: [] = todas · ['ordinaria'] = solo cuotas ordinarias, etc.   agrupar: 'apartamento' | 'clase' | 'periodo'
   * Devuelve { titulo, columnas, filas, total, resumen } listo para la tabla, el CSV y la impresión.
   */
  function reporteMedida(d, f) {
    const D = d || {}, q = f || {}, tipo = q.tipo || 'morosidad', corte = q.corte || q.hasta || hoyISO();
    const cl = (q.clases || []).filter(esClase), aptos = (q.aptos || []).map(a => String(a).toUpperCase()).filter(Boolean);
    const okC = k => !cl.length || cl.indexOf(k) >= 0, okA = a => !aptos.length || aptos.indexOf(String(a).toUpperCase()) >= 0;
    const desde = q.desde || '0000-01-01', hasta = q.hasta || corte, agrupar = q.agrupar || (tipo === 'morosidad' ? 'apartamento' : 'clase');
    const nomCl = cl.length ? cl.map(nombreClase).join(', ') : 'todas las clases';
    const titulos = { morosidad: 'Morosidad', saldos: 'Saldos pendientes', emitido: 'Emitido', cobrado: 'Cobrado' };
    let filas = [], columnas, resumen = {};
    if (tipo === 'morosidad' || tipo === 'saldos') {
      let ps = partidas(conSaldo(D.recibos, D.cobros, corte, D.config)).filter(x => c(x.saldo) > 0 && okC(x.clase) && okA(x.apartamento));
      if (tipo === 'morosidad') ps = ps.filter(x => x.vence < corte && dias(x.vence, corte) >= Number(q.tramo_min || 1));
      if (agrupar === 'apartamento') {
        const g = {};
        ps.forEach(x => { const a = g[x.apartamento] = g[x.apartamento] || { apartamento: x.apartamento, total: 0, dias: 0, partidas: 0 }; TRAMOS.forEach(([k]) => { a[k] = a[k] || 0; });
          const t = tramoDe(dias(x.vence, corte)); a[t] += c(x.saldo); a.total += c(x.saldo); a.dias = Math.max(a.dias, dias(x.vence, corte)); a.partidas++; });
        filas = Object.values(g).map(a => { TRAMOS.forEach(([k]) => { a[k] = p(a[k]); }); a.total = p(a.total); return a; }).sort((x, y) => y.total - x.total);
        columnas = [['apartamento', 'Apto.']].concat(TRAMOS.filter(([k]) => tipo === 'saldos' || k !== 'corriente').map(([k, n]) => [k, n, 'num']), [['total', 'Total', 'num'], ['dias', 'Días de atraso', 'num']]);
      } else if (agrupar === 'periodo') {
        const g = {}; ps.forEach(x => { const a = g[x.periodo] = g[x.periodo] || { periodo: x.periodo, mes: nombreMes(x.periodo), total: 0, partidas: 0 }; a.total += c(x.saldo); a.partidas++; });
        filas = Object.values(g).map(a => Object.assign(a, { total: p(a.total) })).sort((x, y) => x.periodo.localeCompare(y.periodo));
        columnas = [['mes', 'Mes'], ['partidas', 'Cargos', 'num'], ['total', 'Pendiente', 'num']];
      } else {
        const g = {}; ps.forEach(x => { const a = g[x.clase] = g[x.clase] || { clase: x.clase, nombre: nombreClase(x.clase), total: 0, aptos: new Set(), partidas: 0 }; a.total += c(x.saldo); a.aptos.add(x.apartamento); a.partidas++; });
        filas = ordenClases(D.config).filter(k => g[k]).map(k => { const a = g[k]; return { clase: k, nombre: a.nombre, apartamentos: a.aptos.size, partidas: a.partidas, total: p(a.total) }; });
        columnas = [['nombre', 'Clase'], ['apartamentos', 'Aptos.', 'num'], ['partidas', 'Cargos', 'num'], ['total', 'Pendiente', 'num']];
      }
      const totalAptos = (D.aptos || []).length || new Set((D.recibos || []).map(r => r.apartamento)).size;
      const morosos = new Set(ps.map(x => x.apartamento)).size, total = ps.reduce((s, x) => s + c(x.saldo), 0);
      // índice de morosidad: lo vencido entre lo emitido de esas clases en los últimos 12 meses
      const emit12 = partidas(conSaldo(D.recibos, [], corte, D.config)).filter(x => okC(x.clase) && okA(x.apartamento) && x.emision > sumarMeses(periodoDe(corte), -12) + '-00').reduce((s, x) => s + c(x.monto), 0);
      resumen = { total: p(total), apartamentos: morosos, de_apartamentos: totalAptos, pct_apartamentos: totalAptos ? Math.round(morosos * 1000 / totalAptos) / 10 : null,
        indice: emit12 ? Math.round(total * 1000 / emit12) / 10 : null, corte };
    } else {
      // emitido o cobrado en el rango, por la clase de cada línea
      let movs;
      if (tipo === 'emitido') movs = partidas(conSaldo(D.recibos, [], null, D.config)).filter(x => x.emision >= desde && x.emision <= hasta).map(x => ({ apartamento: x.apartamento, clase: x.clase, periodo: x.periodo, monto: c(x.monto) }));
      else movs = aplicacionesPorLinea(D.cobros, D.recibos, D.config).filter(x => x.cobro.origen !== 'cruce' && x.cobro.fecha >= desde && x.cobro.fecha <= hasta)
        .map(x => ({ apartamento: x.cobro.apartamento, clase: x.clase, periodo: periodoDe(x.cobro.fecha), monto: c(x.monto) }));
      movs = movs.filter(x => okC(x.clase) && okA(x.apartamento));
      const clave = agrupar === 'apartamento' ? 'apartamento' : agrupar === 'periodo' ? 'periodo' : 'clase', g = {};
      movs.forEach(x => { const a = g[x[clave]] = g[x[clave]] || { k: x[clave], total: 0, n: 0, aptos: new Set() }; a.total += x.monto; a.n++; a.aptos.add(x.apartamento); });
      const orden = clave === 'clase' ? ordenClases(D.config) : Object.keys(g).sort((a, b) => String(a).localeCompare(String(b), 'es', { numeric: true }));
      filas = orden.filter(k => g[k]).map(k => { const a = g[k]; return { [clave]: k, nombre: clave === 'clase' ? nombreClase(k) : clave === 'periodo' ? nombreMes(k) : k, apartamentos: a.aptos.size, movimientos: a.n, total: p(a.total) }; });
      columnas = [['nombre', clave === 'clase' ? 'Clase' : clave === 'periodo' ? 'Mes' : 'Apto.'], ['apartamentos', 'Aptos.', 'num'], ['movimientos', 'Movimientos', 'num'], ['total', tipo === 'emitido' ? 'Emitido' : 'Cobrado', 'num']];
      resumen = { total: p(movs.reduce((s, x) => s + x.monto, 0)), desde, hasta };
      // efectividad: cobrado ÷ emitido del mismo rango y clases
      if (tipo === 'cobrado') { const em = reporteMedida(D, Object.assign({}, q, { tipo: 'emitido' })).resumen.total; resumen.emitido = em; resumen.efectividad = em ? Math.round(c(resumen.total) * 1000 / c(em)) / 10 : null; }
    }
    const total = {}; (columnas || []).filter(x => x[2] === 'num' && x[0] !== 'dias').forEach(([k]) => { total[k] = filas.reduce((s, x) => s + (k === 'total' || TRAMOS.some(t => t[0] === k) ? c(x[k]) : Number(x[k]) || 0), 0); if (k === 'total' || TRAMOS.some(t => t[0] === k)) total[k] = p(total[k]); });
    return { titulo: titulos[tipo] + ' · ' + nomCl, tipo, clases: cl, columnas, filas, total, resumen };
  }

  // -------------------------------------------- v3.2 · seguimiento de cobranza y sus métricas
  const CANALES = [['llamada', 'Llamada'], ['whatsapp', 'WhatsApp'], ['correo', 'Correo'], ['sms', 'SMS'], ['telegram', 'Telegram'], ['visita', 'Visita'], ['carta', 'Carta o aviso']];
  const RESULTADOS = [['contactado', 'Habló con el residente', 1], ['promesa', 'Prometió pagar', 1], ['pago_informado', 'Dijo que ya pagó', 1], ['disputa', 'No está de acuerdo con el saldo', 1],
    ['no_contesta', 'No contestó', 0], ['ocupado', 'Ocupado o apagado', 0], ['mensaje_dejado', 'Se dejó mensaje', 0], ['numero_errado', 'Número equivocado', 0], ['enviado', 'Mensaje enviado', 0]];
  const esContacto = res => !!(RESULTADOS.find(x => x[0] === res) || [])[2];
  /** Canal de una gestión vieja (v3.0 guardaba `tipo`). */
  const canalDe = g => g.canal || ({ llamada: 'llamada', whatsapp: 'whatsapp', correo: 'correo', visita: 'visita', carta: 'carta', sms: 'sms' }[String(g.tipo || '').toLowerCase()]) || 'llamada';
  /** Estado de una promesa de pago: cumplida si el apto pagó lo prometido entre la gestión y la fecha prometida (+2 días de gracia). */
  function estadoPromesa(g, cobros, hoy) {
    if (!g.promesa_fecha) return null;
    const h = hoy || hoyISO(), ini = String(g.fecha).slice(0, 10), fin = g.promesa_fecha;
    const lim = new Date(Date.parse(fin) + 2 * 864e5).toISOString().slice(0, 10);
    const pagado = (cobros || []).filter(activo).filter(k => k.apartamento === g.apartamento && k.origen !== 'cruce' && k.fecha >= ini && k.fecha <= lim).reduce((s, k) => s + c(k.monto), 0);
    const meta = c(g.promesa_monto || 0);
    if (pagado > 0 && (!meta || pagado >= meta)) return 'cumplida';
    return lim < h ? 'incumplida' : 'pendiente';
  }
  /**
   * Métricas del equipo de cobros en un rango: gestiones, contacto, promesas, lo recuperado, WhatsApp (entregado / leído) y la encuesta.
   * x = { gestiones, mensajes, encuestas, cobros }   Lo recuperado = lo cobrado a un apto en los 7 días siguientes a una gestión con él (sin contar dos veces).
   */
  function metricasCobranza(x, desde, hasta, hoy) {
    const X = x || {}, h = hoy || hoyISO(), en = f => { const d = String(f || '').slice(0, 10); return d >= desde && d <= hasta; };
    const gs = (X.gestiones || []).filter(g => g.estado !== 'anulado' && en(g.fecha));
    const ks = (X.cobros || []).filter(activo).filter(k => k.origen !== 'cruce');
    const pct = (a, b) => b ? Math.round(a * 1000 / b) / 10 : null;
    const grupo = lista => {
      const contactos = lista.filter(g => esContacto(g.resultado || (canalDe(g) === 'llamada' ? '' : 'enviado'))).length;
      const prom = lista.filter(g => g.promesa_fecha), est = prom.map(g => estadoPromesa(g, ks, h));
      const cumplidas = est.filter(e => e === 'cumplida').length, incumplidas = est.filter(e => e === 'incumplida').length;
      // recuperado: cobros del apto dentro de 7 días después de alguna gestión de esta lista
      const vistos = new Set(); let recuperado = 0;
      lista.forEach(g => { const ini = String(g.fecha).slice(0, 10), fin = new Date(Date.parse(ini) + 7 * 864e5).toISOString().slice(0, 10);
        ks.filter(k => k.apartamento === g.apartamento && k.fecha >= ini && k.fecha <= fin && !vistos.has(k.id)).forEach(k => { vistos.add(k.id); recuperado += c(k.monto); }); });
      const llamadas = lista.filter(g => canalDe(g) === 'llamada'), seg = llamadas.reduce((s, g) => s + (Number(g.duracion_seg) || 0), 0);
      return { gestiones: lista.length, llamadas: llamadas.length, minutos: Math.round(seg / 6) / 10, contactos, tasa_contacto: pct(contactos, lista.length), promesas: prom.length, cumplidas, incumplidas,
        tasa_cumplimiento: pct(cumplidas, cumplidas + incumplidas), recuperado: p(recuperado), aptos: new Set(lista.map(g => g.apartamento)).size };
    };
    const por = (fn, nombres) => { const g = {}; gs.forEach(x => { const k = fn(x) || '—'; (g[k] = g[k] || []).push(x); }); return Object.keys(g).map(k => Object.assign({ clave: k, nombre: nombres ? (nombres.find(n => n[0] === k) || [k, k])[1] : k }, grupo(g[k]))).sort((a, b) => b.gestiones - a.gestiones); };
    const porDia = {}; gs.forEach(g => { const d = String(g.fecha).slice(0, 10); const a = porDia[d] = porDia[d] || { fecha: d, gestiones: 0, contactos: 0 }; a.gestiones++; if (esContacto(g.resultado)) a.contactos++; });
    // WhatsApp: solo los mensajes con estado del proveedor dicen si se leyeron; los enviados a mano se cuentan aparte
    const ms = (X.mensajes || []).filter(m => en(m.enviado_en || m.creado_en));
    const wa = ms.filter(m => m.canal === 'whatsapp'), api = wa.filter(m => m.estado !== 'manual' && m.estado !== 'pendiente');
    const llego = m => ['entregado', 'leido', 'respondido'].indexOf(m.estado) >= 0, leyo = m => ['leido', 'respondido'].indexOf(m.estado) >= 0;
    const tLect = api.filter(m => m.leido_en && m.enviado_en).map(m => (Date.parse(m.leido_en) - Date.parse(m.enviado_en)) / 6e4).filter(v => v >= 0);
    const whatsapp = { total: wa.length, con_estado: api.length, manuales: wa.filter(m => m.estado === 'manual').length, enviados: api.length, entregados: api.filter(llego).length, leidos: api.filter(leyo).length,
      sin_leer: api.filter(m => m.estado === 'entregado' || m.estado === 'enviado').length, respondidos: api.filter(m => m.estado === 'respondido').length, fallidos: api.filter(m => m.estado === 'fallido').length,
      tasa_entrega: pct(api.filter(llego).length, api.length), tasa_lectura: pct(api.filter(leyo).length, api.filter(llego).length), tasa_respuesta: pct(api.filter(m => m.estado === 'respondido').length, api.filter(leyo).length),
      minutos_a_leer: tLect.length ? Math.round(tLect.sort((a, b) => a - b)[Math.floor(tLect.length / 2)]) : null };
    const canales = ['whatsapp', 'correo', 'telegram', 'sms'].map(k => { const l = ms.filter(m => m.canal === k); return { canal: k, total: l.length, fallidos: l.filter(m => m.estado === 'fallido').length }; }).filter(x => x.total);
    return { desde, hasta, totales: grupo(gs), por_gestor: por(g => g.creado_por), por_canal: por(canalDe, CANALES), por_resultado: por(g => g.resultado || 'sin_dato', RESULTADOS),
      por_dia: Object.values(porDia).sort((a, b) => a.fecha.localeCompare(b.fecha)), whatsapp, mensajes: canales, encuesta: kpiEncuesta((X.encuestas || []).filter(e => en(e.enviada_en))) };
  }
  /** KPI de la encuesta de satisfacción de cobros: respuesta, CSAT (1–5), % satisfechos (4 y 5), NPS (0–10), claridad, trato y resolución. */
  function kpiEncuesta(lista, porGestor) {
    const es = lista || [], r = es.filter(e => e.respondida_en);
    const prom = k => { const v = r.map(e => Number(e[k])).filter(n => n > 0); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) * 100 / v.length) / 100 : null; };
    const nps = r.filter(e => e.nps !== '' && e.nps !== null && e.nps !== undefined).map(e => Number(e.nps)).filter(n => n >= 0 && n <= 10);
    const out = { enviadas: es.length, respondidas: r.length, tasa_respuesta: es.length ? Math.round(r.length * 1000 / es.length) / 10 : null, csat: prom('csat'),
      satisfechos: r.length ? Math.round(r.filter(e => Number(e.csat) >= 4).length * 1000 / r.length) / 10 : null, claridad: prom('claridad'), trato: prom('trato'),
      resuelto: r.length ? Math.round(r.filter(e => e.resuelto === 'si').length * 1000 / r.length) / 10 : null,
      nps: nps.length ? Math.round((nps.filter(n => n >= 9).length - nps.filter(n => n <= 6).length) * 100 / nps.length) : null, comentarios: r.filter(e => e.comentario).map(e => ({ fecha: e.respondida_en, csat: e.csat, texto: e.comentario, gestor: e.gestor })).slice(-20).reverse() };
    if (porGestor !== false) { const g = {}; es.forEach(e => { (g[e.gestor || '—'] = g[e.gestor || '—'] || []).push(e); }); out.por_gestor = Object.keys(g).map(k => Object.assign({ gestor: k }, kpiEncuesta(g[k], false))).sort((a, b) => (b.respondidas - a.respondidas)); }
    return out;
  }

  // ----------------------------------------------------- contabilidad formal (partida doble)
  const CATALOGO = [
    ['1101', 'Caja chica', 'activo'], ['1102', 'Bancos', 'activo'], ['1201', 'Cuentas por cobrar a propietarios', 'activo'],
    ['2101', 'Cuentas por pagar a proveedores', 'pasivo'], ['2102', 'Cuotas adelantadas', 'pasivo'], ['2103', 'Depósitos por identificar', 'pasivo'],
    ['3101', 'Fondo del condominio', 'patrimonio'], ['3102', 'Resultado del periodo', 'patrimonio'], ['3103', 'Fondo de reserva', 'patrimonio'],
    ['4999', 'Descuentos por pronto pago', 'ingreso'],
  ];
  function cuentaDeRubro(cod, tipo) {
    if (cod === 'I3.1') return '3101';
    if (cod === 'I4.1') return '3103';   // v3.2 · el aporte al fondo de reserva no es ingreso del mes: va al fondo
    return (tipo === 'egreso' || String(cod || '').startsWith('E') ? '5-' : '4-') + (cod || '?');
  }
  function cuentaDeBanco(D, id, fecha) {
    const x = (D.cuentas || []).find(k => k.id === id);
    if (x && fecha && x.fecha_inicial && fecha < x.fecha_inicial) return '3101'; // ya incluido en el saldo inicial
    return x && x.tipo === 'caja_chica' ? '1101' : '1102';
  }
  /** Genera los asientos de todos los movimientos activos. Cada asiento cuadra (débitos = créditos). */
  function asientos(d, desde, hasta) {
    const D = d || {}, out = [];
    const en = f => (!desde || f >= desde) && (!hasta || f <= hasta);
    const as = (fecha, detalle, lineas, ref) => { if (!fecha || !en(fecha)) return; const ls = lineas.filter(l => c(l.debe) || c(l.haber)); if (ls.length) out.push({ fecha, detalle, lineas: ls, ref }); };
    (D.cuentas || []).forEach(x => { if (c(x.saldo_inicial)) as(x.fecha_inicial || '2000-01-01', 'Saldo inicial · ' + x.nombre, [{ cuenta: cuentaDeBanco(D, x.id), debe: x.saldo_inicial }, { cuenta: '3101', haber: x.saldo_inicial }], 'cta:' + x.id); });
    (D.recibos || []).filter(activo).forEach(r => as(r.emision, 'Recibo ' + (r.numero || '') + ' · apto. ' + r.apartamento,
      [{ cuenta: '1201', debe: r.total }].concat((r.lineas || []).map(l => ({ cuenta: cuentaDeRubro(l.rubro, 'ingreso'), haber: l.monto }))), 'rec:' + r.id));
    (D.cobros || []).filter(activo).forEach(k => {
      const aplicado = (k.aplicaciones || []).reduce((s, x) => s + c(x.monto), 0), desc = c(k.descuento || 0);
      if (k.origen === 'cruce') return as(k.fecha, 'Anticipo aplicado · apto. ' + k.apartamento, [{ cuenta: '2102', debe: k.monto }, { cuenta: '1201', haber: k.monto }], 'cob:' + k.id);
      const origen = k.origen === 'sin_identificar' ? '2103' : cuentaDeBanco(D, k.cuenta_id, k.fecha);
      as(k.fecha, 'Cobro · apto. ' + k.apartamento, [{ cuenta: origen, debe: k.monto }, { cuenta: '4999', debe: p(desc) }, { cuenta: '1201', haber: p(aplicado + desc) }, { cuenta: '2102', haber: k.a_favor || 0 }], 'cob:' + k.id);
    });
    (D.sin_identificar || []).filter(activo).forEach(x => as(x.fecha, 'Depósito por identificar', [{ cuenta: cuentaDeBanco(D, x.cuenta_id, x.fecha), debe: x.monto }, { cuenta: '2103', haber: x.monto }], 'dep:' + x.id));
    (D.ingresos || []).filter(activo).forEach(x => as(x.fecha, x.detalle || 'Otro ingreso', [{ cuenta: cuentaDeBanco(D, x.cuenta_id, x.fecha), debe: x.monto }, { cuenta: cuentaDeRubro(x.rubro, 'ingreso'), haber: x.monto }], 'ing:' + x.id));
    (D.gastos || []).filter(activo).forEach(x => {
      if (x.tipo === 'transferencia') as(x.fecha, 'Transferencia · ' + (x.detalle || ''), [{ cuenta: cuentaDeBanco(D, x.destino_id, x.fecha), debe: x.monto }, { cuenta: cuentaDeBanco(D, x.cuenta_id, x.fecha), haber: x.monto }], 'tra:' + x.id);
      else as(x.fecha, x.detalle || 'Gasto', [{ cuenta: cuentaDeRubro(x.rubro, 'egreso'), debe: x.monto }, { cuenta: cuentaDeBanco(D, x.cuenta_id, x.fecha), haber: x.monto }], 'gas:' + x.id);
    });
    (D.pagos || []).filter(activo).forEach(x => {
      as(x.fecha || x.pagado_en, 'Factura · ' + (x.suplidor || ''), [{ cuenta: cuentaDeRubro(x.rubro, 'egreso'), debe: x.monto }, { cuenta: '2101', haber: x.monto }], 'cxp:' + x.id);
      const banco0 = ((D.cuentas || []).find(k => k.tipo === 'banco' && k.activa !== 'no') || {}).id;
      if (x.estado === 'pagada') as(x.pagado_en, 'Pago · ' + (x.suplidor || ''), [{ cuenta: '2101', debe: x.monto }, { cuenta: cuentaDeBanco(D, x.cuenta_id || banco0, x.pagado_en), haber: x.monto }], 'pag:' + x.id);
    });
    out.sort((a, b) => a.fecha.localeCompare(b.fecha));
    return out;
  }
  function nombreCuenta(D, cod) {
    const f = CATALOGO.find(x => x[0] === cod); if (f) return f[1];
    if (/^[45]-/.test(cod)) return nombreRubro(D.rubros, cod.slice(2));
    return cod;
  }
  const tipoCuenta = cod => { const f = CATALOGO.find(x => x[0] === cod); if (f) return f[2]; return cod.startsWith('4') ? 'ingreso' : cod.startsWith('5') ? 'gasto' : 'activo'; };
  function balances(d, hasta, desde) {
    const D = d || {}, sal = {};
    asientos(D, null, hasta).forEach(a => a.lineas.forEach(l => { sal[l.cuenta] = (sal[l.cuenta] || 0) + c(l.debe) - c(l.haber); }));
    const filas = Object.keys(sal).sort().map(k => ({ cuenta: k, nombre: nombreCuenta(D, k), tipo: tipoCuenta(k), saldo: p(sal[k]) }));
    const tot = t => filas.filter(x => x.tipo === t).reduce((s, x) => s + c(x.saldo), 0);
    // estado de resultados del rango
    const res = {}; asientos(D, desde || null, hasta).forEach(a => a.lineas.forEach(l => { const t = tipoCuenta(l.cuenta); if (t === 'ingreso' || t === 'gasto') res[l.cuenta] = (res[l.cuenta] || 0) + c(l.haber) - c(l.debe); }));
    const er = Object.keys(res).sort().map(k => ({ cuenta: k, nombre: nombreCuenta(D, k), tipo: tipoCuenta(k), monto: p(res[k] * (tipoCuenta(k) === 'gasto' ? -1 : 1)) }));
    const ingresos = er.filter(x => x.tipo === 'ingreso').reduce((s, x) => s + c(x.monto), 0), gastos = er.filter(x => x.tipo === 'gasto').reduce((s, x) => s + c(x.monto), 0);
    const resultadoTotal = -(tot('ingreso') + tot('gasto')); // ingresos tienen saldo acreedor (negativo)
    return {
      filas, activo: p(tot('activo')), pasivo: p(-tot('pasivo')), patrimonio: p(-tot('patrimonio')), resultado_acumulado: p(resultadoTotal),
      cuadra: Math.abs(tot('activo') + tot('pasivo') + tot('patrimonio') + tot('ingreso') + tot('gasto')) < 1,
      resultados: { filas: er, ingresos: p(ingresos), gastos: p(gastos), resultado: p(ingresos - gastos) },
    };
  }

  // ----------------------------------------------------- Junta, honorarios, cierre
  const requiereJunta = (monto, config) => { const u = Number(reglas(config).umbral_junta) || 0; return u > 0 && Number(monto) >= u; };
  function honorario(config, periodo, torre) {
    const cfg = reglas(config); if (!(Number(cfg.honorario_monto) > 0)) return null;
    return { torre, periodo, suplidor: 'Stili Group · Honorarios de administración', concepto: 'Honorarios de administración de ' + nombreMes(periodo), monto: r2(cfg.honorario_monto), rubro: 'E4.1', vence: conDia(periodo, cfg.honorario_dia || 1), origen: 'honorario' };
  }
  const mesCerrado = (fecha, cierres) => !!(cierres || []).find(k => k.periodo === periodoDe(fecha) && k.estado === 'cerrado');
  function enlacePago(config, recibo, torre) {
    const u = reglas(config).pasarela_url; if (!u || !recibo) return '';
    return u.replace('{recibo}', encodeURIComponent(recibo.numero || recibo.id)).replace('{monto}', encodeURIComponent(recibo.saldo != null ? recibo.saldo : recibo.total)).replace('{torre}', encodeURIComponent(torre || ''));
  }

  // ------------------------------------------------- leer el estado del banco (CSV/Excel)
  /** Parte un texto CSV respetando comillas ("12,500.00" es un solo valor). Detecta coma o punto y coma. */
  function leerCSV(texto) {
    const t = String(texto || '').replace(/^\ufeff/, ''), primera = t.split(/\r?\n/)[0] || '';
    const sep = (primera.match(/;/g) || []).length > (primera.match(/,/g) || []).length ? ';' : ',';
    const filas = []; let fila = [], campo = '', dentro = false;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (dentro) { if (ch === '"') { if (t[i + 1] === '"') { campo += '"'; i++; } else dentro = false; } else campo += ch; }
      else if (ch === '"') dentro = true;
      else if (ch === sep) { fila.push(campo); campo = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; fila.push(campo); filas.push(fila); fila = []; campo = ''; }
      else campo += ch;
    }
    if (campo || fila.length) { fila.push(campo); filas.push(fila); }
    return filas;
  }
  /** Convierte filas sueltas de un estado de banco en movimientos { fecha, descripcion, referencia, monto (+ crédito, − débito) }. */
  function leerExtracto(filas) {
    const norm = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    const num = v => { if (typeof v === 'number') return v; const s = String(v == null ? '' : v).replace(/[RD$\s]/gi, ''); if (!s) return null; const neg = /^\(.*\)$/.test(s) || /-$/.test(s); const n = Number(s.replace(/[(),-]/g, m => m === ',' ? '' : '')); return isNaN(n) ? null : (neg ? -n : n); };
    const fecha = v => {
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + v * 864e5).toISOString().slice(0, 10);
      const s = String(v || '').trim(); let m;
      if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return m[1] + '-' + m[2] + '-' + m[3];
      if ((m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/))) { const a = m[3].length === 2 ? '20' + m[3] : m[3]; return a + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0'); }
      return '';
    };
    const lista = (filas || []).filter(f => Array.isArray(f));
    const iCab = lista.findIndex(f => f.some(x => /fecha/.test(norm(x))) && f.some(x => /(monto|debito|credito|valor|importe)/.test(norm(x))));
    if (iCab < 0) return { movimientos: [], error: 'No encontré la fila de títulos (Fecha y Monto, o Débito y Crédito).' };
    const cab = lista[iCab].map(norm), col = re => cab.findIndex(x => re.test(x));
    const cF = col(/fecha/), cD = col(/(descripcion|concepto|detalle)/), cR = col(/(referencia|ref|documento|numero)/);
    const cDeb = col(/(debito|retiro|cargo)/), cCre = col(/(credito|deposito|abono)/), cM = col(/(monto|valor|importe)/);
    const movimientos = [];
    lista.slice(iCab + 1).forEach(f => {
      const fe = fecha(f[cF]); if (!fe) return;
      let monto = null;
      if (cDeb >= 0 || cCre >= 0) { const de = num(f[cDeb]) || 0, cr = num(f[cCre]) || 0; monto = cr - Math.abs(de); if (!de && !cr) monto = null; }
      if (monto === null && cM >= 0) monto = num(f[cM]);
      if (monto === null || !monto) return;
      movimientos.push({ fecha: fe, descripcion: String(cD >= 0 ? f[cD] || '' : '').trim(), referencia: String(cR >= 0 ? f[cR] || '' : '').trim(), monto: r2(monto) });
    });
    return { movimientos };
  }

  return {
    // utilidades
    c, p, r2, hoyISO, periodoDe, finDe, inicioDe, sumarMeses, dias, conDia, nombreMes, MESES, activo,
    // configuración
    RUBROS_BASE, rubrosBase, nombreRubro, grupoDe, CONFIG_BASE, reglas,
    // cuotas y cobros
    repartir, armarRecibos, numerar, aplicadoPorRecibo, conSaldo, aFavor, descuentoProntoPago, montoProntoPago, aplicarCobro, cruzarAnticipo, estadoCuenta,
    TRAMOS, antiguedad, calcularMora, estadoAcuerdo, planCuotas, vigiaCobros,
    // v3.2 · clases, partidas, reporte a la medida, cobranza y encuesta
    CLASES, nombreClase, claseDe, ordenClases, lineasDe, aplicacionesPorLinea, partidas, reporteMedida,
    CANALES, RESULTADOS, esContacto, canalDe, estadoPromesa, metricasCobranza, kpiEncuesta,
    // bancos y cierre
    libro, saldoCuenta, conciliar, leerExtracto, leerCSV, mesCerrado,
    // reportes
    liquidacion, porRubro, presupuestoVsReal, cuotasVsCobros, proyeccion,
    // contabilidad formal
    CATALOGO, cuentaDeRubro, asientos, balances, nombreCuenta,
    // mejoras
    requiereJunta, honorario, enlacePago,
  };
});
