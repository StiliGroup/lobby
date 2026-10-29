/**
 * Stili Soft v3.4 · Stili Group · Empresa (conectada a Alegra).
 * La contabilidad propia de Stili Group, aparte de las torres. Hace con Claude el trabajo que hoy hace una persona:
 *   1. COMPRAS: recibe muchas facturas en un solo PDF (20 o 30 páginas escaneadas), fotos sueltas o correos. La IA separa cada factura
 *      y sus páginas, lee los datos fiscales, la valida (NCF en la DGII, RNC, ITBIS, a nombre de Stili), busca duplicados contra todo
 *      lo que ya está en Alegra (2024, 2025, 2026) y la distribuye como lo hace hoy Contabilidad (aprende de las compras ya registradas
 *      en Alegra: suplidor → categoría y centro de costo; más las reglas que usted escriba). Las «listas» se registran en Alegra con su PDF;
 *      las dudosas esperan su revisión.
 *   2. CONCILIACIÓN: sube el estado de cuenta del mes, la IA lo lee, se empareja con los movimientos de Alegra, propone comisiones,
 *      impuestos e intereses del banco, y los depósitos sin factura. Usted confirma y se crea la conciliación en Alegra.
 *   3. FACTURAS A CLIENTES: propone cada mes los honorarios fijos por torre, los depósitos sin factura y los otros servicios.
 *      NADA se emite sin que una persona lo apruebe. Al aprobar, se crea la factura en Alegra con su NCF.
 *
 * Archivo nuevo del servicio; se registra solo (HOJAS, ACCIONES_CENTRAL, ACCESO_ACCION, SECCIONES). Requiere buzon.gs (módulo Fiscal y DGII).
 * Usa de Código.gs: claude_, partirRespuesta_, leer_, leerSiExiste_, agregar_, actualizar_, olvidar_, libro_, config_, s_, error_, idNuevo_, conAdmin_, TZ.
 *
 * Alegra (API pública v1, verificada en developer.alegra.com el 28-oct-2026):
 *  - https://api.alegra.com/api/v1 · autenticación Basic con correo:token (Configuración › API - Integraciones con otros sistemas).
 *  - Límite 150 consultas por minuto (HTTP 429). Paginación start/limit (máx. 30).
 *  - POST /bills (date, dueDate, provider, purchases.categories[{id, price, quantity, tax[{id}]}], costCenter, numberTemplate{number}),
 *    POST /bills/{id}/attachment (campo «file»), POST /invoices (client, items[{id, price, quantity, tax}], numberTemplate{id},
 *    paymentType, stamp{generateStamp}), POST /conciliations (date, account{id}, realBalance, transactions[], bankExpenses, bankTaxes, bankInterests, status).
 *  - Lo que la documentación no deja claro (ruta de movimientos bancarios y formato del NCF en compras) se confirma con la primera
 *    sincronización de solo lectura; está aislado en ALEGRA_RUTAS y Emp.numeroCompra.
 * El usuario y el token de Alegra los escribe usted en la pantalla: se guardan en las propiedades del script y nunca se devuelven.
 */

const EMP_TABLAS = {
  Emp_Catalogo: ['tipo', 'id', 'nombre', 'rnc', 'extra', 'actualizado_en'],
  Emp_Compras: ['alegra_id', 'fecha', 'proveedor_id', 'proveedor', 'rnc', 'ncf', 'total', 'categoria_id', 'centro_id', 'impuesto_id', 'estado', 'origen', 'actualizado_en'],
  Emp_Lotes: ['id', 'fecha', 'origen', 'archivo', 'drive_id', 'hash', 'tipo', 'paginas', 'siguiente', 'facturas', 'estado', 'detalle', 'intentos', 'creado_por', 'actualizado_en'],
  Emp_Cola: ['id', 'lote_id', 'paginas', 'clave', 'archivo_id', 'url', 'estado', 'suplidor', 'rnc', 'ncf', 'fecha_factura', 'total', 'itbis', 'datos', 'propuesta', 'alertas',
    'motivos', 'duplicado', 'alegra_id', 'revisado_por', 'error', 'creado_en', 'actualizado_en'],
  Emp_Reglas: ['id', 'rnc', 'contiene', 'categoria_id', 'centro_id', 'nota', 'creado_por', 'creado_en'],
  Emp_Honorarios: ['id', 'torre', 'cliente_id', 'item_id', 'monto', 'impuesto_id', 'dia', 'activo', 'nota'],
  Emp_Propuestas: ['id', 'tipo', 'clave', 'periodo', 'fecha', 'cliente_id', 'cliente', 'item_id', 'concepto', 'monto', 'impuesto_id', 'origen', 'estado', 'alegra_id',
    'numero', 'aprobado_por', 'error', 'creado_en', 'actualizado_en'],
  Emp_Conciliaciones: ['id', 'cuenta_id', 'cuenta', 'mes', 'archivo_id', 'url', 'saldo_inicial', 'saldo_banco', 'lineas', 'parejas', 'estado', 'alegra_id', 'detalle',
    'creado_por', 'creado_en', 'actualizado_en'],
  Emp_Extracto: ['id', 'conc_id', 'n', 'fecha', 'descripcion', 'referencia', 'monto', 'saldo', 'clase', 'pareja', 'pareja_desc', 'propuesta_id'],
};
Object.keys(EMP_TABLAS).forEach(k => { HOJAS[k] = EMP_TABLAS[k]; });
['datos', 'propuesta', 'alertas', 'motivos', 'detalle', 'extra'].forEach(k => { LARGO_COLUMNA[k] = Math.max(LARGO_COLUMNA[k] || 0, 9000); });

const ALEGRA_BASE = 'https://api.alegra.com/api/v1';
const ALEGRA_RUTAS = {
  contactos: '/contacts', categorias: '/categories', centros: '/cost-centers', impuestos: '/taxes', bancos: '/bank-accounts',
  numeraciones: '/number-templates', items: '/items', compras: '/bills', ventas: '/invoices', conciliaciones: '/conciliations', pagos: '/payments',
  movimientos: '/bank-accounts/{id}/transactions',   // por confirmar con el primer sondeo; si no existe se usan los pagos de esa cuenta
};
const EMP_MINUTOS = 10, EMP_TIEMPO_MS = 4.5 * 60 * 1000, EMP_BLOQUE = 8, EMP_BLOQUE_EXTRACTO = 4;
const EMP_MIME = /^(application\/pdf|image\/(jpeg|png|webp)|text\/csv|text\/plain)$/;
const EMP_CONFIG = {
  EMP_RNC: ['', 'RNC de Stili Group (las facturas de suplidores deben venir a este RNC)'],
  EMP_RAZON: ['Condo Ad Services, S.R.L.', 'Razón social de Stili Group como debe salir en las facturas (también se acepta «Stili Group»)'],
  EMP_DESDE: ['2024-01-01', 'Fecha desde la que se registran facturas de suplidores'],
  EMP_AUTO: ['no', 'si = las facturas «listas» se registran solas en Alegra; no = se aprueban con un clic'],
  EMP_EMITIR: ['si', 'si = al aprobar una factura a cliente se emite en Alegra (con NCF); no = queda en borrador en Alegra'],
  EMP_PLANTILLA_VENTA: ['', 'Numeración de Alegra para las facturas a clientes (id); vacío = la preferida de Alegra'],
  EMP_VENCE_DIAS: ['30', 'Días de crédito de las facturas a clientes'],
  EMP_GMAIL_ETIQUETA: ['', 'Etiqueta de Gmail cuyas facturas adjuntas se leen solas (vacío = no se leen correos)'],
};
// pdf-lib 1.17.1 (MIT), el mismo archivo publicado en npm; se verifica la huella antes de usarlo
const PDFLIB_URL = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
const PDFLIB_SHA256 = '0f9a5cad07941f0826586c94e089d89b918c46e5c17cf2d5a3c6f666e3bc694f';

// ================================================================== reglas (funciones puras, se prueban en node)
const Emp = (() => {
  const n = v => { const x = Number(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(x) ? Math.round(x * 100) / 100 : 0; };
  const dig = v => String(v == null ? '' : v).replace(/\D/g, '');
  const sinT = v => String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const fecha = v => {
    if (v instanceof Date || (v && typeof v.getFullYear === 'function')) return isNaN(v.getTime()) ? '' : v.getFullYear() + '-' + String(v.getMonth() + 1).padStart(2, '0') + '-' + String(v.getDate()).padStart(2, '0');
    const t = String(v == null ? '' : v).trim(); let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
    m = t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/); return m ? m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0') : '';
  };
  const masDias = (f, d) => { const t = Date.parse(fecha(f) + 'T12:00:00Z'); if (isNaN(t)) return ''; return new Date(t + d * 864e5).toISOString().slice(0, 10); };
  const finDeMes = mes => { const m = String(mes).match(/^(\d{4})-(\d{2})$/); if (!m) return ''; return new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).toISOString().slice(0, 10); };
  const clave = c => dig(c.rnc) || (s_x(c.proveedor_id) ? 'p' + s_x(c.proveedor_id) : '');
  function s_x(v) { return v == null ? '' : String(v).trim(); }

  /**
   * Del bloque leído por la IA (páginas ini..fin de un documento de n páginas) toma las facturas completas.
   * Si la última sigue en la página siguiente y no empezó en la primera del bloque, se deja para el próximo bloque.
   */
  function cortarBloque(facturas, ini, fin, total) {
    const todas = [].concat(...(facturas || []).map(f => [].concat(f.paginas || []).map(Number))).filter(p => Math.floor(p) === p);
    // si la IA numeró las páginas desde 1 dentro del bloque (y no desde la página real), se corrigen
    const desplazar = ini > 1 && todas.length && todas.every(p => p >= 1 && p <= fin - ini + 1) && todas.some(p => p < ini) ? ini - 1 : 0;
    const lista = (facturas || []).map(f => {
      const pags = [...new Set([].concat(f.paginas || []).map(Number).map(p => p + desplazar).filter(p => p >= ini && p <= fin && Math.floor(p) === p))].sort((a, b) => a - b);
      return Object.assign({}, f, { paginas: pags });
    }).filter(f => f.paginas.length).sort((a, b) => a.paginas[0] - b.paginas[0]);
    let siguiente = fin + 1, ampliar = false;
    const ult = lista[lista.length - 1];
    if (ult && fin < total && (ult.continua === true || ult.continua === 'true')) {
      if (ult.paginas[0] > ini) { lista.pop(); siguiente = ult.paginas[0]; }
      else ampliar = true;   // una factura que llena todo el bloque y sigue: hay que leer un bloque más grande
    }
    const perdidas = (facturas || []).length > 0 && !lista.length && !ampliar;   // la IA dio facturas pero ninguna cae en el bloque
    return { facturas: lista, siguiente, ampliar, perdidas };
  }

  /** Aprende de las compras ya registradas en Alegra cómo distribuye Contabilidad cada suplidor. */
  function aprender(compras) {
    const g = {};
    (compras || []).filter(c => s_x(c.estado) !== 'void' && s_x(c.categoria_id)).forEach(c => {
      const k = clave(c); if (!k) return;
      const combo = s_x(c.categoria_id) + '|' + s_x(c.centro_id);
      g[k] = g[k] || { veces: 0, combos: {} }; g[k].veces++; g[k].combos[combo] = (g[k].combos[combo] || 0) + 1;
    });
    const out = {};
    Object.keys(g).forEach(k => {
      const [combo, veces] = Object.entries(g[k].combos).sort((a, b) => b[1] - a[1])[0];
      const [cat, centro] = combo.split('|');
      out[k] = { categoria_id: cat, centro_id: centro, veces: g[k].veces, igual: veces, parte: Math.round(veces / g[k].veces * 100) / 100 };
    });
    return out;
  }

  /** Cómo distribuir una factura: primero las reglas escritas, luego el historial del suplidor. */
  function criterio(f, proveedorId, aprendido, reglas) {
    const r = dig(f.rnc), texto = sinT((f.suplidor || '') + ' ' + (f.servicio || ''));
    const porRnc = (reglas || []).find(x => dig(x.rnc) && dig(x.rnc) === r && s_x(x.categoria_id));
    const porTexto = (reglas || []).find(x => !dig(x.rnc) && sinT(x.contiene) && texto.indexOf(sinT(x.contiene)) >= 0 && s_x(x.categoria_id));
    const regla = porRnc || porTexto;
    if (regla) return { fuente: 'regla', categoria_id: s_x(regla.categoria_id), centro_id: s_x(regla.centro_id), detalle: 'Regla: ' + (porRnc ? 'RNC ' + r : '«' + regla.contiene + '»') + (regla.nota ? ' · ' + regla.nota : '') };
    const h = (aprendido || {})[r] || (proveedorId ? (aprendido || {})['p' + proveedorId] : null);
    if (h) {
      const seguro = h.veces >= 2 && h.parte >= 0.6;
      return { fuente: seguro ? 'historial' : 'historial_debil', categoria_id: h.categoria_id, centro_id: h.centro_id, detalle: 'Como las ' + h.veces + ' compras anteriores de este suplidor (' + Math.round(h.parte * 100) + ' % así)' };
    }
    return null;
  }

  /** El impuesto de Alegra que corresponde a la tasa de la factura (18 % o 16 %). */
  function impuestoPara(gravado, itbis, impuestos) {
    const g = n(gravado), i = n(itbis); if (!(i > 0) || !(g > 0)) return null;
    const pct = Math.abs(i - g * 0.18) <= Math.max(1, g * 0.0025) ? 18 : Math.abs(i - g * 0.16) <= Math.max(1, g * 0.0025) ? 16 : 0;
    if (!pct) return null;
    const t = (impuestos || []).filter(x => Number(x.porcentaje) === pct && (!x.estado || /active|activo/i.test(x.estado)));
    return t.find(x => /itbis/i.test(x.nombre)) || t[0] || null;
  }

  /** Estado de una factura leída: duplicada (no se registra), lista (se puede registrar sola) o para revisar, con los motivos. */
  function estadoCola(x) {
    if (x.duplicado === 'rojo' || (x.ia && x.ia.duplicado === 'si')) return { estado: 'duplicada', motivos: [x.ia && x.ia.duplicado === 'si' ? 'La IA dice que es la misma compra ya registrada' + (x.ia.razon ? ': ' + x.ia.razon : '') : 'El mismo NCF de este suplidor ya está registrado'] };
    const m = [], f = x.factura || {};
    // rojas y las ámbar/azules que cambian el registro (montos, consumo, a nombre de otro, RNC dudoso, DGII sin confirmar)
    const RETIENEN = ['montos', 'ncf_consumo', 'nombre_torre', 'sin_nombre_torre', 'sin_rnc', 'rnc_digito', 'ncf_pendiente', 'torre_sin_rnc'];
    (x.alertas || []).filter(a => a.nivel === 'rojo' || RETIENEN.indexOf(a.codigo) >= 0).forEach(a => m.push(a.texto));
    if (x.sin_rnc_empresa) m.push('Falta el RNC de Stili Group en Ajustes: no se puede comprobar a nombre de quién está la factura');
    if (x.sin_alegra_completo) m.push('Alegra todavía no se ha leído completo: no se puede descartar que ya esté registrada');
    if (s_x(f.tipo_doc) && s_x(f.tipo_doc) !== 'factura') m.push('No es una factura (' + f.tipo_doc + '): regístrela a mano si corresponde');
    if (!x.proveedor_id) m.push('El suplidor no está en Alegra: créelo con un clic');
    if (!x.criterio) m.push('No se sabe cómo distribuirla: elija la categoría');
    else if (x.criterio.fuente !== 'regla' && x.criterio.fuente !== 'historial') m.push('Categoría por confirmar (' + (x.criterio.fuente === 'ia' ? 'la sugirió la IA' : 'poco historial') + ')');
    if (!(n(f.total) > 0)) m.push('Sin monto total');
    const fz = fecha(f.fecha_factura);
    if (!fz) m.push('Sin fecha de la factura');
    else if ((x.desde && fz < x.desde) || (x.hoy && fz > x.hoy)) m.push('La fecha ' + fz + ' está fuera del rango (' + x.desde + ' a hoy)');
    if (!s_x(f.ncf)) m.push('Sin NCF: decida si se registra como gasto sin comprobante o con Comprobante de Compras (B11)');
    if (n(f.itbis) > 0 && !x.impuesto_id) m.push('No encuentro en Alegra el impuesto de esta tasa de ITBIS');
    if (s_x(f.moneda) && !/^(dop|rd|rd\$|peso)/i.test(s_x(f.moneda))) m.push('Moneda ' + f.moneda + ': confirme la tasa');
    if (x.duplicado === 'ambar' || (x.ia && x.ia.duplicado === 'posible')) m.push('Posible duplicado: compárela con la ya registrada');
    return { estado: m.length ? 'revisar' : 'listo', motivos: m };
  }

  /** NCF en el formato de numeración de compras de Alegra (aprendido de las compras ya registradas). */
  function numeroCompra(ncf, estilo) {
    const t = String(ncf || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (!t) return null;
    if (estilo === 'prefijo') return { prefix: t.slice(0, 3), number: t.slice(3) };
    return { number: t };
  }
  /** Reconstruye el NCF desde la numeración que devuelve Alegra y dice qué estilo usa. */
  function ncfDeAlegra(nt, numeroSuelto) {
    const ok = t => /^(B\d{10}|E\d{12})$/.test(t);
    const p = String((nt && nt.prefix) || '').toUpperCase().replace(/[^A-Z0-9]/g, ''), num = String((nt && (nt.number != null ? nt.number : nt.fullNumber)) || '').replace(/\s/g, '');
    const full = String((nt && nt.fullNumber) || numeroSuelto || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (ok(full)) return { ncf: full, estilo: p ? 'prefijo' : 'completo' };
    if (p && ok(p + num.toUpperCase())) return { ncf: p + num.toUpperCase(), estilo: 'prefijo' };
    if (ok(num.toUpperCase())) return { ncf: num.toUpperCase(), estilo: 'completo' };
    return { ncf: full || (p + num).toUpperCase(), estilo: '' };
  }

  /** Cuerpo de POST /bills para una factura de suplidor. */
  function cuerpoCompra(f, p, opc) {
    const g = n(f.gravado), e = n(f.exento), i = n(f.itbis), t = n(f.total), obs = s_x(f.servicio).slice(0, 180);
    const lineas = [];
    const tax = p.impuesto_id ? [{ id: String(p.impuesto_id) }] : [];
    if (g > 0) lineas.push({ id: String(p.categoria_id), price: g, quantity: 1, tax: i > 0 ? tax : [], observations: obs });
    if (e > 0) lineas.push({ id: String(p.categoria_id), price: e, quantity: 1, tax: [], observations: (obs ? obs + ' · ' : '') + 'exento' });
    if (!lineas.length) lineas.push({ id: String(p.categoria_id), price: Math.round((t - (i > 0 && tax.length ? i : 0)) * 100) / 100, quantity: 1, tax: i > 0 ? tax : [], observations: obs });
    const fz = fecha(f.fecha_factura);
    const b = { date: fz, dueDate: fecha(p.vence) || fz, provider: String(p.proveedor_id), purchases: { categories: lineas },
      observations: ('Stili Soft · ' + (opc && opc.ref || '')).slice(0, 480) };
    const num = numeroCompra(f.ncf, opc && opc.estilo); if (num) b.numberTemplate = num;
    if (p.centro_id) b.costCenter = { id: String(p.centro_id) };
    return b;
  }

  /** Honorarios fijos del mes que todavía no tienen propuesta (una vez que existe, aprobada o descartada, no se repite). */
  function honorariosDelMes(honorarios, propuestas, periodo, hoyIso) {
    const ya = new Set((propuestas || []).map(p => s_x(p.clave)));
    const dia = Number(String(hoyIso).slice(8, 10)) || 1;
    return (honorarios || []).filter(h => /^(si|true|1)$/i.test(s_x(h.activo) || 'si') && n(h.monto) > 0 && s_x(h.cliente_id)).filter(h => dia >= (Number(h.dia) || 1))
      .map(h => ({ tipo: 'honorario', clave: 'hon|' + s_x(h.id) + '|' + periodo, periodo, fecha: hoyIso, cliente_id: s_x(h.cliente_id), item_id: s_x(h.item_id), monto: n(h.monto),
        impuesto_id: s_x(h.impuesto_id), concepto: 'Honorarios de administración ' + s_x(h.torre) + ' · ' + nombreMes(periodo), origen: 'Honorario fijo de ' + s_x(h.torre) }))
      .filter(p => !ya.has(p.clave));
  }
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  function nombreMes(periodo) { const m = String(periodo).match(/^(\d{4})-(\d{2})$/); return m ? MESES[Number(m[2]) - 1] + ' ' + m[1] : String(periodo); }

  /** Cuerpo de POST /invoices para una propuesta aprobada. */
  function cuerpoVenta(p, opc) {
    const fz = fecha(p.fecha), b = { date: fz, dueDate: masDias(fz, Number(opc.vence_dias) || 0) || fz, client: { id: String(p.cliente_id) },
      items: [{ id: String(p.item_id), price: n(p.monto), quantity: 1, description: s_x(p.concepto).slice(0, 480), tax: p.impuesto_id ? [{ id: String(p.impuesto_id) }] : [] }],
      paymentType: 'CREDIT', observations: ('Stili Soft · propuesta ' + p.id + (p.aprobado_por ? ' · aprobó ' + p.aprobado_por : '')).slice(0, 480) };
    if (opc.plantilla) b.numberTemplate = { id: String(opc.plantilla) };
    if (opc.emitir) b.stamp = { generateStamp: true }; else b.status = 'draft';
    return b;
  }
  /** Base antes de ITBIS de un depósito que ya trae el impuesto. */
  const baseDeTotal = (total, pct) => Math.round(n(total) / (1 + (Number(pct) || 0) / 100) * 100) / 100;

  /** Clase de una línea del estado de cuenta que no está en Alegra. */
  function clasificar(desc, monto) {
    const d = sinT(desc), m = n(monto);
    if (/impuesto|0 15|dgii|ley 288|retencion/.test(d) && m < 0) return 'impuesto';
    if (/comision|cargo|manejo|mantenimiento de cuenta|servicio bancario|cheque devuelto|chequera|transferencia lbtr|cargo por/.test(d) && m < 0) return 'gasto_banco';
    if (/interes/.test(d) && m > 0) return 'interes';
    return m > 0 ? 'deposito' : 'retiro';
  }
  /** Empareja el estado de cuenta con los movimientos de Alegra: mismo monto y sentido, fecha a ±dias, la referencia desempata. Uno a uno. */
  function emparejar(lineas, movs, dias) {
    const D = dias == null ? 4 : dias, usados = new Set(), out = [];
    const cand = (lineas || []).map((l, i) => ({ l, i })).sort((a, b) => String(a.l.fecha).localeCompare(String(b.l.fecha)));
    cand.forEach(({ l, i }) => {
      const ml = n(l.monto), fl = Date.parse(fecha(l.fecha));
      let mejor = null, pm = -1;
      (movs || []).forEach(m => {
        if (usados.has(String(m.id)) || Math.round(n(m.monto) * 100) !== Math.round(ml * 100)) return;
        const dd = Math.abs((Date.parse(fecha(m.fecha)) - fl) / 864e5); if (!(dd <= D)) return;
        const ref = dig(l.referencia), refM = dig(m.referencia || m.descripcion);
        const p = 10 - dd + (ref && ref.length >= 4 && refM.indexOf(ref) >= 0 ? 20 : 0);
        if (p > pm) { pm = p; mejor = m; }
      });
      if (mejor) usados.add(String(mejor.id));
      out[i] = mejor ? { pareja: String(mejor.id), pareja_desc: (fecha(mejor.fecha) + ' · ' + s_x(mejor.descripcion)).slice(0, 140), clase: 'conciliada' } : { pareja: '', pareja_desc: '', clase: clasificar(l.descripcion, l.monto) };
    });
    const sobran = (movs || []).filter(m => !usados.has(String(m.id)));
    const suma = c => Math.round((lineas || []).reduce((s, l, i) => s + (out[i].clase === c ? Math.abs(n(l.monto)) : 0), 0) * 100) / 100;
    return { lineas: out, solo_alegra: sobran, conciliadas: out.filter(x => x.pareja).length,
      gastos_banco: suma('gasto_banco'), impuestos: suma('impuesto'), intereses: suma('interes'), depositos: suma('deposito'), retiros: suma('retiro') };
  }
  /** El cliente de Alegra más parecido a la descripción de un depósito. */
  function adivinarCliente(desc, clientes) {
    const pal = sinT(desc).split(' ').filter(w => w.length > 3 && !/^(deposito|transferencia|credito|pago|banco|cuenta|recibida|desde|ach|lbtr)$/.test(w));
    let mejor = null, pm = 0;
    (clientes || []).forEach(c => { const nom = new Set(sinT(c.nombre).split(' ').filter(w => w.length > 3)); const p = pal.filter(w => nom.has(w)).length; if (p > pm) { pm = p; mejor = c; } });
    return pm >= 1 ? mejor : null;
  }
  return { n, dig, sinT, fecha, masDias, finDeMes, cortarBloque, aprender, criterio, impuestoPara, estadoCola, numeroCompra, ncfDeAlegra, cuerpoCompra,
    honorariosDelMes, nombreMes, cuerpoVenta, baseDeTotal, clasificar, emparejar, adivinarCliente };
})();

// ================================================================== utilidades
const empHoy_ = () => Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
const empSinFormula_ = v => { const t = s_(v); return /^[=+\-@]/.test(t) ? "'" + t : t; };
const empJson_ = (v, d) => { try { return JSON.parse(s_(v) || ''); } catch (e) { return d; } };
function empFilas_(hoja) { if (typeof olvidar_ === 'function') olvidar_(hoja); return typeof leerSiExiste_ === 'function' ? (leerSiExiste_(hoja) || []) : leer_(hoja).filas; }
function empCfg_() {
  const c = config_(), o = {};
  Object.keys(EMP_CONFIG).forEach(k => { o[k] = s_(c[k]) !== '' ? s_(c[k]) : EMP_CONFIG[k][0]; });
  return o;
}
function empFijarConfig_(clave, valor) {
  const f = leer_('Config').filas.find(r => s_(r.clave) === clave);
  if (f) actualizar_('Config', f._fila, { valor: valor }); else agregar_('Config', { clave: clave, valor: valor, descripcion: (EMP_CONFIG[clave] || [])[1] || '' });
  if (typeof olvidar_ === 'function') olvidar_('Config');
}
/** Reemplaza todo el contenido de una hoja (catálogos y compras de Alegra: cientos de filas de una vez). */
function empEscribirTodo_(hoja, filas) {
  const sh = libro_().getSheetByName(hoja); if (!sh) throw new Error('Falta la hoja ' + hoja + ': ejecute instalarEmpresa().');
  const cab = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, cab.length).clearContent();
  if (filas.length) sh.getRange(2, 1, filas.length, cab.length).setValues(filas.map(f => cab.map(c => f[c] == null ? '' : (typeof f[c] === 'number' ? f[c] : empSinFormula_(f[c]).slice(0, 9000)))));
  if (typeof olvidar_ === 'function') olvidar_(hoja);
}
function empPuede_(admin, nivel) { return !!(admin.gerente || ((admin.permisos || {}).emp_contabilidad || 0) >= nivel); }
function empExigir_(admin, nivel) { if (!empPuede_(admin, nivel)) throw error_('Necesita el nivel «' + (nivel >= 3 ? 'Editar' : 'Ver') + '» de Stili Group · Empresa.', 'SIN_PERMISO'); }

// ================================================================== cliente de Alegra
function alegraConectado_() { const p = PropertiesService.getScriptProperties(); return !!(s_(p.getProperty('ALEGRA_USUARIO')) && s_(p.getProperty('ALEGRA_TOKEN'))); }
function alegraAuth_() {
  const p = PropertiesService.getScriptProperties(), u = s_(p.getProperty('ALEGRA_USUARIO')), t = s_(p.getProperty('ALEGRA_TOKEN'));
  if (!u || !t) throw error_('Falta conectar Alegra: en Configuración escriba el correo y el token de Alegra (Configuración › API - Integraciones con otros sistemas).', 'SIN_ALEGRA');
  return 'Basic ' + Utilities.base64Encode(u + ':' + t);
}
/** Una consulta a Alegra. Respeta el límite (429: espera lo que indica Alegra) y reintenta los errores pasajeros. */
function alegra_(metodo, ruta, cuerpo, op) {
  const auth = alegraAuth_(); op = op || {};
  for (let intento = 0; intento < 4; intento++) {
    const o = { method: metodo, muteHttpExceptions: true, headers: { Authorization: auth, Accept: 'application/json' } };
    if (op.archivo) o.payload = { file: op.archivo };
    else if (cuerpo !== undefined && cuerpo !== null) { o.contentType = 'application/json'; o.payload = JSON.stringify(cuerpo); }
    const lectura = String(metodo).toLowerCase() === 'get';
    let r;
    try { r = UrlFetchApp.fetch(ALEGRA_BASE + ruta, o); }
    catch (e) {   // sin respuesta (red o tiempo): una escritura puede haber llegado a Alegra
      if (lectura && intento < 2) { Utilities.sleep(2000 * (intento + 1)); continue; }
      const x = error_('Sin respuesta de Alegra: ' + s_(e.message).slice(0, 160), 'ALEGRA_RED'); x.incierto = !lectura; throw x;
    }
    const c = r.getResponseCode();
    if (c === 429) { const h = r.getAllHeaders() || {}; const seg = Math.min(60, Math.max(2, Number(h['X-Rate-Limit-Reset'] || h['x-rate-limit-reset']) || 15)); Utilities.sleep(seg * 1000); continue; }
    if (c >= 500 && lectura && intento < 2) { Utilities.sleep(2000 * (intento + 1)); continue; }   // las escrituras nunca se reintentan solas
    const txt = r.getContentText(); let j = null; try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = null; }
    if (c === 401) throw error_('Alegra no aceptó el correo o el token. Vuelva a conectarlo en Configuración.', 'ALEGRA_401');
    if (c >= 400) { const e = error_('Alegra respondió ' + c + ': ' + s_((j && (j.message || (j.error && j.error.message))) || txt).slice(0, 300), 'ALEGRA_' + c); e.http = c; e.incierto = !lectura && c >= 500; throw e; }
    return j;
  }
  throw error_('Alegra está limitando las consultas. Se sigue en la próxima vuelta.', 'ALEGRA_429');   // 429 = no se procesó: seguro
}
/** true solo si es seguro que Alegra rechazó la escritura (4xx); ante la duda (sin respuesta o 5xx) hay que verificar en Alegra. */
const alegraRechazo_ = e => !e.incierto && (!!e.http && e.http < 500 || e.codigo === 'ALEGRA_429' || e.codigo === 'SIN_ALEGRA');
function empConLock_(fn) {
  const lock = LockService.getScriptLock(); if (!lock.tryLock(25000)) throw error_('Otra operación está en curso. Intente en un momento.');
  try { return fn(); } finally { try { SpreadsheetApp.flush(); } catch (e) { /* sin hoja abierta */ } lock.releaseLock(); }
}
function alegraPagina_(ruta, params, start) {
  const q = Object.assign({ start: start || 0, limit: 30 }, params || {});
  const r = alegra_('get', ruta + '?' + Object.keys(q).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(q[k])).join('&'));
  return Array.isArray(r) ? r : (r && Array.isArray(r.data) ? r.data : []);
}
function alegraTodos_(ruta, params, hasta) {
  let out = [], start = 0;
  for (;;) { const a = alegraPagina_(ruta, params, start); out = out.concat(a); if (a.length < 30 || (hasta && Date.now() > hasta)) break; start += 30; }
  return out;
}

// ================================================================== sincronización de solo lectura (catálogos y compras de Alegra)
const EMP_ID = v => v == null ? '' : (typeof v === 'object' ? s_(v.id) : s_(v));
function empSincronizar() { return empSincronizar_({ completo: false }); }
/** Trae catálogos y compras de Alegra. Las compras se traen por partes (se retoma donde quedó). */
function empSincronizar_(op) {
  const bandera = PropertiesService.getScriptProperties(), corre = Number(bandera.getProperty('EMP_SYNC_CORRIENDO') || 0);
  if (corre && Date.now() - corre < 7 * 60 * 1000) return { ocupado: true };
  bandera.setProperty('EMP_SYNC_CORRIENDO', String(Date.now()));
  try { return empSincronizarUna_(op || {}); } finally { bandera.deleteProperty('EMP_SYNC_CORRIENDO'); }
}
function empSincronizarUna_(op) {
  const hasta = Date.now() + EMP_TIEMPO_MS, props = PropertiesService.getScriptProperties(), ahora = new Date().toISOString(), cat = [];
  const add = (tipo, id, nombre, rnc, extra) => cat.push({ tipo, id: s_(id), nombre: s_(nombre), rnc: s_(rnc).replace(/\D/g, ''), extra: extra ? JSON.stringify(extra) : '', actualizado_en: ahora });
  alegraTodos_(ALEGRA_RUTAS.contactos, {}, hasta).forEach(c => {
    const tipos = [].concat(c.type || []).map(String);
    add('contacto', c.id, c.name, (c.identificationObject && c.identificationObject.number) || c.identification, { tipos, correo: c.email ? 1 : 0 });
  });
  const plano = (lista, pref) => (lista || []).forEach(x => { add('categoria', x.id, (pref ? pref + ' › ' : '') + s_(x.name), '', { tipo: s_(x.type), uso: s_(x.use), estado: s_(x.status) }); if (x.children) plano(x.children, (pref ? pref + ' › ' : '') + s_(x.name)); });
  plano(alegraTodos_(ALEGRA_RUTAS.categorias, { format: 'tree' }, hasta), '');
  try { alegraTodos_(ALEGRA_RUTAS.centros, {}, hasta).forEach(x => add('centro', x.id, x.name, '', { codigo: s_(x.code), estado: s_(x.status) })); } catch (e) { console.error('Alegra centros: ' + e.message); }
  alegraTodos_(ALEGRA_RUTAS.impuestos, {}, hasta).forEach(x => add('impuesto', x.id, x.name, '', { porcentaje: Number(x.percentage) || 0, tipo: s_(x.type), estado: s_(x.status) }));
  try { alegraTodos_(ALEGRA_RUTAS.bancos, {}, hasta).forEach(x => add('banco', x.id, x.name, '', { tipo: s_(x.type), numero: s_(x.number).slice(-4) })); } catch (e) { console.error('Alegra bancos: ' + e.message); }
  try { alegraTodos_(ALEGRA_RUTAS.numeraciones, {}, hasta).forEach(x => add('numeracion', x.id, x.name, '', { documento: s_(x.documentType), prefijo: s_(x.prefix), preferida: !!x.isDefault, estado: s_(x.status), electronica: !!x.isElectronic })); } catch (e) { console.error('Alegra numeraciones: ' + e.message); }
  try { alegraTodos_(ALEGRA_RUTAS.items, {}, hasta).forEach(x => add('item', x.id, x.name, '', { precio: Number(x.price && x.price[0] && x.price[0].price) || 0, tipo: s_(x.type) })); } catch (e) { console.error('Alegra ítems: ' + e.message); }
  empEscribirTodo_('Emp_Catalogo', cat);

  // compras: por partes, en orden, retomando donde quedó; cada 30 días se repasan todas (por si Contabilidad corrigió categorías)
  const completa = props.getProperty('EMP_SYNC_COMPLETA'), repaso = op.completo || !completa || (Date.now() - Date.parse(completa)) > 30 * 864e5;
  let start = repaso ? (op.completo ? 0 : Number(props.getProperty('EMP_SYNC_START') || 0)) : (t => Math.max(0, t - (t % 30 || 30)))(Number(props.getProperty('EMP_SYNC_TOTAL') || 0));   // ya completa: desde la última página
  const previas = {}; empFilas_('Emp_Compras').forEach(r => { previas[s_(r.alegra_id)] = r; });
  const estilos = { prefijo: 0, completo: 0 };
  let leidas = 0, terminado = false;
  while (Date.now() < hasta) {
    const a = alegraPagina_(ALEGRA_RUTAS.compras, { order_direction: 'ASC', order_field: 'id' }, start);
    a.forEach(b => {
      const c = (b.purchases && b.purchases.categories && b.purchases.categories[0]) || {}, nt = Emp.ncfDeAlegra(b.numberTemplate, b.number);
      if (nt.estilo) estilos[nt.estilo]++;
      previas[s_(b.id)] = { alegra_id: s_(b.id), fecha: s_(b.date), proveedor_id: EMP_ID(b.provider), proveedor: s_(b.provider && b.provider.name),
        rnc: s_(b.provider && (b.provider.identification || (b.provider.identificationObject && b.provider.identificationObject.number))).replace(/\D/g, ''), ncf: nt.ncf,
        total: Number(b.total) || 0, categoria_id: EMP_ID(c), centro_id: EMP_ID(b.costCenter), impuesto_id: EMP_ID((c.tax || [])[0]), estado: s_(b.status), origen: 'alegra', actualizado_en: ahora };
    });
    leidas += a.length; start += a.length;
    if (a.length < 30) { terminado = true; break; }
  }
  const compras = Object.keys(previas).map(k => previas[k]).sort((x, y) => s_(x.fecha).localeCompare(s_(y.fecha)));
  empEscribirTodo_('Emp_Compras', compras);
  if (estilos.prefijo + estilos.completo > 0) props.setProperty('EMP_ESTILO_NCF', estilos.prefijo > estilos.completo ? 'prefijo' : 'completo');
  if (terminado) { props.setProperty('EMP_SYNC_COMPLETA', ahora); props.setProperty('EMP_SYNC_TOTAL', String(start)); props.setProperty('EMP_SYNC_START', '0'); }
  else props.setProperty('EMP_SYNC_START', String(start));
  props.setProperty('EMP_SYNC_ULTIMA', ahora);
  return { catalogo: cat.length, compras: compras.length, leidas, terminado };
}
function empCatalogo_() {
  const c = { contacto: [], categoria: [], centro: [], impuesto: [], banco: [], numeracion: [], item: [] };
  empFilas_('Emp_Catalogo').forEach(r => { const t = s_(r.tipo); if (c[t]) c[t].push(Object.assign({ id: s_(r.id), nombre: s_(r.nombre), rnc: s_(r.rnc) }, empJson_(r.extra, {}))); });
  return c;
}

// ================================================================== pdf-lib (separar las páginas de un PDF con muchas facturas)
let PDFLIB_ = null;
function pdfLib_() {
  if (PDFLIB_) return PDFLIB_;
  const props = PropertiesService.getScriptProperties(), huella = t => Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, t, Utilities.Charset.UTF_8).map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
  let code = '';
  const id = props.getProperty('EMP_PDFLIB_ID');
  if (id) try { code = DriveApp.getFileById(id).getBlob().getDataAsString('UTF-8'); } catch (e) { code = ''; }
  if (!code || huella(code) !== PDFLIB_SHA256) {
    const r = UrlFetchApp.fetch(PDFLIB_URL, { muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) throw new Error('No se pudo descargar la librería de PDF (' + r.getResponseCode() + ').');
    code = r.getContentText('UTF-8');
    if (huella(code) !== PDFLIB_SHA256) throw new Error('La librería de PDF descargada no es la esperada (huella distinta): no se usa.');
    const f = empSubcarpeta_('Sistema').createFile('pdf-lib-1.17.1.min.js', code, 'text/plain'); props.setProperty('EMP_PDFLIB_ID', f.getId());
  }
  const holder = {};
  // eslint-disable-next-line no-new-func
  new Function('exports', 'module', 'define', 'var setTimeout = function (f) { f(); return 0; }; var clearTimeout = function () {}; var setImmediate = function (f) { f(); };\n' + code + '\n').call(holder);
  if (!holder.PDFLib || !holder.PDFLib.PDFDocument) throw new Error('No se pudo cargar la librería de PDF.');
  PDFLIB_ = holder.PDFLib; return PDFLIB_;
}
const empU8_ = bytes => new Uint8Array(bytes);                                  // los bytes de Apps Script vienen con signo: Uint8Array los corrige
const empBytes_ = u8 => Array.prototype.map.call(u8, b => b > 127 ? b - 256 : b);
async function pdfAbrir_(bytes) { return pdfLib_().PDFDocument.load(empU8_(bytes), { ignoreEncryption: true }); }
/** Un PDF nuevo con las páginas pedidas (numeradas desde 1). */
async function pdfExtraer_(doc, paginas) {
  const L = pdfLib_(), out = await L.PDFDocument.create();
  const cp = await out.copyPages(doc, paginas.map(p => p - 1)); cp.forEach(p => out.addPage(p));
  return empBytes_(await out.save());
}

// ================================================================== carpetas
function empRaiz_(crear) {
  const id = s_(PropertiesService.getScriptProperties().getProperty('EMP_CARPETA_ID'));
  if (id) { const f = DriveApp.getFolderById(id); if (f.isTrashed && f.isTrashed()) throw new Error('La carpeta «Facturas Stili Group (empresa)» está en la papelera de Drive. Restáurela.'); return f; }
  if (crear === false) return null;
  const it = DriveApp.getFoldersByName('Facturas Stili Group (empresa)');
  const raiz = it.hasNext() ? it.next() : DriveApp.createFolder('Facturas Stili Group (empresa)');
  PropertiesService.getScriptProperties().setProperty('EMP_CARPETA_ID', raiz.getId());
  return raiz;
}
function empSubcarpeta_(...nombres) { let c = empRaiz_(); nombres.forEach(nm => { const it = c.getFoldersByName(nm); c = it.hasNext() ? it.next() : c.createFolder(nm); }); return c; }
function empHash_(bytes) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes).map(b => ('0' + (b & 255).toString(16)).slice(-2)).join(''); }

// ================================================================== entrada: carpeta «Entrada», la pantalla y (opcional) Gmail
function empTipoArchivo_(mime, nombre) {
  if (/pdf/.test(mime) || /\.pdf$/i.test(nombre)) return 'pdf';
  if (/^image\/(jpeg|png|webp)$/.test(mime)) return 'imagen';
  return '';
}
/** Crea un lote por cada archivo nuevo de la carpeta «Entrada». Si el mismo archivo ya entró, no se repite. */
function empRecibirEntrada_(hasta) {
  const entrada = empSubcarpeta_('Entrada'), fs = entrada.getFiles(), lotes = empFilas_('Emp_Lotes'), hashes = {};
  lotes.filter(l => ['problema', 'duplicado', 'reemplazado'].indexOf(s_(l.estado)) < 0).forEach(l => { if (s_(l.hash)) hashes[s_(l.hash)] = l; });
  const nuevos = [];
  while (fs.hasNext() && Date.now() < hasta) {
    const f = fs.next();
    if (f.isTrashed && f.isTrashed()) continue;
    if (f.getLastUpdated && Date.now() - f.getLastUpdated().getTime() < 60 * 1000) continue;   // se está copiando todavía
    if (lotes.some(l => s_(l.drive_id) === f.getId())) continue;
    const tipo = empTipoArchivo_(f.getMimeType(), f.getName()), bytes = f.getBlob().getBytes(), hash = empHash_(bytes);
    const base = { id: idNuevo_('LOT'), fecha: new Date().toISOString(), origen: 'carpeta', archivo: f.getName(), drive_id: f.getId(), hash, tipo, paginas: '', siguiente: 1, facturas: 0, actualizado_en: new Date().toISOString() };
    if (!tipo) { agregar_('Emp_Lotes', Object.assign(base, { estado: 'problema', detalle: 'Formato ' + f.getMimeType() + ': use PDF, JPG o PNG.' })); empArchivarOriginal_(f, 'No leídos'); continue; }
    if (hashes[hash]) { agregar_('Emp_Lotes', Object.assign(base, { estado: 'duplicado', detalle: 'Este mismo archivo ya entró el ' + s_(hashes[hash].fecha).slice(0, 10) + ' (' + s_(hashes[hash].archivo) + '). No se leyó de nuevo.' })); empArchivarOriginal_(f, 'Repetidos'); continue; }
    agregar_('Emp_Lotes', Object.assign(base, { estado: 'pendiente', detalle: '' })); hashes[hash] = base; nuevos.push(base.id);
  }
  return nuevos;
}
function empArchivarOriginal_(file, sub) { try { file.moveTo(empSubcarpeta_('Originales', sub || Utilities.formatDate(new Date(), TZ, 'yyyy-MM'))); } catch (e) { console.error('Empresa: no se pudo mover ' + file.getName() + ': ' + e.message); } }
/** Lee los adjuntos de los correos con la etiqueta configurada (opcional). Cada mensaje se lee una vez (aunque el hilo reciba respuestas nuevas). */
function empRecibirGmail_(hasta) {
  const et = s_(empCfg_().EMP_GMAIL_ETIQUETA); if (!et) return 0;
  const props = PropertiesService.getScriptProperties(), vistos = empJson_(props.getProperty('EMP_GMAIL_VISTOS'), []), set = new Set(vistos);
  const leida = GmailApp.getUserLabelByName(et + '-leida') || GmailApp.createLabel(et + '-leida');
  const hilos = GmailApp.search('label:' + et.replace(/\s/g, '-') + ' has:attachment newer_than:60d', 0, 30);
  let n = 0; const entrada = empSubcarpeta_('Entrada');
  for (const h of hilos) {
    if (hasta && Date.now() > hasta) break;
    h.getMessages().forEach(m => {
      if (set.has(m.getId())) return;
      m.getAttachments().forEach(a => { if (empTipoArchivo_(a.getContentType(), a.getName())) { entrada.createFile(a.copyBlob().setName(a.getName())); n++; } });
      set.add(m.getId()); vistos.push(m.getId());
    });
    h.addLabel(leida);
  }
  props.setProperty('EMP_GMAIL_VISTOS', JSON.stringify(vistos.slice(-800)));
  return n;
}

// ================================================================== lectura con IA
const EMP_FORMATO = [
  'Este archivo contiene las páginas P1 a P2 de un documento escaneado que puede traer varias facturas de suplidores, una detrás de otra.',
  'El comprador es Stili Group (empresa de administración de condominios, República Dominicana). Identifique cada factura y en qué páginas está,',
  'con numeración absoluta (la primera página de este archivo es la P1). Una factura puede ocupar varias páginas. Ignore páginas que no sean comprobantes',
  '(sobres, separadores, hojas en blanco, copias de cheques). Responda SOLO con un bloque ```json:',
  '{"facturas":[{"paginas":[P1],"continua":false,"tipo_doc":"factura|nota_credito|recibo|otro","suplidor":"razón social del emisor o vacío si no aparece",',
  '"rnc":"RNC o cédula del emisor","ncf":"NCF o e-NCF","fecha_factura":"AAAA-MM-DD","vence_ncf":"AAAA-MM-DD si aparece","comprador_nombre":"a nombre de quién",',
  '"comprador_rnc":"RNC del comprador","codigo_seguridad":"","moneda":"DOP|USD","gravado":0,"exento":0,"itbis":0,"total":0,"servicio":"qué se factura, corto"}],"otras_paginas":[]}',
  '«continua» = true solo si la ÚLTIMA factura sigue en la página siguiente a este archivo. Montos sin símbolos ni comas. No invente: si un dato no aparece, déjelo vacío o en 0.',
].join(' ');
function empBloqueIa_(bytes, mime) {
  return mime === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: Utilities.base64Encode(bytes) } }
    : { type: 'image', source: { type: 'base64', media_type: mime, data: Utilities.base64Encode(bytes) } };
}
function empLeerBloque_(bytes, mime, ini, fin) {
  const txt = EMP_FORMATO.replace(/P1/g, String(ini)).replace(/P2/g, String(fin));
  const r = claude_('Usted es un auditor fiscal dominicano. Lee comprobantes con exactitud y separa cada factura.', [empBloqueIa_(bytes, mime), { type: 'text', text: txt }], 6000);
  const d = partirRespuesta_(r.texto).datos || {};
  if (!Array.isArray(d.facturas)) throw new Error('La IA no devolvió la lista de facturas.');
  return d.facturas;
}
function empFicha_() { const c = empCfg_(); return { nombre: 'Stili Group', razon_social: c.EMP_RAZON || 'Stili Group', rnc: s_(c.EMP_RNC).replace(/\D/g, '') }; }
const empTextoEmpresa_ = t => String(t).replace(/del condominio/g, 'de Stili Group').replace(/el condominio/g, 'Stili Group').replace(/al condominio/g, 'a Stili Group');

/** Valida una factura leída y la deja en la cola (lista, para revisar o duplicada). */
function empEvaluar_(f, contexto) {
  const ficha = empFicha_(), N = Fiscal.ncf(f.ncf), dg = {};
  if (N.valido && s_(f.rnc)) dg.ncf = dgiiNcf_(f.rnc, N.texto, f.comprador_rnc || ficha.rnc, f.codigo_seguridad);
  if (s_(f.rnc)) dg.rnc = dgiiRnc_(f.rnc);
  if (!s_(f.suplidor) && dg.rnc && dg.rnc.nombre) { f.suplidor = dg.rnc.nombre; f.suplidor_dgii = true; }
  const alertas = Fiscal.alertas(f, ficha, dg).map(a => Object.assign(a, { texto: empTextoEmpresa_(a.texto) }));
  if (f.suplidor_dgii) alertas.unshift({ tipo: 'fiscal', nivel: 'azul', texto: 'El nombre del suplidor no venía en la factura: se tomó de la DGII por el RNC.', codigo: 'nombre_dgii' });
  // duplicados contra Alegra (todo 2024-2026) y contra lo que ya está en la cola
  const otras = contexto.compras.map(c => ({ id: 'AL-' + c.alegra_id, torre: 'Alegra', estado: c.estado === 'void' ? 'anulada' : '', ncf: c.ncf, rnc: c.rnc, suplidor: c.proveedor, monto: c.total, factura_fecha: c.fecha, concepto: 'Compra ' + c.alegra_id + ' en Alegra' }))
    .concat(contexto.cola.filter(q => ['duplicada', 'descartada'].indexOf(s_(q.estado)) < 0 && s_(q.id) !== s_(contexto.id)).map(q => ({ id: s_(q.id), torre: 'Cola', ncf: s_(q.ncf), rnc: s_(q.rnc), suplidor: s_(q.suplidor), monto: Number(q.total) || 0, factura_fecha: s_(q.fecha_factura), concepto: 'En la cola (' + s_(q.estado) + ')' })));
  const cand = Fiscal.candidatos(f, otras), dupNivel = cand.length ? cand[0].nivel : '';
  const ia = dupNivel && dupNivel !== 'rojo' ? buzonIaDuplicado_(f, cand) : null;
  // proveedor y distribución
  const prov = contexto.catalogo.contacto.find(c => s_(f.rnc) && c.rnc && c.rnc === s_(f.rnc).replace(/\D/g, '') && (!c.tipos || !c.tipos.length || c.tipos.indexOf('provider') >= 0))
    || contexto.catalogo.contacto.find(c => s_(f.suplidor) && Emp.sinT(c.nombre) === Emp.sinT(f.suplidor));
  let crit = Emp.criterio(f, prov && prov.id, contexto.aprendido, contexto.reglas);
  if (!crit && contexto.sugerir) crit = empSugerirCategoria_(f, contexto.catalogo);
  const imp = Emp.impuestoPara(f.gravado || (Emp.n(f.total) - Emp.n(f.itbis) - Emp.n(f.exento)), f.itbis, contexto.catalogo.impuesto);
  const est = Emp.estadoCola({ factura: f, alertas, duplicado: dupNivel, ia, proveedor_id: prov && prov.id, criterio: crit, impuesto_id: imp && imp.id, desde: contexto.desde, hoy: contexto.hoy,
    sin_rnc_empresa: !ficha.rnc, sin_alegra_completo: !contexto.alegra_completo });
  const propuesta = { proveedor_id: prov ? prov.id : '', proveedor: prov ? prov.nombre : '', categoria_id: crit ? crit.categoria_id : '', centro_id: crit ? crit.centro_id : '',
    impuesto_id: imp ? imp.id : '', criterio: crit ? crit.detalle : '', fuente: crit ? crit.fuente : '' };
  const duplicado = cand.length ? { nivel: dupNivel, con: cand.slice(0, 3), ia } : null;
  return { estado: est.estado, motivos: est.motivos, alertas, propuesta, duplicado };
}
/** Sin historial ni regla: la IA sugiere una categoría de gasto de Alegra (siempre queda para confirmar). */
function empSugerirCategoria_(f, catalogo) {
  const cats = catalogo.categoria.filter(c => !c.estado || /active|activo/i.test(c.estado)).filter(c => !c.tipo || /expense|cost|gasto|costo/i.test(c.tipo)).slice(0, 400);
  if (!cats.length) return null;
  try {
    const r = claude_('Usted es contador de una empresa dominicana de administración de condominios.', [{ type: 'text', text:
      'Factura: ' + JSON.stringify({ suplidor: f.suplidor, servicio: f.servicio, total: f.total }) + '\nCategorías de gasto disponibles (id: nombre):\n' + cats.map(c => c.id + ': ' + c.nombre).join('\n') +
      '\n¿En qué categoría se registra? Responda SOLO ```json {"id":"","razon":"una frase"}```' }], 300);
    const d = partirRespuesta_(r.texto).datos || {};
    const c = cats.find(x => x.id === s_(d.id));
    return c ? { fuente: 'ia', categoria_id: c.id, centro_id: '', detalle: 'Sugerida por la IA: ' + s_(d.razon).slice(0, 160) } : null;
  } catch (e) { return null; }
}
function empContexto_() {
  const compras = empFilas_('Emp_Compras').map(r => ({ alegra_id: s_(r.alegra_id), fecha: s_(r.fecha), proveedor_id: s_(r.proveedor_id), proveedor: s_(r.proveedor), rnc: s_(r.rnc), ncf: s_(r.ncf),
    total: Number(r.total) || 0, categoria_id: s_(r.categoria_id), centro_id: s_(r.centro_id), estado: s_(r.estado) }));
  const cfg = empCfg_();
  return { compras, cola: empFilas_('Emp_Cola'), catalogo: empCatalogo_(), aprendido: Emp.aprender(compras), reglas: empFilas_('Emp_Reglas'), desde: Emp.fecha(cfg.EMP_DESDE) || '2024-01-01', hoy: empHoy_(), sugerir: true, cfg,
    alegra_completo: !!PropertiesService.getScriptProperties().getProperty('EMP_SYNC_COMPLETA') };
}

// ================================================================== proceso automático (activador cada 10 minutos)
// Un lote = un archivo (puede traer 30 facturas). Se lee por bloques de 8 páginas y se anota hasta dónde se llegó:
// si Google corta la ejecución, la próxima vuelta sigue desde ahí y no repite facturas (la cola se identifica por lote + páginas).
async function empProcesar() { return empProcesar_({ origen: 'automático' }); }
async function empProcesar_(op) {
  // una sola vuelta a la vez (el activador de 10 minutos y el de «Procesar ahora» pueden coincidir)
  const candado = LockService.getUserLock(); if (!candado.tryLock(0)) return { ocupado: true };
  const props = PropertiesService.getScriptProperties();
  const hasta = Date.now() + EMP_TIEMPO_MS, hecho = { lotes: 0, facturas: 0, registradas: 0, extractos: 0, propuestas: 0, errores: [] };
  try {
    try { empRecibirGmail_(hasta); } catch (e) { hecho.errores.push('Gmail: ' + e.message); }
    empRecibirEntrada_(hasta);
    try { hecho.propuestas = empProponerHonorarios_(); } catch (e) { hecho.errores.push('Honorarios: ' + e.message); }
    const lotes = empFilas_('Emp_Lotes').filter(x => ['pendiente', 'leyendo'].indexOf(s_(x.estado)) >= 0);
    const extractos = empFilas_('Emp_Conciliaciones').filter(x => s_(x.estado) === 'leyendo');
    const auto = empCfg_().EMP_AUTO === 'si' && alegraConectado_();
    const listas = auto ? empFilas_('Emp_Cola').filter(x => s_(x.estado) === 'listo') : [];
    if (!lotes.length && !extractos.length && !listas.length) return hecho;   // nada que hacer: la vuelta termina enseguida (cuida la cuota diaria)
    let ctx = null;
    for (const l of lotes) {
      if (Date.now() + 100000 > hasta) break;
      try { ctx = ctx || empContexto_(); hecho.facturas += await empProcesarLote_(l, ctx, hasta); hecho.lotes++; }
      catch (e) { const n = Number(l.intentos || 0) + 1; hecho.errores.push(s_(l.archivo) + ': ' + e.message); empActualizar_('Emp_Lotes', l.id, { intentos: n, estado: n >= 3 ? 'problema' : 'leyendo', detalle: (n >= 3 ? 'No se pudo leer después de 3 intentos (use «Reintentar»): ' : 'Se reintenta: ') + s_(e.message).slice(0, 300) }); }
    }
    for (const c of extractos) {
      if (Date.now() + 100000 > hasta) break;
      try { if (await empLeerExtracto_(c, hasta)) hecho.extractos++; }
      catch (e) { const n = Number(empJson_(c.detalle, {}).intentos || 0) + 1; hecho.errores.push('Extracto ' + s_(c.mes) + ': ' + e.message);
        empActualizar_('Emp_Conciliaciones', c.id, { estado: n >= 3 ? 'problema' : 'leyendo', detalle: JSON.stringify(Object.assign(empJson_(c.detalle, {}), { intentos: n, error: s_(e.message).slice(0, 300) })) }); }
    }
    for (const q of auto ? empFilas_('Emp_Cola').filter(x => s_(x.estado) === 'listo') : []) {
      if (Date.now() + 20000 > hasta) break;
      try { empRegistrar_(q.id, { nombre: 'Automático', gerente: true }); hecho.registradas++; } catch (e) { hecho.errores.push(s_(q.id) + ': ' + e.message); }
    }
  } finally { props.setProperty('EMP_ULTIMA', new Date().toISOString()); candado.releaseLock(); }
  if (hecho.errores.length) console.error('Empresa: ' + hecho.errores.join(' | '));
  return hecho;
}
function empActualizar_(hoja, id, cambios) {
  const campoId = hoja === 'Emp_Compras' ? 'alegra_id' : 'id';
  const r = empFilas_(hoja).find(x => s_(x[campoId]) === s_(id)); if (!r) return null;
  const c = {}; Object.keys(cambios).forEach(k => { c[k] = typeof cambios[k] === 'number' ? cambios[k] : empSinFormula_(cambios[k]); });
  if (EMP_TABLAS[hoja].indexOf('actualizado_en') >= 0) c.actualizado_en = new Date().toISOString();
  actualizar_(hoja, r._fila, c); if (typeof olvidar_ === 'function') olvidar_(hoja);
  return Object.assign(r, c);
}
async function empProcesarLote_(l, ctx, hasta) {
  const file = DriveApp.getFileById(s_(l.drive_id)), bytes = file.getBlob().getBytes();
  const mime = l.tipo === 'pdf' ? 'application/pdf' : file.getMimeType();
  let doc = null, total = 1;
  if (l.tipo === 'pdf') { doc = await pdfAbrir_(bytes); total = doc.getPageCount(); }
  let sig = Math.max(1, Number(l.siguiente) || 1), nuevas = 0;
  empActualizar_('Emp_Lotes', l.id, { estado: 'leyendo', paginas: total });
  while (sig <= total && Date.now() + 100000 < hasta) {   // un bloque empieza solo si queda tiempo para terminarlo
    const ini = sig;
    let fin = Math.min(total, ini + EMP_BLOQUE - 1), corte, leidas;
    for (;;) {
      const parte = doc ? (ini === 1 && fin === total ? bytes : await pdfExtraer_(doc, range_(ini, fin))) : bytes;
      leidas = empLeerBloque_(parte, mime, ini, fin);
      corte = doc ? Emp.cortarBloque(leidas, ini, fin, total) : { facturas: leidas.map(f => Object.assign({}, f, { paginas: [1] })), siguiente: 2 };
      if (!corte.ampliar || fin - ini + 1 >= 3 * EMP_BLOQUE) break;
      fin = Math.min(total, ini + 2 * (fin - ini + 1) - 1);   // una factura más larga que el bloque: se lee un bloque más grande
    }
    if (corte.perdidas) throw new Error('La IA leyó facturas en las páginas ' + ini + ' a ' + fin + ' pero no supo ubicarlas: se vuelve a leer.');
    for (const f of corte.facturas) { if (await empEncolar_(l, f, doc, bytes, mime, file, ctx)) nuevas++; }
    sig = corte.siguiente;
    empActualizar_('Emp_Lotes', l.id, { siguiente: sig, facturas: empFilas_('Emp_Cola').filter(q => s_(q.lote_id) === s_(l.id)).length });
  }
  if (sig > total) { empActualizar_('Emp_Lotes', l.id, { estado: 'leido', detalle: '' }); empArchivarOriginal_(file); }
  return nuevas;
}
function range_(a, b) { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; }
/** Guarda el PDF de una factura (solo sus páginas), la valida y la pone en la cola. No repite si ya está (lote + páginas). */
async function empEncolar_(l, f, doc, bytes, mime, file, ctx) {
  f.fecha_factura = Emp.fecha(f.fecha_factura) || s_(f.fecha_factura); f.rnc = s_(f.rnc).replace(/\D/g, ''); f.ncf = s_(f.ncf).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const pags = f.paginas.join(','), clave = pags + '|' + (f.ncf || (f.rnc + ':' + Emp.n(f.total)));   // dos facturas pueden compartir página (recibos pequeños)
  if (empFilas_('Emp_Cola').some(q => s_(q.lote_id) === s_(l.id) && (s_(q.clave) === clave || (f.ncf && s_(q.ncf) === f.ncf && s_(q.rnc) === f.rnc)))) return false;   // también si una relectura cambió las páginas
  const id = idNuevo_('EMF');
  const mes = (f.fecha_factura || empHoy_()).slice(0, 7);
  const nombre = [f.fecha_factura || 'sin-fecha', s_(f.suplidor || 'Sin suplidor').slice(0, 40), f.ncf || 'sin-NCF'].join(' ').replace(/[\\/:*?"<>|]/g, '-');
  let guardado;
  const destino = empSubcarpeta_('Procesadas', mes);
  if (doc) guardado = destino.createFile(Utilities.newBlob(await pdfExtraer_(doc, f.paginas), 'application/pdf', nombre + '.pdf'));
  else guardado = destino.createFile(Utilities.newBlob(bytes, mime, nombre + '.' + (mime.split('/')[1] || 'jpg')));
  ctx.id = id;
  const ev = empEvaluar_(f, ctx);
  const fila = { id, lote_id: l.id, paginas: pags, clave, archivo_id: guardado.getId(), url: guardado.getUrl(), estado: ev.estado, suplidor: s_(f.suplidor), rnc: f.rnc, ncf: f.ncf,
    fecha_factura: f.fecha_factura, total: Emp.n(f.total), itbis: Emp.n(f.itbis), datos: JSON.stringify(f), propuesta: JSON.stringify(ev.propuesta), alertas: JSON.stringify(ev.alertas),
    motivos: JSON.stringify(ev.motivos), duplicado: ev.duplicado ? JSON.stringify(ev.duplicado) : '', alegra_id: '', revisado_por: '', error: '', creado_en: new Date().toISOString(), actualizado_en: new Date().toISOString() };
  const limpio = {}; Object.keys(fila).forEach(k => { limpio[k] = typeof fila[k] === 'number' ? fila[k] : empSinFormula_(fila[k]); });
  agregar_('Emp_Cola', limpio); if (typeof olvidar_ === 'function') olvidar_('Emp_Cola');
  ctx.cola.push(limpio);
  return true;
}

// ================================================================== registrar en Alegra (compras)
/**
 * Registra una factura de la cola en Alegra con su PDF. Seguro contra dobles: se marca «registrando» antes de enviar;
 * si una ejecución se corta en ese punto, la factura vuelve a «revisar» con el aviso de verificar en Alegra (nunca se reenvía sola).
 */
function empRegistrar_(id, admin, cambios) {
  const lock = LockService.getScriptLock(); if (!lock.tryLock(25000)) throw error_('Otro registro está en curso. Intente en un momento.');
  let q;
  try {
    const props = PropertiesService.getScriptProperties(), sync = Number(props.getProperty('EMP_SYNC_CORRIENDO') || 0);
    if (sync && Date.now() - sync < 7 * 60 * 1000) throw error_('Se está leyendo Alegra en este momento: intente en unos minutos.');
    q = empFilas_('Emp_Cola').find(x => s_(x.id) === s_(id));
    if (!q) throw error_('No encuentro esa factura en la cola.');
    if (s_(q.estado) === 'descartada') throw error_('Esa factura está descartada.');
    if (s_(q.alegra_id) || s_(q.estado) === 'registrada') throw error_('Esa factura ya está registrada en Alegra (' + s_(q.alegra_id) + ').');
    if (s_(q.estado) === 'registrando') throw error_('Esa factura quedó a medias en un intento anterior: verifique en Alegra si ya existe antes de registrarla. Si no existe, márquela «Revisada» y apruébela.');
    if (s_(q.estado) === 'duplicada' && !(cambios && cambios.forzar)) throw error_('La factura está marcada como duplicada. Si está seguro de que no lo es, use «Registrar de todos modos».');
    const f = empJson_(q.datos, {}), p = Object.assign(empJson_(q.propuesta, {}), cambios && cambios.propuesta || {}); delete p.manual;
    if (cambios && cambios.factura) Object.assign(f, cambios.factura);
    if (!s_(p.proveedor_id)) throw error_('Falta el suplidor de Alegra.');
    if (!s_(p.categoria_id)) throw error_('Falta la categoría.');
    if (!Emp.fecha(f.fecha_factura)) throw error_('Falta la fecha de la factura.');
    if (!(Emp.n(f.total) > 0)) throw error_('Falta el total.');
    if (Emp.n(f.itbis) > 0 && !s_(p.impuesto_id)) throw error_('Falta el impuesto (ITBIS) de Alegra.');
    // duplicados otra vez, con lo último de Alegra y de la cola (pudo entrar a mano en Alegra o cambiar el NCF en la revisión)
    const otras = empFilas_('Emp_Compras').map(c => ({ id: 'AL-' + s_(c.alegra_id), estado: s_(c.estado) === 'void' ? 'anulada' : '', ncf: s_(c.ncf), rnc: s_(c.rnc), suplidor: s_(c.proveedor), monto: Number(c.total) || 0, factura_fecha: s_(c.fecha), concepto: 'Compra ' + s_(c.alegra_id) + ' en Alegra' }))
      .concat(empFilas_('Emp_Cola').filter(x => s_(x.id) !== s_(id) && ['registrada', 'registrando'].indexOf(s_(x.estado)) >= 0)
        .map(x => ({ id: s_(x.id), ncf: s_(x.ncf), rnc: s_(x.rnc), suplidor: s_(x.suplidor), monto: Number(x.total) || 0, factura_fecha: s_(x.fecha_factura), concepto: 'Ya enviada desde la cola' })));
    const dup = Fiscal.candidatos(f, otras).filter(c => c.nivel === 'rojo');
    if (dup.length && !(cambios && cambios.forzar)) {
      empActualizar_('Emp_Cola', id, { estado: 'duplicada', motivos: JSON.stringify(['El mismo NCF de este suplidor ya está registrado (' + dup[0].concepto + ')']), duplicado: JSON.stringify({ nivel: 'rojo', con: dup.slice(0, 3) }) });
      throw error_('No se registró: el mismo NCF de este suplidor ya está en ' + dup[0].concepto + '.');
    }
    empActualizar_('Emp_Cola', id, { estado: 'registrando', datos: JSON.stringify(f), propuesta: JSON.stringify(p), revisado_por: s_(admin.nombre) });
    q._p = p; q._f = f;
  } finally { try { SpreadsheetApp.flush(); } catch (e) { /* nada */ } lock.releaseLock(); }
  let bill;
  try {
    const cuerpo = Emp.cuerpoCompra(q._f, q._p, { ref: 'cola ' + id + ' · lote ' + s_(q.lote_id) + ' págs ' + s_(q.paginas) + (admin.nombre ? ' · ' + admin.nombre : ''), estilo: PropertiesService.getScriptProperties().getProperty('EMP_ESTILO_NCF') || 'completo' });
    bill = alegra_('post', ALEGRA_RUTAS.compras, cuerpo);
  } catch (e) {
    if (alegraRechazo_(e)) empActualizar_('Emp_Cola', id, { estado: 'revisar', error: s_(e.message).slice(0, 400) });   // Alegra la rechazó: no existe allá, se puede corregir y reintentar
    else empActualizar_('Emp_Cola', id, { error: ('No se sabe si Alegra la creó (' + s_(e.message) + '). Búsquela en Alegra antes de volver a intentarlo.').slice(0, 400) });   // queda «registrando»: nunca se reenvía sola
    throw e;
  }
  const bid = s_(bill && bill.id);
  let aviso = '';
  try { if (s_(q.archivo_id)) alegra_('post', ALEGRA_RUTAS.compras + '/' + bid + '/attachment', null, { archivo: DriveApp.getFileById(s_(q.archivo_id)).getBlob() }); }
  catch (e) { aviso = 'Se registró, pero no se pudo adjuntar el PDF: ' + e.message; }
  empActualizar_('Emp_Cola', id, { estado: 'registrada', alegra_id: bid, error: aviso.slice(0, 400) });
  agregar_('Emp_Compras', { alegra_id: bid, fecha: Emp.fecha(q._f.fecha_factura), proveedor_id: s_(q._p.proveedor_id), proveedor: s_(q._p.proveedor || q._f.suplidor), rnc: s_(q._f.rnc), ncf: s_(q._f.ncf),
    total: Emp.n(q._f.total), categoria_id: s_(q._p.categoria_id), centro_id: s_(q._p.centro_id), impuesto_id: s_(q._p.impuesto_id), estado: 'open', origen: 'stili', actualizado_en: new Date().toISOString() });
  if (typeof olvidar_ === 'function') olvidar_('Emp_Compras');
  return { alegra_id: bid, aviso };
}
/** Crea en Alegra el suplidor que no existe (nombre y RNC de la factura). */
function empCrearSuplidor_(id) {
  const q = empFilas_('Emp_Cola').find(x => s_(x.id) === s_(id)); if (!q) throw error_('No encuentro esa factura.');
  const f = empJson_(q.datos, {}); if (!s_(f.suplidor)) throw error_('Escriba primero el nombre del suplidor.');
  const ya = empCatalogo_().contacto.find(c => s_(f.rnc) ? c.rnc === s_(f.rnc) : Emp.sinT(c.nombre) === Emp.sinT(f.suplidor));
  const c = ya || alegra_('post', ALEGRA_RUTAS.contactos, { name: s_(f.suplidor).slice(0, 150), identification: s_(f.rnc), type: ['provider'] });
  const cid = s_(c.id);
  if (!ya) agregar_('Emp_Catalogo', { tipo: 'contacto', id: cid, nombre: s_(f.suplidor), rnc: s_(f.rnc), extra: JSON.stringify({ tipos: ['provider'] }), actualizado_en: new Date().toISOString() });
  return empReevaluar_(id, { proveedor_id: cid, proveedor: s_(f.suplidor) });
}
/** Vuelve a calcular el estado de una factura después de una corrección. */
function empReevaluar_(id, propuesta, factura) {
  const q = empFilas_('Emp_Cola').find(x => s_(x.id) === s_(id)); if (!q) throw error_('No encuentro esa factura.');
  if (['registrada', 'registrando', 'descartada'].indexOf(s_(q.estado)) >= 0) throw error_(s_(q.estado) === 'descartada' ? 'Esa factura está descartada.' : 'Esa factura ya se envió a Alegra.');
  const f = Object.assign(empJson_(q.datos, {}), factura || {}), p = empJson_(q.propuesta, {});
  const ctx = empContexto_(); ctx.id = id; ctx.sugerir = false;
  const ev = empEvaluar_(f, ctx);
  // lo que una persona eligió (suplidor, categoría, centro, impuesto) se guarda aparte y siempre manda sobre lo calculado
  const manual = Object.assign({}, p.manual || {}, propuesta || {}); delete manual.manual;
  const prop = Object.assign({}, ev.propuesta, manual, { manual });
  if (!s_(prop.categoria_id) && s_(p.categoria_id)) Object.assign(prop, { categoria_id: p.categoria_id, centro_id: p.centro_id || prop.centro_id, criterio: p.criterio, fuente: p.fuente });   // la sugerencia de la IA no se pierde
  if (manual.categoria_id) { prop.fuente = 'manual'; prop.criterio = 'Elegida por una persona'; }
  const est = Emp.estadoCola({ factura: f, alertas: ev.alertas, duplicado: ev.duplicado && ev.duplicado.nivel, ia: ev.duplicado && ev.duplicado.ia, proveedor_id: prop.proveedor_id,
    criterio: prop.categoria_id ? { fuente: prop.fuente === 'manual' ? 'regla' : (prop.fuente || 'historial_debil'), categoria_id: prop.categoria_id } : null, impuesto_id: prop.impuesto_id, desde: ctx.desde, hoy: ctx.hoy,
    sin_rnc_empresa: !empFicha_().rnc, sin_alegra_completo: !ctx.alegra_completo });
  return empActualizar_('Emp_Cola', id, { estado: est.estado, suplidor: s_(f.suplidor), rnc: s_(f.rnc).replace(/\D/g, ''), ncf: s_(f.ncf), fecha_factura: Emp.fecha(f.fecha_factura), total: Emp.n(f.total), itbis: Emp.n(f.itbis),
    datos: JSON.stringify(f), propuesta: JSON.stringify(prop), alertas: JSON.stringify(ev.alertas), motivos: JSON.stringify(est.motivos), duplicado: ev.duplicado ? JSON.stringify(ev.duplicado) : '', error: '' });
}

// ================================================================== facturas a clientes (siempre con aprobación de una persona)
function empProponerHonorarios_() { return empConLock_(() => empProponerHonorariosUna_()); }
function empProponerHonorariosUna_() {
  const hoy = empHoy_(), periodo = hoy.slice(0, 7);
  const nuevas = Emp.honorariosDelMes(empFilas_('Emp_Honorarios'), empFilas_('Emp_Propuestas'), periodo, hoy);
  const cat = nuevas.length ? empCatalogo_() : null;
  nuevas.forEach(p => {
    const c = cat.contacto.find(x => x.id === p.cliente_id);
    agregar_('Emp_Propuestas', Object.assign({ id: idNuevo_('EMV'), cliente: c ? c.nombre : '', estado: 'propuesta', alegra_id: '', numero: '', aprobado_por: '', error: '', creado_en: new Date().toISOString(), actualizado_en: new Date().toISOString() }, p));
  });
  if (nuevas.length && typeof olvidar_ === 'function') olvidar_('Emp_Propuestas');
  return nuevas.length;
}
function empAprobarPropuesta_(id, admin, cambios) {
  const lock = LockService.getScriptLock(); if (!lock.tryLock(25000)) throw error_('Otra aprobación está en curso. Intente en un momento.');
  let p;
  try {
    p = empFilas_('Emp_Propuestas').find(x => s_(x.id) === s_(id));
    if (!p) throw error_('No encuentro esa propuesta.');
    if (s_(p.estado) !== 'propuesta') throw error_('Esa propuesta ya está ' + s_(p.estado) + '.');
    const c = cambios || {}; ['fecha', 'monto', 'impuesto_id', 'concepto', 'cliente_id', 'item_id'].forEach(k => { if (c[k] !== undefined) p[k] = c[k]; });   // solo estos campos
    if (c.cliente_id) { const cl = empCatalogo_().contacto.find(x => x.id === s_(c.cliente_id)); p.cliente = cl ? cl.nombre : p.cliente; }
    if (!s_(p.cliente_id)) throw error_('Elija el cliente de Alegra.');
    if (!s_(p.item_id)) throw error_('Elija el producto o servicio de Alegra.');
    if (!(Emp.n(p.monto) > 0)) throw error_('Falta el monto.');
    empActualizar_('Emp_Propuestas', id, { estado: 'enviando', aprobado_por: s_(admin.nombre), cliente_id: s_(p.cliente_id), cliente: s_(p.cliente), item_id: s_(p.item_id), monto: Emp.n(p.monto), impuesto_id: s_(p.impuesto_id), concepto: s_(p.concepto), fecha: Emp.fecha(p.fecha) || empHoy_() });
    p.aprobado_por = s_(admin.nombre); p.fecha = Emp.fecha(p.fecha) || empHoy_();
  } finally { try { SpreadsheetApp.flush(); } catch (e) { /* nada */ } lock.releaseLock(); }
  const cfg = empCfg_();
  let inv;
  try { inv = alegra_('post', ALEGRA_RUTAS.ventas, Emp.cuerpoVenta(p, { vence_dias: cfg.EMP_VENCE_DIAS, plantilla: cfg.EMP_PLANTILLA_VENTA, emitir: cfg.EMP_EMITIR === 'si' })); }
  catch (e) {
    if (alegraRechazo_(e)) empActualizar_('Emp_Propuestas', id, { estado: 'propuesta', error: s_(e.message).slice(0, 400) });
    else empActualizar_('Emp_Propuestas', id, { error: ('No se sabe si Alegra creó la factura (' + s_(e.message) + '). Búsquela en Alegra antes de volver a aprobarla.').slice(0, 400) });   // queda «enviando»
    throw e;
  }
  const num = s_(inv && ((inv.numberTemplate && (inv.numberTemplate.fullNumber || ((inv.numberTemplate.prefix || '') + (inv.numberTemplate.number || '')))) || inv.number));
  const avisoEmision = inv && inv.stamp && inv.stamp.error ? 'Creada sin emitir: ' + s_(inv.stamp.error.message || inv.stamp.error).slice(0, 200) : '';
  empActualizar_('Emp_Propuestas', id, { estado: 'creada', alegra_id: s_(inv && inv.id), numero: num, error: avisoEmision });
  if (s_(p.origen).indexOf('extracto:') === 0) { const ex = empFilas_('Emp_Extracto').find(x => s_(x.id) === s_(p.origen).slice(9)); if (ex) actualizar_('Emp_Extracto', ex._fila, { propuesta_id: id }); }
  return { alegra_id: s_(inv && inv.id), numero: num, aviso: avisoEmision };
}
function empNuevaPropuesta_(d, admin) { return empConLock_(() => empNuevaPropuestaUna_(d, admin)); }
function empNuevaPropuestaUna_(d, admin) {
  const cat = empCatalogo_(), c = cat.contacto.find(x => x.id === s_(d.cliente_id));
  let monto = Emp.n(d.monto);
  if (d.incluye_itbis && s_(d.impuesto_id)) { const t = cat.impuesto.find(x => x.id === s_(d.impuesto_id)); monto = Emp.baseDeTotal(monto, t ? t.porcentaje : 0); }
  const p = { id: idNuevo_('EMV'), tipo: ['deposito', 'servicio'].indexOf(s_(d.tipo)) >= 0 ? s_(d.tipo) : 'servicio', clave: s_(d.tipo) === 'deposito' && s_(d.extracto_id) ? 'dep|' + s_(d.extracto_id) : 'man|' + Date.now(),
    periodo: (Emp.fecha(d.fecha) || empHoy_()).slice(0, 7), fecha: Emp.fecha(d.fecha) || empHoy_(), cliente_id: s_(d.cliente_id), cliente: c ? c.nombre : '', item_id: s_(d.item_id),
    concepto: s_(d.concepto).slice(0, 480), monto, impuesto_id: s_(d.impuesto_id), origen: s_(d.extracto_id) ? 'extracto:' + s_(d.extracto_id) : 'Manual · ' + s_(admin.nombre),
    estado: 'propuesta', alegra_id: '', numero: '', aprobado_por: '', error: '', creado_en: new Date().toISOString(), actualizado_en: new Date().toISOString() };
  if (s_(d.tipo) === 'deposito' && empFilas_('Emp_Propuestas').some(x => s_(x.clave) === p.clave)) throw error_('Ese depósito ya tiene una propuesta de factura.');
  const limpio = {}; Object.keys(p).forEach(k => { limpio[k] = typeof p[k] === 'number' ? p[k] : empSinFormula_(p[k]); });
  agregar_('Emp_Propuestas', limpio); if (typeof olvidar_ === 'function') olvidar_('Emp_Propuestas');
  return p;
}

// ================================================================== conciliación bancaria mensual
const EMP_FORMATO_EXTRACTO = 'Lea este estado de cuenta bancario de la República Dominicana (páginas P1 a P2). Responda SOLO ```json {"banco":"","desde":"AAAA-MM-DD","hasta":"AAAA-MM-DD",' +
  '"saldo_inicial":null,"saldo_final":null,"lineas":[{"fecha":"AAAA-MM-DD","descripcion":"","referencia":"","monto":0,"saldo":null}]}``` «monto» positivo si entra dinero (crédito/depósito) ' +
  'y negativo si sale (débito/cargo). saldo_inicial y saldo_final solo si aparecen en estas páginas. No invente líneas; copie todas las del período, en orden.';
async function empLeerExtracto_(c, hasta) {
  const file = DriveApp.getFileById(s_(c.archivo_id)), mime = file.getMimeType(), bytes = file.getBlob().getBytes();
  const det = empJson_(c.detalle, {}), prog = det.prog || { sig: 1, si: null, sf: null };
  const leer = (b, m, ini, fin) => {
    const contenido = /^text\//.test(m) ? [{ type: 'text', text: 'Estado de cuenta (texto):\n' + Utilities.newBlob(b).getDataAsString().slice(0, 150000) }] : [empBloqueIa_(b, m)];
    const r = claude_('Usted lee estados de cuenta bancarios con exactitud.', contenido.concat([{ type: 'text', text: EMP_FORMATO_EXTRACTO.replace('P1', ini).replace('P2', fin) }]), 8000);
    return partirRespuesta_(r.texto).datos || {};
  };
  // cada parte leída se guarda enseguida (con su marca): si Google corta, la próxima vuelta sigue en la parte siguiente
  const guardarParte = (ini, d) => {
    const marca = Date.now();
    (d.lineas || []).forEach((l, k) => agregar_('Emp_Extracto', { id: s_(c.id) + '-p' + ini + '-' + marca + '-' + k, conc_id: s_(c.id) + '#leyendo', n: ini * 1000 + k, fecha: Emp.fecha(l.fecha), descripcion: empSinFormula_(s_(l.descripcion).slice(0, 200)),
      referencia: empSinFormula_(s_(l.referencia).slice(0, 60)), monto: Emp.n(l.monto), saldo: l.saldo == null || l.saldo === '' ? '' : Emp.n(l.saldo), clase: '', pareja: '', pareja_desc: '', propuesta_id: '' }));
    if (prog.si == null && d.saldo_inicial != null && d.saldo_inicial !== '') prog.si = Emp.n(d.saldo_inicial);
    if (d.saldo_final != null && d.saldo_final !== '') prog.sf = Emp.n(d.saldo_final);
  };
  if (/pdf/.test(mime)) {
    const doc = await pdfAbrir_(bytes), total = doc.getPageCount();
    while (prog.sig <= total) {
      if (hasta && Date.now() + 90000 > hasta) { empActualizar_('Emp_Conciliaciones', c.id, { detalle: JSON.stringify(Object.assign(det, { prog })) }); return false; }
      const ini = prog.sig, fin = Math.min(total, ini + EMP_BLOQUE_EXTRACTO - 1);
      guardarParte(ini, leer(ini === 1 && fin === total ? bytes : await pdfExtraer_(doc, range_(ini, fin)), 'application/pdf', ini, fin));
      prog.sig = fin + 1;
      empActualizar_('Emp_Conciliaciones', c.id, { detalle: JSON.stringify(Object.assign(det, { prog })) });
    }
  } else if (prog.sig === 1) { guardarParte(1, leer(bytes, mime, 1, 1)); prog.sig = 2; }
  // de cada parte se queda la última lectura (por si una parte se leyó dos veces)
  const leidas = empFilas_('Emp_Extracto').filter(x => s_(x.conc_id) === s_(c.id) + '#leyendo'), ultima = {};
  leidas.forEach(x => { const m = s_(x.id).match(/-p(\d+)-(\d+)-\d+$/); if (m && (!ultima[m[1]] || Number(m[2]) > ultima[m[1]])) ultima[m[1]] = Number(m[2]); });
  const mes = s_(c.mes), si = prog.si, sf = prog.sf;
  const lineas = leidas.filter(x => { const m = s_(x.id).match(/-p(\d+)-(\d+)-\d+$/); return m && Number(m[2]) === ultima[m[1]]; }).sort((a, b) => Number(a.n) - Number(b.n))
    .map(x => ({ fecha: Emp.fecha(x.fecha), descripcion: s_(x.descripcion), referencia: s_(x.referencia), monto: Number(x.monto) || 0, saldo: x.saldo }))
    .filter(l => l.fecha && l.monto && (!mes || l.fecha.slice(0, 7) === mes));
  const cuadre = si != null && sf != null ? Math.round((si + lineas.reduce((s, l) => s + l.monto, 0) - sf) * 100) / 100 : null;
  const conc = empEmparejar_(c, lineas);   // reescribe las líneas de esta conciliación y borra las de lectura
  empActualizar_('Emp_Conciliaciones', c.id, { estado: 'lista', saldo_inicial: si == null ? '' : si, saldo_banco: sf == null ? '' : sf, lineas: lineas.length, parejas: conc.conciliadas,
    detalle: JSON.stringify({ cuadre, gastos_banco: conc.gastos_banco, impuestos: conc.impuestos, intereses: conc.intereses, depositos: conc.depositos, retiros: conc.retiros, solo_alegra: conc.solo_alegra.slice(0, 200), fuente: conc.fuente }) });
  return true;
}
/** Movimientos de Alegra de esa cuenta en el mes (±5 días). */
function empMovimientos_(cuentaId, mes) {
  const desde = Emp.masDias(mes + '-01', -5), hasta = Emp.masDias(Emp.finDeMes(mes), 5), norm = [];
  let fuente = 'movimientos';
  try {
    alegraTodos_(ALEGRA_RUTAS.movimientos.replace('{id}', encodeURIComponent(cuentaId)), { dateFrom: desde, dateTo: hasta }).forEach(m => norm.push({ id: s_(m.id), fecha: Emp.fecha(m.date), monto: (s_(m.type) === 'out' ? -1 : 1) * Math.abs(Emp.n(m.amount)), descripcion: s_(m.description), referencia: s_(m.reference || m.number), conciliado: !!(m.reconciled || m.reconciliation || m.conciliation) }));
  } catch (e) {
    if (e.http !== 404 && e.http !== 400) throw e;
    fuente = 'pagos';   // sin ruta de movimientos: se usan los pagos y cobros de esa cuenta
    alegraTodos_(ALEGRA_RUTAS.pagos, {}).filter(p => EMP_ID(p.bankAccount) === s_(cuentaId) && s_(p.status) !== 'void').filter(p => { const f = Emp.fecha(p.date); return f >= desde && f <= hasta; })
      .forEach(p => norm.push({ id: s_(p.id), fecha: Emp.fecha(p.date), monto: (s_(p.type) === 'out' ? -1 : 1) * Math.abs(Emp.n(p.amount)), descripcion: s_(p.observations || (p.client && p.client.name) || (p.provider && p.provider.name) || ''), referencia: s_(p.number || ''), conciliado: !!(p.reconciliation || p.conciliation) }));
  }
  return { movs: norm, fuente };
}
function empEmparejar_(c, lineas) {
  // movimientos ya usados en otra conciliación de esta cuenta no se vuelven a usar
  const otras = new Set(empFilas_('Emp_Conciliaciones').filter(x => s_(x.cuenta_id) === s_(c.cuenta_id) && s_(x.id) !== s_(c.id) && ['borrador_alegra', 'cerrada', 'enviando'].indexOf(s_(x.estado)) >= 0).map(x => s_(x.id)));
  const usados = new Set(empFilas_('Emp_Extracto').filter(x => otras.has(s_(x.conc_id)) && s_(x.pareja)).map(x => s_(x.pareja)));
  const mv = empMovimientos_(s_(c.cuenta_id), s_(c.mes));
  mv.movs = mv.movs.filter(m => !usados.has(m.id) && !m.conciliado);
  const r = Emp.emparejar(lineas, mv.movs, 4);
  const filas = lineas.map((l, i) => Object.assign({ id: s_(c.id) + '-' + (i + 1), conc_id: s_(c.id), n: i + 1 }, l, r.lineas[i], { propuesta_id: '' }));
  // reescribe las líneas de esta conciliación (las demás quedan igual)
  const resto = empFilas_('Emp_Extracto').filter(x => s_(x.conc_id) !== s_(c.id) && s_(x.conc_id) !== s_(c.id) + '#leyendo').map(x => { const o = {}; EMP_TABLAS.Emp_Extracto.forEach(k => { o[k] = x[k]; }); return o; });
  empEscribirTodo_('Emp_Extracto', resto.concat(filas));
  r.fuente = mv.fuente;
  return r;
}
function empEnviarConciliacion_(id, admin, d) {
  const prep = empConLock_(() => empPrepararConciliacion_(id, admin, d));
  let r;
  try { r = alegra_('post', ALEGRA_RUTAS.conciliaciones, prep.cuerpo); }
  catch (e) {
    if (alegraRechazo_(e)) empActualizar_('Emp_Conciliaciones', id, { estado: 'lista', detalle: JSON.stringify(Object.assign(prep.det, { error: s_(e.message).slice(0, 300) })) });
    else empActualizar_('Emp_Conciliaciones', id, { detalle: JSON.stringify(Object.assign(prep.det, { error: ('No se sabe si Alegra la creó (' + s_(e.message) + '). Verifique en Alegra.').slice(0, 300) })) });   // queda «enviando»
    throw e;
  }
  empActualizar_('Emp_Conciliaciones', id, { estado: prep.cuerpo.status === 'open' ? 'cerrada' : 'borrador_alegra', alegra_id: s_(r && r.id), saldo_banco: prep.cuerpo.realBalance });
  return { alegra_id: s_(r && r.id), estado: prep.cuerpo.status };
}
function empPrepararConciliacion_(id, admin, d) {
  const c = empFilas_('Emp_Conciliaciones').find(x => s_(x.id) === s_(id)); if (!c) throw error_('No encuentro esa conciliación.');
  if (s_(c.estado) !== 'lista') throw error_('La conciliación está ' + s_(c.estado) + '.');
  const lin = empFilas_('Emp_Extracto').filter(x => s_(x.conc_id) === s_(id)), det = empJson_(c.detalle, {});
  const tieneD = !!(d && s_(d.saldo_banco) !== '');
  if (!tieneD && s_(c.saldo_banco) === '') throw error_('Escriba el saldo final del banco.');
  const saldo = tieneD ? Emp.n(d.saldo_banco) : Emp.n(c.saldo_banco);
  const cuerpo = { date: Emp.finDeMes(s_(c.mes)), account: { id: s_(c.cuenta_id) }, realBalance: saldo, transactions: lin.filter(x => s_(x.pareja)).map(x => s_(x.pareja)),
    bankExpenses: det.gastos_banco || 0, bankTaxes: det.impuestos || 0, bankInterests: det.intereses || 0, status: d && d.estado === 'open' ? 'open' : 'draft' };
  empActualizar_('Emp_Conciliaciones', id, { estado: 'enviando', creado_por: s_(admin.nombre) });
  return { cuerpo, det };
}

// ================================================================== instalación
/** Ejecutar una vez desde el editor: crea las hojas, las carpetas y los activadores (cada 10 minutos y sincronización cada 6 horas). */
function instalarEmpresa() {
  if (typeof instalar === 'function') instalar();
  ['Entrada', 'Procesadas', 'Originales', 'Extractos', 'Sistema'].forEach(n => empSubcarpeta_(n));
  ScriptApp.getProjectTriggers().filter(t => ['empProcesar', 'empSincronizar'].indexOf(t.getHandlerFunction()) >= 0).forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('empProcesar').timeBased().everyMinutes(EMP_MINUTOS).create();
  ScriptApp.newTrigger('empSincronizar').timeBased().everyHours(6).create();
  try { pdfLib_(); } catch (e) { Logger.log('Aviso: ' + e.message); }
  Logger.log('Stili Group · Empresa lista: ' + empRaiz_().getUrl());
  return empRaiz_().getUrl();
}
/** Pide una vuelta del proceso en un minuto (la pantalla no espera: separar un PDF grande toma tiempo). */
function empProgramarVuelta_(funcion) {
  const props = PropertiesService.getScriptProperties(), k = 'EMP_PEDIDA_' + funcion, ult = Number(props.getProperty(k) || 0);
  if (Date.now() - ult < 90 * 1000) return false;
  props.setProperty(k, String(Date.now()));
  // el activador de una sola vez anterior (ya corrió o está por correr) se borra: Google no los borra solos y hay un máximo de 20
  const previo = s_(props.getProperty(k + '_ID'));
  if (previo) ScriptApp.getProjectTriggers().filter(t => t.getUniqueId() === previo).forEach(t => { try { ScriptApp.deleteTrigger(t); } catch (e) { /* nada */ } });
  const t = ScriptApp.newTrigger(funcion).timeBased().after(30 * 1000).create();
  props.setProperty(k + '_ID', t.getUniqueId());
  return true;
}

// ================================================================== pantalla
function empDatos_(admin) {
  const props = PropertiesService.getScriptProperties(), cfg = empCfg_(), cat = empCatalogo_(), raiz = empRaiz_(false);
  const usuario = s_(props.getProperty('ALEGRA_USUARIO'));
  const cola = empFilas_('Emp_Cola').slice(-800).reverse().map(q => ({ id: s_(q.id), lote_id: s_(q.lote_id), paginas: s_(q.paginas), url: s_(q.url), estado: s_(q.estado), suplidor: s_(q.suplidor), rnc: s_(q.rnc),
    ncf: s_(q.ncf), fecha_factura: s_(q.fecha_factura), total: Number(q.total) || 0, itbis: Number(q.itbis) || 0, datos: empJson_(q.datos, {}), propuesta: empJson_(q.propuesta, {}), alertas: empJson_(q.alertas, []),
    motivos: empJson_(q.motivos, []), duplicado: empJson_(q.duplicado, null), alegra_id: s_(q.alegra_id), revisado_por: s_(q.revisado_por), error: s_(q.error), creado_en: s_(q.creado_en) }));
  const compras = empFilas_('Emp_Compras');
  const porAnio = {}; compras.forEach(c => { const a = s_(c.fecha).slice(0, 4); if (a) porAnio[a] = (porAnio[a] || 0) + 1; });
  const aprendido = Emp.aprender(compras.map(c => ({ rnc: s_(c.rnc), proveedor_id: s_(c.proveedor_id), categoria_id: s_(c.categoria_id), centro_id: s_(c.centro_id), estado: s_(c.estado) })));
  const nombres = {}; compras.forEach(c => { const k = s_(c.rnc) || 'p' + s_(c.proveedor_id); nombres[k] = s_(c.proveedor); });
  const criterio = Object.keys(aprendido).map(k => Object.assign({ clave: k, proveedor: nombres[k] || k }, aprendido[k])).sort((a, b) => b.veces - a.veces).slice(0, 300);
  return {
    conectado: alegraConectado_(), usuario: usuario ? usuario.replace(/^(.).*(@.*)$/, '$1•••$2') : '', puede_editar: empPuede_(admin, 3), gerente: !!admin.gerente,
    carpeta: raiz ? raiz.getUrl() : '', activo: ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'empProcesar'), cada_minutos: EMP_MINUTOS,
    ultima: s_(props.getProperty('EMP_ULTIMA')), sync: { ultima: s_(props.getProperty('EMP_SYNC_ULTIMA')), completa: s_(props.getProperty('EMP_SYNC_COMPLETA')), estilo_ncf: s_(props.getProperty('EMP_ESTILO_NCF')), compras: compras.length, por_anio: porAnio },
    config: cfg, catalogo: { contactos: cat.contacto.map(c => ({ id: c.id, nombre: c.nombre, rnc: c.rnc, tipos: c.tipos || [] })), categorias: cat.categoria.map(c => ({ id: c.id, nombre: c.nombre, tipo: c.tipo })),
      centros: cat.centro.map(c => ({ id: c.id, nombre: c.nombre })), impuestos: cat.impuesto.map(c => ({ id: c.id, nombre: c.nombre, porcentaje: c.porcentaje })), bancos: cat.banco.map(c => ({ id: c.id, nombre: c.nombre, numero: c.numero })),
      numeraciones: cat.numeracion.map(c => ({ id: c.id, nombre: c.nombre, documento: c.documento, preferida: c.preferida })), items: cat.item.map(c => ({ id: c.id, nombre: c.nombre, precio: c.precio })) },
    lotes: empFilas_('Emp_Lotes').slice(-60).reverse().map(l => ({ id: s_(l.id), fecha: s_(l.fecha), origen: s_(l.origen), archivo: s_(l.archivo), paginas: Number(l.paginas) || 0, siguiente: Number(l.siguiente) || 1, facturas: Number(l.facturas) || 0, estado: s_(l.estado), detalle: s_(l.detalle) })),
    cola, reglas: empFilas_('Emp_Reglas').map(r => ({ id: s_(r.id), rnc: s_(r.rnc), contiene: s_(r.contiene), categoria_id: s_(r.categoria_id), centro_id: s_(r.centro_id), nota: s_(r.nota) })), criterio,
    honorarios: empFilas_('Emp_Honorarios').map(h => ({ id: s_(h.id), torre: s_(h.torre), cliente_id: s_(h.cliente_id), item_id: s_(h.item_id), monto: Number(h.monto) || 0, impuesto_id: s_(h.impuesto_id), dia: Number(h.dia) || 1, activo: s_(h.activo) || 'si', nota: s_(h.nota) })),
    propuestas: empFilas_('Emp_Propuestas').slice(-400).reverse().map(p => ({ id: s_(p.id), tipo: s_(p.tipo), periodo: s_(p.periodo), fecha: s_(p.fecha), cliente_id: s_(p.cliente_id), cliente: s_(p.cliente), item_id: s_(p.item_id),
      concepto: s_(p.concepto), monto: Number(p.monto) || 0, impuesto_id: s_(p.impuesto_id), origen: s_(p.origen), estado: s_(p.estado), alegra_id: s_(p.alegra_id), numero: s_(p.numero), aprobado_por: s_(p.aprobado_por), error: s_(p.error) })),
    conciliaciones: empFilas_('Emp_Conciliaciones').slice(-36).reverse().map(c => ({ id: s_(c.id), cuenta_id: s_(c.cuenta_id), cuenta: s_(c.cuenta), mes: s_(c.mes), url: s_(c.url), saldo_inicial: s_(c.saldo_inicial), saldo_banco: s_(c.saldo_banco),
      lineas: Number(c.lineas) || 0, parejas: Number(c.parejas) || 0, estado: s_(c.estado), alegra_id: s_(c.alegra_id), detalle: empJson_(c.detalle, {}) })),
  };
}
function empAccion_(req, admin) {
  empExigir_(admin, 1);
  const op = s_(req.op || 'datos'), d = req.datos || {}, editar = () => empExigir_(admin, 3);
  switch (op) {
    case 'datos': return empDatos_(admin);
    case 'conectar': {
      if (!admin.gerente) throw error_('Solo Gerencia conecta Alegra.', 'SIN_PERMISO');
      const u = s_(d.usuario), t = s_(d.token);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(u) || t.length < 8) throw error_('Escriba el correo de Alegra y el token completo.');
      const props = PropertiesService.getScriptProperties(), antes = { u: props.getProperty('ALEGRA_USUARIO'), t: props.getProperty('ALEGRA_TOKEN') };
      props.setProperties({ ALEGRA_USUARIO: u, ALEGRA_TOKEN: t });
      try { alegraPagina_(ALEGRA_RUTAS.impuestos, {}, 0); }
      catch (e) { if (antes.u && antes.t) props.setProperties({ ALEGRA_USUARIO: antes.u, ALEGRA_TOKEN: antes.t }); else { props.deleteProperty('ALEGRA_USUARIO'); props.deleteProperty('ALEGRA_TOKEN'); } throw error_('No se conectó: ' + e.message); }
      empProgramarVuelta_('empSincronizar');
      return Object.assign(empDatos_(admin), { aviso: 'Alegra conectado. En unos minutos se traen sus catálogos y compras (solo lectura).' });
    }
    case 'desconectar': { if (!admin.gerente) throw error_('Solo Gerencia.', 'SIN_PERMISO'); const p = PropertiesService.getScriptProperties(); p.deleteProperty('ALEGRA_USUARIO'); p.deleteProperty('ALEGRA_TOKEN'); return empDatos_(admin); }
    case 'sincronizar': editar(); empProgramarVuelta_('empSincronizar'); return Object.assign(empDatos_(admin), { aviso: 'Sincronización pedida: empieza en menos de un minuto.' });
    case 'procesar': editar(); empProgramarVuelta_('empProcesar'); return Object.assign(empDatos_(admin), { aviso: 'Proceso pedido: empieza en menos de un minuto. Un PDF de 30 páginas toma unos minutos.' });
    case 'config': {
      if (!admin.gerente) throw error_('Solo Gerencia cambia la configuración.', 'SIN_PERMISO');
      Object.keys(EMP_CONFIG).forEach(k => { if (d[k] !== undefined) { let v = s_(d[k]); if (k === 'EMP_RNC') v = v.replace(/\D/g, ''); if (['EMP_AUTO', 'EMP_EMITIR'].indexOf(k) >= 0) v = v === 'si' ? 'si' : 'no'; empFijarConfig_(k, empSinFormula_(v)); } });
      return empDatos_(admin);
    }
    case 'subir': {
      editar();
      const nombre = s_(d.nombre).replace(/[\\/:*?"<>|]/g, '-').slice(0, 120) || 'facturas.pdf', mime = s_(d.mime);
      if (!empTipoArchivo_(mime, nombre)) throw error_('Use PDF, JPG o PNG.');
      const bytes = Utilities.base64Decode(s_(d.contenido)); if (bytes.length > 30 * 1024 * 1024) throw error_('El archivo pasa de 30 MB: divídalo en dos.');
      const hash = empHash_(bytes), previos = empFilas_('Emp_Lotes').filter(l => s_(l.hash) === hash);
      previos.filter(l => s_(l.estado) === 'problema').forEach(l => empActualizar_('Emp_Lotes', l.id, { estado: 'reemplazado' }));   // un archivo que no se pudo leer se puede volver a subir
      const previo = previos.find(l => ['problema', 'duplicado', 'reemplazado'].indexOf(s_(l.estado)) < 0);
      if (previo) throw error_('Este mismo archivo ya entró el ' + s_(previo.fecha).slice(0, 10) + ' (' + s_(previo.archivo) + ').');
      const f = empSubcarpeta_('Entrada').createFile(Utilities.newBlob(bytes, mime, nombre));
      agregar_('Emp_Lotes', { id: idNuevo_('LOT'), fecha: new Date().toISOString(), origen: 'pantalla · ' + s_(admin.nombre), archivo: nombre, drive_id: f.getId(), hash, tipo: empTipoArchivo_(mime, nombre), paginas: '', siguiente: 1, facturas: 0, estado: 'pendiente', detalle: '', creado_por: s_(admin.nombre), actualizado_en: new Date().toISOString() });
      empProgramarVuelta_('empProcesar');
      return Object.assign(empDatos_(admin), { aviso: 'Recibido. La IA lo está separando y leyendo: las facturas van apareciendo en «Facturas de suplidores».' });
    }
    case 'corregir': editar(); empConLock_(() => empReevaluar_(s_(d.id), d.propuesta || null, d.factura || null)); return empDatos_(admin);
    case 'reintentar_lote': editar(); empConLock_(() => { const l = empFilas_('Emp_Lotes').find(x => s_(x.id) === s_(d.id)); if (!l || s_(l.estado) !== 'problema') throw error_('Solo archivos con problema.'); empActualizar_('Emp_Lotes', d.id, { estado: s_(l.paginas) ? 'leyendo' : 'pendiente', intentos: 0, detalle: 'Reintento pedido por ' + s_(admin.nombre) }); }); empProgramarVuelta_('empProcesar'); return empDatos_(admin);
    case 'propuesta_verificada': editar(); empConLock_(() => { const p = empFilas_('Emp_Propuestas').find(x => s_(x.id) === s_(d.id)); if (!p || s_(p.estado) !== 'enviando') throw error_('Solo para facturas que quedaron a medias.');
      if (s_(d.alegra_id)) empActualizar_('Emp_Propuestas', d.id, { estado: 'creada', alegra_id: s_(d.alegra_id).replace(/\D/g, ''), error: 'Verificada en Alegra por ' + s_(admin.nombre) + '.' });
      else empActualizar_('Emp_Propuestas', d.id, { estado: 'propuesta', error: 'Verificada por ' + s_(admin.nombre) + ': no estaba en Alegra.' }); }); return empDatos_(admin);
    case 'conc_verificada': editar(); empConLock_(() => { const c = empFilas_('Emp_Conciliaciones').find(x => s_(x.id) === s_(d.id)); if (!c || s_(c.estado) !== 'enviando') throw error_('Solo para conciliaciones que quedaron a medias.');
      empActualizar_('Emp_Conciliaciones', d.id, s_(d.alegra_id) ? { estado: 'borrador_alegra', alegra_id: s_(d.alegra_id).replace(/\D/g, '') } : { estado: 'lista' }); }); return empDatos_(admin);
    case 'registrar': editar(); { const r = empRegistrar_(s_(d.id), admin, { propuesta: d.propuesta, factura: d.factura, forzar: !!d.forzar }); return Object.assign(empDatos_(admin), { aviso: 'Registrada en Alegra (compra ' + r.alegra_id + ').' + (r.aviso ? ' ' + r.aviso : '') }); }
    case 'registrar_listas': {
      editar(); const hasta = Date.now() + 4 * 60 * 1000; let ok = 0; const err = [];
      empFilas_('Emp_Cola').filter(q => s_(q.estado) === 'listo').forEach(q => { if (Date.now() > hasta) return; try { empRegistrar_(q.id, admin); ok++; } catch (e) { err.push(s_(q.suplidor) + ': ' + e.message); } });
      return Object.assign(empDatos_(admin), { aviso: ok + ' registrada(s) en Alegra.' + (err.length ? ' Con error: ' + err.slice(0, 3).join(' · ') : '') });
    }
    case 'revisada': editar(); empConLock_(() => { const q = empFilas_('Emp_Cola').find(x => s_(x.id) === s_(d.id)); if (!q || s_(q.estado) !== 'registrando') throw error_('Solo para facturas que quedaron a medias.'); empActualizar_('Emp_Cola', d.id, { estado: 'revisar', error: 'Verificada por ' + s_(admin.nombre) + ': no estaba en Alegra.' }); }); return empDatos_(admin);
    case 'descartar': editar(); empConLock_(() => { const q = empFilas_('Emp_Cola').find(x => s_(x.id) === s_(d.id)); if (!q || ['registrada', 'registrando'].indexOf(s_(q.estado)) >= 0) throw error_('No se puede descartar.'); empActualizar_('Emp_Cola', d.id, { estado: 'descartada', revisado_por: s_(admin.nombre), error: s_(d.motivo).slice(0, 200) }); }); return empDatos_(admin);
    case 'crear_suplidor': editar(); empConLock_(() => empCrearSuplidor_(s_(d.id))); return empDatos_(admin);
    case 'regla': {
      editar();
      return empConLock_(() => {
      if (d.borrar) { const r = empFilas_('Emp_Reglas').find(x => s_(x.id) === s_(d.id)); if (r) actualizar_('Emp_Reglas', r._fila, { rnc: '', contiene: '', categoria_id: '', nota: 'borrada por ' + s_(admin.nombre) }); return empDatos_(admin); }
      if (!s_(d.categoria_id) || (!s_(d.rnc).replace(/\D/g, '') && s_(d.contiene).length < 3)) throw error_('La regla necesita un RNC o una palabra (3 letras o más) y la categoría.');
      agregar_('Emp_Reglas', { id: idNuevo_('EMR'), rnc: s_(d.rnc).replace(/\D/g, ''), contiene: empSinFormula_(s_(d.contiene).slice(0, 60)), categoria_id: s_(d.categoria_id), centro_id: s_(d.centro_id), nota: empSinFormula_(s_(d.nota).slice(0, 120)), creado_por: s_(admin.nombre), creado_en: new Date().toISOString() });
      if (typeof olvidar_ === 'function') olvidar_('Emp_Reglas');
      empFilas_('Emp_Cola').filter(q => s_(q.estado) === 'revisar').slice(0, 30).forEach(q => { try { empReevaluar_(q.id); } catch (e) { /* sigue */ } });
      return empDatos_(admin);
      });
    }
    case 'honorario': {
      editar();
      const campos = { torre: empSinFormula_(s_(d.torre).slice(0, 80)), cliente_id: s_(d.cliente_id), item_id: s_(d.item_id), monto: Emp.n(d.monto), impuesto_id: s_(d.impuesto_id), dia: Math.min(28, Math.max(1, Number(d.dia) || 1)), activo: d.activo === 'no' ? 'no' : 'si', nota: empSinFormula_(s_(d.nota).slice(0, 120)) };
      if (!campos.torre || !campos.cliente_id || !campos.item_id || !(campos.monto > 0)) throw error_('Complete torre, cliente, servicio y monto.');
      if (s_(d.id)) empActualizar_('Emp_Honorarios', d.id, campos); else { agregar_('Emp_Honorarios', Object.assign({ id: idNuevo_('EMH') }, campos)); if (typeof olvidar_ === 'function') olvidar_('Emp_Honorarios'); }
      return empDatos_(admin);
    }
    case 'proponer': editar(); empProponerHonorarios_(); return empDatos_(admin);
    case 'propuesta_nueva': editar(); empNuevaPropuesta_(d, admin); return empDatos_(admin);
    case 'propuesta_aprobar': editar(); { const r = empAprobarPropuesta_(s_(d.id), admin, d.cambios || null); return Object.assign(empDatos_(admin), { aviso: 'Factura creada en Alegra' + (r.numero ? ' (' + r.numero + ')' : '') + '.' + (r.aviso ? ' ' + r.aviso : '') }); }
    case 'propuesta_descartar': editar(); { const p = empFilas_('Emp_Propuestas').find(x => s_(x.id) === s_(d.id)); if (!p || s_(p.estado) !== 'propuesta') throw error_('No se puede descartar.'); empActualizar_('Emp_Propuestas', d.id, { estado: 'descartada', aprobado_por: s_(admin.nombre), error: s_(d.motivo).slice(0, 200) }); return empDatos_(admin); }
    case 'conc_subir': {
      editar();
      const mes = s_(d.mes); if (!/^\d{4}-\d{2}$/.test(mes)) throw error_('Elija el mes.');
      const cuenta = empCatalogo_().banco.find(b => b.id === s_(d.cuenta_id)); if (!cuenta) throw error_('Elija la cuenta de banco de Alegra.');
      const ya = empFilas_('Emp_Conciliaciones').find(c => s_(c.cuenta_id) === cuenta.id && s_(c.mes) === mes && ['cerrada', 'borrador_alegra', 'descartada'].indexOf(s_(c.estado)) < 0);
      if (ya) throw error_('Ya hay una conciliación abierta de ' + cuenta.nombre + ' para ' + mes + '. Descártela primero.');
      const nombre = s_(d.nombre).replace(/[\\/:*?"<>|]/g, '-').slice(0, 120) || 'estado.pdf', mime = s_(d.mime);
      if (!/pdf|image\/(jpeg|png)|text\/(csv|plain)/.test(mime)) throw error_('Use PDF, JPG, PNG o CSV.');
      const bytes = Utilities.base64Decode(s_(d.contenido));
      const f = empSubcarpeta_('Extractos', mes).createFile(Utilities.newBlob(bytes, mime, cuenta.nombre + ' ' + mes + ' - ' + nombre));
      agregar_('Emp_Conciliaciones', { id: idNuevo_('EMC'), cuenta_id: cuenta.id, cuenta: cuenta.nombre, mes, archivo_id: f.getId(), url: f.getUrl(), saldo_inicial: '', saldo_banco: '', lineas: 0, parejas: 0, estado: 'leyendo', alegra_id: '', detalle: '', creado_por: s_(admin.nombre), creado_en: new Date().toISOString(), actualizado_en: new Date().toISOString() });
      empProgramarVuelta_('empProcesar');
      return Object.assign(empDatos_(admin), { aviso: 'Estado de cuenta recibido. En unos minutos queda leído y emparejado con Alegra.' });
    }
    case 'conc_detalle': return { lineas: empFilas_('Emp_Extracto').filter(x => s_(x.conc_id) === s_(d.id)).map(x => ({ id: s_(x.id), n: Number(x.n) || 0, fecha: Emp.fecha(x.fecha), descripcion: s_(x.descripcion), referencia: s_(x.referencia), monto: Number(x.monto) || 0, clase: s_(x.clase), pareja: s_(x.pareja), pareja_desc: s_(x.pareja_desc), propuesta_id: s_(x.propuesta_id) })) };
    case 'conc_reemparejar': {
      editar(); const c = empFilas_('Emp_Conciliaciones').find(x => s_(x.id) === s_(d.id)); if (!c || s_(c.estado) !== 'lista') throw error_('Solo conciliaciones listas.');
      const lineas = empFilas_('Emp_Extracto').filter(x => s_(x.conc_id) === s_(d.id)).map(x => ({ fecha: Emp.fecha(x.fecha), descripcion: s_(x.descripcion), referencia: s_(x.referencia), monto: Number(x.monto) || 0, saldo: x.saldo }));
      const r = empEmparejar_(c, lineas), det = empJson_(c.detalle, {});
      empActualizar_('Emp_Conciliaciones', d.id, { parejas: r.conciliadas, detalle: JSON.stringify(Object.assign(det, { gastos_banco: r.gastos_banco, impuestos: r.impuestos, intereses: r.intereses, depositos: r.depositos, retiros: r.retiros, solo_alegra: r.solo_alegra.slice(0, 200), fuente: r.fuente, error: '' })) });
      return empDatos_(admin);
    }
    case 'conc_enviar': editar(); { const r = empEnviarConciliacion_(s_(d.id), admin, d); return Object.assign(empDatos_(admin), { aviso: 'Conciliación creada en Alegra' + (r.estado === 'draft' ? ' como borrador: revísela y ciérrela allá.' : '.') }); }
    case 'conc_descartar': editar(); { const c = empFilas_('Emp_Conciliaciones').find(x => s_(x.id) === s_(d.id)); if (!c || ['cerrada', 'borrador_alegra'].indexOf(s_(c.estado)) >= 0) throw error_('No se puede descartar.'); empActualizar_('Emp_Conciliaciones', d.id, { estado: 'descartada' }); return empDatos_(admin); }
    default: throw error_('Operación desconocida: ' + op);
  }
}
Object.assign(ACCIONES_CENTRAL, { emp: req => conAdmin_(req, empAccion_) });
Object.assign(ACCESO_ACCION, { emp: ['emp_contabilidad', 1] });
if (typeof SECCIONES !== 'undefined' && !SECCIONES.some(x => x[0] === 'emp_contabilidad')) SECCIONES.push(['emp_contabilidad', 'torres', 'Stili Group · Empresa (Alegra)',
  'Ver: facturas de suplidores, conciliaciones y facturas a clientes de Stili Group. Editar: subir facturas, corregir y registrar en Alegra, conciliar y aprobar facturas a clientes. Conectar Alegra y la configuración: solo Gerencia.', [1, 0, 3]]);
// El menú (accionPortal_) muestra «Stili Group · Empresa» a quien tenga el permiso
if (ACCIONES_CENTRAL.portal && !ACCIONES_CENTRAL.portal._emp) {
  const origPortalEmp = ACCIONES_CENTRAL.portal;
  const envPortalEmp = req => {
    const r = origPortalEmp(req);
    try { const v = vistaUsuario_(usuarioDeSolicitud_(req)); if (r && r.accesos) r.accesos.empresa = !!(v.gerente || ((v.permisos || {}).emp_contabilidad || 0) > 0); } catch (e) { /* el menú sigue como estaba */ }
    return r;
  };
  envPortalEmp._emp = true; ACCIONES_CENTRAL.portal = envPortalEmp;
}
