<template>
  <div class="chat-container" :class="{ 'has-messages': messages.length > 0 }">
    <div ref="messagesRef" class="messages">
      <ChatMessage
        v-for="(message, index) in messages"
        :key="index"
        :message="message"
      />
    </div>

    <button
      v-if="showScrollButton"
      class="scroll-to-bottom"
      @click="scrollToBottom"
    >
      <span>New messages</span>
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M7 10l5 5 5-5z"/>
      </svg>
    </button>

    <!-- Queue display -->
    <div v-if="messageQueue.length > 0" class="queue-container">
      <div class="queue-header">
        📋 Queued ({{ messageQueue.length }})
      </div>
      <div class="queue-message">
        ▸ {{ messageQueue[0] }}
      </div>
    </div>

    <ChatInput @send="handleSend" @stop="handleStop" :disabled="false" :is-streaming="isStreaming" :is-queuing="messageQueue.length > 0" />
  </div>
</template>

<script setup>
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import ChatMessage from './ChatMessage.vue'
import ChatInput from './ChatInput.vue'

const props = defineProps({
  messages: {
    type: Array,
    required: true
  },
  isStreaming: {
    type: Boolean,
    default: false
  },
  messageQueue: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['send', 'scroll-to-bottom', 'stop'])

const messagesRef = ref(null)
const showScrollButton = ref(false)
let isUserScrolling = false
let scrollTimeout = null

// Scroll to bottom
const scrollToBottom = (smooth = true) => {
  if (!messagesRef.value) return

  // Save current focused element
  const activeElement = document.activeElement

  isUserScrolling = false
  messagesRef.value.scrollTo({
    top: messagesRef.value.scrollHeight,
    behavior: smooth ? 'smooth' : 'auto'
  })

  // Restore focus if it was on an input/textarea
  if (activeElement && (activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT')) {
    requestAnimationFrame(() => {
      activeElement.focus()
    })
  }

  setTimeout(() => {
    showScrollButton.value = false
  }, 300)
}

// Check scroll position
const checkScrollPosition = () => {
  if (!messagesRef.value) return

  const threshold = 100
  const { scrollHeight, scrollTop, clientHeight } = messagesRef.value
  const isAtBottom = scrollHeight - scrollTop - clientHeight < threshold

  if (isAtBottom) {
    showScrollButton.value = false
    isUserScrolling = false
  } else if (props.messages.length > 0) {
    showScrollButton.value = true
  }
}

// Handle scroll event
const handleScroll = () => {
  clearTimeout(scrollTimeout)
  isUserScrolling = true
  scrollTimeout = setTimeout(() => {
    checkScrollPosition()
  }, 150)
}

// Handle send message
const handleSend = (text) => {
  emit('send', text)
}

// Handle stop generation
const handleStop = () => {
  emit('stop')
}

// Watch messages and auto-scroll only if user is at bottom
watch(() => props.messages, () => {
  nextTick(() => {
    if (!messagesRef.value) return

    // Save current focused element
    const activeElement = document.activeElement

    // Check if user is at bottom
    const threshold = 100
    const { scrollHeight, scrollTop, clientHeight } = messagesRef.value
    const isAtBottom = scrollHeight - scrollTop - clientHeight < threshold

    // Only auto-scroll if user is at bottom or not manually scrolling
    if (isAtBottom || !isUserScrolling) {
      scrollToBottom(false)
    }

    // Restore focus if it was on an input/textarea
    if (activeElement && (activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT')) {
      requestAnimationFrame(() => {
        activeElement.focus()
      })
    }
  })
}, { deep: true })

// Also watch streaming state changes
watch(() => props.isStreaming, (newVal) => {
  if (!newVal) {
    // When streaming stops, check if we should scroll to bottom
    nextTick(() => {
      if (!messagesRef.value) return

      const threshold = 100
      const { scrollHeight, scrollTop, clientHeight } = messagesRef.value
      const isAtBottom = scrollHeight - scrollTop - clientHeight < threshold

      if (isAtBottom || !isUserScrolling) {
        scrollToBottom(false)
      }
    })
  }
})

onMounted(() => {
  if (messagesRef.value) {
    messagesRef.value.addEventListener('scroll', handleScroll)
  }
})

onUnmounted(() => {
  if (messagesRef.value) {
    messagesRef.value.removeEventListener('scroll', handleScroll)
  }
})
</script>

<style scoped>
.chat-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  max-width: 1200px;
  width: 100%;
  margin: 0 auto;
  padding: 24px;
  overflow: hidden;
  justify-content: flex-start;
  padding-top: 30vh;
  transition: padding-top 0.3s ease;
  position: relative;
}

.chat-container.has-messages {
  padding-top: 24px;
}

.messages {
  overflow-y: auto;
  padding: 16px 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.messages::-webkit-scrollbar {
  display: none;
}

.chat-container.has-messages .messages {
  flex: 1;
}

.scroll-to-bottom {
  position: absolute;
  bottom: 110px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 16px;
  background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
  border: none;
  border-radius: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  box-shadow: 0 4px 12px rgba(14, 165, 233, 0.4);
  transition: all 0.3s ease;
  z-index: 10;
  color: #ffffff;
  font-size: 13px;
  font-weight: 500;
}

.scroll-to-bottom:hover {
  transform: translateX(-50%) translateY(-2px);
  box-shadow: 0 6px 16px rgba(14, 165, 233, 0.5);
}

.scroll-to-bottom:active {
  transform: translateX(-50%) translateY(0);
}

.scroll-to-bottom svg {
  width: 16px;
  height: 16px;
  fill: #ffffff;
}

.queue-container {
  position: absolute;
  bottom: 110px;
  left: 24px;
  background: rgba(30, 58, 95, 0.95);
  border: 1px solid #1e3a5f;
  border-radius: 8px;
  padding: 12px 16px;
  max-width: 600px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 10;
}

.queue-header {
  color: #8b949e;
  font-size: 13px;
  margin-bottom: 6px;
  font-weight: 500;
}

.queue-message {
  color: #e6edf3;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 550px;
}
</style>
