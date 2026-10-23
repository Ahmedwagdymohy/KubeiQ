"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { AuthGate } from "@/components/auth/auth-gate";
import { AppShell } from "@/components/shell/app-shell";

export function Providers({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <AuthGate>{pathname === "/login" ? children : <AppShell>{children}</AppShell>}</AuthGate>
    </QueryClientProvider>
  );
}
