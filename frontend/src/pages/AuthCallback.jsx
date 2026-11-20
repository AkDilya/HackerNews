import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

/* Приём JWT после GitHub OAuth: /auth/callback?token=... */
const AuthCallback = () => {
  const [searchParams] = useSearchParams();
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const token = searchParams.get("token");

    if (token) {
      login(token);
      navigate("/favorites", { replace: true });
    } else {
      navigate("/", { replace: true });
    }
  }, [searchParams, login, navigate]);

  return <div className="p-8 text-gray-500 dark:text-gray-400">Signing in...</div>;
};

export default AuthCallback;
