import { ChatShell } from "@selfme/chat-ui";
import { DEFAULT_GATEWAY_HTTP_URL, DEFAULT_GATEWAY_WS_URL } from "@selfme/protocol";

export function App() {
  const runtimeConfig = typeof window === "undefined" ? undefined : window.selfmeDesktop?.runtime;

  return (
    <ChatShell
      clientType="desktop"
      gatewayHttpUrl={runtimeConfig?.gatewayHttpUrl ?? DEFAULT_GATEWAY_HTTP_URL}
      gatewayWsUrl={runtimeConfig?.gatewayWsUrl ?? DEFAULT_GATEWAY_WS_URL}
      logoSrc="./assets/logo.jpg"
    />
  );
}
