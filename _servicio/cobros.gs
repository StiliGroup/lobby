/**
 * Stili Soft v3.2 · Cobros: seguimiento de cobranza, mensajes, encuesta de satisfacción, recibo automático y bot de cobros.
 * Archivo nuevo del servicio. Se registra solo (HOJAS, ACCIONES_CENTRAL, ACCESO_ACCION), igual que contabilidad.gs: no hay que tocar Código.gs.
 * Necesita contabilidad.gs y stili-contabilidad.gs (v3.2).
 *
 * Canales:
 *  - Correo: MailApp (cupo diario de Google: 100 destinatarios en cuentas gratuitas, 1,500 en Google Workspace).
 *  - Telegram: el Bot de Cobros (bot_cobros.py, en la PC con los otros bots) recoge la cola con la clave CTB_CLAVE_BOT y entrega.
 *  - WhatsApp: con la API de WhatsApp Business de Meta (WA_TOKEN y WA_PHONE_ID en Propiedades del script) se envía solo y Meta avisa
 *    entregado / leído / falló. Sin la API, el mensaje queda «manual»: se abre WhatsApp con el texto listo y el equipo marca el resultado.
 *
 * Regla legal (verificada en el Código Civil dominicano): el residente puede declarar qué deuda paga (art. 1253) y, si no lo declara,
 * se aplica a la deuda vencida y, entre iguales, a la más antigua (art. 1256). El bot le pregunta qué paga y el aviso guarda su elección.
 */

const COB_TABLAS = {
  contactos: ['Ctb_Contactos', ['id', 'torre', 'apartamento', 'nombre', 'telefono', 'correo', 'telegram_id', 'acepta_whatsapp', 'acepta_correo', 'origen', 'actualizado_por', 'actualizado_en']],
  mensajes: ['Ctb_Mensajes', ['id', 'torre', 'apartamento', 'canal', 'tipo', 'destino', 'texto', 'archivo_id', 'estado', 'proveedor_id', 'error', 'gestion_id', 'cobro_id', 'encuesta_id',
    'creado_por', 'creado_en', 'enviado_en', 'entregado_en', 'leido_en', 'respondido_en']],
  encuestas: ['Ctb_EncuestasCobros', ['id', 'token', 'torre', 'apartamento', 'gestion_id', 'gestor', 'canal', 'enviada_en', 'respondida_en', 'csat', 'claridad', 'trato', 'resuelto', 'nps', 'comentario']],
  vinculos: ['Ctb_BotVinculos', ['id', 'torre', 'apartamento', 'codigo', 'creado_por', 'creado_en', 'vence', 'chat_id', 'nombre', 'usuario', 'vinculado_en', 'estado']],
};
Object.keys(COB_TABLAS).forEach(k => { CTB_TABLAS[k] = COB_TABLAS[k]; HOJAS[COB_TABLAS[k][0]] = COB_TABLAS[k][1]; });
['texto', 'comentario'].forEach(k => { LARGO_COLUMNA[k] = Math.max(LARGO_COLUMNA[k] || 0, 4000); });

const COB_CANALES = ['llamada', 'whatsapp', 'correo', 'sms', 'telegram', 'visita', 'carta'];
const COB_RESULTADOS = ['contactado', 'promesa', 'pago_informado', 'disputa', 'no_contesta', 'ocupado', 'mensaje_dejado', 'numero_errado', 'enviado'];

// ------------------------------------------------------------------ ayudantes
function cobProp_(k) { return s_(PropertiesService.getScriptProperties().getProperty(k)); }
function cobWaActiva_() { return !!(cobProp_('WA_TOKEN') && cobProp_('WA_PHONE_ID')); }
function cobSitio_() { return (s_(config_().URL_SITIO) || 'https://stiligroup.github.io/lobby/').replace(/\/?$/, '/'); }
function cobAzar_(n) { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; let t = ''; const b = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''); for (let i = 0; i < n; i++) t += a[parseInt(b.substr(i * 2 % 60, 2), 16) % a.length]; return t; }
/** Teléfono dominicano a formato internacional sin «+» (18095551234). Devuelve '' si no parece válido. */
function cobTel_(t) {
  let d = s_(t).replace(/\D/g, '');
  if (d.length === 10 && /^8[024]9/.test(d)) d = '1' + d;
  return /^\d{11,15}$/.test(d) ? d : '';
}
function cobCorreoOk_(c) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s_(c)); }
const cobDinero_ = v => 'RD$ ' + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function cobContacto_(torre, apto) {
  return ctbLeer_('contactos', torre).filter(c => c.apartamento === s_(apto).toUpperCase()).pop() || null;
}
function cobVinculo_(torre, apto) {
  return ctbLeer_('vinculos', torre).filter(v => v.apartamento === s_(apto).toUpperCase() && v.estado === 'vinculado').pop() || null;
}
function cobRegistrarMensaje_(m) {
  const obj = Object.assign({ id: idNuevo_('MSJ'), estado: 'pendiente', creado_en: ahora_() }, m);
  obj.texto = s_(obj.texto).slice(0, 3800);
  ctbAgregar_('mensajes', obj);
  return obj;
}

// ------------------------------------------------------------------ datos para la página (los agrega ctb_datos)
function cobDatos_(torre, admin) {
  const nivel = admin.gerente ? 3 : (admin.permisos.tor_contabilidad || 0);
  const contactos = ctbLeer_('contactos', torre).map(c => { delete c._fila; if (nivel < 2) { c.telefono = c.telefono ? '•••' + s_(c.telefono).slice(-4) : ''; c.correo = c.correo ? '•••' : ''; } return c; });
  const mensajes = ctbLeer_('mensajes', torre).slice(-3000).map(m => { delete m._fila; if (nivel < 2) m.destino = m.destino ? '•••' + s_(m.destino).slice(-4) : ''; if (m.canal === 'telegram') m.destino = ''; return m; });
  const encuestas = ctbLeer_('encuestas', torre).slice(-3000).map(e => { delete e._fila; delete e.token; return e; });
  const vinculos = ctbLeer_('vinculos', torre).filter(v => v.estado === 'vinculado').map(v => ({ apartamento: v.apartamento, nombre: v.nombre, vinculado_en: v.vinculado_en }));
  let cupo = null; try { cupo = MailApp.getRemainingDailyQuota(); } catch (e) { cupo = null; }
  return { contactos, mensajes, encuestas, bot: { vinculos, usuario: s_(config_().COBROS_BOT_USUARIO), activo: !!s_(config_().CTB_CLAVE_BOT) }, wa_api: cobWaActiva_(), correo_cupo: cupo };
}

// ------------------------------------------------------------------ contactos
function accionCobContacto_(req, admin) {
  const t = exigirTorre_(admin, req.torre), torre = t.torre, d = req.contacto || {};
  if (!admin.gerente && (admin.permisos.tor_contabilidad || 0) < 3) throw error_('Necesita el nivel «Editar» de Contabilidad para cambiar contactos.', 'SIN_PERMISO');
  const apto = s_(d.apartamento).toUpperCase();
  if (!apto) throw error_('Elija el apartamento.');
  const tel = s_(d.telefono), correo = s_(d.correo).toLowerCase();
  if (tel && !cobTel_(tel)) throw error_('El teléfono debe tener 10 dígitos (809, 829 u 849).');
  if (correo && !cobCorreoOk_(correo)) throw error_('El correo no es válido.');
  return ctbConLock_(() => {
    const previo = cobContacto_(torre, apto);
    const cambios = { nombre: s_(d.nombre).slice(0, 80), telefono: tel, correo: correo, acepta_whatsapp: d.acepta_whatsapp === 'no' ? 'no' : 'si', acepta_correo: d.acepta_correo === 'no' ? 'no' : 'si',
      actualizado_por: admin.nombre, actualizado_en: ahora_() };
    if (previo) { ctbActualizar_('contactos', previo._fila, cambios); ctbAuditar_(torre, admin, 'editar', 'contactos', previo.id, previo, cambios); }
    else { const o = Object.assign({ id: idNuevo_('CON'), torre: torre, apartamento: apto, origen: 'manual' }, cambios); ctbAgregar_('contactos', o); ctbAuditar_(torre, admin, 'crear', 'contactos', o.id, null, o); }
    return accionCtbDatos_(req, admin);
  });
}
/** Trae los contactos que ya están en el sistema: el residente de Apartamentos y las encuestas de propietarios aprobadas. No pisa lo que ya existe. */
function accionCobContactosImportar_(req, admin) {
  const t = exigirTorre_(admin, req.torre), torre = t.torre;
  if (!admin.gerente && (admin.permisos.tor_contabilidad || 0) < 3) throw error_('Necesita el nivel «Editar» de Contabilidad.', 'SIN_PERMISO');
  return ctbConLock_(() => {
    const ya = {}; ctbLeer_('contactos', torre).forEach(c => { ya[c.apartamento] = c; });
    const nuevos = {};
    leer_('Apartamentos').filas.filter(a => mismaTorre_(a.torre, torre) && !esNo_(a.activo)).forEach(a => {
      const apto = s_(a.apartamento).toUpperCase(); if (!apto || ya[apto]) return;
      nuevos[apto] = { nombre: s_(a.residente), telefono: cobTel_(a.telefono) ? s_(a.telefono) : '', correo: '', origen: 'apartamentos' };
    });
    const enc = (typeof leerSiExiste_ === 'function' ? leerSiExiste_('Encuestas') : []) || [];
    enc.filter(e => mismaTorre_(e.torre, torre) && s_(e.estatus) === 'aprobada').forEach(e => {
      const apto = s_(e.apartamento).toUpperCase(); if (!apto || ya[apto]) return;
      const n = nuevos[apto] || { origen: 'encuesta' };
      nuevos[apto] = { nombre: s_(e.propietario) || n.nombre || '', telefono: cobTel_(e.telefono) ? s_(e.telefono) : n.telefono || '', correo: cobCorreoOk_(e.correo) ? s_(e.correo).toLowerCase() : '', origen: n.origen === 'apartamentos' ? 'apartamentos+encuesta' : 'encuesta' };
    });
    let n = 0;
    Object.keys(nuevos).forEach(apto => { const x = nuevos[apto]; if (!x.telefono && !x.correo) return;
      ctbAgregar_('contactos', { id: idNuevo_('CON'), torre: torre, apartamento: apto, nombre: x.nombre.slice(0, 80), telefono: x.telefono, correo: x.correo, acepta_whatsapp: 'si', acepta_correo: 'si', origen: x.origen, actualizado_por: admin.nombre, actualizado_en: ahora_() }); n++; });
    ctbAuditar_(torre, admin, 'importar', 'contactos', torre, null, { nuevos: n });
    return Object.assign(accionCtbDatos_(req, admin), { aviso: n ? n + ' contactos traídos de Apartamentos y de las encuestas de propietarios.' : 'No había contactos nuevos para traer.' });
  });
}

// ------------------------------------------------------------------ seguimiento de cobranza
/**
 * Registra una gestión (llamada, WhatsApp, correo, visita…). Si habló con el residente y se pide, crea la encuesta de satisfacción
 * y la envía por el canal disponible (Telegram si está vinculado, WhatsApp con la API, correo). Sin API de WhatsApp, devuelve el enlace listo.
 */
function accionCobGestion_(req, admin) {
  const t = exigirTorre_(admin, req.torre), torre = t.torre, g = req.gestion || {};
  if (!admin.gerente && (admin.permisos.tor_contabilidad || 0) < 3) throw error_('Necesita el nivel «Editar» de Contabilidad para anotar gestiones.', 'SIN_PERMISO');
  const apto = s_(g.apartamento).toUpperCase();
  if (!apto) throw error_('Elija el apartamento.');
  const canal = COB_CANALES.indexOf(s_(g.canal)) >= 0 ? s_(g.canal) : 'llamada', resultado = COB_RESULTADOS.indexOf(s_(g.resultado)) >= 0 ? s_(g.resultado) : '';
  if (!resultado) throw error_('Elija el resultado de la gestión.');
  const pf = s_(g.promesa_fecha), pm = ctbNum_(g.promesa_monto);
  if (resultado === 'promesa') { ctbExigirFecha_(pf, 'fecha prometida'); if (pm < 0) throw error_('El monto prometido no puede ser negativo.'); }
  if (s_(g.proxima) && !ctbFechaOk_(s_(g.proxima))) throw error_('La fecha de seguimiento no es válida.');
  const K = ctbLib_();
  const obj = { id: idNuevo_('GES'), torre: torre, fecha: Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm"), apartamento: apto, tipo: canal, canal: canal, direccion: s_(g.direccion) === 'entrante' ? 'entrante' : 'saliente',
    resultado: resultado, duracion_seg: Math.max(0, Math.min(7200, Math.round(Number(g.duracion_seg) || 0))), promesa_fecha: resultado === 'promesa' ? pf : '', promesa_monto: resultado === 'promesa' ? pm : '',
    nota: s_(g.nota).slice(0, 1000), proxima: s_(g.proxima), creado_por: admin.nombre, creado_en: ahora_(), estado: 'activa' };
  // la encuesta se envía fuera del bloqueo (correo y WhatsApp tardan); la gestión se anota después
  let enc = null;
  if (g.enviar_encuesta && K.esContacto(resultado)) enc = cobCrearEncuesta_(torre, apto, obj, admin);
  if (enc && enc.id) obj.encuesta_id = enc.id;
  ctbConLock_(() => { ctbAgregar_('gestiones', obj); ctbAuditar_(torre, admin, 'crear', 'gestiones', obj.id, null, obj); });
  return Object.assign(accionCtbDatos_(req, admin), { encuesta: enc ? { estado: enc.estado, enlace: enc.enlace, whatsapp: enc.whatsapp, aviso: enc.aviso } : null });
}
function accionCobGestionAnular_(req, admin) {
  const t = exigirTorre_(admin, req.torre), torre = t.torre;
  if (!admin.gerente && (admin.permisos.tor_contabilidad || 0) < 3) throw error_('Necesita el nivel «Editar».', 'SIN_PERMISO');
  return ctbConLock_(() => {
    const g = ctbLeer_('gestiones', torre).find(x => x.id === s_(req.id));
    if (!g) throw error_('Esa gestión no existe.');
    if (g.creado_por !== admin.nombre && !admin.gerente) throw error_('Solo quien anotó la gestión o el Gerente General la puede anular.');
    ctbActualizar_('gestiones', g._fila, { estado: 'anulado' });
    ctbAuditar_(torre, admin, 'anular', 'gestiones', g.id, g, { estado: 'anulado', motivo: s_(req.motivo) });
    return accionCtbDatos_(req, admin);
  });
}

// ------------------------------------------------------------------ encuesta de satisfacción de cobros
function cobCrearEncuesta_(torre, apto, gestion, admin) {
  const dias = Number(ctbConfig_(torre).encuesta_dias || 30) || 30;
  const reciente = ctbLeer_('encuestas', torre).some(e => e.apartamento === apto && Date.now() - new Date(e.enviada_en).getTime() < dias * 864e5);
  if (reciente) return { id: '', estado: 'omitida', aviso: 'No se envió la encuesta: el apto. ' + apto + ' ya recibió una en los últimos ' + dias + ' días.' };
  const token = cobAzar_(24), enlace = cobSitio_() + 'encuesta-cobros.html?t=' + token;
  const texto = 'Saludos. Gracias por atender a ' + (configPublica_().NOMBRE_EMPRESA || 'Stili Group') + '. ¿Nos regala 30 segundos para decirnos cómo le atendimos en cobros? ' + enlace;
  const e = { id: idNuevo_('ENC'), token: token, torre: torre, apartamento: apto, gestion_id: gestion.id, gestor: admin.nombre, canal: '', enviada_en: ahora_() };
  const r = cobEnviar_(torre, apto, { tipo: 'encuesta', texto: texto, gestion_id: gestion.id, encuesta_id: e.id, creado_por: admin.nombre, preferir: gestion.canal });
  e.canal = r.canal || 'manual';
  ctbAgregar_('encuestas', e);
  return { id: e.id, estado: r.estado, enlace: enlace, whatsapp: r.whatsapp || '', aviso: r.aviso };
}
function accionCobEncuestaInfo_(req) { // público, con el enlace de la encuesta
  const e = ctbLeer_('encuestas').find(x => x.token && x.token === s_(req.t));
  if (!e) throw error_('Este enlace de encuesta no es válido.');
  return { torre: e.torre, empresa: configPublica_().NOMBRE_EMPRESA, respondida: !!e.respondida_en, vencida: Date.now() - new Date(e.enviada_en).getTime() > 30 * 864e5 };
}
function accionCobEncuestaResponder_(req) { // público
  const r = req.respuesta || {};
  const n15 = v => { const n = Math.round(Number(v)); return n >= 1 && n <= 5 ? n : ''; };
  const csat = n15(r.csat);
  if (!csat) throw error_('Elija cómo le atendimos (de 1 a 5).');
  return ctbConLock_(() => {
    const e = ctbLeer_('encuestas').find(x => x.token && x.token === s_(req.t));
    if (!e) throw error_('Este enlace de encuesta no es válido.');
    if (e.respondida_en) throw error_('Esta encuesta ya se respondió. ¡Gracias!');
    if (Date.now() - new Date(e.enviada_en).getTime() > 30 * 864e5) throw error_('Este enlace venció.');
    const nps = String(r.nps) === '' || r.nps === undefined || r.nps === null ? '' : Math.max(0, Math.min(10, Math.round(Number(r.nps) || 0)));
    ctbActualizar_('encuestas', e._fila, { respondida_en: ahora_(), csat: csat, claridad: n15(r.claridad), trato: n15(r.trato), resuelto: r.resuelto === 'si' ? 'si' : r.resuelto === 'no' ? 'no' : '', nps: nps,
      comentario: s_(r.comentario).replace(/\s+/g, ' ').slice(0, 600) });
    return { ok: true, mensaje: '¡Gracias! Su opinión nos ayuda a atenderle mejor.' };
  });
}

// ------------------------------------------------------------------ envío por canal
/**
 * Envía un mensaje al apartamento por el mejor canal disponible y lo deja en Ctb_Mensajes.
 * Orden: el canal que se pidió; si no, Telegram (si está vinculado) → WhatsApp con API → correo. WhatsApp sin API = «manual» con enlace listo.
 * m = { tipo, texto, asunto, html, pdf (Blob), archivo_id, gestion_id, cobro_id, encuesta_id, creado_por, preferir, canales:[...] }
 */
function cobEnviar_(torre, apto, m) {
  const con = cobContacto_(torre, apto) || {}, vin = cobVinculo_(torre, apto), tel = cobTel_(con.telefono), correo = cobCorreoOk_(con.correo) ? con.correo : '';
  const quiere = m.canales || (m.preferir === 'whatsapp' ? ['whatsapp'] : m.preferir === 'correo' ? ['correo'] : m.preferir === 'telegram' ? ['telegram'] : ['telegram', 'whatsapp', 'correo']);
  const base = { torre: torre, apartamento: apto, tipo: m.tipo, texto: m.texto, archivo_id: m.archivo_id || '', gestion_id: m.gestion_id || '', cobro_id: m.cobro_id || '', encuesta_id: m.encuesta_id || '', creado_por: m.creado_por || 'sistema' };
  const hechos = []; let primero = null, wa = '', aviso = '';
  for (const canal of quiere) {
    if (m.uno && primero) break;
    if (canal === 'telegram' && vin && vin.chat_id) {
      // la entrega la hace el Bot de Cobros (bot_cobros.py) al leer la cola
      const x = cobRegistrarMensaje_(Object.assign({}, base, { canal: 'telegram', destino: s_(vin.chat_id), estado: 'pendiente' })); hechos.push(x); primero = primero || x;
    } else if (canal === 'whatsapp' && tel && con.acepta_whatsapp !== 'no') {
      if (cobWaActiva_()) {
        let x = cobRegistrarMensaje_(Object.assign({}, base, { canal: 'whatsapp', destino: tel, estado: 'pendiente' }));
        try { const id = cobWaEnviar_(tel, m); ctbActualizar_('mensajes', ctbLeer_('mensajes', torre).find(y => y.id === x.id)._fila, { estado: 'enviado', proveedor_id: id, enviado_en: ahora_() }); x.estado = 'enviado'; }
        catch (e) { ctbActualizar_('mensajes', ctbLeer_('mensajes', torre).find(y => y.id === x.id)._fila, { estado: 'fallido', error: s_(e.message).slice(0, 300) }); x.estado = 'fallido'; }
        hechos.push(x); primero = primero || x;
      } else {
        wa = 'https://wa.me/' + tel + '?text=' + encodeURIComponent(m.texto);
        const x = cobRegistrarMensaje_(Object.assign({}, base, { canal: 'whatsapp', destino: tel, estado: 'manual' })); x.whatsapp = wa; hechos.push(x); primero = primero || x;
      }
    } else if (canal === 'correo' && correo && con.acepta_correo !== 'no') {
      const x = cobRegistrarMensaje_(Object.assign({}, base, { canal: 'correo', destino: correo, estado: 'pendiente' }));
      let cupo = 1; try { cupo = MailApp.getRemainingDailyQuota(); } catch (e) { cupo = 1; }
      const fila = () => ctbLeer_('mensajes', torre).find(y => y.id === x.id)._fila;
      if (cupo < 1) { ctbActualizar_('mensajes', fila(), { estado: 'fallido', error: 'Se acabó el cupo de correos de hoy. Reenvíelo mañana.' }); x.estado = 'fallido'; aviso = 'Se acabó el cupo de correos de hoy.'; }
      else {
        try {
          MailApp.sendEmail({ to: correo, subject: m.asunto || ('Stili Group · ' + torre), body: m.texto, htmlBody: m.html || undefined, attachments: m.pdf ? [m.pdf] : undefined, name: configPublica_().NOMBRE_EMPRESA || 'Stili Group' });
          ctbActualizar_('mensajes', fila(), { estado: 'enviado', enviado_en: ahora_() }); x.estado = 'enviado';
        } catch (e) { ctbActualizar_('mensajes', fila(), { estado: 'fallido', error: s_(e.message).slice(0, 300) }); x.estado = 'fallido'; }
      }
      hechos.push(x); primero = primero || x;
    }
  }
  if (!hechos.length) aviso = aviso || 'El apto. ' + apto + ' no tiene teléfono, correo ni Telegram registrados. Agréguelos en Cobranza › Contactos.';
  return { canal: primero ? primero.canal : '', estado: primero ? primero.estado : 'sin_canal', whatsapp: wa, mensajes: hechos, aviso: aviso };
}
/** Mensaje libre o recordatorio desde la pantalla (y queda como gestión de WhatsApp/correo). */
function accionCobMensaje_(req, admin) {
  const t = exigirTorre_(admin, req.torre), torre = t.torre;
  if (!admin.gerente && (admin.permisos.tor_contabilidad || 0) < 3) throw error_('Necesita el nivel «Editar».', 'SIN_PERMISO');
  const apto = s_(req.apartamento).toUpperCase(), canal = s_(req.canal), texto = s_(req.texto).slice(0, 1500);
  if (!apto || !texto) throw error_('Falta el apartamento o el texto.');
  if (['whatsapp', 'correo', 'telegram'].indexOf(canal) < 0) throw error_('Canal no válido.');
  const g = { id: idNuevo_('GES'), torre: torre, fecha: Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm"), apartamento: apto, tipo: canal, canal: canal, direccion: 'saliente', resultado: 'enviado',
    nota: texto.slice(0, 300), creado_por: admin.nombre, creado_en: ahora_(), estado: 'activa' };
  const r = cobEnviar_(torre, apto, { tipo: s_(req.tipo) || 'recordatorio', texto: texto, asunto: 'Stili Group · ' + torre + ' · apto. ' + apto, gestion_id: g.id, creado_por: admin.nombre, canales: [canal] });
  if (!r.mensajes.length) throw error_(r.aviso || 'No hay a dónde enviarlo.');
  g.mensaje_id = r.mensajes[0].id;
  ctbConLock_(() => ctbAgregar_('gestiones', g));
  return Object.assign(accionCtbDatos_(req, admin), { envio: { estado: r.estado, whatsapp: r.whatsapp, aviso: r.aviso } });
}
/** Para WhatsApp sin API: el equipo marca a mano lo que vio (leído, respondido o falló). */
function accionCobMensajeEstado_(req, admin) {
  const t = exigirTorre_(admin, req.torre), torre = t.torre, est = s_(req.estado);
  if (['enviado', 'entregado', 'leido', 'respondido', 'fallido'].indexOf(est) < 0) throw error_('Estado no válido.');
  return ctbConLock_(() => {
    const m = ctbLeer_('mensajes', torre).find(x => x.id === s_(req.id));
    if (!m) throw error_('Ese mensaje no existe.');
    const c = { estado: est }, h = ahora_();
    if (est === 'enviado' && !m.enviado_en) c.enviado_en = h;
    if (est === 'entregado' && !m.entregado_en) c.entregado_en = h;
    if (est === 'leido') { c.leido_en = m.leido_en || h; c.entregado_en = m.entregado_en || h; }
    if (est === 'respondido') { c.respondido_en = h; c.leido_en = m.leido_en || h; c.entregado_en = m.entregado_en || h; }
    if (!m.enviado_en) c.enviado_en = m.creado_en || h;
    ctbActualizar_('mensajes', m._fila, c);
    return accionCtbDatos_(req, admin);
  });
}

// ------------------------------------------------------------------ recibo automático
/** Constancia del cobro, línea por línea y por clase, con lo que queda pendiente de cada clase. */
function cobHtmlRecibo_(torre, cobro, D) {
  const K = ctbLib_(), rec = {}; D.recibos.forEach(r => { rec[r.id] = r; });
  const filas = (cobro.aplicaciones || []).map(x => {
    const r = rec[x.recibo_id] || {}, l = (K.lineasDe(r)[x.linea] || {});
    return '<tr><td>' + cobEsc_(K.nombreClase(x.clase || K.claseDe(l))) + '</td><td>' + cobEsc_(l.concepto || '') + ' · ' + cobEsc_(r.periodo ? K.nombreMes(r.periodo) : '') + '<br><small>Recibo ' + cobEsc_(r.numero || '') + '</small></td><td class="n">' + cobDinero_(x.monto) + (Number(x.descuento) ? '<br><small>desc. pronto pago ' + cobDinero_(x.descuento) + '</small>' : '') + '</td></tr>';
  }).join('');
  const ec = K.estadoCuenta(cobro.apartamento, D.recibos, D.cobros, null, D.config);
  const pend = ec.por_clase.length ? ec.por_clase.map(x => '<tr><td>' + cobEsc_(x.nombre) + '</td><td class="n">' + cobDinero_(x.deuda) + (x.vencido ? '<br><small>vencido ' + cobDinero_(x.vencido) + '</small>' : '') + '</td></tr>').join('') : '<tr><td colspan="2">Sin saldo pendiente. ¡Gracias!</td></tr>';
  return '<html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;color:#13293D;font-size:12px;margin:28px}h1{font-size:18px;margin:0;color:#003A75}.cab{display:flex;justify-content:space-between;border-bottom:3px solid #DCB40C;padding-bottom:8px;margin-bottom:12px}' +
    'table{width:100%;border-collapse:collapse;margin:8px 0}td,th{border-bottom:1px solid #DCE3EC;padding:6px;text-align:left;vertical-align:top}.n{text-align:right;white-space:nowrap}h2{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#5A6B78;margin:16px 0 4px}small{color:#5A6B78}.tot td{font-weight:bold}</style></head><body>' +
    '<div class="cab"><div><h1>' + cobEsc_(torre) + '</h1>Constancia de pago · administrado por ' + cobEsc_(configPublica_().NOMBRE_EMPRESA || 'Stili Group') + '</div><div style="text-align:right"><b>' + cobEsc_(cobro.id) + '</b><br>Apartamento <b>' + cobEsc_(cobro.apartamento) + '</b><br>' + cobEsc_(cobro.fecha) + '</div></div>' +
    '<p>Recibimos ' + cobDinero_(cobro.monto) + (cobro.forma ? ' por ' + cobEsc_(cobro.forma) : '') + (cobro.referencia ? ' (ref. ' + cobEsc_(cobro.referencia) + ')' : '') + '. Se aplicó así:</p>' +
    '<table><tr><th>Clase</th><th>Concepto</th><th class="n">Monto</th></tr>' + filas + (Number(cobro.a_favor) ? '<tr><td>Saldo a favor</td><td>Queda para sus próximas cuotas</td><td class="n">' + cobDinero_(cobro.a_favor) + '</td></tr>' : '') +
    '<tr class="tot"><td colspan="2">Total recibido</td><td class="n">' + cobDinero_(cobro.monto) + '</td></tr></table>' +
    '<h2>Lo que queda pendiente</h2><table>' + pend + '</table><p><small>Cada clase (cuota ordinaria, extraordinaria, fondo de reserva, reservas, gas, multas y mora) se lleva por separado.</small></p></body></html>';
}
function cobEsc_(t) { return s_(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
/** Lo llama ctb_cobrar al registrar un cobro: arma la constancia en PDF, la guarda en Drive y la envía por correo, Telegram y WhatsApp. */
function cobReciboAuto_(torre, cobro, admin, notif) {
  const D = { recibos: ctbLeer_('recibos', torre), cobros: ctbLeer_('cobros', torre), config: ctbConfig_(torre) };
  const html = cobHtmlRecibo_(torre, cobro, D);
  const pdf = Utilities.newBlob(html, 'text/html', 'constancia.html').getAs('application/pdf').setName('Constancia ' + cobro.id + ' · ' + torre + ' · apto ' + cobro.apartamento + '.pdf');
  let archivo = '';
  try { const it = ctbCarpeta_(torre).getFoldersByName('Constancias'); const carpeta = it.hasNext() ? it.next() : ctbCarpeta_(torre).createFolder('Constancias'); archivo = carpeta.createFile(pdf).getId(); } catch (e) { archivo = ''; }
  const K = ctbLib_(), resumen = (cobro.aplicaciones || []).reduce((o, x) => { o[x.clase] = (o[x.clase] || 0) + Number(x.monto); return o; }, {});
  const texto = 'Saludos. ' + torre + ', apto. ' + cobro.apartamento + ': recibimos su pago de ' + cobDinero_(cobro.monto) + ' del ' + cobro.fecha + '. Se aplicó a: ' +
    Object.keys(resumen).map(k => K.nombreClase(k) + ' ' + cobDinero_(resumen[k])).join(', ') + (Number(cobro.a_favor) ? ', saldo a favor ' + cobDinero_(cobro.a_favor) : '') + '. Constancia ' + cobro.id + '. Gracias.';
  // Si el residente avisó por el bot, la respuesta va a ese mismo chat aunque todavía no esté en la lista de contactos
  const canales = ['telegram', 'whatsapp', 'correo'];
  const r = cobEnviar_(torre, cobro.apartamento, { tipo: 'recibo', texto: texto, asunto: 'Constancia de pago · ' + torre + ' · apto. ' + cobro.apartamento, html: html, pdf: pdf, archivo_id: archivo, cobro_id: cobro.id, creado_por: admin ? admin.nombre : 'sistema', canales: canales });
  if (notif && notif.chat_id && !r.mensajes.some(m => m.canal === 'telegram')) r.mensajes.push(cobRegistrarMensaje_({ torre: torre, apartamento: cobro.apartamento, canal: 'telegram', tipo: 'recibo', destino: s_(notif.chat_id), texto: texto, archivo_id: archivo, cobro_id: cobro.id, creado_por: admin ? admin.nombre : 'sistema' }));
  return { archivo_id: archivo, canales: r.mensajes.map(m => ({ canal: m.canal, estado: m.estado })), whatsapp: r.whatsapp, aviso: r.aviso };
}
function accionCobReciboReenviar_(req, admin) {
  const t = exigirTorre_(admin, req.torre), torre = t.torre;
  const k = ctbLeer_('cobros', torre).find(x => x.id === s_(req.cobro_id) && x.estado !== 'anulado');
  if (!k) throw error_('Ese cobro no existe o está anulado.');
  const r = cobReciboAuto_(torre, k, admin, null);   // fuera del bloqueo: solo envía y anota mensajes
  return Object.assign(accionCtbDatos_(req, admin), { envio_recibo: r });
}

// ------------------------------------------------------------------ WhatsApp Business (Meta) · preparado
/** Envía por la API de WhatsApp de Meta. Fuera de la ventana de 24 horas, Meta exige plantillas aprobadas (WA_PLANTILLA_RECIBO, WA_PLANTILLA_TEXTO). */
function cobWaEnviar_(tel, m) {
  const tok = cobProp_('WA_TOKEN'), phone = cobProp_('WA_PHONE_ID'), v = cobProp_('WA_VERSION') || 'v21.0', idioma = cobProp_('WA_IDIOMA') || 'es';
  const url = 'https://graph.facebook.com/' + v + '/' + phone + '/messages';
  let cuerpo;
  const plantilla = m.tipo === 'recibo' ? cobProp_('WA_PLANTILLA_RECIBO') : m.tipo === 'encuesta' ? cobProp_('WA_PLANTILLA_ENCUESTA') : cobProp_('WA_PLANTILLA_TEXTO');
  if (plantilla) {
    const comp = [{ type: 'body', parameters: [{ type: 'text', text: s_(m.texto).slice(0, 1000) }] }];
    if (m.pdf && m.tipo === 'recibo') comp.unshift({ type: 'header', parameters: [{ type: 'document', document: { id: cobWaSubir_(m.pdf), filename: m.pdf.getName() } }] });
    cuerpo = { messaging_product: 'whatsapp', to: tel, type: 'template', template: { name: plantilla, language: { code: idioma }, components: comp } };
  } else cuerpo = { messaging_product: 'whatsapp', to: tel, type: 'text', text: { body: s_(m.texto).slice(0, 4000) } };
  const r = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + tok }, payload: JSON.stringify(cuerpo), muteHttpExceptions: true });
  const j = JSON.parse(r.getContentText() || '{}');
  if (r.getResponseCode() >= 300 || !j.messages) throw new Error((j.error && j.error.message) || 'WhatsApp respondió ' + r.getResponseCode());
  return j.messages[0].id;
}
function cobWaSubir_(blob) {
  const tok = cobProp_('WA_TOKEN'), phone = cobProp_('WA_PHONE_ID'), v = cobProp_('WA_VERSION') || 'v21.0';
  const r = UrlFetchApp.fetch('https://graph.facebook.com/' + v + '/' + phone + '/media', { method: 'post', headers: { Authorization: 'Bearer ' + tok },
    payload: { messaging_product: 'whatsapp', type: blob.getContentType(), file: blob }, muteHttpExceptions: true });
  const j = JSON.parse(r.getContentText() || '{}'); if (!j.id) throw new Error('No se pudo subir el PDF a WhatsApp.'); return j.id;
}
/**
 * Avisos de Meta (entregado, leído, falló y respuestas). Para activarlo, Código.gs debe pasar estos avisos aquí:
 *   en doGet(e):  if (e && e.parameter && e.parameter['hub.mode']) return cobWaVerificar_(e);
 *   en doPost(e): if (req && req.object === 'whatsapp_business_account') { cobWaWebhook_(req, e); return json_({ ok: true }); }
 * La dirección que se registra en Meta lleva una clave: …/exec?wa=<WA_WEBHOOK_CLAVE>. Sin esa clave el aviso se ignora
 * (Apps Script no deja leer la firma X-Hub-Signature-256; para firma completa, un pequeño relé que la verifique).
 * (se hace al contratar la API; mientras tanto no hace falta).
 */
function cobWaVerificar_(e) {
  const ok = e.parameter['hub.verify_token'] && e.parameter['hub.verify_token'] === cobProp_('WA_VERIFICAR');
  return ContentService.createTextOutput(ok ? s_(e.parameter['hub.challenge']) : 'no');
}
function cobWaWebhook_(body, e) {
  const clave = cobProp_('WA_WEBHOOK_CLAVE');
  if (!clave || clave.length < 24 || !e || !e.parameter || e.parameter.wa !== clave) return;
  return ctbConLock_(() => cobWaWebhookProcesar_(body));
}
function cobWaWebhookProcesar_(body) {
  const orden = { enviado: 1, entregado: 2, leido: 3, respondido: 4, fallido: 0 };
  const hoja = ctbLeer_('mensajes'), porId = {}; hoja.forEach(m => { if (m.proveedor_id) porId[m.proveedor_id] = m; });
  (body.entry || []).forEach(en => (en.changes || []).forEach(ch => {
    const v = ch.value || {};
    (v.statuses || []).forEach(st => {
      const m = porId[st.id]; if (!m) return;
      const est = { sent: 'enviado', delivered: 'entregado', read: 'leido', failed: 'fallido' }[st.status]; if (!est) return;
      if (est !== 'fallido' && (orden[est] || 0) <= (orden[m.estado] || 0)) return;
      const h = st.timestamp ? Utilities.formatDate(new Date(Number(st.timestamp) * 1000), TZ, "yyyy-MM-dd'T'HH:mm") : ahora_();
      const c = { estado: est }; if (est === 'entregado') c.entregado_en = h; if (est === 'leido') { c.leido_en = h; c.entregado_en = m.entregado_en || h; }
      if (est === 'fallido') c.error = s_(((st.errors || [])[0] || {}).title).slice(0, 300);
      ctbActualizar_('mensajes', m._fila, c); m.estado = est;
    });
    (v.messages || []).forEach(msg => {
      // una respuesta del residente: marca su último mensaje como respondido y deja la gestión entrante
      const tel = s_(msg.from), ult = hoja.filter(m => m.canal === 'whatsapp' && m.destino === tel).pop(); if (!ult) return;
      ctbActualizar_('mensajes', ult._fila, { estado: 'respondido', respondido_en: ahora_() });
      ctbAgregar_('gestiones', { id: idNuevo_('GES'), torre: ult.torre, fecha: Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm"), apartamento: ult.apartamento, tipo: 'whatsapp', canal: 'whatsapp', direccion: 'entrante',
        resultado: 'contactado', nota: s_((msg.text || {}).body || '[' + msg.type + ']').slice(0, 500), creado_por: 'WhatsApp', creado_en: ahora_(), estado: 'activa' });
    });
  }));
}

// ------------------------------------------------------------------ Bot de Cobros (Telegram) · acciones con clave
function cobBotClaveOk_(c) {
  const k = s_(config_().CTB_CLAVE_BOT);
  if (!k || k.length < 24 || s_(c).length !== k.length) return false;
  let d = 0; for (let i = 0; i < k.length; i++) d |= k.charCodeAt(i) ^ s_(c).charCodeAt(i); return d === 0;
}
function cobVinculoChat_(chat) { return ctbLeer_('vinculos').filter(v => v.estado === 'vinculado' && s_(v.chat_id) === s_(chat)).pop() || null; }
/** Invitación de un solo uso para que el residente de un apartamento entre al bot (válida 7 días). */
function accionCobBotInvitar_(req, admin) {
  const t = exigirTorre_(admin, req.torre), torre = t.torre, apto = s_(req.apartamento).toUpperCase();
  if (!admin.gerente && (admin.permisos.tor_contabilidad || 0) < 3) throw error_('Necesita el nivel «Editar».', 'SIN_PERMISO');
  const usuario = s_(config_().COBROS_BOT_USUARIO).replace(/^@/, '');
  if (!usuario) throw error_('Falta el nombre del Bot de Cobros (COBROS_BOT_USUARIO en la pestaña Config).');
  const aptos = leer_('Apartamentos').filas.filter(a => mismaTorre_(a.torre, torre) && !esNo_(a.activo)).map(a => s_(a.apartamento).toUpperCase());
  if (!apto || (aptos.length && aptos.indexOf(apto) < 0)) throw error_('Ese apartamento no está en la lista de ' + torre + '.');
  return ctbConLock_(() => {
    const codigo = 'c' + cobAzar_(20);
    ctbLeer_('vinculos', torre).filter(v => v.apartamento === apto && v.estado === 'invitado').forEach(v => ctbActualizar_('vinculos', v._fila, { estado: 'reemplazado', codigo: '' }));   // solo vale la última invitación
    ctbAgregar_('vinculos', { id: idNuevo_('VIN'), torre: torre, apartamento: apto, codigo: codigo, creado_por: admin.nombre, creado_en: ahora_(), vence: Utilities.formatDate(new Date(Date.now() + 7 * 864e5), TZ, 'yyyy-MM-dd'), estado: 'invitado' });
    const enlace = 'https://t.me/' + usuario + '?start=' + codigo;
    const texto = 'Saludos. Desde ahora puede consultar su saldo, enviar su comprobante de pago y pedir su recibo por Telegram con el Bot de Cobros de ' + torre + '. Toque este enlace (es solo para el apto. ' + apto + ' y vence en 7 días): ' + enlace;
    const con = cobContacto_(torre, apto), tel = con ? cobTel_(con.telefono) : '';
    ctbAuditar_(torre, admin, 'invitar_bot', 'vinculos', apto, null, { vence: 7 });
    return { enlace: enlace, texto: texto, whatsapp: tel ? 'https://wa.me/' + tel + '?text=' + encodeURIComponent(texto) : 'https://wa.me/?text=' + encodeURIComponent(texto) };
  });
}
function accionCobBotDesvincular_(req, admin) {
  const t = exigirTorre_(admin, req.torre), torre = t.torre, apto = s_(req.apartamento).toUpperCase();
  if (!admin.gerente && (admin.permisos.tor_contabilidad || 0) < 3) throw error_('Necesita el nivel «Editar».', 'SIN_PERMISO');
  return ctbConLock_(() => {
    ctbLeer_('vinculos', torre).filter(v => v.apartamento === apto && v.estado !== 'desvinculado').forEach(v => ctbActualizar_('vinculos', v._fila, { estado: 'desvinculado' }));
    ctbAuditar_(torre, admin, 'desvincular_bot', 'vinculos', apto, null, {});
    return accionCtbDatos_(req, admin);
  });
}
/**
 * Todo lo que pide el bot. req = { clave, op, chat_id, ... }
 *  vincular {codigo, nombre, usuario} · estado · leer {archivo} · aviso {monto, fecha, banco, referencia, destino[], archivo} ·
 *  recibo {cual: 'ultimo'|'estado'} · hablar {texto} · desvincular · cola · entregado {ids, estados} · grupo_avisos
 */
function accionCobBot_(req) {
  if (!cobBotClaveOk_(req.clave)) throw error_('No autorizado.', 'SIN_ADMIN');
  const op = s_(req.op), chat = s_(req.chat_id);
  // freno: 40 pedidos por minuto por chat
  if (chat) { const cache = CacheService.getScriptCache(), k = 'cobbot|' + chat, n = Number(cache.get(k) || 0); if (n > 40) throw error_('Demasiados mensajes seguidos. Espere un minuto.'); cache.put(k, String(n + 1), 60); }
  if (op === 'cola') return cobBotCola_();
  if (op === 'entregado') return cobBotEntregado_(req);
  if (op === 'vincular') return cobBotVincular_(req);
  const v = cobVinculoChat_(chat);
  if (!v) return { vinculado: false, mensaje: 'Este chat no está vinculado a ningún apartamento. Pida su enlace a la administración.' };
  const torre = v.torre, apto = v.apartamento, K = ctbLib_();
  if (op === 'desvincular') { ctbConLock_(() => ctbActualizar_('vinculos', v._fila, { estado: 'desvinculado' })); return { ok: true, mensaje: 'Listo. Este chat ya no está vinculado al apto. ' + apto + '.' }; }
  if (op === 'estado') return cobBotEstado_(torre, apto, v);
  if (op === 'leer') return cobBotLeer_(req);
  if (op === 'aviso') return cobBotAviso_(req, torre, apto, v);
  if (op === 'recibo') return cobBotRecibo_(req, torre, apto);
  if (op === 'hablar') {
    const texto = s_(req.texto).replace(/\s+/g, ' ').slice(0, 800); if (texto.length < 3) throw error_('Escriba su mensaje.');
    ctbConLock_(() => ctbAgregar_('gestiones', { id: idNuevo_('GES'), torre: torre, fecha: Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm"), apartamento: apto, tipo: 'telegram', canal: 'telegram', direccion: 'entrante',
      resultado: 'contactado', nota: texto, proxima: Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'), creado_por: 'Bot de Cobros', creado_en: ahora_(), estado: 'activa' }));
    return { ok: true, torre: torre, apartamento: apto, mensaje: 'Recibimos su mensaje. El equipo de cobros le responde por aquí o le llama.' };
  }
  throw error_('Operación desconocida.');
}
function cobBotVincular_(req) {
  const codigo = s_(req.codigo), chat = s_(req.chat_id);
  if (!/^c[A-Za-z0-9]{20}$/.test(codigo) || !/^-?\d+$/.test(chat)) throw error_('Este enlace no es válido. Pida uno nuevo a la administración.');
  return ctbConLock_(() => {
    const v = ctbLeer_('vinculos').find(x => x.codigo === codigo);
    if (!v || v.estado !== 'invitado') throw error_('Este enlace ya se usó o no es válido. Pida uno nuevo a la administración.');
    if (s_(v.vence) < Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd')) throw error_('Este enlace venció. Pida uno nuevo a la administración.');
    // un chat = un apartamento a la vez; el anterior queda desvinculado
    // un chat = un apartamento y un apartamento = un chat: se desvincula el chat anterior del apto (p. ej. el dueño que vendió) y lo que este chat tuviera
    ctbLeer_('vinculos').filter(x => x.estado === 'vinculado' && (s_(x.chat_id) === chat || (mismaTorre_(x.torre, v.torre) && x.apartamento === v.apartamento)))
      .forEach(x => ctbActualizar_('vinculos', x._fila, { estado: 'desvinculado' }));
    ctbActualizar_('vinculos', v._fila, { chat_id: chat, nombre: s_(req.nombre).slice(0, 80), usuario: s_(req.usuario).slice(0, 60), vinculado_en: ahora_(), estado: 'vinculado', codigo: '' });
    ctbAuditar_(v.torre, { nombre: 'Bot de Cobros' }, 'vincular', 'vinculos', v.apartamento, null, { chat: '…' + chat.slice(-4) });
    return { vinculado: true, torre: v.torre, apartamento: v.apartamento, mensaje: '✅ Listo. Este chat quedó vinculado al apto. ' + v.apartamento + ' de ' + v.torre + '.' };
  });
}
function cobBotEstado_(torre, apto, v) {
  const K = ctbLib_(), cfg = ctbConfig_(torre), rs = ctbLeer_('recibos', torre), ks = ctbLeer_('cobros', torre);
  const ec = K.estadoCuenta(apto, rs, ks, null, cfg), hoy = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const pend = ctbLeer_('notificados', torre).filter(n => n.apartamento === apto && n.estado === 'pendiente').map(n => ({ fecha: n.fecha, monto: n.monto }));
  return { vinculado: true, torre: torre, apartamento: apto, hoy: hoy, deuda: ec.deuda, a_favor: ec.a_favor, saldo: ec.saldo, por_clase: ec.por_clase.map(x => ({ clase: x.clase, nombre: x.nombre, deuda: x.deuda, vencido: x.vencido })),
    partidas: ec.partidas.map(x => ({ key: x.key, clase: x.clase, nombre: K.nombreClase(x.clase), concepto: x.concepto, periodo: x.periodo, mes: K.nombreMes(x.periodo), vence: x.vence, vencida: x.vence < hoy, saldo: x.saldo })),
    avisos_pendientes: pend, banco: s_(cfg.banco_cuenta_texto || '') };
}
/** La IA lee el comprobante (monto, fecha, banco, referencia). El residente lo confirma o lo corrige en el bot antes de enviarlo. */
function cobBotLeer_(req) {
  const a = req.archivo || {};
  if (!a.base64 || !/^(image\/(png|jpe?g|webp)|application\/pdf)$/.test(s_(a.mime))) throw error_('Envíe una foto o un PDF del comprobante.');
  if (a.base64.length > 7000000) throw error_('El comprobante pesa demasiado (máximo 5 MB).');
  if (typeof claude_ !== 'function') return { leido: false };
  const bloque = s_(a.mime) === 'application/pdf' ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: a.base64 } } : { type: 'image', source: { type: 'base64', media_type: s_(a.mime).replace('jpg', 'jpeg'), data: a.base64 } };
  try {
    const r = claude_('Usted lee comprobantes de pago bancarios de la República Dominicana. Responda solo JSON.', [bloque, { type: 'text', text:
      'Del comprobante, extraiga: {"monto": número en pesos sin comas, "fecha": "aaaa-mm-dd", "banco": "nombre corto del banco de origen", "referencia": "número de referencia o confirmación", "confianza": "alta|media|baja"}. Si un dato no aparece, use null. Solo el JSON.' }], 300);
    const j = JSON.parse(s_(r.texto).replace(/^[^{]*/, '').replace(/[^}]*$/, ''));
    const fecha = ctbFechaOk_(s_(j.fecha)) ? s_(j.fecha) : '', monto = ctbNum_(j.monto);
    return { leido: true, monto: monto > 0 ? monto : null, fecha: fecha || null, banco: s_(j.banco).slice(0, 40) || null, referencia: s_(j.referencia).slice(0, 60) || null, confianza: s_(j.confianza) };
  } catch (e) { return { leido: false }; }
}
function cobBotAviso_(req, torre, apto, v) {
  const monto = ctbNum_(req.monto), fecha = s_(req.fecha);
  if (!(monto > 0) || monto > 5000000) throw error_('El monto no es válido.');
  if (!ctbFechaOk_(fecha)) throw error_('La fecha no es válida.');
  const K = ctbLib_();
  // lo que el residente dice que paga (art. 1253): partidas suyas con saldo
  const ec = K.estadoCuenta(apto, ctbLeer_('recibos', torre), ctbLeer_('cobros', torre), null, ctbConfig_(torre));
  const validas = ec.partidas.map(x => x.key), destino = (req.destino || []).map(s_).filter(k => validas.indexOf(k) >= 0).slice(0, 60);
  return ctbConLock_(() => {
    const recientes = ctbLeer_('notificados', torre).filter(n => n.apartamento === apto && Date.now() - new Date(n.fecha_aviso + 'T12:00:00').getTime() < 864e5);
    if (recientes.length >= 5) throw error_('Ya recibimos varios avisos de este apartamento hoy. La administración los está revisando.');
    let url = '';
    const a = req.archivo;
    if (a && a.base64) {
      if (!/^(image\/(png|jpe?g|webp)|application\/pdf)$/.test(s_(a.mime))) throw error_('El comprobante debe ser una foto o un PDF.');
      if (a.base64.length > 7000000) throw error_('El comprobante pesa demasiado (máximo 5 MB).');
      url = ctbCarpetaComprobantes_().createFile(Utilities.newBlob(Utilities.base64Decode(a.base64), a.mime, (torre + ' · ' + apto + ' · ' + fecha + ' · bot').slice(0, 120))).getUrl();
    }
    const obj = { id: idNuevo_('NOT'), torre: torre, fecha: fecha, fecha_aviso: Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'), apartamento: apto, monto: monto, banco: s_(req.banco).slice(0, 60),
      referencia: s_(req.referencia).slice(0, 80), nombre: s_(v.nombre).slice(0, 80), comprobante_url: url, canal: 'bot', estado: 'pendiente', destino: destino, chat_id: s_(v.chat_id), ia: req.ia || {} };
    ctbAgregar_('notificados', obj);
    ctbAuditar_(torre, { nombre: 'Residente apto. ' + apto + ' (bot)' }, 'notificar', 'notificados', obj.id, null, { monto: monto, fecha: fecha, destino: destino });
    const quePaga = destino.length ? ec.partidas.filter(x => destino.indexOf(x.key) >= 0).map(x => K.nombreClase(x.clase) + ' ' + K.nombreMes(x.periodo)).join(', ') : 'lo vencido más antiguo (orden de ley)';
    return { ok: true, id: obj.id, torre: torre, apartamento: apto, mensaje: '✅ Recibimos su aviso de ' + cobDinero_(monto) + ' para: ' + quePaga + '. La administración lo compara con el banco y le enviamos su recibo por aquí.' };
  });
}
function cobBotRecibo_(req, torre, apto) {
  const K = ctbLib_(), D = { recibos: ctbLeer_('recibos', torre), cobros: ctbLeer_('cobros', torre), config: ctbConfig_(torre) };
  let html, nombre;
  if (s_(req.cual) === 'estado') {
    const ec = K.estadoCuenta(apto, D.recibos, D.cobros, null, D.config);
    html = '<html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;color:#13293D;font-size:12px;margin:28px}h1{font-size:18px;color:#003A75;margin:0}table{width:100%;border-collapse:collapse;margin:8px 0}td,th{border-bottom:1px solid #DCE3EC;padding:6px;text-align:left}.n{text-align:right}h2{font-size:12px;text-transform:uppercase;color:#5A6B78;margin:16px 0 4px}</style></head><body>' +
      '<h1>' + cobEsc_(torre) + '</h1><p>Estado de cuenta · apto. <b>' + cobEsc_(apto) + '</b> · al ' + Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy') + '</p><h2>Pendiente por clase</h2><table>' +
      (ec.por_clase.length ? ec.por_clase.map(x => '<tr><td>' + cobEsc_(x.nombre) + '</td><td class="n">' + cobDinero_(x.deuda) + '</td><td class="n">vencido ' + cobDinero_(x.vencido) + '</td></tr>').join('') : '<tr><td>Sin saldo pendiente</td></tr>') + '</table>' +
      '<h2>Detalle</h2><table><tr><th>Mes</th><th>Clase</th><th>Concepto</th><th>Vence</th><th class="n">Pendiente</th></tr>' + ec.partidas.map(x => '<tr><td>' + cobEsc_(K.nombreMes(x.periodo)) + '</td><td>' + cobEsc_(K.nombreClase(x.clase)) + '</td><td>' + cobEsc_(x.concepto) + '</td><td>' + cobEsc_(x.vence) + '</td><td class="n">' + cobDinero_(x.saldo) + '</td></tr>').join('') + '</table>' +
      (ec.a_favor ? '<p>Saldo a favor: ' + cobDinero_(ec.a_favor) + '</p>' : '') + '</body></html>';
    nombre = 'Estado de cuenta ' + torre + ' apto ' + apto + '.pdf';
  } else {
    const k = D.cobros.filter(x => x.apartamento === apto && x.estado !== 'anulado' && x.origen !== 'cruce').sort((a, b) => s_(a.fecha).localeCompare(s_(b.fecha))).pop();
    if (!k) return { ok: false, mensaje: 'Todavía no hay pagos aplicados a su apartamento en el sistema.' };
    html = cobHtmlRecibo_(torre, k, D); nombre = 'Constancia ' + k.id + '.pdf';
  }
  const pdf = Utilities.newBlob(html, 'text/html', 'x.html').getAs('application/pdf');
  return { ok: true, nombre: nombre, base64: Utilities.base64Encode(pdf.getBytes()) };
}
/** Cola para el bot: mensajes de Telegram pendientes (recibos, encuestas, recordatorios) y avisos nuevos para el grupo de cobros. */
function cobBotCola_() {
  const ms = ctbLeer_('mensajes').filter(m => m.canal === 'telegram' && m.estado === 'pendiente').slice(0, 15).map(m => {
    let pdf = '';
    if (m.archivo_id) try { const b = DriveApp.getFileById(m.archivo_id).getBlob(); if (b.getBytes().length < 8e6) pdf = Utilities.base64Encode(b.getBytes()); } catch (e) { pdf = ''; }
    return { id: m.id, chat_id: m.destino, texto: m.texto, pdf: pdf, nombre: 'Constancia ' + (m.cobro_id || '') + '.pdf', tipo: m.tipo };
  });
  // avisos de pago nuevos (para el grupo de cobros): los de las últimas 48 horas que el bot todavía no anunció
  const nuevos = ctbLeer_('notificados').filter(n => n.estado === 'pendiente' && !n.anunciado_en && Date.now() - new Date(n.fecha_aviso + 'T12:00:00').getTime() < 2 * 864e5).slice(0, 10)
    .map(n => ({ id: n.id, torre: n.torre, apartamento: n.apartamento, monto: n.monto, fecha: n.fecha, canal: n.canal, banco: n.banco }));
  const entrantes = ctbLeer_('gestiones').filter(g => g.direccion === 'entrante' && g.creado_por === 'Bot de Cobros' && !g.anunciado_en && Date.now() - new Date(g.creado_en).getTime() < 2 * 864e5).slice(0, 10)
    .map(g => ({ id: g.id, torre: g.torre, apartamento: g.apartamento, texto: g.nota }));
  return { mensajes: ms, avisos: nuevos, entrantes: entrantes, grupo: s_(config_().COBROS_CHAT_ID) };
}
function cobBotEntregado_(req) {
  return ctbConLock_(() => {
    const est = req.estados || {}, todos = ctbLeer_('mensajes');
    Object.keys(est).forEach(id => { const m = todos.find(x => x.id === id); if (!m || m.estado !== 'pendiente') return;
      const ok = est[id] === 'enviado'; ctbActualizar_('mensajes', m._fila, ok ? { estado: 'entregado', enviado_en: ahora_(), entregado_en: ahora_() } : { estado: 'fallido', error: s_(est[id]).slice(0, 200) }); });
    const an = (req.anunciados || []).map(s_);
    if (an.length) {
      ctbLeer_('notificados').filter(n => an.indexOf(n.id) >= 0 && !n.anunciado_en).forEach(n => ctbActualizar_('notificados', n._fila, { anunciado_en: ahora_() }));
      ctbLeer_('gestiones').filter(g => an.indexOf(g.id) >= 0 && !g.anunciado_en).forEach(g => ctbActualizar_('gestiones', g._fila, { anunciado_en: ahora_() }));
    }
    if (s_(req.grupo) && /^-\d+$/.test(s_(req.grupo))) { const f = leer_('Config').filas.find(r => s_(r.clave) === 'COBROS_CHAT_ID'); if (f) actualizar_('Config', f._fila, { valor: s_(req.grupo) }); else agregar_('Config', { clave: 'COBROS_CHAT_ID', valor: s_(req.grupo), descripcion: 'Grupo de Telegram de cobros (lo escribe el Bot de Cobros)' }); }
    return { ok: true };
  });
}

// ------------------------------------------------------------------ reporte a la medida de varias torres
function accionCobReporte_(req, admin) {
  const K = ctbLib_(), f = req.filtros || {};
  const pedidas = (req.torres || []).map(s_), todas = torresActivas_().filter(t => enAlcance_(admin, t.torre)).map(t => t.torre);
  const torres = (pedidas.length ? todas.filter(t => pedidas.some(p => mismaTorre_(p, t))) : todas).slice(0, 60);
  if (!torres.length) throw error_('Elija al menos una torre.');
  const rec = ctbLeer_('recibos'), cob = ctbLeer_('cobros');
  const aptosDe = {}; leer_('Apartamentos').filas.filter(a => !esNo_(a.activo)).forEach(a => { (aptosDe[s_(a.torre)] = aptosDe[s_(a.torre)] || []).push(s_(a.apartamento).toUpperCase()); });
  const porTorre = torres.map(t => {
    const D = { recibos: rec.filter(r => mismaTorre_(r.torre, t)), cobros: cob.filter(k => mismaTorre_(k.torre, t)), config: ctbConfig_(t), aptos: Object.keys(aptosDe).filter(k => mismaTorre_(k, t)).reduce((l, k) => l.concat(aptosDe[k]), []) };
    const r = K.reporteMedida(D, f);
    return { torre: t, total: r.resumen.total, resumen: r.resumen, filas: r.filas, columnas: r.columnas, titulo: r.titulo };
  });
  return { torres: porTorre, titulo: porTorre[0] ? porTorre[0].titulo : '', total: Math.round(porTorre.reduce((s, x) => s + Math.round(x.total * 100), 0)) / 100 };
}

// ------------------------------------------------------------------ registro
Object.assign(ACCIONES_CENTRAL, {
  ctb_contacto: req => conAdmin_(req, accionCobContacto_),
  ctb_contactos_importar: req => conAdmin_(req, accionCobContactosImportar_),
  ctb_gestion: req => conAdmin_(req, accionCobGestion_),
  ctb_gestion_anular: req => conAdmin_(req, accionCobGestionAnular_),
  ctb_mensaje: req => conAdmin_(req, accionCobMensaje_),
  ctb_mensaje_estado: req => conAdmin_(req, accionCobMensajeEstado_),
  ctb_recibo_reenviar: req => conAdmin_(req, accionCobReciboReenviar_),
  ctb_bot_invitar: req => conAdmin_(req, accionCobBotInvitar_),
  ctb_bot_desvincular: req => conAdmin_(req, accionCobBotDesvincular_),
  ctb_reporte: req => conAdmin_(req, accionCobReporte_),
  ctb_encuesta_info: accionCobEncuestaInfo_,           // público, con el enlace de la encuesta
  ctb_encuesta_responder: accionCobEncuestaResponder_, // público, con el enlace de la encuesta
  ctb_bot: accionCobBot_,                              // Bot de Cobros, con la clave CTB_CLAVE_BOT
});
Object.assign(ACCESO_ACCION, {
  ctb_contacto: ['tor_contabilidad', 3], ctb_contactos_importar: ['tor_contabilidad', 3], ctb_gestion: ['tor_contabilidad', 3], ctb_gestion_anular: ['tor_contabilidad', 3],
  ctb_mensaje: ['tor_contabilidad', 3], ctb_mensaje_estado: ['tor_contabilidad', 3], ctb_recibo_reenviar: ['tor_contabilidad', 3], ctb_bot_invitar: ['tor_contabilidad', 3],
  ctb_bot_desvincular: ['tor_contabilidad', 3], ctb_reporte: ['tor_contabilidad', 1],
});
