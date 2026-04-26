import { useState, type JSX } from "react";
import { motion } from "framer-motion";
import UsersSettings from "../components/settings/UsersSettings";
import SmtpSettings from "../components/settings/SmtpSettings";
import SmsSettings from "../components/settings/SmsSettings";
import AlertsSettings from "../components/settings/AlertsSettings";
import TemplatesSettings from "../components/settings/TemplatesSettings";
import ServerAlertSettings from "../components/settings/ServerAlertSettings";
import SharedHostingSettings from "../components/settings/SharedHostingSettings";
import RegistryCredentialsSection from "../components/settings/RegistryCredentialsSection";
import BrandingSettings from "../components/settings/BrandingSettings";

type Tab = "users" | "smtp" | "sms" | "alerts" | "server-alerts" | "templates" | "shared-hosting" | "registry" | "branding";

const tabs: { id: Tab; label: string; icon: JSX.Element }[] = [
  {
    id: "users",
    label: "Users",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    )
  },
  {
    id: "shared-hosting",
    label: "Shared Hosting",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    )
  },
  {
    id: "smtp",
    label: "SMTP",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="20" height="16" x="2" y="4" rx="2" />
        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
      </svg>
    )
  },
  {
    id: "sms",
    label: "SMS",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
      </svg>
    )
  },
  {
    id: "alerts",
    label: "Alerts",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
    )
  },
  {
    id: "server-alerts",
    label: "Server Alerts",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
        <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
        <line x1="6" y1="6" x2="6.01" y2="6" />
        <line x1="6" y1="18" x2="6.01" y2="18" />
      </svg>
    )
  },
  {
    id: "templates",
    label: "Templates",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" x2="8" y1="13" y2="13" />
        <line x1="16" x2="8" y1="17" y2="17" />
        <line x1="10" x2="8" y1="9" y2="9" />
      </svg>
    )
  },
  {
    id: "registry",
    label: "Registry",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    )
  },
  {
    id: "branding",
    label: "Branding",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10" />
        <path d="M14.5 15.5 10 10l-3 7 7-3z" />
        <path d="M17 17h5" />
        <path d="M19.5 14.5v5" />
      </svg>
    )
  }
];

export default function Settings() {
  const [activeTab, setActiveTab] = useState<Tab>("users");

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-white">Settings</h1>
        <p className="mt-1 text-sm text-slate-400">Configure your monitoring system</p>
      </div>

      <div className="mb-6 rounded-xl border border-slate-700/50 bg-obsidian-800/40 p-1 backdrop-blur-sm">
        <nav className="flex flex-wrap gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={[
                "relative flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200",
                activeTab === tab.id
                  ? "bg-gradient-to-r from-neon-cyan/20 to-neon-emerald/10 text-neon-cyan shadow-lg shadow-neon-cyan/10"
                  : "text-slate-400 hover:bg-obsidian-700/50 hover:text-white"
              ].join(" ")}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
              {activeTab === tab.id && (
                <motion.div
                  layoutId="settings-tab-indicator"
                  className="absolute inset-0 -z-10 rounded-lg border border-neon-cyan/30"
                  transition={{ type: "spring", duration: 0.5 }}
                />
              )}
            </button>
          ))}
        </nav>
      </div>

      <motion.div
        key={activeTab}
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2 }}
      >
        {activeTab === "users" && <UsersSettings />}
        {activeTab === "shared-hosting" && <SharedHostingSettings />}
        {activeTab === "smtp" && <SmtpSettings />}
        {activeTab === "sms" && <SmsSettings />}
        {activeTab === "alerts" && <AlertsSettings />}
        {activeTab === "server-alerts" && <ServerAlertSettings />}
        {activeTab === "templates" && <TemplatesSettings />}
        {activeTab === "registry" && <RegistryCredentialsSection />}
        {activeTab === "branding" && <BrandingSettings />}
      </motion.div>
    </motion.div>
  );
}
