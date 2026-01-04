import { useState } from "react";
import UsersSettings from "../components/settings/UsersSettings";
import SmtpSettings from "../components/settings/SmtpSettings";
import SmsSettings from "../components/settings/SmsSettings";
import AlertsSettings from "../components/settings/AlertsSettings";
import TemplatesSettings from "../components/settings/TemplatesSettings";

type Tab = "users" | "smtp" | "sms" | "alerts" | "templates";

const tabs: { id: Tab; label: string }[] = [
  { id: "users", label: "Users" },
  { id: "smtp", label: "SMTP" },
  { id: "sms", label: "SMS" },
  { id: "alerts", label: "Alerts" },
  { id: "templates", label: "Templates" }
];

export default function Settings() {
  const [activeTab, setActiveTab] = useState<Tab>("users");

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Settings</h1>

      <div className="mt-6 border-b border-slate-200">
        <nav className="-mb-px flex gap-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                "border-b-2 px-1 pb-3 text-sm font-medium transition-colors",
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
        {activeTab === "users" && <UsersSettings />}
        {activeTab === "smtp" && <SmtpSettings />}
        {activeTab === "sms" && <SmsSettings />}
        {activeTab === "alerts" && <AlertsSettings />}
        {activeTab === "templates" && <TemplatesSettings />}
      </div>
    </div>
  );
}
