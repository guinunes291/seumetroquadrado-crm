"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Enquanto houver vídeo em geração, recarrega os dados da página de tempos em
// tempos. Cada recarga só pergunta ao Higgsfield como está (não gera nada).
export function AtualizarSozinho({ ativo, segundos = 20 }: { ativo: boolean; segundos?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!ativo) return;
    const t = setInterval(() => router.refresh(), segundos * 1000);
    return () => clearInterval(t);
  }, [ativo, segundos, router]);
  return null;
}
