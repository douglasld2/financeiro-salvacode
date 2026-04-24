import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatDate } from "@/lib/format";
import { RefreshCw } from "lucide-react";
import type { Transaction } from "@shared/schema";

interface SaasRenewalsProps {
  transactions: Transaction[];
}

export function SaasRenewals({ transactions }: SaasRenewalsProps) {
  const saasTransactions = transactions.filter(
    (t) => t.category === "SAAS_SUBSCRIPTION" && t.status === "PENDING"
  );

  const groupedByProject = new Map<string, Transaction[]>();
  for (const t of saasTransactions) {
    if (!groupedByProject.has(t.groupId)) {
      groupedByProject.set(t.groupId, []);
    }
    groupedByProject.get(t.groupId)!.push(t);
  }

  const nextRenewals: { description: string; client: string; nextDue: Transaction }[] = [];
  for (const [, txns] of groupedByProject) {
    const sorted = txns.sort(
      (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    );
    const nextPending = sorted.find((t) => t.status === "PENDING");
    if (nextPending) {
      nextRenewals.push({
        description: nextPending.description,
        client: nextPending.client,
        nextDue: nextPending,
      });
    }
  }

  nextRenewals.sort(
    (a, b) =>
      new Date(a.nextDue.dueDate).getTime() -
      new Date(b.nextDue.dueDate).getTime()
  );

  if (nextRenewals.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <RefreshCw className="h-4 w-4 text-violet-400" />
            <h3 className="text-sm font-semibold">Renovações SaaS</h3>
          </div>
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhuma renovação SaaS pendente
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <RefreshCw className="h-4 w-4 text-violet-400" />
          <h3 className="text-sm font-semibold">Renovações SaaS</h3>
        </div>
        <div className="space-y-3">
          {nextRenewals.map((renewal) => {
            const daysUntil = Math.ceil(
              (new Date(renewal.nextDue.dueDate).getTime() - Date.now()) /
                (1000 * 60 * 60 * 24)
            );

            return (
              <div
                key={renewal.nextDue.id}
                className="flex items-center gap-3 p-3 rounded-md bg-card/50 border border-border/50"
                data-testid={`renewal-${renewal.nextDue.id}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {renewal.description}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {renewal.client}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-sm font-semibold tabular-nums">
                    {formatBRL(renewal.nextDue.amount)}
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-[11px] px-1.5 py-0 no-default-hover-elevate no-default-active-elevate ${
                      daysUntil <= 7
                        ? "bg-amber-500/15 text-amber-400 border-amber-500/20"
                        : "bg-muted/50 text-muted-foreground border-border"
                    }`}
                  >
                    {formatDate(renewal.nextDue.dueDate)}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
