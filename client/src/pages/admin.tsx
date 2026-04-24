import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/components/theme-provider";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Receipt,
  Moon,
  Sun,
  Plus,
  Trash2,
  Users,
  LayoutDashboard,
  LogOut,
  Pencil,
  Mail,
  Phone,
  FolderOpen,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createUserSchema, type CreateUserInput } from "@shared/schema";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

interface SafeUser {
  id: string;
  username: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: "admin" | "user";
  groupIds: string[] | null;
}

interface Group {
  groupId: string;
  description: string;
  client: string;
}

function GroupsSelector({
  groups,
  selected,
  onChange,
}: {
  groups: Group[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((x) => x !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        Nenhum projeto disponível
      </p>
    );
  }

  return (
    <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
      {groups.map((g) => (
        <label
          key={g.groupId}
          className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/40 transition-colors"
          data-testid={`checkbox-group-${g.groupId}`}
        >
          <Checkbox
            checked={selected.includes(g.groupId)}
            onCheckedChange={() => toggle(g.groupId)}
            className="mt-0.5"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium leading-tight">{g.description}</p>
            <p className="text-xs text-muted-foreground">{g.client}</p>
          </div>
        </label>
      ))}
    </div>
  );
}

function CreateUserDialog({ groups }: { groups: Group[] }) {
  const [open, setOpen] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const { toast } = useToast();

  const form = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      username: "",
      password: "",
      name: "",
      email: "",
      phone: "",
      groupIds: [],
    },
  });

  const createUser = useMutation({
    mutationFn: async (data: CreateUserInput) => {
      const res = await apiRequest("POST", "/api/users", {
        ...data,
        groupIds: selectedGroups,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Usuário criado com sucesso" });
      setOpen(false);
      form.reset();
      setSelectedGroups([]);
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao criar usuário",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { form.reset(); setSelectedGroups([]); } }}>
      <DialogTrigger asChild>
        <Button data-testid="button-create-user">
          <Plus className="h-4 w-4 mr-1.5" />
          Novo Usuário
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Criar Usuário</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((data) => createUser.mutate(data))}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome</FormLabel>
                    <FormControl>
                      <Input placeholder="Nome completo" data-testid="input-user-name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Usuário</FormLabel>
                    <FormControl>
                      <Input placeholder="login" data-testid="input-user-username" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Senha</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="Mínimo 4 caracteres" data-testid="input-user-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email de cobrança</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="email@exemplo.com" data-testid="input-user-email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>WhatsApp</FormLabel>
                    <FormControl>
                      <Input placeholder="11999999999" data-testid="input-user-phone" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Projetos vinculados</Label>
              <GroupsSelector
                groups={groups}
                selected={selectedGroups}
                onChange={setSelectedGroups}
              />
              {selectedGroups.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {selectedGroups.length} projeto(s) selecionado(s)
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                data-testid="button-cancel-create-user"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createUser.isPending}
                data-testid="button-submit-create-user"
              >
                {createUser.isPending ? "Criando..." : "Criar"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({ user, groups }: { user: SafeUser; groups: Group[] }) {
  const [open, setOpen] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<string[]>(user.groupIds || []);
  const [name, setName] = useState(user.name || "");
  const [email, setEmail] = useState(user.email || "");
  const [phone, setPhone] = useState(user.phone || "");
  const [password, setPassword] = useState("");
  const { toast } = useToast();

  const handleOpen = (v: boolean) => {
    if (v) {
      setSelectedGroups(user.groupIds || []);
      setName(user.name || "");
      setEmail(user.email || "");
      setPhone(user.phone || "");
      setPassword("");
    }
    setOpen(v);
  };

  const updateUser = useMutation({
    mutationFn: async () => {
      const payload: any = {
        name,
        email,
        phone,
        groupIds: selectedGroups,
      };
      if (password) payload.password = password;
      const res = await apiRequest("PATCH", `/api/users/${user.id}`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Usuário atualizado com sucesso" });
      setOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar usuário",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" title="Editar usuário" data-testid={`button-edit-user-${user.id}`}>
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar — {user.name || user.username}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome completo"
                data-testid="input-edit-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Nova senha (opcional)</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Deixe em branco para manter"
                data-testid="input-edit-password"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Email de cobrança</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@exemplo.com"
                data-testid="input-edit-email"
              />
            </div>
            <div className="space-y-1.5">
              <Label>WhatsApp</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="11999999999"
                data-testid="input-edit-phone"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Projetos vinculados</Label>
            <GroupsSelector
              groups={groups}
              selected={selectedGroups}
              onChange={setSelectedGroups}
            />
            {selectedGroups.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {selectedGroups.length} projeto(s) selecionado(s)
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} data-testid="button-cancel-edit">
              Cancelar
            </Button>
            <Button onClick={() => updateUser.mutate()} disabled={updateUser.isPending} data-testid="button-confirm-edit">
              {updateUser.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Admin() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: userList = [], isLoading: loadingUsers } = useQuery<SafeUser[]>({
    queryKey: ["/api/users"],
  });

  const { data: groups = [] } = useQuery<Group[]>({
    queryKey: ["/api/groups"],
  });

  const deleteUser = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/users/${id}`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Usuário removido" });
    },
    onError: () => {
      toast({ title: "Erro ao remover usuário", variant: "destructive" });
    },
  });

  const handleLogout = async () => {
    await logout();
    setLocation("/login");
  };

  const regularUsers = userList.filter((u) => u.role === "user");

  return (
    <div className="min-h-screen bg-background" data-testid="page-admin">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="bg-primary/10 p-1.5 rounded-md">
              <Receipt className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold leading-tight" data-testid="text-admin-title">
                Painel Administrativo
              </h1>
              <p className="text-[11px] text-muted-foreground leading-tight hidden sm:block">
                {user?.name || user?.username}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setLocation("/")}
              data-testid="button-go-dashboard"
            >
              <LayoutDashboard className="h-4 w-4 mr-1.5" />
              <span className="hidden sm:inline">Dashboard</span>
            </Button>
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

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold" data-testid="text-users-section-title">
              Usuários
            </h2>
            <Badge variant="secondary">{regularUsers.length}</Badge>
          </div>
          <CreateUserDialog groups={groups} />
        </div>

        {loadingUsers ? (
          <div className="text-sm text-muted-foreground py-8 text-center">Carregando usuários...</div>
        ) : regularUsers.length === 0 ? (
          <div className="border rounded-lg py-12 text-center" data-testid="text-no-users">
            <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Nenhum usuário cadastrado</p>
            <p className="text-xs text-muted-foreground mt-1">
              Crie um usuário e vincule projetos a ele
            </p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome / Usuário</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Projetos vinculados</TableHead>
                  <TableHead className="w-24 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {regularUsers.map((u) => {
                  const linkedGroups = groups.filter((g) => u.groupIds?.includes(g.groupId));
                  return (
                    <TableRow key={u.id} data-testid={`row-user-${u.id}`}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{u.name || u.username}</p>
                          {u.name && (
                            <p className="text-xs text-muted-foreground">@{u.username}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5">
                          {u.email ? (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Mail className="h-3 w-3" />
                              <span className="truncate max-w-[140px]">{u.email}</span>
                            </div>
                          ) : null}
                          {u.phone ? (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Phone className="h-3 w-3" />
                              <span>{u.phone}</span>
                            </div>
                          ) : null}
                          {!u.email && !u.phone && (
                            <span className="text-xs text-muted-foreground italic">Sem contato</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {linkedGroups.length > 0 ? (
                          <div className="space-y-1">
                            {linkedGroups.map((g) => (
                              <div key={g.groupId} className="flex items-center gap-1.5">
                                <FolderOpen className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                <div>
                                  <span className="text-xs font-medium">{g.description}</span>
                                  <span className="text-xs text-muted-foreground ml-1">— {g.client}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">
                            Nenhum projeto
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <EditUserDialog user={u} groups={groups} />
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => deleteUser.mutate(u.id)}
                            disabled={deleteUser.isPending}
                            title="Remover usuário"
                            data-testid={`button-delete-user-${u.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="border rounded-lg p-4 bg-muted/20">
          <p className="text-xs text-muted-foreground">
            <strong>Como funciona:</strong> Crie um usuário, informe o email e WhatsApp para cobrança, e vincule um ou mais projetos. O usuário verá apenas as parcelas dos projetos vinculados. Os botões de cobrança usarão o email e telefone cadastrados aqui.
          </p>
        </div>
      </main>
    </div>
  );
}
