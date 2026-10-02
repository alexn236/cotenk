#!/usr/bin/env node
/**
 * CoTenk's Supabase auth emails (confirm, reset password, magic link,
 * invite, email change, re-authentication).
 *
 *   node scripts/email-templates.mjs build
 *       writes supabase/templates/*.html (paste them into the dashboard
 *       under Authentication → Emails, or use `apply`)
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_… node scripts/email-templates.mjs apply
 *       builds and uploads subjects + templates to the hosted project
 *       (project ref: SUPABASE_PROJECT_REF, else read from .env.local's
 *       VITE_SUPABASE_URL). Create a token at
 *       https://supabase.com/dashboard/account/tokens
 *
 *   node scripts/email-templates.mjs preview
 *       writes supabase/templates/preview/*.html with sample values, so
 *       you can open them in a browser
 *
 * `{{ … }}` are Supabase's Go-template variables; they stay as they are.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "supabase", "templates");

const C = {
  bg: "#f4f2ea",
  card: "#ffffff",
  line: "#e7e2d3",
  ink: "#1c1a18",
  muted: "#6f6a5f",
  accent: "#a8641c",
  onAccent: "#ffffff",
  code: "#f4f2ea",
  dark: {
    bg: "#131211",
    card: "#1c1a18",
    line: "#2e2b27",
    ink: "#f0ece2",
    muted: "#a39d90",
    accent: "#e2a05c",
    onAccent: "#1c1a18",
    code: "#131211",
  },
};

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

const button = (href, label) => `
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 8px">
              <tr><td class="btn" style="border-radius:9px;background:${C.accent}">
                <a href="${href}" class="btn-a" style="display:inline-block;padding:12px 22px;font:600 14px ${FONT};color:${C.onAccent};text-decoration:none;border-radius:9px">${label}</a>
              </td></tr>
            </table>`;

const codeBox = (label, token) => `
            <p class="muted" style="margin:24px 0 8px;font:400 13px/1.5 ${FONT};color:${C.muted}">${label}</p>
            <div class="code" style="display:inline-block;padding:12px 18px;border-radius:9px;background:${C.code};border:1px solid ${C.line};font:600 24px ${MONO};letter-spacing:0.28em;color:${C.ink}">${token}</div>`;

const fallbackLink = (href) => `
            <p class="muted" style="margin:20px 0 0;font:400 12px/1.6 ${FONT};color:${C.muted}">Button not working? Copy this link into your browser:<br><a href="${href}" style="color:${C.muted};word-break:break-all">${href}</a></p>`;

function layout({ preheader, title, body, footer }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${title}</title>
<style>
  @media (prefers-color-scheme: dark) {
    .page { background:${C.dark.bg} !important; }
    .card { background:${C.dark.card} !important; border-color:${C.dark.line} !important; }
    .ink { color:${C.dark.ink} !important; }
    .muted, .muted a { color:${C.dark.muted} !important; }
    .btn { background:${C.dark.accent} !important; }
    .btn-a { color:${C.dark.onAccent} !important; }
    .code { background:${C.dark.code} !important; border-color:${C.dark.line} !important; color:${C.dark.ink} !important; }
    .logo { background:${C.dark.accent} !important; color:${C.dark.onAccent} !important; }
    .rule { border-color:${C.dark.line} !important; }
  }
  @media (max-width:520px) { .card { padding:28px 22px !important; } }
</style>
</head>
<body class="page" style="margin:0;padding:0;background:${C.bg}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="page" style="background:${C.bg}">
  <tr><td align="center" style="padding:40px 16px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
      <tr><td style="padding:0 4px 18px">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td class="logo" width="32" height="32" align="center" style="width:32px;height:32px;border-radius:9px;background:${C.accent};font:700 16px ${FONT};color:${C.onAccent}">C</td>
          <td class="ink" style="padding-left:10px;font:600 16px ${FONT};color:${C.ink}">CoTenk</td>
        </tr></table>
      </td></tr>
      <tr><td class="card" style="padding:36px 36px 32px;background:${C.card};border:1px solid ${C.line};border-radius:14px">
            <h1 class="ink" style="margin:0 0 14px;font:650 22px/1.3 ${FONT};letter-spacing:-0.01em;color:${C.ink}">${title}</h1>
${body}
            <hr class="rule" style="margin:28px 0 18px;border:0;border-top:1px solid ${C.line}">
            <p class="muted" style="margin:0;font:400 12px/1.6 ${FONT};color:${C.muted}">${footer}</p>
      </td></tr>
      <tr><td align="center" class="muted" style="padding:20px 8px 0;font:400 12px/1.6 ${FONT};color:${C.muted}">
        CoTenk · Think together. Work together.
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
`;
}

const p = (html) =>
  `            <p class="ink" style="margin:0 0 12px;font:400 15px/1.65 ${FONT};color:${C.ink}">${html}</p>`;

const IGNORE = "If you didn't request this, you can safely ignore this email — nothing will change.";

export const TEMPLATES = {
  confirmation: {
    subject: "Confirm your CoTenk account",
    html: layout({
      preheader: "One click to finish creating your account.",
      title: "Confirm your email",
      body: [
        p("Welcome to CoTenk — the workspace where you and your AI agents write, plan and build together."),
        p("Confirm your email address to finish creating your account."),
        button("{{ .ConfirmationURL }}", "Confirm email"),
        fallbackLink("{{ .ConfirmationURL }}"),
      ].join("\n"),
      footer: `You're receiving this because {{ .Email }} was used to sign up. ${IGNORE}`,
    }),
  },
  recovery: {
    subject: "Reset your CoTenk password",
    html: layout({
      preheader: "Choose a new password for your account.",
      title: "Reset your password",
      body: [
        p("We got a request to reset the password for <strong>{{ .Email }}</strong>."),
        button("{{ .ConfirmationURL }}", "Choose a new password"),
        codeBox("Using the desktop app? Enter this code in CoTenk instead:", "{{ .Token }}"),
        fallbackLink("{{ .ConfirmationURL }}"),
      ].join("\n"),
      footer: `The link and the code expire after a short while and work once. ${IGNORE}`,
    }),
  },
  magic_link: {
    subject: "Your CoTenk sign-in link",
    html: layout({
      preheader: "Sign in to CoTenk with one click.",
      title: "Sign in to CoTenk",
      body: [
        p("Use the button below to sign in as <strong>{{ .Email }}</strong>."),
        button("{{ .ConfirmationURL }}", "Sign in"),
        codeBox("Or enter this code in the app:", "{{ .Token }}"),
        fallbackLink("{{ .ConfirmationURL }}"),
      ].join("\n"),
      footer: `The link and the code work once. ${IGNORE}`,
    }),
  },
  invite: {
    subject: "You're invited to CoTenk",
    html: layout({
      preheader: "Accept your invitation and set a password.",
      title: "You're invited",
      body: [
        p("You've been invited to join CoTenk — an open workspace for people and AI agents."),
        p("Accept the invitation to create your account."),
        button("{{ .ConfirmationURL }}", "Accept invitation"),
        fallbackLink("{{ .ConfirmationURL }}"),
      ].join("\n"),
      footer: `This invitation was sent to {{ .Email }}. If you weren't expecting it, you can ignore this email.`,
    }),
  },
  email_change: {
    subject: "Confirm your new email for CoTenk",
    html: layout({
      preheader: "Confirm the change of your CoTenk email address.",
      title: "Confirm your new email",
      body: [
        p("You asked to change the email of your CoTenk account from <strong>{{ .Email }}</strong> to <strong>{{ .NewEmail }}</strong>."),
        button("{{ .ConfirmationURL }}", "Confirm change"),
        fallbackLink("{{ .ConfirmationURL }}"),
      ].join("\n"),
      footer: `Until you confirm, you keep signing in with your current address. ${IGNORE}`,
    }),
  },
  reauthentication: {
    subject: "Your CoTenk verification code",
    html: layout({
      preheader: "Enter this code to confirm it's you.",
      title: "Confirm it's you",
      body: [
        p("Enter this code in CoTenk to continue with a sensitive change to your account."),
        codeBox("Your verification code:", "{{ .Token }}"),
      ].join("\n"),
      footer: `The code works once and expires soon. ${IGNORE}`,
    }),
  },
};

const SAMPLE = {
  "{{ .ConfirmationURL }}": "https://example.com/auth/confirm?token=sample",
  "{{ .Token }}": "482913",
  "{{ .Email }}": "you@example.com",
  "{{ .NewEmail }}": "new@example.com",
  "{{ .SiteURL }}": "https://example.com",
};

function build() {
  mkdirSync(outDir, { recursive: true });
  for (const [name, t] of Object.entries(TEMPLATES)) {
    writeFileSync(join(outDir, `${name}.html`), t.html);
  }
  console.log(`Wrote ${Object.keys(TEMPLATES).length} templates to supabase/templates/`);
}

function preview() {
  const dir = join(outDir, "preview");
  mkdirSync(dir, { recursive: true });
  for (const [name, t] of Object.entries(TEMPLATES)) {
    let html = t.html;
    for (const [k, v] of Object.entries(SAMPLE)) html = html.split(k).join(v);
    writeFileSync(join(dir, `${name}.html`), html);
  }
  console.log("Previews in supabase/templates/preview/ — open them in a browser.");
}

function projectRef() {
  if (process.env.SUPABASE_PROJECT_REF) return process.env.SUPABASE_PROJECT_REF;
  const env = join(root, ".env.local");
  if (existsSync(env)) {
    const m = /VITE_SUPABASE_URL\s*=\s*https:\/\/([a-z0-9]+)\.supabase\.co/i.exec(
      readFileSync(env, "utf8"),
    );
    if (m) return m[1];
  }
  return null;
}

async function apply() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = projectRef();
  if (!token) throw new Error("Set SUPABASE_ACCESS_TOKEN (https://supabase.com/dashboard/account/tokens).");
  if (!ref) throw new Error("Set SUPABASE_PROJECT_REF (the part before .supabase.co).");
  const body = {};
  for (const [name, t] of Object.entries(TEMPLATES)) {
    body[`mailer_subjects_${name}`] = t.subject;
    body[`mailer_templates_${name}_content`] = t.html;
  }
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase answered ${res.status}: ${await res.text()}`);
  console.log(`Email templates updated for project ${ref}.`);
}

const cmd = process.argv[2];
if (cmd === "build") build();
else if (cmd === "preview") preview();
else if (cmd === "apply") {
  build();
  apply().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
} else {
  console.log("Usage: node scripts/email-templates.mjs <build|preview|apply>");
}
