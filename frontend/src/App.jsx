import { BrowserRouter, Routes, Route, Link, Navigate, useLocation } from "react-router-dom";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { GITHUB_AUTH_URL } from "./config.js";
import Dashboard from "./pages/Dashboard.jsx";
import Explorer from "./pages/Explorer.jsx";
import Graph from "./pages/Graph.jsx";
import Account from "./pages/Favorites.jsx";
import Compare from "./pages/Compare.jsx";
import AuthCallback from "./pages/AuthCallback.jsx";
import About from "./pages/About.jsx";
import Admin from "./pages/Admin.jsx";
import Login from "./pages/Login.jsx";

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: "📊", path: "/" },
  { id: "explorer", label: "Explorer", icon: "🔍", path: "/explorer" },
  { id: "compare", label: "Compare", icon: "📈", path: "/compare" },
  { id: "graph", label: "Graph", icon: "🕸️", path: "/graph" },
  { id: "about", label: "About", icon: "ℹ️", path: "/about" },
];

/* Пункт меню «Личный кабинет» показывается только авторизованным */
const AccountNavItem = () => {
  const { authenticated } = useAuth();
  const location = useLocation();

  if (!authenticated) return null;

  return (
    <Link
      to="/favorites"
      className={`flex items-center gap-3 rounded-lg px-4 py-3 text-left font-medium transition ${
        location.pathname === "/favorites"
          ? "bg-blue-600 text-white shadow"
          : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
      }`}
    >
      <span>👤</span>
      <span>Account</span>
    </Link>
  );
};

const AppLayout = ({ children }) => {
  const location = useLocation();
  const { darkMode, toggleTheme } = useTheme();
  const { authenticated, user, logout } = useAuth();

  return (
    // Класс dark применяется к обертке
    <div className={darkMode ? "dark" : ""}>
      <div className="flex min-h-screen bg-gray-100 dark:bg-gray-900 transition-colors">
        <aside className="flex w-64 flex-col bg-white dark:bg-gray-800 shadow-lg h-screen sticky top-0 transition-colors">
          <h2 className="mb-6 px-4 pt-6 text-xl font-bold text-gray-800 dark:text-white">
            TrendRadar
          </h2>

          <nav className="flex flex-col gap-2 px-2 flex-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.id}
                to={item.path}
                className={`flex items-center gap-3 rounded-lg px-4 py-3 text-left font-medium transition ${
                  location.pathname === item.path
                    ? "bg-blue-600 text-white shadow"
                    : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
            <AccountNavItem />
          </nav>

          {/* Блок снизу (кнопки) */}
          <div className="mt-auto p-4 border-t border-gray-200 dark:border-gray-700 flex flex-col gap-3">
            {/* Кнопка темы */}
            <button
              onClick={toggleTheme}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-gray-100 dark:bg-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition"
            >
              {darkMode ? "☀️ Light Mode" : "🌙 Dark Mode"}
            </button>

            {/* Вход / выход */}
            {authenticated ? (
              <div className="flex flex-col gap-2">
                <p className="text-center text-xs text-gray-500 dark:text-gray-400 truncate">
                  {user?.username ? `✔ ${user.username}` : "✔ Signed in"}
                </p>
                <button
                  onClick={logout}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-4 py-2 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition"
                >
                  🚪 Sign out
                </button>
              </div>
            ) : (
              <a
                href={GITHUB_AUTH_URL}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-gray-900 dark:bg-gray-600 text-white px-4 py-2 text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-500 transition"
              >
                🔐 Sign in with GitHub
              </a>
            )}
          </div>
        </aside>

        <main className="flex-1 p-8 overflow-y-auto h-screen">
          {children}
        </main>
      </div>
    </div>
  );
};

/* /favorites доступен только после авторизации */
const RequireAuth = ({ children }) => {
  const { authenticated } = useAuth();

  if (!authenticated) {
    return (
      <div className="dark:bg-gray-900 min-h-screen">
        <div className="bg-white dark:bg-gray-800 p-12 rounded-lg shadow text-center max-w-lg mx-auto mt-10">
          <p className="text-6xl mb-4">🔒</p>
          <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-2">
            Sign-in required
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            The Account page is available only after GitHub authorization.
          </p>
          <a
            href={GITHUB_AUTH_URL}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 dark:bg-gray-600 text-white px-5 py-2 text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-500 transition"
          >
            🔐 Sign in with GitHub
          </a>
        </div>
      </div>
    );
  }

  return children;
};

const App = () => (
  <ThemeProvider>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AppLayout><Dashboard /></AppLayout>} />
          <Route path="/explorer" element={<AppLayout><Explorer /></AppLayout>} />
          <Route path="/compare" element={<AppLayout><Compare /></AppLayout>} />
          <Route path="/graph" element={<AppLayout><Graph /></AppLayout>} />
          <Route path="/favorites" element={<AppLayout><RequireAuth><Account /></RequireAuth></AppLayout>} />
          <Route path="/about" element={<AppLayout><About /></AppLayout>} />
          {/* Админ-панель доступна по прямой ссылке, в меню её нет */}
          <Route path="/admin" element={<AppLayout><Admin /></AppLayout>} />
          {/* Приём JWT после GitHub OAuth */}
          <Route path="/auth/callback" element={<AuthCallback />} />
          {/* Отдельная страница входа + совместимость со старой ссылкой на профиль */}
          <Route path="/login" element={<Login />} />
          <Route path="/profile" element={<Navigate to="/favorites" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </ThemeProvider>
);

export default App;
