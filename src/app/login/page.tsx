"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(traduzErro(error.message));
      setLoading(false);
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  function traduzErro(msg: string) {
    if (msg.includes("Invalid login credentials")) return "E-mail ou senha incorretos.";
    return msg;
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-2xl font-bold text-[var(--color-sixxis-navy)]">
          Painel Sixxis
        </h1>
        <p className="mb-6 text-sm text-gray-500">Entre com sua conta</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            type="password"
            placeholder="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded bg-[var(--color-sixxis-navy)] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {loading ? "Aguarde..." : "Entrar"}
          </button>
        </form>

        <p className="mt-4 text-xs text-gray-400">
          Acesso apenas por convite. Fale com o administrador para receber um login.
        </p>
      </div>
    </main>
  );
}
