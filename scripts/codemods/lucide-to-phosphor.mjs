// Codemod lucide-react → @phosphor-icons/react (identidade v3).
//
// Baseado na AST do TypeScript: renomeia SÓ identificadores que referenciam o
// import (JSX, valores, `typeof`), nunca strings ou comentários — "Radar" em
// "Radar de risco" continua intacto. Uso:
//   node scripts/codemods/lucide-to-phosphor.mjs --dry   (relatório)
//   node scripts/codemods/lucide-to-phosphor.mjs         (aplica)
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const DRY = process.argv.includes("--dry");
const ROOTS = ["src", "tests"];

// Lucide → Phosphor (mesmo nome quando existe; metáfora trocada só onde a
// decisão de design pediu: MessageCircle → WhatsappLogo).
const MAP = {
  AlarmClock: "Alarm",
  AlertCircle: "WarningCircle",
  AlertTriangle: "Warning",
  Archive: "Archive",
  ArrowDown: "ArrowDown",
  ArrowDownRight: "ArrowDownRight",
  ArrowLeft: "ArrowLeft",
  ArrowRight: "ArrowRight",
  ArrowRightCircle: "ArrowCircleRight",
  ArrowRightLeft: "ArrowsLeftRight",
  ArrowUp: "ArrowUp",
  ArrowUpRight: "ArrowUpRight",
  Award: "Medal",
  BadgeCheck: "SealCheck",
  BadgeX: "XCircle",
  Ban: "Prohibit",
  BarChart3: "ChartBar",
  Bell: "Bell",
  BellOff: "BellSlash",
  BellRing: "BellRinging",
  BookOpen: "BookOpen",
  Bot: "Robot",
  Boxes: "Stack",
  Briefcase: "Briefcase",
  Building2: "Buildings",
  Calculator: "Calculator",
  Calendar: "CalendarBlank",
  CalendarCheck: "CalendarCheck",
  CalendarClock: "CalendarDots",
  CalendarDays: "CalendarDots",
  CalendarPlus: "CalendarPlus",
  CalendarRange: "CalendarDots",
  Camera: "Camera",
  Check: "Check",
  CheckCheck: "Checks",
  CheckCircle2: "CheckCircle",
  ChevronDown: "CaretDown",
  ChevronDownIcon: "CaretDownIcon",
  ChevronLeft: "CaretLeft",
  ChevronLeftIcon: "CaretLeftIcon",
  ChevronRight: "CaretRight",
  ChevronRightIcon: "CaretRightIcon",
  ChevronUp: "CaretUp",
  ChevronsUpDown: "CaretUpDown",
  Circle: "Circle",
  Clock: "Clock",
  Clock3: "ClockAfternoon",
  Compass: "Compass",
  Copy: "Copy",
  CopyCheck: "ClipboardText",
  Crosshair: "Crosshair",
  DollarSign: "CurrencyDollar",
  Download: "DownloadSimple",
  Edit2: "PencilSimple",
  ExternalLink: "ArrowSquareOut",
  Eye: "Eye",
  EyeOff: "EyeSlash",
  FileCheck: "FileMagnifyingGlass",
  FileCheck2: "ListChecks",
  FileDown: "FileArrowDown",
  FileMinus2: "FileMinus",
  FileSearch: "FileMagnifyingGlass",
  FileSpreadsheet: "FileXls",
  FileText: "FileText",
  FileWarning: "FileDashed",
  FileX2: "FileX",
  Flag: "Flag",
  Flame: "Fire",
  Gauge: "Gauge",
  Globe: "Globe",
  GraduationCap: "GraduationCap",
  GripVertical: "DotsSixVertical",
  HandCoins: "HandCoins",
  Headset: "Headset",
  History: "ClockCounterClockwise",
  Hourglass: "Hourglass",
  Image: "Image",
  ImageIcon: "ImageIcon",
  Inbox: "Tray",
  Info: "Info",
  LayoutDashboard: "Layout",
  LayoutGrid: "SquaresFour",
  Lightbulb: "Lightbulb",
  LineChart: "ChartLineUp",
  Link2: "Link",
  ListTodo: "ListChecks",
  Loader2: "CircleNotch",
  LoaderCircle: "CircleNotch",
  Lock: "Lock",
  LogOut: "SignOut",
  Mail: "Envelope",
  Map: "MapTrifold",
  MapPin: "MapPin",
  MapPinned: "MapPinArea",
  Megaphone: "Megaphone",
  Merge: "GitMerge",
  MessageCircle: "WhatsappLogo",
  MessageCircleWarning: "ChatCircleText",
  MessageSquare: "ChatText",
  MessageSquareQuote: "Quotes",
  Minus: "Minus",
  Monitor: "Monitor",
  Moon: "Moon",
  MoreHorizontal: "DotsThree",
  MoreVertical: "DotsThreeVertical",
  Pencil: "PencilSimple",
  Percent: "Percent",
  Phone: "Phone",
  PhoneCall: "PhoneCall",
  PhoneOff: "PhoneSlash",
  PhoneOutgoing: "PhoneOutgoing",
  Plus: "Plus",
  Printer: "Printer",
  Radar: "Broadcast",
  Radio: "Radio",
  RefreshCw: "ArrowClockwise",
  Repeat: "ArrowsClockwise",
  Rocket: "RocketLaunch",
  RotateCcw: "ArrowCounterClockwise",
  Rows3: "Rows",
  Save: "FloppyDisk",
  Scale: "Scales",
  ScrollText: "Scroll",
  Search: "MagnifyingGlass",
  Send: "PaperPlaneTilt",
  Settings: "GearSix",
  Settings2: "Sliders",
  ShieldAlert: "ShieldWarning",
  ShieldCheck: "ShieldCheck",
  ShieldOff: "ShieldSlash",
  Shuffle: "Shuffle",
  SkipForward: "SkipForward",
  SlidersHorizontal: "SlidersHorizontal",
  Smartphone: "DeviceMobile",
  Snowflake: "Snowflake",
  Square: "Square",
  SquarePen: "NotePencil",
  Star: "Star",
  Sun: "Sun",
  Sunrise: "SunHorizon",
  Table2: "Table",
  Target: "Target",
  Thermometer: "Thermometer",
  Timer: "Timer",
  Trash2: "Trash",
  Trello: "Kanban",
  TrendingDown: "TrendDown",
  TrendingUp: "TrendUp",
  Trophy: "Trophy",
  Undo2: "ArrowUUpLeft",
  Unplug: "Plugs",
  Upload: "UploadSimple",
  User: "User",
  UserCheck: "UserCheck",
  UserPlus: "UserPlus",
  UserX: "UserMinus",
  Users: "UsersThree",
  Volume2: "SpeakerHigh",
  VolumeX: "SpeakerSlash",
  Wallet: "Wallet",
  Webhook: "WebhooksLogo",
  X: "X",
  XCircle: "XCircle",
  Zap: "Lightning",
  // Segundo lote (nomes que o primeiro levantamento não pegou).
  Menu: "List",
  PanelLeftClose: "CaretDoubleLeft",
  PanelLeftOpen: "CaretDoubleRight",
  SunMoon: "CircleHalf",
  UserRound: "UserCircle",
  ListChecks: "ListChecks",
  Paperclip: "Paperclip",
  HelpCircle: "Question",
  ChevronsLeftRight: "ArrowsHorizontal",
  BedDouble: "Bed",
  Car: "Car",
  Ruler: "Ruler",
  ClipboardList: "Clipboard",
  ListOrdered: "ListNumbers",
  Route: "Path",
  ShieldQuestion: "ShieldWarning",
  PiggyBank: "PiggyBank",
  Landmark: "Bank",
  IdCard: "IdentificationCard",
  Filter: "Funnel",
  Play: "Play",
  CalendarOff: "CalendarSlash",
  Crown: "Crown",
  PauseCircle: "PauseCircle",
  PlayCircle: "PlayCircle",
  ArrowDownCircle: "ArrowCircleDown",
  ArrowUpCircle: "ArrowCircleUp",
  UserCog: "UserGear",
  ClipboardCheck: "ClipboardText",
  MessageCircleReply: "ArrowBendUpLeft",
  PartyPopper: "Confetti",
  BarChart2: "ChartBar",
  ClipboardPaste: "Clipboard",
  Heart: "Heart",
  LayoutList: "ListDashes",
  PhoneIncoming: "PhoneIncoming",
  PhoneMissed: "PhoneX",
  PhoneForwarded: "PhoneTransfer",
  Mic: "Microphone",
  MicOff: "MicrophoneSlash",
  StickyNote: "Note",
  CircleDot: "RadioButton",
  List: "List",
  ThermometerSnowflake: "ThermometerCold",
  Bookmark: "BookmarkSimple",
  Activity: "Pulse",
  Maximize: "ArrowsOut",
  Minimize: "ArrowsIn",
  Pause: "Pause",
  Table: "Table",
  Layers: "StackSimple",
  Maximize2: "ArrowsOutSimple",
  WalletCards: "Cards",
};
// Sparkles vira o monograma da Sami (componente próprio, decisão 8).
const SAMI = { source: "Sparkles", local: "SamiMark", module: "@/components/ui/sami-mark" };
// Tipos.
const TYPES = {
  LucideIcon: { target: "Icon", local: "IconComponent" },
  LucideProps: { target: "IconProps", local: "IconProps" },
};

const files = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules") walk(p);
    } else if (/\.(tsx?|mts)$/.test(e.name) && !p.endsWith(".d.ts")) files.push(p);
  }
}
ROOTS.forEach(walk);

const report = { changed: 0, unmapped: new Set(), conflicts: [], namespaceImports: [], renames: 0 };

for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  if (!text.includes("lucide-react")) continue;
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);

  const decls = sf.statements.filter(
    (s) =>
      ts.isImportDeclaration(s) &&
      ts.isStringLiteral(s.moduleSpecifier) &&
      s.moduleSpecifier.text === "lucide-react",
  );
  if (decls.length === 0) continue;

  const valueEntries = new Map(); // importText -> true
  const typeEntries = new Map();
  let needsSami = false;
  let allTypeOnly = true;
  const renames = new Map(); // local -> newLocal
  let bad = false;

  for (const d of decls) {
    const nb = d.importClause?.namedBindings;
    if (!nb || !ts.isNamedImports(nb) || d.importClause.name) {
      report.namespaceImports.push(file);
      bad = true;
      break;
    }
    const declTypeOnly = !!d.importClause.isTypeOnly;
    for (const spec of nb.elements) {
      const original = (spec.propertyName ?? spec.name).text;
      const local = spec.name.text;
      const typeOnly = declTypeOnly || !!spec.isTypeOnly;
      if (TYPES[original]) {
        const t = TYPES[original];
        const newLocal = local === original ? t.local : local;
        if (newLocal !== local) renames.set(local, newLocal);
        typeEntries.set(t.target === newLocal ? t.target : `${t.target} as ${newLocal}`, true);
        continue;
      }
      allTypeOnly = allTypeOnly && typeOnly;
      if (original === SAMI.source) {
        needsSami = true;
        const newLocal = local === original ? SAMI.local : local;
        if (newLocal !== local) renames.set(local, newLocal);
        continue;
      }
      const target = MAP[original];
      if (!target) {
        report.unmapped.add(original);
        bad = true;
        continue;
      }
      if (local !== original) {
        valueEntries.set(target === local ? target : `${target} as ${local}`, true);
      } else {
        if (target !== local) renames.set(local, target);
        valueEntries.set(target, true);
      }
    }
  }
  if (bad) continue;

  // Colisões: o novo nome já existe no arquivo fora do import do lucide?
  const declRanges = decls.map((d) => [d.getStart(sf), d.getEnd()]);
  const inDecl = (pos) => declRanges.some(([a, b]) => pos >= a && pos < b);
  const newNames = new Set(renames.values());
  const existing = new Set();
  const edits = []; // {start,end,text}
  function visit(node) {
    if (ts.isIdentifier(node) && !inDecl(node.getStart(sf))) {
      const name = node.text;
      if (newNames.has(name) && !renames.has(name)) existing.add(name);
      if (renames.has(name)) {
        const parent = node.parent;
        const isPropName =
          (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
          (ts.isPropertyAssignment(parent) && parent.name === node) ||
          (ts.isPropertySignature(parent) && parent.name === node) ||
          (ts.isJsxAttribute(parent) && parent.name === node) ||
          (ts.isEnumMember(parent) && parent.name === node) ||
          (ts.isBindingElement(parent) && parent.propertyName === node);
        if (ts.isShorthandPropertyAssignment(parent) && parent.name === node) {
          edits.push({
            start: node.getStart(sf),
            end: node.getEnd(),
            text: `${name}: ${renames.get(name)}`,
          });
        } else if (!isPropName) {
          edits.push({ start: node.getStart(sf), end: node.getEnd(), text: renames.get(name) });
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  if (existing.size) {
    // O novo nome já existe no arquivo (ex.: componente <Calendar>, tipo Medal):
    // mantém o nome local e importa com alias — `import { Medal as Award }`.
    report.conflicts.push({ file, names: [...existing], resolved: "alias" });
    for (const [local, newLocal] of [...renames]) {
      if (!existing.has(newLocal)) continue;
      renames.delete(local);
      valueEntries.delete(newLocal);
      valueEntries.set(`${newLocal} as ${local}`, true);
    }
    // Refaz as edições sem os renames retirados.
    edits.length = 0;
    visit(sf);
  }

  // Novo import (no lugar do primeiro; os demais são removidos).
  const parts = [...valueEntries.keys()].sort((a, b) => a.localeCompare(b));
  const typeParts = [...typeEntries.keys()].sort();
  let importText = "";
  if (parts.length && typeParts.length)
    importText = `import { ${parts.join(", ")}, ${typeParts.map((t) => `type ${t}`).join(", ")} } from "@phosphor-icons/react";`;
  else if (parts.length)
    importText = `import { ${parts.join(", ")} } from "@phosphor-icons/react";`;
  else if (typeParts.length)
    importText = `import type { ${typeParts.join(", ")} } from "@phosphor-icons/react";`;
  if (needsSami)
    importText += (importText ? "\n" : "") + `import { ${SAMI.local} } from "${SAMI.module}";`;

  decls.forEach((d, i) => {
    const start = d.getStart(sf);
    let end = d.getEnd();
    if (i > 0 && text[end] === "\n") end += 1; // remove a linha inteira dos extras
    edits.push({ start, end, text: i === 0 ? importText : "" });
  });

  edits.sort((a, b) => b.start - a.start);
  let out = text;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  report.changed++;
  report.renames += renames.size;
  if (!DRY) fs.writeFileSync(file, out);
}

console.log(
  JSON.stringify(
    {
      mode: DRY ? "dry" : "apply",
      changedFiles: report.changed,
      renamedBindings: report.renames,
      unmapped: [...report.unmapped],
      conflicts: report.conflicts,
      namespaceImports: report.namespaceImports,
    },
    null,
    2,
  ),
);
