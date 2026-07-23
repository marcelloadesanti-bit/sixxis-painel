"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(traduzErro(error.message));
        setLoading(false);
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (error) {
        setError(traduzErro(error.message));
        setLoading(false);
        return;
      }
      setInfo(
        "Conta criada. Se a confirmação por e-mail estiver ativa no Supabase, verifique sua caixa de entrada antes de entrar."
      );
      setLoading(false);
    }
  }

  function traduzErro(msg: string) {
    if (msg.includes("Invalid login credentials")) return "E-mail ou senha incorretos.";
    if (msg.includes("User already registered")) return "Já existe uma conta com esse e-mail.";
    if (msg.includes("Password should be")) return "A senha precisa ter pelo menos 6 caracteres.";
    return msg;
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-2xl font-bold text-[var(--color-sixxis-navy)]">
          Painel Sixxis
        </h1>
        <p className="mb-6 text-sm text-gray-500">
          {mode === "login" ? "Entre com sua conta" : "Criar conta (uso interno Sixxis)"}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {mode === "signup" && (
            <input
              type="text"
              placeholder="Seu nome"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
          )}
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
          {info && <p className="text-sm text-green-700">{info}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded bg-[var(--color-sixxis-navy)] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {loading ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar conta"}
          </button>
        </form>

        <button
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setError(null);
            setInfo(null);
          }}
          className="mt-4 text-sm text-[var(--color-sixxis-blue)] underline"
        >
          {mode === "login"
            ? "Ainda não tem conta? Criar acesso"
            : "Já tem conta? Entrar"}
        </button>
      </div>
    </main>
  );
}
