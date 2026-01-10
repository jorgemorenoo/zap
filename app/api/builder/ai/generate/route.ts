import { NextResponse } from "next/server";
import { isAiRouteEnabled } from "@/lib/ai/ai-center-config";

export async function POST() {
  const routeEnabled = await isAiRouteEnabled("workflowBuilder");
  if (!routeEnabled) {
    return NextResponse.json(
      { error: "Rota desativada nas configurações de IA." },
      { status: 403 }
    );
  }

  return NextResponse.json({
    nodes: [],
    edges: [],
    name: "Generated Workflow",
  });
}
