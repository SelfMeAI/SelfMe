<template>
  <div class="navbar">
    <img src="/assets/logo.jpg" class="navbar-logo" alt="SelfMe Logo">
    <div class="navbar-info">
      <div class="navbar-title">SELFME</div>
      <div class="navbar-version">v{{ version }}</div>
    </div>
    <div class="navbar-model">Model: {{ model }}</div>
  </div>
</template>

<script setup>
defineProps({
  version: {
    type: String,
    default: ''
  },
  model: {
    type: String,
    default: 'Loading...'
  }
})
</script>

<style scoped>
.navbar {
  background-color: transparent;
  border-bottom: 1px solid #1e3a5f;
  padding: 16px 48px;
  display: flex;
  align-items: center;
  gap: 16px;
}

.navbar-logo {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  border: 2px solid #1e3a5f;
  object-fit: cover;
}

.navbar-info {
  display: flex;
  flex-direction: column;
}

.navbar-title {
  font-size: 24px;
  font-weight: 700;
  color: #e6edf3;
}

.navbar-version {
  font-size: 14px;
  color: #6e7681;
}

.navbar-model {
  margin-left: auto;
  padding: 4px 12px;
  background-color: rgba(30, 58, 95, 0.3);
  border-radius: 6px;
  font-size: 13px;
  color: #6e7681;
}
</style>
