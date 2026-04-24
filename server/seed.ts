import { storage } from "./storage";
import { db } from "./db";
import { transactions, users } from "@shared/schema";
import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import bcrypt from "bcryptjs";

export async function seedDatabase() {
  const existing = await db.select({ count: sql<number>`count(*)` }).from(transactions);
  const txnCount = Number(existing[0].count);

  const existingUsers = await db.select({ count: sql<number>`count(*)` }).from(users);
  const userCount = Number(existingUsers[0].count);

  if (userCount === 0) {
    console.log("Seeding admin user...");
    const adminPassword = await bcrypt.hash("admin123", 10);
    await storage.createUser({
      username: "admin",
      password: adminPassword,
      name: "Administrador",
      email: null,
      phone: null,
      role: "admin",
      groupIds: null,
    });
    console.log("Admin user created: admin / admin123");
  }

  if (txnCount > 0) {
    console.log("Database already has data, skipping seed.");
    return;
  }

  console.log("Seeding database with sample data...");

  const now = new Date();

  const group1 = randomUUID();
  const group1Txns = [];
  for (let i = 0; i < 4; i++) {
    const dueDate = new Date(now);
    dueDate.setMonth(dueDate.getMonth() - 2 + i);
    group1Txns.push({
      description: "Site Institucional",
      client: "Empresa ABC Ltda",
      clientEmail: "contato@abc.com.br",
      clientWhatsapp: "11988887777",
      category: "PROJECT_INSTALLMENT" as const,
      amount: "3750.00",
      dueDate,
      status: (i < 2 ? "PAID" : i === 2 ? "OVERDUE" : "PENDING") as "PAID" | "OVERDUE" | "PENDING",
      installmentCurrent: i + 1,
      installmentTotal: 4,
      groupId: group1,
    });
  }

  const group2 = randomUUID();
  const group2Txns = [];
  for (let i = 0; i < 6; i++) {
    const dueDate = new Date(now);
    dueDate.setMonth(dueDate.getMonth() - 1 + i);
    group2Txns.push({
      description: "App Mobile E-commerce",
      client: "Loja Digital S.A.",
      category: "PROJECT_INSTALLMENT" as const,
      amount: "8333.33",
      dueDate,
      status: (i === 0 ? "PAID" : i === 1 ? "OVERDUE" : "PENDING") as "PAID" | "OVERDUE" | "PENDING",
      installmentCurrent: i + 1,
      installmentTotal: 6,
      groupId: group2,
    });
  }

  const group3 = randomUUID();
  const group3Txns = [];
  for (let i = 0; i < 12; i++) {
    const dueDate = new Date(now);
    dueDate.setMonth(dueDate.getMonth() - 3 + i);
    group3Txns.push({
      description: "Plano Business",
      client: "Empresa ABC Ltda",
      category: "SAAS_SUBSCRIPTION" as const,
      amount: "299.90",
      dueDate,
      status: (i < 3 ? "PAID" : i === 3 ? "OVERDUE" : "PENDING") as "PAID" | "OVERDUE" | "PENDING",
      installmentCurrent: i + 1,
      installmentTotal: 12,
      groupId: group3,
    });
  }

  const group4 = randomUUID();
  const group4Txns = [];
  for (let i = 0; i < 6; i++) {
    const dueDate = new Date(now);
    dueDate.setMonth(dueDate.getMonth() - 1 + i);
    group4Txns.push({
      description: "Consultoria Mensal",
      client: "StartUp Tech",
      category: "RETAINER_FEE" as const,
      amount: "4500.00",
      dueDate,
      status: (i === 0 ? "PAID" : i === 1 ? "OVERDUE" : "PENDING") as "PAID" | "OVERDUE" | "PENDING",
      installmentCurrent: i + 1,
      installmentTotal: 6,
      groupId: group4,
    });
  }

  const group5 = randomUUID();
  const group5Txns = [];
  for (let i = 0; i < 12; i++) {
    const dueDate = new Date(now);
    dueDate.setMonth(dueDate.getMonth() - 2 + i);
    group5Txns.push({
      description: "Plano Premium Analytics",
      client: "DataCorp Solutions",
      category: "SAAS_SUBSCRIPTION" as const,
      amount: "799.00",
      dueDate,
      status: (i < 2 ? "PAID" : i === 2 ? "OVERDUE" : "PENDING") as "PAID" | "OVERDUE" | "PENDING",
      installmentCurrent: i + 1,
      installmentTotal: 12,
      groupId: group5,
    });
  }

  const group6 = randomUUID();
  const group6Txns = [];
  for (let i = 0; i < 3; i++) {
    const dueDate = new Date(now);
    dueDate.setMonth(dueDate.getMonth() + i);
    group6Txns.push({
      description: "Landing Page + SEO",
      client: "StartUp Tech",
      category: "PROJECT_INSTALLMENT" as const,
      amount: "2666.67",
      dueDate,
      status: "PENDING" as const,
      installmentCurrent: i + 1,
      installmentTotal: 3,
      groupId: group6,
    });
  }

  const allTxns = [
    ...group1Txns,
    ...group2Txns,
    ...group3Txns,
    ...group4Txns,
    ...group5Txns,
    ...group6Txns,
  ];

  await storage.createManyTransactions(allTxns);
  console.log(`Seeded ${allTxns.length} transactions successfully.`);
}
