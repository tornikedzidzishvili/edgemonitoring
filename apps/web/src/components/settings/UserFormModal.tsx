import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { api, type UserInfo } from "../../lib/api";

type Props = {
  user: UserInfo | null;
  onClose: () => void;
  onSave: () => void;
};

const inputClasses =
  "w-full rounded-lg border border-slate-700/50 bg-obsidian-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 transition-all focus:border-neon-cyan/50 focus:outline-none focus:ring-2 focus:ring-neon-cyan/20";

const selectClasses =
  "w-full rounded-lg border border-slate-700/50 bg-obsidian-800 px-4 py-2.5 text-sm text-white transition-all focus:border-neon-cyan/50 focus:outline-none focus:ring-2 focus:ring-neon-cyan/20";

const labelClasses = "block text-sm font-medium text-slate-300 mb-1.5";

const primaryBtnClasses =
  "rounded-lg bg-gradient-to-r from-neon-cyan to-neon-emerald px-5 py-2.5 text-sm font-semibold text-obsidian-900 shadow-lg shadow-neon-cyan/20 transition-all hover:shadow-neon-cyan/30 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed";

const secondaryBtnClasses =
  "rounded-lg border border-slate-700/50 bg-obsidian-800/60 px-4 py-2.5 text-sm font-medium text-slate-300 transition-all hover:bg-obsidian-700/50 hover:text-white";

export default function UserFormModal({ user, onClose, onSave }: Props) {
  const isEditing = !!user;

  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [position, setPosition] = useState(user?.position ?? "");
  const [role, setRole] = useState<"admin" | "user">(user?.role === "admin" ? "admin" : "user");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!isEditing && password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (!isEditing && password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    if (password && password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);

    try {
      if (isEditing) {
        await api.updateUser(user.id, {
          email,
          fullName,
          phone: phone || null,
          position: position || null,
          role,
          ...(password ? { password } : {})
        });
      } else {
        await api.createUser({
          email,
          password,
          fullName,
          phone: phone || undefined,
          position: position || undefined,
          role
        });
      }
      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save user");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian-950/80 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-md rounded-2xl border border-slate-700/50 bg-obsidian-800/90 p-6 shadow-2xl backdrop-blur-xl"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neon-cyan/10">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-neon-cyan" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-white">
            {isEditing ? "Edit User" : "Add User"}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-lg border border-neon-rose/30 bg-neon-rose/10 px-4 py-3 text-sm text-neon-rose"
            >
              {error}
            </motion.div>
          )}

          <div>
            <label htmlFor="fullName" className={labelClasses}>
              Full Name
            </label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              placeholder="John Doe"
              className={inputClasses}
            />
          </div>

          <div>
            <label htmlFor="email" className={labelClasses}>
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="john@example.com"
              className={inputClasses}
            />
          </div>

          <div>
            <label htmlFor="position" className={labelClasses}>
              Position <span className="text-slate-500">(optional)</span>
            </label>
            <input
              id="position"
              type="text"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="System Administrator"
              className={inputClasses}
            />
          </div>

          <div>
            <label htmlFor="phone" className={labelClasses}>
              Phone <span className="text-slate-500">(optional)</span>
            </label>
            <input
              id="phone"
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="9955XXXXXXXX"
              className={inputClasses}
            />
          </div>

          <div>
            <label htmlFor="role" className={labelClasses}>
              Role
            </label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value as "admin" | "user")}
              className={selectClasses}
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div>
            <label htmlFor="password" className={labelClasses}>
              {isEditing ? "New Password" : "Password"}{" "}
              {isEditing && <span className="text-slate-500">(leave blank to keep current)</span>}
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={!isEditing}
              minLength={8}
              className={inputClasses}
              placeholder={isEditing ? "Leave blank to keep current" : "Minimum 8 characters"}
            />
          </div>

          {!isEditing && (
            <div>
              <label htmlFor="confirmPassword" className={labelClasses}>
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className={inputClasses}
                placeholder="Confirm password"
              />
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className={secondaryBtnClasses}>
              Cancel
            </button>
            <button type="submit" disabled={loading} className={primaryBtnClasses}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Saving...
                </span>
              ) : isEditing ? (
                "Save Changes"
              ) : (
                "Create User"
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
