import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useAuth, getStoredToken } from "../lib/auth";
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import { API_BASE_URL } from "../lib/api";

type User = {
  id: string;
  email: string;
  fullName: string;
  position: string | null;
  phone: string | null;
  role: string;
  twoFactorEnabled: boolean;
};

type TwoFactorSetup = {
  secret: string;
  qrCodeUrl: string;
};

type Passkey = {
  id: string;
  name: string | null;
  createdAt: string;
  lastUsedAt: string | null;
};

const inputClasses =
  "w-full rounded-lg border border-slate-700/50 bg-obsidian-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 transition-all focus:border-neon-cyan/50 focus:outline-none focus:ring-2 focus:ring-neon-cyan/20";

const labelClasses = "block text-sm font-medium text-slate-300 mb-1.5";

const primaryBtnClasses =
  "rounded-lg bg-gradient-to-r from-neon-cyan to-neon-emerald px-5 py-2.5 text-sm font-semibold text-obsidian-900 shadow-lg shadow-neon-cyan/20 transition-all hover:shadow-neon-cyan/30 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed";

const secondaryBtnClasses =
  "rounded-lg border border-slate-700/50 bg-obsidian-800/60 px-4 py-2.5 text-sm font-medium text-slate-300 transition-all hover:bg-obsidian-700/50 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed";

const dangerBtnClasses =
  "rounded-lg bg-gradient-to-r from-neon-rose to-neon-rose/80 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-neon-rose/20 transition-all hover:shadow-neon-rose/30 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed";

const tabs = [
  {
    id: "general" as const,
    label: "General",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    )
  },
  {
    id: "security" as const,
    label: "Security",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    )
  },
  {
    id: "2fa" as const,
    label: "Two-Factor Auth",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    )
  },
  {
    id: "passkeys" as const,
    label: "Passkeys",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
      </svg>
    )
  }
];

export default function Profile() {
  const { user, setUser, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<"general" | "security" | "2fa" | "passkeys">("general");

  // General tab state
  const [fullName, setFullName] = useState(user?.fullName || "");
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // 2FA state
  const [twoFactorSetup, setTwoFactorSetup] = useState<TwoFactorSetup | null>(null);
  const [twoFactorToken, setTwoFactorToken] = useState("");
  const [is2FALoading, setIs2FALoading] = useState(false);
  const [twoFactorMessage, setTwoFactorMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableToken, setDisableToken] = useState("");

  // Passkey state
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false);
  const [passkeyMessage, setPasskeyMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [editingPasskeyId, setEditingPasskeyId] = useState<string | null>(null);
  const [editingPasskeyName, setEditingPasskeyName] = useState("");

  useEffect(() => {
    if (user) {
      setFullName(user.fullName);
      setEmail(user.email);
      setPhone(user.phone || "");
    }
  }, [user]);

  useEffect(() => {
    if (activeTab === "passkeys") {
      loadPasskeys();
    }
  }, [activeTab]);

  const loadPasskeys = async () => {
    try {
      const token = getStoredToken();
      const res = await fetch(`${API_BASE_URL}/passkeys`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPasskeys(data.passkeys);
      }
    } catch (err) {
      console.error("Failed to load passkeys:", err);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdating(true);
    setUpdateMessage(null);

    try {
      const token = getStoredToken();
      const res = await fetch(`${API_BASE_URL}/profile`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ fullName, email, phone: phone || undefined })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update profile");
      }

      const data = await res.json();
      setUser(data.user);
      setUpdateMessage({ type: "success", text: "Profile updated successfully" });
    } catch (err) {
      setUpdateMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to update profile"
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage(null);

    if (newPassword.length < 8) {
      setPasswordMessage({ type: "error", text: "Password must be at least 8 characters" });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: "error", text: "Passwords do not match" });
      return;
    }

    setIsChangingPassword(true);

    try {
      const token = getStoredToken();
      const res = await fetch(`${API_BASE_URL}/profile/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to change password");
      }

      setPasswordMessage({ type: "success", text: "Password changed successfully" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPasswordMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to change password"
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleSetup2FA = async () => {
    setIs2FALoading(true);
    setTwoFactorMessage(null);

    try {
      const token = getStoredToken();
      const res = await fetch(`${API_BASE_URL}/profile/2fa/setup`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to setup 2FA");
      }

      const data = await res.json();
      setTwoFactorSetup(data);
    } catch (err) {
      setTwoFactorMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to setup 2FA"
      });
    } finally {
      setIs2FALoading(false);
    }
  };

  const handleEnable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setIs2FALoading(true);
    setTwoFactorMessage(null);

    try {
      const token = getStoredToken();
      const res = await fetch(`${API_BASE_URL}/profile/2fa/enable`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ token: twoFactorToken })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to enable 2FA");
      }

      setTwoFactorMessage({ type: "success", text: "2FA enabled successfully" });
      setTwoFactorSetup(null);
      setTwoFactorToken("");

      // Update user state
      if (user) {
        setUser({ ...user, twoFactorEnabled: true });
      }
    } catch (err) {
      setTwoFactorMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to enable 2FA"
      });
    } finally {
      setIs2FALoading(false);
    }
  };

  const handleDisable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setIs2FALoading(true);
    setTwoFactorMessage(null);

    try {
      const token = getStoredToken();
      const res = await fetch(`${API_BASE_URL}/profile/2fa/disable`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ password: disablePassword, token: disableToken })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to disable 2FA");
      }

      setTwoFactorMessage({ type: "success", text: "2FA disabled successfully" });
      setDisablePassword("");
      setDisableToken("");

      // Update user state
      if (user) {
        setUser({ ...user, twoFactorEnabled: false });
      }
    } catch (err) {
      setTwoFactorMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to disable 2FA"
      });
    } finally {
      setIs2FALoading(false);
    }
  };

  const handleAddPasskey = async () => {
    setIsPasskeyLoading(true);
    setPasskeyMessage(null);

    try {
      const token = getStoredToken();

      // Get registration options
      const optionsRes = await fetch(
        `${API_BASE_URL}/passkeys/register/options`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      if (!optionsRes.ok) {
        throw new Error("Failed to get registration options");
      }

      const options = await optionsRes.json();

      // Start WebAuthn registration
      const attResp = await startRegistration(options);

      // Verify registration
      const verifyRes = await fetch(
        `${API_BASE_URL}/passkeys/register/verify`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            response: attResp,
            name: `Passkey ${new Date().toLocaleDateString()}`
          })
        }
      );

      if (!verifyRes.ok) {
        const error = await verifyRes.json();
        throw new Error(error.message || "Failed to register passkey");
      }

      setPasskeyMessage({ type: "success", text: "Passkey added successfully" });
      await loadPasskeys();
    } catch (err) {
      setPasskeyMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to add passkey"
      });
    } finally {
      setIsPasskeyLoading(false);
    }
  };

  const handleRenamePasskey = async (id: string) => {
    try {
      const token = getStoredToken();
      const res = await fetch(
        `${API_BASE_URL}/passkeys/${id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ name: editingPasskeyName })
        }
      );

      if (!res.ok) {
        throw new Error("Failed to rename passkey");
      }

      setEditingPasskeyId(null);
      setEditingPasskeyName("");
      await loadPasskeys();
    } catch (err) {
      setPasskeyMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to rename passkey"
      });
    }
  };

  const handleDeletePasskey = async (id: string) => {
    if (!confirm("Are you sure you want to delete this passkey?")) {
      return;
    }

    try {
      const token = getStoredToken();
      const res = await fetch(
        `${API_BASE_URL}/passkeys/${id}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      if (!res.ok) {
        throw new Error("Failed to delete passkey");
      }

      setPasskeyMessage({ type: "success", text: "Passkey deleted successfully" });
      await loadPasskeys();
    } catch (err) {
      setPasskeyMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to delete passkey"
      });
    }
  };

  const MessageAlert = ({ message, className = "" }: { message: { type: "success" | "error"; text: string }; className?: string }) => (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-lg border p-4 ${
        message.type === "success"
          ? "border-neon-emerald/30 bg-neon-emerald/10 text-neon-emerald"
          : "border-neon-rose/30 bg-neon-rose/10 text-neon-rose"
      } ${className}`}
    >
      <div className="flex items-center gap-2">
        {message.type === "success" ? (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        )}
        <span className="text-sm">{message.text}</span>
      </div>
    </motion.div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-white">User Profile</h1>
          <p className="mt-1 text-sm text-slate-400">Manage your account settings and security</p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-neon-cyan/20 to-neon-emerald/10 text-neon-cyan">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
      </div>

      {/* Tabs */}
      <div className="rounded-xl border border-slate-700/50 bg-obsidian-800/40 p-1.5 shadow-xl backdrop-blur-sm">
        <nav className="flex gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? "bg-gradient-to-r from-neon-cyan/20 to-neon-emerald/10 text-neon-cyan"
                  : "text-slate-400 hover:bg-obsidian-700/50 hover:text-white"
              }`}
            >
              {tab.icon}
              {tab.label}
              {activeTab === tab.id && (
                <motion.div
                  layoutId="activeProfileTab"
                  className="absolute inset-0 rounded-lg border border-neon-cyan/30"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="rounded-xl border border-slate-700/50 bg-obsidian-800/40 p-6 shadow-xl backdrop-blur-sm">
        {activeTab === "general" && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="max-w-2xl"
          >
            <form onSubmit={handleUpdateProfile} className="space-y-6">
              <div>
                <label className={labelClasses}>Full Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter your full name"
                  className={inputClasses}
                  required
                />
              </div>

              <div>
                <label className={labelClasses}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className={inputClasses}
                  required
                />
              </div>

              <div>
                <label className={labelClasses}>Phone</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={inputClasses}
                  placeholder="Optional"
                />
              </div>

              {updateMessage && <MessageAlert message={updateMessage} />}

              <button type="submit" disabled={isUpdating} className={primaryBtnClasses}>
                {isUpdating ? (
                  <span className="flex items-center gap-2">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Updating...
                  </span>
                ) : (
                  "Update Profile"
                )}
              </button>
            </form>
          </motion.div>
        )}

        {activeTab === "security" && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="max-w-2xl"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neon-amber/10">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-neon-amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Change Password</h2>
                <p className="text-sm text-slate-400">Update your account password</p>
              </div>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-6">
              <div>
                <label className={labelClasses}>Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  className={inputClasses}
                  required
                />
              </div>

              <div>
                <label className={labelClasses}>New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className={inputClasses}
                  required
                  minLength={8}
                />
                <p className="mt-1.5 text-xs text-slate-500">Minimum 8 characters</p>
              </div>

              <div>
                <label className={labelClasses}>Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className={inputClasses}
                  required
                />
              </div>

              {passwordMessage && <MessageAlert message={passwordMessage} />}

              <button type="submit" disabled={isChangingPassword} className={primaryBtnClasses}>
                {isChangingPassword ? (
                  <span className="flex items-center gap-2">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Changing...
                  </span>
                ) : (
                  "Change Password"
                )}
              </button>
            </form>
          </motion.div>
        )}

        {activeTab === "2fa" && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="max-w-2xl"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neon-violet/10">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-neon-violet" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Two-Factor Authentication</h2>
                <p className="text-sm text-slate-400">Add an extra layer of security to your account</p>
              </div>
            </div>

            {user?.twoFactorEnabled ? (
              <div className="space-y-6">
                <div className="flex items-center gap-3 rounded-lg border border-neon-emerald/30 bg-neon-emerald/10 p-4">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-neon-emerald" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  <p className="text-sm text-neon-emerald">
                    Two-factor authentication is currently <strong>enabled</strong> on your account.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-700/50 bg-obsidian-800/60 p-6">
                  <h3 className="font-medium text-white mb-4">Disable Two-Factor Authentication</h3>
                  <form onSubmit={handleDisable2FA} className="space-y-4">
                    <div>
                      <label className={labelClasses}>Password</label>
                      <input
                        type="password"
                        value={disablePassword}
                        onChange={(e) => setDisablePassword(e.target.value)}
                        placeholder="Enter your password"
                        className={inputClasses}
                        required
                      />
                    </div>

                    <div>
                      <label className={labelClasses}>2FA Token</label>
                      <input
                        type="text"
                        value={disableToken}
                        onChange={(e) => setDisableToken(e.target.value)}
                        className={inputClasses}
                        maxLength={6}
                        placeholder="Enter 6-digit code"
                        required
                      />
                    </div>

                    <button type="submit" disabled={is2FALoading} className={dangerBtnClasses}>
                      {is2FALoading ? (
                        <span className="flex items-center gap-2">
                          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Disabling...
                        </span>
                      ) : (
                        "Disable 2FA"
                      )}
                    </button>
                  </form>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center gap-3 rounded-lg border border-neon-amber/30 bg-neon-amber/10 p-4">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-neon-amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <p className="text-sm text-neon-amber">
                    Two-factor authentication is currently <strong>disabled</strong>. Enable it for extra security.
                  </p>
                </div>

                {!twoFactorSetup ? (
                  <button onClick={handleSetup2FA} disabled={is2FALoading} className={primaryBtnClasses}>
                    {is2FALoading ? (
                      <span className="flex items-center gap-2">
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Setting up...
                      </span>
                    ) : (
                      "Setup Two-Factor Authentication"
                    )}
                  </button>
                ) : (
                  <div className="rounded-xl border border-slate-700/50 bg-obsidian-800/60 p-6">
                    <h3 className="font-medium text-white mb-4">Scan QR Code</h3>
                    <div className="space-y-4">
                      <p className="text-sm text-slate-400">
                        Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.):
                      </p>
                      <div className="flex justify-center">
                        <div className="rounded-xl border border-slate-700/50 bg-white p-3">
                          <img src={twoFactorSetup.qrCodeUrl} alt="2FA QR Code" className="rounded-lg" />
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-700/50 bg-obsidian-900/50 p-4">
                        <p className="text-xs text-slate-400 mb-2">Manual entry code:</p>
                        <code className="text-sm font-mono text-neon-cyan select-all">{twoFactorSetup.secret}</code>
                      </div>

                      <form onSubmit={handleEnable2FA} className="space-y-4">
                        <div>
                          <label className={labelClasses}>
                            Enter 6-digit code from your app
                          </label>
                          <input
                            type="text"
                            value={twoFactorToken}
                            onChange={(e) => setTwoFactorToken(e.target.value)}
                            className={inputClasses}
                            maxLength={6}
                            placeholder="000000"
                            required
                          />
                        </div>

                        <div className="flex gap-3">
                          <button
                            type="submit"
                            disabled={is2FALoading || twoFactorToken.length !== 6}
                            className={primaryBtnClasses}
                          >
                            {is2FALoading ? (
                              <span className="flex items-center gap-2">
                                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                Verifying...
                              </span>
                            ) : (
                              "Enable 2FA"
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setTwoFactorSetup(null);
                              setTwoFactorToken("");
                            }}
                            className={secondaryBtnClasses}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            )}

            {twoFactorMessage && <MessageAlert message={twoFactorMessage} className="mt-6" />}
          </motion.div>
        )}

        {activeTab === "passkeys" && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="max-w-2xl"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neon-cyan/10">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-neon-cyan" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Passkeys</h2>
                <p className="text-sm text-slate-400">Passwordless authentication using biometrics</p>
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex items-center gap-3 rounded-lg border border-neon-cyan/30 bg-neon-cyan/10 p-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-neon-cyan" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <p className="text-sm text-neon-cyan">
                  Passkeys let you sign in without a password using your fingerprint, face recognition, or device PIN.
                </p>
              </div>

              <button onClick={handleAddPasskey} disabled={isPasskeyLoading} className={primaryBtnClasses}>
                {isPasskeyLoading ? (
                  <span className="flex items-center gap-2">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Adding...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Add Passkey
                  </span>
                )}
              </button>

              {passkeyMessage && <MessageAlert message={passkeyMessage} />}

              {passkeys.length > 0 ? (
                <div className="rounded-xl border border-slate-700/50 divide-y divide-slate-700/30 overflow-hidden">
                  {passkeys.map((passkey, idx) => (
                    <motion.div
                      key={passkey.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="flex items-center justify-between bg-obsidian-800/60 p-4 transition-colors hover:bg-obsidian-700/40"
                    >
                      <div className="flex-1 min-w-0">
                        {editingPasskeyId === passkey.id ? (
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={editingPasskeyName}
                              onChange={(e) => setEditingPasskeyName(e.target.value)}
                              placeholder="Enter passkey name"
                              className={inputClasses + " max-w-xs"}
                              autoFocus
                            />
                            <button
                              onClick={() => handleRenamePasskey(passkey.id)}
                              className={primaryBtnClasses}
                            >
                              Save
                            </button>
                            <button
                              onClick={() => {
                                setEditingPasskeyId(null);
                                setEditingPasskeyName("");
                              }}
                              className={secondaryBtnClasses}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-700/50">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                                </svg>
                              </div>
                              <span className="font-medium text-white">{passkey.name || "Unnamed Passkey"}</span>
                            </div>
                            <div className="mt-1.5 ml-11 text-xs text-slate-500">
                              Added {new Date(passkey.createdAt).toLocaleDateString()}
                              {passkey.lastUsedAt && (
                                <> · Last used {new Date(passkey.lastUsedAt).toLocaleDateString()}</>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                      {editingPasskeyId !== passkey.id && (
                        <div className="flex gap-3 ml-4">
                          <button
                            onClick={() => {
                              setEditingPasskeyId(passkey.id);
                              setEditingPasskeyName(passkey.name || "");
                            }}
                            className="text-sm text-neon-cyan hover:text-neon-cyan/80 transition-colors"
                          >
                            Rename
                          </button>
                          <button
                            onClick={() => handleDeletePasskey(passkey.id)}
                            className="text-sm text-neon-rose hover:text-neon-rose/80 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-slate-700/30 bg-obsidian-800/30 py-12 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-700/30">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                    </svg>
                  </div>
                  <div className="mt-4 text-sm font-medium text-slate-400">No passkeys added yet</div>
                  <div className="mt-1 text-xs text-slate-500">Add one to enable passwordless sign in</div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
