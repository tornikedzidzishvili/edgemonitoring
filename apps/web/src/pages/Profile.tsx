import { useState, useEffect } from "react";
import { useAuth } from "../lib/auth";
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
      const token = localStorage.getItem("authToken");
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
      const token = localStorage.getItem("authToken");
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
      const token = localStorage.getItem("authToken");
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
      const token = localStorage.getItem("authToken");
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
      const token = localStorage.getItem("authToken");
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
      const token = localStorage.getItem("authToken");
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
      const token = localStorage.getItem("authToken");
      
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
      const token = localStorage.getItem("authToken");
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
      const token = localStorage.getItem("authToken");
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

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">User Profile</h1>

      <div className="mt-6 border-b border-slate-200">
        <nav className="-mb-px flex">
          {[
            { id: "general" as const, label: "General" },
            { id: "security" as const, label: "Security" },
            { id: "2fa" as const, label: "Two-Factor Auth" },
            { id: "passkeys" as const, label: "Passkeys" }
          ].map((tab, index) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                "shrink-0 border-b-2 px-4 pb-3 text-sm font-medium transition-colors",
                index > 0 ? "ml-6" : "",
                activeTab === tab.id
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
              ].join(" ")}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-6">
        {activeTab === "general" && (
          <div className="max-w-2xl">
            <form onSubmit={handleUpdateProfile} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700">Full Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Phone</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Optional"
                />
              </div>

              {updateMessage && (
                <div
                  className={`rounded-md p-4 ${
                    updateMessage.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
                  }`}
                >
                  {updateMessage.text}
                </div>
              )}

              <button
                type="submit"
                disabled={isUpdating}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isUpdating ? "Updating..." : "Update Profile"}
              </button>
            </form>
          </div>
        )}

        {activeTab === "security" && (
          <div className="max-w-2xl">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Change Password</h2>
            <form onSubmit={handleChangePassword} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700">Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  required
                  minLength={8}
                />
                <p className="mt-1 text-sm text-slate-500">Minimum 8 characters</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  required
                />
              </div>

              {passwordMessage && (
                <div
                  className={`rounded-md p-4 ${
                    passwordMessage.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
                  }`}
                >
                  {passwordMessage.text}
                </div>
              )}

              <button
                type="submit"
                disabled={isChangingPassword}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isChangingPassword ? "Changing..." : "Change Password"}
              </button>
            </form>
          </div>
        )}

        {activeTab === "2fa" && (
          <div className="max-w-2xl">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Two-Factor Authentication</h2>
            
            {user?.twoFactorEnabled ? (
              <div className="space-y-6">
                <div className="rounded-md bg-green-50 p-4">
                  <p className="text-sm text-green-800">
                    ✓ Two-factor authentication is currently <strong>enabled</strong> on your account.
                  </p>
                </div>

                <div className="border border-slate-200 rounded-lg p-6">
                  <h3 className="font-medium text-slate-900 mb-4">Disable Two-Factor Authentication</h3>
                  <form onSubmit={handleDisable2FA} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700">Password</label>
                      <input
                        type="password"
                        value={disablePassword}
                        onChange={(e) => setDisablePassword(e.target.value)}
                        className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700">2FA Token</label>
                      <input
                        type="text"
                        value={disableToken}
                        onChange={(e) => setDisableToken(e.target.value)}
                        className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        maxLength={6}
                        placeholder="Enter 6-digit code"
                        required
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={is2FALoading}
                      className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {is2FALoading ? "Disabling..." : "Disable 2FA"}
                    </button>
                  </form>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="rounded-md bg-yellow-50 p-4">
                  <p className="text-sm text-yellow-800">
                    Two-factor authentication is currently <strong>disabled</strong>. Enable it for extra security.
                  </p>
                </div>

                {!twoFactorSetup ? (
                  <button
                    onClick={handleSetup2FA}
                    disabled={is2FALoading}
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {is2FALoading ? "Setting up..." : "Setup Two-Factor Authentication"}
                  </button>
                ) : (
                  <div className="border border-slate-200 rounded-lg p-6">
                    <h3 className="font-medium text-slate-900 mb-4">Scan QR Code</h3>
                    <div className="space-y-4">
                      <p className="text-sm text-slate-600">
                        Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.):
                      </p>
                      <div className="flex justify-center">
                        <img src={twoFactorSetup.qrCodeUrl} alt="2FA QR Code" className="border border-slate-200 rounded-lg" />
                      </div>
                      <div className="bg-slate-50 p-3 rounded-md">
                        <p className="text-xs text-slate-600 mb-1">Manual entry code:</p>
                        <code className="text-sm font-mono text-slate-900">{twoFactorSetup.secret}</code>
                      </div>

                      <form onSubmit={handleEnable2FA} className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700">
                            Enter 6-digit code from your app
                          </label>
                          <input
                            type="text"
                            value={twoFactorToken}
                            onChange={(e) => setTwoFactorToken(e.target.value)}
                            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            maxLength={6}
                            placeholder="000000"
                            required
                          />
                        </div>

                        <div className="flex gap-3">
                          <button
                            type="submit"
                            disabled={is2FALoading || twoFactorToken.length !== 6}
                            className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                          >
                            {is2FALoading ? "Verifying..." : "Enable 2FA"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setTwoFactorSetup(null);
                              setTwoFactorToken("");
                            }}
                            className="rounded-md bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300"
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

            {twoFactorMessage && (
              <div
                className={`rounded-md p-4 ${
                  twoFactorMessage.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
                }`}
              >
                {twoFactorMessage.text}
              </div>
            )}
          </div>
        )}

        {activeTab === "passkeys" && (
          <div className="max-w-2xl">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Passkeys</h2>
            
            <div className="space-y-6">
              <div className="rounded-md bg-blue-50 p-4">
                <p className="text-sm text-blue-800">
                  Passkeys let you sign in without a password using your fingerprint, face recognition, or device PIN.
                </p>
              </div>

              <button
                onClick={handleAddPasskey}
                disabled={isPasskeyLoading}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isPasskeyLoading ? "Adding..." : "Add Passkey"}
              </button>

              {passkeyMessage && (
                <div
                  className={`rounded-md p-4 ${
                    passkeyMessage.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
                  }`}
                >
                  {passkeyMessage.text}
                </div>
              )}

              {passkeys.length > 0 ? (
                <div className="border border-slate-200 rounded-lg divide-y divide-slate-200">
                  {passkeys.map((passkey) => (
                    <div key={passkey.id} className="p-4 flex items-center justify-between">
                      <div className="flex-1">
                        {editingPasskeyId === passkey.id ? (
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={editingPasskeyName}
                              onChange={(e) => setEditingPasskeyName(e.target.value)}
                              className="block w-full max-w-xs rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                              autoFocus
                            />
                            <button
                              onClick={() => handleRenamePasskey(passkey.id)}
                              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => {
                                setEditingPasskeyId(null);
                                setEditingPasskeyName("");
                              }}
                              className="rounded-md bg-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-300"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2">
                              <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                              </svg>
                              <span className="font-medium text-slate-900">{passkey.name || "Unnamed Passkey"}</span>
                            </div>
                            <div className="mt-1 text-sm text-slate-500">
                              Added {new Date(passkey.createdAt).toLocaleDateString()}
                              {passkey.lastUsedAt && (
                                <> • Last used {new Date(passkey.lastUsedAt).toLocaleDateString()}</>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                      {editingPasskeyId !== passkey.id && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditingPasskeyId(passkey.id);
                              setEditingPasskeyName(passkey.name || "");
                            }}
                            className="text-sm text-blue-600 hover:text-blue-700"
                          >
                            Rename
                          </button>
                          <button
                            onClick={() => handleDeletePasskey(passkey.id)}
                            className="text-sm text-red-600 hover:text-red-700"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500">
                  No passkeys added yet. Add one to enable passwordless sign in.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
