'use client'

import { useEffect, useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
    LayoutDashboard,
    MessageSquare,
    Users,
    Settings,
    Plus,
    LogOut,
    Menu,
    X,
    Bell,
    Zap,
    ChevronLeft,
    ChevronRight,
    FileText,
    ClipboardList,
    AlertTriangle,
    CheckCircle2,
    RefreshCw,
    Database,
    MessageCircle,
    Sparkles,
    ExternalLink,
    Workflow
} from 'lucide-react'
import React from 'react'
import { HealthStatus } from '@/lib/health-check'
import { getPageWidthClass, PageLayoutProvider, usePageLayout } from '@/components/providers/PageLayoutProvider'
import { campaignService, contactService, templateService, settingsService } from '@/services'
import { dashboardService } from '@/services/dashboardService'

// Setup step interface
interface SetupStep {
    id: 'database' | 'qstash' | 'whatsapp'
    title: string
    description: string
    status: 'pending' | 'configured' | 'error'
    icon: React.ReactNode
    actionLabel?: string
    actionUrl?: string
    errorMessage?: string
    isRequired: boolean
    instructions: string[]
    helpUrl?: string
}

// Onboarding Overlay Component
const OnboardingOverlay = ({
    health,
    isLoading,
    onRefresh
}: {
    health: HealthStatus | null
    isLoading: boolean
    onRefresh: () => void
}) => {
    // Build setup steps from health status
    const steps: SetupStep[] = [
        {
            id: 'database',
            title: 'Supabase Database',
            description: 'Banco de dados PostgreSQL',
            status: health?.services.database?.status === 'ok'
                ? 'configured'
                : health?.services.database?.status === 'error'
                    ? 'error'
                    : 'pending',
            icon: React.createElement(Database, { size: 20, className: 'text-emerald-400' }),
            actionLabel: 'Abrir Assistente de Configuração',
            actionUrl: '/setup',
            errorMessage: health?.services.database?.message,
            isRequired: true,
            instructions: [
                'Detectamos que o banco de dados não está conectado.',
                'Utilize nosso assistente para configurar automaticamente.',
                'Você poderá usar a Connection String ou chaves manuais.',
            ],
        },

        {
            id: 'qstash',
            title: 'QStash (Upstash)',
            description: 'Filas de processamento',
            status: health?.services.qstash.status === 'ok'
                ? 'configured'
                : health?.services.qstash.status === 'error'
                    ? 'error'
                    : 'pending',
            icon: React.createElement(Zap, { size: 20, className: 'text-purple-400' }),
            actionLabel: 'Configurar no Assistente',
            actionUrl: '/setup',
            errorMessage: health?.services.qstash.message,
            isRequired: true,
            instructions: [
                'QStash gerencia as filas de background.',
                'Configure facilmente através do assistente.',
            ],
            helpUrl: 'https://upstash.com/docs/qstash/overall/getstarted',
        },
        {
            id: 'whatsapp',
            title: 'WhatsApp Business',
            description: 'Credenciais da Meta',
            status: health?.services.whatsapp.status === 'ok'
                ? 'configured'
                : health?.services.whatsapp.status === 'error'
                    ? 'error'
                    : 'pending',
            icon: React.createElement(MessageCircle, { size: 20, className: 'text-green-400' }),
            errorMessage: health?.services.whatsapp.message,
            isRequired: true,
            actionLabel: 'Configurar WhatsApp',
            actionUrl: '/setup',
            instructions: [
                'Configure as credenciais do WhatsApp Business.',
                'Use o assistente para validar o token.',
            ],
            helpUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api/get-started',
        },
    ]

    const completedSteps = steps.filter(s => s.status === 'configured').length
    const progressPercent = (completedSteps / steps.length) * 100
    const infrastructureReady = steps
        .filter(s => s.id === 'database' || s.id === 'qstash')
        .every(s => s.status === 'configured')

    return (
        <div className="min-h-screen bg-grid-dots flex items-center justify-center p-6">
            <div className="max-w-2xl w-full">
                {/* Header */}
                <div className="text-center mb-10">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-linear-to-br from-primary-500 to-emerald-600 mb-6 shadow-lg shadow-primary-500/20">
                        <Sparkles size={40} className="text-white" />
                    </div>
                    <h1 className="text-4xl font-bold text-white tracking-tight mb-3">
                        Configuração Necessária
                    </h1>
                    <p className="text-gray-400 text-lg max-w-md mx-auto mb-6">
                        Para utilizar o sistema, precisamos configurar os serviços essenciais. Utilize nosso assistente para facilitar o processo.
                    </p>
                    <a
                        href="/setup"
                        className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg hover:shadow-primary-500/25"
                    >
                        <Sparkles size={18} />
                        Iniciar Assistente de Configuração
                    </a>
                </div>

                {/* Progress Bar */}
                <div className="mb-8">
                    <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-gray-400">
                            Progresso: {completedSteps}/{steps.length} configurados
                        </span>
                        <button
                            onClick={onRefresh}
                            disabled={isLoading}
                            className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors"
                        >
                            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                            Verificar novamente
                        </button>
                    </div>
                    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-linear-to-r from-primary-500 to-emerald-500 transition-all duration-500"
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>

                    {/* Redeploy warning */}
                    {completedSteps === 0 && (
                        <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                            <p className="text-sm text-amber-300 mb-2">
                                💡 <strong>Importante:</strong> Após configurar QStash, faça um <strong>redeploy</strong> para ativar as variáveis.
                            </p>
                            <div className="flex gap-2">
                                {health?.vercel?.dashboardUrl && (
                                    <a
                                        href={`${health.vercel.dashboardUrl}/deployments`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg transition-colors"
                                    >
                                        Abrir Deployments →
                                    </a>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Steps */}
                <div className="space-y-4">
                    {
                        steps.map((step, index) => {
                            const isPending = step.status === 'pending'
                            const isConfigured = step.status === 'configured'
                            const isError = step.status === 'error'

                            const previousStepsConfigured = steps
                                .slice(0, index)
                                .filter(s => s.isRequired)
                                .every(s => s.status === 'configured')
                            const isNextStep = isPending && previousStepsConfigured

                            return (
                                <div
                                    key={step.id}
                                    className={`relative rounded-2xl border transition-all duration-300 overflow-hidden ${isConfigured
                                        ? 'bg-emerald-500/5 border-emerald-500/30'
                                        : isError
                                            ? 'bg-red-500/5 border-red-500/30'
                                            : isNextStep
                                                ? 'bg-primary-500/5 border-primary-500/30 ring-2 ring-primary-500/20'
                                                : 'bg-zinc-900/50 border-white/10 opacity-60'
                                        }`}
                                >
                                    {/* Step number badge */}
                                    <div className={`absolute top-4 left-4 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${isConfigured
                                        ? 'bg-emerald-500 text-white'
                                        : isError
                                            ? 'bg-red-500 text-white'
                                            : isNextStep
                                                ? 'bg-primary-500 text-white'
                                                : 'bg-zinc-700 text-gray-400'
                                        }`}>
                                        {isConfigured ? <CheckCircle2 size={16} /> : index + 1}
                                    </div>

                                    <div className="pl-16 pr-6 py-5">
                                        {/* Header */}
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <h3 className={`font-semibold ${isConfigured ? 'text-emerald-400' : isError ? 'text-red-400' : 'text-white'
                                                    }`}>
                                                    {step.title}
                                                </h3>
                                                {step.isRequired && !isConfigured && (
                                                    <span className="px-1.5 py-0.5 bg-white/10 text-gray-400 text-[10px] font-medium rounded">
                                                        OBRIGATÓRIO
                                                    </span>
                                                )}
                                            </div>
                                            {isConfigured && (
                                                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                                                    {step.icon}
                                                </div>
                                            )}
                                        </div>

                                        <p className="text-sm text-gray-400">
                                            {step.description}
                                        </p>

                                        {isError && step.errorMessage && (
                                            <div className="flex items-start gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2 mt-3">
                                                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                                                <span>{step.errorMessage}</span>
                                            </div>
                                        )}

                                        {isConfigured && (
                                            <div className="flex items-center gap-2 text-sm text-emerald-400 mt-3">
                                                <CheckCircle2 size={14} />
                                                <span>Configurado</span>
                                            </div>
                                        )}

                                        {/* Instructions + Action - TOGETHER */}
                                        {isNextStep && step.instructions.length > 0 && (
                                            <div className="mt-4 bg-zinc-800/50 rounded-xl p-4 border border-white/5">
                                                <ol className="space-y-2 mb-4">
                                                    {step.instructions.map((instruction, i) => (
                                                        <li
                                                            key={i}
                                                            className="flex items-center gap-3 text-sm text-gray-300"
                                                        >
                                                            <span className="shrink-0 w-5 h-5 rounded-full bg-primary-500/20 text-primary-400 flex items-center justify-center text-xs font-bold">
                                                                {i + 1}
                                                            </span>
                                                            <span>{instruction}</span>
                                                        </li>
                                                    ))}
                                                </ol>

                                                {/* Action button INSIDE the instructions box */}
                                                {step.actionUrl && (
                                                    <a
                                                        href={step.actionUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium text-sm bg-primary-500 hover:bg-primary-400 text-white transition-all"
                                                    >
                                                        {step.actionLabel}
                                                        <ExternalLink size={14} />
                                                    </a>
                                                )}

                                                {step.helpUrl && (
                                                    <a
                                                        href={step.helpUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                                                    >
                                                        <span>Precisa de ajuda? Ver documentação</span>
                                                    </a>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {index < steps.length - 1 && (
                                        <div className="absolute -bottom-4 left-7 z-10">
                                            <div className={`w-0.5 h-8 ${isConfigured ? 'bg-emerald-500/30' : 'bg-zinc-700'}`} />
                                        </div>
                                    )}
                                </div>
                            )
                        })
                    }
                </div >

                {/* Bottom message */}
                {
                    infrastructureReady && steps.find(s => s.id === 'whatsapp')?.status !== 'configured' && (
                        <div className="mt-8 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                            <div className="flex items-start gap-3">
                                <div className="p-2 bg-amber-500/20 rounded-lg">
                                    <MessageCircle size={20} className="text-amber-400" />
                                </div>
                                <div>
                                    <h4 className="font-medium text-amber-300 mb-1">
                                        Infraestrutura pronta!
                                    </h4>
                                    <p className="text-sm text-amber-200/70">
                                        QStash está configurado. Agora adicione suas credenciais do WhatsApp
                                        na página de configurações.
                                    </p>
                                    <Link
                                        href="/settings"
                                        prefetch={false}
                                        className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-medium rounded-lg transition-colors"
                                    >
                                        Configurar WhatsApp
                                        <ChevronRight size={16} />
                                    </Link>
                                </div>
                            </div>
                        </div>
                    )
                }

                {
                    !infrastructureReady && (
                        <div className="mt-8 p-4 bg-zinc-800/50 border border-white/10 rounded-xl text-center">
                            <p className="text-gray-400 text-sm">
                                Complete os passos acima na ordem para liberar o acesso ao sistema.
                            </p>
                            <p className="text-gray-500 text-xs mt-2">
                                Após configurar cada serviço no Vercel, clique em "Verificar novamente".
                            </p>
                        </div>
                    )
                }

                {/* Help links */}
                <div className="mt-8 pt-6 border-t border-white/5">
                    <h4 className="text-sm font-medium text-gray-400 mb-3">Precisa de ajuda?</h4>
                    <div className="grid grid-cols-2 gap-3">
                        <a
                            href="https://vercel.com/docs/storage/upstash"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 p-3 bg-zinc-800/50 hover:bg-zinc-800 border border-white/10 rounded-xl text-sm text-gray-300 transition-colors"
                        >
                            <Database size={16} className="text-red-400" />
                            Docs: Upstash no Vercel
                            <ExternalLink size={12} className="text-gray-500 ml-auto" />
                        </a>
                        <a
                            href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 p-3 bg-zinc-800/50 hover:bg-zinc-800 border border-white/10 rounded-xl text-sm text-gray-300 transition-colors"
                        >
                            <MessageCircle size={16} className="text-green-400" />
                            Docs: WhatsApp Cloud API
                            <ExternalLink size={12} className="text-gray-500 ml-auto" />
                        </a>
                    </div>
                </div>
            </div >
        </div >
    )
}

import { PrefetchLink } from '@/components/ui/PrefetchLink'
import { AccountAlertBanner } from '@/components/ui/AccountAlertBanner'

export function DashboardShell({
    children,
    initialAuthStatus,
    initialHealthStatus
}: {
    children: React.ReactNode
    initialAuthStatus?: any
    initialHealthStatus?: HealthStatus | null
}) {
    const pathname = usePathname()
    const router = useRouter()
    const queryClient = useQueryClient()
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
    const [isLoggingOut, setIsLoggingOut] = useState(false)
    const [isSidebarExpanded, setIsSidebarExpanded] = useState(false)

    useEffect(() => {
        if (typeof window === 'undefined') return
        setIsSidebarExpanded(true)
        window.localStorage.setItem('app-sidebar-collapsed', 'false')
    }, [])

    const updateSidebarExpanded = useCallback((value: boolean) => {
        setIsSidebarExpanded(value)
        if (typeof window === 'undefined') return
        window.localStorage.setItem('app-sidebar-collapsed', value ? 'false' : 'true')
    }, [])

    // Enable real-time toast notifications for global events
    // This shows toasts when campaigns complete, new contacts are added, etc.
    const { useRealtimeNotifications } = require('@/hooks/useRealtimeNotifications')
    useRealtimeNotifications({ enabled: true })

    const { data: authStatus } = useQuery({
        queryKey: ['authStatus'],
        queryFn: async () => {
            const response = await fetch('/api/auth/status')
            if (!response.ok) throw new Error('Failed to fetch auth status')
            return response.json()
        },
        initialData: initialAuthStatus ?? undefined,
        staleTime: 5 * 60 * 1000,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
    })

    const companyName = authStatus?.company?.name || initialAuthStatus?.company?.name

    // Logout handler
    const handleLogout = async () => {
        setIsLoggingOut(true)
        try {
            await fetch('/api/auth/logout', { method: 'POST' })
            router.push('/login')
            router.refresh()
        } catch (error) {
            console.error('Logout error:', error)
        } finally {
            setIsLoggingOut(false)
        }
    }

    // Prefetch data on hover for faster page loads
    const prefetchRoute = useCallback((path: string) => {
        // console.log('Prefetching route:', path) // Debug
        switch (path) {
            case '/':
                queryClient.prefetchQuery({
                    queryKey: ['dashboardStats'],
                    queryFn: dashboardService.getStats,
                    staleTime: 15000,
                })
                queryClient.prefetchQuery({
                    queryKey: ['recentCampaigns'],
                    queryFn: dashboardService.getRecentCampaigns,
                    staleTime: 15000,
                })
                break
            case '/campaigns':
                queryClient.prefetchQuery({
                    queryKey: ['campaigns', { page: 1, search: '', status: 'All' }],
                    queryFn: () => campaignService.list({ limit: 20, offset: 0, search: '', status: 'All' }),
                    staleTime: 15000,
                })
                break
            case '/templates':
                queryClient.prefetchQuery({
                    queryKey: ['templates'],
                    queryFn: templateService.getAll,
                    staleTime: Infinity,
                })
                break
            case '/contacts':
                queryClient.prefetchQuery({
                    queryKey: ['contacts', { page: 1, search: '', status: 'ALL', tag: 'ALL' }],
                    queryFn: () => contactService.list({ limit: 10, offset: 0, search: '', status: 'ALL', tag: 'ALL' }),
                    staleTime: 30000,
                })
                break
            case '/settings':
                queryClient.prefetchQuery({
                    queryKey: ['systemStatus'],
                    queryFn: async () => {
                        const response = await fetch('/api/system')
                        if (!response.ok) throw new Error('Failed to fetch system status')
                        return response.json()
                    },
                    staleTime: 60000,
                })
                queryClient.prefetchQuery({
                    queryKey: ['settings'],
                    queryFn: settingsService.get,
                    staleTime: 60000,
                })
                break
        }
    }, [queryClient])

    // Health check query for onboarding
    const { data: healthStatus, refetch: refetchHealth, isFetching: isHealthFetching } = useQuery<HealthStatus>({
        queryKey: ['healthStatus'],
        queryFn: async () => {
            const response = await fetch('/api/health')
            if (!response.ok) throw new Error('Failed to fetch health')
            return response.json()
        },
        initialData: initialHealthStatus ?? undefined,
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        refetchInterval: (query) => {
            const data = query.state.data
            const isSetupComplete = data &&
                data.services.database?.status === 'ok' &&
                data.services.qstash?.status === 'ok'
            return isSetupComplete ? false : 30000 // Polling a cada 30s se não estiver configurado
        },
    })

    const needsSetup = !!healthStatus &&
        (healthStatus.services.database?.status !== 'ok' ||
            healthStatus.services.qstash.status !== 'ok')

    const navItems = [
        { path: '/', label: 'Dashboard', icon: LayoutDashboard },
        { path: '/campaigns', label: 'Campanhas', icon: MessageSquare },
        { path: '/workflows', label: 'Workflow', icon: Workflow, badge: 'beta' },
        { path: '/conversations', label: 'Conversas', icon: MessageCircle, hidden: true },
        { path: '/templates', label: 'Templates', icon: FileText },
        { path: '/contacts', label: 'Contatos', icon: Users },
        { path: '/settings/ai', label: 'IA', icon: Sparkles },
        { path: '/settings', label: 'Configurações', icon: Settings },
    ].filter(item => !item.hidden)

    const getPageTitle = (path: string) => {
        if (path === '/') return 'Dashboard'
        if (path === '/campaigns') return 'Campanhas'
        if (path.startsWith('/campaigns/new')) return 'Nova Campanha'
        if (path.startsWith('/campaigns/')) return 'Detalhes da Campanha'
        if (path === '/workflows') return 'Workflows'
        if (path === '/conversations') return 'Conversas'
        if (path.startsWith('/conversations/')) return 'Conversa'
        if (path.startsWith('/builder')) return 'Workflow'
        if (path === '/flows') return 'MiniApps'
        if (path === '/flows/builder') return 'MiniApp Builder'
        if (path.startsWith('/flows/builder/')) return 'Editor de MiniApp'
        if (path === '/templates') return 'Templates'
        if (path.startsWith('/contacts')) return 'Contatos'
        if (path === '/settings/ai') return 'Central de IA'
        if (path.startsWith('/settings')) return 'Configurações'
        return 'App'
    }

    // Show onboarding overlay if setup is needed
    if (needsSetup) {
        return (
            <OnboardingOverlay
                health={healthStatus || null}
                isLoading={isHealthFetching}
                onRefresh={() => refetchHealth()}
            />
        )
    }

    const isBuilderRoute = pathname?.startsWith('/builder') ?? false

    const CompactSidebar = (
        <aside
            className={`hidden lg:flex fixed lg:static inset-y-0 left-0 z-50 w-14 bg-zinc-950 border-r border-white/5 ${isSidebarExpanded ? 'lg:hidden' : ''}`}
            aria-label="Menu de navegação compacto"
        >
            <div className="flex h-full w-14 flex-col items-center gap-3 py-3">
                <button
                    type="button"
                    className="hidden lg:flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 focus-visible:outline-offset-2"
                    onClick={() => updateSidebarExpanded(true)}
                    title="Expandir menu"
                    aria-label="Expandir menu de navegação"
                >
                    <ChevronRight size={14} aria-hidden="true" />
                </button>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-linear-to-br from-primary-600 to-primary-800 shadow-lg shadow-primary-900/20" role="img" aria-label="Logo SmartZap">
                    <Zap className="text-white" size={18} fill="currentColor" aria-hidden="true" />
                </div>
                <nav className="flex flex-1 flex-col items-center gap-1.5 pt-1" aria-label="Menu principal">
                    {navItems.map((item) => (
                        <PrefetchLink
                            key={item.path}
                            href={item.path}
                            className={`group relative flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-gray-400 transition-colors hover:border-white/10 hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 ${pathname === item.path ? 'bg-white/5 text-white' : ''}`}
                            onMouseEnter={() => prefetchRoute(item.path)}
                            title={item.label}
                            aria-label={item.label}
                            aria-current={pathname === item.path ? 'page' : undefined}
                        >
                            <item.icon size={16} aria-hidden="true" />
                            {item.badge && (
                                <span className="absolute -right-1 -top-1 rounded-full bg-emerald-500/90 px-0.5 py-[1px] text-[7px] font-semibold uppercase tracking-wider text-black" aria-label={`${item.badge} - recurso em fase beta`}>
                                    {item.badge}
                                </span>
                            )}
                        </PrefetchLink>
                    ))}
                </nav>
                <button
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-gray-400 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-500 focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Sair"
                    aria-label="Sair da conta"
                >
                    {isLoggingOut ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-500 border-t-white" role="status" aria-label="Saindo..." />
                    ) : (
                        <LogOut size={16} aria-hidden="true" />
                    )}
                </button>
                <div className="text-[10px] text-gray-700 font-mono" aria-label={`Versão ${process.env.NEXT_PUBLIC_APP_VERSION}`}>
                    v{process.env.NEXT_PUBLIC_APP_VERSION}
                </div>
            </div>
        </aside>
    )

    const ExpandedSidebar = (
        <aside
            className={`fixed inset-y-0 left-0 z-50 w-56 bg-zinc-950 border-r border-white/5 transform transition-transform duration-200 ease-in-out ${isSidebarExpanded || isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
                }`}
            aria-label="Menu de navegação expandido"
        >
            <div className="flex h-full flex-col p-4">
                <div className="h-16 flex items-center px-2 mb-6">
                    <div className="w-10 h-10 bg-linear-to-br from-primary-600 to-primary-800 rounded-xl flex items-center justify-center mr-3 shadow-lg shadow-primary-900/20 border border-white/10" role="img" aria-label="Logo SmartZap">
                        <Zap className="text-white" size={20} fill="currentColor" aria-hidden="true" />
                    </div>
                    <div>
                        <span className="text-xl font-bold text-white tracking-tight block">SmartZap</span>
                    </div>
                    <button
                        type="button"
                        className="ml-auto h-7 w-7 items-center justify-center rounded-md border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 transition-colors hidden lg:flex focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 focus-visible:outline-offset-2"
                        onClick={() => updateSidebarExpanded(false)}
                        title="Recolher menu"
                        aria-label="Recolher menu de navegação"
                    >
                        <ChevronLeft size={14} aria-hidden="true" />
                    </button>
                    <button
                        className="ml-auto lg:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 focus-visible:outline-offset-2 rounded-md p-1"
                        onClick={() => setIsMobileMenuOpen(false)}
                        aria-label="Fechar menu"
                    >
                        <X size={20} className="text-gray-400" aria-hidden="true" />
                    </button>
                </div>

                <nav className="flex-1 space-y-6 overflow-y-auto no-scrollbar" aria-label="Menu principal">
                    <div>
                        <PrefetchLink
                            href="/campaigns/new"
                            className="group relative inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-medium transition-all shadow-lg shadow-primary-900/20 overflow-hidden focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
                            aria-label="Criar nova campanha"
                        >
                            <div className="absolute inset-0 bg-primary-600 group-hover:bg-primary-500 transition-colors"></div>
                            <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
                            <Plus size={16} className="relative z-10 text-white" aria-hidden="true" />
                            <span className="relative z-10 text-white">Nova Campanha</span>
                        </PrefetchLink>
                    </div>

                    <div className="space-y-1 px-2">
                        <p className="px-2 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Menu</p>
                        {navItems.map((item) => (
                            <PrefetchLink
                                key={item.path}
                                href={item.path}
                                onClick={() => setIsMobileMenuOpen(false)}
                                onMouseEnter={() => prefetchRoute(item.path)}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 mb-1 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500 ${pathname === item.path
                                    ? 'bg-primary-500/10 text-primary-400 font-medium border border-primary-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                                    : 'text-gray-400 hover:bg-white/5 hover:text-white'
                                    }`}
                                aria-current={pathname === item.path ? 'page' : undefined}
                            >
                                <item.icon size={20} aria-hidden="true" />
                                <span className="flex items-center gap-2">
                                    {item.label}
                                    {item.badge && (
                                        <span className="rounded-full bg-emerald-500/20 px-1 py-[1px] text-[8px] font-semibold uppercase tracking-wider text-emerald-200 border border-emerald-500/30" aria-label={`${item.badge} - recurso em fase beta`}>
                                            {item.badge}
                                        </span>
                                    )}
                                </span>
                            </PrefetchLink>
                        ))}
                    </div>
                </nav>

                <div className="pt-4 mt-4 border-t border-white/5">
                    <button
                        onClick={handleLogout}
                        disabled={isLoggingOut}
                        className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 cursor-pointer transition-colors border border-transparent hover:border-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-500 focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Sair da conta"
                        aria-label="Sair da conta"
                    >
                        <div className="w-9 h-9 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center overflow-hidden" aria-hidden="true">
                            <span className="text-lg font-bold text-primary-400">
                                {(companyName || 'SmartZap').charAt(0).toUpperCase()}
                            </span>
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                            <p className="text-sm font-medium text-white truncate">{companyName || 'SmartZap'}</p>
                            <p className="text-xs text-gray-500 truncate">Administrador</p>
                        </div>
                        {isLoggingOut ? (
                            <div className="w-4 h-4 border-2 border-gray-500 border-t-white rounded-full animate-spin" role="status" aria-label="Saindo..." />
                        ) : (
                            <LogOut size={16} className="text-gray-500 hover:text-white transition-colors" aria-hidden="true" />
                        )}
                    </button>

                    <div className="mt-2 text-[10px] text-gray-700 text-center font-mono" aria-label={`Versão ${process.env.NEXT_PUBLIC_APP_VERSION}`}>
                        v{process.env.NEXT_PUBLIC_APP_VERSION}
                    </div>
                </div>
            </div>
        </aside>
    )

    if (isBuilderRoute) {
        return (
            <PageLayoutProvider>
                <div
                    className="min-h-screen bg-zinc-950 text-gray-100 flex font-sans selection:bg-primary-500/30"
                    style={{
                        "--builder-sidebar-width": "56px",
                        "--background": "oklch(0 0 0)",
                        "--sidebar": "oklch(0 0 0)",
                        "--border": "oklch(0.27 0 0)",
                    } as React.CSSProperties}
                >
                    {CompactSidebar}
                    <div className="flex-1 min-w-0 lg:pl-14">
                        {children}
                    </div>
                </div>
            </PageLayoutProvider>
        )
    }

    return (
        <PageLayoutProvider>
            <div className="min-h-screen text-gray-100 flex font-sans selection:bg-primary-500/30">
            {/* Mobile Overlay */}
            {isMobileMenuOpen && (
                <div
                    className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 lg:hidden"
                    onClick={() => setIsMobileMenuOpen(false)}
                    role="button"
                    aria-label="Fechar menu"
                    tabIndex={0}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape' || e.key === 'Enter') {
                            setIsMobileMenuOpen(false)
                        }
                    }}
                />
            )}

            {/* Sidebar */}
            {CompactSidebar}
            {ExpandedSidebar}

            {/* Main Content */}
            <div
                className={cn(
                    "flex-1 flex flex-col min-w-0 h-screen overflow-hidden",
                    isSidebarExpanded ? "lg:pl-56" : "lg:pl-14"
                )}
            >
                {/* Header */}
                <header className="h-20 flex items-center justify-between px-6 lg:px-10 shrink-0">
                    <div className="flex items-center">
                        <button
                            className="lg:hidden p-2 text-gray-400 mr-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 focus-visible:outline-offset-2 rounded-md"
                            onClick={() => {
                                updateSidebarExpanded(true)
                                setIsMobileMenuOpen(true)
                            }}
                            aria-label="Abrir menu de navegação"
                        >
                            <Menu size={24} aria-hidden="true" />
                        </button>

                        <nav className="hidden md:flex items-center text-sm text-gray-500" aria-label="Breadcrumb">
                            <span className="hover:text-white cursor-pointer transition-colors">App</span>
                            <span className="mx-2 text-gray-700" aria-hidden="true">/</span>
                            <span className="text-gray-300" aria-current="page">{getPageTitle(pathname || '/')}</span>
                        </nav>
                    </div>

                    <div className="flex items-center gap-6">
                        <button className="relative group focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 focus-visible:outline-offset-2 rounded-md p-1" aria-label="Notificações (1 nova)">
                            <Bell size={20} className="text-gray-500 group-hover:text-white transition-colors cursor-pointer" aria-hidden="true" />
                            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-primary-500 rounded-full border-2 border-zinc-950" aria-label="1 notificação não lida"></span>
                        </button>
                    </div>
                </header>

                {/* Page Content */}
                <PageContentShell>
                    {children}
                </PageContentShell>
            </div>
        </div>
        </PageLayoutProvider>
    )
}

function PageContentShell({ children }: { children: React.ReactNode }) {
    const layout = usePageLayout()

    const mainOverflowClass = layout.overflow === 'hidden' ? 'overflow-hidden' : 'overflow-auto'
    const mainPaddingClass = layout.padded ? 'p-6 lg:p-10' : ''
    const wrapperWidthClass = getPageWidthClass(layout.width)
    const wrapperHeightClass = layout.height === 'full' ? 'h-full' : ''

    return (
        <main className={`flex-1 ${mainOverflowClass} ${mainPaddingClass}`.trim()}>
            <div className={`${wrapperWidthClass} ${wrapperHeightClass}`.trim()}>
                {layout.showAccountAlerts && <AccountAlertBanner />}
                {children}
            </div>
        </main>
    )
}
