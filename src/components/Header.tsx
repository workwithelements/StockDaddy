"use client";

import Image from "next/image";

interface HeaderProps {
  lastSynced: string;
  onSync: () => void;
  onCheck: () => void;
  syncing: boolean;
  checking: boolean;
}

export default function Header({
  lastSynced,
  onSync,
  onCheck,
  syncing,
  checking,
}: HeaderProps) {
  const formattedSync = lastSynced
    ? new Date(lastSynced).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Never";

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image
            src="/logo.jpg"
            alt="StockDaddy"
            width={44}
            height={44}
            className="rounded-full object-cover ring-2 ring-indigo-100"
          />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">StockDaddy</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Last synced: {formattedSync}
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onSync}
            disabled={syncing}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {syncing ? (
              <>
                <Spinner />
                Syncing...
              </>
            ) : (
              "Sync from Shopify"
            )}
          </button>
          <button
            onClick={onCheck}
            disabled={checking}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {checking ? (
              <>
                <Spinner />
                Checking...
              </>
            ) : (
              "Run Check"
            )}
          </button>
        </div>
      </div>
    </header>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin -ml-1 mr-2 h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
