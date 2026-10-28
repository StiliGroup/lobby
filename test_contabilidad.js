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
igual([a.aplicaciones[0].monto, a.aplicaciones[0].descuento, a.a_favor], [4770, 530, 0], 'pronto pago 10 % cubre el recibo');
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
igual(mora.map(m => [m.apartamento, m.total]), [['1A', 206], ['1B', 80], ['2A', 200]], 'mora 2 % sobre todo lo vencido después de 10 días de gracia');
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

console.log((mal ? '✗ ' : '✓ ') + ok + ' pruebas bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
