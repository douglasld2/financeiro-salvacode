import {
  type Transaction,
  type InsertTransaction,
  type User,
  type InsertUser,
  transactions,
  users,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, lte, inArray } from "drizzle-orm";

export interface IStorage {
  getTransactions(): Promise<Transaction[]>;
  getTransactionsByGroupId(groupId: string): Promise<Transaction[]>;
  getTransactionsByGroupIds(groupIds: string[]): Promise<Transaction[]>;
  getTransactionById(id: string): Promise<Transaction | undefined>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  createManyTransactions(txns: InsertTransaction[]): Promise<Transaction[]>;
  updateTransactionStatus(id: string, status: string): Promise<Transaction | undefined>;
  updateOverdueTransactions(): Promise<void>;
  getDistinctGroups(): Promise<{ groupId: string; description: string; client: string }[]>;

  getUserById(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  deleteUser(id: string): Promise<void>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;
  getUserByGroupId(groupId: string): Promise<User | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getTransactions(): Promise<Transaction[]> {
    return db.select().from(transactions);
  }

  async getTransactionsByGroupId(groupId: string): Promise<Transaction[]> {
    return db.select().from(transactions).where(eq(transactions.groupId, groupId));
  }

  async getTransactionsByGroupIds(groupIds: string[]): Promise<Transaction[]> {
    if (groupIds.length === 0) return [];
    return db.select().from(transactions).where(inArray(transactions.groupId, groupIds));
  }

  async getTransactionById(id: string): Promise<Transaction | undefined> {
    const [result] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, id));
    return result;
  }

  async createTransaction(transaction: InsertTransaction): Promise<Transaction> {
    const [result] = await db
      .insert(transactions)
      .values(transaction)
      .returning();
    return result;
  }

  async createManyTransactions(txns: InsertTransaction[]): Promise<Transaction[]> {
    if (txns.length === 0) return [];
    const results = await db.insert(transactions).values(txns).returning();
    return results;
  }

  async updateTransactionStatus(
    id: string,
    status: string
  ): Promise<Transaction | undefined> {
    const [result] = await db
      .update(transactions)
      .set({ status: status as "PENDING" | "OVERDUE" | "PAID" })
      .where(eq(transactions.id, id))
      .returning();
    return result;
  }

  async updateOverdueTransactions(): Promise<void> {
    const now = new Date();
    await db
      .update(transactions)
      .set({ status: "OVERDUE" })
      .where(
        and(
          eq(transactions.status, "PENDING"),
          lte(transactions.dueDate, now)
        )
      );
  }

  async getDistinctGroups(): Promise<{ groupId: string; description: string; client: string }[]> {
    const all = await db.select({
      groupId: transactions.groupId,
      description: transactions.description,
      client: transactions.client,
    }).from(transactions);

    const seen = new Map<string, { groupId: string; description: string; client: string }>();
    for (const row of all) {
      if (!seen.has(row.groupId)) {
        seen.set(row.groupId, row);
      }
    }
    return Array.from(seen.values());
  }

  async getUserById(id: string): Promise<User | undefined> {
    const [result] = await db.select().from(users).where(eq(users.id, id));
    return result;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [result] = await db.select().from(users).where(eq(users.username, username));
    return result;
  }

  async getUserByGroupId(groupId: string): Promise<User | undefined> {
    const allUsers = await db.select().from(users);
    return allUsers.find(
      (u) => u.role === "user" && u.groupIds && u.groupIds.includes(groupId)
    );
  }

  async getUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  async createUser(user: InsertUser): Promise<User> {
    const [result] = await db.insert(users).values(user).returning();
    return result;
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  async updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined> {
    const [result] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return result;
  }
}

export const storage = new DatabaseStorage();
