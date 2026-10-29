/**
 * Stili Soft v3.3 · Buzón de facturas.
 * Una carpeta de Google Drive con una subcarpeta por torre. Se ve en la PC con «Google Drive para escritorio».
 * Cada 10 minutos, aunque sea de noche y aunque la PC esté apagada, el servicio:
 *   1. toma cada factura (PDF o foto) que haya en las subcarpetas;
 *   2. la lee con IA y la registra en Cuentas por Pagar («por relacionar»), con su imagen guardada para consulta;
 *   3. la valida: NCF en la DGII, RNC y estado del suplidor, RNC y nombre del condominio, ITBIS separado y bien calculado, vencimiento de la secuencia;
 *   4. busca duplicados: el mismo archivo, el mismo NCF del mismo RNC (en cualquier torre), el mismo monto del mismo suplidor en fechas cercanas, y la IA compara la factura con las parecidas;
 *   5. mueve el archivo a la carpeta de la torre en «Finanzas Stili» (queda en la nube y sale de la carpeta de la PC).
 * Nada detiene el registro: cada problema queda como alerta en el pago, y se puede continuar a pesar de la alerta.
 * Si la factura no trae el nombre del suplidor, se busca en la DGII por el RNC; si no aparece, queda la alerta roja para escribirlo a mano.
 *
 * Archivo nuevo del servicio; se registra solo. Usa de Código.gs: accionCxpFactura_, cotejarTorre_, carpetaFinanzas_, claude_, leer_, agregar_, actualizar_.
 *
 * Base legal (verificada en los textos oficiales de la DGII el 28-oct-2026):
 *  - Norma General 06-2018, art. 7: el comprobante lleva RNC y razón social del emisor, fecha, número de comprobante, fecha de vencimiento de la secuencia
 *    (comprobantes con valor fiscal) y RNC y razón social del cliente.
 *  - Decreto 254-06, art. 8.3.a: el ITBIS se consigna separado. Art. 9.1.a: la factura de crédito fiscal lleva nombre y RNC del adquirente.
 *  - Guía Informativa NCF de la DGII: NCF de 11 caracteres (B + tipo de 2 dígitos + 8 de secuencia); B02 (consumo) no sustenta crédito de ITBIS ni gasto de ISR;
 *    la secuencia vence el 31 de diciembre del año siguiente a su autorización (no aplica a consumo ni notas de crédito).
 *  - ITBIS (DGII, revista ITBIS): tasa general 18 %, reducida 16 % para algunos alimentos; exentos, entre otros, electricidad, agua, recogida de basura,
 *    servicios financieros y seguros, salud, educación, alquiler de vivienda (Código Tributario arts. 343 y 344).
 *  - Consulta pública de NCF y e-NCF de la DGII (sin captcha): RNC del emisor y NCF; para e-NCF además RNC del comprador y código de seguridad.
 */

const BUZON_TABLAS = {
  Buzon_Registro: ['id', 'fecha', 'torre', 'archivo', 'drive_id', 'hash', 'estado', 'partidas', 'alertas', 'detalle', 'periodo', 'url', 'fa_id', 'intentos', 'actualizado_en'],
  CxP_Fiscal: ['partida_id', 'torre', 'archivo_id', 'tipo_ncf', 'ncf', 'rnc_emisor', 'emisor_dgii', 'estado_emisor', 'comprador_rnc', 'comprador_nombre', 'codigo_seguridad',
    'fecha_factura', 'vence_ncf', 'gravado', 'exento', 'itbis', 'total', 'dgii_ncf', 'dgii_detalle', 'duplicado_ia', 'alertas', 'validado_en'],
};
Object.keys(BUZON_TABLAS).forEach(k => { HOJAS[k] = BUZON_TABLAS[k]; });
['detalle', 'alertas', 'dgii_detalle'].forEach(k => { LARGO_COLUMNA[k] = Math.max(LARGO_COLUMNA[k] || 0, 6000); });

const BUZON_ADMIN = { nombre: 'Buzón de facturas', gerente: false, segmento: 'contabilidad', permisos: { tor_finanzas: 3 }, torres: null };
const BUZON_MINUTOS = 10, BUZON_TIEMPO_MS = 3 * 60 * 1000, BUZON_ESPERA_MS = 2 * 60 * 1000;   // no empieza otra factura después de 3 minutos (cada una puede tardar más de 1)
const BUZON_MIME = /^(application\/pdf|image\/(jpeg|png|webp))$/;
const DGII_NCF_URL = 'https://dgii.gov.do/app/WebApps/ConsultasWeb2/ConsultasWeb/consultas/ncf.aspx';
const DGII_RNC_URL = 'https://dgii.gov.do/app/WebApps/ConsultasWeb2/ConsultasWeb/consultas/rnc.aspx';

// ================================================================== reglas fiscales (funciones puras, se prueban en node)
const Fiscal = (() => {
  const TIPOS = { '01': 'Factura de crédito fiscal', '02': 'Factura de consumo', '03': 'Nota de débito', '04': 'Nota de crédito', '11': 'Comprobante de compras', '12': 'Registro único de ingresos',
    '13': 'Gastos menores', '14': 'Regímenes especiales', '15': 'Gubernamental', '16': 'Exportaciones', '17': 'Pagos al exterior',
    '31': 'e-CF de crédito fiscal', '32': 'e-CF de consumo', '33': 'e-CF nota de débito', '34': 'e-CF nota de crédito', '41': 'e-CF de compras', '43': 'e-CF gastos menores', '44': 'e-CF regímenes especiales', '45': 'e-CF gubernamental', '46': 'e-CF exportaciones', '47': 'e-CF pagos al exterior' };
  const sinT = v => String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const soloDig = v => String(v == null ? '' : v).replace(/\D/g, '');
  const n = v => { const x = Number(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(x) ? Math.round(x * 100) / 100 : 0; };
  /** Fecha a 'aaaa-mm-dd' (acepta Date, aaaa-mm-dd y dd/mm/aaaa). Vacío si no se entiende. */
  function fechaISO(v) {
    if (v instanceof Date || (v && typeof v.getFullYear === 'function')) return isNaN(v.getTime()) ? '' : v.getFullYear() + '-' + String(v.getMonth() + 1).padStart(2, '0') + '-' + String(v.getDate()).padStart(2, '0');
    const t = String(v == null ? '' : v).trim();
    let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
    m = t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/); if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
    return '';
  }
  /** Estructura del NCF: B + 2 dígitos de tipo + 8 de secuencia (11), o E + 2 + 10 (13, e-CF). */
  function ncf(v) {
    const t = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!t) return { valido: false, vacio: true };
    const m = t.match(/^([BE])(\d{2})(\d+)$/);
    if (!m) return { valido: false, texto: t };
    const largo = m[1] === 'B' ? 8 : 10, ok = m[3].length === largo && !!TIPOS[m[2]] && (m[1] === 'E') === (Number(m[2]) >= 31);
    return { valido: ok, texto: t, serie: m[1], tipo: m[2], nombre: TIPOS[m[2]] || 'Tipo desconocido', electronico: m[1] === 'E' };
  }
  /** RNC (9 dígitos) o cédula (11) con su dígito verificador. */
  function rncValido(v) {
    const d = soloDig(v);
    if (d.length === 9) { const w = [7, 9, 8, 6, 5, 4, 3, 2]; let s = 0; for (let i = 0; i < 8; i++) s += Number(d[i]) * w[i]; const r = s % 11; const dv = r === 0 ? 2 : r === 1 ? 1 : 11 - r; return dv === Number(d[8]); }
    if (d.length === 11) { let s = 0; for (let i = 0; i < 10; i++) { let x = Number(d[i]) * (i % 2 ? 2 : 1); if (x > 9) x -= 9; s += x; } return (10 - (s % 10)) % 10 === Number(d[10]); }
    return false;
  }
  const parecido = (a, b) => {
    const A = sinT(a).replace(/\b(condominio|residencial|torre|edificio|de|del|la|las|los|el|srl|s r l|sa|inc)\b/g, ' ').split(' ').filter(w => w.length > 2);
    const Bs = new Set(sinT(b).replace(/\b(condominio|residencial|torre|edificio|de|del|la|las|los|el|srl|s r l|sa|inc)\b/g, ' ').split(' ').filter(w => w.length > 2));
    return A.length && A.some(w => Bs.has(w));
  };
  /**
   * Alertas fiscales de una factura. Ninguna detiene el registro.
   * f = lo que leyó la IA { suplidor, rnc, ncf, tipo, fecha_factura, vence_ncf, gravado, exento, itbis, total, comprador_rnc, comprador_nombre, codigo_seguridad, servicio }
   * torre = { nombre, razon_social, rnc } · dg = { ncf: {estado, detalle}, rnc: {estado, nombre, situacion} } (consultas a la DGII)
   */
  function alertas(f, torre, dg) {
    const al = [], add = (nivel, texto, codigo) => al.push({ tipo: 'fiscal', nivel, texto, codigo });
    const N = ncf(f.ncf), D = dg || {}, fFac = fechaISO(f.fecha_factura), fVen = fechaISO(f.vence_ncf);
    // 1 · el suplidor
    if (!String(f.suplidor || '').trim()) add('rojo', 'La factura no trae el nombre del suplidor. Escríbalo en el pago (Editar).', 'sin_nombre');
    if (!soloDig(f.rnc)) add('ambar', 'La factura no trae el RNC o la cédula del suplidor.', 'sin_rnc');
    else if (!rncValido(f.rnc)) add('ambar', 'El RNC o la cédula del suplidor (' + soloDig(f.rnc) + ') no pasa el dígito verificador: revise si la IA lo leyó bien.', 'rnc_digito');
    if (D.rnc && D.rnc.estado === 'no_existe') add('rojo', 'El RNC ' + soloDig(f.rnc) + ' no aparece en la DGII.', 'rnc_no_existe');
    if (D.rnc && D.rnc.situacion && !/^\s*activo\s*$/i.test(D.rnc.situacion)) add('rojo', 'En la DGII el suplidor figura como «' + D.rnc.situacion + '».', 'rnc_inactivo');
    // 2 · el comprobante
    if (N.vacio) add('ambar', 'Sin NCF: no sirve como sustento fiscal. Si el suplidor no está registrado, Stili debe emitir un Comprobante de Compras (B11).', 'sin_ncf');
    else if (!N.valido) add('rojo', 'El NCF «' + N.texto + '» no tiene la forma correcta (B + tipo + 8 dígitos, o E + tipo + 10).', 'ncf_forma');
    else {
      if (N.tipo === '02' || N.tipo === '32') add('ambar', 'Factura de consumo (' + N.texto + '): no sustenta crédito de ITBIS ni gasto para el ISR. Pida factura de crédito fiscal.', 'ncf_consumo');
      if (D.ncf && D.ncf.estado === 'no_valido') add('rojo', 'La DGII dice que el NCF ' + N.texto + ' no es válido para el RNC ' + soloDig(f.rnc) + (D.ncf.detalle ? ': ' + String(D.ncf.detalle).replace(/\.+$/, '') : '') + '.', 'ncf_dgii');
      if (D.ncf && D.ncf.estado === 'sin_verificar') add('azul', 'No se pudo consultar el NCF en la DGII en este momento' + (D.ncf.detalle ? ' (' + D.ncf.detalle + ')' : '') + '. Se reintenta solo.', 'ncf_pendiente');
      if (D.ncf && D.ncf.estado === 'valido') add('verde', 'NCF ' + N.texto + ' válido en la DGII.', 'ncf_ok');
      // vencimiento de la secuencia (no aplica a consumo ni notas de crédito)
      if (!N.electronico && ['02', '04'].indexOf(N.tipo) < 0) {
        if (!fVen) add('ambar', 'La factura no muestra la fecha de vencimiento de la secuencia del NCF (Norma 06-2018, art. 7).', 'sin_vence');
        else if (fFac && fVen < fFac) add('rojo', 'La secuencia del NCF venció el ' + fVen + ', antes de la fecha de la factura (' + fFac + ').', 'ncf_vencido');
      }
      if (N.electronico && !f.codigo_seguridad) add('azul', 'e-CF sin código de seguridad legible: la consulta en la DGII puede no confirmarse.', 'sin_codigo');
    }
    // 3 · el condominio (adquirente)
    const credito = N.valido && ['01', '31', '03', '33', '04', '34'].indexOf(N.tipo) >= 0;
    const rT = soloDig(torre && torre.rnc), rC = soloDig(f.comprador_rnc);
    if (credito) {
      if (!rC) add('rojo', 'La factura de crédito fiscal no trae el RNC del condominio (Decreto 254-06, art. 9).', 'sin_rnc_torre');
      else if (rT && rC !== rT) add('rojo', 'El RNC del cliente en la factura (' + rC + ') no es el de ' + torre.nombre + ' (' + rT + ').', 'rnc_torre');
      else if (!rT) add('azul', 'Falta el RNC de ' + (torre && torre.nombre || 'la torre') + ' en la ficha: no se pudo comparar.', 'torre_sin_rnc');
    }
    const nomC = String(f.comprador_nombre || '').trim();
    if (!nomC) add(credito ? 'ambar' : 'azul', 'La factura no menciona el nombre del condominio.', 'sin_nombre_torre');
    else if (torre && !parecido(nomC, torre.razon_social || torre.nombre) && !parecido(nomC, torre.nombre)) add('ambar', 'La factura está a nombre de «' + nomC + '», que no parece ser ' + (torre.razon_social || torre.nombre) + '.', 'nombre_torre');
    // 4 · montos e ITBIS (separado y bien calculado)
    const g = n(f.gravado), e = n(f.exento), i = n(f.itbis), t = n(f.total);
    if (t > 0 && Math.abs(Math.round((g + e + i) * 100) - Math.round(t * 100)) > Math.max(100, Math.round(t))) add('ambar', 'Los montos no cuadran: gravado ' + g + ' + exento ' + e + ' + ITBIS ' + i + ' ≠ total ' + t + '.', 'montos');
    if (i > 0) {
      if (!g) add('ambar', 'La factura trae ITBIS pero no muestra la base gravada por separado (Decreto 254-06, art. 8).', 'itbis_base');
      else {
        const tasa = i / g, ok18 = Math.abs(i - g * 0.18) <= Math.max(1, g * 0.0025), ok16 = Math.abs(i - g * 0.16) <= Math.max(1, g * 0.0025);
        if (!ok18 && !ok16) add('rojo', 'El ITBIS (' + i + ') no es el 18 % ni el 16 % de la base gravada (' + g + '): es ' + Math.round(tasa * 1000) / 10 + ' %.', 'itbis_calculo');
      }
    } else if (t > 0 && N.valido && credito) {
      const exentoProbable = /electric|energia|edesur|edenorte|edeeste|agua|caasd|coraasan|basura|residuo|seguro|aseguradora|banco|bancari|medic|salud|clinic|educa|colegio|alquiler|transporte/.test(sinT((f.suplidor || '') + ' ' + (f.servicio || '')));
      add(exentoProbable ? 'azul' : 'ambar', exentoProbable ? 'Sin ITBIS: parece un servicio exento (luz, agua, basura, seguros… están exentos). Confírmelo.' : 'La factura de crédito fiscal no tiene ITBIS: confirme que el bien o servicio es exento.', 'sin_itbis');
    }
    return al;
  }
  /** Posibles duplicados por datos (antes de preguntarle a la IA). */
  function candidatos(f, otras) {
    const N = ncf(f.ncf), r = soloDig(f.rnc), t = n(f.total), clave = sinT(f.suplidor);
    return (otras || []).filter(o => o && o.estado !== 'anulada').map(o => {
      const mismoNcf = N.texto && String(o.ncf || '').toUpperCase().replace(/[^A-Z0-9]/g, '') === N.texto;
      const mismoRnc = r && soloDig(o.rnc) === r, mismoNombre = clave && sinT(o.suplidor) && (sinT(o.suplidor) === clave || parecido(o.suplidor, f.suplidor));
      const mismoMonto = t > 0 && Math.abs(n(o.monto) - t) <= Math.max(1, t * 0.005);
      const a = fechaISO(f.fecha_factura), b = fechaISO(o.factura_fecha), dias = a && b ? Math.abs((Date.parse(a) - Date.parse(b)) / 864e5) : 999;
      let nivel = '';
      if (mismoNcf && (mismoRnc || mismoNombre)) nivel = 'rojo';
      else if ((mismoRnc || mismoNombre) && mismoMonto && dias <= 7) nivel = 'ambar';
      else if ((mismoRnc || mismoNombre) && mismoMonto && dias <= 45) nivel = 'azul';
      return nivel ? { id: o.id, torre: o.torre, nivel, ncf: o.ncf, suplidor: o.suplidor, monto: o.monto, fecha: o.factura_fecha, periodo: o.periodo, concepto: o.concepto, mismoNcf } : null;
    }).filter(Boolean).sort((a, b) => ({ rojo: 0, ambar: 1, azul: 2 }[a.nivel] - { rojo: 0, ambar: 1, azul: 2 }[b.nivel])).slice(0, 10);
  }
  /** Lee el HTML de la consulta de la DGII: pares «etiqueta: valor» de las tablas y los mensajes. */
  /** Lee el HTML de la respuesta de la DGII. `base` = HTML del formulario vacío: los textos que ya estaban (ayudas, avisos fijos) no cuentan. */
  function leerDgii(html, base) {
    const limpio = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í').replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú').replace(/&ntilde;/g, 'ñ').replace(/&#243;/g, 'ó').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    const sinScripts = h => String(h || '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
    const filasDe = h => (sinScripts(h).match(/<tr[\s\S]*?<\/tr>/gi) || []);
    const fijos = new Set(filasDe(base).map(limpio));
    const pares = {};
    filasDe(html).filter(tr => !fijos.has(limpio(tr))).forEach(tr => {
      const celdas = (tr.match(/<t[hd][^>]*>[\s\S]*?<\/t[hd]>/gi) || []).map(limpio);
      for (let k = 0; k + 1 < celdas.length; k += 2) if (celdas[k] && celdas[k].length < 60) pares[celdas[k].replace(/:$/, '')] = celdas[k + 1];
    });
    const textos = h => (sinScripts(h).match(/<(span|div|p|label|td)[^>]*>[^<]{3,300}<\/\1>/gi) || []).map(limpio).filter(Boolean);
    const antes = new Set(textos(base));
    const msgs = textos(html).filter(x => !antes.has(x) && x.length < 300);   // solo lo que apareció con la respuesta
    return { pares, mensajes: msgs, texto: limpio(sinScripts(html)) };
  }
  /** Interpreta la respuesta de la consulta de NCF. `valor` = el NCF consultado: sin él en la respuesta no se da por válido. */
  function estadoNcf(r, valor) {
    const msgs = sinT(r.mensajes.join(' | '));
    if (/no es valido|no valido|no existe|no se encontr|no corresponde|no ha sido autorizad|invalido|anulad|rechazad/.test(msgs)) return { estado: 'no_valido', detalle: (r.mensajes.find(m => /v[aá]lido|existe|encontr|corresponde|autoriz|anulad|rechaz/i.test(m)) || '').slice(0, 160) };
    const est = Object.keys(r.pares).find(k => /^(estado|estatus|vigencia)$/.test(sinT(k)));
    if (est) {
      const v = sinT(r.pares[est]);
      if (/no vigente|vencid|inactiv|anulad|rechazad|no valido/.test(v)) return { estado: 'no_valido', detalle: (est + ': ' + r.pares[est]).slice(0, 160) };
      if (/^(vigente|valido|aceptado|activo)$/.test(v) && (!valor || sinT(r.texto).indexOf(sinT(valor)) >= 0)) return { estado: 'valido', detalle: (est + ': ' + r.pares[est]).slice(0, 160) };
    }
    return { estado: 'sin_verificar', detalle: 'respuesta de la DGII sin datos reconocibles' };
  }
  /** Interpreta la consulta de RNC. Solo da un resultado si la respuesta trae el RNC consultado (o un mensaje nuevo de «no encontrado»). */
  function estadoRnc(r, valor) {
    const msgs = sinT(r.mensajes.join(' | '));
    if (/no se encontr|no existe|no esta registrado|no registrado/.test(msgs) && !Object.keys(r.pares).length) return { estado: 'no_existe' };
    const k = nom => Object.keys(r.pares).find(x => nom.test(sinT(x)));
    const kn = k(/razon social|^nombre/), ke = k(/^estado$/);
    const trae = !valor || String(r.texto).replace(/\D/g, '').indexOf(String(valor).replace(/\D/g, '')) >= 0;
    if (kn && trae) return { estado: 'ok', nombre: r.pares[kn], situacion: ke ? r.pares[ke] : '' };
    return { estado: 'sin_verificar' };
  }
  return { TIPOS, ncf, rncValido, alertas, candidatos, leerDgii, estadoNcf, estadoRnc, parecido, sinT, fechaISO };
})();

// ================================================================== consultas a la DGII (página pública, sin captcha)
/** Llena y envía el formulario de la DGII. `campos` = { patrónDelNombre: valor }. Devuelve el HTML de la respuesta o lanza un error. */
function dgiiConsultar_(url, campos, botonRe) {
  const r1 = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true, headers: { 'User-Agent': 'Mozilla/5.0 (Stili Soft; consulta de comprobantes propios)' } });
  if (r1.getResponseCode() !== 200) throw new Error('DGII respondió ' + r1.getResponseCode());
  const html = r1.getContentText();
  const cookies = [].concat((r1.getAllHeaders() || {})['Set-Cookie'] || []).map(c => String(c).split(';')[0]).join('; ');
  const cuerpo = {}; let boton = false;
  (html.match(/<input[^>]+>/gi) || []).forEach(tag => {
    const nom = (tag.match(/name="([^"]+)"/) || [])[1], tipo = ((tag.match(/type="([^"]+)"/) || [])[1] || 'text').toLowerCase(), val = (tag.match(/value="([^"]*)"/) || [])[1] || '';
    if (!nom) return;
    if (tipo === 'hidden') cuerpo[nom] = val.replace(/&#43;/g, '+').replace(/&#47;/g, '/').replace(/&amp;/g, '&');
    else if (tipo === 'text') { const k = Object.keys(campos).find(p => new RegExp(p, 'i').test(nom)); cuerpo[nom] = k ? campos[k] : ''; }
    else if (tipo === 'submit' && !boton && (!botonRe || botonRe.test(nom))) { cuerpo[nom] = val || 'Buscar'; boton = true; }   // el botón de esa consulta
  });
  if (!boton) throw new Error('la página de la DGII cambió (no encuentro el botón de consulta)');
  const r2 = UrlFetchApp.fetch(url, { method: 'post', payload: cuerpo, muteHttpExceptions: true, followRedirects: true, headers: Object.assign({ 'User-Agent': 'Mozilla/5.0 (Stili Soft; consulta de comprobantes propios)' }, cookies ? { Cookie: cookies } : {}) });
  if (r2.getResponseCode() !== 200) throw new Error('DGII respondió ' + r2.getResponseCode());
  return { html: r2.getContentText(), base: html };
}
/** Consulta un NCF (o e-NCF) en la DGII. Guarda la respuesta 12 horas para no repetir la consulta. */
function dgiiNcf_(rncEmisor, ncf, rncComprador, codigoSeg) {
  const N = Fiscal.ncf(ncf), rnc = s_(rncEmisor).replace(/\D/g, '');
  if (!N.valido || !rnc) return null;
  const cache = CacheService.getScriptCache(), k = 'dgii|ncf|' + rnc + '|' + N.texto;
  const hit = cache.get(k); if (hit) return JSON.parse(hit);
  let out;
  try {
    const campos = { 'txtRNC$': rnc, 'txtNCF': N.texto };
    if (N.electronico) { campos.txtRncComprador = s_(rncComprador).replace(/\D/g, ''); campos.txtCodigoSeg = s_(codigoSeg); }
    const r = dgiiConsultar_(DGII_NCF_URL, campos, /btnConsultar/i);
    out = Fiscal.estadoNcf(Fiscal.leerDgii(r.html, r.base), N.texto);
  } catch (e) { out = { estado: 'sin_verificar', detalle: s_(e.message).slice(0, 120) }; }
  if (out.estado !== 'sin_verificar') cache.put(k, JSON.stringify(out), 12 * 3600);
  return out;
}
/** Consulta un RNC o cédula en la DGII: nombre y estado del contribuyente. */
function dgiiRnc_(rnc) {
  const d = s_(rnc).replace(/\D/g, '');
  if (d.length !== 9 && d.length !== 11) return null;
  const cache = CacheService.getScriptCache(), k = 'dgii|rnc|' + d;
  const hit = cache.get(k); if (hit) return JSON.parse(hit);
  let out;
  try { const r = dgiiConsultar_(DGII_RNC_URL, { 'txtRnc|txtRNC|Cedula': d }, /^(?!.*nombre).*(rnc|buscar)/i); out = Fiscal.estadoRnc(Fiscal.leerDgii(r.html, r.base), d); }
  catch (e) { out = { estado: 'sin_verificar', detalle: s_(e.message).slice(0, 120) }; }
  if (out.estado !== 'sin_verificar') cache.put(k, JSON.stringify(out), 24 * 3600);
  return out;
}

// ================================================================== carpetas
function buzonRaiz_(crear) {
  const id = s_(config_().BUZON_CARPETA_ID);
  if (id) {
    const f = DriveApp.getFolderById(id);   // un error pasajero de Drive se lanza: nunca se reemplaza la carpeta que usa el equipo
    if (f.isTrashed && f.isTrashed()) throw new Error('La carpeta del buzón está en la papelera de Drive. Restáurela.');
    return f;
  }
  if (crear === false) return null;
  const it = DriveApp.getFoldersByName('Facturas Stili (buzón)');
  const raiz = it.hasNext() ? it.next() : DriveApp.createFolder('Facturas Stili (buzón)');
  buzonFijarConfig_('BUZON_CARPETA_ID', raiz.getId(), 'Carpeta raíz del buzón de facturas (la crea el servicio)');
  return raiz;
}
function buzonSub_(padre, nombre) { const it = padre.getFoldersByName(nombre); return it.hasNext() ? it.next() : padre.createFolder(nombre); }
function buzonFijarConfig_(clave, valor, desc) {
  const f = leer_('Config').filas.find(r => s_(r.clave) === clave);
  if (f) actualizar_('Config', f._fila, { valor: valor }); else agregar_('Config', { clave: clave, valor: valor, descripcion: desc || '' });
  if (typeof olvidar_ === 'function') olvidar_('Config');
}
/** Una subcarpeta por torre activa (las torres nuevas aparecen solas) y la carpeta de lo que no se pudo leer. */
function buzonCarpetas_() {
  const raiz = buzonRaiz_(), torres = torresActivas_().map(t => t.torre);
  const cache = CacheService.getScriptCache();
  if (!cache.get('buzon|carpetas|' + torres.length)) { torres.forEach(t => buzonSub_(raiz, t)); buzonSub_(raiz, '_Revisar (no se pudo leer)'); cache.put('buzon|carpetas|' + torres.length, '1', 3600); }
  return { raiz: raiz, torres: torres };
}
function buzonFicha_(torre) {
  const f = {}; (typeof leerSiExiste_ === 'function' ? leerSiExiste_('Torres_Ficha') : []).filter(r => igualTorre_(r.torre, torre) && s_(r.seccion) === 'general').forEach(r => { f[s_(r.campo)] = s_(r.valor); });
  return { nombre: torre, razon_social: f.razon_social || '', rnc: (f.rnc || '').replace(/\D/g, '') };
}

// ================================================================== lectura fiscal con IA
const BUZON_FORMATO = [
  'Lea los datos fiscales de esta factura de la República Dominicana (si hay varias, una entrada por factura). Responda SOLO con un bloque ```json:',
  '{"facturas":[{"suplidor":"razón social del emisor o vacío si no aparece","rnc":"RNC o cédula del emisor","ncf":"NCF o e-NCF","fecha_factura":"AAAA-MM-DD",',
  '"vence_ncf":"AAAA-MM-DD (fecha de vencimiento de la secuencia, si aparece)","comprador_nombre":"nombre del cliente al que se factura","comprador_rnc":"RNC del cliente",',
  '"codigo_seguridad":"código de seguridad del e-CF si aparece","gravado":0,"exento":0,"itbis":0,"total":0,"servicio":"qué se factura, corto"}]}',
  'Montos sin símbolos ni comas. No invente: si un dato no aparece, déjelo vacío o en 0. «suplidor» vacío si la factura no muestra el nombre del emisor.',
].join(' ');
function buzonLeerFiscal_(f) {
  try {
    const r = claude_('Usted es un auditor fiscal dominicano. Lee comprobantes con exactitud.', bloqueArchivo_(f).concat([{ type: 'text', text: BUZON_FORMATO }]), 2000);
    const d = partirRespuesta_(r.texto).datos || {};
    return Array.isArray(d.facturas) ? d.facturas : [];
  } catch (e) { return []; }
}
/** La IA compara la factura nueva con las parecidas ya registradas y dice si es el mismo gasto. */
function buzonIaDuplicado_(f, cand) {
  if (!cand.length) return null;
  try {
    const txt = 'Factura nueva: ' + JSON.stringify({ suplidor: f.suplidor, rnc: f.rnc, ncf: f.ncf, fecha: f.fecha_factura, total: f.total, servicio: f.servicio }) +
      '\nYa registradas (posibles iguales): ' + JSON.stringify(cand.map(c => ({ id: c.id, torre: c.torre, suplidor: c.suplidor, ncf: c.ncf, fecha: c.fecha, monto: c.monto, concepto: c.concepto }))) +
      '\n¿La factura nueva es el mismo gasto que alguna ya registrada (misma factura cargada dos veces, la misma en otra torre, o una copia con otro número)? Un servicio mensual de otro mes NO es duplicado.' +
      ' Responda SOLO ```json {"duplicado":"si|no|posible","id":"id de la registrada o vacío","razon":"una frase"}```';
    const r = claude_('Usted revisa cuentas por pagar de condominios y evita pagos dobles.', [{ type: 'text', text: txt }], 400);
    const d = partirRespuesta_(r.texto).datos || {};
    const id = cand.some(c => c.id === s_(d.id)) ? s_(d.id) : '';   // la IA solo puede señalar una de las candidatas
    return ['si', 'no', 'posible'].indexOf(s_(d.duplicado)) >= 0 ? { duplicado: s_(d.duplicado), id: id, razon: s_(d.razon).slice(0, 200) } : null;
  } catch (e) { return null; }
}

// ================================================================== proceso (lo corre un activador cada 10 minutos)
// Orden seguro: (1) se anota «procesando» con la huella del archivo, (2) se registra en CxP, (3) se valida, (4) se mueve a la nube al final.
// Si Google corta la ejecución a mitad, la próxima vuelta lo ve en el registro y no lo duplica ni lo pierde.
function buzonProcesar() { return buzonProcesar_({ origen: 'automático' }); }
const sinFormula_ = v => { const t = s_(v); return /^[=+\-@]/.test(t) ? "'" + t : t; };
function buzonLeerRegistro_() { if (typeof olvidar_ === 'function') olvidar_('Buzon_Registro'); return typeof leerSiExiste_ === 'function' ? leerSiExiste_('Buzon_Registro') : leer_('Buzon_Registro').filas; }
function buzonProcesar_(op) {
  // un solo proceso a la vez (el activador y «Procesar ahora» no se pisan); el bloqueo es del usuario dueño del servicio, no frena a los demás
  const lock = LockService.getUserLock();
  if (!lock.tryLock(0)) return { ok: true, ocupado: true, aviso: 'El buzón ya se está procesando. Espere unos minutos.', hechos: [] };
  const props = PropertiesService.getScriptProperties();
  props.setProperty('BUZON_CORRIENDO', String(Date.now()));
  const ini = Date.now(), hechos = [], tocadas = {};
  try {
    const { raiz, torres } = buzonCarpetas_();
    const revisar = buzonSub_(raiz, '_Revisar (no se pudo leer)');
    buzonReconciliar_(raiz, tocadas);
    for (const torre of torres) {
      const sub = buzonSub_(raiz, torre), it = sub.getFiles();
      while (it.hasNext()) {
        if (Date.now() - ini > BUZON_TIEMPO_MS) { buzonCerrarVuelta_(tocadas); return { ok: true, hechos: hechos, pendiente: true }; }
        const file = it.next();
        if (file.isTrashed() || Date.now() - file.getLastUpdated().getTime() < BUZON_ESPERA_MS) continue;   // todavía se está copiando desde la PC
        const h = buzonUno_(torre, sub, file, revisar);
        if (h) { hechos.push(h); if (h.estado === 'registrada') tocadas[torre] = 1; }
      }
    }
    if (Date.now() - ini < BUZON_TIEMPO_MS) buzonReintentarDgii_(ini, tocadas);
    buzonCerrarVuelta_(tocadas);
    return { ok: true, hechos: hechos, pendiente: false };
  } finally { props.deleteProperty('BUZON_CORRIENDO'); props.setProperty('BUZON_ULTIMA', ahora_() + ''); lock.releaseLock(); }
}
/** Al final de la vuelta: un solo cotejo por torre (duplicados, banco y alertas fiscales). */
function buzonCerrarVuelta_(tocadas) { Object.keys(tocadas).forEach(t => { try { cotejarTorre_(t); } catch (e) { console.error('Buzón: cotejo de ' + t + ': ' + e.message); } }); }
function buzonActualizarFila_(fila, cambios) { const r = buzonLeerRegistro_().find(x => s_(x.id) === s_(fila.id)); if (r) actualizar_('Buzon_Registro', r._fila, Object.assign({ actualizado_en: ahora_() }, cambios)); Object.assign(fila, cambios); }
/**
 * Lo que quedó «procesando» porque Google cortó la ejecución: si ya está en CxP se completa (validación y archivo a la nube);
 * si no llegó a registrarse, se marca para reintentar (el archivo sigue en la carpeta de la torre, porque se mueve al final).
 */
function buzonReconciliar_(raiz, tocadas) {
  buzonLeerRegistro_().filter(r => s_(r.estado) === 'procesando' && Date.now() - new Date(s_(r.actualizado_en) || s_(r.fecha)).getTime() > 8 * 60 * 1000).forEach(r => {
    const fila = { id: s_(r.id) };
    let file = null; try { file = DriveApp.getFileById(s_(r.drive_id)); } catch (e) { file = null; }
    const partidas = s_(r.fa_id) ? leer_('CxP_Partidas').filas.filter(p => s_(p.soportes).split(',').indexOf(s_(r.fa_id)) >= 0) : [];
    if (partidas.length) {
      if (file) try { buzonArchivar_(s_(r.torre), file, s_(r.archivo), s_(r.periodo)); } catch (e) { /* se reintenta en la próxima vuelta */ }
      buzonActualizarFila_(fila, { estado: 'registrada', partidas: partidas.map(p => s_(p.id)).join(','), detalle: 'Registrada (se completó después de una interrupción). Valide los pagos en Cuentas por Pagar.', url: file ? file.getUrl() : s_(r.url) });
      tocadas[s_(r.torre)] = 1;
    } else buzonActualizarFila_(fila, { estado: 'reintentar', detalle: 'La lectura se interrumpió; se intenta de nuevo.' });
  });
}
function buzonArchivar_(torre, file, nombre, periodo) {
  const destino = buzonSub_(carpetaFinanzas_(torre), 'Facturas del buzón');
  file.moveTo(destino);
  if (file.getName().indexOf(' · Buzón · ') < 0) file.setName(periodo + ' · Buzón · ' + nombre);   // se renombra después de mover
  return destino;
}
/** Una factura. Devuelve el resultado para la pantalla, o null si se salta (p. ej. otro proceso ya la tomó). */
function buzonUno_(torre, sub, file, revisar) {
  const nombre = file.getName(), mime = file.getMimeType();
  // ¿sigue en la carpeta de la torre? (otro proceso pudo moverla)
  const padres = file.getParents(); let aqui = false; while (padres.hasNext()) if (padres.next().getId() === sub.getId()) aqui = true;
  if (!aqui) return null;
  const registro = buzonLeerRegistro_();
  const deEste = registro.filter(r => s_(r.drive_id) === file.getId());
  // ya registrado este mismo archivo y no se pudo mover: solo se mueve, no se registra otra vez
  const yaReg = deEste.find(r => s_(r.estado) === 'registrada');
  if (yaReg) { try { buzonArchivar_(torre, file, nombre, s_(yaReg.periodo)); } catch (e) { /* sigue intentando */ } return null; }
  const fallos = deEste.filter(r => s_(r.estado) === 'problema').length;
  if (fallos >= 3) return null;   // ya se intentó 3 veces y no se puede mover: queda en la pantalla para revisarlo
  const fila = { id: idNuevo_('BZ'), fecha: ahora_(), torre: torre, archivo: sinFormula_(nombre.slice(0, 150)), drive_id: file.getId(), hash: '', estado: 'procesando', partidas: '', alertas: '', detalle: '',
    periodo: Utilities.formatDate(new Date(), TZ, 'yyyy-MM'), url: file.getUrl(), fa_id: '', intentos: 1, actualizado_en: ahora_() };
  const fin = (cambios) => { buzonActualizarFila_(fila, cambios); return { id: fila.id, torre: torre, archivo: fila.archivo, estado: fila.estado, detalle: fila.detalle, hash: fila.hash, partidas: fila.partidas }; };
  const aRevisar = (detalle) => { try { revisar && file.moveTo(revisar); } catch (e) { /* queda donde está */ } return fin({ estado: 'problema', detalle: detalle, url: file.getUrl() }); };
  if (!BUZON_MIME.test(mime)) { agregar_('Buzon_Registro', fila); return aRevisar('Formato ' + mime + ': use PDF, JPG o PNG.'); }
  if (file.getSize() > 15 * 1024 * 1024) { agregar_('Buzon_Registro', fila); return aRevisar('El archivo pasa de 15 MB.'); }
  fila.hash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, file.getBlob().getBytes()));
  // 1 · el mismo archivo ya registrado (en cualquier torre) o tomado por otro proceso; si sus pagos se anularon, se puede volver a subir
  const vivas = ids => { const ps = leer_('CxP_Partidas').filas; return ids.split(',').filter(Boolean).some(id => { const p = ps.find(x => s_(x.id) === id); return p && s_(p.estado) !== 'anulada'; }); };
  const mismo = registro.find(r => s_(r.hash) === fila.hash && (s_(r.estado) === 'procesando' || (s_(r.estado) === 'registrada' && vivas(s_(r.partidas)))));
  agregar_('Buzon_Registro', fila);
  if (mismo) {
    try { file.moveTo(buzonSub_(buzonSub_(carpetaFinanzas_(torre), 'Facturas del buzón'), 'Duplicadas')); } catch (e) { /* queda */ }
    return fin({ estado: 'duplicada', url: file.getUrl(), detalle: 'Este mismo archivo ya se registró el ' + s_(mismo.fecha).slice(0, 10) + ' en ' + s_(mismo.torre) + (s_(mismo.partidas) ? ' (' + s_(mismo.partidas) + ')' : '') + '. No se registró de nuevo.' });
  }
  // 2 · registro en Cuentas por Pagar (la lectura de siempre); el archivo sigue en su carpeta hasta el final
  let registrada = false, faId = '';
  try {
    faId = idNuevo_('FA');
    agregar_('Fin_Archivos', { id: faId, torre: torre, tipo: 'soporte', periodo: fila.periodo, nombre: sinFormula_(nombre.slice(0, 120)), drive_id: file.getId(), texto_id: '', mime: mime, url: file.getUrl(), subido_por: BUZON_ADMIN.nombre, subido_en: ahora_() });
    if (typeof olvidar_ === 'function') olvidar_('Fin_Archivos');
    buzonActualizarFila_(fila, { fa_id: faId });
    const r = accionCxpFactura_({ torre: torre, archivo: faId, periodo: fila.periodo, bandeja: true }, BUZON_ADMIN);
    if (!r.facturas.length) return aRevisar('La IA no encontró una factura en el archivo' + (r.observaciones && r.observaciones[0] ? ': ' + r.observaciones[0] : '.') + ' Revísela y súbala a mano.');
    registrada = true;
    buzonActualizarFila_(fila, { partidas: r.facturas.map(x => x.id).join(','), alertas: sinFormula_(JSON.stringify(r.facturas.map(x => ({ id: x.id, suplidor: x.suplidor, monto: x.monto, ncf: x.ncf })))) });
    // 3 · validación fiscal y duplicados (un error aquí no deshace el registro)
    const resumen = [];
    try {
      const fiscal = buzonLeerFiscal_({ tipo: 'soporte', periodo: fila.periodo, nombre: nombre, drive_id: file.getId(), texto_id: '' });
      if (typeof olvidar_ === 'function') olvidar_('CxP_Partidas');
      const todas = leer_('CxP_Partidas').filas;
      const limpiaNcf = v => s_(v).toUpperCase().replace(/[^A-Z0-9]/g, '');
      r.facturas.forEach(pf => {
        const p = todas.find(x => s_(x.id) === pf.id); if (!p) return;
        // emparejar la lectura fiscal con el pago: por NCF, o por RNC y total; si no, no se usa (nunca se copian datos de otra factura)
        const fz = fiscal.find(x => limpiaNcf(x.ncf) && limpiaNcf(x.ncf) === limpiaNcf(p.ncf)) ||
          fiscal.find(x => s_(x.rnc).replace(/\D/g, '') && s_(x.rnc).replace(/\D/g, '') === s_(p.rnc).replace(/\D/g, '') && Math.abs(Number(x.total) - Number(p.monto)) < 1) ||
          (fiscal.length === 1 && r.facturas.length === 1 ? fiscal[0] : null);
        const res = buzonValidar_(torre, p, fz || {}, faId, todas, !fz);
        resumen.push(s_(p.id) + (res.rojas ? ' · ' + res.rojas + ' alerta(s) roja(s)' : '') + (fz ? '' : ' · sin lectura fiscal'));
      });
    } catch (e) { console.error('Buzón: validación de ' + nombre + ': ' + e.message); resumen.push('La validación fiscal no terminó (' + s_(e.message).slice(0, 120) + '); el pago quedó registrado.'); }
    // 4 · a la nube: sale de la carpeta de la PC
    let movido = true; try { buzonArchivar_(torre, file, nombre, fila.periodo); } catch (e) { movido = false; }
    return fin({ estado: 'registrada', url: file.getUrl(), detalle: sinFormula_((resumen.join(' | ') + (movido ? '' : ' | No se pudo mover el archivo a la nube; se reintenta.')).slice(0, 1500)) });
  } catch (e) {
    console.error('Buzón: ' + nombre + ': ' + e.message);
    // si el error llegó después de que CxP anotó los pagos, cuenta como registrada (nunca vuelve a la PC: así no se registra dos veces)
    if (!registrada && faId) { if (typeof olvidar_ === 'function') olvidar_('CxP_Partidas'); const ps = leer_('CxP_Partidas').filas.filter(p => s_(p.soportes).split(',').indexOf(faId) >= 0); if (ps.length) { registrada = true; fila.partidas = ps.map(p => s_(p.id)).join(','); } }
    if (registrada) { try { buzonArchivar_(torre, file, nombre, fila.periodo); } catch (e2) { /* se reintenta */ } return fin({ estado: 'registrada', partidas: fila.partidas, url: file.getUrl(), detalle: sinFormula_('Registrada, pero hubo un error después: ' + s_(e.message).slice(0, 200) + '. Revise el pago en Cuentas por Pagar.') }); }
    return aRevisar('Error: ' + s_(e.message).slice(0, 300));
  }
}

/** Valida una partida: completa el nombre del suplidor con la DGII si falta, consulta el NCF, revisa el ITBIS, el condominio y los duplicados. */
function buzonValidar_(torre, p, fz, faId, todas, sinPareja) {
  const tf = buzonFicha_(torre);
  const f = { suplidor: s_(p.suplidor) || s_(fz.suplidor), rnc: s_(p.rnc) || s_(fz.rnc), ncf: s_(p.ncf) || s_(fz.ncf), fecha_factura: s_(p.factura_fecha) || s_(fz.fecha_factura),
    vence_ncf: s_(fz.vence_ncf), gravado: fz.gravado, exento: fz.exento, itbis: fz.itbis, total: Number(fz.total) || Number(p.monto) || 0,
    comprador_nombre: s_(fz.comprador_nombre), comprador_rnc: s_(fz.comprador_rnc), codigo_seguridad: s_(fz.codigo_seguridad), servicio: s_(fz.servicio) || s_(p.concepto) };
  const dg = { rnc: f.rnc ? dgiiRnc_(f.rnc) : null };
  // sin nombre del suplidor: se toma de la DGII por el RNC
  let cambios = {};
  if (!s_(p.suplidor) && dg.rnc && dg.rnc.estado === 'ok' && dg.rnc.nombre) { f.suplidor = dg.rnc.nombre; cambios.suplidor = sinFormula_(dg.rnc.nombre.slice(0, 120)); }
  if (!sinPareja && !s_(p.rnc) && f.rnc) cambios.rnc = s_(f.rnc).replace(/\D/g, '').slice(0, 11);
  if (!sinPareja && !s_(p.ncf) && f.ncf) cambios.ncf = sinFormula_(s_(f.ncf).toUpperCase().slice(0, 19));
  dg.ncf = f.ncf && f.rnc ? dgiiNcf_(f.rnc, f.ncf, f.comprador_rnc || tf.rnc, f.codigo_seguridad) : null;
  const al = Fiscal.alertas(f, tf, dg);
  if (cambios.suplidor) al.unshift({ tipo: 'fiscal', nivel: 'azul', texto: 'El nombre del suplidor no venía en la factura: se tomó de la DGII por el RNC (' + cambios.suplidor + ').', codigo: 'nombre_dgii' });
  // duplicados: por datos en todas las torres y, si hay parecidos, la IA decide
  const cand = Fiscal.candidatos(f, todas.filter(x => s_(x.id) !== s_(p.id)).map(x => ({ id: s_(x.id), torre: s_(x.torre), estado: s_(x.estado), ncf: s_(x.ncf), rnc: s_(x.rnc), suplidor: s_(x.suplidor), monto: Number(x.monto) || 0, factura_fecha: s_(x.factura_fecha), periodo: s_(x.periodo), concepto: s_(x.concepto) })));
  let ia = null;
  if (cand.length) {
    ia = buzonIaDuplicado_(f, cand);
    const c0 = cand[0], dondeTxt = c => (igualTorre_(c.torre, torre) ? '' : ' en ' + c.torre) + ' (' + (c.periodo || '') + ', ' + (c.ncf || 'sin NCF') + ', ' + c.monto + ')';
    if (c0.nivel === 'rojo') al.push({ tipo: 'duplicado', nivel: 'rojo', texto: 'Factura repetida: el mismo NCF del mismo suplidor ya está registrado' + dondeTxt(c0) + '.', ref: c0.id, codigo: 'dup_ncf' });
    else if (ia && ia.duplicado === 'si') al.push({ tipo: 'duplicado', nivel: 'rojo', texto: 'La IA cree que es el mismo gasto ya registrado' + dondeTxt(cand.find(c => c.id === ia.id) || c0) + ': ' + ia.razon, ref: ia.id || c0.id, codigo: 'dup_ia' });
    else if (ia && ia.duplicado === 'posible' || c0.nivel === 'ambar') al.push({ tipo: 'duplicado', nivel: 'ambar', texto: 'Posible duplicado' + dondeTxt(c0) + (ia && ia.razon ? ': ' + ia.razon : '. Mismo suplidor y monto en fechas cercanas.'), ref: c0.id, codigo: 'dup_posible' });
  }
  if (Object.keys(cambios).length) { actualizar_('CxP_Partidas', p._fila, cambios); Object.assign(p, cambios); }
  const filaF = { partida_id: s_(p.id), torre: torre, archivo_id: faId, tipo_ncf: (Fiscal.ncf(f.ncf).nombre || ''), ncf: s_(f.ncf).toUpperCase(), rnc_emisor: s_(f.rnc).replace(/\D/g, ''), emisor_dgii: dg.rnc && dg.rnc.nombre || '',
    estado_emisor: dg.rnc ? (dg.rnc.situacion || dg.rnc.estado) : '', comprador_rnc: s_(f.comprador_rnc).replace(/\D/g, ''), comprador_nombre: sinFormula_(f.comprador_nombre.slice(0, 150)), codigo_seguridad: f.codigo_seguridad.slice(0, 20),
    fecha_factura: f.fecha_factura, vence_ncf: f.vence_ncf, gravado: Number(f.gravado) || 0, exento: Number(f.exento) || 0, itbis: Number(f.itbis) || 0, total: f.total,
    dgii_ncf: dg.ncf ? dg.ncf.estado : '', dgii_detalle: dg.ncf ? s_(dg.ncf.detalle) : '', duplicado_ia: ia ? JSON.stringify(ia) : '', alertas: JSON.stringify(al), validado_en: ahora_() };
  if (typeof olvidar_ === 'function') olvidar_('CxP_Fiscal');
  const prev = (typeof leerSiExiste_ === 'function' ? leerSiExiste_('CxP_Fiscal') : []).find(x => s_(x.partida_id) === s_(p.id));
  if (prev) actualizar_('CxP_Fiscal', prev._fila, filaF); else agregar_('CxP_Fiscal', filaF);
  if (typeof olvidar_ === 'function') olvidar_('CxP_Fiscal');
  return { rojas: al.filter(a => a.nivel === 'rojo').length };
}
/** Reintenta las consultas a la DGII que no se pudieron hacer (la página puede estar caída de noche). Los pagos anulados se omiten. */
function buzonReintentarDgii_(ini, tocadas) {
  if (typeof olvidar_ === 'function') olvidar_('CxP_Fiscal');
  const partidas = leer_('CxP_Partidas').filas;
  const filas = (typeof leerSiExiste_ === 'function' ? leerSiExiste_('CxP_Fiscal') : []).filter(x => s_(x.dgii_ncf) === 'sin_verificar')
    .filter(x => { const p = partidas.find(q => s_(q.id) === s_(x.partida_id)); if (!p || s_(p.estado) === 'anulada') { actualizar_('CxP_Fiscal', x._fila, { dgii_ncf: 'omitido' }); return false; } return true; })
    .sort((a, b) => s_(a.validado_en).localeCompare(s_(b.validado_en))).slice(0, 10);
  filas.forEach(x => {
    if (Date.now() - ini > BUZON_TIEMPO_MS) return;
    const r = dgiiNcf_(x.rnc_emisor, x.ncf, x.comprador_rnc, x.codigo_seguridad);
    if (!r || r.estado === 'sin_verificar') { actualizar_('CxP_Fiscal', x._fila, { validado_en: ahora_() }); return; }   // va al final de la fila de reintentos
    const al = (() => { try { return JSON.parse(s_(x.alertas) || '[]'); } catch (e) { return []; } })().filter(a => ['ncf_pendiente', 'ncf_ok', 'ncf_dgii'].indexOf(a.codigo) < 0);
    if (r.estado === 'valido') al.push({ tipo: 'fiscal', nivel: 'verde', texto: 'NCF ' + x.ncf + ' válido en la DGII.', codigo: 'ncf_ok' });
    else al.push({ tipo: 'fiscal', nivel: 'rojo', texto: 'La DGII dice que el NCF ' + x.ncf + ' no es válido para el RNC ' + x.rnc_emisor + (r.detalle ? ': ' + r.detalle : '') + '.', codigo: 'ncf_dgii' });
    actualizar_('CxP_Fiscal', x._fila, { dgii_ncf: r.estado, dgii_detalle: s_(r.detalle), alertas: JSON.stringify(al), validado_en: ahora_() });
    tocadas[s_(x.torre)] = 1;
  });
  if (typeof olvidar_ === 'function') olvidar_('CxP_Fiscal');
}

// ================================================================== las alertas fiscales viven junto a las de Cuentas por Pagar
// cotejarTorre_ (Código.gs) rehace las alertas de cada pago; este envoltorio les agrega las fiscales y la del nombre del suplidor (que se va sola al escribirlo).
function buzonEnvolverCotejo_() {
  if (typeof cotejarTorre_ !== 'function' || cotejarTorre_._fiscal) return;
  const original = cotejarTorre_;
  cotejarTorre_ = function (torre) {
    const r = original.apply(this, arguments);
    try {
      if (typeof olvidar_ === 'function') olvidar_('CxP_Fiscal');
      const fiscal = {}; (typeof leerSiExiste_ === 'function' ? leerSiExiste_('CxP_Fiscal') : []).filter(x => igualTorre_(x.torre, torre)).forEach(x => { fiscal[s_(x.partida_id)] = x; });
      if (!Object.keys(fiscal).length) return r;
      if (typeof olvidar_ === 'function') olvidar_('CxP_Partidas');
      leer_('CxP_Partidas').filas.filter(p => igualTorre_(p.torre, torre) && fiscal[s_(p.id)] && ['pendiente', 'aprobada'].indexOf(s_(p.estado) || 'pendiente') >= 0).forEach(p => {
        const base = (() => { try { return JSON.parse(s_(p.alertas) || '[]'); } catch (e) { return []; } })().filter(a => a.tipo !== 'fiscal' && ['dup_ncf', 'dup_ia', 'dup_posible'].indexOf(a.codigo) < 0);
        let fis = []; try { fis = JSON.parse(s_(fiscal[s_(p.id)].alertas) || '[]'); } catch (e) { fis = []; }
        fis = fis.filter(a => !(a.codigo === 'sin_nombre' && s_(p.suplidor)));                       // ya se escribió el nombre
        fis = fis.filter(a => !(a.codigo === 'dup_ncf' && base.some(b => b.tipo === 'duplicado' && b.nivel === 'rojo')));   // no repetir el mismo aviso
        if (!s_(p.suplidor) && !fis.some(a => a.codigo === 'sin_nombre')) fis.unshift({ tipo: 'fiscal', nivel: 'rojo', texto: 'La factura no trae el nombre del suplidor. Escríbalo en el pago (Editar).', codigo: 'sin_nombre' });
        const txt = JSON.stringify(base.concat(fis.filter(a => a.nivel !== 'verde')));
        if (txt !== s_(p.alertas)) actualizar_('CxP_Partidas', p._fila, { alertas: txt });
      });
    } catch (e) { console.error('Buzón: alertas fiscales de ' + torre + ': ' + e.message); }   // nunca detienen Cuentas por Pagar
    return r;
  };
  cotejarTorre_._fiscal = true;
}
buzonEnvolverCotejo_();

// ================================================================== instalación y pantalla
/** Ejecutar una vez desde el editor: crea las carpetas y el activador cada 10 minutos. */
function instalarBuzon() {
  if (typeof instalar === 'function') instalar();   // crea las hojas nuevas (Buzon_Registro y CxP_Fiscal)
  const c = buzonCarpetas_();
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'buzonProcesar').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('buzonProcesar').timeBased().everyMinutes(BUZON_MINUTOS).create();
  Logger.log('Buzón listo: ' + c.raiz.getUrl() + ' · ' + c.torres.length + ' torres · se revisa cada ' + BUZON_MINUTOS + ' minutos.');
  return c.raiz.getUrl();
}
function accionCxpBuzon_(req, admin) {
  const op = s_(req.operacion);
  if (op === 'procesar') {
    if (!admin.gerente && ((admin.permisos || {}).tor_finanzas || 0) < 3) throw error_('Necesita el nivel «Editar» de Finanzas.', 'SIN_PERMISO');
    const r = buzonProcesar_({ origen: 'manual · ' + admin.nombre });
    r.hechos = (r.hechos || []).filter(h => enAlcance_(admin, h.torre));   // cada quien ve solo sus torres
    return Object.assign(accionCxpBuzonDatos_(admin), { resultado: r });
  }
  return accionCxpBuzonDatos_(admin);
}
function accionCxpBuzonDatos_(admin) {
  const raiz = buzonRaiz_(false);   // leer no crea carpetas
  const reg = (typeof leerSiExiste_ === 'function' ? leerSiExiste_('Buzon_Registro') : []).filter(r => enAlcance_(admin, s_(r.torre))).slice(-400).reverse().map(r => ({
    id: s_(r.id), fecha: r.fecha instanceof Date ? Utilities.formatDate(r.fecha, TZ, "yyyy-MM-dd'T'HH:mm") : s_(r.fecha), torre: s_(r.torre), archivo: s_(r.archivo), estado: s_(r.estado),
    partidas: s_(r.partidas), detalle: s_(r.detalle), url: s_(r.url) }));
  const fisc = (typeof leerSiExiste_ === 'function' ? leerSiExiste_('CxP_Fiscal') : []).filter(r => enAlcance_(admin, s_(r.torre))).slice(-400).map(r => ({
    partida_id: s_(r.partida_id), torre: s_(r.torre), ncf: s_(r.ncf), tipo_ncf: s_(r.tipo_ncf), rnc_emisor: s_(r.rnc_emisor), emisor_dgii: s_(r.emisor_dgii), estado_emisor: s_(r.estado_emisor),
    dgii_ncf: s_(r.dgii_ncf), itbis: Number(r.itbis) || 0, total: Number(r.total) || 0, alertas: (() => { try { return JSON.parse(s_(r.alertas) || '[]'); } catch (e) { return []; } })() }));
  const enCola = [];
  if (raiz) try { torresActivas_().filter(t => enAlcance_(admin, t.torre)).forEach(t => { const it = raiz.getFoldersByName(t.torre); if (!it.hasNext()) return; const fs = it.next().getFiles(); let n = 0; while (fs.hasNext() && n < 50) { fs.next(); n++; } if (n) enCola.push({ torre: t.torre, archivos: n }); }); } catch (e) { /* sin acceso a Drive */ }
  const activo = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'buzonProcesar');
  return { carpeta: raiz && !admin.torres ? raiz.getUrl() : '', activo: activo, cada_minutos: BUZON_MINUTOS, ultima: s_(PropertiesService.getScriptProperties().getProperty('BUZON_ULTIMA')), en_cola: enCola, registro: reg, fiscal: fisc };
}
Object.assign(ACCIONES_CENTRAL, { cxp_buzon: req => conAdmin_(req, accionCxpBuzon_) });
Object.assign(ACCESO_ACCION, { cxp_buzon: ['tor_finanzas', 1] });
