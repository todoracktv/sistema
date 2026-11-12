// Generación del PDF de la cotización.

import jsPDF from "jspdf";
import { EMISOR } from "./config.js";
import { calcularTotales, formatearMoneda } from "./totales.js";

const VERDE = [142, 209, 122];

function formatoImagen(dataUrl) {
  const coincidencia = /^data:image\/(png|jpe?g|webp|gif)/i.exec(String(dataUrl || ""));
  const tipo = coincidencia ? coincidencia[1].toLowerCase() : "";
  if (tipo === "png") return "PNG";
  if (tipo === "webp") return "WEBP";
  return "JPEG";
}

async function getBase64Image(url) {
  if (!url) return null;
  try {
    const respuesta = await fetch(url);
    if (!respuesta.ok) return null;
    const blob = await respuesta.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function sanitizarArchivo(texto) {
  return String(texto || "cliente")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "cliente";
}

function obtenerFechaHoraPeru() {
  return new Date().toLocaleString("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Genera y descarga el PDF de la cotización.
 * @param {Array} carrito
 * @param {{nombre: string, doc: string, direccion: string}} cliente
 * @param {{numero?: string, validez?: string, observaciones?: string,
 *          descuento?: {tipo: string, valor: number}}} meta
 */
export async function generarPDF(carrito, cliente = {}, meta = {}) {
  const doc = new jsPDF();
  const pageHeight = doc.internal.pageSize.height;
  const bottomMargin = 15;

  const totales = calcularTotales(carrito, meta.descuento);

  let y = 0;

  function asegurarEspacio(alturaNecesaria) {
    if (y + alturaNecesaria > pageHeight - bottomMargin) {
      doc.addPage();
      y = 25;
      y = dibujarEncabezadoTabla(y);
    }
  }

  async function dibujarEncabezadoInicial() {
    const logo = await getBase64Image(EMISOR.logo);
    if (logo) doc.addImage(logo, formatoImagen(logo), 5, 8, 45, 25);

    // Recuadro verde con título y número de cotización
    doc.setFillColor(198, 224, 180);
    doc.rect(120, 6, 55, 15, "F");

    doc.setFontSize(11).setFont("helvetica", "bold");
    doc.setTextColor(10, 12, 5);
    doc.text("COTIZACIÓN", 147.5, 13, { align: "center", charSpace: 1 });
    doc.setFontSize(8);
    doc.text(`N° ${meta.numero || ""}`, 147.5, 19, { align: "center" });
    doc.setTextColor(0, 0, 0);

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text("RUC:", 120, 25);
    doc.setFont("helvetica", "bold");
    doc.text(EMISOR.ruc, 130, 25);

    doc.setFont("helvetica", "normal");
    doc.text("Razón Social:", 120, 29);
    doc.setFont("helvetica", "bold");
    doc.text(EMISOR.razonSocial, 140, 29);

    doc.setFont("helvetica", "normal");
    doc.text("Dirección:", 120, 33);
    doc.setFont("helvetica", "bold");
    doc.text(EMISOR.direccion, 138, 33);

    doc.setFont("helvetica", "normal");
    doc.text("Fecha:", 120, 37);
    doc.setFont("helvetica", "bold");
    doc.text(obtenerFechaHoraPeru(), 135, 37);

    doc.setDrawColor(...VERDE);
    doc.line(10, 41, 200, 41);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);

    let yCliente = 48;
    if (cliente.nombre) {
      doc.text(`${meta.etiquetaCliente || "Cliente"}: ${cliente.nombre}`, 10, yCliente);
      yCliente += 5;
    }
    if (cliente.doc) {
      doc.text(`RUC/DNI: ${cliente.doc}`, 10, yCliente);
      yCliente += 5;
    }
    if (cliente.direccion) {
      doc.text(`Dirección: ${cliente.direccion}`, 10, yCliente);
      yCliente += 5;
    }
    if (meta.validez) {
      doc.text(`Válido hasta: ${meta.validez}`, 10, yCliente);
      yCliente += 5;
    }

    return yCliente + 2;
  }

  function dibujarEncabezadoTabla(yPos) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Foto", 12, yPos);
    doc.text("Producto", 40, yPos);
    doc.text("Cant.", 130, yPos);
    doc.text("P. Unit", 150, yPos);
    doc.text("Total", 180, yPos);
    doc.setDrawColor(...VERDE);
    doc.line(10, yPos + 2, 200, yPos + 2);
    return yPos + 8;
  }

  // ---------- primera página ----------
  y = await dibujarEncabezadoInicial();
  y = dibujarEncabezadoTabla(y);

  // ---------- productos ----------
  for (const item of carrito) {
    const imgBase64 = await getBase64Image(item.img);

    doc.setFont("helvetica", "normal");

    doc.setFontSize(9);
    const tituloLineas = doc.splitTextToSize(item.titulo || "", 85);

    doc.setFontSize(7);
    const descLineas = doc.splitTextToSize(item.descripcion || "", 85);

    const alturaTitulo = tituloLineas.length * 5;
    const alturaDesc = descLineas.length * 4;
    const alturaTexto = alturaTitulo + alturaDesc;
    const alturaImagen = 16;
    const alturaFila = Math.max(alturaTexto, alturaImagen);

    asegurarEspacio(alturaFila + 4);

    const yFila = y;

    if (imgBase64) {
      try {
        doc.addImage(imgBase64, formatoImagen(imgBase64), 12, yFila, 16, 16);
      } catch {
        // Si la imagen no se puede incrustar, se omite sin romper el PDF.
      }
    }

    let textY = yFila + 4;
    doc.setFontSize(9);
    doc.text(tituloLineas, 40, textY);
    textY += alturaTitulo;
    doc.setFontSize(7);
    doc.text(descLineas, 40, textY);

    doc.setFontSize(9);
    const precio = Number(item.precio) || 0;
    const cantidad = Number(item.cantidad) || 0;
    doc.text(String(cantidad), 132, yFila + 6);
    doc.text(`S/ ${precio.toFixed(2)}`, 150, yFila + 6);
    doc.text(`S/ ${(cantidad * precio).toFixed(2)}`, 180, yFila + 6);

    const yLinea = yFila + alturaFila + 2;
    doc.setDrawColor(...VERDE);
    doc.line(10, yLinea, 200, yLinea);
    y = yLinea + 2;
  }

  // ---------- totales en cuadro ----------
  asegurarEspacio(50);
  y += 6;

  const boxX = 130;
  const boxWidth = 70;
  const boxY = y;

  const filas = [
    { etiqueta: "Subtotal:", valor: totales.subtotal },
    { etiqueta: "IGV (18%):", valor: totales.igv },
  ];
  if (totales.descuento > 0) {
    filas.push({ etiqueta: "Descuento:", valor: -totales.descuento });
  }

  const boxHeight = 16 + filas.length * 7;

  doc.setFillColor(240, 248, 235);
  doc.rect(boxX, boxY, boxWidth, boxHeight, "F");
  doc.setDrawColor(...VERDE);
  doc.rect(boxX, boxY, boxWidth, boxHeight);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  let filaY = boxY + 8;
  for (const fila of filas) {
    doc.text(fila.etiqueta, boxX + 5, filaY);
    doc.text(formatearMoneda(fila.valor), boxX + boxWidth - 5, filaY, {
      align: "right",
    });
    filaY += 7;
  }

  doc.line(boxX + 5, filaY - 4, boxX + boxWidth - 5, filaY - 4);

  filaY += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("TOTAL:", boxX + 5, filaY);
  doc.text(formatearMoneda(totales.total), boxX + boxWidth - 5, filaY, {
    align: "right",
  });

  y = boxY + boxHeight;

  // ---------- observaciones ----------
  if (meta.observaciones) {
    asegurarEspacio(20);
    y += 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("OBSERVACIONES:", 10, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const lineas = doc.splitTextToSize(meta.observaciones, 185);
    for (const linea of lineas) {
      asegurarEspacio(5);
      doc.text(linea, 10, y);
      y += 4.5;
    }
  }

  // ---------- términos y condiciones ----------
  asegurarEspacio(meta.adelanto ? 40 : 35);

  y += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("TÉRMINOS Y CONDICIONES:", 10, y);

  y += 7;
  doc.setFont("helvetica", "normal");
  doc.text("Entrega:", 10, y);
  doc.setFont("helvetica", "bold");
  const diasEntrega = parseInt(meta.diasEntrega, 10) || 0;
  const textoEntrega =
    meta.adelanto && diasEntrega > 0
      ? `${diasEntrega} DÍAS`
      : EMISOR.terminos.entrega;
  doc.text(textoEntrega, 40, y);

  y += 5;
  doc.setFont("helvetica", "normal");
  doc.text("Pago:", 10, y);
  doc.setFont("helvetica", "bold");
  if (meta.adelanto) {
    const porcentaje = EMISOR.terminos.adelantoPorcentaje || 50;
    doc.text(`${porcentaje}% DE ADELANTO`, 40, y);
  } else {
    doc.text(EMISOR.terminos.pago, 40, y);
  }

  y += 10;
  doc.setFont("helvetica", "normal");
  doc.text("Atentamente,", 10, y);
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.text(EMISOR.firma, 10, y);

  // ---------- medios de pago ----------
  asegurarEspacio(30);
  y += 10;

  const posiciones = [
    { x: 10, w: 20, h: 5 },
    { x: 60, w: 20, h: 5 },
    { x: 110, w: 20, h: 5 },
    { x: 160, w: 15, h: 6 },
  ];

  const yLogos = y;

  for (let i = 0; i < EMISOR.formasPago.length; i += 1) {
    const forma = EMISOR.formasPago[i];
    const posicion = posiciones[i] || { x: 10 + i * 45, w: 20, h: 5 };
    const logoPago = await getBase64Image(forma.img);
    if (logoPago) {
      try {
        doc.addImage(logoPago, formatoImagen(logoPago), posicion.x, yLogos, posicion.w, posicion.h);
      } catch {
        // Se omite el logo si no se puede incrustar.
      }
    }
  }

  asegurarEspacio(15);
  y += 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  for (let i = 0; i < EMISOR.formasPago.length; i += 1) {
    const posicion = posiciones[i] || { x: 10 + i * 45 };
    doc.text(EMISOR.formasPago[i].numero, posicion.x, y);
  }

  // ---------- pie ----------
  asegurarEspacio(20);
  y += 12;
  doc.setFont("helvetica", "normal");
  doc.text("RUC:", 10, y);
  doc.setFont("helvetica", "bold");
  doc.text(EMISOR.ruc, 25, y);
  doc.setFont("helvetica", "normal");
  doc.text("Razón Social:", 60, y);
  doc.setFont("helvetica", "bold");
  doc.text(EMISOR.razonSocial, 95, y);

  y += 8;
  doc.setFont("helvetica", "normal");
  doc.text(`${EMISOR.telefono} / ${EMISOR.direccion}`, 10, y);

  const nombreArchivo = [
    "cotizacion",
    meta.numero || "",
    sanitizarArchivo(cliente.nombre),
  ]
    .filter(Boolean)
    .join("-");

  doc.save(`${nombreArchivo}.pdf`);
}
