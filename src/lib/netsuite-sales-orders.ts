/**
 * Create NetSuite Sales Orders from parsed Amazon order data.
 * Uses NetSuite REST API: POST /services/rest/record/v1/salesOrder
 */

import { db } from "@/lib/db";
import {
  netsuiteRequest,
  getNetSuiteCredentials,
  type NetSuiteCredentials,
} from "@/lib/netsuite";
import type { ParsedAmazonOrder } from "@/lib/amazon-orders-parser";

interface SyncResult {
  total: number;
  created: number;
  skipped: number;
  failed: number;
  errors: Array<{ orderId: string; error: string }>;
}

/**
 * Sync a batch of Amazon orders to NetSuite as Sales Orders.
 */
export async function syncOrdersToNetSuite(
  organizationId: string,
  orders: ParsedAmazonOrder[],
  syncJobId?: string
): Promise<SyncResult> {
  const creds = await getNetSuiteCredentials(organizationId);
  if (!creds) {
    throw new Error("No active NetSuite connection found");
  }

  // Load sync config for defaults
  const config = await db.syncConfig.findUnique({
    where: { organizationId },
  });

  // Load item mappings (SKU → NetSuite item)
  const itemMappings = await db.itemMapping.findMany({
    where: { organizationId },
  });
  const skuToItem = new Map(
    itemMappings.map((m: any) => [
      m.amazonSku,
      { id: m.netSuiteItemId, name: m.netSuiteItemName },
    ])
  );

  const result: SyncResult = {
    total: orders.length,
    created: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  for (const order of orders) {
    try {
      // Skip cancelled orders
      if (order.orderStatus === "Cancelled") {
        result.skipped++;
        if (syncJobId) {
          await db.syncLog.create({
            data: {
              syncJobId,
              transactionType: "SalesOrder",
              externalId: order.amazonOrderId,
              status: "skipped",
              errorMessage: "Order cancelled",
            },
          });
        }
        continue;
      }

      // Build line items
      const items = order.items.map((item) => {
        const mapped = skuToItem.get(item.sku);
        const line: Record<string, any> = {
          amount: item.itemPrice,
          quantity: item.quantity,
          description: item.productName,
          rate: item.quantity > 0 ? item.itemPrice / item.quantity : item.itemPrice,
        };

        if (mapped) {
          line.item = { id: mapped.id };
        }

        return line;
      });

      // Build the Sales Order payload
      const payload: Record<string, any> = {
        externalId: order.amazonOrderId,
        tranDate: order.purchaseDate
          ? new Date(order.purchaseDate).toISOString().split("T")[0]
          : undefined,
        memo: `Amazon Order ${order.amazonOrderId}`,
        otherRefNum: order.amazonOrderId,
        item: { items },
      };

      // Apply defaults from sync config
      if (config?.defaultCustomerId) {
        payload.entity = { id: config.defaultCustomerId };
      }
      if (config?.defaultSubsidiaryId) {
        payload.subsidiary = { id: config.defaultSubsidiaryId };
      }

      // Shipping address
      if (order.shipCity || order.shipState || order.shipCountry) {
        payload.shipAddress = {
          city: order.shipCity || undefined,
          state: order.shipState || undefined,
          zip: order.shipPostalCode || undefined,
          country: order.shipCountry || undefined,
        };
      }

      await createSalesOrder(creds, payload);
      result.created++;

      if (syncJobId) {
        await db.syncLog.create({
          data: {
            syncJobId,
            transactionType: "SalesOrder",
            externalId: order.amazonOrderId,
            status: "success",
          },
        });
      }
    } catch (err: any) {
      result.failed++;
      result.errors.push({
        orderId: order.amazonOrderId,
        error: err.message || "Unknown error",
      });

      if (syncJobId) {
        await db.syncLog.create({
          data: {
            syncJobId,
            transactionType: "SalesOrder",
            externalId: order.amazonOrderId,
            status: "failed",
            errorMessage: err.message,
          },
        });
      }
    }
  }

  return result;
}

async function createSalesOrder(
  creds: NetSuiteCredentials,
  payload: Record<string, any>
): Promise<any> {
  return netsuiteRequest(
    creds,
    "POST",
    "/services/rest/record/v1/salesOrder",
    payload
  );
}
