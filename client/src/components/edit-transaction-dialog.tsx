import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Transaction } from "@shared/schema";

interface EditTransactionDialogProps {
  transaction: Transaction;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function inputDate(value: string | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function EditTransactionDialog({
  transaction,
  open,
  onOpenChange,
}: EditTransactionDialogProps) {
  const { toast } = useToast();
  const [description, setDescription] = useState(transaction.description);
  const [client, setClient] = useState(transaction.client);
  const [clientCpfCnpj, setClientCpfCnpj] = useState(transaction.clientCpfCnpj || "");
  const [clientEmail, setClientEmail] = useState(transaction.clientEmail || "");
  const [clientWhatsapp, setClientWhatsapp] = useState(transaction.clientWhatsapp || "");
  const [amount, setAmount] = useState(String(transaction.amount));
  const [dueDate, setDueDate] = useState(inputDate(transaction.dueDate));
  const [status, setStatus] = useState(transaction.status);

  useEffect(() => {
    if (!open) return;
    setDescription(transaction.description);
    setClient(transaction.client);
    setClientCpfCnpj(transaction.clientCpfCnpj || "");
    setClientEmail(transaction.clientEmail || "");
    setClientWhatsapp(transaction.clientWhatsapp || "");
    setAmount(String(transaction.amount));
    setDueDate(inputDate(transaction.dueDate));
    setStatus(transaction.status);
  }, [open, transaction]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!description.trim() || !client.trim()) {
        throw new Error("Descrição e cliente são obrigatórios");
      }
      if (transaction.category === "DATABASE_BACKUP" && !clientCpfCnpj.trim()) {
        throw new Error("CNPJ é obrigatório para backups");
      }
      const numericAmount = Number(amount);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        throw new Error("Valor deve ser positivo");
      }
      await apiRequest("PATCH", `/api/transactions/${transaction.id}`, {
        description: description.trim(),
        client: client.trim(),
        clientCpfCnpj: clientCpfCnpj.trim(),
        clientEmail: clientEmail.trim(),
        clientWhatsapp: clientWhatsapp.trim(),
        amount: numericAmount,
        dueDate,
        status,
        updateClientGroup: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      toast({ title: "Parcela atualizada", description: "Os dados do cliente foram atualizados no grupo." });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Não foi possível atualizar", description: error.message, variant: "destructive" });
    },
  });

  const isBackup = transaction.category === "DATABASE_BACKUP";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar parcela</DialogTitle>
          <DialogDescription>
            Altere a parcela. No backup, o cliente é a empresa pagadora e o CNPJ identifica a empresa atendida.
            Os dados cadastrais serão aplicados às demais parcelas mensais deste backup.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor={`edit-description-${transaction.id}`}>
                {isBackup ? "Identificação do backup / empresa atendida" : "Descrição"}
              </Label>
              <Input id={`edit-description-${transaction.id}`} value={description} onChange={(event) => setDescription(event.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor={`edit-client-${transaction.id}`}>
                {isBackup ? "Cliente / Empresa pagadora" : "Cliente / Empresa"}
              </Label>
              <Input id={`edit-client-${transaction.id}`} value={client} onChange={(event) => setClient(event.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor={`edit-cnpj-${transaction.id}`}>
                {isBackup ? "CNPJ da empresa atendida" : "CPF / CNPJ"}
              </Label>
              <Input
                id={`edit-cnpj-${transaction.id}`}
                value={clientCpfCnpj}
                onChange={(event) => setClientCpfCnpj(event.target.value)}
                placeholder="00.000.000/0000-00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`edit-email-${transaction.id}`}>Email</Label>
              <Input id={`edit-email-${transaction.id}`} type="email" value={clientEmail} onChange={(event) => setClientEmail(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`edit-whatsapp-${transaction.id}`}>WhatsApp</Label>
              <Input id={`edit-whatsapp-${transaction.id}`} value={clientWhatsapp} onChange={(event) => setClientWhatsapp(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`edit-amount-${transaction.id}`}>Valor da parcela</Label>
              <Input id={`edit-amount-${transaction.id}`} type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`edit-date-${transaction.id}`}>Vencimento</Label>
              <Input id={`edit-date-${transaction.id}`} type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as Transaction["status"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDING">Pendente</SelectItem>
                  <SelectItem value="OVERDUE">Em atraso</SelectItem>
                  <SelectItem value="PAID">Pago</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button className="flex-1" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Salvando..." : "Salvar alterações"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}