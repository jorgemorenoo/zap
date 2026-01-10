'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Download, ExternalLink, RefreshCw, Trash2, UploadCloud } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { flowsService, type FlowRow } from '@/services/flowsService'
import { SendFlowDialog } from '@/components/features/flows/SendFlowDialog'

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('pt-BR')
}

function statusInfo(flow: FlowRow): { label: string; className: string } {
  const metaStatus = String(flow.meta_status || '').toUpperCase()
  const hasErrors = Array.isArray(flow.meta_validation_errors)
    ? flow.meta_validation_errors.length > 0
    : !!flow.meta_validation_errors

  if (metaStatus === 'PUBLISHED') {
    return { label: 'Publicado', className: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' }
  }

  if (metaStatus === 'REJECTED' || metaStatus === 'ERROR' || hasErrors) {
    return { label: 'Requer ação', className: 'bg-amber-500/10 text-amber-200 border-amber-500/20' }
  }

  if (metaStatus === 'PENDING' || metaStatus === 'IN_REVIEW') {
    return { label: 'Em revisão', className: 'bg-amber-500/10 text-amber-200 border-amber-500/20' }
  }

  if (metaStatus) {
    return { label: metaStatus, className: 'bg-zinc-500/10 text-gray-300 border-white/10' }
  }

  return { label: 'Rascunho', className: 'bg-white/5 text-gray-300 border-white/10' }
}

export function FlowPublishPanel({
  flows,
  isLoading,
  isFetching,
  onRefresh,
}: {
  flows: FlowRow[]
  isLoading: boolean
  isFetching: boolean
  onRefresh: () => void
}) {
  const queryClient = useQueryClient()
  const [publishingId, setPublishingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmFlow, setConfirmFlow] = useState<FlowRow | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [testFlowId, setTestFlowId] = useState<string | null>(null)
  const [isTestDialogOpen, setIsTestDialogOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'published' | 'review' | 'action'>('all')

  const sortedFlows = useMemo(() => {
    const rows = [...(flows || [])]
    rows.sort((a, b) => {
      const da = new Date(a.updated_at || a.created_at).getTime()
      const db = new Date(b.updated_at || b.created_at).getTime()
      return db - da
    })
    return rows
  }, [flows])

  const visibleFlows = sortedFlows.filter((flow) => {
    if (statusFilter === 'all') return true
    const metaStatus = String(flow.meta_status || '').toUpperCase()
    const hasErrors = Array.isArray(flow.meta_validation_errors)
      ? flow.meta_validation_errors.length > 0
      : !!flow.meta_validation_errors

    if (statusFilter === 'draft') return !metaStatus
    if (statusFilter === 'published') return metaStatus === 'PUBLISHED'
    if (statusFilter === 'review') return metaStatus === 'PENDING' || metaStatus === 'IN_REVIEW'
    if (statusFilter === 'action') return metaStatus === 'REJECTED' || metaStatus === 'ERROR' || hasErrors
    return true
  })

  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev
      const visibleIds = new Set(visibleFlows.map((flow) => flow.id))
      let changed = false
      const next = new Set<string>()
      prev.forEach((id) => {
        if (visibleIds.has(id)) {
          next.add(id)
        } else {
          changed = true
        }
      })
      if (!changed && next.size === prev.size) return prev
      return next
    })
  }, [visibleFlows])

  const filterCounts = useMemo(() => {
    const counts = { all: sortedFlows.length, draft: 0, published: 0, review: 0, action: 0 }
    for (const flow of sortedFlows) {
      const metaStatus = String(flow.meta_status || '').toUpperCase()
      const hasErrors = Array.isArray(flow.meta_validation_errors)
        ? flow.meta_validation_errors.length > 0
        : !!flow.meta_validation_errors

      if (!metaStatus) counts.draft += 1
      if (metaStatus === 'PUBLISHED') counts.published += 1
      if (metaStatus === 'PENDING' || metaStatus === 'IN_REVIEW') counts.review += 1
      if (metaStatus === 'REJECTED' || metaStatus === 'ERROR' || hasErrors) counts.action += 1
    }
    return counts
  }, [sortedFlows])

  const selectedCount = selectedIds.size
  const allVisibleSelected = visibleFlows.length > 0 && visibleFlows.every((flow) => selectedIds.has(flow.id))

  const handlePublish = async (flow: FlowRow) => {
    try {
      setPublishingId(flow.id)
      await flowsService.publishToMeta(flow.id, {
        publish: true,
        categories: ['OTHER'],
        updateIfExists: true,
      })
      toast.success('MiniApp enviado para a Meta')
      queryClient.invalidateQueries({ queryKey: ['flows'] })
      onRefresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao enviar para a Meta')
    } finally {
      setPublishingId(null)
    }
  }

  const handleDelete = async (flow: FlowRow) => {
    try {
      setDeletingId(flow.id)
      await flowsService.remove(flow.id)
      toast.success('MiniApp excluído')
      queryClient.invalidateQueries({ queryKey: ['flows'] })
      onRefresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao excluir MiniApp')
    } finally {
      setDeletingId(null)
      setConfirmFlow(null)
    }
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    try {
      setBulkDeleting(true)
      let deleted = 0
      let failed = 0
      for (const flowId of selectedIds) {
        try {
          await flowsService.remove(flowId)
          deleted += 1
        } catch {
          failed += 1
        }
      }
      if (deleted > 0) {
        toast.success(`${deleted} MiniApp(s) excluído(s)`)
      }
      if (failed > 0) {
        toast.error(`${failed} MiniApp(s) não puderam ser excluído(s)`)
      }
      setSelectedIds(new Set())
      queryClient.invalidateQueries({ queryKey: ['flows'] })
      onRefresh()
    } finally {
      setBulkDeleting(false)
      setConfirmBulkDelete(false)
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-6 shadow-[0_12px_30px_rgba(0,0,0,0.35)] space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-white">MiniApps do Builder</div>
          <div className="text-xs text-gray-400 mt-1">Edite, envie para a Meta e teste seus MiniApps.</div>
        </div>
        <Button
          type="button"
          variant="secondary"
          className="bg-zinc-950/40 border border-white/10 text-gray-200 hover:text-white hover:bg-white/5"
          onClick={onRefresh}
          disabled={isLoading || isFetching}
        >
          <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />
          Atualizar
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="text-amber-200 hover:text-amber-100 hover:bg-amber-500/10 border border-amber-500/20"
          onClick={() => setConfirmBulkDelete(true)}
          disabled={selectedCount === 0 || bulkDeleting}
        >
          <Trash2 className="h-4 w-4" />
          {selectedCount === 0 ? 'Excluir selecionados' : `Excluir (${selectedCount})`}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {[
          { id: 'all', label: 'Todos', count: filterCounts.all },
          { id: 'draft', label: 'Rascunho', count: filterCounts.draft },
          { id: 'published', label: 'Publicado', count: filterCounts.published },
          { id: 'review', label: 'Em revisão', count: filterCounts.review },
          { id: 'action', label: 'Requer ação', count: filterCounts.action },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setStatusFilter(item.id as typeof statusFilter)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-semibold transition',
              statusFilter === item.id
                ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
                : 'border-white/10 bg-zinc-950/40 text-gray-300 hover:text-white',
            )}
          >
            {item.label} <span className="text-gray-500">({item.count})</span>
          </button>
        ))}
        <div className="text-xs text-gray-500">
          {isLoading ? 'Carregando…' : `${sortedFlows.length} MiniApp(s)`}
          {isFetching && !isLoading ? ' (atualizando…)': ''}
        </div>
      </div>

      {sortedFlows.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-zinc-950/40 p-4 text-sm text-gray-400">
          Nenhum MiniApp ainda. Crie no builder para começar.
        </div>
      ) : (
        <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-950/60 border-b border-white/10 text-gray-500 uppercase tracking-widest text-[11px]">
                <tr>
                  <th className="px-4 py-3 font-semibold w-10">
                    <input
                      type="checkbox"
                      aria-label="Selecionar todos"
                      checked={allVisibleSelected}
                      onChange={(event) => {
                        if (event.target.checked) {
                          setSelectedIds(new Set(visibleFlows.map((flow) => flow.id)))
                        } else {
                          setSelectedIds(new Set())
                        }
                      }}
                      className="h-4 w-4 rounded border-white/20 bg-zinc-950/40 text-emerald-400"
                    />
                  </th>
                  <th className="px-4 py-3 font-semibold">Nome</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">ID da MiniApp (Meta)</th>
                  <th className="px-4 py-3 font-semibold">Atualizado</th>
                  <th className="px-4 py-3 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {visibleFlows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                      Nenhuma MiniApp nesse filtro.
                    </td>
                  </tr>
                ) : (
                  visibleFlows.map((flow) => {
                    const status = statusInfo(flow)
                    const isPublishing = publishingId === flow.id
                    const isDeleting = deletingId === flow.id
                    const canTest = !!flow.meta_flow_id
                    const exportHref = flow.meta_flow_id
                      ? `/api/flows/submissions/report.csv?flowId=${encodeURIComponent(flow.meta_flow_id)}`
                      : ''
                    return (
                      <tr key={flow.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            aria-label={`Selecionar ${flow.name}`}
                            checked={selectedIds.has(flow.id)}
                            onChange={(event) => {
                              setSelectedIds((prev) => {
                                const next = new Set(prev)
                                if (event.target.checked) next.add(flow.id)
                                else next.delete(flow.id)
                                return next
                              })
                            }}
                            className="h-4 w-4 rounded border-white/20 bg-zinc-950/40 text-emerald-400"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-semibold text-white">{flow.name}</div>
                          {flow.meta_preview_url ? (
                            <a
                              className="mt-1 inline-flex items-center gap-1 text-[11px] text-gray-400 hover:text-white underline underline-offset-2"
                              href={String(flow.meta_preview_url)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Abrir preview
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn('inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border', status.className)}>
                            {status.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-300 font-mono">
                          {flow.meta_flow_id || '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">
                          {formatDateTime(flow.updated_at || flow.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <Button
                              size="sm"
                              onClick={() => handlePublish(flow)}
                              disabled={isPublishing}
                              className="bg-white text-black hover:bg-gray-200"
                            >
                              <UploadCloud className={cn('h-4 w-4', isPublishing ? 'animate-pulse' : '')} />
                              {isPublishing ? 'Enviando…' : (status.label === 'Publicado' ? 'Atualizar envio' : 'Enviar para Meta')}
                            </Button>
                            <Link href={`/flows/builder/${encodeURIComponent(flow.id)}`}>
                              <Button size="sm" variant="secondary">Abrir</Button>
                            </Link>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                if (!flow.meta_flow_id) return
                                setTestFlowId(String(flow.meta_flow_id))
                                setIsTestDialogOpen(true)
                              }}
                              disabled={!canTest}
                            >
                              Testar
                            </Button>
                            {canTest ? (
                              <Button size="sm" variant="outline" asChild>
                                <a href={exportHref} download title="Baixar submissões do MiniApp">
                                  <Download className="h-4 w-4" />
                                  Submissões CSV
                                </a>
                              </Button>
                            ) : (
                              <Button size="sm" variant="outline" disabled>
                                <Download className="h-4 w-4" />
                                Submissões CSV
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setConfirmFlow(flow)}
                              disabled={isDeleting}
                              className="text-amber-300 hover:text-amber-200"
                            >
                              <Trash2 className="h-4 w-4" />
                              Excluir
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
        </div>
      )}

      <Dialog open={!!confirmFlow} onOpenChange={(open) => !open && setConfirmFlow(null)}>
        <DialogContent className="sm:max-w-md bg-zinc-900/80 border border-amber-500/20 text-white">
          <DialogHeader>
            <DialogTitle>Excluir MiniApp</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-gray-300">
            MiniApp: <span className="font-semibold">{confirmFlow?.name}</span>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmFlow(null)} className="border-white/10 bg-zinc-950/40 text-gray-200 hover:text-white hover:bg-white/5">
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmFlow && handleDelete(confirmFlow)}
              disabled={!confirmFlow || deletingId === confirmFlow.id}
              className="bg-amber-500/10 text-amber-200 border border-amber-500/30 hover:bg-amber-500/15"
            >
              {deletingId === confirmFlow?.id ? 'Excluindo…' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SendFlowDialog
        hideTrigger
        open={isTestDialogOpen}
        onOpenChange={(open) => {
          setIsTestDialogOpen(open)
          if (!open) setTestFlowId(null)
        }}
        prefillFlowId={testFlowId || undefined}
        flows={flows}
        isLoadingFlows={isFetching}
        onRefreshFlows={onRefresh}
      />

      <Dialog open={confirmBulkDelete} onOpenChange={(open) => !open && setConfirmBulkDelete(false)}>
        <DialogContent className="sm:max-w-md bg-zinc-900/80 border border-amber-500/20 text-white">
          <DialogHeader>
            <DialogTitle>Excluir MiniApps selecionados</DialogTitle>
            <DialogDescription className="text-gray-400">
              {selectedCount} MiniApp(s) serão excluído(s) permanentemente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmBulkDelete(false)}
              className="border-white/10 bg-zinc-950/40 text-gray-200 hover:text-white hover:bg-white/5"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="bg-amber-500/10 text-amber-200 border border-amber-500/30 hover:bg-amber-500/15"
            >
              {bulkDeleting ? 'Excluindo…' : 'Excluir selecionados'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
