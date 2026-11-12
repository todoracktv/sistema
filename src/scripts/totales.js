// Cálculo de totales de la cotización (IGV 18% y descuento).

export const IGV = 0.18;

const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Calcula base, IGV, descuento y total del carrito.
 * @param {Array} carrito
 * @param {{tipo: "monto"|"porcentaje", valor: number}} descuento
 */
export function calcularTotales(carrito = [], descuento = {}) {
  const tipo = descuento?.tipo === "porcentaje" ? "porcentaje" : "monto";
  const valorDescuento = Number(descuento?.valor) || 0;

  let base = 0;
  let igv = 0;

  for (const item of carrito) {
    const precio = Number(item.precio) || 0;
    const cantidad = Number(item.cantidad) || 0;

    if (item.incluyeIGV) {
      const baseUnitaria = precio / (1 + IGV);
      base += baseUnitaria * cantidad;
      igv += (precio - baseUnitaria) * cantidad;
    } else {
      base += precio * cantidad;
      igv += precio * IGV * cantidad;
    }
  }

  const bruto = base + igv;
  let descuentoMonto =
    tipo === "porcentaje" ? (bruto * valorDescuento) / 100 : valorDescuento;
  descuentoMonto = Math.min(Math.max(descuentoMonto, 0), bruto);

  return {
    subtotal: redondear(base),
    igv: redondear(igv),
    bruto: redondear(bruto),
    descuento: redondear(descuentoMonto),
    total: redondear(bruto - descuentoMonto),
  };
}

export function formatearMoneda(monto) {
  return `S/ ${(Number(monto) || 0).toFixed(2)}`;
}
