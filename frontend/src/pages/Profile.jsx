import { useEffect, useState } from "react";

import { API_BASE_URL } from "../config.js";

const Profile = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      const token = localStorage.getItem("auth_token");
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          setUser(await res.json());
        }
      } catch (err) {
        console.error("Ошибка загрузки профиля", err);
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, []);

  if (loading) return <p className="text-gray-500">Loading profile...</p>;
  if (!user) return <p className="text-gray-500">Please sign in first.</p>;

  return (
    <div className="rounded-xl bg-white p-8 shadow-md max-w-2xl">
      <div className="flex items-center gap-4 mb-6">
        <img src={user.avatar_url} alt="avatar" className="w-16 h-16 rounded-full border-2 border-gray-200" />
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{user.username}</h1>
          <p className="text-gray-500">{user.email || "No email in GitHub profile"}</p>
        </div>
      </div>

      <div className="border-t pt-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Settings</h2>
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div>
            <p className="font-medium text-gray-700">Weekly digest</p>
            <p className="text-sm text-gray-500">Get the top-5 rising technologies in your inbox every Sunday</p>
          </div>
          <span className="text-sm text-gray-400">Coming soon</span>
        </div>
      </div>
    </div>
  );
};

export default Profile;