<template>
  <div class="message-wrapper" :class="`message-wrapper-${message.role}`">
    <div class="message" :class="[message.role, { streaming: message.streaming }]">
      <div class="message-content" v-html="renderedContent"></div>
    </div>
    <div v-if="message.metadata" class="message-meta">
      {{ formattedMetadata }}
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js/lib/common'

const props = defineProps({
  message: {
    type: Object,
    required: true
  }
})

// Configure marked
marked.setOptions({
  breaks: true,
  gfm: true,
  headerIds: false,
  mangle: false
})

// Custom renderer with code highlighting
const renderer = new marked.Renderer()
const originalCode = renderer.code.bind(renderer)

renderer.code = function(code, language) {
  const lang = language || ''

  if (lang && hljs.getLanguage(lang)) {
    try {
      const highlighted = hljs.highlight(code, { language: lang }).value
      return `<pre><code class="hljs language-${lang}">${highlighted}</code></pre>`
    } catch (err) {
      console.error('Highlight error:', err)
    }
  }

  try {
    const result = hljs.highlightAuto(code)
    return `<pre><code class="hljs">${result.value}</code></pre>`
  } catch (err) {
    return originalCode(code, language)
  }
}

// Render content
const renderedContent = computed(() => {
  if (props.message.role === 'user') {
    return DOMPurify.sanitize(props.message.content.replace(/\n/g, '<br>'))
  } else {
    try {
      const html = marked.parse(props.message.content, { renderer })

      // DOMPurify config to allow necessary tags
      const cleanHtml = DOMPurify.sanitize(html, {
        ADD_TAGS: ['table', 'thead', 'tbody', 'tr', 'th', 'td', 'tfoot', 'input'],
        ADD_ATTR: ['align', 'colspan', 'rowspan', 'class', 'type', 'checked', 'disabled']
      })

      return cleanHtml
    } catch (err) {
      console.error('Markdown parsing error:', err)
      return DOMPurify.sanitize(props.message.content.replace(/\n/g, '<br>'))
    }
  }
})

// Format metadata
const formattedMetadata = computed(() => {
  if (!props.message.metadata) return ''
  return props.message.metadata.replace(/\s*·\s*/g, '\u00A0\u00A0·\u00A0\u00A0')
})
</script>

<style scoped>
.message-wrapper {
  display: flex;
  flex-direction: column;
  max-width: 80%;
}

.message-wrapper-user {
  align-self: flex-end;
  align-items: flex-end;
}

.message-wrapper-assistant {
  align-self: flex-start;
  align-items: flex-start;
}

.message {
  padding: 14px 18px;
  border-radius: 12px;
  line-height: 1.6;
  width: 100%;
  word-wrap: break-word;
  margin-bottom: 4px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.message.user {
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.15) 0%, rgba(14, 165, 233, 0.08) 100%);
  border: 1px solid rgba(14, 165, 233, 0.2);
  border-radius: 12px 12px 4px 12px;
}

.message.assistant {
  background-color: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px 12px 12px 4px;
}

.message.assistant.streaming {
  opacity: 0.85;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.85; }
  50% { opacity: 1; }
}

.message-content {
  color: #e6edf3;
  font-size: 14.5px;
}

/* Task lists */
.message-content :deep(input[type="checkbox"]) {
  margin-right: 8px;
  cursor: pointer;
}

/* Markdown styling */
.message-content :deep(h1),
.message-content :deep(h2),
.message-content :deep(h3),
.message-content :deep(h4),
.message-content :deep(h5),
.message-content :deep(h6) {
  margin: 16px 0 8px 0;
  font-weight: 600;
  line-height: 1.3;
}

.message-content :deep(h1) { font-size: 1.8em; }
.message-content :deep(h2) { font-size: 1.5em; }
.message-content :deep(h3) { font-size: 1.3em; }

.message-content :deep(p) {
  margin: 8px 0;
  line-height: 1.6;
}

.message-content :deep(code) {
  background-color: rgba(110, 118, 129, 0.2);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 0.9em;
  color: #e6edf3;
}

.message-content :deep(pre) {
  background-color: rgba(110, 118, 129, 0.15);
  border: 1px solid rgba(110, 118, 129, 0.3);
  border-radius: 6px;
  padding: 12px;
  margin: 12px 0;
  overflow-x: auto;
}

.message-content :deep(pre code) {
  background: none;
  padding: 0;
  border-radius: 0;
  font-size: 0.9em;
}

.message-content :deep(a) {
  color: #0ea5e9;
  text-decoration: none;
}

.message-content :deep(a:hover) {
  text-decoration: underline;
}

.message-content :deep(ul),
.message-content :deep(ol) {
  margin: 8px 0;
  padding-left: 24px;
}

.message-content :deep(li) {
  margin: 4px 0;
}

.message-content :deep(blockquote) {
  border-left: 3px solid #6e7681;
  padding-left: 12px;
  margin: 12px 0;
  color: #8b949e;
}

.message-content :deep(strong) {
  font-weight: 600;
  color: #e6edf3;
}

.message-content :deep(em) {
  font-style: italic;
}

.message-content :deep(hr) {
  border: none;
  border-top: 1px solid rgba(110, 118, 129, 0.3);
  margin: 16px 0;
}

.message-content :deep(table) {
  border-collapse: collapse;
  margin: 12px 0;
  width: 100%;
}

.message-content :deep(th),
.message-content :deep(td) {
  border: 1px solid rgba(110, 118, 129, 0.3);
  padding: 8px 12px;
  text-align: left;
}

.message-content :deep(th) {
  background-color: rgba(110, 118, 129, 0.15);
  font-weight: 600;
}

.message-content :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  margin: 12px 0;
}

.message-meta {
  color: #6e7681;
  font-size: 13.5px;
  margin-top: 6px;
  padding-left: 8px;
}

.message-wrapper-user .message-meta {
  text-align: right;
  padding-right: 8px;
  padding-left: 0;
}
</style>
