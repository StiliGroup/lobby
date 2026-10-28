/**
 * Stili Soft v2.8 · Vigía de pagos, parte 1.
 * Revisa de forma autónoma cada factura por pagar contra las demás, contra el banco y contra el personal de la torre,
 * y deja alertas en cada pago (p.alertas) y un resumen (c.vigia). Corre en la pantalla cada vez que se cargan las
 * cuentas por pagar; en la parte 2 corre también en el servicio (al entrar una factura, al subir un estado y a las 6 a. m.).
 *
 * Reglas:
 *  R1 · Misma factura dos veces: mismo NCF del mismo suplidor (RNC o nombre).
 *  R2 · Mismo beneficiario y monto (±1 %) en 45 días.
 *  R3 · El banco ya muestra un débito por el mismo monto (±0.5 %), sin importar el nombre:
 *       si el nombre coincide → «ya está pago el día X»; si no → posible pago a otra persona (caso Corpelda) → «asignar este pago».
 *  R4 · Montos parecidos (±0.5 %) entre beneficiarios distintos del mismo mes.
 *  R5 · Fuera de lo normal: el monto pasa 1.5 veces el promedio de ese suplidor en el historial.
 *  R6 · Misma cuenta bancaria de destino para beneficiarios distintos.
 *  R7 · Señales de complicidad: el beneficiario o su cuenta coinciden con un empleado de la torre o un miembro de la Junta.
 *
 * Uso: StiliVigia.revisar(c, { junta: [...nombres], descartes: Set }) → { alertas, por_pago } (también modifica c).
 */
(function (raiz) {
  'use strict';
  const SUFIJOS = /\b(s\s*r\s*l|s\s*a\s*s|s\s*a|e\s*i\s*r\s*l|c\s*por\s*a|inc|ltd|ltda|sociedad|anonima|dominicana|dominicano|grupo|y\s*asociados)\b/g;
  /** Nombre comparable: sin tildes, sin signos ni sufijos de empresa. «Ferretería Ochoa, S.R.L.» → «ferreteria ochoa». */
  function normNombre(t) {
    return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/\./g, '').replace(/[^a-z0-9ñ ]/g, ' ').replace(SUFIJOS, ' ').replace(/\s+/g, ' ').trim();
  }
  const digitos = t => String(t || '').replace(/\D/g, '');
  const PALABRAS_VACIAS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'pago', 'transf', 'transferencia', 'a', 'al', 'cta', 'ref', 'trf', 'chq', 'cheque', 'deb', 'debito', 'pg', 'para']);
  const palabras = t => normNombre(t).split(' ').filter(w => w.length > 2 && !PALABRAS_VACIAS.has(w));
  /** ¿El texto del banco nombra a este beneficiario? Basta con que aparezcan sus palabras importantes (o la mayoría). */
  function nombraA(texto, nombre) {
    const t = ' ' + normNombre(texto) + ' ', ps = palabras(nombre);
    if (!ps.length) return false;
    const hay = ps.filter(w => t.indexOf(' ' + w + ' ') >= 0).length;
    return hay === ps.length || (ps.length >= 3 && hay >= ps.length - 1);
  }
  /** Mismo beneficiario: mismo RNC/cédula, o mismo nombre normalizado, o un nombre contiene al otro (2+ palabras). */
  function mismoBenef(a, b) {
    const ra = digitos(a.rnc || a.documento), rb = digitos(b.rnc || b.documento);
    if (ra.length >= 9 && rb.length >= 9) return ra === rb;
    const na = normNombre(a.suplidor), nb = normNombre(b.suplidor);
    if (!na || !nb) return false;
    if (na === nb) return true;
    const [c, l] = na.length < nb.length ? [na, nb] : [nb, na];
    return c.split(' ').length >= 2 && (' ' + l + ' ').indexOf(' ' + c + ' ') >= 0;
  }
  /** Fecha de «dd/mm/aaaa», «aaaa-mm-dd» o «aaaa-mm» → Date (mediodía para evitar saltos de zona). */
  function fecha(v) {
    const s = String(v || '');
    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return new Date(+m[3], +m[2] - 1, +m[1], 12);
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return new Date(+m[1], +m[2] - 1, +m[3], 12);
    m = s.match(/^(\d{4})-(\d{2})$/); if (m) return new Date(+m[1], +m[2] - 1, 15, 12);
    return null;
  }
  const dias = (a, b) => Math.abs(a - b) / 864e5;
  const cerca = (a, b, tol) => a > 0 && b > 0 && Math.abs(a - b) <= Math.max(1, tol * Math.max(a, b));
  const fechaTexto = d => d ? String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear() : '';
  const dinero = n => 'RD$ ' + Number(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fechaPago = p => fecha(p.factura_fecha) || fecha(p.pagado_en) || fecha(p.periodo);
  const clave = (regla, ...ids) => regla + ':' + ids.join('|');

  function revisar(c, opciones) {
    const op = opciones || {}, descartes = op.descartes || new Set();
    // Se puede correr varias veces: primero se quitan las alertas que dejó la vuelta anterior
    (c.partidas || []).forEach(p => { if (p.alertas) p.alertas = p.alertas.filter(x => !x.vigia); });
    const vivas = (c.partidas || []).filter(p => p.estado !== 'anulada');
    const porRevisar = vivas.filter(p => ['pendiente', 'aprobada'].indexOf(p.estado) >= 0 && p.origen !== 'nomina');
    const empleados = vivas.filter(p => p.origen === 'nomina' && p.suplidor && !/seguridad social|tss|infotep/i.test(p.suplidor + ' ' + p.categoria));
    const junta = (op.junta || []).filter(Boolean);
    const movs = ((c.banco && c.banco.movimientos) || []).map((b, i) => Object.assign({ _i: i, _f: fecha(b.fecha) }, b));
    const usadas = new Set((c.confirmacion || []).filter(x => x.banco && x.banco.referencia).map(x => x.banco.referencia));
    const salida = [], porPago = {};
    const nombreDe = p => p.suplidor || '(sin nombre)';
    function alertar(p, a) {
      if (descartes.has(a.clave)) return;
      p.alertas = p.alertas || [];
      // No repetir lo que ya avisó el servicio (misma referencia del banco o mismo NCF)
      if (a.ref && p.alertas.some(x => String(x.texto || '').indexOf(a.ref) >= 0)) return;
      if (p.alertas.some(x => x.clave === a.clave)) return;
      a.vigia = true; p.alertas.push(a);
      (porPago[p.id] = porPago[p.id] || []).push(a);
      salida.push(Object.assign({ pago: p.id, suplidor: nombreDe(p), monto: p.monto }, a));
    }

    porRevisar.forEach(p => {
      const fp = fechaPago(p);
      // R1 · mismo NCF del mismo suplidor
      if (p.ncf) vivas.filter(q => q.id !== p.id && q.ncf && q.ncf.toUpperCase() === p.ncf.toUpperCase() && mismoBenef(p, q) && q.factura_id !== p.id && p.factura_id !== q.id && !(p.factura_id && p.factura_id === q.factura_id))
        .forEach(q => alertar(p, { clave: clave('R1', [p.id, q.id].sort().join('-')), regla: 'R1', nivel: 'rojo', ref: p.ncf,
          texto: 'Factura repetida: el NCF ' + p.ncf + ' de ' + nombreDe(p) + ' ya está en otro pago (' + dinero(q.monto) + ', ' + (c.estados && c.estados[q.estado] || q.estado) + ').' }));
      // R2 · mismo beneficiario y monto en 45 días (sin NCF igual: eso ya es R1)
      vivas.filter(q => q.id !== p.id && mismoBenef(p, q) && cerca(p.monto, q.monto, 0.01) && !(p.ncf && q.ncf && p.ncf.toUpperCase() === q.ncf.toUpperCase())
        && !(p.factura_id && p.factura_id === q.factura_id) && p.recurrente_id === '' && !q.recurrente_id)
        .forEach(q => { const fq = fechaPago(q); if (fp && fq && dias(fp, fq) > 45) return;
          alertar(p, { clave: clave('R2', [p.id, q.id].sort().join('-')), regla: 'R2', nivel: 'ambar',
            texto: 'Mismo beneficiario y casi el mismo monto que otro pago' + (fq ? ' del ' + fechaTexto(fq) : '') + ' (' + dinero(q.monto) + '). ¿Es la misma factura?' }); });
      // R3 · el banco ya tiene un débito por ese monto
      movs.filter(b => !usadas.has(b.referencia) && cerca(p.monto, b.monto, 0.005) && (!fp || !b._f || (b._f - fp) / 864e5 >= -7)).forEach(b => {
        const ref = b.referencia || b.descripcion;
        if (nombraA(b.descripcion, nombreDe(p))) alertar(p, { clave: clave('R3', p.id, ref), regla: 'R3', nivel: 'rojo', ref: b.referencia,
          texto: 'Ya está pago el día ' + (b._f ? fechaTexto(b._f) : b.fecha) + ': el banco muestra ' + dinero(b.monto) + ' (' + b.descripcion + (b.referencia ? ' · ref. ' + b.referencia : '') + ').' });
        else alertar(p, { clave: clave('R3', p.id, ref), regla: 'R3b', tipo: 'vigia_banco', nivel: 'rojo', ref: b.referencia, movimiento: { fecha: b.fecha, referencia: b.referencia, descripcion: b.descripcion, monto: b.monto, cuenta: b.cuenta || '' },
          texto: 'Posible pago a otra persona: el ' + (b._f ? fechaTexto(b._f) : b.fecha) + ' salió del banco ' + dinero(b.monto) + ' a «' + b.descripcion + '»' + (b.referencia ? ' (ref. ' + b.referencia + ')' : '') +
            ', el mismo monto de esta factura de ' + nombreDe(p) + '. Si ese pago es de esta factura, asígnelo para que no se pague dos veces.' });
      });
      // R4 · montos parecidos entre beneficiarios distintos del mismo mes
      vivas.filter(q => q.id !== p.id && q.origen !== 'nomina' && !mismoBenef(p, q) && q.periodo === p.periodo && cerca(p.monto, q.monto, 0.005) && p.monto >= 1000)
        .forEach(q => alertar(p, { clave: clave('R4', [p.id, q.id].sort().join('-')), regla: 'R4', nivel: 'azul',
          texto: 'Monto parecido al de ' + nombreDe(q) + ' (' + dinero(q.monto) + ') en el mismo mes. Confirme que son facturas distintas.' }));
      // R5 · fuera de lo normal para ese suplidor
      const h = ((c.historial && c.historial.suplidores) || []).find(s => mismoBenef(p, { suplidor: s.suplidor }));
      if (h) {
        const vals = Object.keys(h.meses || {}).filter(m => m !== p.periodo).map(m => Number(h.meses[m]) || 0).filter(v => v > 0);
        const prom = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
        if (prom > 0 && p.monto > prom * 1.5 && p.monto - prom > 2000) alertar(p, { clave: clave('R5', p.id), regla: 'R5', nivel: 'ambar',
          texto: 'Fuera de lo normal: ' + dinero(p.monto) + ' es ' + (p.monto / prom).toFixed(1).replace('.0', '') + ' veces lo que se le paga en promedio a ' + nombreDe(p) + ' (' + dinero(prom) + ').' });
      }
      // R6 · misma cuenta de destino para beneficiarios distintos (un solo aviso por pago); R7 si la cuenta es de un empleado
      const cta = digitos(p.cuenta_destino);
      if (cta.length >= 6) {
        const otros = vivas.filter(q => q.id !== p.id && digitos(q.cuenta_destino) === cta && !mismoBenef(p, q));
        const emp = otros.find(q => empleados.indexOf(q) >= 0), sup = otros.filter(q => empleados.indexOf(q) < 0 && q.origen !== 'nomina');
        const nombres = l => { const u = []; l.forEach(q => { if (!u.some(n => mismoBenef({ suplidor: n }, q))) u.push(nombreDe(q)); }); return u; };
        if (emp) alertar(p, { clave: clave('R7c', p.id, emp.id), regla: 'R7', nivel: 'rojo',
          texto: 'Señal de complicidad: la cuenta de destino de ' + nombreDe(p) + ' (·' + cta.slice(-4) + ') es la misma donde se le paga la nómina a ' + nombreDe(emp) + '.' });
        if (sup.length) { const n = nombres(sup);
          alertar(p, { clave: clave('R6', p.id, cta), regla: 'R6', nivel: 'rojo',
            texto: 'La cuenta de destino (·' + cta.slice(-4) + ') es la misma de ' + (n.length > 2 ? n.slice(0, 2).join(', ') + ' y ' + (n.length - 2) + ' más' : n.join(' y ')) + '. Dos beneficiarios distintos no deberían cobrar en la misma cuenta.' }); }
      }
      // R7 · beneficiario con nombre de un empleado de la torre o de un miembro de la Junta
      const nb = normNombre(p.suplidor);
      if (nb && nb.split(' ').length >= 2) {
        const emp = empleados.find(e => nombraA(p.suplidor, e.suplidor) || nombraA(e.suplidor, p.suplidor));
        if (emp) alertar(p, { clave: clave('R7e', p.id, emp.id), regla: 'R7', nivel: 'rojo', texto: 'Señal de complicidad: el beneficiario coincide con ' + nombreDe(emp) + ', empleado de la torre.' });
        const j = junta.find(n => nombraA(p.suplidor, n) || nombraA(n, p.suplidor));
        if (j) alertar(p, { clave: clave('R7j', p.id, j), regla: 'R7', nivel: 'ambar', texto: 'El beneficiario coincide con ' + j + ', de la Junta Directiva. Confirme que el pago está autorizado.' });
      }
    });
    const rojas = salida.filter(a => a.nivel === 'rojo').length;
    c.vigia = { alertas: salida, rojas, revisados: porRevisar.length, reglas: REGLAS };
    if (rojas && c.alertas) c.alertas = c.alertas.filter(a => !a.vigia).concat([{ nivel: 'rojo', vigia: true, texto: 'Vigía de pagos: ' + rojas + ' alerta' + (rojas === 1 ? '' : 's') + ' roja' + (rojas === 1 ? '' : 's') + '. Revíselas antes de aprobar.' }]);
    return { alertas: salida, por_pago: porPago };
  }
  const REGLAS = [['R1', 'Misma factura (NCF) dos veces'], ['R2', 'Mismo beneficiario y monto en 45 días'], ['R3', 'El banco ya tiene ese pago (aunque sea a otro nombre)'],
    ['R4', 'Montos parecidos entre beneficiarios'], ['R5', 'Fuera de lo normal para el suplidor'], ['R6', 'Misma cuenta para beneficiarios distintos'], ['R7', 'Coincide con un empleado o con la Junta']];
  const api = { revisar, normNombre, mismoBenef, nombraA, fecha, REGLAS };
  if (typeof module === 'object' && module.exports) module.exports = api; else raiz.StiliVigia = api;
})(typeof window !== 'undefined' ? window : this);
