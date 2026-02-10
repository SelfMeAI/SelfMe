<template>
  <div class="input-area">
    <textarea
      ref="inputRef"
      v-model="message"
      class="input-box"
      placeholder="Type your message. Press Enter to send"
      rows="1"
      :disabled="disabled"
      @keydown="handleKeydown"
      @input="autoResize"
    ></textarea>
    <button
      class="send-button"
      :disabled="disabled || !message.trim()"
      @click="handleSend"
    >
      {{ disabled ? 'Sending...' : 'Send' }}
    </button>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'

const props = defineProps({
  disabled: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['send'])

const inputRef = ref(null)
const message = ref('')

// Auto resize textarea
const autoResize = () => {
  if (!inputRef.value) return

  inputRef.value.style.height = 'auto'
  inputRef.value.style.height = Math.min(inputRef.value.scrollHeight, 200) + 'px'
}

// Handle keydown
const handleKeydown = (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

// Handle send
const handleSend = () => {
  if (!message.value.trim() || props.disabled) return

  emit('send', message.value)
  message.value = ''

  nextTick(() => {
    if (inputRef.value) {
      inputRef.value.style.height = 'auto'
    }
  })
}
</script>

<style scoped>
.input-area {
  display: flex;
  gap: 12px;
  padding: 16px 0;
  align-items: flex-end;
  padding-bottom: 4px;
  flex-shrink: 0;
}

.input-box {
  flex: 1;
  background-color: rgba(30, 58, 95, 0.2);
  border: 2px solid #1e3a5f;
  border-radius: 8px;
  color: #e6edf3;
  padding: 12px 16px;
  font-size: 14px;
  font-family: inherit;
  resize: none;
  min-height: 64px;
  max-height: 200px;
}

.input-box::placeholder {
  color: #6e7681;
}

.input-box:focus {
  outline: none;
  border-color: #0ea5e9;
  box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.2);
}

.input-box::-webkit-scrollbar {
  width: 6px;
}

.input-box::-webkit-scrollbar-track {
  background: transparent;
}

.input-box::-webkit-scrollbar-thumb {
  background: rgba(30, 58, 95, 0.5);
  border-radius: 3px;
}

.input-box::-webkit-scrollbar-thumb:hover {
  background: rgba(30, 58, 95, 0.7);
}

.send-button {
  background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
  border: none;
  border-radius: 8px;
  color: #ffffff;
  font-weight: 600;
  padding: 10px 32px;
  cursor: pointer;
  transition: all 0.3s ease;
  min-width: 100px;
  height: 44px;
  margin-bottom: 4px;
}

.send-button:hover:not(:disabled) {
  background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(14, 165, 233, 0.3);
}

.send-button:active:not(:disabled) {
  transform: scale(0.98);
}

.send-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
