import type { Express } from "express";
import { createServer, type Server } from "http";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { storage } from "./storage";
import { createProjectSchema, createUserSchema } from "@shared/schema";
import { randomUUID } from "crypto";
import { sendCollectionEmail } from "./email";
import { requireAuth, requireAdmin } from "./auth";
import { calculateAdjustedAmount, buildCollectionMessage } from "./billing";
import {
  findOrCreateCustomer,
  createPixCharge,
  getPixForCharge,
  isAsaasConfigured,
} from "./asaas";
import { sendWhatsAppText, isWhatsAppConfigured } from "./whatsapp";

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: false,
  message: { message: "Muitas tentativas de login. Aguarde 15 minutos e tente novamente." },
});

function parseDueDate(input: string | Date): Date {
  if (input instanceof Date) {
    const d = new Date(input);
    d.setHours(12, 0, 0, 0);
    return d;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(input);
  if (match) {
    const [, y, m, d] = match;
    return new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0, 0);
  }
  const fallback = new Date(input);
  fallback.setHours(12, 0, 0, 0);
  return fallback;
}

function addMonthsPreservingDay(base: Date, monthsToAdd: number): Date {
  const year = base.getFullYear();
  const month = base.getMonth();
  const day = base.getDate();
  const targetMonth = month + monthsToAdd;
  const lastDayOfTarget = new Date(year, targetMonth + 1, 0).getDate();
  const finalDay = Math.min(day, lastDayOfTarget);
  return new Date(year, targetMonth, finalDay, 12, 0, 0, 0);
}

function splitAmount(total: number, parts: number): string[] {
  const totalCents = Math.round(total * 100);
  const baseCents = Math.floor(totalCents / parts);
  const remainder = totalCents - baseCents * parts;
  const amounts: string[] = [];
  for (let i = 0; i < parts; i++) {
    const cents = baseCents + (i < remainder ? 1 : 0);
    amounts.push((cents / 100).toFixed(2));
  }
  return amounts;
}

function startOfTodayLocal(): Date {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}

function formatDateYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeDocument(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function parseMonthYear(value: unknown): { month: number; year: number } | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { month: value.getMonth() + 1, year: value.getFullYear() };
  }

  const text = String(value ?? "").trim();
  const match = /^(\d{1,2})\s*[\/-]\s*(\d{4})$/.exec(text);
  if (match) {
    const month = Number(match[1]);
    const year = Number(match[2]);
    if (month < 1 || month > 12 || year < 2000 || year > 2100) return null;
    return { month, year };
  }

  // Date cells are serialized as ISO strings when the browser posts the preview rows.
  const isoDate = new Date(text);
  if (!Number.isNaN(isoDate.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(text)) {
    return { month: isoDate.getUTCMonth() + 1, year: isoDate.getUTCFullYear() };
  }
  return null;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await storage.updateOverdueTransactions();

  app.post("/api/auth/login", loginLimiter, async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "Usuário e senha são obrigatórios" });
      }

      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ message: "Usuário ou senha incorretos" });
      }

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return res.status(401).json({ message: "Usuário ou senha incorretos" });
      }

      await new Promise<void>((resolve, reject) => {
        req.session.regenerate((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      req.session.userId = user.id;
      req.session.role = user.role;

      const { password: _pw, ...safeUser } = user;
      return res.json(safeUser);
    } catch (error) {
      console.error("Login error:", error);
      return res.status(500).json({ message: "Erro ao fazer login" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.json({ message: "Logout realizado" });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session?.userId) {
      return res.status(401).json({ message: "Não autenticado" });
    }
    const user = await storage.getUserById(req.session.userId);
    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ message: "Usuário não encontrado" });
    }
    const { password: _pw, ...safeUser } = user;
    return res.json(safeUser);
  });

  app.get("/api/users", requireAdmin, async (_req, res) => {
    const userList = await storage.getUsers();
    const safe = userList.map(({ password: _pw, ...u }) => u);
    res.json(safe);
  });

  app.post("/api/users", requireAdmin, async (req, res) => {
    try {
      const parsed = createUserSchema.parse(req.body);
      const existing = await storage.getUserByUsername(parsed.username);
      if (existing) {
        return res.status(409).json({ message: "Nome de usuário já existe" });
      }
      const hashed = await bcrypt.hash(parsed.password, 10);
      const created = await storage.createUser({
        username: parsed.username,
        password: hashed,
        name: parsed.name || null,
        email: parsed.email || null,
        phone: parsed.phone || null,
        role: "user",
        groupIds: parsed.groupIds && parsed.groupIds.length > 0 ? parsed.groupIds : null,
      });
      const { password: _pw, ...safe } = created;
      return res.status(201).json(safe);
    } catch (error: any) {
      const message = error?.errors?.[0]?.message || error?.message || "Erro ao criar usuário";
      return res.status(400).json({ message });
    }
  });

  app.patch("/api/users/:id", requireAdmin, async (req, res) => {
    try {
      const id = req.params.id as string;
      const { name, email, phone, groupIds, password } = req.body;

      const updateData: Record<string, unknown> = {};
      if (name !== undefined) updateData.name = name || null;
      if (email !== undefined) updateData.email = email || null;
      if (phone !== undefined) updateData.phone = phone || null;
      if (groupIds !== undefined) updateData.groupIds = Array.isArray(groupIds) && groupIds.length > 0 ? groupIds : null;
      if (password) {
        if (typeof password !== "string" || password.length < 4) {
          return res.status(400).json({ message: "Senha deve ter ao menos 4 caracteres" });
        }
        updateData.password = await bcrypt.hash(password, 10);
      }

      const updated = await storage.updateUser(id, updateData);
      if (!updated) return res.status(404).json({ message: "Usuário não encontrado" });

      const { password: _pw, ...safe } = updated;
      return res.json(safe);
    } catch (error: any) {
      return res.status(400).json({ message: error?.message || "Erro ao atualizar usuário" });
    }
  });

  app.delete("/api/users/:id", requireAdmin, async (req, res) => {
    try {
      const id = req.params.id as string;
      if (id === req.session.userId) {
        return res.status(403).json({ message: "Você não pode excluir sua própria conta" });
      }

      const target = await storage.getUserById(id);
      if (!target) return res.status(404).json({ message: "Usuário não encontrado" });

      if (target.role === "admin") {
        const allUsers = await storage.getUsers();
        const adminCount = allUsers.filter((u) => u.role === "admin").length;
        if (adminCount <= 1) {
          return res.status(403).json({ message: "Não é possível excluir o único administrador do sistema" });
        }
      }

      await storage.deleteUser(id);
      res.json({ message: "Usuário removido" });
    } catch (error) {
      res.status(500).json({ message: "Erro ao remover usuário" });
    }
  });

  app.get("/api/groups", requireAdmin, async (_req, res) => {
    const groups = await storage.getDistinctGroups();
    res.json(groups);
  });

  app.get("/api/transactions", requireAuth, async (req, res) => {
    try {
      await storage.updateOverdueTransactions();

      if (req.session.role === "admin") {
        const txns = await storage.getTransactions();
        return res.json(txns);
      } else {
        const user = await storage.getUserById(req.session.userId!);
        if (!user?.groupIds || user.groupIds.length === 0) {
          return res.json([]);
        }
        const txns = await storage.getTransactionsByGroupIds(user.groupIds);
        return res.json(txns);
      }
    } catch (error) {
      console.error("Error fetching transactions:", error);
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  app.post("/api/transactions", requireAdmin, async (req, res) => {
    try {
      const body = {
        ...req.body,
        installments: req.body.installments ?? 1,
      };
      const parsed = createProjectSchema.parse(body);
      const groupId = randomUUID();
      const startDate = parseDueDate(parsed.startDate);
      const todayStart = startOfTodayLocal();
      const txnsToCreate = [];

      const ratesFields = {
        interestRate: (parsed.interestRate ?? 1).toFixed(2),
        lateFee: (parsed.lateFee ?? 2).toFixed(2),
        earlyDiscount: (parsed.earlyDiscount ?? 0).toFixed(2),
        earlyDiscountDays: parsed.earlyDiscountDays ?? 7,
      };

      if (parsed.category === "PROJECT_INSTALLMENT") {
        const amounts = splitAmount(parsed.totalAmount, parsed.installments);

        for (let i = 0; i < parsed.installments; i++) {
          const dueDate = addMonthsPreservingDay(startDate, i);

          txnsToCreate.push({
            description: parsed.description,
            client: parsed.client,
            clientEmail: parsed.clientEmail || null,
            clientWhatsapp: parsed.clientWhatsapp || null,
            clientCpfCnpj: parsed.clientCpfCnpj?.trim() || null,
            category: parsed.category as "PROJECT_INSTALLMENT",
            amount: amounts[i],
            dueDate,
            status: "PENDING" as const,
            installmentCurrent: i + 1,
            installmentTotal: parsed.installments,
            groupId,
            ...ratesFields,
          });
        }
      } else {
        const months = parsed.indefinite || !parsed.repeatMonths ? 12 : parsed.repeatMonths;

        for (let i = 0; i < months; i++) {
          const dueDate = addMonthsPreservingDay(startDate, i);

          txnsToCreate.push({
            description: parsed.description,
            client: parsed.client,
            clientEmail: parsed.clientEmail || null,
            clientWhatsapp: parsed.clientWhatsapp || null,
            clientCpfCnpj: parsed.clientCpfCnpj?.trim() || null,
            category: parsed.category as "SAAS_SUBSCRIPTION" | "RETAINER_FEE" | "DATABASE_BACKUP",
            amount: parsed.totalAmount.toFixed(2),
            dueDate,
            status: "PENDING" as const,
            installmentCurrent: i + 1,
            installmentTotal: months,
            groupId,
            ...ratesFields,
          });
        }
      }

      const finalTxns = txnsToCreate.map((t) => ({
        ...t,
        status: (t.dueDate < todayStart && t.status === "PENDING" ? "OVERDUE" : t.status) as "PENDING" | "OVERDUE" | "PAID",
      }));

      const created = await storage.createManyTransactions(finalTxns);
      res.status(201).json(created);
    } catch (error: any) {
      console.error("Error creating transactions:", error);
      const message = error?.errors?.[0]?.message || error?.message || "Failed to create transactions";
      res.status(400).json({ message });
    }
  });

  app.patch("/api/transactions/:id", requireAdmin, async (req, res) => {
    try {
      const id = req.params.id as string;
      const current = await storage.getTransactionById(id);
      if (!current) {
        return res.status(404).json({ message: "Transação não encontrada" });
      }

      const { updateClientGroup, ...body } = req.body ?? {};
      const updateData: Record<string, unknown> = {};
      const clientData: Record<string, unknown> = {};

      if (body.description !== undefined) {
        if (typeof body.description !== "string" || !body.description.trim()) {
          return res.status(400).json({ message: "Descrição é obrigatória" });
        }
        clientData.description = body.description.trim();
      }
      if (body.client !== undefined) {
        if (typeof body.client !== "string" || !body.client.trim()) {
          return res.status(400).json({ message: "Cliente é obrigatório" });
        }
        clientData.client = body.client.trim();
      }
      for (const field of ["clientEmail", "clientWhatsapp", "clientCpfCnpj"] as const) {
        if (body[field] !== undefined) {
          clientData[field] = typeof body[field] === "string" && body[field].trim()
            ? body[field].trim()
            : null;
        }
      }

      if (body.amount !== undefined) {
        const amount = Number(body.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
          return res.status(400).json({ message: "Valor deve ser positivo" });
        }
        updateData.amount = amount.toFixed(2);
      }
      if (body.dueDate !== undefined) {
        const dueDate = parseDueDate(body.dueDate);
        if (Number.isNaN(dueDate.getTime())) {
          return res.status(400).json({ message: "Data de vencimento inválida" });
        }
        updateData.dueDate = dueDate;
      }
      if (body.status !== undefined) {
        if (!["PENDING", "OVERDUE", "PAID"].includes(body.status)) {
          return res.status(400).json({ message: "Status inválido" });
        }
        updateData.status = body.status;
      }

      if (Object.keys(clientData).length > 0) {
        if (updateClientGroup !== false) {
          await storage.updateTransactionsByGroupId(current.groupId, clientData);
        } else {
          Object.assign(updateData, clientData);
        }
      }

      const hasClientData = Object.keys(clientData).length > 0;
      const hasTransactionData = Object.keys(updateData).length > 0;
      if (!hasTransactionData && !hasClientData) {
        return res.status(400).json({ message: "Nenhuma alteração informada" });
      }

      const updated = hasTransactionData
        ? await storage.updateTransaction(id, updateData)
        : await storage.getTransactionById(id);
      if (!updated) {
        return res.status(404).json({ message: "Transação não encontrada" });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating transaction:", error);
      res.status(500).json({ message: "Falha ao atualizar transação" });
    }
  });

  app.post("/api/backups/reconcile", requireAdmin, async (req, res) => {
    try {
      const rows = req.body?.rows;
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ message: "A planilha não possui linhas válidas" });
      }
      if (rows.length > 10000) {
        return res.status(400).json({ message: "A planilha não pode ter mais de 10.000 linhas" });
      }

      const backups = (await storage.getTransactions()).filter(
        (transaction) => transaction.category === "DATABASE_BACKUP",
      );
      const results = {
        processed: 0,
        updated: 0,
        alreadyPaid: 0,
        ignored: 0,
        notFound: [] as string[],
        invalid: [] as string[],
      };

      for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        const cnpj = normalizeDocument(row?.cnpj);
        const monthYear = parseMonthYear(row?.monthYear);
        if (cnpj.length !== 14 || !monthYear) {
          results.invalid.push(`Linha ${index + 2}`);
          continue;
        }
        if (row?.paid !== true) {
          results.ignored += 1;
          continue;
        }

        results.processed += 1;
        const matches = backups.filter((transaction) => {
          const transactionCnpj = normalizeDocument(transaction.clientCpfCnpj);
          const dueDate = new Date(transaction.dueDate);
          return (
            transactionCnpj === cnpj &&
            dueDate.getMonth() + 1 === monthYear.month &&
            dueDate.getFullYear() === monthYear.year
          );
        });

        if (matches.length === 0) {
          results.notFound.push(`${cnpj} — ${String(monthYear.month).padStart(2, "0")}/${monthYear.year}`);
          continue;
        }

        for (const transaction of matches) {
          if (transaction.status === "PAID") {
            results.alreadyPaid += 1;
          } else {
            await storage.updateTransactionStatus(transaction.id, "PAID");
            results.updated += 1;
          }
        }
      }

      return res.json(results);
    } catch (error: any) {
      console.error("Error reconciling backups:", error);
      return res.status(500).json({ message: error?.message || "Falha ao conciliar pagamentos" });
    }
  });

  // Shared helper: resolves PIX for a transaction, reusing existing charge when possible
  const pixLocks = new Map<string, Promise<any>>();
  async function resolvePixForTransaction(transaction: any) {
    const existing = pixLocks.get(transaction.id);
    if (existing) return existing;

    const promise = (async () => {
      const linkedUser = await storage.getUserByGroupId(transaction.groupId);
      const clientName = linkedUser?.name || transaction.client;
      const clientEmail = linkedUser?.email || transaction.clientEmail;
      const clientPhone = linkedUser?.phone || transaction.clientWhatsapp;
      const adjustment = calculateAdjustedAmount(transaction);

      let pixCode: string | null = null;
      let pixQrCodeImage: string | null = null;
      let pixError: string | null = null;
      let invoiceUrl: string | null = null;

      if (isAsaasConfigured()) {
        try {
          // Reuse cached charge if value still matches (within 1 cent) and not paid
          if (transaction.asaasChargeId) {
            const existingCharge = await getPixForCharge(transaction.asaasChargeId);
            if (
              existingCharge &&
              existingCharge.status !== "RECEIVED" &&
              existingCharge.status !== "CONFIRMED" &&
              Math.abs(existingCharge.value - adjustment.adjusted) < 0.01
            ) {
              pixCode = existingCharge.pixCode;
              pixQrCodeImage = existingCharge.qrCodeImage;
              invoiceUrl = existingCharge.invoiceUrl;
            }
          }

          if (!pixCode) {
            const customerId = await findOrCreateCustomer({
              name: clientName,
              email: clientEmail,
              cpfCnpj: transaction.clientCpfCnpj,
              phone: clientPhone,
            });
            const dueForAsaas =
              adjustment.daysDiff > 0
                ? formatDateYMD(new Date())
                : formatDateYMD(new Date(transaction.dueDate));
            const pix = await createPixCharge({
              customerId,
              value: adjustment.adjusted,
              dueDate: dueForAsaas,
              description: `${transaction.description} - Parcela ${transaction.installmentCurrent}/${transaction.installmentTotal}`,
              externalReference: transaction.id,
            });
            pixCode = pix.pixCode;
            pixQrCodeImage = pix.qrCodeImage;
            invoiceUrl = pix.invoiceUrl;
            await storage.updateTransactionAsaasChargeId(transaction.id, pix.chargeId);
          }
        } catch (e: any) {
          console.error("Asaas PIX error:", e);
          pixError = e?.message || "Falha ao gerar PIX";
        }
      }

      const message = buildCollectionMessage({
        clientName,
        description: transaction.description,
        installmentCurrent: transaction.installmentCurrent,
        installmentTotal: transaction.installmentTotal,
        dueDate: transaction.dueDate,
        adjustment,
        pixCode,
      });

      return {
        message,
        adjustment,
        pixCode,
        pixQrCodeImage,
        invoiceUrl,
        pixError,
        phone: clientPhone,
        email: clientEmail,
        clientName,
      };
    })();

    pixLocks.set(transaction.id, promise);
    try {
      return await promise;
    } finally {
      pixLocks.delete(transaction.id);
    }
  }

  // Generates updated charge data (amount with interest/discount + PIX from Asaas)
  // Does NOT send anything — used by WhatsApp flow which opens wa.me with the returned message.
  app.post("/api/transactions/:id/collection-preview", requireAdmin, async (req, res) => {
    try {
      const id = req.params.id as string;
      const transaction = await storage.getTransactionById(id);
      if (!transaction) {
        return res.status(404).json({ message: "Transação não encontrada" });
      }
      if (transaction.category === "DATABASE_BACKUP") {
        return res.status(400).json({ message: "Backups não geram cobrança" });
      }
      if (transaction.status !== "OVERDUE") {
        return res.status(400).json({ message: "Cobrança disponível apenas para parcelas em atraso" });
      }

      const result = await resolvePixForTransaction(transaction);
      const { clientName: _omit, ...response } = result;
      res.json(response);
    } catch (error: any) {
      console.error("Error generating collection preview:", error);
      res.status(500).json({ message: error?.message || "Falha ao gerar cobrança" });
    }
  });

  app.get("/api/config", requireAdmin, (_req, res) => {
    res.json({
      whatsappConfigured: isWhatsAppConfigured(),
      asaasConfigured: isAsaasConfigured(),
    });
  });

  app.post("/api/send-whatsapp", requireAdmin, async (req, res) => {
    try {
      const { transactionId } = req.body;
      if (!transactionId) {
        return res.status(400).json({ message: "transactionId é obrigatório" });
      }

      const transaction = await storage.getTransactionById(transactionId);
      if (!transaction) {
        return res.status(404).json({ message: "Transação não encontrada" });
      }
      if (transaction.category === "DATABASE_BACKUP") {
        return res.status(400).json({ message: "Backups não geram cobrança" });
      }
      if (transaction.status !== "OVERDUE") {
        return res.status(400).json({ message: "Cobrança disponível apenas para parcelas em atraso" });
      }

      const result = await resolvePixForTransaction(transaction);
      if (!result.phone) {
        return res.status(400).json({ message: "Nenhum telefone disponível para este cliente" });
      }

      await sendWhatsAppText(result.phone, result.message);

      res.json({
        message: "WhatsApp enviado com sucesso",
        adjustment: result.adjustment,
        pixIncluded: Boolean(result.pixCode),
        pixError: result.pixError,
      });
    } catch (error: any) {
      console.error("Error sending WhatsApp:", error);
      res.status(500).json({ message: error.message || "Falha ao enviar WhatsApp" });
    }
  });

  app.post("/api/send-collection-email", requireAdmin, async (req, res) => {
    try {
      const { transactionId } = req.body;
      if (!transactionId) {
        return res.status(400).json({ message: "transactionId é obrigatório" });
      }

      const transaction = await storage.getTransactionById(transactionId);
      if (!transaction) {
        return res.status(404).json({ message: "Transação não encontrada" });
      }
      if (transaction.category === "DATABASE_BACKUP") {
        return res.status(400).json({ message: "Backups não geram cobrança" });
      }
      if (transaction.status !== "OVERDUE") {
        return res.status(400).json({ message: "Cobrança disponível apenas para parcelas em atraso" });
      }

      const result = await resolvePixForTransaction(transaction);
      if (!result.email) {
        return res.status(400).json({ message: "Nenhum email disponível para este cliente" });
      }

      const subject = `Cobrança - ${transaction.description} - Parcela ${transaction.installmentCurrent}/${transaction.installmentTotal}`;
      await sendCollectionEmail(result.email, subject, result.message);

      res.json({
        message: "Email de cobrança enviado com sucesso",
        adjustment: result.adjustment,
        pixIncluded: Boolean(result.pixCode),
        pixError: result.pixError,
      });
    } catch (error: any) {
      console.error("Error sending collection email:", error);
      res.status(500).json({ message: error.message || "Falha ao enviar email" });
    }
  });

  return httpServer;
}
