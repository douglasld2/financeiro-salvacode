import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Layers, RefreshCw, FileText, Mail, MessageCircle, Database } from "lucide-react";

interface CreateTransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCategory?: CategoryType;
}

type CategoryType = "PROJECT_INSTALLMENT" | "SAAS_SUBSCRIPTION" | "RETAINER_FEE" | "DATABASE_BACKUP";

const formSchema = z.object({
  description: z.string().min(1, "Descrição é obrigatória"),
  client: z.string().min(1, "Cliente é obrigatório"),
  clientEmail: z.string().email("Email inválido").optional().or(z.literal("")),
  clientWhatsapp: z.string().optional().or(z.literal("")),
  clientCpfCnpj: z.string().optional().or(z.literal("")),
  totalAmount: z.string().min(1, "Valor é obrigatório").refine(
    (val) => parseFloat(val) > 0,
    "Valor deve ser positivo"
  ),
  startDate: z.string().min(1, "Data de início é obrigatória"),
  installments: z.string().optional(),
  repeatMonths: z.string().optional(),
  indefinite: z.boolean().default(false),
  interestRate: z.string().optional(),
  lateFee: z.string().optional(),
  earlyDiscount: z.string().optional(),
  earlyDiscountDays: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function CreateTransactionDialog({
  open,
  onOpenChange,
  defaultCategory,
}: CreateTransactionDialogProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<1 | 2>(defaultCategory ? 2 : 1);
  const [category, setCategory] = useState<CategoryType | null>(defaultCategory ?? null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      description: "",
      client: "",
      clientEmail: "",
      clientWhatsapp: "",
      clientCpfCnpj: "",
      totalAmount: "",
      startDate: (() => {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      })(),
      installments: "3",
      repeatMonths: "12",
      indefinite: false,
      interestRate: "1.00",
      lateFee: "2.00",
      earlyDiscount: "0.00",
      earlyDiscountDays: "7",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      await apiRequest("POST", "/api/transactions", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      toast({
        title: "Recebíveis criados com sucesso",
        description: `${form.getValues("description")} para ${form.getValues("client")}`,
      });
      resetForm();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao criar recebíveis",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  function resetForm() {
    setStep(defaultCategory ? 2 : 1);
    setCategory(defaultCategory ?? null);
    form.reset();
  }

  function onSubmit(values: FormValues) {
    if (!category) return;

    const data: Record<string, unknown> = {
      description: values.description,
      client: values.client,
      clientEmail: values.clientEmail || "",
      clientWhatsapp: values.clientWhatsapp || "",
      clientCpfCnpj: values.clientCpfCnpj || "",
      category,
      totalAmount: parseFloat(values.totalAmount),
      startDate: values.startDate,
    };

    if (category === "PROJECT_INSTALLMENT") {
      data.installments = Number(values.installments || "3");
    } else {
      data.indefinite = values.indefinite;
      data.repeatMonths = values.indefinite ? 12 : Number(values.repeatMonths || "12");
    }

    if (category !== "DATABASE_BACKUP") {
      data.interestRate = parseFloat(values.interestRate || "1") || 0;
      data.lateFee = parseFloat(values.lateFee || "2") || 0;
      data.earlyDiscount = parseFloat(values.earlyDiscount || "0") || 0;
      data.earlyDiscountDays = Number(values.earlyDiscountDays || "7") || 0;
    }

    createMutation.mutate(data);
  }

  const categoryOptions = [
    {
      value: "PROJECT_INSTALLMENT" as CategoryType,
      label: "Projeto Parcelado",
      desc: "Divide o valor total em parcelas mensais",
      icon: Layers,
    },
    {
      value: "SAAS_SUBSCRIPTION" as CategoryType,
      label: "Assinatura SaaS",
      desc: "Valor fixo recorrente mensal",
      icon: RefreshCw,
    },
    {
      value: "RETAINER_FEE" as CategoryType,
      label: "Mensalidade / Retainer",
      desc: "Contrato fixo mensal de serviço",
      icon: FileText,
    },
    {
      value: "DATABASE_BACKUP" as CategoryType,
      label: "Backup de Banco",
      desc: "Recebimento mensal de empresa terceira",
      icon: Database,
    },
  ];

  const watchAmount = form.watch("totalAmount");
  const watchInstallments = form.watch("installments") || "3";
  const watchIndefinite = form.watch("indefinite");

  const isBackup = category === "DATABASE_BACKUP";

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetForm();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto" data-testid="dialog-create-transaction">
        <DialogHeader>
          <DialogTitle data-testid="text-dialog-title">
            {step === 1 ? "Novo Recebível" : "Detalhes do Recebível"}
          </DialogTitle>
          <DialogDescription data-testid="text-dialog-description">
            {step === 1
              ? "Escolha o tipo de recebível que deseja criar"
              : "Preencha as informações do recebível"}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-2 pt-2" data-testid="step-1-categories">
            {categoryOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  setCategory(opt.value);
                  setStep(2);
                }}
                className={`w-full flex items-center gap-3 p-3 rounded-md border text-left transition-colors hover-elevate ${
                  category === opt.value
                    ? "border-primary bg-primary/5"
                    : "border-border"
                }`}
                data-testid={`button-category-${opt.value}`}
              >
                <div className="bg-primary/10 p-2 rounded-md flex-shrink-0">
                  <opt.icon className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">{opt.label}</p>
                  <p className="text-xs text-muted-foreground">{opt.desc}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {step === 2 && category && (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2" data-testid="form-create-transaction">
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={isBackup ? "Ex: Backup Banco Cliente X" : "Ex: Site Institucional, Plano Pro..."}
                        {...field}
                        data-testid="input-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="client"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{isBackup ? "Cliente / Empresa pagadora" : "Cliente"}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={isBackup ? "Nome do cliente ou empresa que paga" : "Nome do cliente"}
                        {...field}
                        data-testid="input-client"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {!isBackup && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="clientEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-1.5">
                            <Mail className="h-3.5 w-3.5" />
                            Email
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="email"
                              placeholder="cliente@email.com"
                              {...field}
                              data-testid="input-client-email"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="clientWhatsapp"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-1.5">
                            <MessageCircle className="h-3.5 w-3.5" />
                            WhatsApp
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="tel"
                              placeholder="5511999999999"
                              {...field}
                              data-testid="input-client-whatsapp"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="clientCpfCnpj"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>CPF / CNPJ (necessário para PIX via Asaas)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="000.000.000-00 ou 00.000.000/0000-00"
                            {...field}
                            data-testid="input-client-cpf-cnpj"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              <FormField
                control={form.control}
                name="totalAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {category === "PROJECT_INSTALLMENT"
                        ? "Valor Total do Projeto"
                        : "Valor Mensal"}
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                          R$
                        </span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0,00"
                          className="pl-10"
                          {...field}
                          data-testid="input-amount"
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data de Início</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        data-testid="input-start-date"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {category === "PROJECT_INSTALLMENT" && (
                <FormField
                  control={form.control}
                  name="installments"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Número de Parcelas</FormLabel>
                      <Select
                        value={field.value ?? "3"}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-installments">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => (
                            <SelectItem key={n} value={String(n)}>
                              {n}x
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {category !== "PROJECT_INSTALLMENT" && (
                <>
                  <FormField
                    control={form.control}
                    name="indefinite"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center gap-3">
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-indefinite"
                            />
                          </FormControl>
                          <Label className="cursor-pointer">
                            Indeterminado (gera 12 meses)
                          </Label>
                        </div>
                      </FormItem>
                    )}
                  />

                  {!watchIndefinite && (
                    <FormField
                      control={form.control}
                      name="repeatMonths"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Repetir por X meses</FormLabel>
                          <Select
                            value={field.value ?? "12"}
                            onValueChange={field.onChange}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-repeat-months">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {Array.from({ length: 36 }, (_, i) => i + 1).map(
                                (n) => (
                                  <SelectItem key={n} value={String(n)}>
                                    {n} {n === 1 ? "mês" : "meses"}
                                  </SelectItem>
                                )
                              )}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </>
              )}

              {!isBackup && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Juros, multa e desconto
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <FormField
                        control={form.control}
                        name="interestRate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Juros (% ao mês)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                {...field}
                                data-testid="input-interest-rate"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="lateFee"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Multa (% fixa)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                {...field}
                                data-testid="input-late-fee"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="earlyDiscount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Desconto (%)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                {...field}
                                data-testid="input-early-discount"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="earlyDiscountDays"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Se pagar X+ dias antes</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="1"
                                min="0"
                                {...field}
                                data-testid="input-early-discount-days"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </>
              )}

              {category === "PROJECT_INSTALLMENT" && watchAmount && watchInstallments && (
                <div className="rounded-md bg-muted/50 p-3" data-testid="text-installment-preview">
                  <p className="text-xs text-muted-foreground">
                    Valor por parcela
                  </p>
                  <p className="text-lg font-semibold text-primary">
                    {(parseFloat(watchAmount) / parseInt(watchInstallments)).toLocaleString(
                      "pt-BR",
                      { style: "currency", currency: "BRL" }
                    )}
                  </p>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                {!defaultCategory && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep(1)}
                    className="flex-1"
                    data-testid="button-back"
                  >
                    Voltar
                  </Button>
                )}
                <Button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="flex-1"
                  data-testid="button-submit"
                >
                  {createMutation.isPending ? "Criando..." : "Criar Recebíveis"}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
