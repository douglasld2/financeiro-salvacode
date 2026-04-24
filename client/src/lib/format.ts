export function formatBRL(value: number | string): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(num);
}

export function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

export function formatDateShort(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
  }).format(d);
}

export function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    SAAS_SUBSCRIPTION: "Assinatura SaaS",
    PROJECT_INSTALLMENT: "Projeto Parcelado",
    RETAINER_FEE: "Mensalidade / Retainer",
  };
  return labels[category] || category;
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    PENDING: "Pendente",
    OVERDUE: "Em Atraso",
    PAID: "Pago",
  };
  return labels[status] || status;
}

export function getStatusColor(status: string, dueDate: string | Date): string {
  if (status === "PAID") return "text-emerald-400";
  if (status === "OVERDUE") return "text-red-400";

  const due = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  const now = new Date();
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays <= 1 && diffDays >= 0) return "text-amber-400";
  if (diffDays < 0) return "text-red-400";
  return "text-muted-foreground";
}

export function getStatusBadgeVariant(status: string, dueDate: string | Date): {
  className: string;
  label: string;
} {
  if (status === "PAID") {
    return {
      className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
      label: "Pago",
    };
  }
  if (status === "OVERDUE") {
    return {
      className: "bg-red-500/15 text-red-400 border-red-500/20",
      label: "Em Atraso",
    };
  }

  const due = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  const now = new Date();
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays <= 1 && diffDays >= 0) {
    return {
      className: "bg-amber-500/15 text-amber-400 border-amber-500/20",
      label: diffDays === 0 ? "Vence Hoje" : "Vence Amanhã",
    };
  }
  if (diffDays < 0) {
    return {
      className: "bg-red-500/15 text-red-400 border-red-500/20",
      label: "Em Atraso",
    };
  }

  return {
    className: "bg-muted/50 text-muted-foreground border-border",
    label: "Futuro",
  };
}

export function buildCollectionMessage(
  client: string,
  description: string,
  amount: string | number,
  dueDate: string | Date,
  installmentCurrent: number,
  installmentTotal: number
): string {
  const formattedAmount = formatBRL(amount);
  const formattedDate = formatDate(dueDate);

  return `Prezado(a) ${client},

Identificamos que a parcela ${installmentCurrent}/${installmentTotal} referente a "${description}", no valor de ${formattedAmount}, com vencimento em ${formattedDate}, encontra-se em aberto.

Solicitamos gentilmente a regularização do pagamento o mais breve possível.

Caso o pagamento já tenha sido efetuado, por favor desconsidere esta mensagem.

Atenciosamente.`;
}
