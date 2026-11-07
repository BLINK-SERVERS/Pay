// Recorre el ciclo completo de Blink Pay contra la base local:
// lote y enrolado (back-office) → registro → reclamo → recarga → aprobación
// del operador → sincronización del validador → entrega al chip → cobro.
// No usa el proyecto de Supabase de producción.
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import assert from "node:assert/strict";
import { Client } from "pg";

const entorno = JSON.parse(
  readFileSync(new URL("./.entorno", import.meta.url), "utf8"),
);

const db = new Client({ connectionString: entorno.baseDatos });
await db.connect();

const paso = (n, texto) => console.log(`\n[${n}] ${texto}`);
const ok = (texto) => console.log(`    ✓ ${texto}`);

async function rpc(nombre, argumentos = {}, llave = entorno.anonKey) {
  const respuesta = await fetch(`${entorno.url}/rest/v1/rpc/${nombre}`, {
    method: "POST",
    headers: {
      apikey: llave,
      Authorization: `Bearer ${llave}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(argumentos),
  });
  const texto = await respuesta.text();
  const dato = texto ? JSON.parse(texto) : null;
  if (!respuesta.ok) {
    throw new Error(`${nombre}: ${dato?.message ?? respuesta.status}`);
  }
  return dato;
}

async function servicio(texto, valores = []) {
  await db.query("begin");
  try {
    await db.query("set local role service_role");
    const resultado = await db.query(texto, valores);
    await db.query("commit");
    return resultado.rows;
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}

async function capturar(fn) {
  try {
    await fn();
    return "";
  } catch (error) {
    return error.message;
  }
}

const MAC_VALIDADOR = "A0B1C2D3E4F5";
let secretoValidador = "";

// El ESP32 firma el cuerpo y el sello de tiempo con su clave del NVS:
// HMAC-SHA256(cuerpo ∥ timestamp), igual que en 0025.
function firmar(cuerpo, sello) {
  return createHmac("sha256", secretoValidador)
    .update(cuerpo + String(sello))
    .digest("hex");
}

async function sincronizar(datos = {}, opciones = {}) {
  const cuerpo = JSON.stringify(datos);
  const sello = opciones.sello ?? Math.floor(Date.now() / 1000);
  const nonce = opciones.nonce ?? crypto.randomUUID();
  const firma = opciones.firma ?? firmar(cuerpo, sello);

  return rpc("bt_validador_sincronizar_firma", {
    p_mac: MAC_VALIDADOR,
    p_cuerpo: cuerpo,
    p_timestamp: sello,
    p_nonce: nonce,
    p_firma: firma,
  });
}

try {
  paso(1, "Back-office: lote de 2 tarjetas y enrolado del chip");
  const [loteFila] = await servicio(
    "select public.bt_generar_lote($1, $2, $3, $4, $5) as r",
    [2, "Simulación", 23, 1, "ESTACION"],
  );
  const lote = loteFila.r;
  const seriales = lote.tarjetas.map((t) => t.serial);
  ok(`lote ${lote.lote.numero}: ${seriales.join(", ")}`);

  const uids = ["04A1B2C3D4E5F6", "04F6E5D4C3B2A1"];
  const [enroladoFila] = await servicio(
    "select public.bt_estacion_enrolar($1, $2::jsonb, $3) as r",
    [
      lote.lote.id,
      JSON.stringify(seriales.map((serial, i) => ({ serial, uid: uids[i] }))),
      "Estación Simulación",
    ],
  );
  assert.equal(enroladoFila.r.rechazadas, 0, "el enrolado no debe rechazar tarjetas");
  ok(`enroladas ${enroladoFila.r.enroladas} tarjetas`);

  paso(2, "Pasajera: registro y reclamo de la primera tarjeta");
  const registro = await rpc("bt_registrar", {
    p_nombres: "Ana",
    p_apellidos: "Simulación",
    p_cedula: "V-20123456",
    p_telefono: "04141234567",
    p_correo: "ana@blink.local",
    p_pin: "258036",
  });
  const token = registro.token;
  assert.ok(token, "el registro debe devolver token");
  ok(`cuenta creada (${registro.cuenta?.nombre ?? "Ana Simulación"})`);

  const reclamo = await rpc("bt_vincular", {
    p_token: token,
    p_serial: seriales[0],
  });
  assert.equal(reclamo.tarjetas.length, 1, "debe quedar una tarjeta en la billetera");
  ok(`tarjeta ${seriales[0]} activa con saldo ${reclamo.tarjetas[0].saldo} Bs`);

  paso(3, "Pasajera: compra 2 pasajes (transfiere Bs 1.060)");
  const recarga = await rpc("bt_recargar_pasajes", {
    p_token: token,
    p_serial: seriales[0],
    p_pasajes: 2,
    p_telefono: "04141234567",
    p_banco: "Banesco",
    p_referencia: "4821",
  });
  assert.equal(recarga.movimiento.estado, "pendiente");
  assert.equal(Number(recarga.cotizacion.total), 1060);
  assert.equal(Number(recarga.cotizacion.acreditado), 1000);
  ok(
    `movimiento ${recarga.movimiento.estado}: «${recarga.movimiento.detalle}» · ` +
      `transfiere ${recarga.cotizacion.total} / acredita ${recarga.cotizacion.acreditado}`,
  );

  paso(4, "Operador: bandeja de recargas pendientes");
  const [bandejaFila] = await servicio(
    "select public.bt_recargas_pendientes(10) as r",
  );
  const pendiente = bandejaFila.r.recargas[0];
  assert.equal(pendiente.monto, 1060);
  assert.equal(pendiente.referencia, "4821");
  const { rows: desglose } = await db.query(
    "select pasajes, monto_base from public.recharges where id = $1",
    [pendiente.recarga],
  );
  assert.equal(desglose[0].pasajes, 2);
  assert.equal(Number(desglose[0].monto_base), 1000);
  ok(`${bandejaFila.r.recargas.length} pendiente(s): ${pendiente.serial} · ${pendiente.banco} · ref ${pendiente.referencia}`);

  paso(5, "Operador: aprueba la recarga");
  const [aprobadaFila] = await servicio(
    "select public.bt_aprobar_recarga($1, $2) as r",
    [pendiente.recarga, "Operador Simulación"],
  );
  assert.equal(aprobadaFila.r.ok, true);
  assert.equal(Number(aprobadaFila.r.saldo), 1000);
  ok(`saldo virtual acreditado: ${aprobadaFila.r.saldo} Bs`);

  paso(6, "Validador: credenciales del equipo y descarga de recargas aprobadas");
  const [tokenFila] = await servicio(
    "select public.bt_validador_emitir_token($1) as r",
    [MAC_VALIDADOR],
  );
  const tokenValidador = tokenFila.r.token;

  const [claveFila] = await servicio(
    "select public.bt_validador_emitir_secreto($1) as r",
    [MAC_VALIDADOR],
  );
  secretoValidador = claveFila.r.secreto;
  assert.equal(claveFila.r.algoritmo, "HMAC-SHA256");
  assert.equal(claveFila.r.ventana_segundos, 30);
  assert.match(secretoValidador, /^[0-9a-f]{64}$/);
  ok("token de sincronización y clave HMAC de 32 bytes emitidos");

  const sync1 = await sincronizar();
  const descargada = sync1.pendientes.find((p) => p.id === pendiente.recarga);
  assert.ok(descargada, "la recarga aprobada debe bajar al validador");
  ok(`descargada ${descargada.serial} por ${descargada.monto} Bs`);

  paso(7, "Chip: aplica la recarga y cobra el pasaje");
  const offlineId = crypto.randomUUID();
  const nonceToque = crypto.randomUUID();
  console.log(
    `    · RECARGA_APLICADA,serial=${descargada.serial},monto=${descargada.monto},id=${descargada.id}`,
  );
  const sync2 = await sincronizar(
    {
      taps: [
        {
          offline_id: offlineId,
          visible_id: descargada.serial,
          fare_charged: 500,
          fare_type: 1,
          chip_balance_after: 500,
          tapped_at: new Date().toISOString(),
        },
      ],
      recargas: [{ id: descargada.id }],
    },
    { nonce: nonceToque },
  );
  assert.equal(sync2.procesadas, 1, "el toque debe procesarse");
  assert.equal(sync2.rechazadas.length, 0);
  assert.equal(sync2.pendientes.length, 0, "no deben quedar recargas sin bajar");
  ok("viaje de 500 Bs registrado y recarga marcada como entregada");

  paso(8, "Verificación en la base y en el portal");
  const { rows: tarjetas } = await db.query(
    "select virtual_balance, last_chip_balance from public.cards where visible_id = $1",
    [seriales[0]],
  );
  assert.equal(Number(tarjetas[0].virtual_balance), 500);
  const { rows: recargas } = await db.query(
    `select status, synced_to_chip, amount, monto_base, pasajes,
            comision_entrada, provision_salida, margen_blink, excedente_redondeo
       from public.recharges where id = $1`,
    [pendiente.recarga],
  );
  assert.equal(recargas[0].status, "aprobado");
  assert.equal(recargas[0].synced_to_chip, true);
  assert.equal(Number(recargas[0].amount), 1060);
  assert.equal(Number(recargas[0].monto_base), 1000);
  assert.equal(recargas[0].pasajes, 2);
  assert.equal(Number(recargas[0].comision_entrada), 15.9);
  assert.equal(Number(recargas[0].provision_salida), 3);
  assert.equal(Number(recargas[0].margen_blink), 40);
  assert.equal(Number(recargas[0].excedente_redondeo), 1.12);
  ok("saldo virtual 500 Bs · recarga aprobada, desglosada y entregada al chip");

  const movimientos = await rpc("bt_movimientos", {
    p_token: token,
    p_serial: seriales[0],
    p_limite: 20,
  });
  const lista = movimientos.movimientos;
  assert.ok(
    lista.some(
      (m) => m.detalle === "Pago Móvil aprobado · 2 pasajes" && m.estado === "aprobado",
    ),
  );
  assert.ok(lista.some((m) => m.tipo === "viaje" && Number(m.monto) === -500));
  ok(`portal: ${lista.length} movimientos (recarga aprobada + viaje)`);

  paso(9, "Rechazo y regla de duplicado");
  await rpc("bt_vincular", { p_token: token, p_serial: seriales[1] });
  await rpc("bt_recargar_pasajes", {
    p_token: token,
    p_serial: seriales[1],
    p_pasajes: 1,
    p_telefono: "04141234567",
    p_banco: "Mercantil",
    p_referencia: "7777",
  });
  const [bandeja2Fila] = await servicio(
    "select public.bt_recargas_pendientes(10) as r",
  );
  const porRechazar = bandeja2Fila.r.recargas.find(
    (r) => r.serial === seriales[1] && r.monto === 530,
  );
  assert.ok(porRechazar, "la recarga de la segunda tarjeta debe estar pendiente");
  const [rechazadaFila] = await servicio(
    "select public.bt_rechazar_recarga($1, $2, $3) as r",
    [porRechazar.recarga, "Operador Simulación", "Referencia no coincide"],
  );
  assert.equal(rechazadaFila.r.ok, true);
  const { rows: segunda } = await db.query(
    "select virtual_balance from public.cards where visible_id = $1",
    [seriales[1]],
  );
  assert.equal(Number(segunda[0].virtual_balance), 0, "un rechazo no acredita saldo");
  ok("recarga rechazada sin tocar el saldo");

  let duplicado = null;
  try {
    await rpc("bt_recargar_pasajes", {
      p_token: token,
      p_serial: seriales[0],
      p_pasajes: 2,
      p_telefono: "04141234567",
      p_banco: "Banesco",
      p_referencia: "4821",
    });
  } catch (error) {
    duplicado = error.message;
  }
  assert.match(duplicado ?? "", /bt:duplicada/);
  ok("la misma referencia otra vez se rechaza (bt:duplicada)");

  paso(10, "Pasajera: transferencia de saldo entre sus dos tarjetas");
  const transferir = (destino, monto, pin, clave = crypto.randomUUID()) =>
    rpc("bt_transferir_saldo", {
      p_token: token,
      p_origen: seriales[0],
      p_destino: destino,
      p_monto: monto,
      p_pin: pin,
      p_clave: clave,
    });

  const pinMalo = await transferir(seriales[1], 500, "000000");
  assert.equal(pinMalo.error, "credenciales");

  const mismaTarjeta = await transferir(seriales[0], 500, "258036");
  assert.equal(mismaTarjeta.error, "datos");

  const sinSaldo = await transferir(seriales[1], 600, "258036");
  assert.equal(sinSaldo.error, "datos");

  const sobreTope = await transferir(seriales[1], 5001, "258036");
  assert.equal(sobreTope.error, "datos");

  const desconocida = await transferir("G-99999-999-Z", 500, "258036");
  assert.equal(desconocida.error, "sin-tarjeta");
  ok("PIN, misma tarjeta, saldo insuficiente, tope y destino inválido rechazados");

  const clave = crypto.randomUUID();
  const transferencia = await transferir(seriales[1], 500, "258036", clave);
  assert.equal(transferencia.repetida, false);
  assert.equal(Number(transferencia.transferencia.monto), 500);
  assert.equal(Number(transferencia.transferencia.origen.saldo), 0);
  assert.equal(Number(transferencia.transferencia.destino.saldo), 500);
  assert.equal(transferencia.transferencia.destino.titular, "Ana S.");
  assert.equal(Number(transferencia.movimiento.monto), -500);
  ok(
    `transferidos 500 Bs de ${seriales[0]} a ${seriales[1]} · ` +
      `origen 0 / destino 500`,
  );

  const repetida = await transferir(seriales[1], 500, "258036", clave);
  assert.equal(repetida.repetida, true);
  assert.equal(repetida.transferencia.id, transferencia.transferencia.id);
  ok("la misma clave devuelve el comprobante sin descontar otra vez");

  const { rows: saldos } = await db.query(
    `select visible_id, virtual_balance, last_chip_balance
       from public.cards where visible_id = any($1)`,
    [[seriales[0], seriales[1]]],
  );
  const saldo = Object.fromEntries(saldos.map((f) => [f.visible_id, f]));
  assert.equal(Number(saldo[seriales[0]].virtual_balance), 0);
  assert.equal(Number(saldo[seriales[1]].virtual_balance), 500);
  assert.equal(Number(saldo[seriales[0]].last_chip_balance), 500, "el chip aún tiene el saldo");
  assert.equal(Number(saldo[seriales[1]].last_chip_balance), 0);

  const { rows: ajustes } = await db.query(
    `select monto, synced_to_chip from public.card_adjustments
      where transfer_id = $1 order by monto`,
    [transferencia.transferencia.id],
  );
  assert.equal(ajustes.length, 2);
  assert.deepEqual(
    ajustes.map((a) => Number(a.monto)),
    [-500, 500],
  );
  assert.ok(ajustes.every((a) => a.synced_to_chip === false));
  ok("quedan dos ajustes firmados pendientes de escribir en los chips");

  const movimientosTransferencia = await rpc("bt_movimientos", {
    p_token: token,
    p_serial: seriales[0],
    p_limite: 20,
  });
  assert.ok(
    movimientosTransferencia.movimientos.some(
      (m) => m.tipo === "transferencia" && Number(m.monto) === -500,
    ),
  );
  ok("el extracto del portal muestra la salida");

  paso(11, "Validador: entrega los ajustes al chip y cobra el saldo recibido");
  const sync3 = await sincronizar();
  assert.equal(sync3.pendientes.length, 2, "deben bajar los dos ajustes");
  const ajusteDestino = sync3.pendientes.find(
    (p) => p.serial === seriales[1] && Number(p.monto) === 500,
  );
  const ajusteOrigen = sync3.pendientes.find(
    (p) => p.serial === seriales[0] && Number(p.monto) === -500,
  );
  assert.ok(ajusteDestino && ajusteOrigen);

  const sync4 = await sincronizar({
    taps: [
      {
        offline_id: crypto.randomUUID(),
        visible_id: seriales[1],
        fare_charged: 500,
        fare_type: 1,
        chip_balance_after: 0,
        tapped_at: new Date().toISOString(),
      },
    ],
    recargas: [{ id: ajusteDestino.id }, { id: ajusteOrigen.id }],
  });
  assert.equal(sync4.procesadas, 1);
  assert.equal(sync4.rechazadas.length, 0);
  assert.equal(sync4.pendientes.length, 0);

  const { rows: finales } = await db.query(
    `select visible_id, virtual_balance, last_chip_balance
       from public.cards where visible_id = any($1)`,
    [[seriales[0], seriales[1]]],
  );
  const final = Object.fromEntries(finales.map((f) => [f.visible_id, f]));
  assert.equal(Number(final[seriales[0]].virtual_balance), 0);
  assert.equal(Number(final[seriales[0]].last_chip_balance), 0, "el débito llegó al chip");
  assert.equal(Number(final[seriales[1]].virtual_balance), 0);
  assert.equal(Number(final[seriales[1]].last_chip_balance), 0);
  ok("ajustes acusados, viaje de 500 Bs cobrado y ambos plásticos en cero");

  paso(12, "Pruebas adversariales de la sincronización (B-62…B-66 + firma)");
  const macValidador = MAC_VALIDADOR;

  // B-62: el RPC interno no puede invocarse sin firma ni token.
  let puertaAbierta = null;
  try {
    await rpc("bt_validador_sincronizar", {
      p_validator_mac: macValidador,
      p_taps: [{ offline_id: crypto.randomUUID(), visible_id: seriales[0], fare_charged: 500 }],
    });
  } catch (error) {
    puertaAbierta = error.message;
  }
  assert.match(puertaAbierta ?? "", /permission denied|Could not find|PGRST202|42501|not authorized/i);
  ok("anon/authenticated no puede llamar a bt_validador_sincronizar directo");

  // QODER-BLINK-BANKING-SEC-2026 §3.1: sello vencido, firma falsa y trama
  // reutilizada. El servidor vuelve a calcular el HMAC y corta los tres.
  const selloVencido = await capturar(() =>
    sincronizar({}, { sello: Math.floor(Date.now() / 1000) - 60 }),
  );
  assert.match(selloVencido, /Sello de tiempo vencido/);

  const firmaFalsa = await capturar(() => sincronizar({}, { firma: "0".repeat(64) }));
  assert.match(firmaFalsa, /Firma inválida/);

  const tramaRepetida = await capturar(() => sincronizar({}, { nonce: nonceToque }));
  assert.match(tramaRepetida, /Trama repetida/);
  ok("sello vencido, firma falsa y nonce reutilizado rechazados");

  // B-63/B-65/B-66 + §2: toques inventados, con chip hinchado, de tarjeta
  // ajena, con céntimos, con clave de texto y sin identificador. Ninguno se
  // aprueba y todos quedan registrados en validator_rejections.
  const { rows: rechazoAntes } = await db.query(
    "select count(*)::int n from public.validator_rejections",
  );
  const sync5 = await sincronizar({
    taps: [
      { offline_id: crypto.randomUUID(), visible_id: seriales[0], fare_charged: 500, chip_balance_after: 0 },
      { offline_id: crypto.randomUUID(), visible_id: seriales[0], fare_charged: 500, chip_balance_after: 999999 },
      { offline_id: crypto.randomUUID(), visible_id: "G-99999-999-Z", fare_charged: 500, chip_balance_after: 0 },
      { offline_id: crypto.randomUUID(), visible_id: seriales[0], fare_charged: 499.5, chip_balance_after: 0 },
      { offline_id: "adv-texto", visible_id: seriales[0], fare_charged: 500, chip_balance_after: 0 },
      { visible_id: seriales[0], fare_charged: 500, chip_balance_after: 0 },
    ],
  });
  assert.equal(sync5.procesadas, 0, "ningún toque adversarial se aprueba");
  assert.equal(sync5.rechazadas.length, 6);
  const motivos = sync5.rechazadas.map((r) => r.motivo).sort();
  const esperados = [
    "Clave de idempotencia inválida (UUID v4)",
    "Falta offline_id",
    "Saldo del chip fuera de rango",
    "Saldo virtual insuficiente",
    "Tarjeta desconocida",
    "Tarifa con decimales",
  ].sort();
  assert.deepEqual(motivos, esperados);

  const { rows: auditoria } = await db.query(
    `select offline_id, motivo from public.validator_rejections
      where vehicle_id = (select id from public.vehicles where validator_mac = $1)
      order by offline_id`,
    [macValidador],
  );
  assert.equal(auditoria.length, Number(rechazoAntes[0].n) + 6, "cada rechazo deja su huella");
  assert.equal(
    auditoria.filter((f) => f.offline_id === null).length,
    1,
    "solo el toque sin offline_id se registra sin identificador",
  );
  ok(`6 rechazos registrados: ${motivos.join(" · ")}`);

  const { rows: sinCambio } = await db.query(
    `select virtual_balance, last_chip_balance from public.cards where visible_id = $1`,
    [seriales[0]],
  );
  assert.equal(Number(sinCambio[0].virtual_balance), 0, "un toque rechazado no mueve el saldo");
  assert.equal(Number(sinCambio[0].last_chip_balance), 0);

  // Tarjeta inactiva: el viaje se rechaza aunque el chip traiga saldo.
  await db.query("update public.cards set status = 'BLOCKED' where visible_id = $1", [seriales[1]]);
  const sync6 = await sincronizar({
    taps: [{ offline_id: crypto.randomUUID(), visible_id: seriales[1], fare_charged: 500, chip_balance_after: 0 }],
  });
  assert.equal(sync6.procesadas, 0);
  assert.equal(sync6.rechazadas[0]?.motivo, "Tarjeta no activa");
  await db.query("update public.cards set status = 'ACTIVE' where visible_id = $1", [seriales[1]]);

  // offline_id repetido: el mismo viaje no se liquidan dos veces.
  const [viajesAntes] = await db.query(
    "select count(*)::int n from public.trips_telemetry",
  ).then((r) => r.rows);
  const sync7 = await sincronizar({
    taps: [{ offline_id: offlineId, visible_id: seriales[0], fare_charged: 500, chip_balance_after: 500 }],
  });
  assert.equal(sync7.procesadas, 0, "el toque repetido se ignora");
  assert.equal(sync7.rechazadas.length, 0, "y no hace falta rechazarlo");
  const [viajesDespues] = await db.query(
    "select count(*)::int n from public.trips_telemetry",
  ).then((r) => r.rows);
  assert.equal(viajesDespues.n, viajesAntes.n, "no se duplica el viaje");
  ok("viaje repetido ignorado y tarjeta inactiva rechazada");

  // Validador dado de baja: ni la firma ni el token sirven.
  await db.query("update public.vehicles set active = false where validator_mac = $1", [macValidador]);
  const inactivoFirma = await capturar(() => sincronizar());
  assert.match(inactivoFirma, /inactivo/i);
  const inactivoToken = await capturar(() =>
    rpc("bt_validador_sincronizar_token", { p_token: tokenValidador }),
  );
  assert.match(inactivoToken, /inactivo|token de validador inválido/i);
  await db.query("update public.vehicles set active = true where validator_mac = $1", [macValidador]);
  ok("un validador inactivo no sincroniza ni con firma ni con token");

  // B-65: céntimos dentro del chip no existen, ni por la API ni por la base.
  const conCentimos = await transferir(seriales[1], 100.5, "258036");
  assert.equal(conCentimos.error, "datos");
  assert.match(conCentimos.mensaje, /enteros/);

  let filaDecimal = null;
  try {
    await db.query(
      `insert into public.card_transfers (clave, cuenta_id, origen_id, destino_id, monto, origen_saldo, destino_saldo)
        values (gen_random_uuid(),
                (select id from public.accounts where cedula_digitos = '20123456'),
                (select id from public.cards where visible_id = $1),
                (select id from public.cards where visible_id = $2),
                100.5, 0, 0)`,
      [seriales[0], seriales[1]],
    );
  } catch (error) {
    filaDecimal = error.message;
  }
  assert.match(filaDecimal ?? "", /card_transfers_monto_entero/);

  let ajusteDecimal = null;
  try {
    await db.query(
      `insert into public.card_adjustments (card_id, monto, motivo)
        values ((select id from public.cards where visible_id = $1), 12.5, 'prueba')`,
      [seriales[1]],
    );
  } catch (error) {
    ajusteDecimal = error.message;
  }
  assert.match(ajusteDecimal ?? "", /card_adjustments_monto_entero/);
  ok("la base también rechaza transferencias y ajustes con céntimos");

  // El camino por token de 0004 sigue vivo para el firmware ya desplegado,
  // pero comparte el mismo núcleo endurecido de 0025.
  const syncFinal = await rpc("bt_validador_sincronizar_token", { p_token: tokenValidador });
  assert.ok(Array.isArray(syncFinal.pendientes), "la respuesta mantiene el contrato del firmware");
  assert.equal(typeof syncFinal.procesadas, "number");
  ok("respuesta estable: procesadas, rechazadas, pendientes y bloqueadas");

  const syncFirmado = await sincronizar();
  assert.deepEqual(
    Object.keys(syncFirmado).sort(),
    ["bloqueadas", "pendientes", "procesadas", "rechazadas", "validador"],
    "la firma devuelve el mismo contrato que el token",
  );
  ok("firma y token comparten respuesta");

  paso(13, "Bitácora de transacciones particionada (§1.2)");
  const {
    rows: [conteo],
  } = await db.query(
    `select (select count(*) from public.card_movements)::int    as movimientos,
            (select count(*) from public.transactions_log)::int  as bitacora,
            (select count(*) from public.transactions_log_default)::int as sueltas`,
  );
  assert.equal(conteo.bitacora, conteo.movimientos, "cada movimiento tiene su fila en la bitácora");
  assert.equal(conteo.sueltas, 0, "nada cae fuera de las particiones mensuales");

  const {
    rows: [particion],
  } = await db.query(
    `select to_regclass('public.transactions_log_' || to_char(now(), 'YYYY_MM')) is not null as existe`,
  );
  assert.equal(particion.existe, true, "existe la partición del mes en curso");

  // Aprobar o rechazar una recarga cambia el movimiento; la bitácora sigue
  // el estado final y no la foto del momento en que se creó.
  const { rows: espejo } = await db.query(
    `select r.bank_reference, l.estado, l.saldo_despues
       from public.recharges r
       join public.transactions_log l on l.movimiento_id = r.movement_id
      order by r.bank_reference`,
  );
  const aprobada = espejo.find((f) => f.bank_reference === "4821");
  const rechazada = espejo.find((f) => f.bank_reference === "7777");
  assert.equal(aprobada.estado, "aprobado");
  assert.equal(Number(aprobada.saldo_despues), 1000);
  assert.equal(rechazada.estado, "rechazado");

  const {
    rows: [cruce],
  } = await db.query(
    `select count(*)::int n
       from public.trips_telemetry t
       join public.transactions_log l on l.movimiento_id = t.movement_id
      where l.tipo = 'viaje'
        and l.idempotency_key = t.idempotency_key
        and l.vehicle_id is not null`,
  );
  assert.ok(cruce.n >= 2, "los viajes quedan enlazados con su unidad y su clave UUID");

  // El disparador escribe la bitácora con cualquier inserción de movimiento.
  // Se prueba dentro de una transacción que luego se deshace para no ensuciar
  // el extracto de la pasajera.
  const {
    rows: [tarjetaSonda],
  } = await db.query("select id from public.cards where visible_id = $1", [seriales[0]]);
  await db.query("begin");
  try {
    const {
      rows: [sonda],
    } = await db.query(
      `insert into public.card_movements (card_id, tipo, monto, saldo_despues, detalle)
       values ($1, 'ajuste', 0, 0, 'sonda de bitácora')
       returning id`,
      [tarjetaSonda.id],
    );
    const {
      rows: [copiada],
    } = await db.query(
      "select count(*)::int filas from public.transactions_log where movimiento_id = $1",
      [sonda.id],
    );
    assert.equal(copiada.filas, 1, "el disparador copia el movimiento recién insertado");
  } finally {
    await db.query("rollback");
  }

  let bitacoraCerrada = null;
  await db.query("begin");
  try {
    await db.query("set local role anon");
    await db.query("select 1 from public.transactions_log limit 1");
  } catch (error) {
    bitacoraCerrada = error.message;
  } finally {
    await db.query("rollback");
  }
  assert.match(bitacoraCerrada ?? "", /permission denied/);
  ok(`${conteo.bitacora} movimientos copiados, partición mensual vigente y tabla cerrada al portal`);

  paso(14, "Resumen operativo");
  const [resumenFila] = await servicio(
    "select public.bt_resumen_operativo() as r",
  );
  console.log(JSON.stringify(resumenFila.r, null, 2));

  console.log("\nFlujo completo simulado sin errores.");
} catch (error) {
  console.error(`\n✗ ${error.message}`);
  process.exitCode = 1;
} finally {
  await db.end();
}
