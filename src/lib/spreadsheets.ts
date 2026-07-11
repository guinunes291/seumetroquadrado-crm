/**
 * Leitura e exportação de planilhas no browser.
 *
 * ExcelJS só é carregado quando o usuário realmente abre/exporta um XLSX. CSV
 * usa um parser local com suporte a campos entre aspas e quebras de linha, sem
 * trazer uma segunda biblioteca para o bundle inicial.
 */

type TabularRow = Record<string, unknown>;

function cellText(value: unknown): unknown {
  if (value == null) return "";
  if (value instanceof Date) return value.toLocaleDateString("pt-BR");
  if (typeof value !== "object") return value;

  const rich = value as { richText?: Array<{ text?: string }> };
  if (Array.isArray(rich.richText)) return rich.richText.map((part) => part.text ?? "").join("");

  const formula = value as { result?: unknown };
  if ("result" in formula) return cellText(formula.result);

  const hyperlink = value as { text?: unknown; hyperlink?: unknown };
  if ("hyperlink" in hyperlink) return cellText(hyperlink.text ?? hyperlink.hyperlink);

  const error = value as { error?: unknown };
  if ("error" in error) return String(error.error ?? "");

  return String(value);
}

function detectDelimiter(text: string): "," | ";" | "\t" {
  const sample = text.split(/\r?\n/, 1)[0] ?? "";
  const counts = ([",", ";", "\t"] as const).map((delimiter) => ({
    delimiter,
    count: sample.split(delimiter).length - 1,
  }));
  counts.sort((a, b) => b.count - a.count);
  return counts[0]?.count ? counts[0].delimiter : ",";
}

/** Parser RFC 4180 suficiente para CSVs reais, inclusive aspas e multiline. */
export function parseDelimitedText(text: string): TabularRow[] {
  const delimiter = detectDelimiter(text);
  const matrix: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) matrix.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (quoted) throw new Error("CSV inválido: há um campo entre aspas sem fechamento.");
  row.push(cell);
  if (row.some((value) => value.trim() !== "")) matrix.push(row);
  if (matrix.length < 2) return [];

  const headers = matrix[0].map((header, index) => {
    const clean = header.replace(/^\ufeff/, "").trim();
    return clean || `Coluna ${index + 1}`;
  });

  return matrix
    .slice(1)
    .map((values) =>
      Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])),
    );
}

export async function readTabularFile(file: File): Promise<TabularRow[]> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "csv" || extension === "txt") {
    return parseDelimitedText(await file.text());
  }
  if (extension !== "xlsx") {
    throw new Error("Formato não suportado. Envie um arquivo .xlsx ou .csv.");
  }

  const { readSheet } = await import("read-excel-file/browser");
  const matrix = await readSheet(file);
  if (matrix.length < 2) return [];

  const width = Math.max(...matrix.map((row) => row.length));
  const headers = Array.from({ length: width }, (_, index) => {
    const clean = String(cellText(matrix[0]?.[index]))
      .replace(/^\ufeff/, "")
      .trim();
    return clean || `Coluna ${index + 1}`;
  });

  const rows: TabularRow[] = [];
  for (const matrixRow of matrix.slice(1)) {
    const rowValues = headers.map((_, index) => cellText(matrixRow[index]));
    if (rowValues.every((value) => String(value).trim() === "")) continue;
    rows.push(Object.fromEntries(headers.map((header, index) => [header, rowValues[index] ?? ""])));
  }
  return rows;
}

export async function exportRowsXlsx(
  rows: TabularRow[],
  options: { fileName: string; sheetName: string },
): Promise<void> {
  if (rows.length === 0) throw new Error("Não há dados para exportar.");

  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const sheetData = [
    headers.map((header) => ({ value: header, type: String, fontWeight: "bold" as const })),
    ...rows.map((row) => headers.map((header) => exportCellValue(row[header]))),
  ];
  const fileName = options.fileName.endsWith(".xlsx")
    ? options.fileName
    : `${options.fileName}.xlsx`;
  await writeXlsxFile(sheetData, {
    sheet: options.sheetName.slice(0, 31),
    stickyRowsCount: 1,
    columns: headers.map((header) => ({
      width: Math.min(40, Math.max(12, header.length + 2)),
    })),
  }).toFile(fileName);
}

function exportCellValue(value: unknown): string | number | boolean | Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  return String(value);
}
