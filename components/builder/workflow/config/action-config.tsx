"use client";

import { useAtomValue, useSetAtom } from "jotai";
import { HelpCircle, Plus, Settings } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ConfigureConnectionOverlay } from "@/components/builder/overlays/add-connection-overlay";
import { AiGatewayConsentOverlay } from "@/components/builder/overlays/ai-gateway-consent-overlay";
import { useOverlay } from "@/components/builder/overlays/overlay-provider";
import { Button } from "@/components/builder/ui/button";
import { CodeEditor } from "@/components/builder/ui/code-editor";
import { IntegrationIcon } from "@/components/builder/ui/integration-icon";
import { IntegrationSelector } from "@/components/builder/ui/integration-selector";
import { Input } from "@/components/builder/ui/input";
import { Label } from "@/components/builder/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/builder/ui/select";
import { TemplateBadgeInput } from "@/components/builder/ui/template-badge-input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/builder/ui/tooltip";
import { aiGatewayStatusAtom } from "@/lib/builder/ai-gateway/state";
import {
  integrationsAtom,
  integrationsVersionAtom,
} from "@/lib/builder/integrations-store";
import type { IntegrationType } from "@/lib/builder/types/integration";
import {
  findActionById,
  getActionsByCategory,
  getAllIntegrations,
  isFieldGroup,
  type ActionConfigField,
} from "@/lib/builder/plugins";
import { templateService } from "@/services/templateService";
import { ActionConfigRenderer } from "./action-config-renderer";
import { SchemaBuilder, type SchemaField } from "./schema-builder";
import { WhatsAppPreview } from "./whatsapp-preview";

type ActionConfigProps = {
  config: Record<string, unknown>;
  onUpdateConfig: (key: string, value: string) => void;
  disabled: boolean;
  isOwner?: boolean;
};

// Database Query fields component
function DatabaseQueryFields({
  config,
  onUpdateConfig,
  disabled,
}: {
  config: Record<string, unknown>;
  onUpdateConfig: (key: string, value: string) => void;
  disabled: boolean;
}) {
  return (
    <>
      <div className="space-y-2">
      <Label htmlFor="dbQuery">Consulta SQL</Label>
        <div className="overflow-hidden rounded-md border">
          <CodeEditor
            defaultLanguage="sql"
            height="150px"
            onChange={(value) => onUpdateConfig("dbQuery", value || "")}
            options={{
              minimap: { enabled: false },
              lineNumbers: "on",
              scrollBeyondLastLine: false,
              fontSize: 12,
              readOnly: disabled,
              wordWrap: "off",
            }}
            value={(config?.dbQuery as string) || ""}
          />
        </div>
        <p className="text-muted-foreground text-xs">
          A DATABASE_URL das integrações do projeto sera usada para executar
          essa consulta.
        </p>
      </div>
      <div className="space-y-2">
      <Label>Schema (opcional)</Label>
        <SchemaBuilder
          disabled={disabled}
          onChange={(schema) =>
            onUpdateConfig("dbSchema", JSON.stringify(schema))
          }
          schema={
            config?.dbSchema
              ? (JSON.parse(config.dbSchema as string) as SchemaField[])
              : []
          }
        />
      </div>
    </>
  );
}

// HTTP Request fields component
function HttpRequestFields({
  config,
  onUpdateConfig,
  disabled,
}: {
  config: Record<string, unknown>;
  onUpdateConfig: (key: string, value: string) => void;
  disabled: boolean;
}) {
  return (
    <>
      <div className="space-y-2">
      <Label htmlFor="httpMethod">Metodo HTTP</Label>
        <Select
          disabled={disabled}
          onValueChange={(value) => onUpdateConfig("httpMethod", value)}
          value={(config?.httpMethod as string) || "POST"}
        >
          <SelectTrigger className="w-full" id="httpMethod">
            <SelectValue placeholder="Selecione o metodo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="GET">GET</SelectItem>
            <SelectItem value="POST">POST</SelectItem>
            <SelectItem value="PUT">PUT</SelectItem>
            <SelectItem value="PATCH">PATCH</SelectItem>
            <SelectItem value="DELETE">DELETE</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
      <Label htmlFor="endpoint">URL</Label>
        <TemplateBadgeInput
          disabled={disabled}
          id="endpoint"
          onChange={(value) => onUpdateConfig("endpoint", value)}
          placeholder="https://api.example.com/endpoint or {{NodeName.url}}"
          value={(config?.endpoint as string) || ""}
        />
      </div>
      <div className="space-y-2">
      <Label htmlFor="httpHeaders">Cabecalhos (JSON)</Label>
        <div className="overflow-hidden rounded-md border">
          <CodeEditor
            defaultLanguage="json"
            height="100px"
            onChange={(value) => onUpdateConfig("httpHeaders", value || "{}")}
            options={{
              minimap: { enabled: false },
              lineNumbers: "off",
              scrollBeyondLastLine: false,
              fontSize: 12,
              readOnly: disabled,
              wordWrap: "off",
            }}
            value={(config?.httpHeaders as string) || "{}"}
          />
        </div>
      </div>
      <div className="space-y-2">
      <Label htmlFor="httpBody">Corpo (JSON)</Label>
        <div
          className={`overflow-hidden rounded-md border ${config?.httpMethod === "GET" ? "opacity-50" : ""}`}
        >
          <CodeEditor
            defaultLanguage="json"
            height="120px"
            onChange={(value) => onUpdateConfig("httpBody", value || "{}")}
            options={{
              minimap: { enabled: false },
              lineNumbers: "off",
              scrollBeyondLastLine: false,
              fontSize: 12,
              readOnly: config?.httpMethod === "GET" || disabled,
              domReadOnly: config?.httpMethod === "GET" || disabled,
              wordWrap: "off",
            }}
            value={(config?.httpBody as string) || "{}"}
          />
        </div>
        {config?.httpMethod === "GET" && (
          <p className="text-muted-foreground text-xs">
            Body desativado para requisicoes GET
          </p>
        )}
      </div>
    </>
  );
}

// Condition fields component
function ConditionFields({
  config,
  onUpdateConfig,
  disabled,
}: {
  config: Record<string, unknown>;
  onUpdateConfig: (key: string, value: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="condition">Expressao de condicao</Label>
      <TemplateBadgeInput
        disabled={disabled}
        id="condition"
        onChange={(value) => onUpdateConfig("condition", value)}
        placeholder="e.g., 5 > 3, status === 200, {{PreviousNode.value}} > 100"
        value={(config?.condition as string) || ""}
      />
      <p className="text-muted-foreground text-xs">
        Enter a JavaScript expression that evaluates to true or false. You can
        use @ to reference previous node outputs.
      </p>
    </div>
  );
}

function DelayFields({
  config,
  onUpdateConfig,
  disabled,
}: {
  config: Record<string, unknown>;
  onUpdateConfig: (key: string, value: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="delayMs">Atraso (ms)</Label>
      <Input
        disabled={disabled}
        id="delayMs"
        onChange={(e) => onUpdateConfig("delayMs", e.target.value)}
        placeholder="1000"
        value={(config?.delayMs as string) || ""}
      />
      <p className="text-muted-foreground text-xs">
        Wait before continuing to the next node.
      </p>
    </div>
  );
}

function VariableFields({
  config,
  onUpdateConfig,
  disabled,
  mode,
}: {
  config: Record<string, unknown>;
  onUpdateConfig: (key: string, value: string) => void;
  disabled: boolean;
  mode: "set" | "get";
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="variableKey">Chave da variável</Label>
      <Input
        disabled={disabled}
        id="variableKey"
        onChange={(e) => onUpdateConfig("variableKey", e.target.value)}
        placeholder="leadName"
        value={(config?.variableKey as string) || ""}
      />
      {mode === "set" && (
        <>
          <Label htmlFor="variableValue">Value</Label>
          <TemplateBadgeInput
            disabled={disabled}
            id="variableValue"
            onChange={(value) => onUpdateConfig("variableValue", value)}
            placeholder="Value or template"
            value={(config?.variableValue as string) || ""}
          />
        </>
      )}
      <p className="text-muted-foreground text-xs">
        {mode === "set"
          ? "Stores a value that can be used by later nodes."
          : "Reads a value stored earlier in the workflow."}
      </p>
    </div>
  );
}

function ExecutionFields({
  config,
  onUpdateConfig,
  disabled,
}: {
  config: Record<string, unknown>;
  onUpdateConfig: (key: string, value: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-black/40 p-4">
      <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Execução
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="retryCount">Tentativas</Label>
          <Input
            disabled={disabled}
            id="retryCount"
            onChange={(e) => onUpdateConfig("retryCount", e.target.value)}
            placeholder="0"
            value={(config?.retryCount as string) || ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="retryDelayMs">Atraso (ms)</Label>
          <Input
            disabled={disabled}
            id="retryDelayMs"
            onChange={(e) => onUpdateConfig("retryDelayMs", e.target.value)}
            placeholder="500"
            value={(config?.retryDelayMs as string) || ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="timeoutMs">Timeout (ms)</Label>
          <Input
            disabled={disabled}
            id="timeoutMs"
            onChange={(e) => onUpdateConfig("timeoutMs", e.target.value)}
            placeholder="10000"
            value={(config?.timeoutMs as string) || ""}
          />
        </div>
      </div>
    </div>
  );
}

// System action fields wrapper - extracts conditional rendering to reduce complexity
function SystemActionFields({
  actionType,
  config,
  onUpdateConfig,
  disabled,
}: {
  actionType: string;
  config: Record<string, unknown>;
  onUpdateConfig: (key: string, value: string) => void;
  disabled: boolean;
}) {
  switch (actionType) {
    case "HTTP Request":
      return (
        <HttpRequestFields
          config={config}
          disabled={disabled}
          onUpdateConfig={onUpdateConfig}
        />
      );
    case "Database Query":
      return (
        <DatabaseQueryFields
          config={config}
          disabled={disabled}
          onUpdateConfig={onUpdateConfig}
        />
      );
    case "Condition":
      return (
        <ConditionFields
          config={config}
          disabled={disabled}
          onUpdateConfig={onUpdateConfig}
        />
      );
    case "Delay":
      return (
        <DelayFields
          config={config}
          disabled={disabled}
          onUpdateConfig={onUpdateConfig}
        />
      );
    case "Set Variable":
      return (
        <VariableFields
          config={config}
          disabled={disabled}
          onUpdateConfig={onUpdateConfig}
          mode="set"
        />
      );
    case "Get Variable":
      return (
        <VariableFields
          config={config}
          disabled={disabled}
          onUpdateConfig={onUpdateConfig}
          mode="get"
        />
      );
    default:
      return null;
  }
}

// System actions that don't have plugins
const SYSTEM_ACTIONS: Array<{ id: string; label: string }> = [
  { id: "HTTP Request", label: "Requisicao HTTP" },
  { id: "Database Query", label: "Consulta ao banco" },
  { id: "Condition", label: "Condicao" },
];

const SYSTEM_ACTION_IDS = SYSTEM_ACTIONS.map((a) => a.id);

// System actions that need integrations (not in plugin registry)
const SYSTEM_ACTION_INTEGRATIONS: Record<string, IntegrationType> = {
  "Database Query": "database",
};

// Build category mapping dynamically from plugins + System
function useCategoryData() {
  return useMemo(() => {
    const pluginCategories = getActionsByCategory();

    // Build category map including System with both id and label
    const allCategories: Record<string, Array<{ id: string; label: string }>> = {
      Sistema: SYSTEM_ACTIONS,
    };

    for (const [category, actions] of Object.entries(pluginCategories || {})) {
      if (!Array.isArray(actions)) {
        continue;
      }
      allCategories[category] = actions.map((a) => ({
        id: a.id,
        label: a.label,
      }));
    }

    return allCategories;
  }, []);
}

// Get category for an action type (supports both new IDs, labels, and legacy labels)
function getCategoryForAction(actionType: string): string | null {
  // Check system actions first
  if (SYSTEM_ACTION_IDS.includes(actionType)) {
    return "Sistema";
  }

  // Use findActionById which handles legacy labels from plugin registry
  const action = findActionById(actionType);
  if (action?.category) {
    return action.category;
  }

  return null;
}

// Normalize action type to new ID format (handles legacy labels via findActionById)
function normalizeActionType(actionType: string): string {
  // Check system actions first - they use their label as ID
  if (SYSTEM_ACTION_IDS.includes(actionType)) {
    return actionType;
  }

  // Use findActionById which handles legacy labels and returns the proper ID
  const action = findActionById(actionType);
  if (action) {
    return action.id;
  }

  return actionType;
}

export function ActionConfig({
  config,
  onUpdateConfig,
  disabled,
  isOwner = true,
}: ActionConfigProps) {
  const actionType = (config?.actionType as string) || "";
  const categories = useCategoryData();
  const integrations = useMemo(() => getAllIntegrations(), []);

  const selectedCategory = actionType ? getCategoryForAction(actionType) : null;
  const [category, setCategory] = useState<string>(selectedCategory || "");
  const setIntegrationsVersion = useSetAtom(integrationsVersionAtom);
  const globalIntegrations = useAtomValue(integrationsAtom);
  const { push } = useOverlay();

  // AI Gateway managed keys state
  const aiGatewayStatus = useAtomValue(aiGatewayStatusAtom);

  // Sync category state when actionType changes (e.g., when switching nodes)
  useEffect(() => {
    const newCategory = actionType ? getCategoryForAction(actionType) : null;
    setCategory(newCategory || "");
  }, [actionType]);

  const handleCategoryChange = (newCategory: string) => {
    setCategory(newCategory);
    // Auto-select the first action in the new category
    const firstAction = categories[newCategory]?.[0];
    if (firstAction) {
      onUpdateConfig("actionType", firstAction.id);
    }
  };

  const handleActionTypeChange = (value: string) => {
    onUpdateConfig("actionType", value);
  };

  // Adapter for plugin config components that expect (key, value: unknown)
  const handlePluginUpdateConfig = (key: string, value: unknown) => {
    onUpdateConfig(key, String(value));
  };

  // Get dynamic config fields for plugin actions
  const pluginAction = actionType ? findActionById(actionType) : null;
  const isSendTemplateAction = pluginAction?.slug === "send-template";
  const templateNameValue = String(config?.templateName || "");

  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ["templates"],
    queryFn: templateService.getAll,
    enabled: Boolean(isSendTemplateAction),
  });

  const templateOptions = useMemo(() => {
    const names = templates
      .map((template) => String(template?.name || "").trim())
      .filter(Boolean);
    const unique = Array.from(new Set(names));
    unique.sort((a, b) => a.localeCompare(b));
    return unique.map((name) => ({ label: name, value: name }));
  }, [templates]);

  const templateOptionsWithCurrent = useMemo(() => {
    if (!templateNameValue) return templateOptions;
    const exists = templateOptions.some(
      (option) => option.value === templateNameValue
    );
    if (exists) return templateOptions;
    return [
      { label: `${templateNameValue} (atual)`, value: templateNameValue },
      ...templateOptions,
    ];
  }, [templateNameValue, templateOptions]);

  const pluginFields: ActionConfigField[] = useMemo(() => {
    if (!pluginAction) return [];
    if (!isSendTemplateAction) return pluginAction.configFields;

    return pluginAction.configFields
      .map((field) => {
        if (isFieldGroup(field)) {
          return {
            ...field,
            fields: field.fields.filter((inner) => inner.key !== "templateName"),
          };
        }
        return field;
      })
      .filter((field) => (isFieldGroup(field) ? true : field.key !== "templateName"));
  }, [isSendTemplateAction, pluginAction]);

  // Determine the integration type for the current action
  const integrationType: IntegrationType | undefined = useMemo(() => {
    if (!actionType) {
      return;
    }

    // Check system actions first
    if (SYSTEM_ACTION_INTEGRATIONS[actionType]) {
      return SYSTEM_ACTION_INTEGRATIONS[actionType];
    }

    // Check plugin actions
    const action = findActionById(actionType);
    return action?.integration as IntegrationType | undefined;
  }, [actionType]);

  // Check if AI Gateway managed keys should be offered (user can have multiple for different teams)
  const shouldUseManagedKeys =
    integrationType === "ai-gateway" &&
    aiGatewayStatus?.enabled &&
    aiGatewayStatus?.isVercelUser;

  // Check if there are existing connections for this integration type
  const hasExistingConnections = useMemo(() => {
    if (!integrationType) return false;
    return globalIntegrations.some((i) => i.type === integrationType);
  }, [integrationType, globalIntegrations]);

  const handleConsentSuccess = (integrationId: string) => {
    onUpdateConfig("integrationId", integrationId);
    setIntegrationsVersion((v) => v + 1);
  };

  const openConnectionOverlay = () => {
    if (integrationType) {
      push(ConfigureConnectionOverlay, {
        type: integrationType,
        onSuccess: (integrationId: string) => {
          setIntegrationsVersion((v) => v + 1);
          onUpdateConfig("integrationId", integrationId);
        },
      });
    }
  };

  const handleAddSecondaryConnection = () => {
    if (shouldUseManagedKeys) {
      push(AiGatewayConsentOverlay, {
        onConsent: handleConsentSuccess,
        onManualEntry: openConnectionOverlay,
      });
    } else {
      openConnectionOverlay();
    }
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-2">
          <Label className="ml-1" htmlFor="actionCategory">
            Service
          </Label>
          <Select
            disabled={disabled}
            onValueChange={handleCategoryChange}
            value={category || undefined}
          >
            <SelectTrigger className="w-full" id="actionCategory">
            <SelectValue placeholder="Selecione a categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="System">
                <div className="flex items-center gap-2">
                  <Settings className="size-4" />
                  <span>Sistema</span>
                </div>
              </SelectItem>
              <SelectSeparator />
              {integrations.map((integration) => (
                <SelectItem key={integration.type} value={integration.label}>
                  <div className="flex items-center gap-2">
                    <IntegrationIcon
                      className="size-4"
                      integration={integration.type}
                    />
                    <span>{integration.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="ml-1" htmlFor="actionType">
            Ação
          </Label>
          <Select
            disabled={disabled || !category}
            onValueChange={handleActionTypeChange}
            value={normalizeActionType(actionType) || undefined}
          >
            <SelectTrigger className="w-full" id="actionType">
              <SelectValue placeholder="Selecione a ação" />
            </SelectTrigger>
            <SelectContent>
              {category &&
                categories[category]?.map((action) => (
                  <SelectItem key={action.id} value={action.id}>
                    {action.label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {integrationType && isOwner && (
        <div className="space-y-2">
          <div className="ml-1 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Label>Conexão</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="size-3.5 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Chave de API ou credenciais OAuth deste servico</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            {hasExistingConnections && (
              <Button
                className="size-6"
                disabled={disabled}
                onClick={handleAddSecondaryConnection}
                size="icon"
                variant="ghost"
              >
                <Plus className="size-4" />
              </Button>
            )}
          </div>
          <IntegrationSelector
            disabled={disabled}
            integrationType={integrationType}
            onChange={(id) => onUpdateConfig("integrationId", id)}
            value={(config?.integrationId as string) || ""}
          />
        </div>
      )}

      {/* System actions - hardcoded config fields */}
      <SystemActionFields
        actionType={(config?.actionType as string) || ""}
        config={config}
        disabled={disabled}
        onUpdateConfig={onUpdateConfig}
      />

      {actionType && (
        <ExecutionFields
          config={config}
          disabled={disabled}
          onUpdateConfig={onUpdateConfig}
        />
      )}

      {/* Plugin actions - declarative config fields */}
      {pluginAction && !SYSTEM_ACTION_IDS.includes(actionType) && (
        <div className="space-y-4">
          {isSendTemplateAction && (
            <div className="space-y-2">
              <Label className="ml-1" htmlFor="templateName">
                Nome do template
              </Label>
              {templateOptionsWithCurrent.length > 0 ? (
                <Select
                  disabled={disabled}
                  onValueChange={(value) => onUpdateConfig("templateName", value)}
                  value={templateNameValue}
                >
                  <SelectTrigger className="w-full" id="templateName">
                    <SelectValue placeholder="Selecione o template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templateOptionsWithCurrent.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  disabled={disabled}
                  id="templateName"
                  onChange={(e) =>
                    onUpdateConfig("templateName", e.target.value)
                  }
                  placeholder="welcome_message"
                  value={templateNameValue}
                />
              )}
              {templateOptionsWithCurrent.length === 0 &&
                !templatesLoading && (
                  <p className="text-muted-foreground text-xs">
                    Nenhum template encontrado. Sincronize em Templates para
                    popular a lista.
                  </p>
                )}
            </div>
          )}
          <ActionConfigRenderer
            config={config}
            disabled={disabled}
            fields={pluginFields}
            onUpdateConfig={handlePluginUpdateConfig}
          />
          {pluginAction.integration === "whatsapp" && (
            <WhatsAppPreview actionType={actionType} config={config} />
          )}
        </div>
      )}
    </>
  );
}
