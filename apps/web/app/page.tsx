import { ChatShell } from "@selfme/chat-ui";

export const dynamic = "force-static";

export default function HomePage() {
  return (
    <ChatShell
      clientType="web"
      gatewayHttpUrl={process.env.NEXT_PUBLIC_GATEWAY_HTTP_URL ?? "http://localhost:8000"}
      gatewayWsUrl={process.env.NEXT_PUBLIC_GATEWAY_WS_URL ?? "ws://localhost:8000/ws"}
    />
  );
}
