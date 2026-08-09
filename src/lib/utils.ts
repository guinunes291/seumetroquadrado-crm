import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// A antiga formatDuracaoParado ("116d 12h37") foi substituída pelo formato
// único hh:mm do app — use formatDuration de "@/lib/duracao".
