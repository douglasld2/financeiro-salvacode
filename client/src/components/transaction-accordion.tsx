import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatBRL,
  formatDate,
  getCategoryLabel,
  getStatusBadgeVariant,
  buildCollectionMessage,
} from "@/lib/format";
import { CheckCircle2, Circle, User2, Briefcase, Mail, MessageCircle } from "lucide-react";
import type { Transaction } from "@shared/schema";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface UserContact {
  email: string | null;
  phone: string | null;
  name: string | null;
}

interface TransactionAccordionProps {
  transactions: Transaction[];
  allTransactions?: Transaction[];
  usersByGroupId?: Record<string, UserContact>;
}

interface ClientGroup {
  client: string;
  projects: ProjectGroup[];
  totalAmount: number;
  paidAmount: number;
}

interface ProjectGroup {
  groupId: string;
  description: string;
  category: string;
  transactions: Transaction[];
  totalAmount: number;
  paidAmount: number;
  paidCount: number;
  totalCount: number;
}

function groupTransactions(transactions: Transaction[], allTransactions?: Transaction[]): ClientGroup[] {
  const clientMap = new Map<string, Map<string, Transaction[]>>();
  const allTxns = allTransactions || transactions;

  for (const t of transactions) {
    if (!clientMap.has(t.client)) {
      clientMap.set(t.client, new Map());
    }
    const projectMap = clientMap.get(t.client)!;
    if (!projectMap.has(t.groupId)) {
      projectMap.set(t.groupId, []);
    }
    projectMap.get(t.groupId)!.push(t);
  }

  const groups: ClientGroup[] = [];

  clientMap.forEach((projectMap, client) => {
    const projects: ProjectGroup[] = [];
    let clientTotalAmount = 0;
    let clientPaidAmount = 0;

    projectMap.forEach((txns: Transaction[], groupId: string) => {
      const projectAllTxns = allTxns.filter(t => t.groupId === groupId);
      const sorted = txns.sort(
        (a, b) => a.installmentCurrent - b.installmentCurrent
      );

      const projectTotal = projectAllTxns.reduce(
        (sum, t) => sum + parseFloat(t.amount),
        0
      );
      const projectPaid = projectAllTxns
        .filter((t) => t.status === "PAID")
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);
      const paidCount = projectAllTxns.filter((t) => t.status === "PAID").length;

      projects.push({
        groupId,
        description: sorted[0].description,
        category: sorted[0].category,
        transactions: sorted,
        totalAmount: projectTotal,
        paidAmount: projectPaid,
        paidCount,
        totalCount: projectAllTxns.length,
      });

      clientTotalAmount += projectTotal;
      clientPaidAmount += projectPaid;
    });

    groups.push({
      client,
      projects: projects.sort((a, b) => a.description.localeCompare(b.description)),
      totalAmount: clientTotalAmount,
      paidAmount: clientPaidAmount,
    });
  });

  return groups.sort((a, b) => a.client.localeCompare(b.client));
}

function InstallmentRow({
  transaction,
  userContact,
}: {
  transaction: Transaction;
  userContact?: UserContact;
}) {
  const { toast } = useToast();
  const statusInfo = getStatusBadgeVariant(transaction.status, transaction.dueDate);

  // Resolve contact: prefer user account contact, fallback to transaction-level
  const resolvedEmail = userContact?.email || transaction.clientEmail;
  const resolvedPhone = userContact?.phone || transaction.clientWhatsapp;

  const markPaid = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/transactions/${transaction.id}`, {
        status: "PAID",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      toast({
        title: "Parcela marcada como paga",
        description: `${transaction.description} - Parcela ${transaction.installmentCurrent}/${transaction.installmentTotal}`,
      });
    },
  });

  const sendEmail = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/send-collection-email", {
        transactionId: transaction.id,
      });
    },
    onSuccess: () => {
      toast({
        title: "Email de cobrança enviado",
        description: `Enviado para ${resolvedEmail}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao enviar email",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <div
      className="flex items-center gap-3 py-2.5 px-3 rounded-md bg-card/50"
      data-testid={`row-installment-${transaction.id}`}
    >
      <div className="flex-shrink-0">
        {transaction.status === "PAID" ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        ) : (
          <Circle className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">
            Parcela {transaction.installmentCurrent}/{transaction.installmentTotal}
          </span>
          <Badge
            variant="outline"
            className={`text-[11px] px-1.5 py-0 ${statusInfo.className} no-default-hover-elevate no-default-active-elevate`}
            data-testid={`badge-status-${transaction.id}`}
          >
            {statusInfo.label}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Vencimento: {formatDate(transaction.dueDate)}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-sm font-semibold tabular-nums">
          {formatBRL(transaction.amount)}
        </span>
        {transaction.status === "OVERDUE" && (
          <Button
            size="icon"
            variant="ghost"
            disabled={!resolvedPhone}
            title={!resolvedPhone ? "WhatsApp não cadastrado" : "Enviar WhatsApp"}
            onClick={() => {
              if (!resolvedPhone) return;
              const msg = buildCollectionMessage(
                userContact?.name || transaction.client,
                transaction.description,
                transaction.amount,
                transaction.dueDate,
                transaction.installmentCurrent,
                transaction.installmentTotal
              );
              const phone = resolvedPhone.replace(/\D/g, "");
              window.open(
                `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`,
                "_blank"
              );
            }}
            data-testid={`button-whatsapp-${transaction.id}`}
          >
            <MessageCircle className={`h-4 w-4 ${resolvedPhone ? "text-emerald-500" : "text-muted-foreground/30"}`} />
          </Button>
        )}
        {transaction.status === "OVERDUE" && (
          <Button
            size="icon"
            variant="ghost"
            disabled={!resolvedEmail || sendEmail.isPending}
            title={!resolvedEmail ? "Email não cadastrado" : "Enviar Email"}
            onClick={() => {
              if (!resolvedEmail) return;
              sendEmail.mutate();
            }}
            data-testid={`button-email-${transaction.id}`}
          >
            <Mail className={`h-4 w-4 ${!resolvedEmail ? "text-muted-foreground/30" : sendEmail.isPending ? "text-muted-foreground animate-pulse" : "text-blue-400"}`} />
          </Button>
        )}
        {transaction.status !== "PAID" && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => markPaid.mutate()}
            disabled={markPaid.isPending}
            data-testid={`button-mark-paid-${transaction.id}`}
          >
            {markPaid.isPending ? "..." : "Pagar"}
          </Button>
        )}
      </div>
    </div>
  );
}

export function TransactionAccordion({
  transactions,
  allTransactions,
  usersByGroupId,
}: TransactionAccordionProps) {
  const groups = groupTransactions(transactions, allTransactions);

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Briefcase className="h-12 w-12 mb-3 opacity-30" />
        <p className="text-sm">Nenhuma transação encontrada</p>
      </div>
    );
  }

  return (
    <Accordion
      type="multiple"
      className="space-y-2"
      defaultValue={groups.map((g) => g.client)}
    >
      {groups.map((clientGroup) => (
        <AccordionItem
          key={clientGroup.client}
          value={clientGroup.client}
          className="border rounded-md px-4 bg-card/30"
          data-testid={`accordion-client-${clientGroup.client}`}
        >
          <AccordionTrigger className="hover:no-underline gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="bg-primary/10 p-2 rounded-md flex-shrink-0">
                <User2 className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="font-semibold truncate">{clientGroup.client}</p>
                <p className="text-xs text-muted-foreground">
                  {clientGroup.projects.length} projeto(s) &middot;{" "}
                  {formatBRL(clientGroup.totalAmount)} total
                </p>
              </div>
              <div className="flex-shrink-0 text-right mr-2">
                <p className="text-sm font-semibold text-emerald-400">
                  {formatBRL(clientGroup.paidAmount)}
                </p>
                <p className="text-xs text-muted-foreground">recebido</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4 pt-1">
              {clientGroup.projects.map((project) => {
                const progressPercent =
                  project.totalCount > 0
                    ? (project.paidCount / project.totalCount) * 100
                    : 0;
                const userContact = usersByGroupId?.[project.groupId];

                return (
                  <div
                    key={project.groupId}
                    className="space-y-3"
                    data-testid={`project-group-${project.groupId}`}
                  >
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">
                            {project.description}
                          </span>
                          <Badge
                            variant="secondary"
                            className="text-[11px] px-1.5 py-0"
                          >
                            {getCategoryLabel(project.category)}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {project.paidCount} de {project.totalCount} parcela(s)
                          paga(s) &middot; {formatBRL(project.paidAmount)} de{" "}
                          {formatBRL(project.totalAmount)}
                        </p>
                      </div>
                    </div>
                    <Progress
                      value={progressPercent}
                      className="h-2"
                      data-testid={`progress-${project.groupId}`}
                    />
                    <div className="space-y-1.5">
                      {project.transactions.map((txn) => (
                        <InstallmentRow
                          key={txn.id}
                          transaction={txn}
                          userContact={userContact}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
