import { ChatShell } from "@selfme/chat-ui";
import { DEFAULT_GATEWAY_HTTP_URL, DEFAULT_GATEWAY_WS_URL } from "@selfme/protocol";

export const dynamic = "force-static";

export default function HomePage() {
  return (
    <ChatShell
      clientType="web"
      gatewayHttpUrl={DEFAULT_GATEWAY_HTTP_URL}
      gatewayWsUrl={DEFAULT_GATEWAY_WS_URL}
    />
  );
}
