# SelfMe Frontend (Vue 3)

## Setup

```bash
cd selfme/web/frontend
npm install
```

## Development

```bash
# Start dev server (with hot reload)
npm run dev

# Backend should be running on http://localhost:7860
# Frontend will proxy API/WebSocket requests to backend
```

## Build for Production

```bash
# Build Vue app
npm run build

# Output will be in selfme/web/dist/
# FastAPI will serve these files automatically
```

## Run Full Stack

```bash
# Terminal 1: Build frontend
cd selfme/web/frontend
npm run build

# Terminal 2: Start backend (from project root)
poetry run selfme-web
```

Visit http://localhost:7860

## Project Structure

```
frontend/
├── src/
│   ├── App.vue              # Main app component
│   ├── main.js              # Entry point
│   ├── style.css            # Global styles
│   └── components/
│       ├── NavBar.vue       # Top navigation
│       ├── ChatContainer.vue # Chat layout & scroll
│       ├── ChatMessage.vue  # Message bubble
│       └── ChatInput.vue    # Input box
├── public/
│   └── assets/              # Static assets (logo, favicon)
├── index.html               # HTML template
├── package.json             # Dependencies
└── vite.config.js           # Vite configuration
```

## Tech Stack

- **Vue 3** - Composition API
- **Vite** - Build tool
- **marked** - Markdown parser
- **DOMPurify** - XSS protection
