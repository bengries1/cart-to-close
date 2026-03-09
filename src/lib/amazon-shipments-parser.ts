/**
 * Parser for Amazon FBA Shipments Report flat file
 * Report type: GET_AMAZON_FULFILLED_SHIPMENTS_DATA_GENERAL
 *
 * Tab-delimited file with one row per shipped item.
 * A single shipment may have multiple items; orders may have multiple shipments.
 */

export interface ParsedShipmentItem {
  shipmentItemId: string;
  amazonOrderItemId: string;
  merchantOrderItemId: string;
  sku: string;
  productName: string;
  quantityShipped: number;
  itemPrice: number;
  itemTax: number;
  shippingPrice: number;
  shippingTax: number;
  giftWrapPrice: number;
  giftWrapTax: number;
  itemPromotionDiscount: number;
  itemPromotionId: string;
  shipPromotionDiscount: number;
  shipPromotionId: string;
}

export interface ParsedAmazonShipment {
  amazonOrderId: string;
  merchantOrderId: string;
  shipmentId: string;
  purchaseDate: string;
  paymentsDate: string;
  shipmentDate: string;
  reportingDate: string;
  buyerEmail: string;
  buyerName: string;
  currency: string;
  shipServiceLevel: string;
  recipientName: string;
  shipCity: string;
  shipState: string;
  shipPostalCode: string;
  shipCountry: string;
  trackingNumber: string;
  fulfillmentCenterId: string;
  fulfillmentChannel: string;
  salesChannel: string;
  items: ParsedShipmentItem[];
  shipmentTotal: number;
  shipmentTax: number;
}

export interface ShipmentReportSummary {
  shipments: ParsedAmazonShipment[];
  shipmentCount: number;
  totalAmount: number;
  currency: string;
  startDate: string;
  endDate: string;
}

export function parseShipmentReport(rawText: string): ShipmentReportSummary {
  const lines = rawText.trim().replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  if (lines.length < 2) {
    throw new Error("Shipment report has no data rows");
  }

  const headers = lines[0].split("\t").map((h) => h.trim().toLowerCase());
  const col = (name: string) => headers.indexOf(name);

  // Map column indices
  const orderIdIdx = col("amazon-order-id");
  const merchantOrderIdIdx = col("merchant-order-id");
  const shipmentIdIdx = col("shipment-id");
  const shipmentItemIdIdx = col("shipment-item-id");
  const orderItemIdIdx = col("amazon-order-item-id");
  const merchantItemIdIdx = col("merchant-order-item-id");
  const purchaseDateIdx = col("purchase-date");
  const paymentDateIdx = col("payments-date");
  const shipmentDateIdx = col("shipment-date");
  const reportingDateIdx = col("reporting-date");
  const buyerEmailIdx = col("buyer-email");
  const buyerNameIdx = col("buyer-name");
  const skuIdx = col("sku");
  const productNameIdx = col("product-name");
  const qtyShippedIdx = col("quantity-shipped");
  const currencyIdx = col("currency");
  const itemPriceIdx = col("item-price");
  const itemTaxIdx = col("item-tax");
  const shippingPriceIdx = col("shipping-price");
  const shippingTaxIdx = col("shipping-tax");
  const giftWrapPriceIdx = col("gift-wrap-price");
  const giftWrapTaxIdx = col("gift-wrap-tax");
  const shipServiceIdx = col("ship-service-level");
  const recipientIdx = col("recipient-name");
  const shipCityIdx = col("ship-city");
  const shipStateIdx = col("ship-state");
  const shipPostalIdx = col("ship-postal-code");
  const shipCountryIdx = col("ship-country");
  const itemPromoDiscountIdx = col("item-promotion-discount");
  const itemPromoIdIdx = col("item-promotion-id");
  const shipPromoDiscountIdx = col("ship-promotion-discount");
  const shipPromoIdIdx = col("ship-promotion-id");
  const trackingIdx = col("tracking-number");
  const fcIdIdx = col("fulfillment-center-id");
  const fulfillmentChannelIdx = col("fulfillment-channel");
  const salesChannelIdx = col("sales-channel");

  if (orderIdIdx < 0) {
    throw new Error(
      "Could not find 'amazon-order-id' column. Is this an Amazon shipments report?"
    );
  }

  // Group rows by shipment ID (or order ID if no shipment ID)
  const shipmentMap = new Map<
    string,
    { shipment: Partial<ParsedAmazonShipment>; items: ParsedShipmentItem[] }
  >();

  for (let i = 1; i < lines.length; i++) {
    const fields = lines[i].split("\t").map((f) => f.trim());
    if (fields.length < 2) continue;

    const orderId = fields[orderIdIdx] || "";
    if (!orderId) continue;

    const f = (idx: number) => (idx >= 0 ? fields[idx] || "" : "");
    const n = (idx: number) => (idx >= 0 ? parseFloat(fields[idx]) || 0 : 0);

    const shipId = f(shipmentIdIdx) || orderId;
    const key = `${orderId}::${shipId}`;

    if (!shipmentMap.has(key)) {
      shipmentMap.set(key, {
        shipment: {
          amazonOrderId: orderId,
          merchantOrderId: f(merchantOrderIdIdx),
          shipmentId: f(shipmentIdIdx),
          purchaseDate: f(purchaseDateIdx),
          paymentsDate: f(paymentDateIdx),
          shipmentDate: f(shipmentDateIdx),
          reportingDate: f(reportingDateIdx),
          buyerEmail: f(buyerEmailIdx),
          buyerName: f(buyerNameIdx),
          currency: f(currencyIdx) || "USD",
          shipServiceLevel: f(shipServiceIdx),
          recipientName: f(recipientIdx),
          shipCity: f(shipCityIdx),
          shipState: f(shipStateIdx),
          shipPostalCode: f(shipPostalIdx),
          shipCountry: f(shipCountryIdx),
          trackingNumber: f(trackingIdx),
          fulfillmentCenterId: f(fcIdIdx),
          fulfillmentChannel: f(fulfillmentChannelIdx),
          salesChannel: f(salesChannelIdx),
        },
        items: [],
      });
    }

    const entry = shipmentMap.get(key)!;
    entry.items.push({
      shipmentItemId: f(shipmentItemIdIdx),
      amazonOrderItemId: f(orderItemIdIdx),
      merchantOrderItemId: f(merchantItemIdIdx),
      sku: f(skuIdx),
      productName: f(productNameIdx),
      quantityShipped: parseInt(fields[qtyShippedIdx] || "0", 10) || 0,
      itemPrice: n(itemPriceIdx),
      itemTax: n(itemTaxIdx),
      shippingPrice: n(shippingPriceIdx),
      shippingTax: n(shippingTaxIdx),
      giftWrapPrice: n(giftWrapPriceIdx),
      giftWrapTax: n(giftWrapTaxIdx),
      itemPromotionDiscount: n(itemPromoDiscountIdx),
      itemPromotionId: f(itemPromoIdIdx),
      shipPromotionDiscount: n(shipPromoDiscountIdx),
      shipPromotionId: f(shipPromoIdIdx),
    });
  }

  // Build final shipment list
  const shipments: ParsedAmazonShipment[] = [];
  let currency = "USD";
  let minDate = "";
  let maxDate = "";

  for (const entry of Array.from(shipmentMap.values())) {
    const { shipment, items } = entry;
    const total = items.reduce(
      (sum: number, item: ParsedShipmentItem) =>
        sum +
        item.itemPrice +
        item.shippingPrice +
        item.giftWrapPrice -
        item.itemPromotionDiscount -
        item.shipPromotionDiscount,
      0
    );
    const tax = items.reduce(
      (sum: number, item: ParsedShipmentItem) => sum + item.itemTax + item.shippingTax + item.giftWrapTax,
      0
    );

    const fullShipment: ParsedAmazonShipment = {
      ...(shipment as ParsedAmazonShipment),
      items,
      shipmentTotal: Math.round(total * 100) / 100,
      shipmentTax: Math.round(tax * 100) / 100,
    };

    shipments.push(fullShipment);

    if (fullShipment.currency) currency = fullShipment.currency;

    const d = fullShipment.shipmentDate || fullShipment.purchaseDate;
    if (d) {
      if (!minDate || d < minDate) minDate = d;
      if (!maxDate || d > maxDate) maxDate = d;
    }
  }

  // Sort by shipment date descending
  shipments.sort((a, b) =>
    (b.shipmentDate || b.purchaseDate || "").localeCompare(
      a.shipmentDate || a.purchaseDate || ""
    )
  );

  const totalAmount = shipments.reduce((sum, s) => sum + s.shipmentTotal, 0);

  return {
    shipments,
    shipmentCount: shipments.length,
    totalAmount: Math.round(totalAmount * 100) / 100,
    currency,
    startDate: minDate,
    endDate: maxDate,
  };
}
