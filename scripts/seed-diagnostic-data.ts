import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { config } from "../src/config";

const client = new DynamoDBClient({ region: config.AWS_REGION });
const doc = DynamoDBDocumentClient.from(client);

const tables = {
  inventory: config.DDB_TABLE_INVENTORY,
  pricing: config.DDB_TABLE_PRICING,
  pim: config.DDB_TABLE_PIM,
  web: config.DDB_TABLE_WEB,
};

async function seed() {
  console.log("Starting seed of 15 diagnostic products...");

  const products = [];

  // 1-5: Healthy Products
  for (let i = 1; i <= 5; i++) {
    const id = `PROD_OK_${i}`;
    const sku = `SKU_OK_${i}_B`;
    products.push({
      id,
      sku,
      web: { productId: id, webPrice: 99.99, webInventory: 50, status: "SELLABLE", associatedSkus: [sku] },
      inv: { skuId: sku, parentProductId: id, upstreamInventory: 50, status: "AVAILABLE" },
      price: { productId: id, authoritativePrice: 99.99, currency: "USD" },
      pim: { productId: id, productName: `Healthy Product ${i}`, isPublished: true, imageStatus: "COMPLETE", associatedSkus: [sku] }
    });
  }

  // 6-8: Price Disparity
  for (let i = 1; i <= 3; i++) {
    const id = `PROD_PRICE_ERR_${i}`;
    const sku = `SKU_PRICE_ERR_${i}_R`;
    products.push({
      id,
      sku,
      web: { productId: id, webPrice: 19.99, webInventory: 100, status: "SELLABLE", associatedSkus: [sku] },
      inv: { skuId: sku, parentProductId: id, upstreamInventory: 100, status: "AVAILABLE" },
      price: { productId: id, authoritativePrice: 49.99, currency: "USD", note: "Authoritative price was updated recently" },
      pim: { productId: id, productName: `Price Mismatch Item ${i}`, isPublished: true, imageStatus: "COMPLETE", associatedSkus: [sku] }
    });
  }

  // 9-11: Inventory Gap
  for (let i = 1; i <= 3; i++) {
    const id = `PROD_INV_ERR_${i}`;
    const sku = `SKU_INV_ERR_${i}_G`;
    products.push({
      id,
      sku,
      web: { productId: id, webPrice: 29.99, webInventory: 0, status: "NOT_SELLABLE", reason: ["inventory"], associatedSkus: [sku] },
      inv: { skuId: sku, parentProductId: id, upstreamInventory: 250, status: "AVAILABLE", lastSync: "2024-01-01T00:00:00Z" },
      price: { productId: id, authoritativePrice: 29.99, currency: "USD" },
      pim: { productId: id, productName: `Inventory Gap Item ${i}`, isPublished: true, imageStatus: "COMPLETE", associatedSkus: [sku] }
    });
  }

  // 12: PIM Publication Issue
  const p12 = "PROD_PIM_UNPUB";
  const s12 = "SKU_PIM_UNPUB_X";
  products.push({
    id: p12,
    sku: s12,
    web: { productId: p12, webPrice: 10.00, webInventory: 10, status: "SELLABLE", associatedSkus: [s12] },
    inv: { skuId: s12, parentProductId: p12, upstreamInventory: 10, status: "AVAILABLE" },
    price: { productId: p12, authoritativePrice: 10.00, currency: "USD" },
    pim: { productId: p12, productName: "Ghost Product", isPublished: false, imageStatus: "COMPLETE", associatedSkus: [s12] }
  });

  // 13: Image Issue
  const p13 = "PROD_IMG_FAIL";
  const s13 = "SKU_IMG_FAIL_Y";
  products.push({
    id: p13,
    sku: s13,
    web: { productId: p13, webPrice: 5.00, webInventory: 5, status: "NOT_SELLABLE", reason: ["pim"], associatedSkus: [s13] },
    inv: { skuId: s13, parentProductId: p13, upstreamInventory: 5, status: "AVAILABLE" },
    price: { productId: p13, authoritativePrice: 5.00, currency: "USD" },
    pim: { productId: p13, productName: "Missing Image Tee", isPublished: true, imageStatus: "INCOMPLETE", associatedSkus: [s13] }
  });

  // 14: Missing from Web (Source exists)
  const p14 = "PROD_MISSING_WEB";
  const s14 = "SKU_MISSING_WEB_Z";
  products.push({
    id: p14,
    sku: s14,
    // web is null/missing
    inv: { skuId: s14, parentProductId: p14, upstreamInventory: 1000, status: "AVAILABLE" },
    price: { productId: p14, authoritativePrice: 199.99, currency: "USD" },
    pim: { productId: p14, productName: "The Invisible Item", isPublished: true, imageStatus: "COMPLETE", associatedSkus: [s14] }
  });

  // 15: Zombie (Web exists, source missing)
  const p15 = "PROD_ZOMBIE_WEB";
  const s15 = "SKU_ZOMBIE_WEB_A";
  products.push({
    id: p15,
    sku: s15,
    web: { productId: p15, webPrice: 0.01, webInventory: 999, status: "SELLABLE", associatedSkus: [s15] },
    // others are missing
  });

  for (const p of products) {
    if (p.web) await doc.send(new PutCommand({ TableName: tables.web, Item: p.web }));
    if (p.inv) await doc.send(new PutCommand({ TableName: tables.inventory, Item: p.inv }));
    if (p.price) await doc.send(new PutCommand({ TableName: tables.pricing, Item: p.price }));
    if (p.pim) await doc.send(new PutCommand({ TableName: tables.pim, Item: p.pim }));
    console.log(`Seeded ${p.id}`);
  }

  console.log("Seeding complete!");
}

seed().catch(console.error);
