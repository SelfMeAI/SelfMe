<template>
  <div class="app-container">
    <NavBar :version="config.version" :model="config.model" />

    <!-- Connection status banner -->
    <div v-if="!isConnected" class="connection-banner">
      <div class="banner-content">
        <span class="status-icon">⚠️</span>
        <span class="status-text">Gateway disconnected. Reconnecting...</span>
      </div>
    </div>

    <ChatContainer
      :messages="messages"
      :is-streaming="isStreaming"
      :message-queue="messageQueue"
      @send="sendMessage"
      @stop="stopGeneration"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import NavBar from './components/NavBar.vue'
import ChatContainer from './components/ChatContainer.vue'
import { GATEWAY_URL } from './config.js'

const config = ref({ version: '', model: 'Loading...' })
const messages = ref([])
const isStreaming = ref(false)
const messageQueue = ref([])  // Message queue
const isConnected = ref(true)  // Connection status - start as true to avoid flash on page load
let ws = null
let sessionId = null
let currentMessage = null
let updateTimer = null
let pendingContent = ''
let lastUpdateTime = 0
let isProcessingQueue = false  // Flag to prevent duplicate queue processing

// Load config from Gateway
const loadConfig = async () => {
  try {
    // Try to get config from Gateway /health endpoint
    const response = await fetch(`${GATEWAY_URL}/health`)
    const data = await response.json()
    config.value = {
      version: data.version || '0.1.0',
      model: data.model || 'Unknown'
    }
  } catch (error) {
    console.error('Failed to load config:', error)
    // Fallback to default values
    config.value = {
      version: '0.1.0',
      model: 'Disconnected'
    }
  }
}

// Create session
const createSession = async () => {
  try {
    const response = await fetch(`${GATEWAY_URL}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metadata: { client_type: 'web' } })
    })
    const data = await response.json()
    sessionId = data.session_id
    return sessionId
  } catch (error) {
    console.error('Failed to create session:', error)
    throw error
  }
}

// Connect WebSocket
const connectWebSocket = async () => {
  if (!sessionId) {
    await createSession()
  }

  const wsUrl = `${GATEWAY_URL.replace('http', 'ws')}/ws/${sessionId}`
  ws = new WebSocket(wsUrl)

  ws.onopen = () => {
    console.log('Connected to server')
    isConnected.value = true
  }

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data)
    handleMessage(data)
  }

  ws.onerror = (error) => {
    console.error('Connection error:', error)
    isConnected.value = false
  }

  ws.onclose = () => {
    console.log('Disconnected from server, reconnecting...')
    isConnected.value = false
    setTimeout(() => connectWebSocket(), 3000)
  }
}

// Update message content with throttling for smoother rendering
const updateMessageContent = () => {
  if (currentMessage && pendingContent) {
    currentMessage.content = pendingContent
    lastUpdateTime = Date.now()

    // Force reactivity update
    const index = messages.value.indexOf(currentMessage)
    if (index !== -1) {
      messages.value[index] = { ...currentMessage }
      currentMessage = messages.value[index]
    }
  }
}

// Handle incoming messages
const handleMessage = (data) => {
  if (data.type === 'user_message') {
    // User message confirmed
  } else if (data.type === 'cancelled') {
    // Handle cancellation confirmation
    if (currentMessage) {
      const index = messages.value.indexOf(currentMessage)
      if (index !== -1) {
        messages.value[index] = {
          ...currentMessage,
          streaming: false,
          metadata: '🚫 Cancelled'
        }
      }
      currentMessage = null
      pendingContent = ''
    }
    isStreaming.value = false

    // Process next message in queue
    processNextMessage()
  } else if (data.type === 'assistant_chunk') {
    if (!currentMessage) {
      const newMessage = {
        role: 'assistant',
        content: '',
        streaming: true
      }
      messages.value.push(newMessage)
      currentMessage = newMessage
      pendingContent = ''
      lastUpdateTime = Date.now()
    }

    const chunk = data.content
    if (chunk.includes('\n\n---\n*')) {
      const parts = chunk.split('\n\n---\n*')
      pendingContent += parts[0]
      if (parts[1]) {
        currentMessage.metadata = parts[1].replace(/\*$/, '').trim()
      }
    } else {
      pendingContent += chunk
    }

    // Throttle updates: update at most every 50ms for smoother scrolling
    const now = Date.now()
    const timeSinceLastUpdate = now - lastUpdateTime

    if (timeSinceLastUpdate >= 50) {
      // Enough time has passed, update immediately
      updateMessageContent()
      if (updateTimer) {
        clearTimeout(updateTimer)
        updateTimer = null
      }
    } else if (!updateTimer) {
      // Schedule an update for the remaining time
      const remainingTime = 50 - timeSinceLastUpdate
      updateTimer = setTimeout(() => {
        updateMessageContent()
        updateTimer = null
      }, remainingTime)
    }
  } else if (data.type === 'complete') {
    // Clear any pending updates
    if (updateTimer) {
      clearTimeout(updateTimer)
      updateTimer = null
    }

    // Final update with all pending content
    updateMessageContent()

    if (currentMessage) {
      const index = messages.value.indexOf(currentMessage)
      if (index !== -1) {
        // Save metadata from complete message
        const metadata = data.metadata || {}
        const metadataText = `🐙 ${metadata.model || config.value.model} · ${metadata.response_time || 0}s`
        messages.value[index] = {
          ...currentMessage,
          streaming: false,
          metadata: metadataText
        }
      }
      currentMessage = null
      pendingContent = ''
    }
    isStreaming.value = false

    // Process next message in queue
    processNextMessage()
  }
}

// Send message
const sendMessage = (text, fromQueue = false) => {
  if (!text.trim() || !ws || ws.readyState !== WebSocket.OPEN) {
    return
  }

  // If currently streaming AND not from queue, add to queue
  if (isStreaming.value && !fromQueue) {
    messageQueue.value.push(text)
    return
  }

  // Set streaming flag FIRST before adding message
  isStreaming.value = true

  messages.value.push({
    role: 'user',
    content: text
  })

  ws.send(JSON.stringify({ action: 'send_message', content: text }))
}

// Process next message in queue
const processNextMessage = () => {
  // Prevent duplicate processing
  if (isProcessingQueue) {
    return
  }

  // Check if we can process (not streaming and has messages)
  if (isStreaming.value || messageQueue.value.length === 0) {
    return
  }

  isProcessingQueue = true

  // Use nextTick to ensure state is settled before processing
  nextTick(() => {
    // Double-check conditions after nextTick
    if (messageQueue.value.length > 0 && !isStreaming.value) {
      const nextMessage = messageQueue.value.shift()
      sendMessage(nextMessage, true)
      // Only reset after sendMessage sets isStreaming = true
    }
    isProcessingQueue = false
  })
}

// Stop generation
const stopGeneration = () => {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return
  }

  ws.send(JSON.stringify({ action: 'cancel' }))
}

onMounted(() => {
  loadConfig()
  connectWebSocket()

  // Global ESC key handler for stopping generation
  const handleGlobalKeydown = (e) => {
    if (e.key === 'Escape' && isStreaming.value) {
      e.preventDefault()
      stopGeneration()
    }
  }
  window.addEventListener('keydown', handleGlobalKeydown)

  // Store cleanup function
  onUnmounted(() => {
    window.removeEventListener('keydown', handleGlobalKeydown)
  })
})
</script>

<style scoped>
.app-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.connection-banner {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: #ffffff;
  padding: 12px 24px;
  display: flex;
  justify-content: center;
  align-items: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  z-index: 1000;
  animation: slideDown 0.3s ease;
}

@keyframes slideDown {
  from {
    transform: translateY(-100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.banner-content {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  font-weight: 500;
}

.status-icon {
  font-size: 18px;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

.status-text {
  letter-spacing: 0.3px;
}
</style>
