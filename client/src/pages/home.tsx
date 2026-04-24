import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardCards } from "@/components/dashboard-cards";
import { TransactionAccordion } from "@/components/transaction-accordion";
import { SaasRenewals } from "@/components/saas-renewals";
import { CreateTransactionDialog } from "@/components/create-transaction-dialog";
import { useTheme } from "@/components/theme-provider";
import { useAuth } from "@/hooks/use-auth";
import { Plus, Moon, Sun, Receipt, Users, LogOut } from "lucide-react";
import type { Transaction } from "@shared/schema";

interface SafeUser {
  id: string;
  username: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: "admin" | "user";
  groupIds: string[] | null;
}

export default function Home() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();

  const { data: transactions = [], isLoading } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions"],
  });

  const { data: userList = [] } = useQuery<SafeUser[]>({
    queryKey: ["/api/users"],
  });

  // Build a map of groupId -> user contact for collection buttons
  const usersByGroupId: Record<string, { email: string | null; phone: string | null; name: string | null }> = {};
  for (const u of userList) {
    if (u.role === "user" && u.groupIds) {
      for (const gid of u.groupIds) {
        usersByGroupId[gid] = { email: u.email, phone: u.phone, name: u.name };
      }
    }
  }

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
    <div className="min-h-screen bg-background" data-testid="page-home">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm" data-testid="header-main">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="bg-primary/10 p-1.5 rounded-md">
              <Receipt className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold leading-tight" data-testid="text-app-title">
                Contas a Receber
              </h1>
              <p className="text-[11px] text-muted-foreground leading-tight hidden sm:block" data-testid="text-app-subtitle">
                {user?.name || user?.username}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setLocation("/admin")}
              data-testid="button-go-admin"
            >
              <Users className="h-4 w-4 mr-1.5" />
              <span className="hidden sm:inline">Usuários</span>
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={toggleTheme}
              data-testid="button-theme-toggle"
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
            <Button
              onClick={() => setDialogOpen(true)}
              data-testid="button-new-receivable"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              <span className="hidden sm:inline">Novo Recebível</span>
              <span className="sm:hidden">Novo</span>
            </Button>
            <Button
              size="icon"
              variant="outline"
              onClick={handleLogout}
              data-testid="button-logout"
              title="Sair"
            >
              <LogOut className="h-4 w-4" />
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
                      Projetos
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="upcoming">
                    <TransactionAccordion
                      transactions={next30Days}
                      allTransactions={transactions}
                      usersByGroupId={usersByGroupId}
                    />
                  </TabsContent>

                  <TabsContent value="overdue">
                    {overdue.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <p className="text-sm">Nenhuma parcela em atraso</p>
                      </div>
                    ) : (
                      <TransactionAccordion
                        transactions={overdue}
                        allTransactions={transactions}
                        usersByGroupId={usersByGroupId}
                      />
                    )}
                  </TabsContent>

                  <TabsContent value="projects">
                    <TransactionAccordion
                      transactions={activeProjects}
                      allTransactions={transactions}
                      usersByGroupId={usersByGroupId}
                    />
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

      <CreateTransactionDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
