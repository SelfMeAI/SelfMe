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

    <ChatInput @send="handleSend" :disabled="isStreaming" />
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
  }
})

const emit = defineEmits(['send', 'scroll-to-bottom'])

const messagesRef = ref(null)
const showScrollButton = ref(false)
let isUserScrolling = false
let scrollTimeout = null

// Scroll to bottom
const scrollToBottom = (smooth = true) => {
  if (!messagesRef.value) return

  isUserScrolling = false
  messagesRef.value.scrollTo({
    top: messagesRef.value.scrollHeight,
    behavior: smooth ? 'smooth' : 'auto'
  })

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

// Watch messages and auto-scroll only if user is at bottom
watch(() => props.messages, () => {
  nextTick(() => {
    if (!messagesRef.value) return

    // Check if user is at bottom
    const threshold = 100
    const { scrollHeight, scrollTop, clientHeight } = messagesRef.value
    const isAtBottom = scrollHeight - scrollTop - clientHeight < threshold

    // Only auto-scroll if user is at bottom or not manually scrolling
    if (isAtBottom || !isUserScrolling) {
      scrollToBottom(false)
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
</style>
