import type { Express } from "express";
import { createServer, type Server } from "http";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { storage } from "./storage";
import { createProjectSchema, createUserSchema } from "@shared/schema";
import { randomUUID } from "crypto";
import { sendCollectionEmail } from "./email";
import { requireAuth, requireAdmin } from "./auth";

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: false,
  message: { message: "Muitas tentativas de login. Aguarde 15 minutos e tente novamente." },
});

// Parse "YYYY-MM-DD" as noon LOCAL (server TZ is forced to America/Sao_Paulo).
// Storing at noon avoids day-shift issues across timezones.
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

// Add months preserving day-of-month; falls back to last day of month if it doesn't exist.
// Output is at noon local time.
function addMonthsPreservingDay(base: Date, monthsToAdd: number): Date {
  const year = base.getFullYear();
  const month = base.getMonth();
  const day = base.getDate();
  const targetMonth = month + monthsToAdd;
  // Day 0 of next month = last day of this month
  const lastDayOfTarget = new Date(year, targetMonth + 1, 0).getDate();
  const finalDay = Math.min(day, lastDayOfTarget);
  return new Date(year, targetMonth, finalDay, 12, 0, 0, 0);
}

// Distribute total amount across N installments fairly (in cents),
// remainder cents go to the first installments. Returns array of "X.XX" strings.
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

      if (parsed.category === "PROJECT_INSTALLMENT") {
        const amounts = splitAmount(parsed.totalAmount, parsed.installments);

        for (let i = 0; i < parsed.installments; i++) {
          const dueDate = addMonthsPreservingDay(startDate, i);

          txnsToCreate.push({
            description: parsed.description,
            client: parsed.client,
            clientEmail: parsed.clientEmail || null,
            clientWhatsapp: parsed.clientWhatsapp || null,
            category: parsed.category as "PROJECT_INSTALLMENT",
            amount: amounts[i],
            dueDate,
            status: "PENDING" as const,
            installmentCurrent: i + 1,
            installmentTotal: parsed.installments,
            groupId,
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
            category: parsed.category as "SAAS_SUBSCRIPTION" | "RETAINER_FEE",
            amount: parsed.totalAmount.toFixed(2),
            dueDate,
            status: "PENDING" as const,
            installmentCurrent: i + 1,
            installmentTotal: months,
            groupId,
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
      const { status } = req.body;

      if (!status || !["PENDING", "OVERDUE", "PAID"].includes(status)) {
        return res.status(400).json({ message: "Status inválido" });
      }

      const updated = await storage.updateTransactionStatus(id, status);
      if (!updated) {
        return res.status(404).json({ message: "Transação não encontrada" });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating transaction:", error);
      res.status(500).json({ message: "Falha ao atualizar transação" });
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

      const linkedUser = await storage.getUserByGroupId(transaction.groupId);
      const emailTo = linkedUser?.email || transaction.clientEmail;
      const clientName = linkedUser?.name || transaction.client;

      if (!emailTo) {
        return res.status(400).json({ message: "Nenhum email disponível para este cliente" });
      }

      const formattedAmount = new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(parseFloat(transaction.amount));

      const formattedDate = new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date(transaction.dueDate));

      const subject = `Cobrança - ${transaction.description} - Parcela ${transaction.installmentCurrent}/${transaction.installmentTotal}`;
      const body = `Prezado(a) ${clientName},\n\nIdentificamos que a parcela ${transaction.installmentCurrent}/${transaction.installmentTotal} referente a "${transaction.description}", no valor de ${formattedAmount}, com vencimento em ${formattedDate}, encontra-se em aberto.\n\nSolicitamos gentilmente a regularização do pagamento o mais breve possível.\n\nCaso o pagamento já tenha sido efetuado, por favor desconsidere esta mensagem.\n\nAtenciosamente.`;

      await sendCollectionEmail(emailTo, subject, body);

      res.json({ message: "Email de cobrança enviado com sucesso" });
    } catch (error: any) {
      console.error("Error sending collection email:", error);
      res.status(500).json({ message: error.message || "Falha ao enviar email" });
    }
  });

  return httpServer;
}
