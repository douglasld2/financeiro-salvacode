import type { Request, Response, NextFunction } from "express";
import { storage } from "./storage";

declare module "express-session" {
  interface SessionData {
    userId: string;
    role: "admin" | "user";
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ message: "Não autenticado" });
  }
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ message: "Não autenticado" });
  }

  // Re-verify role from DB on every admin action to catch role changes without requiring re-login
  try {
    const user = await storage.getUserById(req.session.userId);
    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ message: "Sessão inválida" });
    }
    if (user.role !== "admin") {
      return res.status(403).json({ message: "Acesso negado" });
    }
    // Keep session in sync
    req.session.role = user.role;
    next();
  } catch (error) {
    console.error("requireAdmin DB check error:", error);
    return res.status(500).json({ message: "Erro ao verificar permissões" });
  }
}
