"use client";

interface FavouriteButtonProps {
  isFavourite: boolean;
  onClick: () => void;
  size?: "sm" | "md";
}

export default function FavouriteButton({
  isFavourite,
  onClick,
  size = "sm",
}: FavouriteButtonProps) {
  const sizeClass = size === "sm" ? "w-4 h-4" : "w-5 h-5";

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`p-1 rounded transition-colors ${
        isFavourite
          ? "text-amber-400 hover:text-amber-500"
          : "text-gray-300 hover:text-gray-400"
      }`}
      title={isFavourite ? "Remove from favourites" : "Add to favourites"}
    >
      <svg
        className={sizeClass}
        fill={isFavourite ? "currentColor" : "none"}
        stroke="currentColor"
        viewBox="0 0 24 24"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
        />
      </svg>
    </button>
  );
}
