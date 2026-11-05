import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const scores = pgTable("scores", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  wave: integer("wave").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
