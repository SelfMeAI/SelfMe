import { ChatShell } from "@selfme/chat-ui";

export function App() {
  return (
    <ChatShell
      clientType="desktop"
      gatewayHttpUrl={import.meta.env.VITE_GATEWAY_HTTP_URL ?? "http://localhost:8000"}
      gatewayWsUrl={import.meta.env.VITE_GATEWAY_WS_URL ?? "ws://localhost:8000/ws"}
      logoSrc="./assets/logo.jpg"
    />
  );
}
