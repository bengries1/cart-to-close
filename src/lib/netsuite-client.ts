import {
  netsuiteRequest,
  getNetSuiteCredentials,
  type NetSuiteCredentials,
} from "@/lib/netsuite";

// ──────────────────────────────────────────
// Types — Record API responses
// ──────────────────────────────────────────

/** Generic paginated collection response from the NetSuite REST Record API. */
interface RecordCollection<T> {
  count: number;
  hasMore: boolean;
  offset: number;
  totalResults: number;
  items: T[];
  links?: Array<{ rel: string; href: string }>;
}

// ── GL Accounts ──

export interface NetSuiteAccount {
  id: string;
  acctNumber: string;
  acctName: string;
  acctType: string;
  isInactive: boolean;
  currency?: { id: string; refName: string };
  subsidiary?: { id: string; refName: string };
  description?: string;
  generalRate?: string;
}

// ── Items ──

export interface NetSuiteItem {
  id: string;
  itemId: string; // item name/number
  displayName?: string;
  itemType: string;
  isInactive: boolean;
  incomeAccount?: { id: string; refName: string };
  cogsAccount?: { id: string; refName: string };
  assetAccount?: { id: string; refName: string };
  salesDescription?: string;
  purchaseDescription?: string;
  basePrice?: number;
  cost?: number;
}

// ── Customers ──

export interface NetSuiteCustomer {
  id: string;
  companyName?: string;
  entityId: string; // customer name/number
  isInactive: boolean;
  subsidiary?: { id: string; refName: string };
  email?: string;
}

// ── Subsidiaries ──

export interface NetSuiteSubsidiary {
  id: string;
  name: string;
  isInactive: boolean;
  isElimination?: boolean;
}

// ── Payment Methods ──

export interface NetSuitePaymentMethod {
  id: string;
  name: string;
  isInactive: boolean;
  isDebitCard?: boolean;
  isCreditCard?: boolean;
}

// ── Tax Codes ──

export interface NetSuiteTaxCode {
  id: string;
  name: string;
  isInactive: boolean;
  rate?: string;
  country?: string;
}

// ── Sales Order ──

export interface SalesOrderLine {
  item: { id: string };
  quantity: number;
  rate?: number;
  amount?: number;
  description?: string;
  taxCode?: { id: string };
}

export interface CreateSalesOrderInput {
  entity: { id: string }; // customer internal ID
  tranDate?: string; // YYYY-MM-DD
  otherRefNum?: string; // external reference (e.g. Amazon order ID)
  memo?: string;
  subsidiary?: { id: string };
  location?: { id: string };
  department?: { id: string };
  currency?: { id: string };
  item: { items: SalesOrderLine[] };
  customForm?: { id: string };
  shipMethod?: { id: string };
  shippingCost?: number;
  discountTotal?: number;
}

// ── Item Fulfillment ──

export interface FulfillmentLine {
  orderLine: number; // line number from the sales order
  itemReceive: boolean;
  quantity?: number;
}

export interface CreateItemFulfillmentInput {
  createdFrom: { id: string }; // sales order internal ID
  tranDate?: string;
  memo?: string;
  shipMethod?: { id: string };
  item: { items: FulfillmentLine[] };
  shipStatus?: "A" | "B" | "C"; // A=Picked, B=Packed, C=Shipped
  trackingNumbers?: string;
}

// ── Invoice ──

export interface InvoiceLine {
  item: { id: string };
  quantity: number;
  rate?: number;
  amount?: number;
  description?: string;
  taxCode?: { id: string };
}

export interface CreateInvoiceInput {
  entity: { id: string }; // customer internal ID
  createdFrom?: { id: string }; // sales order internal ID (auto-fills lines)
  tranDate?: string;
  otherRefNum?: string;
  memo?: string;
  subsidiary?: { id: string };
  location?: { id: string };
  department?: { id: string };
  currency?: { id: string };
  item?: { items: InvoiceLine[] }; // omit if using createdFrom
  discountTotal?: number;
}

// ── Customer Payment ──

export interface CustomerPaymentApply {
  apply: boolean;
  doc: number; // internal ID of the invoice being paid
  amount: number;
}

export interface CreateCustomerPaymentInput {
  customer: { id: string };
  payment: number; // total payment amount
  tranDate?: string;
  memo?: string;
  subsidiary?: { id: string };
  currency?: { id: string };
  account?: { id: string }; // payment account (e.g. Undeposited Funds)
  paymentMethod?: { id: string };
  checkNum?: string; // reference / check number
  apply: { items: CustomerPaymentApply[] };
}

// ── Credit Memo ──

export interface CreditMemoLine {
  item: { id: string };
  quantity: number;
  rate?: number;
  amount?: number;
  description?: string;
  taxCode?: { id: string };
}

export interface CreateCreditMemoInput {
  entity: { id: string }; // customer internal ID
  createdFrom?: { id: string }; // invoice internal ID (auto-fills lines)
  tranDate?: string;
  otherRefNum?: string;
  memo?: string;
  subsidiary?: { id: string };
  location?: { id: string };
  department?: { id: string };
  currency?: { id: string };
  item?: { items: CreditMemoLine[] }; // omit if using createdFrom
}

// ── Generic record response ──

export interface CreatedRecord {
  id: string;
  links?: Array<{ rel: string; href: string }>;
}

// ──────────────────────────────────────────
// NetSuiteClient class
// ──────────────────────────────────────────

const REST_BASE = "/services/rest/record/v1";

export class NetSuiteClient {
  private creds: NetSuiteCredentials;

  constructor(creds: NetSuiteCredentials) {
    this.creds = creds;
  }

  /**
   * Build a client from stored (encrypted) credentials for an organization.
   * Throws if no active connection is found.
   */
  static async forOrganization(organizationId: string): Promise<NetSuiteClient> {
    const creds = await getNetSuiteCredentials(organizationId);
    if (!creds) {
      throw new Error("No active NetSuite connection found for this organization");
    }
    return new NetSuiteClient(creds);
  }

  // ──────────────────────────────────────
  // Low-level helpers
  // ──────────────────────────────────────

  private get<T>(path: string): Promise<T> {
    return netsuiteRequest<T>(this.creds, "GET", path);
  }

  private post<T>(path: string, body: unknown): Promise<T> {
    return netsuiteRequest<T>(this.creds, "POST", path, body);
  }

  /**
   * Fetch all pages of a paginated collection endpoint.
   * NetSuite REST API returns max 1000 items per page.
   */
  private async getAllPages<T>(
    basePath: string,
    queryParams?: Record<string, string>
  ): Promise<T[]> {
    const allItems: T[] = [];
    const limit = 1000;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
        ...queryParams,
      });
      const url = `${basePath}?${params.toString()}`;
      const page = await this.get<RecordCollection<T>>(url);

      allItems.push(...page.items);
      hasMore = page.hasMore;
      offset += limit;
    }

    return allItems;
  }

  // ──────────────────────────────────────
  // GL Accounts
  // ──────────────────────────────────────

  /**
   * Fetch all GL accounts (active only by default).
   * Returns the full list across all pages.
   */
  async getAccounts(options?: {
    includeInactive?: boolean;
  }): Promise<NetSuiteAccount[]> {
    const queryParams: Record<string, string> = {};
    if (!options?.includeInactive) {
      queryParams.q = 'isInactive IS false';
    }
    return this.getAllPages<NetSuiteAccount>(
      `${REST_BASE}/account`,
      queryParams
    );
  }

  // ──────────────────────────────────────
  // Items (Inventory / Non-Inventory / Service)
  // ──────────────────────────────────────

  /**
   * Fetch all inventory items (active only by default).
   */
  async getInventoryItems(options?: {
    includeInactive?: boolean;
  }): Promise<NetSuiteItem[]> {
    const queryParams: Record<string, string> = {};
    if (!options?.includeInactive) {
      queryParams.q = 'isInactive IS false';
    }
    return this.getAllPages<NetSuiteItem>(
      `${REST_BASE}/inventoryItem`,
      queryParams
    );
  }

  /**
   * Fetch all non-inventory items (active only by default).
   */
  async getNonInventoryItems(options?: {
    includeInactive?: boolean;
  }): Promise<NetSuiteItem[]> {
    const queryParams: Record<string, string> = {};
    if (!options?.includeInactive) {
      queryParams.q = 'isInactive IS false';
    }
    return this.getAllPages<NetSuiteItem>(
      `${REST_BASE}/nonInventoryResaleItem`,
      queryParams
    );
  }

  /**
   * Fetch all service items (active only by default).
   */
  async getServiceItems(options?: {
    includeInactive?: boolean;
  }): Promise<NetSuiteItem[]> {
    const queryParams: Record<string, string> = {};
    if (!options?.includeInactive) {
      queryParams.q = 'isInactive IS false';
    }
    return this.getAllPages<NetSuiteItem>(
      `${REST_BASE}/serviceResaleItem`,
      queryParams
    );
  }

  /**
   * Fetch all items (inventory + non-inventory + service), combined.
   * Active only by default.
   */
  async getItems(options?: {
    includeInactive?: boolean;
  }): Promise<NetSuiteItem[]> {
    const [inventory, nonInventory, service] = await Promise.all([
      this.getInventoryItems(options),
      this.getNonInventoryItems(options),
      this.getServiceItems(options),
    ]);
    return [...inventory, ...nonInventory, ...service];
  }

  // ──────────────────────────────────────
  // Customers
  // ──────────────────────────────────────

  async getCustomers(options?: {
    includeInactive?: boolean;
  }): Promise<NetSuiteCustomer[]> {
    const queryParams: Record<string, string> = {};
    if (!options?.includeInactive) {
      queryParams.q = 'isInactive IS false';
    }
    return this.getAllPages<NetSuiteCustomer>(
      `${REST_BASE}/customer`,
      queryParams
    );
  }

  // ──────────────────────────────────────
  // Subsidiaries
  // ──────────────────────────────────────

  async getSubsidiaries(options?: {
    includeInactive?: boolean;
  }): Promise<NetSuiteSubsidiary[]> {
    const queryParams: Record<string, string> = {};
    if (!options?.includeInactive) {
      queryParams.q = 'isInactive IS false';
    }
    return this.getAllPages<NetSuiteSubsidiary>(
      `${REST_BASE}/subsidiary`,
      queryParams
    );
  }

  // ──────────────────────────────────────
  // Payment Methods
  // ──────────────────────────────────────

  async getPaymentMethods(): Promise<NetSuitePaymentMethod[]> {
    return this.getAllPages<NetSuitePaymentMethod>(
      `${REST_BASE}/paymentMethod`,
      { q: 'isInactive IS false' }
    );
  }

  // ──────────────────────────────────────
  // Tax Codes
  // ──────────────────────────────────────

  async getTaxCodes(): Promise<NetSuiteTaxCode[]> {
    return this.getAllPages<NetSuiteTaxCode>(
      `${REST_BASE}/taxType`
    );
  }

  // ──────────────────────────────────────
  // Sales Orders
  // ──────────────────────────────────────

  /**
   * Create a sales order in NetSuite.
   * Returns the created record with its internal ID.
   */
  async createSalesOrder(input: CreateSalesOrderInput): Promise<CreatedRecord> {
    return this.post<CreatedRecord>(`${REST_BASE}/salesOrder`, input);
  }

  /**
   * Fetch a sales order by internal ID.
   */
  async getSalesOrder(id: string): Promise<any> {
    return this.get(`${REST_BASE}/salesOrder/${id}`);
  }

  // ──────────────────────────────────────
  // Item Fulfillments
  // ──────────────────────────────────────

  /**
   * Create an item fulfillment against a sales order.
   *
   * NetSuite REST API: POST /itemFulfillment with `createdFrom` referencing
   * the sales order. Only lines with `itemReceive: true` will be fulfilled.
   */
  async createItemFulfillment(
    input: CreateItemFulfillmentInput
  ): Promise<CreatedRecord> {
    return this.post<CreatedRecord>(`${REST_BASE}/itemFulfillment`, input);
  }

  // ──────────────────────────────────────
  // Invoices
  // ──────────────────────────────────────

  /**
   * Create an invoice in NetSuite.
   *
   * If `createdFrom` is set (pointing to a sales order), NetSuite auto-fills
   * line items from the order — no need to pass `item` in that case.
   */
  async createInvoice(input: CreateInvoiceInput): Promise<CreatedRecord> {
    return this.post<CreatedRecord>(`${REST_BASE}/invoice`, input);
  }

  /**
   * Fetch an invoice by internal ID.
   */
  async getInvoice(id: string): Promise<any> {
    return this.get(`${REST_BASE}/invoice/${id}`);
  }

  // ──────────────────────────────────────
  // Customer Payments
  // ──────────────────────────────────────

  /**
   * Create a customer payment, applying it to one or more invoices.
   *
   * The `apply.items` array specifies which invoices to pay and the amounts.
   */
  async createCustomerPayment(
    input: CreateCustomerPaymentInput
  ): Promise<CreatedRecord> {
    return this.post<CreatedRecord>(`${REST_BASE}/customerPayment`, input);
  }

  // ──────────────────────────────────────
  // Credit Memos
  // ──────────────────────────────────────

  /**
   * Create a credit memo in NetSuite.
   *
   * If `createdFrom` is set (pointing to an invoice), NetSuite auto-fills
   * line items — useful for full refunds. For partial refunds, pass specific
   * items and quantities in `item.items`.
   */
  async createCreditMemo(
    input: CreateCreditMemoInput
  ): Promise<CreatedRecord> {
    return this.post<CreatedRecord>(`${REST_BASE}/creditMemo`, input);
  }

  /**
   * Fetch a credit memo by internal ID.
   */
  async getCreditMemo(id: string): Promise<any> {
    return this.get(`${REST_BASE}/creditMemo/${id}`);
  }
}
