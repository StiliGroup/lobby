// Pruebas de stili-contabilidad.js · node test_contabilidad.js
const K = require('./stili-contabilidad.js');
let ok = 0, mal = 0;
const igual = (a, b, msg) => { const A = JSON.stringify(a), B = JSON.stringify(b); if (A === B) ok++; else { mal++; console.log('✗ ' + msg + '\n   obtuvo ' + A + '\n   espera ' + B); } };
const cierto = (v, msg) => igual(!!v, true, msg);

// 1 · reparto
const aptos = ['1A', '1B', '2A'];
igual(K.repartir({ reparto: 'igual', monto: 5000 }, aptos), { '1A': 5000, '1B': 5000, '2A': 5000 }, 'reparto igual');
const rp = K.repartir({ reparto: 'parametro', parametro: 'm2', monto: 100 }, aptos, { m2: { '1A': 1, '1B': 1, '2A': 1 } });
igual(Math.round((rp['1A'] + rp['1B'] + rp['2A']) * 100), 10000, 'reparto por m² suma exacto (100 / 3)');
igual(K.repartir({ reparto: 'parametro', parametro: 'm2', monto: 1000 }, aptos, { m2: { '1A': 100, '1B': 100, '2A': 200 } }), { '1A': 250, '1B': 250, '2A': 500 }, 'reparto proporcional');
igual(K.repartir({ reparto: 'medidor', precio: 50, lecturas: { '1A': { anterior: 10, actual: 14 }, '1B': { anterior: 5, actual: 5 } } }, aptos), { '1A': 200, '1B': 0, '2A': 0 }, 'reparto por medidor');

// 2 · recibos
const conceptos = [
  { id: 'k1', periodo: '2026-09', nombre: 'Mantenimiento', rubro: 'I1.1', reparto: 'igual', monto: 5000, tipo: 'ordinaria' },
  { id: 'k2', periodo: '2026-09', nombre: 'Gas', rubro: 'I1.2', reparto: 'medidor', precio: 100, lecturas: { '1A': { anterior: 0, actual: 3 } }, tipo: 'ordinaria' },
];
const prev = K.armarRecibos({ periodo: '2026-09', conceptos, aptos, config: { vence_dia: 15 }, emision: '2026-09-01' });
igual(prev.length, 3, 'un recibo por apartamento');
igual(prev[0].total, 5300, 'recibo 1A con gas');
igual(prev[0].vence, '2026-09-15', 'vencimiento');
const num = K.numerar(prev, { serie_prefijo: 'R', serie_siguiente: 7 });
igual([num.recibos[0].numero, num.siguiente], ['R000007', 10], 'numeración');
const recibos = num.recibos.map((r, i) => Object.assign(r, { id: 'r' + i }));

// 3 · cobros: pronto pago, parcial, a favor
const cfg = { pp_porcentaje: 10, pp_dia: 5, vence_dia: 15 };
let pend = K.conSaldo(recibos, []);
let a = K.aplicarCobro({ monto: 4770, fecha: '2026-09-04', pendientes: pend.filter(r => r.apartamento === '1A'), config: cfg });
// v3.2 · el pronto pago es solo sobre la cuota ordinaria (5,000 → 500 de descuento); el gas (300) es otra clase y se paga aparte
igual(a.aplicaciones.map(x => [x.clase, x.monto, x.descuento]).concat([a.a_favor]), [['ordinaria', 4500, 500], ['gas', 270, 0], 0], 'pronto pago 10 % sobre la ordinaria; el resto va al gas');
a = K.aplicarCobro({ monto: 4770, fecha: '2026-09-10', pendientes: pend.filter(r => r.apartamento === '1A'), config: cfg });
igual([a.aplicaciones[0].monto, a.aplicaciones[0].descuento], [4770, 0], 'fuera de plazo: abono parcial sin descuento');
a = K.aplicarCobro({ monto: 6000, fecha: '2026-09-20', pendientes: pend.filter(r => r.apartamento === '1B'), config: cfg });
igual(a.a_favor, 1000, 'sobrante queda a favor');
const cobros = [{ id: 'c1', fecha: '2026-09-20', apartamento: '1B', monto: 6000, cuenta_id: 'b1', aplicaciones: a.aplicaciones, a_favor: a.a_favor, descuento: 0 }];
igual(K.aFavor(cobros), { '1B': 1000 }, 'saldo a favor');
const ec = K.estadoCuenta('1B', recibos, cobros);
igual([ec.deuda, ec.a_favor, ec.saldo], [0, 1000, -1000], 'estado de cuenta con anticipo');

// 4 · cruce de anticipo con el mes siguiente
const oct = K.armarRecibos({ periodo: '2026-10', conceptos: [Object.assign({}, conceptos[0], { periodo: '2026-10' })], aptos, config: cfg, emision: '2026-10-01' }).map((r, i) => Object.assign(r, { id: 'o' + i, numero: 'R1' + i }));
const todos = recibos.concat(oct);
const cr = K.cruzarAnticipo({ apartamento: '1B', disponible: 1000, pendientes: K.conSaldo(todos, cobros).filter(r => r.apartamento === '1B'), fecha: '2026-10-01' });
igual([cr.monto, cr.aplicaciones[0].recibo_id], [1000, 'o1'], 'cruce aplica el anticipo al recibo de octubre');
const cobros2 = cobros.concat([Object.assign({ id: 'x1' }, cr)]);
igual(K.aFavor(cobros2), { '1B': 0 }, 'anticipo consumido');
igual(K.estadoCuenta('1B', todos, cobros2).deuda, 4000, 'deuda tras el cruce');

// 5 · antigüedad y mora
const ant = K.antiguedad(todos, cobros2, '2026-12-01');
const fila2A = ant.filas.find(f => f.apartamento === '2A');
igual([fila2A.d90, fila2A.d60, fila2A.d30, fila2A.total], [5000, 5000, 0, 10000], 'antigüedad 2A: septiembre 77 días (61–90), octubre 47 (31–60)');
const mora = K.calcularMora({ recibos: todos, cobros: cobros2, config: { mora_tipo: 'porcentaje', mora_valor: 2, mora_dias_gracia: 10 }, periodo: '2026-11', fecha: '2026-11-01' });
// v3.2 · la mora se calcula sobre ordinaria y extraordinaria (no sobre el gas del 1A)
igual(mora.map(m => [m.apartamento, m.total]), [['1A', 200], ['1B', 80], ['2A', 200]], 'mora 2 % sobre lo vencido de ordinaria/extraordinaria después de 10 días de gracia');
igual(K.calcularMora({ recibos: todos, cobros: cobros2, config: { mora_tipo: 'porcentaje', mora_valor: 2, mora_dias_gracia: 10, mora_clases: 'ordinaria,extraordinaria,gas' }, periodo: '2026-11', fecha: '2026-11-01' })[0].total, 206, 'mora sobre el gas si la torre lo dice');
igual(K.calcularMora({ recibos: todos.concat([Object.assign({}, mora[0], { id: 'm1' })]), cobros: cobros2, config: { mora_tipo: 'fijo', mora_valor: 500 }, periodo: '2026-11', fecha: '2026-11-01' }).map(m => m.apartamento), ['1B', '2A'], 'mora fija: no repite al 1A que ya tiene mora en el mes');

// 6 · libro, conciliación
const D = {
  cuentas: [{ id: 'b1', nombre: 'BDI corriente', tipo: 'banco', saldo_inicial: 100000, fecha_inicial: '2026-09-01' }, { id: 'cc', nombre: 'Caja chica', tipo: 'caja_chica', saldo_inicial: 0, fecha_inicial: '2026-09-01' }],
  recibos: todos, cobros: cobros2,
  sin_identificar: [{ id: 's1', fecha: '2026-09-25', monto: 2500, cuenta_id: 'b1', estado: 'pendiente', referencia: 'DEP99' }],
  ingresos: [], gastos: [{ id: 'g1', tipo: 'transferencia', fecha: '2026-09-10', monto: 5000, cuenta_id: 'b1', destino_id: 'cc', detalle: 'Apertura' }, { id: 'g2', tipo: 'gasto', fecha: '2026-09-12', monto: 800, cuenta_id: 'cc', rubro: 'E9.1', detalle: 'Cloro' }],
  pagos: [{ id: 'p1', suplidor: 'Elevadores SRL', monto: 12000, estado: 'pagada', pagado_en: '2026-09-28', cuenta_id: 'b1', rubro: 'E3.1', cheque: '1050', fecha: '2026-09-05' },
    { id: 'p2', suplidor: 'Edesur', monto: 9000, estado: 'pendiente', cuenta_id: 'b1', rubro: 'E1.2', fecha: '2026-09-20' }],
  rubros: K.rubrosBase(),
};
igual(K.saldoCuenta('b1', D, '2026-09-30'), 100000 + 6000 + 2500 - 5000 - 12000, 'saldo del banco en libros');
igual(K.saldoCuenta('cc', D, '2026-09-30'), 4200, 'saldo de caja chica');
const extracto = [
  { id: 'e1', cuenta_id: 'b1', fecha: '2026-09-21', monto: 6000, referencia: '' },
  { id: 'e2', cuenta_id: 'b1', fecha: '2026-09-25', monto: 2500, referencia: 'DEP99' },
  { id: 'e3', cuenta_id: 'b1', fecha: '2026-09-10', monto: -5000, referencia: '' },
  { id: 'e4', cuenta_id: 'b1', fecha: '2026-09-30', monto: -350, referencia: '', descripcion: 'Comisión' },
];
const cc = K.conciliar({ cuentaId: 'b1', d: D, periodo: '2026-09', extracto, saldoBanco: 103150 });
igual([cc.emparejados.length, cc.no_cobrados.length, cc.total_no_cobrados, cc.banco_debitos.length], [3, 1, 12000, 1], 'conciliación: cheque no cobrado y comisión del banco');
igual([cc.saldo_calculado, cc.diferencia, cc.lista], [103150, 0, false], 'diferencia en cero pero falta registrar la comisión');

// 6b · arqueo de caja chica
const aq = K.conciliar({ cuentaId: 'cc', d: D, periodo: '2026-09', extracto: [], saldoBanco: 4200 });
igual([aq.arqueo, aq.diferencia, aq.lista, aq.emparejados.length], [true, 0, true, 2], 'arqueo de caja chica cuadra');
igual(K.conciliar({ cuentaId: 'cc', d: D, periodo: '2026-09', extracto: [], saldoBanco: 4000 }).diferencia, -200, 'arqueo con faltante');

// 7 · liquidación, por rubro, proyección
D.conciliaciones = [{ cuenta_id: 'b1', periodo: '2026-09', saldo_banco: 103150, no_cobrados: 12000 }];
const lq = K.liquidacion(D, '2026-09');
igual([lq.A, lq.B, lq.D], [103150 + 4200, 12000, 9000], 'liquidación A, B, D');
igual(lq.saldo_financiero, lq.A - lq.B - lq.D + lq.F - lq.G, 'saldo financiero = C − D + F − G');
const pr = K.porRubro(D, '2026-09-01', '2026-09-30');
igual([pr.filas.find(f => f.rubro === 'I1.1').monto, pr.filas.find(f => f.rubro === 'ANT').monto, pr.egresos], [5000, 1000, 12800], 'ingresos y egresos por rubro');
const py = K.proyeccion(D, '2026-10-15');
igual(py.meses.length, 3, 'proyección de 3 meses');
cierto(py.tasa_cobranza > 0, 'tasa de cobranza calculada');

// 8 · acuerdos
const plan = K.planCuotas(10000, 3, '2026-10-30');
igual(plan.map(q => q.monto), [3333.33, 3333.33, 3333.34], 'plan de 3 cuotas');
igual(plan.map(q => q.vence), ['2026-10-30', '2026-11-30', '2026-12-30'], 'fechas del plan');
const acu = { apartamento: '2A', fecha: '2026-10-01', cuotas: plan, estado: 'vigente' };
igual(K.estadoAcuerdo(acu, [], '2026-11-05').estado, 'incumplido', 'acuerdo incumplido');
igual(K.estadoAcuerdo(acu, [{ apartamento: '2A', fecha: '2026-10-29', monto: 3333.33 }], '2026-11-05').estado, 'vigente', 'acuerdo al día');

// 9 · Vigía de cobros
const v = K.vigiaCobros({ cobros: [{ id: 'a', apartamento: '1A', fecha: '2026-10-02', monto: 5000, referencia: 'T1' }, { id: 'b', apartamento: '3C', fecha: '2026-10-09', monto: 5000, referencia: 'T1' }], recibos: [], sin_identificar: D.sin_identificar }, '2026-10-20');
igual(v.map(x => x.regla).sort(), ['C1', 'C4'], 'vigía: repetido y depósito viejo');

// 10 · partida doble cuadra
const b = K.balances(D, '2026-10-31', '2026-09-01');
cierto(b.cuadra, 'el balance cuadra (débitos = créditos)');
K.asientos(D).forEach(x => { const d = x.lineas.reduce((s, l) => s + K.c(l.debe), 0), h = x.lineas.reduce((s, l) => s + K.c(l.haber), 0); if (d !== h) { mal++; console.log('✗ asiento descuadrado', x); } else ok++; });
igual(b.resultados.gastos, 12000 + 9000 + 800, 'gastos del estado de resultados (incluye la factura pendiente de Edesur, base devengada)');

// 11 · Junta, honorarios, extracto
igual([K.requiereJunta(50000, { umbral_junta: 50000 }), K.requiereJunta(49999, { umbral_junta: 50000 }), K.requiereJunta(1e6, {})], [true, false, false], 'umbral de la Junta');
igual(K.honorario({ honorario_monto: 25000 }, '2026-11', 'Torre X').concepto, 'Honorarios de administración de noviembre de 2026', 'honorario del mes');
const ex = K.leerExtracto([['Banco BDI'], ['Fecha', 'Descripción', 'Referencia', 'Débito', 'Crédito'], ['05/09/2026', 'Depósito', '123', '', '5,000.00'], ['06/09/2026', 'Cheque', '1050', '12,000.00', ''], ['', 'Total', '', '', '']]);
igual(ex.movimientos.map(m => [m.fecha, m.monto]), [['2026-09-05', 5000], ['2026-09-06', -12000]], 'lectura del estado del banco');
igual(K.enlacePago({ pasarela_url: 'https://pagar.x/?r={recibo}&m={monto}' }, { numero: 'R000007', saldo: 5300 }), 'https://pagar.x/?r=R000007&m=5300', 'enlace de pago');

// 12 · correcciones de la revisión
const r1084 = { id: 'q', periodo: '2026-09', tipo: 'ordinaria', total: 1084.5, saldo: 1084.5, pagado: 0, pagado_cobros: 0 };
igual(K.montoProntoPago(r1084, { pp_porcentaje: 3 }), 1051.97, 'monto impreso con pronto pago = total − descuento');
igual(K.aplicarCobro({ monto: 1051.96, fecha: '2026-09-02', pendientes: [r1084], config: { pp_porcentaje: 3, pp_dia: 5 } }).aplicaciones[0].descuento, 32.54, 'tolerancia de 1 centavo conserva el descuento');
igual(K.descuentoProntoPago(Object.assign({}, r1084, { pagado: 100, pagado_cobros: 0 }), '2026-09-02', { pp_porcentaje: 3, pp_dia: 5 }), 32.53, 'un cruce de anticipo no quita el pronto pago');
igual(K.leerCSV('Fecha,Descripción,Monto\n05/09/2026,"Depósito, efectivo","12,500.00"\n').slice(1, 2), [['05/09/2026', 'Depósito, efectivo', '12,500.00']], 'CSV con comillas');
igual(K.leerExtracto(K.leerCSV('Fecha,Descripción,Monto\n05/09/2026,"Depósito","12,500.00"\n')).movimientos[0].monto, 12500, 'monto con coma de miles dentro de comillas');
const acuR = { apartamento: '2A', fecha: '2026-10-01', recibos: ['rX'], cuotas: [{ vence: '2026-10-30', monto: 1000 }], estado: 'vigente' };
igual(K.estadoAcuerdo(acuR, [{ apartamento: '2A', fecha: '2026-10-05', monto: 5000, aplicaciones: [{ recibo_id: 'rOtro', monto: 5000 }] }], '2026-11-05').estado, 'incumplido', 'acuerdo no cuenta el pago de la cuota corriente');
const Dpre = { cuentas: [{ id: 'b', tipo: 'banco', saldo_inicial: 1000, fecha_inicial: '2026-09-01' }], ingresos: [{ id: 'i', fecha: '2026-08-15', monto: 300, cuenta_id: 'b', rubro: 'I2.5' }], rubros: K.rubrosBase() };
igual([K.saldoCuenta('b', Dpre), K.balances(Dpre, '2026-12-31').filas.find(f => f.cuenta === '1102').saldo], [1000, 1000], 'movimiento previo al saldo inicial: libro y cuenta 1102 coinciden');

// 13 · v3.2 · cobros segregados por clase
{
  const cf = { vence_dia: 10 };
  const rA = { id: 'A1', numero: 'R1', periodo: '2026-08', apartamento: '5B', emision: '2026-08-01', vence: '2026-08-10', tipo: 'ordinaria', total: 9000,
    lineas: [{ concepto: 'Mantenimiento', rubro: 'I1.1', tipo: 'ordinaria', monto: 6000 }, { concepto: 'Extraordinaria techo (1 de 3)', rubro: 'I2.1', tipo: 'extraordinaria', monto: 2000 }, { concepto: 'Fondo de reserva', rubro: 'I4.1', monto: 1000 }] };
  const rB = { id: 'B1', numero: 'R2', periodo: '2026-09', apartamento: '5B', emision: '2026-09-01', vence: '2026-09-10', tipo: 'ordinaria', total: 6500,
    lineas: [{ concepto: 'Mantenimiento', rubro: 'I1.1', monto: 6000 }, { concepto: 'Multa por ruido', rubro: 'I2.3', monto: 500 }] };
  const rM = { id: 'M1', numero: 'R3', periodo: '2026-09', apartamento: '5B', emision: '2026-09-15', vence: '2026-09-10', tipo: 'mora', total: 120, lineas: [{ concepto: 'Mora', rubro: 'I2.4', tipo: 'mora', monto: 120 }] };
  const rs = [rA, rB, rM];
  igual(K.conSaldo(rs, [])[0].lineas.map(l => l.clase), ['ordinaria', 'extraordinaria', 'fondo_reserva'], 'cada línea con su clase');
  // sin declarar qué paga (art. 1256): lo vencido más antiguo primero; con el mismo vencimiento, el orden de clases (la mora al final)
  let ap = K.aplicarCobro({ monto: 10000, fecha: '2026-10-01', pendientes: K.conSaldo(rs, []), config: cf });
  igual(ap.aplicaciones.map(x => [x.recibo_id, x.clase, x.monto]), [['A1', 'ordinaria', 6000], ['A1', 'extraordinaria', 2000], ['A1', 'fondo_reserva', 1000], ['B1', 'ordinaria', 1000]], 'orden legal: agosto completo y luego la ordinaria de septiembre');
  // el residente declara qué paga (art. 1253): solo la extraordinaria y la multa
  ap = K.aplicarCobro({ monto: 2500, fecha: '2026-10-01', pendientes: K.conSaldo(rs, []), config: cf, orden: ['A1#1', 'B1#1'] });
  igual(ap.aplicaciones.map(x => [x.clase, x.monto]).concat([ap.a_favor]), [['extraordinaria', 2000], ['multa', 500], 0], 'paga exactamente lo que el residente eligió');
  ap = K.aplicarCobro({ monto: 700, fecha: '2026-10-01', pendientes: K.conSaldo(rs, []), config: cf, orden: ['mora', 'multa'] });
  igual(ap.aplicaciones.map(x => [x.clase, x.monto]), [['mora', 120], ['multa', 500]], 'elegir por clase');
  igual(ap.a_favor, 80, 'lo que pasa de lo elegido queda a favor');
  const ks = [{ id: 'k1', fecha: '2026-10-01', apartamento: '5B', monto: 2500, aplicaciones: [{ recibo_id: 'A1', linea: 1, monto: 2000 }, { recibo_id: 'B1', linea: 1, monto: 500 }] }];
  const ec = K.estadoCuenta('5B', rs, ks, '2026-10-05');
  igual(ec.por_clase.map(x => [x.clase, x.deuda]), [['ordinaria', 12000], ['fondo_reserva', 1000], ['mora', 120]], 'estado de cuenta por clase, sin mezclar');
  // morosidad solo de cuotas ordinarias
  const mo = K.reporteMedida({ recibos: rs, cobros: ks, aptos: ['5B', '6A'] }, { tipo: 'morosidad', clases: ['ordinaria'], corte: '2026-10-05' });
  igual([mo.resumen.total, mo.filas[0].d60, mo.filas[0].d30, mo.resumen.apartamentos, mo.resumen.de_apartamentos], [12000, 6000, 6000, 1, 2], 'reporte: morosidad solo de ordinarias');
  igual(mo.titulo, 'Morosidad · Cuota ordinaria', 'título del reporte');
  const co = K.reporteMedida({ recibos: rs, cobros: ks }, { tipo: 'cobrado', desde: '2026-10-01', hasta: '2026-10-31' });
  igual(co.filas.map(f => [f.clase, f.total]), [['extraordinaria', 2000], ['multa', 500]], 'reporte: cobrado por clase');
  igual(K.porRubro({ recibos: rs, cobros: ks }, '2026-10-01', '2026-10-31').filas.map(f => [f.rubro, f.monto]), [['I2.1', 2000], ['I2.3', 500]], 'ingresos por rubro sin prorrateo');
  // aplicación vieja (sin línea) se reparte en el orden de clases
  const viejo = [{ id: 'v', fecha: '2026-09-01', apartamento: '5B', monto: 7000, aplicaciones: [{ recibo_id: 'A1', monto: 7000 }] }];
  igual(K.conSaldo(rs, viejo)[0].lineas.map(l => l.saldo), [0, 1000, 1000], 'aplicación vieja: primero la ordinaria');
  // pronto pago solo sobre lo ordinario
  igual(K.descuentoProntoPago(Object.assign({}, rA, { periodo: '2026-08' }), '2026-08-03', { pp_porcentaje: 5, pp_dia: 5 }), 300, 'pronto pago: 5 % de la ordinaria (6,000)');
  igual(K.montoProntoPago(rA, { pp_porcentaje: 5 }), 8700, 'monto con pronto pago');
  // fondo de reserva va al patrimonio, no al resultado
  igual(K.cuentaDeRubro('I4.1', 'ingreso'), '3103', 'fondo de reserva → cuenta 3103');
  // cobranza
  const gs = [
    { id: 'g1', fecha: '2026-10-02T10:00', apartamento: '5B', canal: 'llamada', resultado: 'promesa', duracion_seg: 180, promesa_fecha: '2026-10-05', promesa_monto: 2000, creado_por: 'Ana' },
    { id: 'g2', fecha: '2026-10-02T11:00', apartamento: '6A', canal: 'llamada', resultado: 'no_contesta', creado_por: 'Ana' },
    { id: 'g3', fecha: '2026-10-03T09:00', apartamento: '6A', canal: 'whatsapp', resultado: 'enviado', creado_por: 'Luis' },
    { id: 'g4', fecha: '2026-10-01T09:00', apartamento: '7C', canal: 'llamada', resultado: 'promesa', promesa_fecha: '2026-10-03', creado_por: 'Luis' }];
  const cobs = [{ id: 'p1', fecha: '2026-10-04', apartamento: '5B', monto: 2500 }];
  const msj = [{ canal: 'whatsapp', estado: 'leido', enviado_en: '2026-10-03T09:00:00Z', leido_en: '2026-10-03T09:30:00Z' }, { canal: 'whatsapp', estado: 'entregado', enviado_en: '2026-10-03T09:00:00Z' }, { canal: 'whatsapp', estado: 'manual', enviado_en: '2026-10-03T09:00:00Z' }];
  const enc = [{ enviada_en: '2026-10-02', respondida_en: '2026-10-02', csat: 5, nps: 10, resuelto: 'si', gestor: 'Ana' }, { enviada_en: '2026-10-02', respondida_en: '2026-10-03', csat: 3, nps: 6, resuelto: 'no', gestor: 'Ana' }, { enviada_en: '2026-10-03', gestor: 'Luis' }];
  const m = K.metricasCobranza({ gestiones: gs, cobros: cobs, mensajes: msj, encuestas: enc }, '2026-10-01', '2026-10-31', '2026-10-20');
  igual([m.totales.gestiones, m.totales.contactos, m.totales.promesas, m.totales.cumplidas, m.totales.incumplidas, m.totales.recuperado], [4, 2, 2, 1, 1, 2500], 'métricas: gestiones, contacto, promesas y recuperado');
  igual([m.totales.tasa_contacto, m.totales.tasa_cumplimiento, m.totales.minutos], [50, 50, 3], 'tasas de contacto y de cumplimiento');
  igual([m.whatsapp.con_estado, m.whatsapp.leidos, m.whatsapp.sin_leer, m.whatsapp.manuales, m.whatsapp.tasa_lectura, m.whatsapp.minutos_a_leer], [2, 1, 1, 1, 50, 30], 'WhatsApp: leídos, sin leer y enviados a mano');
  igual([m.encuesta.enviadas, m.encuesta.respondidas, m.encuesta.csat, m.encuesta.satisfechos, m.encuesta.nps, m.encuesta.resuelto], [3, 2, 4, 50, 0, 50], 'encuesta: CSAT, satisfechos, NPS y resolución');
  igual(m.por_gestor.map(g => [g.clave, g.gestiones]), [['Ana', 2], ['Luis', 2]], 'métricas por gestor');
}

console.log((mal ? '✗ ' : '✓ ') + ok + ' pruebas bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
