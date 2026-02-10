<template>
  <div class="app-container">
    <NavBar :version="config.version" :model="config.model" />
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
import { ref, onMounted, onUnmounted } from 'vue'
import NavBar from './components/NavBar.vue'
import ChatContainer from './components/ChatContainer.vue'

const config = ref({ version: '', model: 'Loading...' })
const messages = ref([])
const isStreaming = ref(false)
const messageQueue = ref([])  // Message queue
let ws = null
let currentMessage = null
let updateTimer = null
let pendingContent = ''
let lastUpdateTime = 0

// Load config
const loadConfig = async () => {
  try {
    const response = await fetch('/api/config')
    const data = await response.json()
    config.value = data
  } catch (error) {
    console.error('Failed to load config:', error)
  }
}

// Connect WebSocket
const connectWebSocket = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${protocol}//${window.location.host}/ws`

  ws = new WebSocket(wsUrl)

  ws.onopen = () => {
    console.log('Connected to server')
  }

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data)
    handleMessage(data)
  }

  ws.onerror = (error) => {
    console.error('Connection error:', error)
  }

  ws.onclose = () => {
    console.log('Disconnected from server, reconnecting...')
    setTimeout(connectWebSocket, 3000)
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
        messages.value[index] = { ...currentMessage, streaming: false }
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

    // Throttle updates: update at most every 100ms
    const now = Date.now()
    const timeSinceLastUpdate = now - lastUpdateTime

    if (timeSinceLastUpdate >= 100) {
      // Enough time has passed, update immediately
      updateMessageContent()
      if (updateTimer) {
        clearTimeout(updateTimer)
        updateTimer = null
      }
    } else if (!updateTimer) {
      // Schedule an update for the remaining time
      const remainingTime = 100 - timeSinceLastUpdate
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
        messages.value[index] = { ...currentMessage, streaming: false }
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
const sendMessage = (text) => {
  if (!text.trim() || !ws || ws.readyState !== WebSocket.OPEN) {
    return
  }

  // If currently streaming, add to queue
  if (isStreaming.value) {
    messageQueue.value.push(text)
    return
  }

  messages.value.push({
    role: 'user',
    content: text
  })

  ws.send(JSON.stringify({ message: text }))
  isStreaming.value = true
}

// Process next message in queue
const processNextMessage = () => {
  if (messageQueue.value.length > 0 && !isStreaming.value) {
    const nextMessage = messageQueue.value.shift()
    sendMessage(nextMessage)
  }
}

// Stop generation
const stopGeneration = () => {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return
  }

  ws.send(JSON.stringify({ type: 'cancel' }))
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
</style>
