import type { Transaction } from "@shared/schema";

export interface AmountAdjustment {
  base: number;
  adjusted: number;
  daysDiff: number;
  interest: number;
  fine: number;
  discount: number;
  interestRate: number;
  lateFeeRate: number;
  earlyDiscountRate: number;
  earlyDiscountDays: number;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function calculateAdjustedAmount(
  transaction: Pick<
    Transaction,
    "amount" | "dueDate" | "interestRate" | "lateFee" | "earlyDiscount" | "earlyDiscountDays"
  >,
  today: Date = new Date()
): AmountAdjustment {
  const base = parseFloat(transaction.amount);
  const interestRate = parseFloat(transaction.interestRate ?? "0") / 100;
  const lateFeeRate = parseFloat(transaction.lateFee ?? "0") / 100;
  const earlyDiscountRate = parseFloat(transaction.earlyDiscount ?? "0") / 100;
  const earlyDiscountDays = transaction.earlyDiscountDays ?? 0;

  const due = startOfDay(new Date(transaction.dueDate));
  const now = startOfDay(today);
  const dayMs = 24 * 60 * 60 * 1000;
  const daysDiff = Math.round((now.getTime() - due.getTime()) / dayMs);

  let interest = 0;
  let fine = 0;
  let discount = 0;

  if (daysDiff > 0) {
    const dailyRate = interestRate / 30;
    interest = base * dailyRate * daysDiff;
    fine = base * lateFeeRate;
  } else if (daysDiff < 0) {
    const earlyDays = -daysDiff;
    if (earlyDiscountRate > 0 && earlyDays >= earlyDiscountDays) {
      discount = base * earlyDiscountRate;
    }
  }

  const adjusted = Math.max(0, base + interest + fine - discount);

  return {
    base,
    adjusted: Math.round(adjusted * 100) / 100,
    daysDiff,
    interest: Math.round(interest * 100) / 100,
    fine: Math.round(fine * 100) / 100,
    discount: Math.round(discount * 100) / 100,
    interestRate: interestRate * 100,
    lateFeeRate: lateFeeRate * 100,
    earlyDiscountRate: earlyDiscountRate * 100,
    earlyDiscountDays,
  };
}

function fmtBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function fmtDate(date: Date | string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(date));
}

export function buildCollectionMessage(opts: {
  clientName: string;
  description: string;
  installmentCurrent: number;
  installmentTotal: number;
  dueDate: Date | string;
  adjustment: AmountAdjustment;
  pixCode?: string | null;
}): string {
  const { clientName, description, installmentCurrent, installmentTotal, dueDate, adjustment, pixCode } = opts;
  const lines: string[] = [];

  lines.push(`Prezado(a) ${clientName},`);
  lines.push("");
  lines.push(
    `Referente a "${description}" - Parcela ${installmentCurrent}/${installmentTotal}, com vencimento em ${fmtDate(dueDate)}.`
  );
  lines.push("");
  lines.push(`Valor original: ${fmtBRL(adjustment.base)}`);

  if (adjustment.daysDiff > 0) {
    lines.push(`Dias em atraso: ${adjustment.daysDiff}`);
    if (adjustment.interest > 0) {
      lines.push(
        `Juros (${adjustment.interestRate.toFixed(2)}% ao mês): ${fmtBRL(adjustment.interest)}`
      );
    }
    if (adjustment.fine > 0) {
      lines.push(`Multa (${adjustment.lateFeeRate.toFixed(2)}%): ${fmtBRL(adjustment.fine)}`);
    }
  } else if (adjustment.discount > 0) {
    lines.push(
      `Desconto antecipação (${adjustment.earlyDiscountRate.toFixed(2)}%): -${fmtBRL(adjustment.discount)}`
    );
  }

  lines.push("");
  lines.push(`Valor atualizado: ${fmtBRL(adjustment.adjusted)}`);

  if (pixCode) {
    lines.push("");
    lines.push("Pague via PIX (copia e cola):");
    lines.push(pixCode);
  }

  lines.push("");
  lines.push("Caso o pagamento já tenha sido efetuado, por favor desconsidere esta mensagem.");
  lines.push("");
  lines.push("Atenciosamente.");

  return lines.join("\n");
}
