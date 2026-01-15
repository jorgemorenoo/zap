'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { nanoid } from 'nanoid'

import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

import {
  FlowFormFieldType,
  FlowFormSpecV1,
  generateFlowJsonFromFormSpec,
  normalizeFlowFieldName,
  normalizeFlowFormSpec,
  validateFlowFormSpec,
} from '@/lib/flow-form'
import { FLOW_TEMPLATES } from '@/lib/flow-templates'

import {
  FormHeader,
  FormMetadata,
  FieldList,
  IssuesAlert,
  AIGenerateDialog,
  TemplateImportDialog,
  FlowFormBuilderProps,
  TemplateImportResult,
  createNewField,
  moveItem,
} from './form-builder'

export function FlowFormBuilder(props: FlowFormBuilderProps) {
  // ─────────────────────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────────────────────

  const initialForm = useMemo(() => {
    const s = (props.currentSpec as any) || {}
    return normalizeFlowFormSpec(s?.form, props.flowName)
  }, [props.currentSpec, props.flowName])

  const [form, setForm] = useState<FlowFormSpecV1>(initialForm)
  const [dirty, setDirty] = useState(false)
  // Guarda o flowJson dinâmico se um template dinâmico foi importado
  const [dynamicFlowJson, setDynamicFlowJson] = useState<Record<string, unknown> | null>(null)

  const [aiOpen, setAiOpen] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [showIntro, setShowIntro] = useState(false)
  const [lastAddedId, setLastAddedId] = useState<string | null>(null)

  const showHeaderActions = props.showHeaderActions !== false
  const showTechFields = props.showTechFields !== false
  const questionRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // ─────────────────────────────────────────────────────────────────────────────
  // Effects
  // ─────────────────────────────────────────────────────────────────────────────

  // Register external actions
  useEffect(() => {
    if (!props.registerActions) return
    props.registerActions({
      openAI: () => setAiOpen(true),
      openTemplate: () => setTemplateOpen(true),
      setScreenId: (value: string) => update({ screenId: value }),
    })
  }, [props])

  // Reset form when initialForm changes (only if not dirty)
  useEffect(() => {
    if (dirty) return
    setForm(initialForm)
  }, [dirty, initialForm])

  // Sync form title with flowName
  useEffect(() => {
    if (!props.flowName) return
    setForm((prev) => {
      if (prev.title === props.flowName) return prev
      return { ...prev, title: props.flowName }
    })
  }, [props.flowName])

  // Auto-focus newly added fields
  useEffect(() => {
    if (!lastAddedId) return
    const target = questionRefs.current[lastAddedId]
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      target.focus()
    }
    setLastAddedId(null)
  }, [lastAddedId])

  // Show intro if form has intro content
  useEffect(() => {
    if (!form.intro) return
    setShowIntro(true)
  }, [form.intro])

  // Computed values
  const issues = useMemo(() => validateFlowFormSpec(form), [form])
  const generatedJson = useMemo(() => generateFlowJsonFromFormSpec(form), [form])

  // Notify parent of preview changes
  useEffect(() => {
    props.onPreviewChange?.({
      form,
      generatedJson,
      issues,
      dirty,
    })
  }, [dirty, form, generatedJson, issues, props.onPreviewChange])

  const canSave = issues.length === 0 && dirty && !props.isSaving

  // ─────────────────────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────────────────────

  const update = (patch: Partial<FlowFormSpecV1>) => {
    setForm((prev) => ({ ...prev, ...patch }))
    setDirty(true)
  }

  const updateField = (idx: number, patch: any) => {
    setForm((prev) => {
      const fields = [...prev.fields]
      fields[idx] = { ...fields[idx], ...patch }
      return { ...prev, fields }
    })
    setDirty(true)
  }

  const addField = (type: FlowFormFieldType) => {
    const nextField = createNewField(type)
    setForm((prev) => ({ ...prev, fields: [...prev.fields, nextField] }))
    setDirty(true)
    setLastAddedId(nextField.id)
  }

  const moveField = (idx: number, direction: 'up' | 'down') => {
    const newIdx = direction === 'up' ? Math.max(0, idx - 1) : Math.min(form.fields.length - 1, idx + 1)
    setForm((prev) => ({ ...prev, fields: moveItem(prev.fields, idx, newIdx) }))
    setDirty(true)
  }

  const duplicateField = (idx: number) => {
    setForm((prev) => {
      const f = prev.fields[idx]
      const copy = {
        ...f,
        id: `q_${nanoid(8)}`,
        name: normalizeFlowFieldName(`${f.name}_copy_${nanoid(3)}`) || `campo_${nanoid(4)}`,
      }
      const fields = [...prev.fields]
      fields.splice(idx + 1, 0, copy)
      return { ...prev, fields }
    })
    setDirty(true)
  }

  const removeField = (idx: number) => {
    setForm((prev) => ({ ...prev, fields: prev.fields.filter((_, i) => i !== idx) }))
    setDirty(true)
  }

  const save = () => {
    const baseSpec = props.currentSpec && typeof props.currentSpec === 'object' ? (props.currentSpec as any) : {}
    const nextForm = { ...form, title: (props.flowName || form.title || 'MiniApp').trim() || 'MiniApp' }
    const nextSpec = { ...baseSpec, form: nextForm }

    // Se temos um flowJson dinâmico (de template dinâmico), usa ele em vez de gerar do form
    const finalFlowJson = dynamicFlowJson || generateFlowJsonFromFormSpec(nextForm)

    props.onSave({
      spec: nextSpec,
      flowJson: finalFlowJson,
    })
    setDirty(false)
  }

  const handleAIGenerated = (generatedForm: FlowFormSpecV1) => {
    setForm((prev) => ({ ...generatedForm, screenId: prev.screenId || generatedForm.screenId }))
    setDirty(true)
  }

  const handleTemplateImported = (result: TemplateImportResult) => {
    setForm(result.form)
    // Se é template dinâmico, guarda o flowJson para usar ao salvar
    setDynamicFlowJson(result.dynamicFlowJson || null)
    setDirty(true)
  }

  const handleOpenTemplate = () => {
    setTemplateOpen(true)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header with AI and Template buttons */}
      <FormHeader
        showHeaderActions={showHeaderActions}
        onOpenAI={() => setAiOpen(true)}
        onOpenTemplate={handleOpenTemplate}
      />

      {/* Form metadata (intro, screenId, status) */}
      <FormMetadata
        form={form}
        showIntro={showIntro}
        showTechFields={showTechFields}
        dirty={dirty}
        issues={issues}
        canSave={canSave}
        onUpdate={update}
        onSave={save}
      />

      {/* Field list with issues alert */}
      <div>
        <FieldList
          fields={form.fields}
          questionRefs={questionRefs}
          onUpdateField={updateField}
          onMoveField={moveField}
          onDuplicateField={duplicateField}
          onRemoveField={removeField}
          onAddField={addField}
        />
        <IssuesAlert issues={issues} />
      </div>

      {/* Submit button label */}
      <div className="space-y-2">
        <label className="block text-xs uppercase tracking-widest text-gray-500">
          Botão (última ação)
        </label>
        <Input value={form.submitLabel} onChange={(e) => update({ submitLabel: e.target.value })} />
      </div>

      <div className="flex items-center justify-between rounded-xl border border-white/10 bg-zinc-950/40 px-3 py-2">
        <div>
          <div className="text-xs font-medium text-gray-300">Enviar confirmação ao usuário</div>
          <div className="text-[11px] text-gray-500">Mostra o resumo das respostas após finalizar</div>
        </div>
        <Switch
          checked={form.sendConfirmation !== false}
          onCheckedChange={(checked) => update({ sendConfirmation: checked })}
        />
      </div>

      <div className="space-y-2">
        <label className="block text-xs uppercase tracking-widest text-gray-500">
          Texto da confirmação (opcional)
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input
            value={form.confirmationTitle || ''}
            onChange={(e) => update({ confirmationTitle: e.target.value })}
            placeholder="Resposta registrada ✅"
          />
          <Input
            value={form.confirmationFooter || ''}
            onChange={(e) => update({ confirmationFooter: e.target.value })}
            placeholder="Qualquer ajuste, responda esta mensagem."
          />
        </div>
      </div>

      {/* Dialogs */}
      <AIGenerateDialog
        open={aiOpen}
        onOpenChange={setAiOpen}
        flowName={props.flowName}
        onGenerated={handleAIGenerated}
        onActionComplete={props.onActionComplete}
      />

      <TemplateImportDialog
        open={templateOpen}
        onOpenChange={setTemplateOpen}
        flowName={props.flowName}
        onImported={handleTemplateImported}
        onActionComplete={props.onActionComplete}
      />
    </div>
  )
}
