// Consulta automática de RUC / DNI para autocompletar la razón social y la dirección.
//
// Estrategia (nunca bloquea al usuario):
//   1. Endpoint interno /api/consulta  -> consulta desde el servidor (sin CORS).
//   2. Proveedor con token (apisperu)  -> respaldo directo desde el navegador.
//   3. Si todo falla, se devuelve un error controlado para escribir a mano.

import { getApiToken } from "./config.js";

const TIMEOUT_MS = 10000;

export function limpiarNumero(valor) {
  return String(valor ?? "").replace(/\D/g, "");
}

export function tipoDocumento(valor) {
  const numero = limpiarNumero(valor);
  if (numero.length === 11) return "ruc";
  if (numero.length === 8) return "dni";
  return null;
}

/** "Razón Social" cuando es RUC, "Cliente" cuando es DNI. */
export function etiquetaCliente(valor) {
  return tipoDocumento(valor) === "ruc" ? "Razón Social" : "Cliente";
}

async function pedirJson(url, opciones = {}) {
  const controller = new AbortController();
  const temporizador = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const respuesta = await fetch(url, { ...opciones, signal: controller.signal });
    const texto = await respuesta.text();
    if (!texto) return null;
    return JSON.parse(texto);
  } finally {
    clearTimeout(temporizador);
  }
}

function primerTexto(...valores) {
  for (const valor of valores) {
    if (typeof valor === "string" && valor.trim()) return valor.trim();
  }
  return "";
}

function normalizar(data) {
  if (!data || typeof data !== "object") return null;
  const d = data.data && typeof data.data === "object" ? data.data : data;

  const razonSocial = primerTexto(
    d.nombre,
    d.razonSocial,
    d.razon_social,
    d.nombre_o_razon_social,
    d.nombreCompleto,
    d.nombre_completo,
    [d.nombres, d.apellidoPaterno, d.apellidoMaterno].filter(Boolean).join(" "),
    [d.apellido_paterno, d.apellido_materno, d.nombres].filter(Boolean).join(" "),
  );

  if (!razonSocial) return null;

  const direccion = primerTexto(
    d.direccion,
    d.direccion_completa,
    d.domicilio_fiscal,
  );

  return { razonSocial, direccion: /^-+$/.test(direccion) ? "" : direccion };
}

/** Extrae {razonSocial, direccion} tanto de la respuesta del endpoint como de un proveedor. */
function extraer(data) {
  if (data && data.ok === true && typeof data.razonSocial === "string" && data.razonSocial.trim()) {
    return { razonSocial: data.razonSocial.trim(), direccion: (data.direccion || "").trim() };
  }
  return normalizar(data);
}

/**
 * Consulta un DNI (8 dígitos) o RUC (11 dígitos).
 * @returns {Promise<{ok: true, tipo: string, numero: string, razonSocial: string, direccion: string}
 *   | {ok: false, error: string, tipo?: string, numero?: string}>}
 */
export async function consultarDocumento(valor) {
  const numero = limpiarNumero(valor);
  const tipo = tipoDocumento(numero);

  if (!tipo) {
    return {
      ok: false,
      error: "Ingresa un DNI (8 dígitos) o un RUC (11 dígitos).",
    };
  }

  const token = getApiToken();
  let mensajeError =
    "No se pudo obtener automáticamente. Completa los datos a mano.";

  // 1) Endpoint interno del propio sistema.
  try {
    const params = new URLSearchParams({ numero });
    if (token) params.set("token", token);
    const data = await pedirJson(`/api/consulta?${params.toString()}`);
    const resultado = extraer(data);
    if (resultado) return { ok: true, tipo, numero, ...resultado };
    if (data && data.error) mensajeError = data.error;
  } catch {
    // El endpoint no está disponible; probamos el respaldo.
  }

  // 2) Proveedor con token directamente (tiene CORS habilitado).
  if (token) {
    try {
      const data = await pedirJson(
        `https://dniruc.apisperu.com/api/v1/${tipo}/${numero}?token=${encodeURIComponent(token)}`,
      );
      const resultado = extraer(data);
      if (resultado) return { ok: true, tipo, numero, ...resultado };
    } catch {
      // Sin suerte; se informa al usuario.
    }
  }

  return { ok: false, tipo, numero, error: mensajeError };
}
