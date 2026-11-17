import type {
  ExtensionAPI, ExtensionContext, ModelRoute, ModelRouteRequest,
} from "@earendil-works/pi-coding-agent";

function required(name: string): string {
  const value: string | undefined = process.env[name];
  if (!value) throw new Error("Missing routing variable: " + name);
  return value;
}

export default function register(pi: ExtensionAPI): void {
  const provider: string = required("COURSE_ROUTE_PROVIDER");
  const fast: string = required("COURSE_ROUTE_FAST");
  const strong: string = required("COURSE_ROUTE_STRONG");

  pi.registerVirtualModel({
    provider: "course",
    id: "auto",
    name: "Course Router",
    thinkingLevels: ["low", "high"],
    route(
      request: ModelRouteRequest<unknown>,
      ctx: ExtensionContext,
    ): ModelRoute<unknown> {
      const sticky = request.failed ?? request.previous;
      // 同一轮保持模型，避免工具后续意外切换。
      if (request.reason !== "user" && sticky) {
        return {
          model: sticky.model,
          thinkingLevel: sticky.thinkingLevel ?? "off",
        };
      }
      const id: string = request.thinkingLevel === "high" ? strong : fast;
      const model = ctx.modelRegistry.find(provider, id);
      if (!model) throw new Error("Routing model not found: " + provider + "/" + id);
      return { model, thinkingLevel: "off" };
    },
  });
}
