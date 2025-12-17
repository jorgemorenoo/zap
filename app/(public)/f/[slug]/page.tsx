'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { InternationalPhoneInput } from '@/components/ui/international-phone-input'

type PublicLeadForm = {
  id: string
  name: string
  slug: string
  isActive: boolean
  successMessage?: string | null
  fields?: Array<{
    key: string
    label: string
    type: 'text' | 'number' | 'date' | 'select'
    required?: boolean
    options?: string[]
  }>
}

export default function PublicLeadFormPage() {
  // Em Next.js 16, páginas Client podem não receber `params` da forma tradicional.
  // `useParams()` é a forma mais confiável para obter o slug no client.
  const params = useParams<{ slug?: string | string[] }>()
  const slug = useMemo(() => {
    const raw = params?.slug
    if (Array.isArray(raw)) return String(raw[0] || '')
    return String(raw || '')
  }, [params])

  const [form, setForm] = useState<PublicLeadForm | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('') // honeypot
  const [customFields, setCustomFields] = useState<Record<string, any>>({})

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      setLoadError(null)

      try {
        const resp = await fetch(`/api/public/lead-forms/${encodeURIComponent(slug)}`, {
          cache: 'no-store',
        })

        if (!resp.ok) {
          const payload = await resp.json().catch(() => ({}))
          throw new Error(payload?.error || 'Formulário não encontrado')
        }

        const data = (await resp.json()) as PublicLeadForm
        if (cancelled) return

        setForm(data)
      } catch (e: any) {
        if (cancelled) return
        setLoadError(String(e?.message || 'Falha ao carregar formulário'))
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    if (slug) load()
    else {
      setLoadError('Link inválido')
      setIsLoading(false)
    }

    return () => {
      cancelled = true
    }
  }, [slug])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError(null)
    setSuccessMessage(null)

    if (!form) return

    setIsSubmitting(true)
    try {
      const resp = await fetch(`/api/public/lead-forms/${encodeURIComponent(slug)}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone,
          email: email.trim() ? email.trim() : null,
          custom_fields: customFields,
          website,
        }),
      })

      const payload = await resp.json().catch(() => ({}))

      if (!resp.ok) {
        // Se vier mapa de erros do Zod, tenta mostrar algo legível.
        const zodDetails = payload?.details
        if (zodDetails && typeof zodDetails === 'object') {
          const firstKey = Object.keys(zodDetails)[0]
          const firstMsg = firstKey ? (zodDetails[firstKey]?.[0] as string | undefined) : undefined
          throw new Error(firstMsg || payload?.error || 'Dados inválidos')
        }

        throw new Error(payload?.error || 'Falha ao enviar')
      }

      setSuccessMessage(payload?.message || form.successMessage || 'Cadastro recebido! Obrigado.')
      setName('')
      setPhone('')
      setEmail('')
      setWebsite('')
      setCustomFields({})
    } catch (e: any) {
      setSubmitError(String(e?.message || 'Falha ao enviar formulário'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-0px)] bg-zinc-950 px-4 py-10 text-zinc-100">
      <div className="mx-auto w-full max-w-lg">
        <Card className="border-zinc-800 bg-zinc-900/60 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-2xl">{isLoading ? 'Carregando…' : (form?.name || 'Formulário')}</CardTitle>
            <CardDescription className="text-zinc-400">
              Preencha seus dados para ser adicionado automaticamente na lista.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {loadError ? (
              <div className="rounded-xl border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-200">
                {loadError}
              </div>
            ) : null}

            {successMessage ? (
              <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/30 p-4 text-sm text-emerald-100">
                {successMessage}
              </div>
            ) : null}

            {!loadError && !successMessage ? (
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Seu nome"
                    className="bg-zinc-800 border-zinc-700"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label>Telefone (WhatsApp)</Label>
                  <InternationalPhoneInput
                    value={phone}
                    onChange={setPhone}
                    // Importante: manter SSR/CSR determinístico para evitar hydration mismatch
                    // (React error #418 em produção).
                    defaultCountry="br"
                    preferredCountries={["br", "us", "pt", "mx", "ar", "cl", "co", "es"]}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email (opcional)</Label>
                  <Input
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@exemplo.com"
                    className="bg-zinc-800 border-zinc-700"
                    type="email"
                  />
                </div>

                {(form?.fields || []).length > 0 ? (
                  <div className="space-y-4">
                    {(form?.fields || []).map((f) => {
                      const key = f.key
                      const value = customFields?.[key] ?? ''

                      if (f.type === 'select') {
                        return (
                          <div key={key} className="space-y-2">
                            <Label>
                              {f.label}{f.required ? ' *' : ''}
                            </Label>
                            <select
                              className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 text-sm"
                              value={String(value)}
                              onChange={(e) =>
                                setCustomFields((prev) => ({ ...prev, [key]: e.target.value }))
                              }
                              required={!!f.required}
                            >
                              <option value="">Selecionar…</option>
                              {(f.options || []).map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          </div>
                        )
                      }

                      const inputType = f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'

                      return (
                        <div key={key} className="space-y-2">
                          <Label htmlFor={`cf_${key}`}>
                            {f.label}{f.required ? ' *' : ''}
                          </Label>
                          <Input
                            id={`cf_${key}`}
                            value={String(value)}
                            onChange={(e) => setCustomFields((prev) => ({ ...prev, [key]: e.target.value }))}
                            className="bg-zinc-800 border-zinc-700"
                            type={inputType}
                            required={!!f.required}
                          />
                        </div>
                      )
                    })}
                  </div>
                ) : null}

                {/* Honeypot anti-spam (não mostrar) */}
                <div style={{ display: 'none' }}>
                  <Label htmlFor="website">Website</Label>
                  <Input id="website" value={website} onChange={(e) => setWebsite(e.target.value)} />
                </div>

                {submitError ? (
                  <div className="rounded-xl border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">
                    {submitError}
                  </div>
                ) : null}

                <Button type="submit" className="w-full" disabled={isSubmitting || isLoading || !form}>
                  {isSubmitting ? 'Enviando…' : 'Enviar'}
                </Button>

                <p className="text-xs text-zinc-500">
                  Ao enviar, você concorda em receber mensagens relacionadas ao conteúdo/curso.
                </p>
              </form>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
