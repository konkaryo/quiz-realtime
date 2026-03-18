import { createContext, useContext, useEffect, useState } from "react";
import { fetchMe } from "./client";

type User = { id: string; email: string; name: string } | null;

type AuthCtx = {
  user: User;
  loading: boolean;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({ user: null, loading: true, refresh: async () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    const data = await fetchMe(); // { user } ou null
    setUser(data?.user ?? null);
    setLoading(false);
  }

  useEffect(() => { void refresh(); }, []);

  return <Ctx.Provider value={{ user, loading, refresh }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}
