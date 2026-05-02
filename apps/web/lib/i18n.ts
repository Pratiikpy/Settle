/**
 * F8.11 — Minimal i18n.
 *
 * Keys are dot-paths into a flat lookup table per locale. Missing keys
 * fall through to the English value, then to the literal key. This
 * means a screen using `t("send.cta")` always renders SOMETHING, even
 * if the locale or the key isn't loaded yet.
 *
 * Why a 50-line homegrown lib instead of next-intl/i18next:
 *   - We have ~30 strings worth translating right now. Pulling in
 *     a 200KB i18n framework + ICU MessageFormat would be over-kill.
 *   - The shape here matches what we'd later migrate to without rewriting
 *     callers: `t(key, vars?)` with `{name}` substitution.
 *   - Locale switcher state lives in localStorage (set by the language
 *     picker in /settings) so it survives page refresh.
 */

import { useEffect, useState } from "react";

export type Locale = "en" | "es" | "ja" | "zh-CN";

export const LOCALES: Locale[] = ["en", "es", "ja", "zh-CN"];

const STORAGE_KEY = "settle:locale";

// ─────────────────────────────────────────────────────────────────────────────
// Bundles. Each is a flat key→string map. Add/edit here.
// ─────────────────────────────────────────────────────────────────────────────

const en: Record<string, string> = {
  "common.connect_wallet": "Connect wallet",
  "common.cancel": "Cancel",
  "common.confirm": "Confirm",
  "common.copy": "Copy",
  "common.copied": "Copied",
  "common.delete": "Delete",
  "common.signing": "Signing in wallet…",
  "common.confirming": "Confirming…",
  "common.success": "Success",
  "send.title": "Send USDC",
  "send.cta": "Send",
  "send.amount_label": "Amount",
  "send.recipient_label": "Recipient",
  "send.recipient_placeholder": "@handle or wallet address",
  "send.note_label": "Note (optional)",
  "send.note_placeholder": "What's this for?",
  "send.success": "Sent. The receipt is verifiable forever.",
  "send.signing": "Signing in wallet…",
  "receipts.empty_title": "No receipts yet",
  "receipts.empty_teach":
    "Every Settle payment leaves a verifiable on-chain receipt. Make your first to see it here.",
  "agents.hire_cta": "Hire an AI agent",
  "agents.hire_title": "Hire an AI agent",
  "agents.hire_subtitle":
    "Spawn a single-task Pact card. Hard cap. Allowlist. Expiry. One-tap revoke.",
  "agents.task_label": "Task",
  "agents.task_placeholder": "Translate this Japanese paper to English.",
  "agents.cap_label": "Cap (USDC)",
  "agents.expiry_label": "Expiry (min)",
  "agents.spawn_pact": "Spawn Pact card",
  "cards.new_title": "Create your first card",
  "cards.new_subtitle":
    "Your AgentCard is the parent object that holds caps, allowlist, expiry, and revoke. Each AI-agent task spawns a Pact card scoped under it.",
  "cards.label": "Label",
  "cards.daily_cap_label": "Daily cap (USDC)",
  "cards.per_call_max_label": "Per-call max (USDC)",
  "cards.expiry_days_label": "Expiry (days)",
  "cards.allowlist_label": "Merchant allowlist",
  "cards.create_cta": "Create AgentCard",
  "merchant.profile_subtitle": "Verifiable money. Every payment leaves a receipt.",
  "merchant.send_cta": "Send",
  "merchant.recent_payments": "Recent payments",
  "merchant.no_receipts": "No receipts yet — be the first.",
  "settings.profile.handle": "Handle",
  "settings.privacy.title": "Privacy",
  "settings.theme.title": "Theme",
  "settings.theme.dark": "dark",
  "settings.theme.light": "light",
  "settings.theme.auto": "auto",
  "settings.notifications.enable": "Enable push",
  "settings.developer.title": "Developer",
  "settings.language.title": "Language",
  "verify.button": "Verify",
  "verify.success": "All 4 hashes match.",
  "verify.fail": "Mismatch — investigate.",
  "wishes.title": "Wishes",
  "wishes.subtitle":
    "Declarative rules for what you want money to do — schedule, save, round up, or gift.",
  "ledger.title": "Ledger",
  "ledger.subtitle":
    "Every payment touching this wallet — Settle-native, imported, or federated.",
  "audit.title": "Audit log",
  "audit.subtitle":
    "Every Phase 5 fire decision the signer made on your behalf.",
  "allowances.title": "Allowances",
  "allowances.subtitle":
    "Recurring weekly funding from parent to kid with hard daily cap.",
  "groups.title": "Groups",
  "groups.subtitle":
    "N-of-M shared spending. Members sign attestations to approve.",
  "dashboard.title": "Dashboard",
  "dashboard.subtitle":
    "Your Settle state at a glance — cards, schedules, fires, and ledger.",
};

const es: Record<string, string> = {
  "common.connect_wallet": "Conectar wallet",
  "common.cancel": "Cancelar",
  "common.confirm": "Confirmar",
  "common.copy": "Copiar",
  "common.copied": "Copiado",
  "common.delete": "Eliminar",
  "common.signing": "Firmando en wallet…",
  "common.confirming": "Confirmando…",
  "common.success": "Éxito",
  "send.title": "Enviar USDC",
  "send.cta": "Enviar",
  "send.amount_label": "Cantidad",
  "send.recipient_label": "Destinatario",
  "send.recipient_placeholder": "@handle o dirección de wallet",
  "send.note_label": "Nota (opcional)",
  "send.note_placeholder": "¿Para qué es?",
  "send.success": "Enviado. El recibo es verificable para siempre.",
  "send.signing": "Firmando en wallet…",
  "receipts.empty_title": "Aún no hay recibos",
  "receipts.empty_teach":
    "Cada pago de Settle deja un recibo on-chain verificable. Realiza tu primer pago para verlo aquí.",
  "agents.hire_cta": "Contratar un agente IA",
  "agents.hire_title": "Contratar un agente IA",
  "agents.hire_subtitle":
    "Crea una tarjeta Pact de tarea única. Tope máximo. Lista permitida. Vencimiento. Revocación con un toque.",
  "agents.task_label": "Tarea",
  "agents.task_placeholder": "Traducir este documento al inglés.",
  "agents.cap_label": "Tope (USDC)",
  "agents.expiry_label": "Vencimiento (min)",
  "agents.spawn_pact": "Crear tarjeta Pact",
  "cards.new_title": "Crea tu primera tarjeta",
  "cards.new_subtitle":
    "Tu AgentCard es el objeto principal que mantiene topes, lista permitida, vencimiento y revocación.",
  "cards.label": "Etiqueta",
  "cards.daily_cap_label": "Tope diario (USDC)",
  "cards.per_call_max_label": "Máximo por llamada (USDC)",
  "cards.expiry_days_label": "Vencimiento (días)",
  "cards.allowlist_label": "Lista permitida",
  "cards.create_cta": "Crear AgentCard",
  "merchant.profile_subtitle": "Dinero verificable. Cada pago deja un recibo.",
  "merchant.send_cta": "Enviar",
  "merchant.recent_payments": "Pagos recientes",
  "merchant.no_receipts": "Aún no hay recibos — sé el primero.",
  "settings.privacy.title": "Privacidad",
  "settings.theme.title": "Tema",
  "settings.theme.dark": "oscuro",
  "settings.theme.light": "claro",
  "settings.theme.auto": "automático",
  "settings.language.title": "Idioma",
  "verify.button": "Verificar",
  "verify.success": "Los 4 hashes coinciden.",
  "verify.fail": "Discrepancia — revisa.",
  "wishes.title": "Deseos",
  "wishes.subtitle":
    "Reglas declarativas para lo que quieres que haga el dinero — programar, ahorrar, redondear o regalar.",
  "ledger.title": "Libro mayor",
  "ledger.subtitle":
    "Cada pago que toca esta wallet — nativo Settle, importado o federado.",
  "audit.title": "Registro de auditoría",
  "audit.subtitle":
    "Cada decisión que el firmante tomó en tu nombre.",
  "allowances.title": "Mesadas",
  "allowances.subtitle":
    "Financiamiento semanal recurrente de padre a hijo con tope diario.",
  "groups.title": "Grupos",
  "groups.subtitle":
    "Gasto compartido N-de-M. Los miembros firman atestiguaciones para aprobar.",
  "dashboard.title": "Panel",
  "dashboard.subtitle":
    "Tu estado de Settle de un vistazo — tarjetas, programas, disparos y libro mayor.",
};

const ja: Record<string, string> = {
  "common.connect_wallet": "ウォレットを接続",
  "common.cancel": "キャンセル",
  "common.confirm": "確認",
  "common.delete": "削除",
  "common.signing": "ウォレットで署名中…",
  "common.confirming": "確認中…",
  "send.title": "USDCを送る",
  "send.cta": "送信",
  "send.amount_label": "金額",
  "send.recipient_label": "宛先",
  "send.recipient_placeholder": "@ハンドルまたはウォレットアドレス",
  "send.note_label": "メモ(任意)",
  "send.note_placeholder": "何のためですか?",
  "send.success": "送金しました。レシートは永続的に検証可能です。",
  "send.signing": "ウォレットで署名中…",
  "receipts.empty_title": "まだレシートはありません",
  "agents.hire_cta": "AIエージェントを雇う",
  "agents.hire_title": "AIエージェントを雇う",
  "agents.spawn_pact": "Pactカードを発行",
  "agents.task_label": "タスク",
  "agents.cap_label": "上限(USDC)",
  "cards.new_title": "最初のカードを作成",
  "cards.label": "ラベル",
  "cards.daily_cap_label": "1日の上限(USDC)",
  "cards.create_cta": "AgentCardを作成",
  "merchant.send_cta": "送る",
  "settings.language.title": "言語",
  "verify.button": "検証",
  "verify.success": "4つのハッシュが一致しました。",
  "wishes.title": "ウィッシュ",
  "ledger.title": "台帳",
  "audit.title": "監査ログ",
  "allowances.title": "お小遣い",
  "groups.title": "グループ",
  "dashboard.title": "ダッシュボード",
};

const zhCN: Record<string, string> = {
  "common.connect_wallet": "连接钱包",
  "common.cancel": "取消",
  "common.confirm": "确认",
  "common.delete": "删除",
  "common.signing": "钱包签名中…",
  "common.confirming": "确认中…",
  "send.title": "发送 USDC",
  "send.cta": "发送",
  "send.amount_label": "金额",
  "send.recipient_label": "收款人",
  "send.recipient_placeholder": "@用户名 或 钱包地址",
  "send.note_label": "备注（可选）",
  "send.note_placeholder": "用途?",
  "send.success": "已发送。回单可永久验证。",
  "send.signing": "钱包签名中…",
  "receipts.empty_title": "暂无回单",
  "agents.hire_cta": "雇用 AI 代理",
  "agents.hire_title": "雇用 AI 代理",
  "agents.spawn_pact": "创建 Pact 卡",
  "agents.task_label": "任务",
  "agents.cap_label": "上限 (USDC)",
  "cards.new_title": "创建您的第一张卡",
  "cards.label": "标签",
  "cards.daily_cap_label": "每日上限 (USDC)",
  "cards.create_cta": "创建 AgentCard",
  "merchant.send_cta": "发送",
  "settings.language.title": "语言",
  "verify.button": "验证",
  "verify.success": "四个哈希全部匹配。",
  "wishes.title": "心愿",
  "ledger.title": "账本",
  "audit.title": "审计日志",
  "allowances.title": "津贴",
  "groups.title": "群组",
  "dashboard.title": "仪表板",
};

const BUNDLES: Record<Locale, Record<string, string>> = {
  en,
  es,
  ja,
  "zh-CN": zhCN,
};

// ─────────────────────────────────────────────────────────────────────────────
// Locale state (client-side; SSR fallback = "en")
// ─────────────────────────────────────────────────────────────────────────────

function readStoredLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(STORAGE_KEY) as Locale | null;
  if (stored && LOCALES.includes(stored)) return stored;
  // Browser hint, best-effort.
  const navLang = window.navigator.language || "en";
  if (navLang.startsWith("es")) return "es";
  if (navLang.startsWith("ja")) return "ja";
  if (navLang.startsWith("zh")) return "zh-CN";
  return "en";
}

export function setLocale(locale: Locale) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, locale);
  window.dispatchEvent(new CustomEvent("settle:locale-change", { detail: locale }));
}

/**
 * Look up a translation. Falls back: requested locale → english → key.
 * Substitutes `{name}` placeholders from `vars`.
 */
export function translate(
  key: string,
  vars?: Record<string, string | number>,
  locale?: Locale,
): string {
  const loc = locale ?? readStoredLocale();
  const raw = BUNDLES[loc]?.[key] ?? BUNDLES.en[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k: string) =>
    vars[k] !== undefined ? String(vars[k]) : `{${k}}`,
  );
}

/**
 * React hook — returns a `t(key, vars?)` bound to the current locale,
 * re-rendering when the locale changes via setLocale().
 */
export function useTranslate() {
  const [locale, setLocaleState] = useState<Locale>(() => readStoredLocale());

  useEffect(() => {
    function onChange(e: Event) {
      const next = (e as CustomEvent).detail as Locale;
      if (next && LOCALES.includes(next)) setLocaleState(next);
    }
    window.addEventListener("settle:locale-change", onChange);
    return () => window.removeEventListener("settle:locale-change", onChange);
  }, []);

  function t(key: string, vars?: Record<string, string | number>): string {
    return translate(key, vars, locale);
  }
  return { t, locale, setLocale };
}
