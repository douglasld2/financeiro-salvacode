import { Card, CardContent } from "@/components/ui/card";
import { formatBRL } from "@/lib/format";
import {
  TrendingUp,
  AlertTriangle,
  Clock,
  RefreshCw,
  Database,
  Briefcase,
  CalendarClock,
} from "lucide-react";
import type { Transaction } from "@shared/schema";

interface DashboardCardsProps {
  transactions: Transaction[];
  allTransactions?: Transaction[];
}

function monthlyTotalByCategory(transactions: Transaction[], category: Transaction["category"]) {
  const byGroup = new Map<string, number>();
  for (const t of transactions) {
    if (t.category !== category) continue;
    if (!byGroup.has(t.groupId)) {
      byGroup.set(t.groupId, parseFloat(t.amount));
    }
  }
  let total = 0;
  byGroup.forEach((v) => (total += v));
  return { total, count: byGroup.size };
}

export function DashboardCards({ transactions, allTransactions }: DashboardCardsProps) {
  const now = new Date();
  const thirtyDaysFromNow = new Date(now);
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  const ninetyDaysFromNow = new Date(now);
  ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);

  const overdueTotal = transactions
    .filter((t) => t.status === "OVERDUE")
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);

  const next30Days = transactions
    .filter((t) => {
      const due = new Date(t.dueDate);
      return t.status === "PENDING" && due >= now && due <= thirtyDaysFromNow;
    })
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);

  const cashflow3Months = transactions
    .filter((t) => {
      const due = new Date(t.dueDate);
      return (t.status === "PENDING" || t.status === "OVERDUE") && due <= ninetyDaysFromNow;
    })
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);

  const saasRenewals = transactions.filter(
    (t) => t.category === "SAAS_SUBSCRIPTION" && t.status === "PENDING"
  );

  const saasRenewalCount = new Set(saasRenewals.map((t) => t.groupId)).size;

  const recurringSource = allTransactions ?? transactions;
  const saasMonthly = monthlyTotalByCategory(recurringSource, "SAAS_SUBSCRIPTION");
  const backupMonthly = monthlyTotalByCategory(recurringSource, "DATABASE_BACKUP");
  const retainerMonthly = monthlyTotalByCategory(recurringSource, "RETAINER_FEE");

  const cards = [
    {
      title: "A Receber (30 dias)",
      value: formatBRL(next30Days),
      icon: Clock,
      iconColor: "text-blue-400",
      bgColor: "bg-blue-500/10",
    },
    {
      title: "Em Atraso",
      value: formatBRL(overdueTotal),
      icon: AlertTriangle,
      iconColor: "text-red-400",
      bgColor: "bg-red-500/10",
    },
    {
      title: "Cashflow (3 meses)",
      value: formatBRL(cashflow3Months),
      icon: TrendingUp,
      iconColor: "text-emerald-400",
      bgColor: "bg-emerald-500/10",
    },
    {
      title: "Renovações SaaS",
      value: `${saasRenewalCount} contratos`,
      icon: RefreshCw,
      iconColor: "text-violet-400",
      bgColor: "bg-violet-500/10",
    },
  ];

  const monthlyCards = [
    {
      title: "SaaS / mês",
      value: formatBRL(saasMonthly.total),
      subtitle: `${saasMonthly.count} contratos`,
      icon: RefreshCw,
      iconColor: "text-violet-400",
      bgColor: "bg-violet-500/10",
    },
    {
      title: "Mensalidades / mês",
      value: formatBRL(retainerMonthly.total),
      subtitle: `${retainerMonthly.count} contratos`,
      icon: CalendarClock,
      iconColor: "text-amber-400",
      bgColor: "bg-amber-500/10",
    },
    {
      title: "Backups / mês",
      value: formatBRL(backupMonthly.total),
      subtitle: `${backupMonthly.count} contratos`,
      icon: Database,
      iconColor: "text-purple-400",
      bgColor: "bg-purple-500/10",
    },
    {
      title: "Recorrência total / mês",
      value: formatBRL(saasMonthly.total + retainerMonthly.total + backupMonthly.total),
      subtitle: `${saasMonthly.count + retainerMonthly.count + backupMonthly.count} contratos`,
      icon: Briefcase,
      iconColor: "text-emerald-400",
      bgColor: "bg-emerald-500/10",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <Card key={card.title}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`${card.bgColor} p-2.5 rounded-md`}>
                  <card.icon className={`h-5 w-5 ${card.iconColor}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className="text-xs text-muted-foreground truncate"
                    data-testid={`text-card-title-${card.title}`}
                  >
                    {card.title}
                  </p>
                  <p
                    className="text-lg font-semibold tracking-tight truncate"
                    data-testid={`text-card-value-${card.title}`}
                  >
                    {card.value}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {monthlyCards.map((card) => (
          <Card key={card.title}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`${card.bgColor} p-2.5 rounded-md`}>
                  <card.icon className={`h-5 w-5 ${card.iconColor}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className="text-xs text-muted-foreground truncate"
                    data-testid={`text-monthly-title-${card.title}`}
                  >
                    {card.title}
                  </p>
                  <p
                    className="text-lg font-semibold tracking-tight truncate"
                    data-testid={`text-monthly-value-${card.title}`}
                  >
                    {card.value}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">{card.subtitle}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
