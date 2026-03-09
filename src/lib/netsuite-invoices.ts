/**
 * Create NetSuite Invoices from parsed Amazon shipment data.
 * Uses NetSuite REST API: POST /services/rest/record/v1/invoice
 */

import { db } from "@/lib/db";
import {
  netsuiteRequest,
  getNetSuiteCredentials,
  type NetSuiteCredentials,
} from "@/lib/netsuite";
import type { ParsedAmazonShipment } from "@/lib/amazon-shipments-parser";

interface SyncResult {
  total: number;
  created: number;
  skipped: number;
  failed: number;
  errors: Array<{ shipmentId: string; error: string }>;
}

/**
 * Sync a batch of Amazon shipments to NetSuite as Invoices.
 */
export async function syncShipmentsToNetSuite(
  organizationId: string,
  shipments: ParsedAmazonShipment[],
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
    total: shipments.length,
    created: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  for (const shipment of shipments) {
    try {
      const shipmentRef = shipment.shipmentId || shipment.amazonOrderId;

      // Build line items
      const items = shipment.items.map((item) => {
        const mapped = skuToItem.get(item.sku);
        const line: Record<string, any> = {
          amount: item.itemPrice,
          quantity: item.quantityShipped,
          description: item.productName,
          rate:
            item.quantityShipped > 0
              ? item.itemPrice / item.quantityShipped
              : item.itemPrice,
        };

        if (mapped) {
          line.item = { id: mapped.id };
        }

        return line;
      });

      // Use the shipment date (when goods were delivered) as the invoice date
      const invoiceDate = shipment.shipmentDate || shipment.purchaseDate;

      // Build the Invoice payload
      const payload: Record<string, any> = {
        externalId: `AMZ-SHIP-${shipmentRef}`,
        tranDate: invoiceDate
          ? new Date(invoiceDate).toISOString().split("T")[0]
          : undefined,
        memo: `Amazon Shipment ${shipmentRef} (Order ${shipment.amazonOrderId})`,
        otherRefNum: shipment.amazonOrderId,
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
      if (shipment.shipCity || shipment.shipState || shipment.shipCountry) {
        payload.shipAddress = {
          city: shipment.shipCity || undefined,
          state: shipment.shipState || undefined,
          zip: shipment.shipPostalCode || undefined,
          country: shipment.shipCountry || undefined,
        };
      }

      await createInvoice(creds, payload);
      result.created++;

      if (syncJobId) {
        await db.syncLog.create({
          data: {
            syncJobId,
            transactionType: "Invoice",
            externalId: shipmentRef,
            status: "success",
          },
        });
      }
    } catch (err: any) {
      const ref = shipment.shipmentId || shipment.amazonOrderId;
      result.failed++;
      result.errors.push({
        shipmentId: ref,
        error: err.message || "Unknown error",
      });

      if (syncJobId) {
        await db.syncLog.create({
          data: {
            syncJobId,
            transactionType: "Invoice",
            externalId: ref,
            status: "failed",
            errorMessage: err.message,
          },
        });
      }
    }
  }

  return result;
}

async function createInvoice(
  creds: NetSuiteCredentials,
  payload: Record<string, any>
): Promise<any> {
  return netsuiteRequest(
    creds,
    "POST",
    "/services/rest/record/v1/invoice",
    payload
  );
}
