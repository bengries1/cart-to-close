/**
 * Parser for Amazon All Orders Report flat file
 * Report type: GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL
 *
 * Tab-delimited file with one row per order line item.
 * Orders with multiple items appear as multiple rows with the same amazon-order-id.
 */

export interface ParsedOrderItem {
  sku: string;
  asin: string;
  productName: string;
  quantity: number;
  itemPrice: number;
  itemTax: number;
  shippingPrice: number;
  shippingTax: number;
  giftWrapPrice: number;
  giftWrapTax: number;
  itemPromotionDiscount: number;
  shipPromotionDiscount: number;
  itemStatus: string;
  promotionIds: string;
}

export interface ParsedAmazonOrder {
  amazonOrderId: string;
  merchantOrderId: string;
  purchaseDate: string;
  lastUpdatedDate: string;
  orderStatus: string;
  fulfillmentChannel: string;
  salesChannel: string;
  orderChannel: string;
  shipServiceLevel: string;
  currency: string;
  shipCity: string;
  shipState: string;
  shipPostalCode: string;
  shipCountry: string;
  isBusinessOrder: boolean;
  purchaseOrderNumber: string;
  items: ParsedOrderItem[];
  orderTotal: number;
  orderTax: number;
}

export interface OrderReportSummary {
  orders: ParsedAmazonOrder[];
  orderCount: number;
  totalAmount: number;
  currency: string;
  startDate: string;
  endDate: string;
}

export function parseOrderReport(rawText: string): OrderReportSummary {
  const lines = rawText.trim().split("\n");

  if (lines.length < 2) {
    throw new Error("Order report has no data rows");
  }

  const headers = lines[0].split("\t").map((h) => h.trim().toLowerCase());
  const col = (name: string) => headers.indexOf(name);

  // Map column indices
  const orderIdIdx = col("amazon-order-id");
  const merchantOrderIdIdx = col("merchant-order-id");
  const purchaseDateIdx = col("purchase-date");
  const lastUpdatedIdx = col("last-updated-date");
  const orderStatusIdx = col("order-status");
  const fulfillmentIdx = col("fulfillment-channel");
  const salesChannelIdx = col("sales-channel");
  const orderChannelIdx = col("order-channel");
  const shipServiceIdx = col("ship-service-level");
  const productNameIdx = col("product-name");
  const skuIdx = col("sku");
  const asinIdx = col("asin");
  const itemStatusIdx = col("item-status");
  const quantityIdx = col("quantity");
  const currencyIdx = col("currency");
  const itemPriceIdx = col("item-price");
  const itemTaxIdx = col("item-tax");
  const shippingPriceIdx = col("shipping-price");
  const shippingTaxIdx = col("shipping-tax");
  const giftWrapPriceIdx = col("gift-wrap-price");
  const giftWrapTaxIdx = col("gift-wrap-tax");
  const itemPromoIdx = col("item-promotion-discount");
  const shipPromoIdx = col("ship-promotion-discount");
  const shipCityIdx = col("ship-city");
  const shipStateIdx = col("ship-state");
  const shipPostalIdx = col("ship-postal-code");
  const shipCountryIdx = col("ship-country");
  const promoIdsIdx = col("promotion-ids");
  const isBusinessIdx = col("is-business-order");
  const poNumberIdx = col("purchase-order-number");

  if (orderIdIdx < 0) {
    throw new Error(
      "Could not find 'amazon-order-id' column. Is this an Amazon orders report?"
    );
  }

  // Group rows by order ID
  const orderMap = new Map<string, { order: Partial<ParsedAmazonOrder>; items: ParsedOrderItem[] }>();

  for (let i = 1; i < lines.length; i++) {
    const fields = lines[i].split("\t").map((f) => f.trim());
    if (fields.length < 2) continue;

    const orderId = fields[orderIdIdx] || "";
    if (!orderId) continue;

    const f = (idx: number) => (idx >= 0 ? fields[idx] || "" : "");
    const n = (idx: number) => (idx >= 0 ? parseFloat(fields[idx]) || 0 : 0);

    if (!orderMap.has(orderId)) {
      orderMap.set(orderId, {
        order: {
          amazonOrderId: orderId,
          merchantOrderId: f(merchantOrderIdIdx),
          purchaseDate: f(purchaseDateIdx),
          lastUpdatedDate: f(lastUpdatedIdx),
          orderStatus: f(orderStatusIdx),
          fulfillmentChannel: f(fulfillmentIdx),
          salesChannel: f(salesChannelIdx),
          orderChannel: f(orderChannelIdx),
          shipServiceLevel: f(shipServiceIdx),
          currency: f(currencyIdx) || "USD",
          shipCity: f(shipCityIdx),
          shipState: f(shipStateIdx),
          shipPostalCode: f(shipPostalIdx),
          shipCountry: f(shipCountryIdx),
          isBusinessOrder: f(isBusinessIdx).toLowerCase() === "true",
          purchaseOrderNumber: f(poNumberIdx),
        },
        items: [],
      });
    }

    const entry = orderMap.get(orderId)!;
    entry.items.push({
      sku: f(skuIdx),
      asin: f(asinIdx),
      productName: f(productNameIdx),
      quantity: parseInt(fields[quantityIdx] || "0", 10) || 0,
      itemPrice: n(itemPriceIdx),
      itemTax: n(itemTaxIdx),
      shippingPrice: n(shippingPriceIdx),
      shippingTax: n(shippingTaxIdx),
      giftWrapPrice: n(giftWrapPriceIdx),
      giftWrapTax: n(giftWrapTaxIdx),
      itemPromotionDiscount: n(itemPromoIdx),
      shipPromotionDiscount: n(shipPromoIdx),
      itemStatus: f(itemStatusIdx),
      promotionIds: f(promoIdsIdx),
    });
  }

  // Build final order list
  const orders: ParsedAmazonOrder[] = [];
  let currency = "USD";
  let minDate = "";
  let maxDate = "";

  for (const entry of Array.from(orderMap.values())) {
    const { order, items } = entry;
    const orderTotal = items.reduce(
      (sum: number, item: ParsedOrderItem) =>
        sum +
        item.itemPrice +
        item.shippingPrice +
        item.giftWrapPrice -
        item.itemPromotionDiscount -
        item.shipPromotionDiscount,
      0
    );
    const orderTax = items.reduce(
      (sum: number, item: ParsedOrderItem) => sum + item.itemTax + item.shippingTax + item.giftWrapTax,
      0
    );

    const fullOrder: ParsedAmazonOrder = {
      ...(order as ParsedAmazonOrder),
      items,
      orderTotal: Math.round(orderTotal * 100) / 100,
      orderTax: Math.round(orderTax * 100) / 100,
    };

    orders.push(fullOrder);

    if (fullOrder.currency) currency = fullOrder.currency;

    const d = fullOrder.purchaseDate;
    if (d) {
      if (!minDate || d < minDate) minDate = d;
      if (!maxDate || d > maxDate) maxDate = d;
    }
  }

  // Sort by purchase date descending
  orders.sort((a, b) => (b.purchaseDate || "").localeCompare(a.purchaseDate || ""));

  const totalAmount = orders.reduce((sum, o) => sum + o.orderTotal, 0);

  return {
    orders,
    orderCount: orders.length,
    totalAmount: Math.round(totalAmount * 100) / 100,
    currency,
    startDate: minDate,
    endDate: maxDate,
  };
}
