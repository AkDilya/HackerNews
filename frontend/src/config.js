// Единая точка конфигурации фронтенда.
// Vite прокидывает переменные окружения из .env* файлов через import.meta.env,
// поэтому для деплоя достаточно задать VITE_API_URL=https://api.example.com
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// Ссылка на начало GitHub OAuth (используется кнопками «Sign in with GitHub»)
const GITHUB_AUTH_URL = `${API_BASE_URL}/api/auth/github`;

export { API_BASE_URL, GITHUB_AUTH_URL };
