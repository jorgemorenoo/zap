export const TEMPLATE_SHORT_PROMPT_TEMPLATE = `Crie uma mensagem de WhatsApp curta, profissional e persuasiva baseada neste pedido: "{{prompt}}".
Regras:
1. Use a variável {{1}} para o nome do cliente.
2. Use emojis com moderação.
3. Seja direto (max 300 caracteres).
4. Retorne APENAS o texto da mensagem, sem explicações.`

export function buildTemplateShortPrompt(prompt: string, template: string = TEMPLATE_SHORT_PROMPT_TEMPLATE): string {
  return template.replace('{{prompt}}', prompt)
}
