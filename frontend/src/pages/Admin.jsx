import { useState, useEffect, useCallback } from "react";

import { API_BASE_URL } from "../config.js";
const UNLOCK_STORAGE_KEY = "trendradar_admin_key";

/* Админ-панель: доступ только для выделенных людей — вход по ключу (скрытая авторизация) */
const Admin = () => {
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem(UNLOCK_STORAGE_KEY) || "");
  const [unlocked, setUnlocked] = useState(() => Boolean(sessionStorage.getItem(UNLOCK_STORAGE_KEY)));
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(unlocked);
  const [loggingIn, setLoggingIn] = useState(false);
  const [error, setError] = useState(null);
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState(null);

  const loadStats = useCallback(async (key) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/stats`, {
        headers: { "X-Admin-Key": key },
      });
      if (response.status === 403 || response.status === 422) {
        sessionStorage.removeItem(UNLOCK_STORAGE_KEY);
        setUnlocked(false);
        setAdminKey("");
        setError("Session is invalid. Please sign in again.");
        return;
      }
      if (!response.ok) throw new Error("Failed to fetch");
      const data = await response.json();
      setStats(data);
      setError(null);
    } catch (err) {
      console.error("Admin stats error:", err);
      setError("Failed to load stats. Make sure the backend is running.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (unlocked) {
      loadStats(adminKey);
    } else {
      setLoading(false);
    }
  }, [unlocked, loadStats]);

  /* Вход по ключу: проверяем ключ реальным запросом к защищённому /stats */
  const login = async (e) => {
    e.preventDefault();
    if (!adminKey.trim()) {
      setError("Enter the admin key.");
      return;
    }

    setLoggingIn(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/stats`, {
        headers: { "X-Admin-Key": adminKey },
      });

      if (response.status === 403) throw new Error("Invalid admin key.");
      if (!response.ok) throw new Error("Could not reach the backend.");

      sessionStorage.setItem(UNLOCK_STORAGE_KEY, adminKey);
      setStats(await response.json());
      setUnlocked(true);
      setMessage(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoggingIn(false);
    }
  };

  const logout = () => {
    sessionStorage.removeItem(UNLOCK_STORAGE_KEY);
    setUnlocked(false);
    setAdminKey("");
    setStats(null);
    setMessage(null);
    setError(null);
  };

  const clearDatabase = async () => {
    if (!window.confirm("⚠️ Delete ALL articles from the trend_events collection? This action is irreversible.")) {
      return;
    }

    setClearing(true);
    setMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/clear`, {
        method: "POST",
        headers: { "X-Admin-Key": adminKey },
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.detail || "Failed to clear the database");
      }

      setMessage(`✅ Database cleared. Deleted records: ${data.deleted}`);
      await loadStats(adminKey);
    } catch (err) {
      console.error("Clear error:", err);
      setMessage(`❌ ${err.message}`);
    } finally {
      setClearing(false);
    }
  };

  /* Экран скрытого входа */
  if (!unlocked) {
    return (
      <div className="flex justify-center">
        <form
          onSubmit={login}
          className="w-full max-w-md bg-white dark:bg-gray-800 p-8 rounded-lg shadow text-center"
        >
          <p className="text-5xl mb-4">🔐</p>
          <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-2">
            Admin sign-in
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Access is restricted. Enter the admin key to continue.
          </p>

          <input
            type="password"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            placeholder="Admin key"
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 mb-4 bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
            autoFocus
          />
          <button
            type="submit"
            disabled={loggingIn}
            className="w-full bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition font-medium"
          >
            {loggingIn ? "Checking key..." : "Sign in"}
          </button>

          {error && (
            <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </form>
      </div>
    );
  }

  const lastCollection = stats?.last_collection_time
    ? new Date(stats.last_collection_time).toLocaleString("en-US")
    : "—";

  return (
    <div>
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-2">🛠 Admin</h1>
          <p className="text-gray-500 dark:text-gray-400">
            Service page: collector statistics and database maintenance.
          </p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-4 py-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition text-sm font-medium"
        >
          🔒 Sign out of admin
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg">
          {error}
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <h3 className="text-sm text-gray-500 dark:text-gray-400 mb-2">Total articles</h3>
          <p className="text-3xl font-bold text-gray-800 dark:text-white">
            {stats?.total_stories ?? "—"}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <h3 className="text-sm text-gray-500 dark:text-gray-400 mb-2">Unique technologies</h3>
          <p className="text-3xl font-bold text-gray-800 dark:text-white">
            {stats?.total_technologies ?? "—"}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <h3 className="text-sm text-gray-500 dark:text-gray-400 mb-2">Last collection</h3>
          <p className="text-lg font-bold text-gray-800 dark:text-white">
            {lastCollection}
          </p>
        </div>
      </div>

      {/* Источники */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow mb-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">
          📡 Data sources
        </h3>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
              <th className="py-2">Source</th>
              <th className="py-2">Articles</th>
              <th className="py-2">Share</th>
            </tr>
          </thead>
          <tbody className="text-gray-800 dark:text-gray-200">
            {[
              { name: "Hacker News", key: "hackernews" },
              { name: "Dev.to", key: "devto" },
            ].map((source) => {
              const count = stats?.sources?.[source.key] ?? 0;
              const total = stats?.total_stories || 0;
              const share = total > 0 ? `${Math.round(count / total * 100)}%` : "0%";
              return (
                <tr key={source.key} className="border-b border-gray-100 dark:border-gray-700/50">
                  <td className="py-2 font-medium">{source.name}</td>
                  <td className="py-2">{count}</td>
                  <td className="py-2">{share}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
          A source is determined by the article url domain; so far the collector gathers Hacker News only.
        </p>
      </div>

      {/* Опасная зона */}
      <div className="border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-red-700 dark:text-red-400 mb-1">
          ⚠️ Danger zone
        </h3>
        <p className="text-sm text-red-600 dark:text-red-300 mb-4">
          Clearing removes all articles from the <code>trend_events</code> collection. The key is
          verified on the server for every request.
        </p>

        <button
          type="button"
          onClick={clearDatabase}
          disabled={clearing}
          className="bg-red-600 text-white px-5 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50 transition font-medium"
        >
          {clearing ? "Clearing..." : "🗑 Clear database"}
        </button>

        {message && (
          <p className="mt-4 text-sm font-medium text-gray-800 dark:text-gray-200">{message}</p>
        )}
      </div>
    </div>
  );
};

export default Admin;
