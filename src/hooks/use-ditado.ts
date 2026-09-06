// Ditado por voz com a Web Speech API do navegador (Onda S3, decisão D8 —
// microfone no painel da Sami, celular primeiro). Mesma mecânica do Modo
// Visita: reconhecimento em pt-BR, só resultados finais, e o texto vai para
// quem chamou via `onTexto`. O hook não mostra toast: devolve `erro` e o
// componente decide como avisar.
//
// Privacidade: o áudio é processado pelo motor de voz do navegador/SO (não
// pela SMQ). O componente deve deixar isso claro antes do primeiro uso.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type SpeechResultEvent = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event?: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export function speechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const browserWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition ?? null;
}

export function useDitado(opts: {
  onTexto: (texto: string) => void;
  onErro?: (erro: string) => void;
  lang?: string;
}) {
  const { onTexto, onErro, lang = "pt-BR" } = opts;
  const suportado = useMemo(() => speechRecognitionConstructor() !== null, []);
  const [ouvindo, setOuvindo] = useState(false);
  const ref = useRef<SpeechRecognitionLike | null>(null);
  const onTextoRef = useRef(onTexto);
  const onErroRef = useRef(onErro);
  onTextoRef.current = onTexto;
  onErroRef.current = onErro;

  const parar = useCallback(() => {
    ref.current?.stop();
  }, []);

  const iniciar = useCallback(() => {
    const Constructor = speechRecognitionConstructor();
    if (!Constructor || ref.current) return;
    const recognition = new Constructor();
    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const partes: string[] = [];
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        if (event.results[i].isFinal) partes.push(event.results[i][0].transcript);
      }
      const texto = partes.join(" ").trim();
      if (texto) onTextoRef.current(texto);
    };
    recognition.onerror = (event) => {
      const codigo = event?.error ?? "";
      onErroRef.current?.(
        codigo === "not-allowed"
          ? "Permita o microfone no navegador para ditar."
          : "O ditado foi interrompido. Você ainda pode digitar.",
      );
    };
    recognition.onend = () => {
      ref.current = null;
      setOuvindo(false);
    };
    ref.current = recognition;
    try {
      recognition.start();
      setOuvindo(true);
    } catch {
      ref.current = null;
      setOuvindo(false);
      onErroRef.current?.("Não consegui iniciar o microfone.");
    }
  }, [lang]);

  const alternar = useCallback(() => {
    if (ouvindo) parar();
    else iniciar();
  }, [ouvindo, iniciar, parar]);

  useEffect(() => {
    return () => {
      ref.current?.abort?.();
      ref.current?.stop();
      ref.current = null;
    };
  }, []);

  return { suportado, ouvindo, iniciar, parar, alternar };
}
