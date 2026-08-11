import { useState } from "react";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  formatBRL,
  formatDate,
  getCategoryLabel,
  getStatusBadgeVariant,
} from "@/lib/format";
import {
  CheckCircle2,
  Circle,
  User2,
  Briefcase,
  Mail,
  MessageCircle,
  Copy,
  Send,
  Pencil,
} from "lucide-react";
import type { Transaction } from "@shared/schema";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { EditTransactionDialog } from "@/components/edit-transaction-dialog";

interface UserContact {
  email: string | null;
  phone: string | null;
  name: string | null;
}

interface TransactionAccordionProps {
  transactions: Transaction[];
  allTransactions?: Transaction[];
  groupingTransactions?: Transaction[];
  usersByGroupId?: Record<string, UserContact>;
  readOnly?: boolean;
  hideCollection?: boolean;
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
  clientCpfCnpj: string | null;
  transactions: Transaction[];
  totalAmount: number;
  paidAmount: number;
  paidCount: number;
  totalCount: number;
}

function groupTransactions(
  transactions: Transaction[],
  allTransactions?: Transaction[],
  groupingTransactions?: Transaction[],
): ClientGroup[] {
  const clientMap = new Map<string, Map<string, Transaction[]>>();
  const allTxns = allTransactions || transactions;
  const groupsSource = groupingTransactions || transactions;

  for (const t of groupsSource) {
    if (!clientMap.has(t.client)) {
      clientMap.set(t.client, new Map());
    }
    const projectMap = clientMap.get(t.client)!;
    if (!projectMap.has(t.groupId)) {
      projectMap.set(t.groupId, []);
    }
    const visibleTransactions = transactions.filter((visible) => visible.id === t.id);
    if (visibleTransactions.length > 0) {
      projectMap.get(t.groupId)!.push(...visibleTransactions);
    }
  }

  const groups: ClientGroup[] = [];

  clientMap.forEach((projectMap, client) => {
    const projects: ProjectGroup[] = [];
    let clientTotalAmount = 0;
    let clientPaidAmount = 0;

    projectMap.forEach((txns: Transaction[], groupId: string) => {
      const projectAllTxns = allTxns.filter((t) => t.groupId === groupId);
      const sorted = txns.sort((a, b) => a.installmentCurrent - b.installmentCurrent);
      const projectReference = sorted[0] || projectAllTxns[0];
      if (!projectReference) return;

      const projectTotal = projectAllTxns.reduce((sum, t) => sum + parseFloat(t.amount), 0);
      const projectPaid = projectAllTxns
        .filter((t) => t.status === "PAID")
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);
      const paidCount = projectAllTxns.filter((t) => t.status === "PAID").length;

      projects.push({
        groupId,
        description: projectReference.description,
        category: projectReference.category,
        clientCpfCnpj: projectReference.clientCpfCnpj,
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

interface CollectionPreview {
  message: string;
  adjustment: {
    base: number;
    adjusted: number;
    daysDiff: number;
    interest: number;
    fine: number;
    discount: number;
  };
  pixCode: string | null;
  pixQrCodeImage: string | null;
  invoiceUrl: string | null;
  pixError: string | null;
  phone: string | null;
  email: string | null;
}

function InstallmentRow({
  transaction,
  userContact,
  readOnly = false,
  hideCollection = false,
  whatsappConfigured = false,
}: {
  transaction: Transaction;
  userContact?: UserContact;
  readOnly?: boolean;
  hideCollection?: boolean;
  whatsappConfigured?: boolean;
}) {
  const { toast } = useToast();
  const statusInfo = getStatusBadgeVariant(transaction.status, transaction.dueDate);
  const isBackup = transaction.category === "DATABASE_BACKUP";
  const showCollection = !readOnly && !hideCollection && !isBackup;

  const resolvedEmail = userContact?.email || transaction.clientEmail;
  const resolvedPhone = userContact?.phone || transaction.clientWhatsapp;

  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<CollectionPreview | null>(null);
  const [previewChannel, setPreviewChannel] = useState<"email" | "whatsapp" | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const markPaid = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/transactions/${transaction.id}`, { status: "PAID" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      toast({
        title: "Parcela marcada como paga",
        description: `${transaction.description} - Parcela ${transaction.installmentCurrent}/${transaction.installmentTotal}`,
      });
    },
  });

  const generateCollection = useMutation({
    mutationFn: async (): Promise<CollectionPreview> => {
      const res = await apiRequest("POST", `/api/transactions/${transaction.id}/collection-preview`, {});
      return await res.json();
    },
  });

  const sendEmail = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/send-collection-email", { transactionId: transaction.id });
    },
    onSuccess: () => {
      toast({
        title: "Email de cobrança enviado",
        description: `Enviado para ${resolvedEmail}`,
      });
      setPreviewOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao enviar email",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const sendWhatsAppDirect = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/send-whatsapp", { transactionId: transaction.id });
    },
    onSuccess: () => {
      toast({
        title: "WhatsApp enviado",
        description: `Cobrança enviada direto para ${resolvedPhone}`,
      });
      setPreviewOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao enviar WhatsApp",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  async function handleWhatsApp() {
    if (!resolvedPhone) return;
    setPreviewChannel("whatsapp");
    setPreviewOpen(true);
    setPreview(null);
    try {
      const data = await generateCollection.mutateAsync();
      setPreview(data);
    } catch (e: any) {
      toast({
        title: "Erro ao preparar cobrança",
        description: e.message,
        variant: "destructive",
      });
      setPreviewOpen(false);
    }
  }

  async function handleEmail() {
    if (!resolvedEmail) return;
    setPreviewChannel("email");
    setPreviewOpen(true);
    setPreview(null);
    try {
      const data = await generateCollection.mutateAsync();
      setPreview(data);
    } catch (e: any) {
      toast({
        title: "Erro ao preparar cobrança",
        description: e.message,
        variant: "destructive",
      });
      setPreviewOpen(false);
    }
  }

  function confirmWhatsAppRedirect() {
    if (!preview || !resolvedPhone) return;
    const phone = resolvedPhone.replace(/\D/g, "");
    window.open(
      `https://wa.me/${phone}?text=${encodeURIComponent(preview.message)}`,
      "_blank"
    );
    setPreviewOpen(false);
  }

  function confirmEmail() {
    sendEmail.mutate();
  }

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
        {showCollection && transaction.status === "OVERDUE" && (
          <Button
            size="icon"
            variant="ghost"
            disabled={!resolvedPhone || generateCollection.isPending}
            title={!resolvedPhone ? "WhatsApp não cadastrado" : "Enviar WhatsApp"}
            onClick={handleWhatsApp}
            data-testid={`button-whatsapp-${transaction.id}`}
          >
            <MessageCircle className={`h-4 w-4 ${resolvedPhone ? "text-emerald-500" : "text-muted-foreground/30"}`} />
          </Button>
        )}
        {showCollection && transaction.status === "OVERDUE" && (
          <Button
            size="icon"
            variant="ghost"
            disabled={!resolvedEmail || sendEmail.isPending || generateCollection.isPending}
            title={!resolvedEmail ? "Email não cadastrado" : "Enviar Email"}
            onClick={handleEmail}
            data-testid={`button-email-${transaction.id}`}
          >
            <Mail className={`h-4 w-4 ${!resolvedEmail ? "text-muted-foreground/30" : "text-blue-400"}`} />
          </Button>
        )}
        {!readOnly && (
          <Button
            size="icon"
            variant="ghost"
            title="Editar parcela"
            onClick={() => setEditOpen(true)}
            data-testid={`button-edit-transaction-${transaction.id}`}
          >
            <Pencil className="h-4 w-4 text-muted-foreground" />
          </Button>
        )}
        {!readOnly && transaction.status !== "PAID" && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => markPaid.mutate()}
            disabled={markPaid.isPending}
            data-testid={`button-mark-paid-${transaction.id}`}
          >
            {markPaid.isPending ? "..." : isBackup ? "Recebido" : "Pagar"}
          </Button>
        )}
      </div>

      <Dialog
        open={previewOpen}
        onOpenChange={(v) => {
          if (!v) {
            setPreviewOpen(false);
            setPreview(null);
            setPreviewChannel(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" data-testid={`dialog-collection-${transaction.id}`}>
          <DialogHeader>
            <DialogTitle>
              {previewChannel === "whatsapp" ? "Enviar cobrança por WhatsApp" : "Enviar cobrança por Email"}
            </DialogTitle>
            <DialogDescription>
              Valor atualizado com juros, multa ou desconto e código PIX gerado pelo Asaas.
            </DialogDescription>
          </DialogHeader>

          {!preview ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Gerando cobrança e PIX...
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-md bg-muted/50 p-3 space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Valor original</span>
                  <span className="tabular-nums">{formatBRL(preview.adjustment.base)}</span>
                </div>
                {preview.adjustment.daysDiff > 0 && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Dias em atraso</span>
                      <span className="tabular-nums">{preview.adjustment.daysDiff}</span>
                    </div>
                    {preview.adjustment.interest > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Juros</span>
                        <span className="tabular-nums text-red-400">+{formatBRL(preview.adjustment.interest)}</span>
                      </div>
                    )}
                    {preview.adjustment.fine > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Multa</span>
                        <span className="tabular-nums text-red-400">+{formatBRL(preview.adjustment.fine)}</span>
                      </div>
                    )}
                  </>
                )}
                {preview.adjustment.discount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Desconto antecipação</span>
                    <span className="tabular-nums text-emerald-400">-{formatBRL(preview.adjustment.discount)}</span>
                  </div>
                )}
                <div className="border-t pt-1.5 flex justify-between font-semibold">
                  <span>Total a cobrar</span>
                  <span className="tabular-nums text-primary">{formatBRL(preview.adjustment.adjusted)}</span>
                </div>
              </div>

              {preview.pixError && (
                <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-400">
                  PIX não gerado: {preview.pixError}
                </div>
              )}

              {preview.pixCode && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Código PIX (copia e cola)</p>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        navigator.clipboard.writeText(preview.pixCode!);
                        toast({ title: "PIX copiado!" });
                      }}
                      data-testid="button-copy-pix"
                    >
                      <Copy className="h-3.5 w-3.5 mr-1" />
                      Copiar
                    </Button>
                  </div>
                  <div className="rounded-md bg-muted/50 p-2 text-[11px] font-mono break-all max-h-24 overflow-y-auto" data-testid="text-pix-code">
                    {preview.pixCode}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Mensagem</p>
                <div className="rounded-md bg-muted/50 p-3 text-xs whitespace-pre-wrap max-h-48 overflow-y-auto" data-testid="text-collection-message">
                  {preview.message}
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setPreviewOpen(false)} data-testid="button-cancel-collection">
                  Cancelar
                </Button>
                {previewChannel === "whatsapp" ? (
                  <div className="flex flex-1 gap-2">
                    {whatsappConfigured ? (
                      <Button
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => sendWhatsAppDirect.mutate()}
                        disabled={sendWhatsAppDirect.isPending}
                        data-testid="button-send-whatsapp-direct"
                      >
                        <Send className="h-3.5 w-3.5 mr-1.5" />
                        {sendWhatsAppDirect.isPending ? "Enviando..." : "Enviar Agora"}
                      </Button>
                    ) : (
                      <Button
                        className="flex-1"
                        onClick={confirmWhatsAppRedirect}
                        data-testid="button-confirm-whatsapp"
                      >
                        <MessageCircle className="h-3.5 w-3.5 mr-1.5" />
                        Abrir WhatsApp
                      </Button>
                    )}
                  </div>
                ) : (
                  <Button className="flex-1" onClick={confirmEmail} disabled={sendEmail.isPending} data-testid="button-confirm-email">
                    {sendEmail.isPending ? "Enviando..." : "Enviar Email"}
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <EditTransactionDialog transaction={transaction} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  );
}

export function TransactionAccordion({
  transactions,
  allTransactions,
  groupingTransactions,
  usersByGroupId,
  readOnly = false,
  hideCollection = false,
}: TransactionAccordionProps) {
  const groups = groupTransactions(transactions, allTransactions, groupingTransactions);

  const { data: config } = useQuery<{ whatsappConfigured: boolean; asaasConfigured: boolean }>({
    queryKey: ["/api/config"],
    enabled: !readOnly && !hideCollection,
    staleTime: 60_000,
  });
  const whatsappConfigured = config?.whatsappConfigured ?? false;

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
                        {project.clientCpfCnpj && (
                          <p className="text-xs text-primary/80 mt-1">
                            Empresa atendida · CNPJ: {project.clientCpfCnpj}
                          </p>
                        )}
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
                      {project.transactions.length > 0 ? (
                        project.transactions.map((txn) => (
                          <InstallmentRow
                            key={txn.id}
                            transaction={txn}
                            userContact={userContact}
                            readOnly={readOnly}
                            hideCollection={hideCollection}
                            whatsappConfigured={whatsappConfigured}
                          />
                        ))
                      ) : (
                        <p className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                          Nenhuma parcela a receber neste mês ou em atraso.
                        </p>
                      )}
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
