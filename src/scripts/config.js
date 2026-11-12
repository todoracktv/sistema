// =============================================================
// Datos del emisor y almacenamiento local del cotizador.
// Para cambiar la información que sale en el PDF, edita EMISOR.
// =============================================================

export const EMISOR = {
  ruc: "10769665442",
  razonSocial: "RIVERA ZAMBRANO ANTONY GREKO",
  direccion: "JIRON TOMAS GUIDO 275, LINCE",
  telefono: "941867621",
  firma: "Antony Greko Rivera Zambrano",
  logo: "/imagenes/logo.png",
  terminos: {
    entrega: "INMEDIATA",
    pago: "CONTRAENTREGA",
    // Porcentaje de adelanto para racks fabricados a pedido.
    adelantoPorcentaje: 50,
  },
  formasPago: [
    { nombre: "Interbank", img: "/imagenes/pago/interbank.jpg", numero: "8983224444682" },
    { nombre: "BCP", img: "/imagenes/pago/bcp.jpg", numero: "19497654760069" },
    { nombre: "BBVA", img: "/imagenes/pago/bbva.png", numero: "0011-0814-0286150239" },
    { nombre: "Yape / Plin", img: "/imagenes/pago/yape-plin.jpg", numero: "941867621" },
  ],
};

const KEY_CONFIG = "cotizador:config";
const KEY_HISTORIAL = "cotizador:historial";
const MAX_HISTORIAL = 100;

function leerJSON(clave, porDefecto) {
  try {
    const crudo = localStorage.getItem(clave);
    return crudo ? JSON.parse(crudo) : porDefecto;
  } catch {
    return porDefecto;
  }
}

function guardarJSON(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
    return true;
  } catch {
    return false;
  }
}

// -----------------------------
// Configuración (correlativo + token de API)
// -----------------------------
export function getConfig() {
  return { correlativo: 0, token: "", ...leerJSON(KEY_CONFIG, {}) };
}

export function setConfig(parcial) {
  const config = { ...getConfig(), ...parcial };
  guardarJSON(KEY_CONFIG, config);
  return config;
}

export function getApiToken() {
  return getConfig().token || "";
}

export function setApiToken(token) {
  return setConfig({ token: String(token || "").trim() });
}

// -----------------------------
// Numeración correlativa
// -----------------------------
export function formatearNumero(n) {
  return `COT-${String(n).padStart(4, "0")}`;
}

/** Número que se usaría en la próxima cotización (sin consumirlo). */
export function numeroActual() {
  return formatearNumero(getConfig().correlativo + 1);
}

/** Consume y devuelve el siguiente número correlativo. */
export function reservarNumero() {
  const siguiente = getConfig().correlativo + 1;
  setConfig({ correlativo: siguiente });
  return formatearNumero(siguiente);
}

// -----------------------------
// Historial de cotizaciones
// -----------------------------
export function getHistorial() {
  const historial = leerJSON(KEY_HISTORIAL, []);
  return Array.isArray(historial) ? historial : [];
}

function esImagenPesada(img) {
  return typeof img === "string" && img.startsWith("data:");
}

export function agregarAlHistorial(cotizacion) {
  const historial = [cotizacion, ...getHistorial()].slice(0, MAX_HISTORIAL);

  if (guardarJSON(KEY_HISTORIAL, historial)) return historial;

  // Si se llena el almacenamiento, guardamos sin las imágenes en base64.
  const sinImagenes = historial.map((c) => ({
    ...c,
    items: (c.items || []).map((i) =>
      esImagenPesada(i.img) ? { ...i, img: "" } : i,
    ),
  }));
  guardarJSON(KEY_HISTORIAL, sinImagenes);
  return sinImagenes;
}

export function eliminarDelHistorial(numero) {
  const historial = getHistorial().filter((c) => c.numero !== numero);
  guardarJSON(KEY_HISTORIAL, historial);
  return historial;
}

export function limpiarHistorial() {
  guardarJSON(KEY_HISTORIAL, []);
  return [];
}
