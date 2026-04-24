import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, numeric, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const categoryEnum = pgEnum("category", [
  "SAAS_SUBSCRIPTION",
  "PROJECT_INSTALLMENT",
  "RETAINER_FEE",
]);

export const statusEnum = pgEnum("status", [
  "PENDING",
  "OVERDUE",
  "PAID",
]);

export const roleEnum = pgEnum("role", ["admin", "user"]);

export const transactions = pgTable("transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  description: text("description").notNull(),
  client: text("client").notNull(),
  clientEmail: text("client_email"),
  clientWhatsapp: text("client_whatsapp"),
  category: categoryEnum("category").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  dueDate: timestamp("due_date").notNull(),
  status: statusEnum("status").notNull().default("PENDING"),
  installmentCurrent: integer("installment_current").notNull().default(1),
  installmentTotal: integer("installment_total").notNull().default(1),
  groupId: varchar("group_id").notNull(),
});

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name"),
  email: text("email"),
  phone: text("phone"),
  role: roleEnum("role").notNull().default("user"),
  groupIds: text("group_ids").array(),
});

export const insertTransactionSchema = createInsertSchema(transactions).omit({
  id: true,
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true });

export const createProjectSchema = z.object({
  description: z.string().min(1, "Descrição é obrigatória"),
  client: z.string().min(1, "Cliente é obrigatório"),
  clientEmail: z.string().email("Email inválido").optional().or(z.literal("")),
  clientWhatsapp: z.string().optional().or(z.literal("")),
  category: z.enum(["SAAS_SUBSCRIPTION", "PROJECT_INSTALLMENT", "RETAINER_FEE"]),
  totalAmount: z.number().positive("Valor deve ser positivo"),
  startDate: z.string().min(1, "Data de início é obrigatória"),
  installments: z.number().int().min(1).max(60),
  repeatMonths: z.number().int().min(1).max(60).optional(),
  indefinite: z.boolean().optional(),
});

export const createUserSchema = z.object({
  username: z.string().min(3, "Usuário deve ter ao menos 3 caracteres"),
  password: z.string().min(4, "Senha deve ter ao menos 4 caracteres"),
  name: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  phone: z.string().optional(),
  groupIds: z.array(z.string()).optional(),
});

export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactions.$inferSelect;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
