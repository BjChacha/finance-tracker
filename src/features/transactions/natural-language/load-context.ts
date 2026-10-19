import { asc } from "drizzle-orm";
import { db } from "@/db/client";
import { accounts, categories } from "@/db/schema";
import { createApplicationContext } from "./application-context";

/** Only reads candidate metadata; neither balances nor transactions are needed for inference. */
export async function loadNaturalLanguageContext() {
  const [accountRows, categoryRows] = await Promise.all([
    db
      .select({
        id: accounts.id,
        name: accounts.name,
        archived: accounts.archived,
        currency: accounts.currency,
      })
      .from(accounts)
      .orderBy(asc(accounts.sortOrder), asc(accounts.id)),
    db
      .select({
        id: categories.id,
        name: categories.name,
        type: categories.type,
        parentId: categories.parentId,
        archived: categories.archived,
      })
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.id)),
  ]);
  return createApplicationContext(accountRows, categoryRows);
}
