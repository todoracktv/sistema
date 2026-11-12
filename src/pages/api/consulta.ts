// Endpoint interno que consulta RUC/DNI desde el servidor.
// Evita el bloqueo CORS del navegador y no expone tokens al cliente.
// Uso:  GET /api/consulta?numero=20123456789
//       GET /api/consulta?numero=12345678&token=TU_TOKEN (opcional)
export const prerender = false;

import type { APIRoute } from "astro";

const TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 horas

type Tipo = "ruc" | "dni";
type Resultado = { razonSocial: string; direccion: string };

// Caché en memoria para no golpear el proveedor (que tiene límite de peticiones).
const cache = new Map<string, { data: Resultado; expira: number }>();

function limpiarNumero(valor: string | null): string {
  return String(valor ?? "").replace(/\D/g, "");
}

function tipoDocumento(numero: string): Tipo | null {
  if (numero.length === 11) return "ruc";
  if (numero.length === 8) return "dni";
  return null;
}

function primerTexto(...valores: unknown[]): string {
  for (const valor of valores) {
    if (typeof valor === "string" && valor.trim()) return valor.trim();
  }
  return "";
}

function normalizar(data: unknown): Resultado | null {
  if (!data || typeof data !== "object") return null;
  const crudo = data as Record<string, any>;
  const d =
    crudo.data && typeof crudo.data === "object"
      ? (crudo.data as Record<string, any>)
      : crudo;

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
    d.domicilioFiscal,
  );

  return {
    razonSocial,
    // Algunos proveedores devuelven "-" cuando no hay dirección.
    direccion: /^-+$/.test(direccion) ? "" : direccion,
  };
}

async function fetchJson(
  url: string,
  headers?: Record<string, string>,
): Promise<unknown> {
  const controller = new AbortController();
  const temporizador = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const respuesta = await fetch(url, { headers, signal: controller.signal });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    return await respuesta.json();
  } finally {
    clearTimeout(temporizador);
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const numero = limpiarNumero(url.searchParams.get("numero"));
  const token = (
    url.searchParams.get("token") ||
    request.headers.get("x-api-token") ||
    ""
  ).trim();
  const tipo = tipoDocumento(numero);

  if (!tipo) {
    return jsonResponse(
      { ok: false, error: "Ingresa un DNI (8 dígitos) o un RUC (11 dígitos)." },
      400,
    );
  }

  const clave = `${tipo}:${numero}`;
  const enCache = cache.get(clave);
  if (enCache && enCache.expira > Date.now()) {
    return jsonResponse({ ok: true, tipo, numero, ...enCache.data });
  }

  // Orden de intentos: primero proveedores con token (si lo hay), luego el gratuito.
  const consultas: { url: string; headers?: Record<string, string> }[] = [];
  if (token) {
    consultas.push({
      url: `https://api.apis.net.pe/v2/${tipo}?numero=${numero}`,
      headers: { Authorization: `Bearer ${token}` },
    });
    consultas.push({
      url: `https://dniruc.apisperu.com/api/v1/${tipo}/${numero}?token=${encodeURIComponent(token)}`,
    });
  }
  consultas.push({ url: `https://api.apis.net.pe/v1/${tipo}?numero=${numero}` });

  for (const consulta of consultas) {
    try {
      const data = await fetchJson(consulta.url, consulta.headers);
      const resultado = normalizar(data);
      if (resultado) {
        cache.set(clave, { data: resultado, expira: Date.now() + CACHE_TTL_MS });
        return jsonResponse({ ok: true, tipo, numero, ...resultado });
      }
    } catch {
      // Probamos con el siguiente proveedor.
    }
  }

  return jsonResponse(
    {
      ok: false,
      tipo,
      numero,
      error:
        "No se encontró información para ese documento. Verifícalo o escríbelo a mano.",
    },
    404,
  );
};
