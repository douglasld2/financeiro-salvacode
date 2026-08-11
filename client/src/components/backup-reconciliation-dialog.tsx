import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";

interface ReconciliationRow {
  cnpj: string;
  monthYear: string | Date;
  paid: boolean;
}

interface ReconciliationResult {
  processed: number;
  updated: number;
  alreadyPaid: number;
  ignored: number;
  notFound: string[];
  invalid: string[];
}

function headerKey(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function paidValue(value: unknown): boolean | null {
  const normalized = headerKey(value);
  if (["sim", "s", "yes", "y", "true", "1", "pago", "paid"].includes(normalized)) return true;
  if (["nao", "n", "no", "false", "0", "pendente", "unpaid"].includes(normalized)) return false;
  return null;
}

function monthYearValue(value: unknown): string | Date {
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${String(parsed.m).padStart(2, "0")}/${parsed.y}`;
  }
  return String(value ?? "").trim();
}

interface BackupReconciliationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BackupReconciliationDialog({ open, onOpenChange }: BackupReconciliationDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ReconciliationRow[]>([]);
  const [parseError, setParseError] = useState("");
  const [result, setResult] = useState<ReconciliationResult | null>(null);

  const reconcileMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/backups/reconcile", { rows });
      return await response.json() as ReconciliationResult;
    },
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      toast({ title: "Conciliação concluída", description: `${data.updated} parcela(s) marcada(s) como paga(s).` });
    },
    onError: (error: Error) => toast({ title: "Erro na conciliação", description: error.message, variant: "destructive" }),
  });

  function reset() {
    setFileName("");
    setRows([]);
    setParseError("");
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function close(value: boolean) {
    if (!value) reset();
    onOpenChange(value);
  }

  async function handleFile(file?: File) {
    if (!file) return;
    setFileName(file.name);
    setParseError("");
    setResult(null);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new Error("A planilha não possui uma aba.");
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      if (raw.length === 0) throw new Error("A planilha não possui linhas.");

      const firstRow = raw[0];
      const keys = Object.keys(firstRow);
      const cnpjKey = keys.find((key) => ["cnpj", "documento", "cpfcnpj"].includes(headerKey(key)));
      const monthKey = keys.find((key) => ["mesano", "mes", "competencia", "mescompetencia"].includes(headerKey(key)));
      const paidKey = keys.find((key) => ["pago", "pagamento", "status"].includes(headerKey(key)));
      if (!cnpjKey || !monthKey || !paidKey) {
        throw new Error("Use as colunas CNPJ, MES/ANO e PAGO.");
      }

      const parsedRows: ReconciliationRow[] = [];
      for (const row of raw) {
        const paid = paidValue(row[paidKey]);
        if (paid === null) throw new Error(`Valor de PAGO inválido: "${String(row[paidKey])}". Use SIM ou NÃO.`);
        parsedRows.push({
          cnpj: String(row[cnpjKey] ?? "").trim(),
          monthYear: monthYearValue(row[monthKey]),
          paid,
        });
      }
      setRows(parsedRows);
    } catch (error: any) {
      setRows([]);
      setParseError(error?.message || "Não foi possível ler a planilha.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Conciliar pagamentos via Excel</DialogTitle>
          <DialogDescription>
            Envie uma planilha com as colunas CNPJ, MES/ANO e PAGO. Apenas linhas marcadas como SIM serão conciliadas.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => handleFile(event.target.files?.[0])} />
          <Button variant="outline" className="w-full h-24 border-dashed" onClick={() => inputRef.current?.click()}>
            <Upload className="h-5 w-5 mr-2" />
            {fileName ? fileName : "Selecionar arquivo Excel"}
          </Button>
          <p className="text-xs text-muted-foreground">Formato aceito para MES/ANO: 01/2026 ou uma data do Excel.</p>

          {parseError && <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">{parseError}</div>}

          {rows.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium flex items-center gap-2"><FileSpreadsheet className="h-4 w-4 text-emerald-400" /> Prévia ({rows.length} linhas)</p>
                <Badge variant="secondary">Pronto para conciliar</Badge>
              </div>
              <div className="rounded-md border overflow-hidden">
                <div className="grid grid-cols-3 gap-2 bg-muted/40 px-3 py-2 text-xs font-medium">
                  <span>CNPJ</span><span>Mês/Ano</span><span>Pago</span>
                </div>
                <div className="max-h-48 overflow-y-auto divide-y">
                  {rows.slice(0, 100).map((row, index) => (
                    <div className="grid grid-cols-3 gap-2 px-3 py-2 text-xs" key={`${row.cnpj}-${index}`}>
                      <span className="truncate">{row.cnpj || "—"}</span>
                      <span>{row.monthYear instanceof Date ? row.monthYear.toLocaleDateString("pt-BR") : row.monthYear || "—"}</span>
                      <span className={row.paid ? "text-emerald-400" : "text-muted-foreground"}>{row.paid ? "Sim" : "Não"}</span>
                    </div>
                  ))}
                </div>
              </div>
              {rows.length > 100 && <p className="text-xs text-muted-foreground">Exibindo as primeiras 100 linhas. Todas as {rows.length} linhas serão processadas.</p>}
            </div>
          )}

          {result && (
            <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-2 text-sm">
              <p className="font-medium flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> Resultado da conciliação</p>
              <p>{result.updated} atualizada(s) · {result.alreadyPaid} já paga(s) · {result.ignored} ignorada(s)</p>
              {result.notFound.length > 0 && <p className="text-amber-400">{result.notFound.length} referência(s) não encontrada(s).</p>}
              {result.invalid.length > 0 && <p className="text-red-400">{result.invalid.length} linha(s) inválida(s).</p>}
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => close(false)}>Fechar</Button>
            <Button className="flex-1" onClick={() => reconcileMutation.mutate()} disabled={rows.length === 0 || reconcileMutation.isPending}>
              {reconcileMutation.isPending ? "Conciliando..." : "Conciliar pagamentos"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}