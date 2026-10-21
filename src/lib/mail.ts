/**
 * Envío de correo.
 * Proveedor: Resend (API HTTP, compatible con Workers).
 * La configuración vive en organizations.settings.email para que el
 * administrador pueda conectarla desde la interfaz, sin redeploy.
 */
import type { Env } from './auth'

export type EmailConfig = {
  provider: 'resend'
  api_key?: string
  from_email?: string
  from_name?: string
  reply_to?: string
}

export async function getEmailConfig(env: Env, orgId: number): Promise<EmailConfig | null> {
  const org = await env.DB.prepare('SELECT settings FROM organizations WHERE id = ?').bind(orgId).first<any>()
  if (!org) return null
  let settings: any = {}
  try { settings = JSON.parse(org.settings || '{}') } catch { settings = {} }
  const cfg = settings.email
  if (cfg && cfg.api_key && cfg.from_email) {
    return { provider: 'resend', api_key: cfg.api_key, from_email: cfg.from_email, from_name: cfg.from_name || 'Selección de personal', reply_to: cfg.reply_to }
  }
  // Respaldo: secreto del entorno.
  if (env.RESEND_API_KEY) {
    return { provider: 'resend', api_key: env.RESEND_API_KEY, from_email: (env as any).MAIL_FROM || 'onboarding@resend.dev', from_name: 'Selección de personal' }
  }
  return null
}

export function isEmailConfigured(env: Env, orgId: number, settingsRaw?: string): boolean {
  if (env.RESEND_API_KEY) return true
  try {
    const s = JSON.parse(settingsRaw || '{}')
    return !!(s?.email?.api_key && s?.email?.from_email)
  } catch {
    return false
  }
}

export type SendResult = { ok: boolean; provider: string; id?: string; error?: string }

export async function sendEmail(
  env: Env,
  cfg: EmailConfig,
  to: string,
  subject: string,
  text: string
): Promise<SendResult> {
  const from = cfg.from_name ? `${cfg.from_name} <${cfg.from_email}>` : String(cfg.from_email)
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.api_key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text,
        ...(cfg.reply_to ? { reply_to: cfg.reply_to } : {})
      })
    })
    const data: any = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, provider: 'resend', error: data?.message || `HTTP ${res.status}` }
    }
    return { ok: true, provider: 'resend', id: data?.id }
  } catch (e) {
    return { ok: false, provider: 'resend', error: String((e as Error)?.message ?? e) }
  }
}

/** Plantillas del proceso de selección. Texto plano: llega a cualquier cliente. */
export function templateInviteTest(opts: {
  candidate: string; job: string; test: string; link: string; org: string; duration?: number; due?: string
}): { subject: string; text: string } {
  return {
    subject: `Paso siguiente en tu postulación: ${opts.job}`,
    text: [
      `Hola ${opts.candidate},`,
      '',
      `Gracias por postular a "${opts.job}" en ${opts.org}.`,
      `El siguiente paso es una evaluación en línea: "${opts.test}"${opts.duration ? ` (${opts.duration} minutos aprox.)` : ''}.`,
      '',
      `Puedes realizarla aquí: ${opts.link}`,
      opts.due ? `\nFecha límite sugerida: ${opts.due}` : '',
      '',
      'Este enlace es personal: no lo compartas. Desde el mismo enlace puedes ver el estado de tu postulación y actualizar tu información.',
      '',
      'Saludos,',
      opts.org
    ].filter(Boolean).join('\n')
  }
}

export function templateStatus(opts: { candidate: string; job: string; status: string; org: string; link: string }): { subject: string; text: string } {
  return {
    subject: `Actualización de tu postulación: ${opts.job}`,
    text: [
      `Hola ${opts.candidate},`,
      '',
      `Tu postulación a "${opts.job}" está ahora en la etapa: ${opts.status}.`,
      '',
      `Puedes consultar el detalle aquí: ${opts.link}`,
      '',
      'Saludos,',
      opts.org
    ].join('\n')
  }
}

export function templateReceipt(opts: { candidate: string; job: string; org: string; link: string }): { subject: string; text: string } {
  return {
    subject: `Recibimos tu postulación: ${opts.job}`,
    text: [
      `Hola ${opts.candidate},`,
      '',
      `Confirmamos que recibimos tu postulación a "${opts.job}" y tu currículum quedó registrado.`,
      '',
      `Tu enlace personal de seguimiento (guárdalo, no necesitas contraseña):`,
      opts.link,
      '',
      'Desde ese enlace podrás ver en qué etapa estás, actualizar tus datos y realizar las pruebas que el equipo te asigne.',
      '',
      'Saludos,',
      opts.org
    ].join('\n')
  }
}
