import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { api, type UserInfo } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import UserFormModal from "./UserFormModal";

const primaryBtnClasses =
  "rounded-lg bg-gradient-to-r from-neon-cyan to-neon-emerald px-4 py-2.5 text-sm font-semibold text-obsidian-900 shadow-lg shadow-neon-cyan/20 transition-all hover:shadow-neon-cyan/30 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed";

export default function UsersSettings() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserInfo | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const data = await api.users();
      setUsers(data.users);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleDelete = async (id: string) => {
    try {
      await api.deleteUser(id);
      setDeleteConfirm(null);
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user");
    }
  };

  const handleEdit = (user: UserInfo) => {
    setEditingUser(user);
    setShowModal(true);
  };

  const handleAdd = () => {
    setEditingUser(null);
    setShowModal(true);
  };

  const handleModalClose = () => {
    setShowModal(false);
    setEditingUser(null);
  };

  const handleModalSave = () => {
    handleModalClose();
    fetchUsers();
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-neon-cyan border-t-transparent" />
        Loading users...
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">User Management</h2>
          <p className="mt-1 text-sm text-slate-400">Manage user accounts and permissions</p>
        </div>
        <button type="button" onClick={handleAdd} className={primaryBtnClasses}>
          <span className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add User
          </span>
        </button>
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 rounded-lg border border-neon-rose/30 bg-neon-rose/10 px-4 py-3 text-sm text-neon-rose"
        >
          {error}
        </motion.div>
      )}

      <div className="-mx-4 mt-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="inline-block min-w-full align-middle">
          <div className="overflow-hidden rounded-xl border border-slate-700/50">
            <table className="min-w-full divide-y divide-slate-700/50">
              <thead className="bg-obsidian-800/60">
                <tr>
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    User
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Position
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Role
                  </th>
                  <th className="px-5 py-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {users.map((user, idx) => (
                  <motion.tr
                    key={user.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    className="transition-colors hover:bg-obsidian-700/30"
                  >
                    <td className="whitespace-nowrap px-5 py-4">
                      <div className="font-medium text-white">{user.fullName}</div>
                      <div className="text-sm text-slate-400">{user.email}</div>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-400">
                      {user.position || "—"}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${
                          user.role === "admin"
                            ? "border-neon-violet/30 bg-neon-violet/10 text-neon-violet"
                            : "border-slate-600/30 bg-slate-600/10 text-slate-400"
                        }`}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-right text-sm">
                      {deleteConfirm === user.id ? (
                        <div className="flex items-center justify-end gap-3">
                          <span className="text-slate-400">Delete?</span>
                          <button
                            type="button"
                            onClick={() => handleDelete(user.id)}
                            className="text-neon-rose hover:text-neon-rose/80 transition-colors"
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirm(null)}
                            className="text-slate-400 hover:text-white transition-colors"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => handleEdit(user)}
                            className="text-neon-cyan hover:text-neon-cyan/80 transition-colors"
                          >
                            Edit
                          </button>
                          {user.id !== currentUser?.id && (
                            <button
                              type="button"
                              onClick={() => setDeleteConfirm(user.id)}
                              className="text-neon-rose hover:text-neon-rose/80 transition-colors"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </motion.tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-12 text-center text-sm text-slate-500">
                      No users found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showModal && (
        <UserFormModal
          user={editingUser}
          onClose={handleModalClose}
          onSave={handleModalSave}
        />
      )}
    </div>
  );
}
