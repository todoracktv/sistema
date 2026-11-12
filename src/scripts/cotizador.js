// Lógica principal del cotizador (catálogo, carrito, totales, cliente e historial).

import {
  numeroActual,
  reservarNumero,
  getApiToken,
  setApiToken,
  getHistorial,
  agregarAlHistorial,
  eliminarDelHistorial,
  limpiarHistorial,
} from "./config.js";
import { calcularTotales, formatearMoneda } from "./totales.js";
import { generarPDF } from "./pdf.js";
import {
  consultarDocumento,
  limpiarNumero,
  tipoDocumento,
  etiquetaCliente,
} from "./consultaDoc.js";

const CATEGORIAS = {
  fijos: "Fijo",
  movil: "Móvil",
  articulados: "Articulado",
  monitor: "Monitor",
  techo: "Techo",
  pedestal: "Pedestal",
  proyector: "Proyector",
  pantografo: "Pantógrafo",
};

let productos = [];
let personalizados = [];
let carrito = [];
let customImgBase64 = null;
let filtro = { texto: "", categoria: "" };
let ocupado = false;

let refs = {};

export async function initCotizacion() {
  const lista = document.getElementById("lista-productos");
  const tabla = document.getElementById("tabla-carrito");
  if (!lista || !tabla) return; // No estamos en la página de cotización.

  refs = obtenerRefs();
  productos = await cargarProductos();

  renderCategorias();
  renderProductos();
  renderCarrito();
  actualizarNumero();
  inicializarValidez();
  renderHistorial();
  bindEventos();
}

function obtenerRefs() {
  const porId = (id) => document.getElementById(id);
  return {
    lista: porId("lista-productos"),
    sinResultados: porId("sin-resultados"),
    buscador: porId("buscador"),
    filtroCategoria: porId("filtro-categoria"),
    numeroCotizacion: porId("numero-cotizacion"),
    tabla: porId("tabla-carrito"),
    subtotal: porId("subtotal"),
    igv: porId("igv"),
    descuento: porId("descuento"),
    total: porId("total"),
    descuentoValor: porId("descuento-valor"),
    descuentoTipo: porId("descuento-tipo"),
    validez: porId("validez"),
    requiereAdelanto: porId("requiere-adelanto"),
    campoDiasEntrega: porId("campo-dias-entrega"),
    diasEntrega: porId("dias-entrega"),
    adelantoLinea: porId("adelanto-linea"),
    observaciones: porId("observaciones"),
    btnGenerar: porId("btn-generar"),
    historialLista: porId("historial-lista"),
    historialVacio: porId("historial-vacio"),
    btnLimpiarHistorial: porId("btn-limpiar-historial"),
    customNombre: porId("customNombre"),
    customPrecio: porId("customPrecio"),
    customDescripcion: porId("customDescripcion"),
    customCantidad: porId("customCantidad"),
    customImagen: porId("customImagen"),
    customIGV: porId("customIGV"),
    btnAgregarCustom: porId("btnAgregarCustom"),
    modalInput: porId("modal-input"),
    modalTitle: porId("modal-title"),
    inputCantidad: porId("input-cantidad"),
    inputPrecio: porId("input-precio"),
    inputIGV: porId("input-igv"),
    btnAgregar: porId("btn-agregar"),
    btnCancelar: porId("btn-cancelar"),
    modalCliente: porId("modal-cliente"),
    clienteNombre: porId("cliente-nombre"),
    clienteDoc: porId("cliente-doc"),
    clienteDireccion: porId("cliente-direccion"),
    btnConsultarDoc: porId("btn-consultar-doc"),
    consultaEstado: porId("consulta-estado"),
    apiToken: porId("api-token"),
    btnCancelarPdf: porId("btn-cancelar-pdf"),
    btnGenerarPdf: porId("btn-generar-pdf"),
  };
}

async function cargarProductos() {
  try {
    const respuesta = await fetch("racks.json");
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    const data = await respuesta.json();
    return Array.isArray(data?.racks) ? data.racks : [];
  } catch (error) {
    console.error("No se pudo cargar el catálogo de racks:", error);
    return [];
  }
}

function categoriaDe(producto) {
  if (producto.custom) return "Personalizado";
  const coincidencia = /imagenes\/([^/]+)\//.exec(producto.img || "");
  return CATEGORIAS[coincidencia?.[1]] || "Otros";
}

function catalogo() {
  return [...personalizados, ...productos];
}

function catalogoFiltrado() {
  const texto = filtro.texto.toLowerCase().trim();
  return catalogo().filter((producto) => {
    if (filtro.categoria && categoriaDe(producto) !== filtro.categoria) {
      return false;
    }
    if (!texto) return true;
    const contenido = `${producto.titulo} ${producto.descripcion_corta}`.toLowerCase();
    return contenido.includes(texto);
  });
}

// -----------------------------
// Catálogo
// -----------------------------
function renderCategorias() {
  const categorias = [...new Set(catalogo().map(categoriaDe))].sort((a, b) =>
    a.localeCompare(b, "es"),
  );

  refs.filtroCategoria.innerHTML = "";
  const todas = document.createElement("option");
  todas.value = "";
  todas.textContent = "Todas las categorías";
  refs.filtroCategoria.appendChild(todas);

  for (const categoria of categorias) {
    const opcion = document.createElement("option");
    opcion.value = categoria;
    opcion.textContent = categoria;
    refs.filtroCategoria.appendChild(opcion);
  }

  refs.filtroCategoria.value = filtro.categoria;
}

function renderProductos() {
  const items = catalogoFiltrado();

  refs.lista.innerHTML = "";
  if (refs.sinResultados) {
    refs.sinResultados.classList.toggle("hidden", items.length > 0);
  }

  for (const producto of items) {
    const item = document.createElement("div");
    item.className = "producto";

    const imagen = document.createElement("img");
    imagen.src = producto.img || "";
    imagen.alt = producto.titulo || "";
    imagen.loading = "lazy";

    const info = document.createElement("div");

    const titulo = document.createElement("h3");
    titulo.textContent = producto.titulo || "";

    const descripcion = document.createElement("p");
    descripcion.style.whiteSpace = "pre-line";
    descripcion.textContent = producto.descripcion_corta || "";

    const etiqueta = document.createElement("span");
    etiqueta.className = "categoria-tag";
    etiqueta.textContent = categoriaDe(producto);

    info.append(titulo, descripcion, etiqueta);
    item.append(imagen, info);
    item.addEventListener("click", () => abrirModalProducto(producto));
    refs.lista.appendChild(item);
  }
}

// -----------------------------
// Modal de producto
// -----------------------------
function abrirModalProducto(producto) {
  refs.modalTitle.textContent = `Agregar: ${producto.titulo}`;
  refs.inputCantidad.value = 1;
  refs.inputPrecio.value = producto.custom ? producto.precio_base : "";
  refs.inputIGV.checked = producto.custom ? producto.incluyeIGV : true;

  refs.modalInput.classList.remove("hidden");

  function cerrar() {
    refs.modalInput.classList.add("hidden");
    refs.btnAgregar.onclick = null;
    refs.btnCancelar.onclick = null;
  }

  refs.btnCancelar.onclick = cerrar;

  refs.btnAgregar.onclick = () => {
    const cantidad = parseInt(refs.inputCantidad.value, 10);
    const precio = parseFloat(refs.inputPrecio.value);
    const incluyeIGV = refs.inputIGV.checked;

    if (!cantidad || cantidad <= 0) {
      alert("Cantidad inválida");
      return;
    }
    if (!precio || precio <= 0) {
      alert("Precio inválido");
      return;
    }

    const existente = carrito.find((c) => c.titulo === producto.titulo);

    if (existente) {
      existente.cantidad += cantidad;
      existente.precio = precio;
      existente.incluyeIGV = incluyeIGV;
    } else {
      carrito.push({
        titulo: producto.titulo,
        descripcion: producto.descripcion_corta,
        img: producto.img,
        cantidad,
        precio,
        incluyeIGV,
      });
    }

    cerrar();
    renderCarrito();
  };
}

// -----------------------------
// Rack personalizado
// -----------------------------
function manejarImagenCustom() {
  const archivo = refs.customImagen.files[0];
  if (!archivo) return;

  const reader = new FileReader();
  reader.onload = () => {
    customImgBase64 = reader.result;
  };
  reader.readAsDataURL(archivo);
}

function agregarRackCustom() {
  const nombre = refs.customNombre.value.trim();
  const precio = parseFloat(refs.customPrecio.value);
  const descripcion = refs.customDescripcion.value.trim();
  const cantidad = parseInt(refs.customCantidad.value, 10);
  const incluyeIGV = refs.customIGV.checked;

  if (!nombre || !precio || precio <= 0 || !customImgBase64 || !cantidad || cantidad <= 0) {
    alert("Nombre, precio, imagen y cantidad son obligatorios");
    return;
  }

  const producto = {
    id: `custom-${Date.now()}`,
    titulo: nombre,
    descripcion_corta: descripcion || "Rack personalizado",
    img: customImgBase64,
    precio_base: precio,
    incluyeIGV,
    custom: true,
  };

  personalizados.unshift(producto);
  renderCategorias();
  renderProductos();

  carrito.push({
    titulo: producto.titulo,
    descripcion: producto.descripcion_corta,
    img: producto.img,
    cantidad,
    precio,
    incluyeIGV,
  });
  renderCarrito();

  refs.customNombre.value = "";
  refs.customPrecio.value = "";
  refs.customDescripcion.value = "";
  refs.customCantidad.value = 1;
  refs.customImagen.value = "";
  customImgBase64 = null;
}

// -----------------------------
// Carrito y totales
// -----------------------------
function renderCarrito() {
  refs.tabla.innerHTML = "";

  if (carrito.length === 0) {
    const fila = document.createElement("tr");
    const celda = document.createElement("td");
    celda.colSpan = 6;
    celda.className = "carrito-vacio";
    celda.textContent = "Aún no agregaste productos a la cotización.";
    fila.appendChild(celda);
    refs.tabla.appendChild(fila);
  } else {
    carrito.forEach((item, index) => {
      const fila = document.createElement("tr");

      const celdaImagen = document.createElement("td");
      celdaImagen.className = "p-2";
      if (item.img) {
        const imagen = document.createElement("img");
        imagen.src = item.img;
        imagen.alt = item.titulo || "";
        imagen.className = "carrito-img";
        celdaImagen.appendChild(imagen);
      }

      const celdaProducto = document.createElement("td");
      celdaProducto.className = "p-2";
      const titulo = document.createElement("div");
      titulo.className = "font-bold";
      titulo.textContent = item.titulo || "";
      const descripcion = document.createElement("div");
      descripcion.className = "text-xs text-gray-500";
      descripcion.style.whiteSpace = "pre-line";
      descripcion.textContent = item.descripcion || "";
      celdaProducto.append(titulo, descripcion);

      const celdaCantidad = document.createElement("td");
      celdaCantidad.className = "p-2 text-center";
      celdaCantidad.textContent = item.cantidad;

      const celdaPrecio = document.createElement("td");
      celdaPrecio.className = "p-2 text-right";
      celdaPrecio.textContent = formatearMoneda(item.precio);

      const celdaTotal = document.createElement("td");
      celdaTotal.className = "p-2 text-right";
      celdaTotal.textContent = formatearMoneda(item.cantidad * item.precio);

      const celdaEliminar = document.createElement("td");
      celdaEliminar.className = "p-2 text-center";
      const boton = document.createElement("button");
      boton.type = "button";
      boton.className = "btn-eliminar";
      boton.textContent = "✖";
      boton.title = "Eliminar";
      boton.addEventListener("click", () => {
        carrito.splice(index, 1);
        renderCarrito();
      });
      celdaEliminar.appendChild(boton);

      fila.append(celdaImagen, celdaProducto, celdaCantidad, celdaPrecio, celdaTotal, celdaEliminar);
      refs.tabla.appendChild(fila);
    });
  }

  renderTotales();
}

function leerDescuento() {
  return {
    tipo: refs.descuentoTipo.value,
    valor: parseFloat(refs.descuentoValor.value) || 0,
  };
}

function renderTotales() {
  const totales = calcularTotales(carrito, leerDescuento());
  refs.subtotal.textContent = formatearMoneda(totales.subtotal);
  refs.igv.textContent = formatearMoneda(totales.igv);
  refs.descuento.textContent = `- ${formatearMoneda(totales.descuento)}`;
  refs.total.textContent = formatearMoneda(totales.total);

  const conAdelanto = Boolean(refs.requiereAdelanto?.checked);
  refs.adelantoLinea.classList.toggle("hidden", !conAdelanto);
  refs.campoDiasEntrega?.classList.toggle("hidden", !conAdelanto);
  if (!conAdelanto && refs.diasEntrega) refs.diasEntrega.value = "";
}

function actualizarNumero() {
  refs.numeroCotizacion.textContent = numeroActual();
}

function inicializarValidez() {
  if (refs.validez.value) return;
  const limite = new Date();
  limite.setDate(limite.getDate() + 7);
  const dosDigitos = (n) => String(n).padStart(2, "0");
  refs.validez.value = `${limite.getFullYear()}-${dosDigitos(limite.getMonth() + 1)}-${dosDigitos(limite.getDate())}`;
}

function formatearValidez(valor) {
  if (!valor) return "";
  const [anio, mes, dia] = valor.split("-");
  return anio && mes && dia ? `${dia}/${mes}/${anio}` : valor;
}

// -----------------------------
// Cliente
// -----------------------------
function abrirModalCliente() {
  if (carrito.length === 0) {
    alert("No hay productos en el carrito");
    return;
  }

  refs.clienteNombre.value = "";
  refs.clienteDoc.value = "";
  refs.clienteDireccion.value = "";
  setEstadoConsulta("");
  refs.apiToken.value = getApiToken();

  refs.modalCliente.classList.remove("hidden");
}

function cerrarModalCliente() {
  refs.modalCliente.classList.add("hidden");
}

function setEstadoConsulta(mensaje, tipo = "") {
  refs.consultaEstado.textContent = mensaje;
  refs.consultaEstado.className = `consulta-estado ${tipo}`.trim();
}

async function buscarDocumento() {
  const numero = refs.clienteDoc.value;

  if (!tipoDocumento(numero)) {
    setEstadoConsulta("Ingresa un DNI (8 dígitos) o un RUC (11 dígitos).", "error");
    return;
  }

  const etiqueta = etiquetaCliente(numero);
  setEstadoConsulta("Consultando…", "info");
  refs.btnConsultarDoc.disabled = true;

  try {
    const resultado = await consultarDocumento(numero);
    if (resultado.ok) {
      if (resultado.razonSocial) refs.clienteNombre.value = resultado.razonSocial;
      if (resultado.direccion) refs.clienteDireccion.value = resultado.direccion;
      setEstadoConsulta(`✔ ${etiqueta} encontrada automáticamente.`, "ok");
    } else {
      setEstadoConsulta(resultado.error, "error");
    }
  } finally {
    refs.btnConsultarDoc.disabled = false;
  }
}

async function emitirCotizacion() {
  if (ocupado) return;

  const cliente = {
    nombre: refs.clienteNombre.value.trim() || "Cliente",
    doc: refs.clienteDoc.value.trim(),
    direccion: refs.clienteDireccion.value.trim(),
  };

  const numero = numeroActual();
  const conAdelanto = Boolean(refs.requiereAdelanto?.checked);
  const diasEntrega = parseInt(refs.diasEntrega?.value, 10) || 0;

  if (conAdelanto && diasEntrega <= 0) {
    alert(
      "Indica en cuántos días haces la entrega del rack fabricado (el 50% de adelanto lo requiere)."
    );
    return;
  }

  const meta = {
    numero,
    validez: formatearValidez(refs.validez.value),
    observaciones: refs.observaciones.value.trim(),
    descuento: leerDescuento(),
    etiquetaCliente: etiquetaCliente(cliente.doc),
    adelanto: conAdelanto,
    diasEntrega,
  };

  ocupado = true;
  refs.btnGenerarPdf.disabled = true;
  refs.btnGenerarPdf.textContent = "Generando…";

  try {
    await generarPDF(carrito, cliente, meta);

    reservarNumero();
    guardarEnHistorial(numero, cliente, meta);

    carrito = [];
    renderCarrito();
    actualizarNumero();
    cerrarModalCliente();
  } catch (error) {
    console.error("Error al generar el PDF:", error);
    alert("No se pudo generar el PDF. Intenta nuevamente.");
  } finally {
    ocupado = false;
    refs.btnGenerarPdf.disabled = false;
    refs.btnGenerarPdf.textContent = "Generar PDF";
  }
}

// -----------------------------
// Historial
// -----------------------------
function guardarEnHistorial(numero, cliente, meta) {
  const totales = calcularTotales(carrito, meta.descuento);
  agregarAlHistorial({
    numero,
    fecha: new Date().toISOString(),
    cliente,
    items: carrito.map((item) => ({ ...item })),
    subtotal: totales.subtotal,
    igv: totales.igv,
    descuento: totales.descuento,
    total: totales.total,
    validez: meta.validez,
    observaciones: meta.observaciones,
    etiquetaCliente: meta.etiquetaCliente,
    adelanto: Boolean(meta.adelanto),
    diasEntrega: meta.adelanto ? parseInt(meta.diasEntrega, 10) || 0 : 0,
  });
  renderHistorial();
}

function formatearFecha(fechaISO) {
  try {
    return new Date(fechaISO).toLocaleString("es-PE", {
      timeZone: "America/Lima",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function renderHistorial() {
  const historial = getHistorial();

  refs.historialLista.innerHTML = "";
  refs.historialVacio.classList.toggle("hidden", historial.length > 0);
  refs.btnLimpiarHistorial.classList.toggle("hidden", historial.length === 0);

  for (const cotizacion of historial) {
    const item = document.createElement("li");
    item.className = "historial-item";

    const info = document.createElement("div");
    info.className = "historial-info";

    const titulo = document.createElement("div");
    titulo.className = "historial-numero";
    titulo.textContent = `${cotizacion.numero} · ${formatearFecha(cotizacion.fecha)}`;

    const cliente = document.createElement("div");
    cliente.className = "historial-cliente";
    cliente.textContent = `${cotizacion.cliente?.nombre || "Cliente"}${
      cotizacion.cliente?.doc ? ` · ${cotizacion.cliente.doc}` : ""
    }`;

    const total = document.createElement("div");
    total.className = "historial-total";
    total.textContent = formatearMoneda(cotizacion.total);

    info.append(titulo, cliente, total);

    const acciones = document.createElement("div");
    acciones.className = "historial-acciones";

    const btnReimprimir = document.createElement("button");
    btnReimprimir.type = "button";
    btnReimprimir.className = "btn-secondary";
    btnReimprimir.textContent = "Reimprimir";
    btnReimprimir.addEventListener("click", () => reimprimir(cotizacion));

    const btnCargar = document.createElement("button");
    btnCargar.type = "button";
    btnCargar.className = "btn-secondary";
    btnCargar.textContent = "Cargar";
    btnCargar.addEventListener("click", () => cargarCotizacion(cotizacion));

    const btnEliminar = document.createElement("button");
    btnEliminar.type = "button";
    btnEliminar.className = "btn-danger";
    btnEliminar.textContent = "Eliminar";
    btnEliminar.addEventListener("click", () => {
      if (!confirm(`¿Eliminar la cotización ${cotizacion.numero}?`)) return;
      eliminarDelHistorial(cotizacion.numero);
      renderHistorial();
    });

    acciones.append(btnReimprimir, btnCargar, btnEliminar);
    item.append(info, acciones);
    refs.historialLista.appendChild(item);
  }
}

async function reimprimir(cotizacion) {
  try {
    await generarPDF(cotizacion.items || [], cotizacion.cliente || {}, {
      numero: cotizacion.numero,
      validez: cotizacion.validez,
      observaciones: cotizacion.observaciones,
      descuento: { tipo: "monto", valor: cotizacion.descuento || 0 },
      etiquetaCliente: cotizacion.etiquetaCliente,
      adelanto: Boolean(cotizacion.adelanto),
      diasEntrega: parseInt(cotizacion.diasEntrega, 10) || 0,
    });
  } catch (error) {
    console.error("Error al reimprimir:", error);
    alert("No se pudo reimprimir la cotización.");
  }
}

function cargarCotizacion(cotizacion) {
  carrito = (cotizacion.items || []).map((item) => ({ ...item }));
  refs.descuentoValor.value = cotizacion.descuento || 0;
  refs.descuentoTipo.value = "monto";
  if (cotizacion.validez) {
    const [dia, mes, anio] = String(cotizacion.validez).split("/");
    if (dia && mes && anio) refs.validez.value = `${anio}-${mes}-${dia}`;
  }
  refs.observaciones.value = cotizacion.observaciones || "";
  refs.requiereAdelanto.checked = Boolean(cotizacion.adelanto);
  if (refs.diasEntrega) {
    refs.diasEntrega.value = cotizacion.diasEntrega ? cotizacion.diasEntrega : "";
  }
  renderCarrito();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// -----------------------------
// Eventos
// -----------------------------
function bindEventos() {
  refs.buscador.addEventListener("input", () => {
    filtro.texto = refs.buscador.value;
    renderProductos();
  });

  refs.filtroCategoria.addEventListener("change", () => {
    filtro.categoria = refs.filtroCategoria.value;
    renderProductos();
  });

  refs.descuentoValor.addEventListener("input", renderTotales);
  refs.descuentoTipo.addEventListener("change", renderTotales);
  refs.requiereAdelanto.addEventListener("change", renderTotales);

  refs.customImagen.addEventListener("change", manejarImagenCustom);
  refs.btnAgregarCustom.addEventListener("click", agregarRackCustom);

  refs.btnGenerar.addEventListener("click", abrirModalCliente);
  refs.btnCancelarPdf.addEventListener("click", cerrarModalCliente);
  refs.btnGenerarPdf.addEventListener("click", emitirCotizacion);

  refs.btnConsultarDoc.addEventListener("click", buscarDocumento);
  refs.clienteDoc.addEventListener("change", () => {
    const numero = limpiarNumero(refs.clienteDoc.value);
    if (numero.length === 8 || numero.length === 11) buscarDocumento();
  });

  refs.apiToken.addEventListener("change", () => {
    setApiToken(refs.apiToken.value);
  });

  refs.btnLimpiarHistorial.addEventListener("click", () => {
    if (!confirm("¿Borrar todo el historial de cotizaciones?")) return;
    limpiarHistorial();
    renderHistorial();
  });
}
