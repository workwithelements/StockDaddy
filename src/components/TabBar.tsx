"use client";

export type AppTab = "dashboard" | "settings" | "order-planner";

interface TabBarProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
}

export default function TabBar({ activeTab, onTabChange }: TabBarProps) {
  const tabs: Array<{ key: AppTab; label: string }> = [
    { key: "dashboard", label: "Dashboard" },
    { key: "order-planner", label: "Order Planner" },
    { key: "settings", label: "Settings" },
  ];

  return (
    <div className="border-b border-gray-200 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        <nav className="flex gap-6" aria-label="Tabs">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => onTabChange(tab.key)}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
