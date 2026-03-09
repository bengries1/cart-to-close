import { db } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/encryption";

// ──────────────────────────────────────────
// Types
// ──────────────────────────────────────────

export interface SettlementReport {
  settlementId: string;
  settlementStartDate: string;
  settlementEndDate: string;
  depositDate: string;
  totalAmount: number;
  currency: string;
  transactions: SettlementTransaction[];
  fees: SettlementFeeSummary[];
}

export interface SettlementTransaction {
  orderId: string;
  merchantOrderId: string;
  adjustmentId: string;
  shipmentId: string;
  marketplaceName: string;
  amountType: string;
  amountDescription: string;
  amount: number;
  fulfillmentId: string;
  postedDate: string;
  postedDateTime: string;
  orderItemCode: string;
  merchantOrderItemId: string;
  merchantAdjustmentItemId: string;
  sku: string;
  quantityPurchased: number;
  promotionId: string;
}

export interface SettlementFeeSummary {
  amountType: string;
  amountDescription: string;
  totalAmount: number;
  transactionCount: number;
}

export interface AmazonOrder {
  AmazonOrderId: string;
  PurchaseDate: string;
  LastUpdateDate: string;
  OrderStatus: string;
  FulfillmentChannel: string;
  SalesChannel: string;
  OrderTotal?: { CurrencyCode: string; Amount: string };
  NumberOfItemsShipped: number;
  NumberOfItemsUnshipped: number;
  BuyerInfo?: { BuyerEmail?: string };
  ShippingAddress?: {
    Name?: string;
    City?: string;
    StateOrRegion?: string;
    PostalCode?: string;
    CountryCode?: string;
  };
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

interface ReportDocument {
  reportDocumentId: string;
  url: string;
  compressionAlgorithm?: string;
}

// ──────────────────────────────────────────
// Amazon SP-API Client
// ──────────────────────────────────────────

const SP_API_BASE =
  process.env.AMAZON_SP_API_SANDBOX === "true"
    ? "https://sandbox.sellingpartnerapi-na.amazon.com"
    : "https://sellingpartnerapi-na.amazon.com";
const TOKEN_URL = "https://api.amazon.com/auth/o2/token";
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh 5 min before expiry

export class AmazonSpApiClient {
  private connectionId: string;
  private organizationId: string;
  private sellerId: string;
  private marketplace: string;
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;
  private refreshToken: string;

  private constructor(
    connectionId: string,
    organizationId: string,
    sellerId: string,
    marketplace: string,
    refreshToken: string,
    accessToken: string | null,
    tokenExpiry: Date | null
  ) {
    this.connectionId = connectionId;
    this.organizationId = organizationId;
    this.sellerId = sellerId;
    this.marketplace = marketplace;
    this.refreshToken = refreshToken;
    this.accessToken = accessToken;
    this.tokenExpiry = tokenExpiry;
  }

  /**
   * Load a client from the database for a given org + seller.
   * Decrypts stored tokens automatically.
   */
  static async forConnection(
    organizationId: string,
    sellerId: string
  ): Promise<AmazonSpApiClient> {
    const conn = await db.amazonConnection.findUnique({
      where: {
        organizationId_sellerId: { organizationId, sellerId },
      },
    });

    if (!conn || !conn.isActive) {
      throw new Error("Amazon connection not found or inactive");
    }

    const refreshToken = decrypt(conn.refreshToken);
    const accessToken = conn.accessToken ? decrypt(conn.accessToken) : null;

    return new AmazonSpApiClient(
      conn.id,
      conn.organizationId,
      conn.sellerId,
      conn.marketplace,
      refreshToken,
      accessToken,
      conn.tokenExpiry
    );
  }

  /**
   * Load the first active connection for an org.
   */
  static async forOrganization(
    organizationId: string
  ): Promise<AmazonSpApiClient> {
    const conn = await db.amazonConnection.findFirst({
      where: { organizationId, isActive: true },
      orderBy: { createdAt: "asc" },
    });

    if (!conn) {
      throw new Error("No active Amazon connection for this organization");
    }

    const refreshToken = decrypt(conn.refreshToken);
    const accessToken = conn.accessToken ? decrypt(conn.accessToken) : null;

    return new AmazonSpApiClient(
      conn.id,
      conn.organizationId,
      conn.sellerId,
      conn.marketplace,
      refreshToken,
      accessToken,
      conn.tokenExpiry
    );
  }

  // ──────────────────────────────────────────
  // Token management
  // ──────────────────────────────────────────

  private isTokenExpired(): boolean {
    if (!this.accessToken || !this.tokenExpiry) return true;
    return Date.now() >= this.tokenExpiry.getTime() - TOKEN_REFRESH_BUFFER_MS;
  }

  private async refreshAccessToken(): Promise<void> {
    const clientId = process.env.AMAZON_CLIENT_ID;
    const clientSecret = process.env.AMAZON_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error("Amazon SP-API credentials not configured");
    }

    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: this.refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Token refresh failed (${res.status}): ${text}`);
    }

    const data: TokenResponse = await res.json();

    this.accessToken = data.access_token;
    this.tokenExpiry = new Date(Date.now() + data.expires_in * 1000);

    // If Amazon rotated the refresh token, update it
    if (data.refresh_token && data.refresh_token !== this.refreshToken) {
      this.refreshToken = data.refresh_token;
    }

    // Persist encrypted tokens to DB
    await db.amazonConnection.update({
      where: { id: this.connectionId },
      data: {
        accessToken: encrypt(this.accessToken),
        refreshToken: encrypt(this.refreshToken),
        tokenExpiry: this.tokenExpiry,
      },
    });
  }

  private async getAccessToken(): Promise<string> {
    if (this.isTokenExpired()) {
      await this.refreshAccessToken();
    }
    return this.accessToken!;
  }

  // ──────────────────────────────────────────
  // HTTP helpers
  // ──────────────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    options?: { query?: Record<string, string>; body?: unknown }
  ): Promise<T> {
    const token = await this.getAccessToken();

    let url = `${SP_API_BASE}${path}`;
    if (options?.query) {
      const params = new URLSearchParams(options.query);
      url += `?${params.toString()}`;
    }

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-amz-access-token": token,
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    if (res.status === 429) {
      // Rate limited — wait and retry once
      const retryAfter = parseInt(res.headers.get("retry-after") || "2", 10);
      await new Promise((resolve) =>
        setTimeout(resolve, retryAfter * 1000)
      );
      return this.request<T>(method, path, options);
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`SP-API ${method} ${path} failed (${res.status}): ${text}`);
    }

    return res.json();
  }

  private async get<T>(
    path: string,
    query?: Record<string, string>
  ): Promise<T> {
    return this.request<T>("GET", path, { query });
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("POST", path, { body });
  }

  // ──────────────────────────────────────────
  // Reports API — Settlement Reports
  // ──────────────────────────────────────────

  /**
   * Request a new settlement report or list recent ones.
   * Settlement reports are auto-generated by Amazon, so we list existing ones.
   */
  async listSettlementReports(options?: {
    createdSince?: string; // ISO date
    createdUntil?: string;
    pageSize?: number;
    nextToken?: string;
  }): Promise<{
    reports: Array<{
      reportId: string;
      reportType: string;
      processingStatus: string;
      dataStartTime?: string;
      dataEndTime?: string;
      createdTime: string;
      reportDocumentId?: string;
    }>;
    nextToken?: string;
  }> {
    const query: Record<string, string> = {
      reportTypes: "GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE_V2",
      pageSize: String(options?.pageSize || 10),
    };

    if (options?.createdSince) query.createdSince = options.createdSince;
    if (options?.createdUntil) query.createdUntil = options.createdUntil;
    if (options?.nextToken) query.nextToken = options.nextToken;

    const data = await this.get<any>("/reports/2021-06-30/reports", query);

    return {
      reports: data.reports || [],
      nextToken: data.nextToken,
    };
  }

  /**
   * Get the download URL for a report document.
   */
  async getReportDocument(reportDocumentId: string): Promise<ReportDocument> {
    return this.get<ReportDocument>(
      `/reports/2021-06-30/documents/${reportDocumentId}`
    );
  }

  /**
   * Download and parse a settlement report by its reportDocumentId.
   */
  async downloadSettlementReport(
    reportDocumentId: string
  ): Promise<SettlementReport> {
    const doc = await this.getReportDocument(reportDocumentId);

    // The URL is pre-signed — fetch directly (no auth header needed)
    const res = await fetch(doc.url);
    if (!res.ok) {
      throw new Error(
        `Failed to download report document (${res.status})`
      );
    }

    const text = await res.text();
    return parseSettlementReport(text);
  }

  /**
   * Convenience: get the most recent settlement report, download and parse it.
   */
  async getLatestSettlementReport(): Promise<SettlementReport | null> {
    const { reports } = await this.listSettlementReports({ pageSize: 1 });

    const doneReport = reports.find(
      (r) => r.processingStatus === "DONE" && r.reportDocumentId
    );
    if (!doneReport?.reportDocumentId) return null;

    return this.downloadSettlementReport(doneReport.reportDocumentId);
  }

  // ──────────────────────────────────────────
  // Orders API
  // ──────────────────────────────────────────

  /**
   * Fetch orders created/updated in a time range.
   */
  async getOrders(options: {
    createdAfter?: string; // ISO date
    createdBefore?: string;
    lastUpdatedAfter?: string;
    lastUpdatedBefore?: string;
    orderStatuses?: string[];
    maxResults?: number;
    nextToken?: string;
  }): Promise<{
    orders: AmazonOrder[];
    nextToken?: string;
  }> {
    const query: Record<string, string> = {
      MarketplaceIds: this.marketplace,
    };

    if (options.createdAfter) query.CreatedAfter = options.createdAfter;
    if (options.createdBefore) query.CreatedBefore = options.createdBefore;
    if (options.lastUpdatedAfter)
      query.LastUpdatedAfter = options.lastUpdatedAfter;
    if (options.lastUpdatedBefore)
      query.LastUpdatedBefore = options.lastUpdatedBefore;
    if (options.orderStatuses)
      query.OrderStatuses = options.orderStatuses.join(",");
    if (options.maxResults)
      query.MaxResultsPerPage = String(options.maxResults);
    if (options.nextToken) query.NextToken = options.nextToken;

    const data = await this.get<any>("/orders/v0/orders", query);
    const payload = data.payload || data;

    return {
      orders: payload.Orders || [],
      nextToken: payload.NextToken,
    };
  }

  /**
   * Fetch a single order by Amazon Order ID.
   */
  async getOrder(orderId: string): Promise<AmazonOrder> {
    const data = await this.get<any>(`/orders/v0/orders/${orderId}`);
    return data.payload || data;
  }

  /**
   * Fetch order items (line items) for an order.
   */
  async getOrderItems(orderId: string): Promise<{
    orderItems: Array<{
      ASIN: string;
      SellerSKU: string;
      OrderItemId: string;
      Title: string;
      QuantityOrdered: number;
      QuantityShipped: number;
      ItemPrice?: { CurrencyCode: string; Amount: string };
      ItemTax?: { CurrencyCode: string; Amount: string };
      PromotionDiscount?: { CurrencyCode: string; Amount: string };
    }>;
    nextToken?: string;
  }> {
    const data = await this.get<any>(
      `/orders/v0/orders/${orderId}/orderItems`
    );
    const payload = data.payload || data;

    return {
      orderItems: payload.OrderItems || [],
      nextToken: payload.NextToken,
    };
  }
}

// ──────────────────────────────────────────
// Settlement Report Parser
// ──────────────────────────────────────────

/**
 * Parse an Amazon V2 settlement report flat file (tab-delimited)
 * into structured JSON.
 *
 * The file format has a header row followed by data rows.
 * Key columns: settlement-id, settlement-start-date, settlement-end-date,
 * deposit-date, total-amount, currency, order-id, amount-type,
 * amount-description, amount, etc.
 */
export function parseSettlementReport(rawText: string): SettlementReport {
  const lines = rawText.trim().split("\n");

  if (lines.length < 2) {
    throw new Error("Settlement report has no data rows");
  }

  // Header row (tab-delimited)
  const headers = lines[0].split("\t").map((h) => h.trim().toLowerCase());

  const col = (name: string) => headers.indexOf(name);

  const settlementIdIdx = col("settlement-id");
  const startDateIdx = col("settlement-start-date");
  const endDateIdx = col("settlement-end-date");
  const depositDateIdx = col("deposit-date");
  const totalAmountIdx = col("total-amount");
  const currencyIdx = col("currency");
  const orderIdIdx = col("order-id");
  const merchantOrderIdIdx = col("merchant-order-id");
  const adjustmentIdIdx = col("adjustment-id");
  const shipmentIdIdx = col("shipment-id");
  const marketplaceIdx = col("marketplace-name");
  const amountTypeIdx = col("amount-type");
  const amountDescIdx = col("amount-description");
  const amountIdx = col("amount");
  const fulfillmentIdx = col("fulfillment-id");
  const postedDateIdx = col("posted-date");
  const postedDateTimeIdx = col("posted-date-time");
  const orderItemCodeIdx = col("order-item-code");
  const merchantOrderItemIdx = col("merchant-order-item-id");
  const merchantAdjItemIdx = col("merchant-adjustment-item-id");
  const skuIdx = col("sku");
  const qtyIdx = col("quantity-purchased");
  const promoIdx = col("promotion-id");

  // V2 flat file columns (separate column pairs per fee category)
  const priceTypeIdx = col("price-type");
  const priceAmountIdx = col("price-amount");
  const itemFeeTypeIdx = col("item-related-fee-type");
  const itemFeeAmountIdx = col("item-related-fee-amount");
  const shipFeeTypeIdx = col("shipment-fee-type");
  const shipFeeAmountIdx = col("shipment-fee-amount");
  const orderFeeTypeIdx = col("order-fee-type");
  const orderFeeAmountIdx = col("order-fee-amount");
  const miscFeeAmountIdx = col("misc-fee-amount");
  const otherFeeAmountIdx = col("other-fee-amount");
  const otherFeeReasonIdx = col("other-fee-reason-description");
  const promoTypeIdx = col("promotion-type");
  const promoAmountIdx = col("promotion-amount");
  const directPayTypeIdx = col("direct-payment-type");
  const directPayAmountIdx = col("direct-payment-amount");
  const otherAmountIdx = col("other-amount");
  const transactionTypeIdx = col("transaction-type");

  // Detect V2 format: has price-type/price-amount columns instead of amount-type/amount
  const isV2 = priceAmountIdx >= 0 && amountIdx < 0;

  let settlementId = "";
  let startDate = "";
  let endDate = "";
  let depositDate = "";
  let totalAmount = 0;
  let currency = "";
  const transactions: SettlementTransaction[] = [];
  const feeMap = new Map<
    string,
    { totalAmount: number; transactionCount: number }
  >();

  for (let i = 1; i < lines.length; i++) {
    const fields = lines[i].split("\t").map((f) => f.trim());

    // Skip empty lines
    if (fields.length < 2) continue;

    // Grab settlement-level data from the first data row that has it
    if (!settlementId && settlementIdIdx >= 0 && fields[settlementIdIdx]) {
      settlementId = fields[settlementIdIdx];
    }
    if (!startDate && startDateIdx >= 0 && fields[startDateIdx]) {
      startDate = fields[startDateIdx];
    }
    if (!endDate && endDateIdx >= 0 && fields[endDateIdx]) {
      endDate = fields[endDateIdx];
    }
    if (!depositDate && depositDateIdx >= 0 && fields[depositDateIdx]) {
      depositDate = fields[depositDateIdx];
    }
    if (!totalAmount && totalAmountIdx >= 0 && fields[totalAmountIdx]) {
      totalAmount = parseFloat(fields[totalAmountIdx]) || 0;
    }
    if (!currency && currencyIdx >= 0 && fields[currencyIdx]) {
      currency = fields[currencyIdx];
    }

    // Build shared fields for this row
    const baseFields = {
      orderId: orderIdIdx >= 0 ? fields[orderIdIdx] || "" : "",
      merchantOrderId:
        merchantOrderIdIdx >= 0 ? fields[merchantOrderIdIdx] || "" : "",
      adjustmentId:
        adjustmentIdIdx >= 0 ? fields[adjustmentIdIdx] || "" : "",
      shipmentId: shipmentIdIdx >= 0 ? fields[shipmentIdIdx] || "" : "",
      marketplaceName:
        marketplaceIdx >= 0 ? fields[marketplaceIdx] || "" : "",
      fulfillmentId:
        fulfillmentIdx >= 0 ? fields[fulfillmentIdx] || "" : "",
      postedDate: postedDateIdx >= 0 ? fields[postedDateIdx] || "" : "",
      postedDateTime:
        postedDateTimeIdx >= 0 ? fields[postedDateTimeIdx] || "" : "",
      orderItemCode:
        orderItemCodeIdx >= 0 ? fields[orderItemCodeIdx] || "" : "",
      merchantOrderItemId:
        merchantOrderItemIdx >= 0
          ? fields[merchantOrderItemIdx] || ""
          : "",
      merchantAdjustmentItemId:
        merchantAdjItemIdx >= 0 ? fields[merchantAdjItemIdx] || "" : "",
      sku: skuIdx >= 0 ? fields[skuIdx] || "" : "",
      quantityPurchased:
        qtyIdx >= 0 ? parseInt(fields[qtyIdx], 10) || 0 : 0,
      promotionId: promoIdx >= 0 ? fields[promoIdx] || "" : "",
    };

    // Collect amount entries from this row
    const amountEntries: { amountType: string; amountDescription: string; amount: number }[] = [];

    if (isV2) {
      // V2 format: each row has separate columns per fee category
      const txType = transactionTypeIdx >= 0 ? fields[transactionTypeIdx] || "" : "";
      const pAmt = priceAmountIdx >= 0 ? parseFloat(fields[priceAmountIdx]) || 0 : 0;
      const pType = priceTypeIdx >= 0 ? fields[priceTypeIdx] || "" : "";
      if (pAmt || pType) amountEntries.push({ amountType: "ItemPrice", amountDescription: pType, amount: pAmt });

      const ifAmt = itemFeeAmountIdx >= 0 ? parseFloat(fields[itemFeeAmountIdx]) || 0 : 0;
      const ifType = itemFeeTypeIdx >= 0 ? fields[itemFeeTypeIdx] || "" : "";
      if (ifAmt || ifType) amountEntries.push({ amountType: "ItemFees", amountDescription: ifType, amount: ifAmt });

      const sfAmt = shipFeeAmountIdx >= 0 ? parseFloat(fields[shipFeeAmountIdx]) || 0 : 0;
      const sfType = shipFeeTypeIdx >= 0 ? fields[shipFeeTypeIdx] || "" : "";
      if (sfAmt || sfType) amountEntries.push({ amountType: "ShipmentFees", amountDescription: sfType, amount: sfAmt });

      const ofAmt = orderFeeAmountIdx >= 0 ? parseFloat(fields[orderFeeAmountIdx]) || 0 : 0;
      const ofType = orderFeeTypeIdx >= 0 ? fields[orderFeeTypeIdx] || "" : "";
      if (ofAmt || ofType) amountEntries.push({ amountType: "OrderFees", amountDescription: ofType, amount: ofAmt });

      const mfAmt = miscFeeAmountIdx >= 0 ? parseFloat(fields[miscFeeAmountIdx]) || 0 : 0;
      if (mfAmt) amountEntries.push({ amountType: "OtherFees", amountDescription: "Misc Fee", amount: mfAmt });

      const ofrAmt = otherFeeAmountIdx >= 0 ? parseFloat(fields[otherFeeAmountIdx]) || 0 : 0;
      const ofrDesc = otherFeeReasonIdx >= 0 ? fields[otherFeeReasonIdx] || "" : "";
      if (ofrAmt || ofrDesc) amountEntries.push({ amountType: "OtherFees", amountDescription: ofrDesc || "Other Fee", amount: ofrAmt });

      const pmAmt = promoAmountIdx >= 0 ? parseFloat(fields[promoAmountIdx]) || 0 : 0;
      const pmType = promoTypeIdx >= 0 ? fields[promoTypeIdx] || "" : "";
      if (pmAmt || pmType) amountEntries.push({ amountType: "Promotion", amountDescription: pmType, amount: pmAmt });

      const dpAmt = directPayAmountIdx >= 0 ? parseFloat(fields[directPayAmountIdx]) || 0 : 0;
      const dpType = directPayTypeIdx >= 0 ? fields[directPayTypeIdx] || "" : "";
      if (dpAmt || dpType) amountEntries.push({ amountType: "DirectPayment", amountDescription: dpType, amount: dpAmt });

      const otherAmt = otherAmountIdx >= 0 ? parseFloat(fields[otherAmountIdx]) || 0 : 0;
      if (otherAmt) amountEntries.push({ amountType: "Other", amountDescription: txType || "Other", amount: otherAmt });
    } else {
      // V1 format: single amount-type / amount-description / amount columns
      const amountType = amountTypeIdx >= 0 ? fields[amountTypeIdx] || "" : "";
      const amountDesc = amountDescIdx >= 0 ? fields[amountDescIdx] || "" : "";
      const amount = amountIdx >= 0 ? parseFloat(fields[amountIdx]) || 0 : 0;
      if (amountType || amount) {
        amountEntries.push({ amountType, amountDescription: amountDesc, amount });
      }
    }

    // Skip rows with no amount data
    if (amountEntries.length === 0) continue;

    for (const entry of amountEntries) {
      const transaction: SettlementTransaction = {
        ...baseFields,
        amountType: entry.amountType,
        amountDescription: entry.amountDescription,
        amount: entry.amount,
      };

      transactions.push(transaction);

      // Aggregate fees by type + description
      const feeKey = `${entry.amountType}||${entry.amountDescription}`;
      const existing = feeMap.get(feeKey);
      if (existing) {
        existing.totalAmount += entry.amount;
        existing.transactionCount += 1;
      } else {
        feeMap.set(feeKey, { totalAmount: entry.amount, transactionCount: 1 });
      }
    }
  }

  // Build fee summary
  const fees: SettlementFeeSummary[] = Array.from(feeMap.entries()).map(
    ([key, value]) => {
      const [amountType, amountDescription] = key.split("||");
      return {
        amountType,
        amountDescription,
        totalAmount: Math.round(value.totalAmount * 100) / 100,
        transactionCount: value.transactionCount,
      };
    }
  );

  // Sort fees by absolute total descending
  fees.sort((a, b) => Math.abs(b.totalAmount) - Math.abs(a.totalAmount));

  return {
    settlementId,
    settlementStartDate: startDate,
    settlementEndDate: endDate,
    depositDate,
    totalAmount,
    currency,
    transactions,
    fees,
  };
}
