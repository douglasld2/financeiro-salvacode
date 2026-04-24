import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardCards } from "@/components/dashboard-cards";
import { TransactionAccordion } from "@/components/transaction-accordion";
import { SaasRenewals } from "@/components/saas-renewals";
import { Receipt, Moon, Sun, LogOut } from "lucide-react";
import type { Transaction } from "@shared/schema";

export default function UserProject() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [, setLocation] = useLocation();

  const { data: transactions = [], isLoading } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions"],
  });

  const now = new Date();
  const thirtyDaysFromNow = new Date(now);
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  const next30Days = transactions.filter((t) => {
    const due = new Date(t.dueDate);
    return t.status === "PENDING" && due >= now && due <= thirtyDaysFromNow;
  });

  const overdue = transactions.filter((t) => t.status === "OVERDUE");
  const activeProjects = transactions.filter((t) => t.status !== "PAID");

  const handleLogout = async () => {
    await logout();
    setLocation("/login");
  };

  return (
    <div className="min-h-screen bg-background" data-testid="page-user-project">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="bg-primary/10 p-1.5 rounded-md">
              <Receipt className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold leading-tight" data-testid="text-user-project-title">
                Meu Projeto
              </h1>
              <p className="text-[11px] text-muted-foreground leading-tight hidden sm:block">
                {user?.name || user?.username}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              onClick={toggleTheme}
              data-testid="button-theme-toggle"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleLogout}
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4 mr-1.5" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {isLoading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-md" />
              ))}
            </div>
            <Skeleton className="h-10 w-80 rounded-md" />
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-md" />
              ))}
            </div>
          </div>
        ) : transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground">
            <Receipt className="h-14 w-14 mb-4 opacity-20" />
            <p className="text-base font-medium">Nenhum projeto vinculado</p>
            <p className="text-sm mt-1">
              Entre em contato com o administrador para vincular um projeto à sua conta.
            </p>
          </div>
        ) : (
          <>
            <DashboardCards transactions={transactions} />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <Tabs defaultValue="upcoming" className="space-y-4">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="upcoming" data-testid="tab-upcoming">
                      A Receber
                      {next30Days.length > 0 && (
                        <span className="ml-1.5 text-[11px] bg-blue-500/15 text-blue-400 px-1.5 py-0.5 rounded-sm">
                          {next30Days.length}
                        </span>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="overdue" data-testid="tab-overdue">
                      Em Atraso
                      {overdue.length > 0 && (
                        <span className="ml-1.5 text-[11px] bg-red-500/15 text-red-400 px-1.5 py-0.5 rounded-sm">
                          {overdue.length}
                        </span>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="projects" data-testid="tab-projects">
                      Parcelas
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="upcoming">
                    <TransactionAccordion transactions={next30Days} allTransactions={transactions} />
                  </TabsContent>
                  <TabsContent value="overdue">
                    {overdue.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <p className="text-sm">Nenhuma parcela em atraso</p>
                      </div>
                    ) : (
                      <TransactionAccordion transactions={overdue} allTransactions={transactions} />
                    )}
                  </TabsContent>
                  <TabsContent value="projects">
                    <TransactionAccordion transactions={activeProjects} allTransactions={transactions} />
                  </TabsContent>
                </Tabs>
              </div>

              <div>
                <SaasRenewals transactions={transactions} />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
