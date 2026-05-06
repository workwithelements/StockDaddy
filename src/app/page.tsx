"use client";

import { useState, useEffect, useCallback } from "react";
import type { ProductGroupRow, ProductConfig } from "@/lib/types";
import Header from "@/components/Header";
import TabBar, { type AppTab } from "@/components/TabBar";
import DashboardTable from "@/components/DashboardTable";
import SettingsPanel from "@/components/SettingsPanel";
import OrderPlanner from "@/components/OrderPlanner";
import ProductStockPage from "@/components/ProductStockPage";
import ScenarioPlanner from "@/components/ScenarioPlanner";

export default function Home() {
  const [groups, setGroups] = useState<ProductGroupRow[]>([]);
  const [lastSynced, setLastSynced] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>("dashboard");
  const [viewingProductId, setViewingProductId] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard");
      const data = await res.json();
      setGroups(data.groups);
      setLastSynced(data.lastSyncedAt);
    } catch (err) {
      console.error("Failed to load dashboard:", err);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/shopify/sync");
      const data = await res.json();
      if (data.success) {
        showToast(
          `Synced ${data.productCount} products, ${data.skuCount} SKUs`
        );
        await fetchDashboard();
      } else {
        showToast(`Sync failed: ${data.error}`);
      }
    } catch (err) {
      showToast("Sync failed - check console");
      console.error(err);
    } finally {
      setSyncing(false);
    }
  }

  async function handleCheck() {
    setChecking(true);
    try {
      const res = await fetch("/api/check");
      const data = await res.json();
      showToast(
        `Check complete: ${data.reorderNeeded} need reorder, ${data.alertsSent} alerts sent`
      );
      await fetchDashboard();
    } catch (err) {
      showToast("Check failed - check console");
      console.error(err);
    } finally {
      setChecking(false);
    }
  }

  async function handleDismissAlert(sku: string) {
    try {
      await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku, action: "dismiss" }),
      });
      await fetchDashboard();
    } catch (err) {
      console.error("Dismiss failed:", err);
    }
  }

  async function handleToggleFavourite(productId: string) {
    // Find current state
    const group = groups.find((g) => g.productId === productId);
    if (!group) return;

    const newVal = !group.isFavourite;

    // Optimistic update
    setGroups((prev) =>
      prev.map((g) =>
        g.productId === productId ? { ...g, isFavourite: newVal } : g
      )
    );

    try {
      await fetch("/api/product-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          productTitle: group.productTitle,
          isFavourite: newVal,
        }),
      });
      await fetchDashboard();
    } catch (err) {
      console.error("Toggle favourite failed:", err);
      // Revert
      setGroups((prev) =>
        prev.map((g) =>
          g.productId === productId ? { ...g, isFavourite: !newVal } : g
        )
      );
    }
  }

  async function handleSaveProductConfig(
    config: Partial<ProductConfig> & { productId: string }
  ) {
    try {
      await fetch("/api/product-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      showToast("Product settings saved");
      await fetchDashboard();
    } catch (err) {
      showToast("Save failed - check console");
      console.error(err);
    }
  }

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }

  return (
    <div className="min-h-screen">
      <Header
        lastSynced={lastSynced}
        onSync={handleSync}
        onCheck={handleCheck}
        syncing={syncing}
        checking={checking}
      />

      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="max-w-7xl mx-auto px-6 py-6">
        {viewingProductId ? (
          <ProductStockPage
            productId={viewingProductId}
            onBack={() => setViewingProductId(null)}
          />
        ) : activeTab === "dashboard" ? (
          <DashboardTable
            groups={groups}
            onRefresh={fetchDashboard}
            onDismissAlert={handleDismissAlert}
            onToggleFavourite={handleToggleFavourite}
            onViewProduct={setViewingProductId}
          />
        ) : activeTab === "order-planner" ? (
          <OrderPlanner onViewProduct={setViewingProductId} />
        ) : activeTab === "scenario-planner" ? (
          <ScenarioPlanner
            groups={groups}
            onToggleAdvertised={async (productId, productTitle, next) => {
              // Optimistic
              setGroups((prev) =>
                prev.map((g) =>
                  g.productId === productId ? { ...g, isAdvertised: next } : g
                )
              );
              try {
                await fetch("/api/product-config", {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    productId,
                    productTitle,
                    isAdvertised: next,
                  }),
                });
                await fetchDashboard();
              } catch (err) {
                console.error("Toggle advertised failed:", err);
                setGroups((prev) =>
                  prev.map((g) =>
                    g.productId === productId
                      ? { ...g, isAdvertised: !next }
                      : g
                  )
                );
              }
            }}
          />
        ) : (
          <SettingsPanel
            groups={groups}
            onSave={handleSaveProductConfig}
          />
        )}
      </main>

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-gray-900 text-white px-4 py-3 rounded-lg shadow-lg text-sm max-w-sm">
          {toast}
        </div>
      )}
    </div>
  );
}
